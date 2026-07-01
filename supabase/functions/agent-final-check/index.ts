/**
 * Agent: Finale Gegenprüfung ("Endkontrolle").
 *
 * Läuft NACH der vollständigen Berechnung (Statik + Angebot), nicht während
 * der Extraktion. Beantwortet die Frage, die am Ende jeder seriösen
 * Zimmerei-Kalkulation von einer zweiten Person gestellt wird, bevor ein
 * Angebot rausgeht: "Passt das wirklich zum Plan?"
 *
 * Drei UNABHÄNGIGE Prüfverfahren (unterschiedliche Prompts/Modelle, niemals
 * identisch):
 *   A) Unabhängige Neuvermessung   — schätzt Dachfläche/-teile/Holzmenge frisch,
 *                                    ohne das bisherige Ergebnis zu kennen.
 *   B) Vollständigkeits-Check      — bekommt das bisherige Ergebnis als Text UND
 *                                    den Plan, sucht gezielt nach vergessenen
 *                                    Dachteilen/Nebenkonstruktionen. Nutzt ein
 *                                    ANDERES Modell (OpenRouter), wenn verfügbar.
 *   C) Schiedsrichter-Urteil       — bekommt Plan + Ergebnis + Angebotssumme,
 *                                    muss explizit "plausibel: ja/nein" mit
 *                                    Begründung liefern.
 *
 * Konvergieren die drei (≤5% Abweichung auf allen Kennzahlen, keine Mehrheit
 * "nicht plausibel") → Konsens. Sonst greift automatisch ein 3-stufiges
 * verfeinertes Fallback-Verfahren, das die Extraktion NOCHMAL VON VORNE
 * beginnt (siehe _shared/finalVerification.ts::buildRefinedReanalysisPlan).
 *
 * Ehrlichkeitsprinzip (wie im restlichen Projekt): wenn auch das Fallback
 * nicht konvergiert, wird NIEMALS ein Schein-Ergebnis vorgetäuscht — der
 * Nutzer bekommt eine klare "nicht verifizierbar"-Meldung mit den konkret
 * abweichenden Kennzahlen.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { geminiVision, parseJsonResponse, CORS_HEADERS } from '../_shared/gemini.ts';
import { openRouterVision, openRouterAvailable } from '../_shared/openrouter.ts';
import {
  compareVerificationPasses, needsRefinedFallback, buildRefinedReanalysisPlan,
  decideFinalStatus, describeConsensus,
  type VerificationPassResult, type ComputedSummary, type ConsensusResult,
} from '../_shared/finalVerification.ts';

// Gesamtbudget für die komplette Endkontrolle (inkl. möglichem Fallback).
// Edge-Functions haben ein hartes 150s-Limit — hier bewusst konservativ,
// damit bei Zeitnot ehrlich abgebrochen wird statt den Prozess zu sprengen.
const TOTAL_BUDGET_MS = 110_000;
const PASS_TIMEOUT_MS = 35_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: Zeitlimit ${ms}ms überschritten`)), ms)),
  ]);
}

function computedSummaryAsText(c: ComputedSummary, extra?: string): string {
  return `Bisher berechnetes Ergebnis (zu prüfen, NICHT blind übernehmen):\n` +
    `- Gesamt-Dachfläche: ${c.roofAreaM2.toFixed(1)} m²\n` +
    `- Anzahl Dachteile (Hauptdach + Anbauten + Vordächer/Carports): ${c.roofPartCount}\n` +
    `- Geschätzte Holzmenge (Tragkonstruktion): ${c.timberVolumeM3.toFixed(2)} m³\n` +
    `- Angebotssumme (brutto): ${c.offerTotalEur.toFixed(0)} EUR\n` +
    (extra ? `\n${extra}\n` : '');
}

const JSON_ONLY = 'Antworte AUSSCHLIESSLICH mit validem JSON. KEIN erklärender Text davor/danach, KEINE Markdown-Fences.';

function safeNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Klemmt KI-Konfidenzwerte auf 0..1 — Modelle antworten gelegentlich mit Werten außerhalb (z.B. "5" statt "0.5"). */
function clampConfidence(v: unknown, fallback = 0.5): number {
  const n = safeNumber(v);
  if (n === null) return fallback;
  return Math.min(1, Math.max(0, n));
}

interface PassOutcome {
  result: VerificationPassResult;
  error?: string;
}

