/**
 * Agent: Dokumenten-Extraktion
 *
 * Liest einen Einreichplan-PDF und extrahiert strukturierte Rohdaten:
 *  - Alle erkannten Texte mit Kategorie + Konfidenz
 *  - Bemaßungen (Längen, Höhen, Neigung)
 *  - Adress-Kandidaten (Bauadresse vs. Planer)
 *  - Dachhinweise (Form, Neigung)
 *  - Unsichere Bereiche
 *
 * Verwendet: Gemini 2.0 Flash (Vision, PDF-fähig)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { geminiVision, parseJsonResponse, CORS_HEADERS } from '../_shared/gemini.ts';

const SYSTEM = `Du bist ein Dokumenten-Agent für österreichische Einreichpläne (Baugenehmigungspläne im PDF-Format).

Deine Aufgabe: Extrahiere strukturierte Rohdaten aus dem Plan.

Antworte AUSSCHLIESSLICH mit validem JSON in dieser Struktur:
{
  "texts": [{ "content": "...", "category": "address|dimension|label|note|title|other", "confidence": 0.0..1.0 }],
  "dimensions": [{ "value": 12.5, "unit": "m", "label": "Gebäudelänge|Gebäudebreite|Firsthöhe|Traufhöhe|Dachneigung|Spannweite", "confidence": 0..1 }],
  "addresses": [{ "fullAddress": "...", "context": "z.B. 'Bauvorhaben'", "isBuildingAddress": true|false, "confidence": 0..1, "excludeReason": "z.B. Planerbüro" }],
  "roofHints": { "form": "satteldach|pultdach|walmdach|krueppelwalmdach|flachdach|mischform", "pitch": 35, "confidence": 0..1, "ridgeDirection": "Nord-Süd|Ost-West|unbekannt" },
  "structureHints": { "type": "sparrendach|kehlbalkendach|pfettendach|leimbinder_haupttraeger|sonderfall", "reasoning": "...", "confidence": 0..1, "visibleMembers": ["sparren","mittelpfette","stuetze","leimbinder"] },
  "spans": [{ "label": "L1", "length": 6.5, "confidence": 0..1 }],
  "roofParts": [
    {
      "id": "main",
      "kind": "main",
      "label": "Hauptdach",
      "form": "satteldach|pultdach|walmdach|krueppelwalmdach|flachdach|mischform",
      "positionX": 0,
      "positionY": 0,
      "length": 21.8,
      "width": 8.0,
      "ridgeHeight": 6.26,
      "eavesHeight": 4.65,
      "pitch": 22,
      "ridgeDirection": "x",
      "confidence": 0.9
    }
  ],
  "overallConfidence": 0..1,
  "unreliableAreas": ["..."],
  "assumptions": ["..."]
}

WICHTIG:
- Adressen: Unterscheide IMMER zwischen Bauadresse (Bauvorhaben/Bauplatz) und Planeradresse (ZT, Ingenieurbüro). Bauadresse hat isBuildingAddress=true.
- Maße: Nur einbeziehen, wenn klare Beschriftung erkennbar.
- Strukturhinweise: Nur wenn aus Plan ersichtlich (Schnitt, Detailbild). Sonst confidence niedrig.
- Konfidenz: 0.9+ nur bei klar lesbarem Text. Bei Unschärfe/Vermutung 0.4-0.6.
- Niemals Werte erfinden. Lieber confidence niedrig setzen oder weglassen.

ROOFPARTS-REGELN:
- IMMER mindestens 1 Eintrag (kind="main") für das Hauptdach.
- Wenn im Plan klar mehrere Bauteile/Anbauten erkennbar sind (z.B. unterschiedliche Dachhöhen, abgeknickte Grundrisse, separate Garage, Vordach beim Eingang) → mehrere Einträge anlegen.
- kind-Werte: "main" (Hauptdach), "anbau" (Zubau/Anbau mit eigener Dachfläche), "vordach" (kleines Schutzdach über Eingang), "gaube" (Dachgaube/Dachfenster-Aufbau im Hauptdach), "carport" (Carport/Garage), "andere".
- positionX/Y: Position des Dachteils in Metern relativ zum Mittelpunkt des Hauptdach-Grundrisses. Hauptdach hat immer 0/0.
- ridgeDirection: "x" (First verläuft in Gebäude-Längsrichtung) oder "y" (First quer).
- Konfidenz: 0.9+ wenn klar im Plan ablesbar; 0.5–0.7 wenn vermutet/nicht ganz eindeutig; unter 0.5 wenn unklar.
- Maximal 5 Dachteile (mehr ist meist Über-Interpretation).
- Wenn nur ein Dach erkennbar: nur main eintragen.
- Optional: "notes" Feld für Hinweise zur Erkennung (z.B. "Erkannt aus Grundriss Ostseite, niedriger als Hauptbau").`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { documentId, projectId } = await req.json();
    if (!documentId || !projectId) {
      return new Response(JSON.stringify({ error: 'documentId und projectId erforderlich' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: doc } = await supabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error('Dokument nicht gefunden');

    await supabase.from('documents').update({ status: 'processing' }).eq('id', documentId);

    const { data: fileData } = await supabase.storage.from('plan-documents').download(doc.file_path);
    if (!fileData) throw new Error('Datei-Download fehlgeschlagen');

    const arrayBuffer = await fileData.arrayBuffer();
    // Chunk-encode to avoid stack overflow on large files
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(binary);

    const text = await geminiVision({
      systemPrompt: SYSTEM,
      userPrompt: `Analysiere diesen Einreichplan: ${doc.file_name}. Liefere JSON laut System-Prompt.`,
      fileBase64: base64,
      mimeType: 'application/pdf',
      jsonMode: true,
      maxTokens: 65536,
    });

    const extracted = parseJsonResponse<Record<string, unknown>>(text);

    await supabase.from('documents').update({ status: 'analyzed', extracted_data: extracted }).eq('id', documentId);

    // Audit-Eintrag
    await supabase.from('audit_log').insert({
      project_id: projectId,
      agent: 'Dokumenten-Agent (Gemini)',
      action: `PDF analysiert: ${doc.file_name}`,
      field: 'documents',
      reason: `Konfidenz ${((extracted.overallConfidence as number || 0) * 100).toFixed(0)}%`,
      new_value: `Texte: ${(extracted.texts as unknown[])?.length || 0}, Maße: ${(extracted.dimensions as unknown[])?.length || 0}`,
      user_initiated: false,
    });

    return new Response(JSON.stringify({ success: true, extracted }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('agent-document:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
