/**
 * Orchestrator: Robuste Multi-Agent-Pipeline mit Graceful-Fallbacks.
 *
 * Jeder Agent kann einzeln fehlschlagen ohne den Gesamtprozess zu killen.
 * Ergebnisse werden gemergt, fehlende Daten werden geloggt.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CORS_HEADERS } from '../_shared/gemini.ts';
import {
  loadRulesForProject, derivePlanerKey, derivePlanerKeyFromText,
  buildRulesPromptBlock, applyLearnedRules, type LearnedRule,
} from '../_shared/learning.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { projectId, documentId, analysisQuality } = await req.json();
    if (!projectId || !documentId) {
      return new Response(JSON.stringify({ error: 'projectId und documentId erforderlich' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const baseUrl = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization') || `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`;

    async function safeCallAgent(name: string, body: unknown): Promise<{ ok: boolean; data?: any; error?: string }> {
      try {
        const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        if (!res.ok) return { ok: false, error: `${name} HTTP ${res.status}: ${text.slice(0, 200)}`, data };
        if (data?.error) return { ok: false, error: `${name}: ${data.error}`, data };
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: `${name} exception: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    const log: string[] = [];
    const errors: string[] = [];

    // ── Konsens-Mechanismus ────────────────────────────────────────────────────
    /**
     * Vergleicht zwei (oder mehr) Analyse-Pässe auf kritischen Feldern.
     * Gibt Konsens-Extraktion + Liste unsicherer Felder zurück.
     */
    function buildConsensus(
      passes: Record<string, any>[],
    ): { consensus: Record<string, any>; uncertainFields: string[] } {
      const uncertainFields: string[] = [];
      // Nimm den Pass mit höchster overallConfidence als Basis
      const base = passes.reduce((best, p) =>
        (p.overallConfidence ?? 0) >= (best.overallConfidence ?? 0) ? p : best,
      passes[0]);
      const consensus: Record<string, any> = { ...base };

      // --- Pitch je roofPart ---
      const rpArrays = passes.map(p => (p.roofParts as Array<any> | undefined) ?? []);
      const maxParts = Math.max(...rpArrays.map(a => a.length));
      if (maxParts > 0) {
        const consensusParts: Array<any> = [];
        for (let i = 0; i < maxParts; i++) {
          const part = { ...((base.roofParts as Array<any>)?.[i] ?? {}) };
          // pitch abstimmen
          const pitchValues = rpArrays
            .map(a => a[i]?.pitch)
            .filter((v): v is number => typeof v === 'number');
          if (pitchValues.length >= 2) {
            const majority = pitchValues[0];
            const allSame = pitchValues.every(v => Math.abs(v - majority) <= 2);
            if (!allSame) {
              uncertainFields.push(`roofParts[${i}].pitch`);
              // Höchste Einzel-Konfidenz gewinnt
              let bestConf = -1; let bestVal = majority;
              rpArrays.forEach(a => {
                const rp = a[i];
                if (rp && typeof rp.pitch === 'number' && (rp.confidence ?? 0) > bestConf) {
                  bestConf = rp.confidence ?? 0; bestVal = rp.pitch;
                }
              });
              part.pitch = bestVal;
            }
          }
          // form abstimmen
          const formValues = rpArrays.map(a => a[i]?.form).filter(Boolean) as string[];
          if (formValues.length >= 2) {
            const allSameForm = formValues.every(v => v === formValues[0]);
            if (!allSameForm) uncertainFields.push(`roofParts[${i}].form`);
          }
          consensusParts.push(part);
        }
        // Anzahl Dachteile — stimmen Pässe überein?
        const partCounts = rpArrays.map(a => a.length);
        if (partCounts.some(c => c !== partCounts[0])) {
          uncertainFields.push('roofParts.length');
        }
        consensus.roofParts = consensusParts;
      }

      // --- geometry: length / width ---
      for (const dimLabel of ['länge', 'gebäudelänge', 'breite', 'gebäudebreite']) {
        const vals = passes.map(p => {
          const dims = (p.dimensions as Array<any> | undefined) ?? [];
          return dims.find((d: any) => d.label?.toLowerCase().includes(dimLabel))?.value as number | undefined;
        }).filter((v): v is number => typeof v === 'number');
        if (vals.length >= 2 && !vals.every(v => Math.abs(v - vals[0]) < 0.5)) {
          uncertainFields.push(`geometry.${dimLabel}`);
        }
      }

      // --- covering.type ---
      const coveringTypes = passes
        .map(p => (p.covering as any)?.type)
        .filter((v): v is string => !!v && v !== 'unbekannt');
      if (coveringTypes.length >= 2 && !coveringTypes.every(v => v === coveringTypes[0])) {
        uncertainFields.push('covering.type');
      }

      // --- structuralSystem.type ---
      const structTypes = passes
        .map(p => (p.structureHints as any)?.type)
        .filter((v): v is string => !!v);
      if (structTypes.length >= 2 && !structTypes.every(v => v === structTypes[0])) {
        uncertainFields.push('structuralSystem.type');
      }

      consensus.uncertainFields = [...new Set(uncertainFields)];
      return { consensus, uncertainFields: [...new Set(uncertainFields)] };
    }

    /**
     * Prüft, ob ein Konsens-Pass nötig ist.
     * Nicht nötig wenn: DN-Marker eindeutig (gleicher Wert ≥ 2× im Text) UND confidence ≥ 0.7.
     */
    function needsConsensusPass(
      extracted: Record<string, any>,
      facts: { dnMarkers: Array<{ value: number }> },
    ): boolean {
      // DN eindeutig: mind. 2 Marker und alle gleich
      const dnVals = facts.dnMarkers.map(m => m.value);
      const dnUnique = [...new Set(dnVals)];
      const dnClear = dnVals.length >= 2 && dnUnique.length === 1;
      const confOk = (extracted.overallConfidence as number ?? 0) >= 0.7;
      if (dnClear && confOk) return false;   // harte Fakten eindeutig → kein 2. Call
      // Kein DN gefunden ODER widersprüchliche DN ODER niedrige Konfidenz → Konsens nötig
      return true;
    }

    // ── Hilfsfunktion: Konfidenz-gestütztes Merge zweier Extraktionen ──────────
    function mergeExtracted(base: Record<string, any>, overlay: Record<string, any>): Record<string, any> {
      const merged: Record<string, any> = { ...base };
      // Skalare Felder
      for (const key of ['overallConfidence', 'roofHints', 'structureHints', 'planQuality', 'covering']) {
        const bConf = (base[key] as any)?.confidence ?? base.overallConfidence ?? 0;
        const oConf = (overlay[key] as any)?.confidence ?? overlay.overallConfidence ?? 0;
        if (oConf > bConf) merged[key] = overlay[key];
      }
      // dimensions: je Label den Eintrag mit höherer Konfidenz behalten
      const baseDims = (base.dimensions || []) as Array<{label?: string; confidence: number; [k: string]: any}>;
      const overlayDims = (overlay.dimensions || []) as Array<{label?: string; confidence: number; [k: string]: any}>;
      const dimMap = new Map<string, {label?: string; confidence: number; [k: string]: any}>();
      for (const d of [...baseDims, ...overlayDims]) {
        const key = d.label?.toLowerCase() ?? 'unknown';
        if (!dimMap.has(key) || d.confidence > (dimMap.get(key)!.confidence)) dimMap.set(key, d);
      }
      merged.dimensions = Array.from(dimMap.values());
      // arrays: einfach aus dem Pass mit höherer overallConfidence übernehmen
      for (const key of ['texts', 'addresses', 'spans', 'roofParts', 'ceilings', 'openings', 'stairs', 'specialFeatures']) {
        if ((overlay.overallConfidence ?? 0) > (base.overallConfidence ?? 0) && overlay[key] !== undefined) {
          merged[key] = overlay[key];
        }
      }
      // unreliableAreas + assumptions zusammenführen
      merged.unreliableAreas = [...new Set([...(base.unreliableAreas || []), ...(overlay.unreliableAreas || [])])];
      merged.assumptions     = [...new Set([...(base.assumptions || []),     ...(overlay.assumptions || [])])];
      return merged;
    }

    // === 0. Selbst-Lern-Regeln laden (serverseitig, Planer-skopiert) ===
    // Bei Re-Analyse (User korrigiert → neu analysieren) ist der Planer aus dem
    // vorigen Lauf bereits bekannt → Regeln können in den KI-Prompt injiziert werden.
    let learnedRules: LearnedRule[] = [];
    let learnedRulesPrompt = '';
    let ruleOwnerId: string | null = null;
    let planerKey: string | null = null;
    try {
      const { data: projRow } = await supabase
        .from('projects').select('user_id, project_data').eq('id', projectId).single();
      ruleOwnerId = (projRow?.user_id as string) ?? null;
      const priorAddresses = (projRow?.project_data as any)?.addresses
        ?? (projRow?.project_data as any)?._addresses ?? [];
      const derived = derivePlanerKey(priorAddresses);
      planerKey = derived.key;
      if (ruleOwnerId) {
        learnedRules = await loadRulesForProject(supabase, ruleOwnerId, planerKey);
        learnedRulesPrompt = buildRulesPromptBlock(learnedRules);
        if (learnedRules.length > 0) {
          log.push(`✓ Selbst-Lernen: ${learnedRules.length} Regel(n) geladen${planerKey ? ` (Planer: ${planerKey})` : ' (global)'}${learnedRulesPrompt ? ' → in KI-Prompt injiziert' : ''}`);
        }
      }
    } catch (e) {
      log.push(`ℹ Selbst-Lernen: keine Regeln (${e instanceof Error ? e.message : 'n/a'})`);
    }

    // === 1. Dokument-Agent (First-Pass) ===
    log.push(`[${new Date().toISOString()}] ▶ Dokumenten-Agent First-Pass (Gemini Vision)…`);
    const docResult = await safeCallAgent('agent-document', {
      projectId, documentId, analysisQuality,
      ...(learnedRulesPrompt ? { learnedRulesPrompt } : {}),
    });
    let extracted: Record<string, any>;
    let extractionFailed = false;
    let extractionFailReason = '';
    if (!docResult.ok) {
      extractionFailed = true;
      const isQuota = docResult.error?.includes('429') || docResult.error?.includes('quota');
      extractionFailReason = isQuota
        ? 'KI-Tageslimit (Gemini-Kontingent) erreicht — bitte später erneut analysieren oder Hochgenau-Modus (eigenes Kontingent) nutzen.'
        : `KI-Analyse fehlgeschlagen: ${docResult.error}`;
      log.push(`✗ Dokument-Agent: ${docResult.error}`);
      // Statt zu sterben: leeren Extraktions-Datensatz erzeugen, damit User manuell weiterarbeiten kann
      extracted = { texts: [], dimensions: [], addresses: [], roofHints: null, structureHints: null,
        spans: [], overallConfidence: 0,
        unreliableAreas: ['KI-Analyse nicht verfügbar – bitte manuell eingeben'],
        assumptions: [isQuota ? 'KI-Tageslimit erreicht. Bitte später erneut versuchen ODER Werte direkt eingeben.' : 'KI-Fehler: ' + docResult.error] };
      errors.push(docResult.error!);
      await supabase.from('documents').update({ status: 'error', extracted_data: { error: docResult.error } }).eq('id', documentId);
      await supabase.from('audit_log').insert({
        project_id: projectId, agent: 'Dokumenten-Agent',
        action: 'KI-Analyse fehlgeschlagen — manuelle Eingabe erforderlich',
        field: 'documents', reason: docResult.error || 'Unbekannt', user_initiated: false,
      });
    } else {
      extracted = docResult.data.extracted as Record<string, any>;
    }
    log.push(`✓ First-Pass: ${extracted.texts?.length || 0} Texte, ${extracted.dimensions?.length || 0} Maße, Konfidenz ${((extracted.overallConfidence as number || 0) * 100).toFixed(0)}%`);

    // OCR-Fakten sind deterministisch — wenn DN-Marker da sind, ist alles Wichtige sicher.
    // Dann KEINE teuren Zusatz-Pässe (spart Zeit gegen 150s-Edge-Limit + Quota).
    const ocrFacts = (extracted.parsedFacts as any) || {};
    const ocrDnClear = Array.isArray(ocrFacts.dnMarkers) && ocrFacts.dnMarkers.length > 0;

    // === 1a-GUARD: Degradierte Extraktion erkennen (Ehrlichkeit statt falscher Sicherheit) ===
    // Ein eindeutiger DN-Marker heißt NICHT, dass der ganze Plan vollständig gelesen wurde.
    // Bei auffällig dünner Extraktion (wenige Texte/Maße, Quota-Fallback) wird das Ergebnis
    // NICHT als "sicher" ausgegeben, sondern als möglicherweise unvollständig markiert —
    // der Nutzer kann dann erneut analysieren oder den Hochgenau-Modus (Pro) wählen.
    {
      // Echtes Signal messen, NICHT texts[].length: der Hauptinhalt liegt im _rawText
      // (vom deterministischen Parser konsumiert). Degradiert ist nur, wenn ALLE Quellen
      // dünn sind: kaum Rohtext UND wenige Maße UND keine Fakten aus dem Text-Parser.
      const rawTextLen = String(extracted._rawText ?? '').length;
      const nDims = (extracted.dimensions as unknown[] | undefined)?.length ?? 0;
      const pf = (extracted.parsedFacts as any) || {};
      const factSignal =
        (Array.isArray(pf.dnMarkers) ? pf.dnMarkers.length : 0) +
        (Array.isArray(pf.dimensions) ? pf.dimensions.length : 0) +
        (Number(pf.ueberdachungCount) || 0) +
        (Array.isArray(pf.postalCodes) ? pf.postalCodes.length : 0) +
        (Array.isArray(pf.aufbautenCodes) ? pf.aufbautenCodes.length : 0);
      const method = String(extracted._analysisMethod ?? '');
      const usedFallback = /quota|fallback|lite/i.test(method);
      // Wirklich dünn: wenig Rohtext UND wenig Maße UND kaum Text-Parser-Fakten.
      const trulyThin = rawTextLen < 300 && nDims < 3 && factSignal < 3;
      if (trulyThin || usedFallback) {
        const reasons: string[] = [];
        if (trulyThin) reasons.push(`sehr wenig erkannt (Rohtext ${rawTextLen} Z., ${nDims} Maße, ${factSignal} Fakten)`);
        if (usedFallback) reasons.push('Notfall-Modell (Quota) verwendet');
        const warn = `Analyse möglicherweise unvollständig (${reasons.join(', ')}). Bitte Werte gegen den Plan prüfen — oder erneut analysieren bzw. Hochgenau-Modus (Pro) im Admin aktivieren.`;
        extracted.unreliableAreas = [...(extracted.unreliableAreas as string[] || []), warn];
        extracted.extractionDegraded = true;
        log.push(`⚠ Degradierte Extraktion: ${reasons.join(', ')} → als unvollständig markiert`);
      } else {
        extracted.extractionDegraded = false;
        log.push(`✓ Extraktions-Tiefe OK (Rohtext ${rawTextLen} Z., ${nDims} Maße, ${factSignal} Text-Fakten)`);
      }
    }

    // === 1b. Second-Pass (Multi-Pass-Strategie bei niedriger Konfidenz) ===
    const needsSecondPass = !ocrDnClear && docResult.ok && (
      (extracted.overallConfidence as number || 0) < 0.6 ||
      (extracted.planQuality as any)?.legibility === 'low'
    );
    if (needsSecondPass) {
      log.push(`[${new Date().toISOString()}] ▶ Multi-Pass aktiviert wegen Konfidenz ${((extracted.overallConfidence as number || 0) * 100).toFixed(0)}% / Lesbarkeit: ${(extracted.planQuality as any)?.legibility}`);
      const secondResult = await safeCallAgent('agent-document', {
        projectId, documentId, retryWith: 'gemini-2.5-flash', focusOnMissing: true,
      });
      if (secondResult.ok) {
        const secondExtracted = secondResult.data.extracted as Record<string, any>;
        extracted = mergeExtracted(extracted, secondExtracted);
        log.push(`[${new Date().toISOString()}] ✓ Second-Pass: Konfidenz ${((secondExtracted.overallConfidence as number || 0) * 100).toFixed(0)}% → Merge-Konfidenz ${((extracted.overallConfidence as number || 0) * 100).toFixed(0)}%`);
        await supabase.from('audit_log').insert({
          project_id: projectId, agent: 'Dokumenten-Agent (Multi-Pass)',
          action: 'Second-Pass abgeschlossen, Ergebnisse gemergt',
          field: 'documents',
          reason: `First-Pass-Konfidenz zu niedrig: ${((docResult.data?.extracted?.overallConfidence as number || 0) * 100).toFixed(0)}%`,
          new_value: `Merge-Konfidenz: ${((extracted.overallConfidence as number || 0) * 100).toFixed(0)}%`,
          user_initiated: false,
        });
      } else {
        log.push(`✗ Second-Pass fehlgeschlagen: ${secondResult.error} — behalte First-Pass`);
        errors.push(`Second-Pass: ${secondResult.error}`);
      }
    }

    // === 1b2. Konsens-Pass (bei unsicheren Werten) ===
    // Deterministischen Text-Parser-Ergebnis aus dem bereits extrahierten Text nutzen,
    // um zu prüfen, ob DN-Marker eindeutig sind (kein extra API-Call nötig).
    {
      // DN-Marker aus dem First-Pass-Extrakt holen (bereits durch agent-document ermittelt)
      const dn_markers_raw = (extracted.dn_markers as Array<{ value: number }> | undefined) ?? [];
      const factsDnMarkers = dn_markers_raw.length > 0
        ? dn_markers_raw
        : ((extracted.dimensions as Array<{ label?: string; value: number }> | undefined) ?? [])
            .filter(d => d.label?.toLowerCase().includes('dachneigung') || d.label?.toLowerCase().includes('neigung'))
            .map(d => ({ value: d.value }));

      if (!ocrDnClear && docResult.ok && needsConsensusPass(extracted, { dnMarkers: factsDnMarkers })) {
        log.push(`[${new Date().toISOString()}] ▶ Konsens-Pass: DN unklar (${factsDnMarkers.map(m => m.value + '°').join(', ') || 'kein DN'}) oder Konfidenz < 0.7 — starte 2. Analyse…`);
        const consensusResult = await safeCallAgent('agent-document', {
          projectId, documentId, retryWith: 'gemini-2.5-flash', focusOnMissing: false,
        });
        if (consensusResult.ok) {
          const consensusExtracted = consensusResult.data.extracted as Record<string, any>;
          const { consensus, uncertainFields } = buildConsensus([extracted, consensusExtracted]);
          extracted = consensus;
          const safeCount = Object.keys(consensus).filter(k => !uncertainFields.includes(k)).length;
          log.push(`[${new Date().toISOString()}] ✓ Konsens: ${safeCount} Felder sicher, ${uncertainFields.length} unsicher markiert (${uncertainFields.join(', ') || '–'})`);
          await supabase.from('audit_log').insert({
            project_id: projectId, agent: 'Dokumenten-Agent (Konsens)',
            action: `Konsens-Pass abgeschlossen`,
            field: 'documents',
            reason: `Unsichere Felder: ${uncertainFields.join(', ') || '–'}`,
            new_value: `Konsens-Konfidenz: ${((extracted.overallConfidence as number || 0) * 100).toFixed(0)}%, unsicher: ${uncertainFields.length} Felder`,
            user_initiated: false,
          });
        } else {
          log.push(`✗ Konsens-Pass fehlgeschlagen: ${consensusResult.error} — behalte First-Pass`);
          errors.push(`Konsens-Pass: ${consensusResult.error}`);
          // Felder trotzdem als unsicher markieren
          extracted.uncertainFields = extracted.uncertainFields ?? [];
        }
      } else if (docResult.ok) {
        log.push(`✓ Konsens-Pass übersprungen: DN eindeutig (${factsDnMarkers.map(m => m.value + '°').join(', ')}) und Konfidenz ≥ 0.7 — kein Extra-Gemini-Call`);
        extracted.uncertainFields = extracted.uncertainFields ?? [];
      }
    }

    // === 1c. Geometrie-Cross-Check ===
    {
      const dims = (extracted.dimensions || []) as Array<{label?: string; value: number; confidence: number}>;
      const find = (l: string) => dims.find(d => d.label?.toLowerCase().includes(l));
      const lengthDim = find('länge') || find('gebäudelänge');
      const widthDim  = find('breite') || find('gebäudebreite');
      const pitchDim  = find('neigung') || find('dachneigung');
      const eaveDim   = find('trauf');
      const ridgeDim  = find('first');
      const rp0 = (extracted.roofParts as Array<any> | undefined)?.[0];

      // Länge-Cross-Check
      if (rp0 && lengthDim && Math.abs(rp0.length - lengthDim.value) > 0.5) {
        const inconsistency = `Länge-Inkonsistenz: dimensions=${lengthDim.value}m vs roofParts[0].length=${rp0.length}m`;
        log.push(`⚠ ${inconsistency}`);
        (extracted.unreliableAreas as string[]).push(inconsistency);
        // Höhere Konfidenz gewinnt
        if ((rp0.confidence ?? 0) < (lengthDim.confidence ?? 0)) rp0.length = lengthDim.value;
      }

      // Neigungswinkel-Cross-Check (aus First+Trauf+Breite berechnen)
      if (pitchDim && eaveDim && ridgeDim && widthDim && widthDim.value > 0) {
        const halfWidth = widthDim.value / 2;
        const rise = ridgeDim.value - eaveDim.value;
        const calcPitch = Math.round(Math.atan(rise / halfWidth) * (180 / Math.PI));
        if (Math.abs(calcPitch - pitchDim.value) > 5) {
          const msg = `Neigungswinkel-Abweichung: angegeben ${pitchDim.value}° ≠ berechnet ${calcPitch}° aus Firsthöhe/Traufhöhe/Breite`;
          log.push(`⚠ ${msg}`);
          (extracted.unreliableAreas as string[]).push(msg);
        }
      }
    }

    // === 1d. Adress-Geocoding-Fallback via PLZ aus Texten ===
    const hasBuildingAddr = (extracted.addresses as Array<any> | undefined)?.some((a: any) => a.isBuildingAddress);
    if (!hasBuildingAddr) {
      const texts = (extracted.texts as Array<{content: string; category?: string}> | undefined) || [];
      const plzCandidates = texts.filter(t => /\b\d{4}\b/.test(t.content));
      if (plzCandidates.length > 0) {
        log.push(`ℹ Adress-Fallback: ${plzCandidates.length} PLZ-Kandidat(en) in Texten gefunden → als Adress-Kandidat übergeben`);
        (extracted.addresses as unknown[]) = [
          ...(extracted.addresses as unknown[] || []),
          ...plzCandidates.map(t => ({ fullAddress: t.content, context: 'PLZ-Fallback aus Textliste', isBuildingAddress: true, confidence: 0.35 })),
        ];
      }
    }

    log.push(`✓ Dokument final: ${extracted.texts?.length || 0} Texte, ${extracted.dimensions?.length || 0} Maße, ${extracted.addresses?.length || 0} Adressen, ${(extracted.roofParts as unknown[])?.length || 0} Dachteile, Konfidenz ${((extracted.overallConfidence as number || 0) * 100).toFixed(0)}%`);

    // === 2. Adress + Struktur parallel (GRACEFUL) ===
    log.push('▶ Adress- und Struktur-Agent parallel…');
    const [addrResult, structResult] = await Promise.all([
      safeCallAgent('agent-address', { projectId, candidates: extracted.addresses || [] }),
      safeCallAgent('agent-structure', {
        span: extracted.spans?.[0]?.length || extracted.dimensions?.find((d: any) => d.label?.toLowerCase().includes('breite'))?.value || 8,
        roofForm: extracted.roofHints?.form || 'satteldach',
        pitch: extracted.roofHints?.pitch || 30,
        width: extracted.dimensions?.find((d: any) => d.label?.toLowerCase().includes('breite'))?.value || 8,
        columnFree: false,
        hints: JSON.stringify(extracted.structureHints || {}),
      }),
    ]);

    if (addrResult.ok) {
      log.push(`✓ Adresse: ${addrResult.data.address?.city || '?'}, Höhe ${addrResult.data.address?.elevation || '?'}m, Schneezone ${addrResult.data.zones?.snow}`);
    } else {
      log.push(`✗ Adresse: ${addrResult.error}`);
      errors.push(addrResult.error!);
    }

    if (structResult.ok) {
      log.push(`✓ Tragsystem: ${structResult.data.recommended} (${(structResult.data.confidence * 100).toFixed(0)}%)`);
    } else {
      log.push(`✗ Tragsystem: ${structResult.error}`);
      errors.push(structResult.error!);
    }

    // === 2b. Validation-Pass: Plausibilitätsprüfung extrahierter Werte ===
    {
      const dimsForValidation = (extracted.dimensions || []) as Array<{label?: string; value: number; confidence: number}>;
      const findV = (l: string) => dimsForValidation.find(d => d.label?.toLowerCase().includes(l));
      const pitchV = findV('neigung') || findV('dachneigung');
      const lengthV = findV('länge') || findV('gebäudelänge');
      const widthV = findV('breite') || findV('gebäudebreite');
      const rp0V = (extracted.roofParts as Array<any> | undefined)?.[0];
      const span0 = extracted.spans?.[0]?.length || widthV?.value;

      // Einfache Regelprüfungen (ohne extra KI-Aufruf – synchron & kostenlos)
      const validationIssues: string[] = [];
      if (pitchV && (pitchV.value < 1 || pitchV.value > 75)) {
        validationIssues.push(`Dachneigung ${pitchV.value}° außerhalb realistischem Bereich (1–75°) — möglicherweise Fehlauszug`);
      }
      if (lengthV && lengthV.value > 80) {
        validationIssues.push(`Gebäudelänge ${lengthV.value}m ungewöhnlich groß (>80m) — Cross-Check empfohlen`);
      }
      if (widthV && widthV.value > 30) {
        validationIssues.push(`Gebäudebreite ${widthV.value}m ungewöhnlich groß (>30m) — für KVH/BSH unrealistisch`);
      }
      if (span0 && span0 > 25) {
        validationIssues.push(`Sparrenstützweite ${span0}m unrealistisch für KVH (max ~12m) — bitte prüfen`);
      }
      if (rp0V?.pitchDeg && (rp0V.pitchDeg < 1 || rp0V.pitchDeg > 75)) {
        validationIssues.push(`roofParts[0].pitch ${rp0V.pitchDeg}° außerhalb Plausibilitätsgrenze`);
      }
      if (validationIssues.length > 0) {
        for (const issue of validationIssues) {
          log.push(`⚠ Validation: ${issue}`);
          errors.push(issue);
          (extracted.unreliableAreas as string[]) = [...(extracted.unreliableAreas as string[] || []), issue];
          (extracted.assumptions as string[]) = [...(extracted.assumptions as string[] || []), `Plausibilitätswarnung: ${issue}`];
        }
        await supabase.from('audit_log').insert({
          project_id: projectId, agent: 'Validation-Pass',
          action: `${validationIssues.length} Plausibilitätsproblem(e) erkannt`,
          field: 'documents',
          reason: validationIssues.join(' | '),
          user_initiated: false,
        });
      } else {
        log.push(`✓ Validation-Pass: alle Werte plausibel`);
      }
    }

    // === 3. Merge ins Projekt ===
    const { data: current } = await supabase.from('projects').select('project_data').eq('id', projectId).single();
    const currentData = (current?.project_data as Record<string, any>) || {};
    const projectUpdate: Record<string, any> = { ...currentData };

    if (addrResult.ok && addrResult.data.address) projectUpdate.address = addrResult.data.address;

    // Geometrie aus Extraktion
    const dims = (extracted.dimensions || []) as Array<{label?: string; value: number; confidence: number}>;
    const find = (label: string) => dims.find(d => d.label?.toLowerCase().includes(label));
    const length = find('länge') || find('gebäudelänge');
    const width = find('breite') || find('gebäudebreite');
    const pitch = find('neigung') || find('dachneigung');
    const eaves = find('trauf');
    const ridge = find('first');
    if (length || width || pitch) {
      projectUpdate.geometry = {
        length:      { value: length?.value || 0, unit: 'm',  confidence: length?.confidence || 0, source: 'extracted' },
        width:       { value: width?.value  || 0, unit: 'm',  confidence: width?.confidence  || 0, source: 'extracted' },
        roofPitch:   { value: pitch?.value  || 0, unit: '°',  confidence: pitch?.confidence  || 0, source: 'extracted' },
        eavesHeight: { value: eaves?.value  || 0, unit: 'm',  confidence: eaves?.confidence  || 0, source: 'extracted' },
        ridgeHeight: { value: ridge?.value  || 0, unit: 'm',  confidence: ridge?.confidence  || 0, source: ridge ? 'extracted' : 'calculated' },
        spans: (extracted.spans || []).map((s: any) => ({
          id: s.label || 'L', label: s.label || 'L', length: s.length || 0, direction: 'x', confidence: s.confidence || 0,
        })),
        axes: [], isSymmetric: true,
        confidence: extracted.overallConfidence || 0.5,
        userConfirmed: false,
      };
    }

    if (extracted.roofHints?.form) {
      // Pultdach-Heuristik: wenn KI 'satteldach' liefert aber pitch < 12° → Pultdach
      const mainRoofPart = (extracted.roofParts as Array<any> | undefined)?.[0];
      const mainPitch = mainRoofPart?.pitch ?? (extracted.roofHints as any)?.pitch ?? 0;
      let detectedForm = (extracted.roofHints as any).form as string;
      if (detectedForm === 'satteldach' && mainPitch > 0 && mainPitch < 12) {
        detectedForm = 'pultdach';
        log.push(`ℹ Dachform-Korrektur: satteldach → pultdach (pitch ${mainPitch}° < 12°)`);
      }
      projectUpdate.roofType = {
        form: detectedForm,
        confidence: (extracted.roofHints as any).confidence || 0.5,
        alternatives: [], userConfirmed: false,
      };
    }

    if (structResult.ok && structResult.data.recommended) {
      projectUpdate.structuralSystem = {
        type: structResult.data.recommended,
        confidence: structResult.data.confidence,
        reasoning: structResult.data.reasoning,
        alternatives: structResult.data.alternatives || [],
        userConfirmed: false,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MULTI-ROOF-GARANTIE: textParser-Fakten erzwingen Anzahl + Neigungen
    // ═══════════════════════════════════════════════════════════════════════
    // Die deterministischen Fakten (parsedFacts) aus dem Text-Parser sind die
    // WAHRHEIT für: Anzahl Vordächer (ueberdachungCount), Dachneigungen (dnMarkers).
    // Die KI kann ein Dach "vergessen" — der Text-Parser nicht.
    const facts = (extracted.parsedFacts as any) || {};
    const factUeberCount: number = facts.ueberdachungCount ?? 0;
    const factUeberLabels: string[] = facts.ueberdachungLabels ?? [];
    const factDnMarkers: Array<{ value: number }> = facts.dnMarkers ?? [];

    // Erkennt Text-Fragmente, die die KI fälschlich als Dachteil-Label ausgegeben hat
    // (z.B. "ÜBERDACHUNG, STALL NEU, EINREICHPLAN." oder "Vordach Maße: 28.65m, 16.15").
    function isGarbageLabel(raw: any): boolean {
      const r = String(raw ?? '').trim();
      if (!r || r === 'undefined') return true;
      if (r.length > 38) return true;
      if (/einreichplan|maße|massstab|maßstab|grundriss|ansicht\b/i.test(r)) return true;
      if ((r.match(/,/g) || []).length >= 2) return true;          // mehrere Kommas = Textzeile
      if ((r.match(/\d/g) || []).length >= 4) return true;          // viele Ziffern = Maßtext
      if (/\d{2,}[.,]\d/.test(r)) return true;                      // enthält Maßzahl
      return false;
    }
    // Saubere, menschenlesbare Bezeichnung erzeugen (nie ein Textfragment).
    function cleanRoofLabel(raw: any, kind: string, vIdx: number): string {
      if (!isGarbageLabel(raw)) return String(raw).trim();
      if (kind === 'main') return 'Hauptdach';
      if (kind === 'vordach' || kind === 'carport') return `Vordach ${vIdx}`;
      if (kind === 'anbau' || kind === 'nebengebaeude') return `Anbau ${vIdx}`;
      return `Dachteil ${vIdx}`;
    }

    let extractedRoofParts = (extracted.roofParts as Array<any> | undefined) ?? [];
    // Nur Dachteile mit echter Geometrie behalten; Label säubern (Textfragmente raus).
    let vCounter = 0;
    extractedRoofParts = extractedRoofParts
      .filter((rp: any) => {
        const len = rp.length ?? rp.geometry?.length ?? 0;
        const wid = rp.width ?? rp.geometry?.width ?? 0;
        return len > 0 || wid > 0;          // muss reale Maße haben
      })
      .map((rp: any) => {
        const isVordach = rp.kind === 'vordach' || rp.kind === 'carport';
        if (isVordach) vCounter++;
        return { ...rp, label: cleanRoofLabel(rp.label, rp.kind || 'main', isVordach ? vCounter : 1) };
      });


    // Geometrie-Fallback aus dimensions (für synthetische Dachteile)
    const dimsArr = (extracted.dimensions || []) as Array<{label?: string; value: number}>;
    const findDim = (l: string) => dimsArr.find(d => d.label?.toLowerCase().includes(l))?.value ?? 0;
    const baseLen = findDim('länge') || findDim('gebäudelänge') || 10;
    const baseWid = findDim('breite') || findDim('gebäudebreite') || 8;
    const baseRidge = findDim('first') || 6;
    const baseEaves = findDim('trauf') || 4;

    // GARANTIE 1: Wenn KI gar keine roofParts lieferte → mindestens Hauptdach erzeugen
    if (extractedRoofParts.length === 0) {
      const mainPitch = factDnMarkers[0]?.value ?? 30;
      extractedRoofParts = [{
        id: 'main', kind: 'main', label: 'Hauptdach',
        form: mainPitch <= 5 ? 'flachdach' : (mainPitch < 12 ? 'pultdach' : 'satteldach'),
        positionX: 0, positionY: 0,
        length: baseLen, width: baseWid, ridgeHeight: baseRidge, eavesHeight: baseEaves,
        pitch: mainPitch, ridgeDirection: 'x', confidence: 0.5,
        notes: 'Synthetisch erzeugt (KI lieferte kein Dachteil)',
      }];
      log.push('⚠ Multi-Roof-Garantie: Kein Dachteil von KI — Hauptdach synthetisch erzeugt');
    }

    // GARANTIE 2: Vordach-Anzahl ergänzen — KONSERVATIV. Der Text-Parser zählt
    // Wort-Vorkommen (überzählt oft), darum wird auf max. 2 zusätzliche Vordächer
    // begrenzt und nur ergänzt, wenn die KI deutlich zu wenige lieferte. Labels sind
    // immer sauber generiert ("Vordach N"), NIE Textfragmente.
    const kiVordachCount = extractedRoofParts.filter((rp: any) => rp.kind === 'vordach' || rp.kind === 'carport').length;
    const targetVordach = Math.min(factUeberCount, 2);   // Über-Zählung kappen
    if (targetVordach > kiVordachCount) {
      const missing = targetVordach - kiVordachCount;
      for (let i = 0; i < missing; i++) {
        const n = kiVordachCount + i + 1;
        const vPitch = 0; // Vordächer i.d.R. flach; Geometrie-Schiedsrichter korrigiert später
        const side = i % 2 === 0 ? 1 : -1;
        extractedRoofParts.push({
          id: `vordach_${n}`, kind: 'vordach', label: `Vordach ${n}`,
          form: 'flachdach', positionX: 0, positionY: side * (baseWid / 2 + 2),
          length: baseLen, width: 3, ridgeHeight: baseEaves, eavesHeight: Math.max(2.5, baseEaves - 0.5),
          pitch: vPitch, ridgeDirection: 'x', confidence: 0.5,
          notes: 'Aus Plan-Hinweis ergänzt (bitte prüfen)',
        });
      }
      log.push(`⚠ Multi-Roof-Garantie: ${missing} Vordach/Vordächer ergänzt (Text-Hinweis: ${factUeberCount})`);
    }

    // GARANTIE 3: GEOMETRIE-SCHIEDSRICHTER für Dachneigung.
    // KI-DN-Werte werden NICHT blind übernommen (Gemini halluziniert manchmal).
    // Stattdessen: deterministische Neigung aus First/Traufe/Breite berechnen,
    // KI-DN nur akzeptieren wenn es zur Geometrie passt. Sonst Geometrie + unsicher.
    const dnUniq = [...new Set(factDnMarkers.map(m => m.value))];
    const uncertainPitchParts: string[] = [];
    extractedRoofParts.forEach((rp: any, idx: number) => {
      const len = rp.length ?? rp.geometry?.length ?? 0;
      const wid = rp.width ?? rp.geometry?.width ?? 0;
      const ridge = rp.ridgeHeight ?? rp.geometry?.ridgeHeight ?? 0;
      const eaves = rp.eavesHeight ?? rp.geometry?.eavesHeight ?? 0;
      const rise = ridge - eaves;

      // Geometrie-Neigung berechnen (deterministisch)
      let geomPitchPult = 0, geomPitchSattel = 0;
      if (wid > 0 && rise > 0.05) {
        geomPitchPult = Math.round(Math.atan2(rise, wid) * 180 / Math.PI * 10) / 10;        // über volle Breite
        geomPitchSattel = Math.round(Math.atan2(rise, wid / 2) * 180 / Math.PI * 10) / 10;  // über halbe Breite
      }

      // KI-DN-Kandidat (eindeutig oder index-basiert)
      const kiDn = dnUniq.length === 1
        ? (rp.kind === 'main' ? dnUniq[0] : (factDnMarkers[idx]?.value ?? null))
        : (factDnMarkers[idx]?.value ?? null);

      let finalPitch: number;
      let pitchSource: string;

      if (rise <= 0.05 && wid > 0) {
        // praktisch flach
        finalPitch = 2; rp.form = 'flachdach'; pitchSource = 'flach (First≈Traufe)';
      } else if (kiDn != null && (Math.abs(kiDn - geomPitchPult) <= 5 || Math.abs(kiDn - geomPitchSattel) <= 5)) {
        // KI-DN passt zur Geometrie → vertrauenswürdig
        finalPitch = kiDn; pitchSource = `DN-Marker ${kiDn}° (geometrie-bestätigt)`;
        // Form aus dem besser passenden Geometrie-Modell
        if (Math.abs(kiDn - geomPitchPult) <= Math.abs(kiDn - geomPitchSattel)) {
          if (rp.form === 'satteldach') rp.form = 'pultdach';
        }
      } else if (geomPitchPult > 0) {
        // KI-DN fehlt oder unplausibel → Geometrie nehmen (deterministisch).
        // Mehrdeutigkeit: rise/width=0.20 kann 11° Pultdach ODER 22° Satteldach sein.
        // Heuristik: flaches Dach (rise/width < 0.27, ≈ Pultdach <15° / Sattel <30°)
        // → Pultdach (typisch für Ställe/Gewerbe/Vordächer). Steiler → Satteldach.
        const flatness = rise / wid;
        const kiSaysPult = rp.form === 'pultdach';
        const kiSaysSattel = rp.form === 'satteldach' || rp.form === 'walmdach' || rp.form === 'krueppelwalmdach';
        if (flatness < 0.27 && !kiSaysSattel) {
          // flaches Dach → Pultdach (außer KI ist sich sehr sicher dass Satteldach)
          finalPitch = geomPitchPult; rp.form = 'pultdach';
          pitchSource = `Geometrie-Pultdach ${geomPitchPult}° (flach, rise/width=${flatness.toFixed(2)})`;
        } else if (kiSaysPult) {
          finalPitch = geomPitchPult; pitchSource = `Geometrie-Pultdach ${geomPitchPult}° (KI-Form)`;
        } else {
          finalPitch = geomPitchSattel; if (!rp.form || rp.form === 'flachdach') rp.form = 'satteldach';
          pitchSource = `Geometrie-Satteldach ${geomPitchSattel}°`;
        }
        uncertainPitchParts.push(rp.label || `Dachteil ${idx + 1}`);
      } else {
        finalPitch = kiDn ?? rp.pitch ?? 30;
        pitchSource = kiDn != null ? `DN ${kiDn}° (ungeprüft)` : 'Default 30°';
        uncertainPitchParts.push(rp.label || `Dachteil ${idx + 1}`);
      }

      rp.pitch = finalPitch;
      rp._pitchSource = pitchSource;
      // Form-Konsistenz
      if (finalPitch <= 5 && rp.form !== 'flachdach') rp.form = 'flachdach';

      // Plausibilitäts-Kappung: Vordächer/Carports/Überdachungen sind praktisch immer
      // flach bis leicht geneigt (≤15°). Wenn die Geometrie eine steile Neigung ergibt
      // (oft aus synthetischer Vordach-Geometrie), ist das fast sicher falsch → kappen.
      const isCanopy = rp.kind === 'vordach' || rp.kind === 'carport';
      if (isCanopy && rp.pitch > 15) {
        rp.pitch = Math.min(geomPitchPult > 0 && geomPitchPult <= 15 ? geomPitchPult : 5, 15);
        rp.form = rp.pitch <= 5 ? 'flachdach' : 'pultdach';
        rp._pitchSource = `Vordach flach gekappt (${rp.pitch}°, war steil)`;
        if (!uncertainPitchParts.includes(rp.label)) uncertainPitchParts.push(rp.label || `Dachteil ${idx + 1}`);
      }
    });
    log.push(`✓ Geometrie-Schiedsrichter: Neigungen ${extractedRoofParts.map((r:any)=>r.pitch+'°').join(', ')} (DN-Marker: ${dnUniq.length?dnUniq.join('°,')+'°':'keine'})`);
    if (uncertainPitchParts.length > 0) {
      const w = `Dachneigung aus Geometrie berechnet (kein verlässlicher DN-Marker gelesen): ${uncertainPitchParts.join(', ')} — bitte gegen Plan prüfen`;
      extracted.unreliableAreas = [...(extracted.unreliableAreas as string[] || []), w];
      log.push(`⚠ ${w}`);
    }

    // DEDUP: doppelte Dachteile zusammenfassen (gleiche Form + ähnliche Neigung/Breite/Länge).
    // Die KI emittiert manchmal denselben Dachteil mehrfach (z.B. aus verschiedenen Ansichten).
    {
      // Toleranz-Dedup: zwei Dachteile gleichen Typs mit FAST gleicher Grundfläche
      // (Breite UND Länge je ≤ 1,2 m Unterschied) sind dasselbe Dach. Konservativ, damit
      // echte separate Dächer (z.B. Vordach vs Hauptdach) NICHT fälschlich verschmelzen.
      // Beim Duplikat bleibt das GRÖSSERE Teil (mehr Fläche = vollständigere Info).
      const W = (rp: any) => rp.width ?? rp.geometry?.width ?? 0;
      const L = (rp: any) => rp.length ?? rp.geometry?.length ?? 0;
      const deduped: any[] = [];
      for (const rp of extractedRoofParts) {
        const idx = deduped.findIndex((k) =>
          (k.kind || 'main') === (rp.kind || 'main') &&
          Math.abs(W(k) - W(rp)) <= 1.2 && Math.abs(L(k) - L(rp)) <= 1.2,
        );
        if (idx < 0) deduped.push(rp);
        else if (W(rp) * L(rp) > W(deduped[idx]) * L(deduped[idx])) deduped[idx] = rp; // größeres behalten
      }
      // Genau EIN Hauptdach behalten (das mit der größten Fläche), Rest zu Anbau umkategorisieren.
      const mains = deduped.filter((r) => r.kind === 'main');
      if (mains.length > 1) {
        mains.sort((a, b) => ((b.width ?? 0) * (b.length ?? 0)) - ((a.width ?? 0) * (a.length ?? 0)));
        mains.slice(1).forEach((r, i) => { r.kind = 'anbau'; if (isGarbageLabel(r.label) || /^Hauptdach/.test(r.label)) r.label = `Anbau ${i + 1}`; });
      }
      if (deduped.length !== extractedRoofParts.length) {
        log.push(`✓ Dachteile dedupliziert: ${extractedRoofParts.length} → ${deduped.length}`);
      }
      extractedRoofParts = deduped;
    }

    // roofParts in projectUpdate schreiben
    if (extractedRoofParts && extractedRoofParts.length > 0) {
      projectUpdate.roofParts = extractedRoofParts.map((rp: any) => ({
        id: rp.id,
        kind: rp.kind,
        label: rp.label,
        form: rp.form,
        positionX: rp.positionX ?? 0,
        positionY: rp.positionY ?? 0,
        geometry: {
          length: rp.length ?? rp.geometry?.length ?? 0,
          width: rp.width ?? rp.geometry?.width ?? 0,
          ridgeHeight: rp.ridgeHeight ?? rp.geometry?.ridgeHeight ?? 0,
          eavesHeight: rp.eavesHeight ?? rp.geometry?.eavesHeight ?? 0,
          pitch: rp.pitch ?? rp.geometry?.pitch ?? 0,
          ridgeDirection: rp.ridgeDirection ?? rp.geometry?.ridgeDirection ?? 'x',
        },
        members: [],
        confidence: rp.confidence ?? 0.5,
        ...(rp.notes ? { notes: rp.notes } : {}),
      }));
      const partSummary = projectUpdate.roofParts.map((r: any) => `${r.label} (${r.form} ${r.geometry.pitch}°)`).join(', ');
      log.push(`✓ RoofParts FINAL: ${projectUpdate.roofParts.length} Dachteil(e) — ${partSummary}`);

      // Validierung: Anzahl plausibel?
      const expectedMin = 1 + factUeberCount;
      if (projectUpdate.roofParts.length < expectedMin) {
        const warn = `Dachteil-Anzahl ${projectUpdate.roofParts.length} < erwartet ${expectedMin} (1 Haupt + ${factUeberCount} Vordächer)`;
        errors.push(warn);
        log.push(`⚠ ${warn}`);
      }
    } else {
      log.push('ℹ RoofParts: Nur Hauptdach (kein multi-part-Ergebnis)');
    }

    // ceilings: Decken durchreichen (mit Konstruktionstyp)
    const extractedCeilings = (extracted.ceilings as Array<any> | undefined);
    if (extractedCeilings && extractedCeilings.length > 0) {
      projectUpdate.ceilings = extractedCeilings.map((c: any, i: number) => ({
        id: c.id ?? `ceil_${i}`,
        level: c.level ?? 'EG',
        area: c.area ?? 0,
        span: c.span ?? 0,
        nutzung: c.nutzung ?? 'Wohnen',
        ...(c.constructionType ? { constructionType: c.constructionType } : {}),
        ...(c.evidence ? { evidence: c.evidence } : {}),
        confidence: c.confidence ?? 0.5,
      }));
      const stbCount = projectUpdate.ceilings.filter((c: any) => c.constructionType === 'stb_decke').length;
      const holzCount = projectUpdate.ceilings.filter((c: any) => c.constructionType === 'holzbalkendecke').length;
      log.push(`✓ Ceilings: ${projectUpdate.ceilings.length} Decke(n) erkannt (${holzCount}× Holzbalken, ${stbCount}× STB) — Levels: ${projectUpdate.ceilings.map((c: any) => c.level).join(', ')}`);
    } else {
      log.push('ℹ Ceilings: Keine Decken erkannt');
    }

    // wallConstructions: Wand-Konstruktionstypen durchreichen
    const extractedWalls = (extracted.wallConstructions as Array<any> | undefined);
    if (extractedWalls && extractedWalls.length > 0) {
      projectUpdate.wallConstructions = extractedWalls.map((w: any) => ({
        level: w.level ?? 'EG',
        type: w.type ?? 'unbekannt',
        ...(w.thickness_mm ? { thickness_mm: w.thickness_mm } : {}),
        ...(w.material ? { material: w.material } : {}),
        ...(w.evidence ? { evidence: w.evidence } : {}),
        confidence: w.confidence ?? 0.5,
      }));
      const stbWalls = projectUpdate.wallConstructions.filter((w: any) => w.type === 'stb').map((w: any) => w.level).join(', ');
      const holzWalls = projectUpdate.wallConstructions.filter((w: any) => ['holzstaender', 'kvh', 'bsh'].includes(w.type)).map((w: any) => w.level).join(', ');
      log.push(`✓ WallConstructions: ${projectUpdate.wallConstructions.length} Geschoss/Wand erkannt (STB: ${stbWalls || '-'}, Holz: ${holzWalls || '-'})`);
    } else {
      log.push('ℹ WallConstructions: Keine Wand-Konstruktionstypen erkannt');
    }

    // fireProtection: Brandschutz + GK durchreichen
    const extractedFireProtection = extracted.fireProtection as any | undefined;
    if (extractedFireProtection && (extractedFireProtection.buildingClass || (extractedFireProtection.fireResistanceClasses as unknown[])?.length > 0)) {
      projectUpdate.fireProtection = {
        buildingClass: extractedFireProtection.buildingClass ?? undefined,
        buildingClassReason: extractedFireProtection.buildingClassReason ?? undefined,
        fireResistanceClasses: extractedFireProtection.fireResistanceClasses ?? [],
        confidence: extractedFireProtection.confidence ?? 0.5,
      };
      const reiList = ((extractedFireProtection.fireResistanceClasses as Array<{code: string}> | undefined) || []).map((r: {code: string}) => r.code).join(', ');
      log.push(`✓ Brandschutz erkannt: ${extractedFireProtection.buildingClass ?? '(GK unbekannt)'}, REI-Klassen: ${reiList || '–'}`);
      await supabase.from('audit_log').insert({
        project_id: projectId, agent: 'Dokumenten-Agent',
        action: `Brandschutz erkannt: ${extractedFireProtection.buildingClass ?? 'GK unbekannt'}, REI-Klassen: ${reiList || '–'}`,
        field: 'fireProtection',
        reason: extractedFireProtection.buildingClassReason ?? 'KI-Extraktion',
        new_value: JSON.stringify(projectUpdate.fireProtection),
        user_initiated: false,
      });
    } else {
      log.push('ℹ Brandschutz: Keine GK/REI-Angaben im Plan erkannt');
    }

    // covering: Eindeckungstyp + Eigengewicht durchreichen
    const extractedCovering = extracted.covering as any | undefined;
    if (extractedCovering && extractedCovering.type && extractedCovering.type !== 'unbekannt') {
      projectUpdate.coveringType = {
        type: extractedCovering.type,
        weight_kN_m2: extractedCovering.weight_kN_m2 ?? 0.55,
        evidence: extractedCovering.evidence ?? undefined,
        confidence: extractedCovering.confidence ?? 0.5,
      };
      log.push(`✓ Eindeckung erkannt: ${extractedCovering.type} (${(extractedCovering.weight_kN_m2 ?? 0.55).toFixed(2)} kN/m², Konfidenz ${((extractedCovering.confidence ?? 0.5) * 100).toFixed(0)}%)`);
      await supabase.from('audit_log').insert({
        project_id: projectId,
        agent: 'Dokumenten-Agent',
        action: `Eindeckung erkannt: ${extractedCovering.type} (${(extractedCovering.weight_kN_m2 ?? 0.55).toFixed(2)} kN/m²)`,
        field: 'coveringType',
        reason: extractedCovering.evidence ?? 'KI-Extraktion',
        new_value: JSON.stringify(projectUpdate.coveringType),
        user_initiated: false,
      });
    } else {
      log.push(`ℹ Eindeckung: ${extractedCovering?.type === 'unbekannt' ? 'Typ unbekannt – Default tile_clay wird angenommen' : 'Kein Eindeckungstyp erkannt'}`);
    }

    // uncertainFields aus Konsens in projectUpdate speichern (UI kann rot markieren)
    const uncertainFields = (extracted.uncertainFields as string[] | undefined) ?? [];
    if (uncertainFields.length > 0) {
      projectUpdate.uncertainFields = uncertainFields;
      log.push(`⚠ Unsichere Felder gespeichert: ${uncertainFields.join(', ')}`);
    }

    // Extraktions-Qualität für UI-Banner persistieren (ehrliche Unsicherheit)
    projectUpdate.extractionDegraded = extracted.extractionDegraded === true;
    if (Array.isArray(extracted.unreliableAreas) && (extracted.unreliableAreas as string[]).length > 0) {
      projectUpdate.unreliableAreas = extracted.unreliableAreas;
    }

    // === LESE-REPORT: explizite Vollständigkeits-Checkliste ===
    // Damit der Nutzer nach der Analyse GENAU sieht, was sicher gelesen wurde und
    // was geprüft werden sollte — nichts bleibt unbemerkt ungelesen.
    {
      // DEFAULTS für nicht gelesene Felder, damit NICHTS leer bleibt (Endkunde-fertig).
      // Jeder Default wird im Report als „angenommen" markiert (transparent, gelb).
      const isAgrar = JSON.stringify(projectUpdate.roofParts || []).toLowerCase().match(/stall|scheune|halle|landwirt|wirtschaftsgeb|maschinenhalle/) != null
        || (projectUpdate.structuralSystem?.type || '').includes('halle');
      if (!projectUpdate.fireProtection?.gk) {
        const gk = isAgrar ? 'GK1' : 'GK2';
        projectUpdate.fireProtection = { ...(projectUpdate.fireProtection || {}), gk, reiClass: gk === 'GK1' ? 'R30' : 'REI60', assumed: true };
      }
      if (!projectUpdate.coveringType?.type || projectUpdate.coveringType?.type === 'unbekannt') {
        projectUpdate.coveringType = { ...(projectUpdate.coveringType || {}), type: 'tile_clay', assumed: true };
      }

      const rp0 = (projectUpdate.roofParts as any[] | undefined)?.[0];
      const g = projectUpdate.geometry as any;
      type RStat = 'gelesen' | 'angenommen' | 'fehlt';
      const report: Array<{ feld: string; status: RStat; wert: string }> = [];
      const addR = (feld: string, val: any, assumed = false) => {
        const has = val != null && val !== 0 && val !== '' && val !== 'unbekannt';
        report.push({ feld, status: has ? (assumed ? 'angenommen' : 'gelesen') : 'fehlt', wert: has ? String(val) : '—' });
      };
      addR('Bauadresse / Ort', projectUpdate.address?.city);
      addR('Seehöhe / Zonen', projectUpdate.address?.elevation ? `${projectUpdate.address.elevation} m` : null);
      addR('Gebäudelänge', g?.length?.value ? `${g.length.value} m` : null);
      addR('Gebäudebreite', g?.width?.value ? `${g.width.value} m` : null);
      addR('Firsthöhe', g?.ridgeHeight?.value ? `${g.ridgeHeight.value} m` : null);
      addR('Traufhöhe', g?.eavesHeight?.value ? `${g.eavesHeight.value} m` : null);
      addR('Dachneigung (Hauptdach)', rp0?.geometry?.pitch ? `${rp0.geometry.pitch}°` : null);
      addR('Dachform', rp0?.form);
      addR('Anzahl Dachteile', (projectUpdate.roofParts as any[] | undefined)?.length || 0);
      addR('Eindeckung', projectUpdate.coveringType?.type, projectUpdate.coveringType?.assumed === true);
      addR('Tragsystem', projectUpdate.structuralSystem?.type);
      addR('Brandschutz (GK/REI)', projectUpdate.fireProtection?.gk, projectUpdate.fireProtection?.assumed === true);
      addR('Decken', (projectUpdate.ceilings as any[] | undefined)?.length || 0);
      const gelesen = report.filter(r => r.status === 'gelesen').length;
      const angenommen = report.filter(r => r.status === 'angenommen').length;
      const fehlend = report.filter(r => r.status === 'fehlt').map(r => r.feld);
      projectUpdate.analysisReport = report;
      if (extractionFailed) {
        // EHRLICHKEIT: keine vorgetäuschte Vollständigkeit, wenn die KI gar nicht lief.
        projectUpdate.analysisFailed = true;
        projectUpdate.analysisFailReason = extractionFailReason;
        projectUpdate.analysisReportSummary = { gelesen: 0, angenommen, offen: report.length - angenommen, gesamt: report.length, prozent: 0, failed: true };
        projectUpdate.unreliableAreas = [extractionFailReason, ...((projectUpdate.unreliableAreas as string[]) || [])];
        log.push(`✗ Analyse fehlgeschlagen — Report NICHT als vollständig markiert (${extractionFailReason})`);
      } else {
        projectUpdate.analysisFailed = false;
        projectUpdate.analysisReportSummary = {
          gelesen, angenommen, offen: fehlend.length, gesamt: report.length,
          prozent: Math.round((gelesen + angenommen) / report.length * 100),
        };
        log.push(`✓ Lese-Report: ${gelesen} gelesen, ${angenommen} angenommen, ${fehlend.length} offen${fehlend.length ? ` (${fehlend.join(', ')})` : ' — vollständig'}`);
      }
    }

    // === Selbst-Lernen: Adressen + Planer persistieren (für nächsten Lauf + Korrektur-Capture) ===
    if (Array.isArray(extracted.addresses) && extracted.addresses.length > 0) {
      projectUpdate.addresses = extracted.addresses;
    }
    {
      let persisted = derivePlanerKey(extracted.addresses ?? []);
      if (!persisted.key) persisted = derivePlanerKeyFromText(extracted._rawText as string);
      if (persisted.key) {
        projectUpdate.planerKey = persisted.key;
        projectUpdate.planerLabel = persisted.label;
      }
    }

    // === Selbst-Lernen: Regeln deterministisch anwenden (Post-Processing) ===
    // Planer aus den FRISCHEN Adressen neu ableiten — falls beim First-Pass noch
    // unbekannt (Erst-Analyse), greifen jetzt die planer-spezifischen Regeln.
    try {
      // 1. aus KI-Adressen, 2. Fallback aus Rohtext (deterministisch, KI-unabhängig)
      let freshPlaner = derivePlanerKey(extracted.addresses ?? []);
      if (!freshPlaner.key) freshPlaner = derivePlanerKeyFromText(extracted._rawText as string);
      if (freshPlaner.key && freshPlaner.key !== planerKey && ruleOwnerId) {
        planerKey = freshPlaner.key;
        learnedRules = await loadRulesForProject(supabase, ruleOwnerId, planerKey);
        log.push(`✓ Selbst-Lernen: Planer "${planerKey}" aus Plan erkannt → ${learnedRules.length} Regel(n)`);
      }
      if (learnedRules.length > 0) {
        // Flache Projekt-Sicht für die Regelanwendung
        const flat: Record<string, any> = {
          roofForm: projectUpdate.roofType?.form,
          coveringType: projectUpdate.coveringType?.type,
          structuralSystemType: projectUpdate.structuralSystem?.type,
          roofPitch: projectUpdate.geometry?.roofPitch?.value,
          fireClass: projectUpdate.fireProtection?.reiClass,
          gk: projectUpdate.fireProtection?.gk,
          overallConfidence: extracted.overallConfidence,
        };
        const { applied } = applyLearnedRules(flat, learnedRules);
        if (applied.length > 0) {
          for (const a of applied) {
            if (a.field === 'roofForm' && projectUpdate.roofType) { projectUpdate.roofType.form = a.to; projectUpdate.roofType.userConfirmed = false; }
            if (a.field === 'coveringType' && projectUpdate.coveringType) projectUpdate.coveringType.type = a.to;
            if (a.field === 'structuralSystemType' && projectUpdate.structuralSystem) projectUpdate.structuralSystem.type = a.to;
            if (a.field === 'roofPitch' && projectUpdate.geometry?.roofPitch) projectUpdate.geometry.roofPitch.value = Number(a.to);
            if (a.field === 'fireClass' && projectUpdate.fireProtection) projectUpdate.fireProtection.reiClass = a.to;
            if (a.field === 'gk' && projectUpdate.fireProtection) projectUpdate.fireProtection.gk = a.to;
          }
          const summary = applied.map(a => `${a.field}: ${a.from}→${a.to}`).join(', ');
          log.push(`✓ Selbst-Lernen angewandt: ${summary}`);
          await supabase.from('audit_log').insert({
            project_id: projectId, agent: 'Selbst-Lernen',
            action: `${applied.length} gelernte Regel(n) angewandt`,
            field: 'learned_rules', reason: summary, user_initiated: false,
          });
        }
      }
    } catch (e) {
      log.push(`ℹ Selbst-Lernen Post-Processing übersprungen (${e instanceof Error ? e.message : 'n/a'})`);
    }

    await supabase.from('projects')
      .update({
        project_data: projectUpdate,
        current_step: Math.max((currentData.currentStep as number) || 1, 5),
      })
      .eq('id', projectId);

    return new Response(JSON.stringify({
      success: true,
      log, errors,
      projectUpdate,
      agentResults: {
        document: extracted,
        address: addrResult.ok ? addrResult.data : { error: addrResult.error },
        structure: structResult.ok ? structResult.data : { error: structResult.error },
      },
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('orchestrator fatal:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