async function runPassA(images: { base64: string; mimeType: string }[], model: string, apiKey?: string): Promise<PassOutcome> {
  const systemPrompt = `Du bist ein unabhängiger Prüf-Gutachter für Zimmerei-Pläne. ${JSON_ONLY}`;
  const userPrompt = `AUFGABE (Prüfverfahren A — Unabhängige Neuvermessung):
Schau dir NUR den Plan an. Du kennst KEIN vorheriges Ergebnis und sollst auch keins raten.
Ermittle frisch und eigenständig:
1. Die gesamte überdachte Fläche (Hauptdach + alle Anbauten/Vordächer/Carports/Überdachungen) in m².
2. Die Anzahl separater Dachteile/Überdachungen (jedes Vordach, jeder Carport zählt einzeln).
3. Eine GROBE Schätzung der Holzmenge für die Tragkonstruktion in m³ (Sparren/Pfetten/Binder — Faustwert: ca. 0.03-0.06 m³ Holz je m² Dachfläche je nach Spannweite/System, nutze diese Faustregel wenn keine genaueren Angaben ablesbar sind).
Antworte JSON:
{ "roofAreaM2": number, "roofPartCount": number, "timberVolumeM3": number, "confidence": number, "notes": string }`;
  try {
    const text = await withTimeout(
      geminiVision({ systemPrompt, userPrompt, images, model: model as any, jsonMode: true, apiKey, temperature: 0.15 }),
      PASS_TIMEOUT_MS, 'Pass A (Neuvermessung)',
    );
    const parsed = parseJsonResponse<{ roofAreaM2?: number; roofPartCount?: number; timberVolumeM3?: number; confidence?: number; notes?: string }>(text);
    return {
      result: {
        passId: 'A_neuvermessung', strategy: 'Unabhängige Neuvermessung ohne Kenntnis des Vorergebnisses',
        model, roofAreaM2: safeNumber(parsed.roofAreaM2), roofPartCount: safeNumber(parsed.roofPartCount),
        timberVolumeM3: safeNumber(parsed.timberVolumeM3), offerTotalEur: null,
        plausible: null, issues: parsed.notes ? [parsed.notes] : [], confidence: clampConfidence(parsed.confidence),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      error: msg,
      result: {
        passId: 'A_neuvermessung', strategy: 'Unabhängige Neuvermessung ohne Kenntnis des Vorergebnisses',
        model, roofAreaM2: null, roofPartCount: null, timberVolumeM3: null, offerTotalEur: null,
        plausible: null, issues: [`Pass A fehlgeschlagen: ${msg}`], confidence: 0,
      },
    };
  }
}

async function runPassB(
  images: { base64: string; mimeType: string }[], computed: ComputedSummary,
  orKey: string | undefined, geminiModel: string, geminiApiKey?: string,
): Promise<PassOutcome> {
  const systemPrompt = `Du bist ein kritischer Zweitprüfer, der gezielt nach vergessenen Bauteilen sucht. ${JSON_ONLY}`;
  const userPrompt = `AUFGABE (Prüfverfahren B — Vollständigkeits-Check):
${computedSummaryAsText(computed)}
Schau dir den Plan GEZIELT auf Dachteile an, die im bisherigen Ergebnis FEHLEN könnten:
Nebengebäude, Carports, Vordächer, Terrassen-/Balkonüberdachungen, Gauben, Anbauten.
Zähle selbst, wie viele Dachteile DU im Plan siehst (roofPartCount), und schätze deren Gesamtfläche (roofAreaM2).
Antworte JSON:
{ "roofPartCount": number, "roofAreaM2": number, "plausible": boolean, "missingParts": [string], "confidence": number }`;

  // DB-Key (vom Admin eingetragen) ODER Supabase-Secret reicht — beide Wege müssen für sich allein funktionieren.
  const useOpenRouter = !!orKey || openRouterAvailable();
  try {
    let text: string;
    let modelUsed: string;
    if (useOpenRouter) {
      text = await withTimeout(
        openRouterVision({ systemPrompt, userPrompt, images, jsonMode: true, apiKey: orKey }),
        PASS_TIMEOUT_MS, 'Pass B (Vollständigkeit, OpenRouter)',
      );
      modelUsed = 'openrouter (Zweitmodell)';
    } else {
      // Kein zweites Modell verfügbar → ehrlich als solches kennzeichnen, aber
      // trotzdem mit abweichender Prompt-Strategie und höherer Temperatur prüfen
      // (andere Perspektive statt reiner Wiederholung).
      text = await withTimeout(
        geminiVision({ systemPrompt, userPrompt, images, model: geminiModel as any, jsonMode: true, apiKey: geminiApiKey, temperature: 0.6 }),
        PASS_TIMEOUT_MS, 'Pass B (Vollständigkeit, Gemini-Fallback)',
      );
      modelUsed = `${geminiModel} (Zweitmodell nicht verfügbar — gleiches Modell mit abweichender Prompt-Strategie)`;
    }
    const parsed = parseJsonResponse<{ roofPartCount?: number; roofAreaM2?: number; plausible?: boolean; missingParts?: string[]; confidence?: number }>(text);
    const missing = Array.isArray(parsed.missingParts) ? parsed.missingParts.filter(Boolean) : [];
    return {
      result: {
        passId: 'B_vollstaendigkeit', strategy: 'Vollständigkeits-Check auf vergessene Dachteile/Nebenkonstruktionen',
        model: modelUsed, roofAreaM2: safeNumber(parsed.roofAreaM2), roofPartCount: safeNumber(parsed.roofPartCount),
        timberVolumeM3: null, offerTotalEur: null,
        plausible: typeof parsed.plausible === 'boolean' ? parsed.plausible : null,
        issues: missing, confidence: clampConfidence(parsed.confidence),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      error: msg,
      result: {
        passId: 'B_vollstaendigkeit', strategy: 'Vollständigkeits-Check auf vergessene Dachteile/Nebenkonstruktionen',
        model: useOpenRouter ? 'openrouter' : geminiModel, roofAreaM2: null, roofPartCount: null, timberVolumeM3: null, offerTotalEur: null,
        plausible: null, issues: [`Pass B fehlgeschlagen: ${msg}`], confidence: 0,
      },
    };
  }
}

async function runPassC(images: { base64: string; mimeType: string }[], computed: ComputedSummary, model: string, apiKey?: string): Promise<PassOutcome> {
  const systemPrompt = `Du bist der Schiedsrichter der Endkontrolle vor Angebotsabgabe. Sei kritisch, nicht gefällig. ${JSON_ONLY}`;
  const userPrompt = `AUFGABE (Prüfverfahren C — Schiedsrichter-Urteil):
${computedSummaryAsText(computed)}
Beurteile GANZHEITLICH anhand des Plans: Kann dieses Ergebnis für DIESEN Plan stimmen?
Prüfe insbesondere: Passt die Dachfläche zur erkennbaren Gebäudegröße? Ist die Angebotssumme für diese
Dachfläche/Konstruktion in einer plausiblen Größenordnung (grobe Richtgröße Zimmerei-Dachstuhl AT: ca.
150-350 EUR/m² Dachfläche für Tragkonstruktion inkl. Montage, je nach Komplexität/Spannweite/System)?
Gib eine eigene Gegenschätzung ab.
Antworte JSON:
{ "plausible": boolean, "roofAreaM2": number, "roofPartCount": number, "offerTotalEur": number, "issues": [string], "confidence": number }`;
  try {
    const text = await withTimeout(
      geminiVision({ systemPrompt, userPrompt, images, model: model as any, jsonMode: true, apiKey, temperature: 0.2 }),
      PASS_TIMEOUT_MS, 'Pass C (Schiedsrichter)',
    );
    const parsed = parseJsonResponse<{ plausible?: boolean; roofAreaM2?: number; roofPartCount?: number; offerTotalEur?: number; issues?: string[]; confidence?: number }>(text);
    const issues = Array.isArray(parsed.issues) ? parsed.issues.filter(Boolean) : [];
    return {
      result: {
        passId: 'C_schiedsrichter', strategy: 'Ganzheitliches Plausibilitätsurteil gegen Plan + Angebotssumme',
        model, roofAreaM2: safeNumber(parsed.roofAreaM2), roofPartCount: safeNumber(parsed.roofPartCount),
        timberVolumeM3: null, offerTotalEur: safeNumber(parsed.offerTotalEur),
        plausible: typeof parsed.plausible === 'boolean' ? parsed.plausible : null,
        issues, confidence: clampConfidence(parsed.confidence),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      error: msg,
      result: {
        passId: 'C_schiedsrichter', strategy: 'Ganzheitliches Plausibilitätsurteil gegen Plan + Angebotssumme',
        model, roofAreaM2: null, roofPartCount: null, timberVolumeM3: null, offerTotalEur: null,
        plausible: null, issues: [`Pass C fehlgeschlagen: ${msg}`], confidence: 0,
      },
    };
  }
}

/** Führt EINE Stufe des verfeinerten Fallback-Verfahrens als Gemini-Call aus. */
async function runRefinedStage(
  images: { base64: string; mimeType: string }[], stageTitle: string, instruction: string,
  priorStageOutput: string, model: string, apiKey?: string,
): Promise<{ text: string; error?: string }> {
  const systemPrompt = `Du führst ein verfeinertes, mehrstufiges Neuanalyse-Verfahren durch, weil die erste ` +
    `Prüfung nicht eindeutig konvergiert ist. ${JSON_ONLY}`;
  const userPrompt = `STUFE: ${stageTitle}\n${instruction}\n\n` +
    (priorStageOutput ? `Ergebnis der vorherigen Stufe:\n${priorStageOutput}\n\n` : '') +
    `Antworte JSON: { "roofAreaM2": number, "roofPartCount": number, "timberVolumeM3": number, ` +
    `"offerTotalEur": number|null, "reasoning": string }`;
  try {
    const text = await withTimeout(
      geminiVision({ systemPrompt, userPrompt, images, model: model as any, jsonMode: true, apiKey, temperature: 0.1 }),
      PASS_TIMEOUT_MS, `Fallback-${stageTitle}`,
    );
    return { text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: '{}', error: msg };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  const startedAt = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

  try {
    const { projectId, documentId, computed, analysisQuality } = await req.json() as {
      projectId: string; documentId: string; computed: ComputedSummary; analysisQuality?: string;
    };
    if (!projectId || !documentId || !computed) {
      return new Response(JSON.stringify({ error: 'projectId, documentId und computed (ComputedSummary) erforderlich' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Keys aus Admin laden (wie in agent-document)
    let geminiKey: string | undefined;
    let orKey: string | undefined;
    try {
      const { data: ks } = await supabase.from('system_settings').select('key,value')
        .in('key', ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY']);
      const g = (ks || []).find((r: any) => ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'].includes(r.key) && typeof r.value === 'string' && r.value.trim().length > 20);
      if (g) geminiKey = g.value.trim();
      const o = (ks || []).find((r: any) => r.key === 'OPENROUTER_API_KEY' && typeof r.value === 'string' && r.value.trim().length > 20);
      if (o) orKey = o.value.trim();
    } catch { /* Env-Fallback */ }
    const geminiModel = analysisQuality === 'hochgenau' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

    // Plan-Bilder laden (Kacheln bevorzugt, wie agent-document — Memory-schonend)
    const { data: doc } = await supabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error('Dokument nicht gefunden');
    function toBase64(buf: ArrayBuffer): string {
      const bytes = new Uint8Array(buf);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      return btoa(binary);
    }
    const images: { base64: string; mimeType: string }[] = [];
    const tilePaths: string[] = Array.isArray(doc.tile_paths) ? doc.tile_paths : [];
    if (tilePaths.length >= 2) {
      for (const tp of tilePaths.slice(0, 6)) {
        try {
          const { data: tData } = await supabase.storage.from('plan-documents').download(tp);
          if (tData) images.push({ base64: toBase64(await tData.arrayBuffer()), mimeType: 'image/jpeg' });
        } catch { /* Kachel überspringen */ }
      }
    }
    if (images.length === 0) {
      const { data: fileData } = await supabase.storage.from('plan-documents').download(doc.file_path);
      if (!fileData) throw new Error('Datei-Download fehlgeschlagen');
      const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      const mime = allowedMimes.includes(doc.file_type) ? doc.file_type : 'application/pdf';
      images.push({ base64: toBase64(await fileData.arrayBuffer()), mimeType: mime });
    }

    // === 3 unabhängige Prüfläufe PARALLEL (unterschiedliche Strategien/Modelle) ===
    const [outA, outB, outC] = await Promise.all([
      runPassA(images, geminiModel, geminiKey),
      runPassB(images, computed, orKey, geminiModel, geminiKey),
      runPassC(images, computed, geminiModel, geminiKey),
    ]);
    const passes: VerificationPassResult[] = [outA.result, outB.result, outC.result];
    const initialConsensus = compareVerificationPasses(passes, computed);

    const auditLog: string[] = [];
    auditLog.push(`Endkontrolle: 3 Prüfläufe abgeschlossen. ${describeConsensus(initialConsensus)}`);
    [outA, outB, outC].forEach((o) => { if (o.error) auditLog.push(`⚠ ${o.result.passId}: ${o.error}`); });

    let refinedConsensus: ConsensusResult | undefined;
    let refinedStagesLog: Array<{ stage: number; title: string; output: unknown; error?: string }> = [];
    let refinedFinalValues: ComputedSummary | undefined;

    if (needsRefinedFallback(initialConsensus) && remaining() > 30_000) {
      auditLog.push('▶ Kein Konsens — starte 3-stufiges verfeinertes Fallback-Verfahren (Neuanalyse von vorne)…');
      const stages = buildRefinedReanalysisPlan({
        deviatingMetrics: initialConsensus.deviatingMetrics,
        criticalIssues: initialConsensus.criticalIssues,
      });
      let priorOutput = '';
      for (const stage of stages) {
        if (remaining() < 20_000) {
          auditLog.push(`✗ Fallback-Stufe ${stage.stage} übersprungen — Zeitbudget erschöpft`);
          refinedStagesLog.push({ stage: stage.stage, title: stage.title, output: null, error: 'Zeitbudget erschöpft' });
          break;
        }
        const { text, error } = await runRefinedStage(images, stage.title, stage.instructionForAi, priorOutput, geminiModel, geminiKey);
        refinedStagesLog.push({ stage: stage.stage, title: stage.title, output: text, error });
        priorOutput = text;
        auditLog.push(error ? `✗ Fallback-Stufe ${stage.stage} (${stage.title}): ${error}` : `✓ Fallback-Stufe ${stage.stage}: ${stage.title}`);
      }

      // Letzte Stufe (Cross-Check) liefert die finalen Werte des Fallback-Verfahrens.
      try {
        const lastStage = refinedStagesLog[refinedStagesLog.length - 1];
        if (lastStage && !lastStage.error) {
          const parsed = parseJsonResponse<{ roofAreaM2?: number; roofPartCount?: number; timberVolumeM3?: number; offerTotalEur?: number }>(String(lastStage.output));
          refinedFinalValues = {
            roofAreaM2: safeNumber(parsed.roofAreaM2) ?? computed.roofAreaM2,
            roofPartCount: safeNumber(parsed.roofPartCount) ?? computed.roofPartCount,
            timberVolumeM3: safeNumber(parsed.timberVolumeM3) ?? computed.timberVolumeM3,
            offerTotalEur: safeNumber(parsed.offerTotalEur) ?? computed.offerTotalEur,
          };
        }
      } catch { /* Fallback-Werte bleiben undefined -> ehrlich als nicht verifizierbar markiert */ }

      // Eine zusätzliche unabhängige Prüfung GEGEN das Fallback-Ergebnis, um nicht
      // blind der eigenen Neuanalyse zu vertrauen.
      if (refinedFinalValues && remaining() > 20_000) {
        const secondOpinion = await runPassC(images, refinedFinalValues, geminiModel, geminiKey);
        // Pass A's ursprüngliche (von der ersten Prüfung unabhängige) Neuvermessung
        // dient als zweite Stimme gegen die Fallback-Werte — so entscheidet nicht
        // die Fallback-Analyse allein über sich selbst.
        refinedConsensus = compareVerificationPasses([secondOpinion.result, outA.result], refinedFinalValues);
        auditLog.push(`Fallback-Gegenprüfung: ${describeConsensus(refinedConsensus)}`);
      }
    } else if (needsRefinedFallback(initialConsensus)) {
      auditLog.push('✗ Fallback-Verfahren übersprungen — Zeitbudget der Endkontrolle bereits zu knapp');
    }

    const status = decideFinalStatus(initialConsensus, refinedConsensus);
    const finalVerification = {
      status,
      checkedAt: new Date().toISOString(),
      passes,
      consensus: initialConsensus,
      ...(refinedConsensus ? { refinedConsensus } : {}),
      ...(refinedFinalValues ? { refinedValues: refinedFinalValues } : {}),
      ...(refinedStagesLog.length > 0 ? { refinedStages: refinedStagesLog } : {}),
      log: auditLog,
    };

    // In project_data persistieren (JSONB — keine Migration nötig) + Audit-Log
    const { data: current } = await supabase.from('projects').select('project_data').eq('id', projectId).single();
    const currentData = (current?.project_data as Record<string, unknown>) || {};
    await supabase.from('projects').update({
      project_data: { ...currentData, finalVerification },
    }).eq('id', projectId);
    await supabase.from('audit_log').insert({
      project_id: projectId, agent: 'Endkontrolle (3-fach-Gegenprüfung)',
      action: status === 'consensus' ? 'Konsens erreicht — Angebot verifiziert'
        : status === 'refined_accepted' ? 'Konsens erst nach Fallback-Verfahren erreicht'
        : 'KEIN Konsens — auch Fallback nicht eindeutig, manuelle Prüfung nötig',
      field: 'finalVerification',
      reason: describeConsensus(refinedConsensus ?? initialConsensus),
      user_initiated: false,
    });

    return new Response(JSON.stringify({ success: true, finalVerification }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('agent-final-check fatal:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
