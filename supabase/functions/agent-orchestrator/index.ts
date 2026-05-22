/**
 * Orchestrator: Robuste Multi-Agent-Pipeline mit Graceful-Fallbacks.
 *
 * Jeder Agent kann einzeln fehlschlagen ohne den Gesamtprozess zu killen.
 * Ergebnisse werden gemergt, fehlende Daten werden geloggt.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CORS_HEADERS } from '../_shared/gemini.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { projectId, documentId } = await req.json();
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

    // ── Hilfsfunktion: Konfidenz-gestütztes Merge zweier Extraktionen ──────────
    function mergeExtracted(base: Record<string, any>, overlay: Record<string, any>): Record<string, any> {
      const merged: Record<string, any> = { ...base };
      // Skalare Felder
      for (const key of ['overallConfidence', 'roofHints', 'structureHints', 'planQuality']) {
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

    // === 1. Dokument-Agent (First-Pass) ===
    log.push(`[${new Date().toISOString()}] ▶ Dokumenten-Agent First-Pass (Gemini Vision)…`);
    const docResult = await safeCallAgent('agent-document', { projectId, documentId });
    let extracted: Record<string, any>;
    if (!docResult.ok) {
      log.push(`✗ Dokument-Agent: ${docResult.error}`);
      const isQuota = docResult.error?.includes('429') || docResult.error?.includes('quota');
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

    // === 1b. Second-Pass (Multi-Pass-Strategie bei niedriger Konfidenz) ===
    const needsSecondPass = docResult.ok && (
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
      projectUpdate.roofType = {
        form: extracted.roofHints.form,
        confidence: extracted.roofHints.confidence || 0.5,
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

    // roofParts: multi-roof-part support
    const extractedRoofParts = (extracted.roofParts as Array<any> | undefined);
    if (extractedRoofParts && extractedRoofParts.length > 0) {
      projectUpdate.roofParts = extractedRoofParts.map((rp: any) => ({
        id: rp.id,
        kind: rp.kind,
        label: rp.label,
        form: rp.form,
        positionX: rp.positionX ?? 0,
        positionY: rp.positionY ?? 0,
        geometry: {
          length: rp.length ?? 0,
          width: rp.width ?? 0,
          ridgeHeight: rp.ridgeHeight ?? 0,
          eavesHeight: rp.eavesHeight ?? 0,
          pitch: rp.pitch ?? 0,
          ridgeDirection: rp.ridgeDirection ?? 'x',
        },
        members: [],
        confidence: rp.confidence ?? 0.5,
        ...(rp.notes ? { notes: rp.notes } : {}),
      }));
      log.push(`✓ RoofParts: ${projectUpdate.roofParts.length} Dachteil(e) erkannt (${projectUpdate.roofParts.map((r: any) => r.label).join(', ')})`);
    } else {
      log.push('ℹ RoofParts: Nur Hauptdach (kein multi-part-Ergebnis aus Extraktion)');
    }

    // ceilings: Holzbalkendecken durchreichen
    const extractedCeilings = (extracted.ceilings as Array<any> | undefined);
    if (extractedCeilings && extractedCeilings.length > 0) {
      projectUpdate.ceilings = extractedCeilings.map((c: any, i: number) => ({
        id: c.id ?? `ceil_${i}`,
        level: c.level ?? 'EG',
        area: c.area ?? 0,
        span: c.span ?? 0,
        nutzung: c.nutzung ?? 'Wohnen',
        confidence: c.confidence ?? 0.5,
      }));
      log.push(`✓ Ceilings: ${projectUpdate.ceilings.length} Holzbalkendecke(n) erkannt (${projectUpdate.ceilings.map((c: any) => c.level).join(', ')})`);
    } else {
      log.push('ℹ Ceilings: Keine Holzbalkendecken erkannt');
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
