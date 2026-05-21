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

    // === 1. Dokument-Agent ===
    log.push('▶ Dokumenten-Agent (Gemini Vision)…');
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
    log.push(`✓ Dokument: ${extracted.texts?.length || 0} Texte, ${extracted.dimensions?.length || 0} Maße, ${extracted.addresses?.length || 0} Adressen, Konfidenz ${((extracted.overallConfidence as number || 0) * 100).toFixed(0)}%`);

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
