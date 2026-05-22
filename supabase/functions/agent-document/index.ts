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
Deine Aufgabe: Extrahiere strukturierte Rohdaten für eine seriöse Zimmerei-Vorbemessung (Holzdachstuhl + Holzbalkendecken).
Antworte AUSSCHLIESSLICH mit validem JSON.

=== JSON-SCHEMA ===
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
      "kind": "main|anbau|vordach|gaube|carport|andere",
      "label": "Hauptdach Süd",
      "form": "satteldach|pultdach|walmdach|krueppelwalmdach|flachdach|mischform",
      "positionX": 0,
      "positionY": 0,
      "length": 21.8,
      "width": 8.0,
      "ridgeHeight": 6.26,
      "eavesHeight": 4.65,
      "pitch": 22,
      "ridgeDirection": "x|y",
      "confidence": 0.9,
      "notes": "optional – Erkennungshinweis"
    }
  ],

  "ceilings": [
    {
      "level": "EG|OG|DG|Spitzboden",
      "span": 5.2,
      "area": 65.0,
      "nutzung": "Wohnen|Lager|Spitzboden|Buero|Sonstiges",
      "confidence": 0.8
    }
  ],

  "openings": [
    {
      "type": "velux|kamin|gaube|sat_durchbruch|sonstiges",
      "width": 0.78,
      "height": 1.4,
      "position": "Süd-Seite, 2.5m von links",
      "confidence": 0.8
    }
  ],

  "stairs": [
    {
      "level": "EG-OG",
      "span_in_ceiling": 1.0,
      "opening_length": 3.5,
      "confidence": 0.7
    }
  ],

  "specialFeatures": [
    {
      "type": "erker|kragarm|loggia|auskragung|sonstiges",
      "description": "Erker Süd-Ost 2m × 2m",
      "loadImpact": "low|medium|high",
      "confidence": 0.7
    }
  ],

  "planQuality": {
    "legibility": "high|medium|low",
    "completeness": "complete|partial|sketch_only",
    "missingViews": ["Schnitt", "Grundriss DG"],
    "warnings": ["Maßstab unleserlich", "Traufhöhe nicht bemaßt"]
  },

  "overallConfidence": 0..1,
  "unreliableAreas": ["..."],
  "assumptions": ["..."]
}

=== ADRESSEN ===
- Unterscheide IMMER: Bauadresse (Bauvorhaben/Bauplatz) → isBuildingAddress=true vs. Planeradresse (ZT, Ingenieurbüro) → false.
- Schreibe die vollständige Adresse so wie im Plan (Straße, Hausnummer, PLZ, Ort).

=== GEOMETRIE & MASSE ===
- Maße nur wenn klare Beschriftung oder Bemaßungslinie erkennbar.
- Spannweite = lichtes Maß zwischen Auflagern (relevant für Holzbalken-Dimensionierung).
- Traufhöhe und Firsthöhe immer vom fertig gestellten Gelände (FGO) oder Rohbau-OK messen – notiere Referenzpunkt in assumptions wenn unklar.
- Dachneigung in Grad (°) – falls nur Prozent angegeben, umrechnen (arctan).

=== DACHTEILE (roofParts) ===
- IMMER mindestens 1 Eintrag kind="main" für das Hauptdach.
- Mehrere Einträge bei erkennbaren Anbauten, Garagen, Gauben, Vordächern.
- positionX/Y: Meter relativ zum Mittelpunkt Hauptdach (Hauptdach = 0/0).
- ridgeDirection: "x" = First in Gebäude-Längsrichtung, "y" = First quer.
- Maximal 6 Dachteile (mehr = Über-Interpretation).
- Konfidenz: 0.9+ klar ablesbar | 0.5–0.7 vermutet | <0.5 unklar.

=== HOLZBALKENDECKEN (ceilings) ===
Suche AKTIV nach Hinweisen auf Holzbalkendecken – auch wenn nicht explizit beschriftet:
- Im Schnitt erkennbar an: Strichelung/Schraffur des Deckenpaketes, sichtbare Balkenlagen, Aufbauhöhen 25–35 cm.
- level: Stockwerk der Decke (EG = Decke über EG, also zwischen EG und OG).
- span: Lichte Spannweite der Balken in Meter (maßgebend für Dimensionierung).
- area: Grundfläche des Deckenfeldes in m² (aus Grundriss).
- nutzung: Nutzlast-Kategorie des darüberliegenden Geschoßes.
- Nur eintragen wenn Holzkonstruktion wahrscheinlich (confidence > 0.4).

=== ÖFFNUNGEN IM DACH (openings) ===
Suche nach: Dachfenster (Velux-Symbol), Kamine/Rauchfänge (Schornsteinausschnitte), Lüftungsöffnungen, Sat-Durchbrüche, Gauben-Öffnungen.
- Auch ohne Maße eintragen (width/height dann weglassen), position so präzise wie möglich.

=== STIEGEN / TREPPENÖFFNUNGEN (stairs) ===
Treppenöffnungen zwingen den Zimmerer zu Deckenauswechslungen (Wechsel + Wechselbalken).
- level: betroffene Decke (z.B. "EG-OG" = Decke zwischen EG und OG).
- span_in_ceiling: Breite der Öffnung quer zu den Balken (m).
- opening_length: Länge der Öffnung in Balkenlaufrichtung (m).

=== SONDERFEATURES (specialFeatures) ===
Suche nach: Erkern, Auskragungen, Kragarmen, Loggien, Terrassen auf Decke, abgehängten Balkonen.
- loadImpact: Abschätzung ob statisch relevante Zusatzlasten entstehen.

=== PLANQUALITÄT (planQuality) ===
Beurteile selbstkritisch:
- legibility: Sind Texte und Maße gut lesbar?
- completeness: Sind alle relevanten Ansichten vorhanden (Grundrisse aller Etagen, Schnitt, Ansichten)?
- missingViews: Liste fehlender Ansichten die für Zimmerei-Vorbemessung wichtig wären.
- warnings: Alles was die Vorbemessung erschwert (kein Maßstab, fehlende Höhenkoten, etc.).

=== ALLGEMEINE REGELN ===
- Niemals Werte erfinden. Lieber confidence niedrig setzen oder Feld weglassen.
- Alle neuen Felder (ceilings, openings, stairs, specialFeatures) sind OPTIONAL – nur befüllen wenn tatsächlich erkennbar.
- Konfidenz 0.9+ nur bei klar lesbarem/eindeutigem Inhalt. Unschärfe/Vermutung: 0.4–0.6.
- Strukturhinweise (structureHints) nur wenn Schnitt oder Detailbild vorhanden.
- planQuality IMMER befüllen.`;


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
