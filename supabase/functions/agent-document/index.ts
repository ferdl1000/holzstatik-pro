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
Deine Aufgabe: Extrahiere ALLE strukturierten Rohdaten in EINEM einzigen JSON-Output für eine seriöse Zimmerei-Vorbemessung (Holzdachstuhl + Holzbalkendecken).
Antworte AUSSCHLIESSLICH mit validem JSON. KEIN erklärender Text, KEINE Markdown-Fences, NUR das JSON-Objekt.
Extrahiere alles auf einmal – KEIN inkrementelles Vorgehen.

=== MEHRSEITIGE PDFs ===
Dieses Dokument kann 1–20 Seiten enthalten. ANALYSIERE JEDE EINZELNE SEITE vollständig.
- Seite 1 enthält oft nur Deckblatt/Beschriftung, die eigentlichen Pläne sind auf Seite 2+.
- Grundrisse, Schnitte und Ansichten sind oft auf verschiedenen Seiten verteilt.
- Kombiniere Informationen aus ALLEN Seiten zu einem einheitlichen JSON.
- Wenn du weniger als alle Seiten analysieren konntest, trage in planQuality.warnings ein: "Nur Seite X von Y analysiert – manuelle Prüfung empfohlen".

=== SCAN-QUALITÄT / FOTO-AUFNAHMEN ===
Häufige Scan-Probleme – trotzdem extrahieren, Konfidenz entsprechend reduzieren:
- Schiefe Aufnahmen (Rotation bis ±15°): gedanklich gerade richten, Maße trotzdem ablesen.
- Schatten, Falten, Reflexionen: betroffene Bereiche in unreliableAreas nennen.
- Handy-Foto eines Plans am Tisch (Perspektivverzerrung): Maßstabsangabe im Plan als Referenz verwenden, in unreliableAreas "Handy-Aufnahme – Perspektivverzerrung möglich" eintragen.
- Niedrige Auflösung / Unschärfe: confidence ≤ 0.5 für betroffene Maße, weiter versuchen.
- planQuality.legibility = "low" wenn mehr als 30% der Texte unleserlich.

=== MASSSTAB & PIXEL-MESSUNG ===
NIEMALS direkte Pixel-Messung verwenden. Maße IMMER von beschrifteten Bemaßungslinien ablesen.
- Maßstabsangaben: 1:50, 1:100, 1:200 kommen vor. Erkenne und notiere in assumptions.
- Wenn Maßstab erkennbar aber kein Bemaßungstext vorhanden → confidence < 0.5, Warnung in planQuality.warnings: "Maße nur aus Maßstab + Pixelmessung – unzuverlässig".

=== MASSEINHEITEN-NORMALISIERUNG ===
Bemaßungen kommen in verschiedenen Einheiten vor. Alle Output-Werte IMMER in Meter (m).
- Wert ≤ 100 ohne Einheit: interpretiere als Meter → direkt übernehmen.
- Wert 101–1000 ohne Einheit: interpretiere als Zentimeter → durch 100 teilen.
- Wert > 1000 ohne Einheit: interpretiere als Millimeter → durch 1000 teilen.
- Wenn Einheit explizit angegeben: diese verwenden, oben genannte Heuristik ignorieren.
- Umgerechnete Werte in assumptions dokumentieren: z.B. "850 cm → 8.50 m".

=== MEHRSPRACHIGE BESCHRIFTUNGEN ===
Österreichische Grenzgebiete haben oft mehrsprachige Pläne. Erkenne folgende Entsprechungen:
- Dachneigung: "Roof pitch" (EN), "Pendenza tetto" (IT), "Naklon strehe" (SL).
- Firsthöhe: "Ridge height" (EN), "Altezza colmo" (IT), "Višina slemena" (SL).
- Traufhöhe: "Eaves height" (EN), "Altezza gronda" (IT), "Višina kapi" (SL).
- Spannweite: "Span" (EN), "Luce" (IT), "Razpon" (SL).
- Behandle alle Sprachen gleichwertig – extrahiere den Wert, label auf Deutsch.

=== HANDSKIZZEN & BLEISTIFT-PLÄNE ===
- Handgezeichnete Pläne und Bleistift-Skizzen akzeptieren wenn irgendwelche Maße erkennbar sind.
- Wenn Maße erkennbar: confidence 0.4–0.6, planQuality.legibility = "low".
- Wenn KEINE Maße erkennbar, nur Geometrie als Skizze: planQuality.completeness = "sketch_only", alle Maß-Felder weglassen oder confidence < 0.3.
- Auch bei Handskizzen: roofParts mit erkannter Form eintragen.

=== BAUPHASEN: BESTAND + ZUBAU ===
Wenn ein Plan sowohl Bestand als auch Zubau/Erweiterung zeigt:
- Trenne Dachteile nach Bauphase: kind="main" für Bestandsdach, kind="anbau" für Zubau.
- Hinweise auf Bestand: "Bestand", "bestehend", "vorhanden", gestrichelte Linien für Abbruch.
- Hinweise auf Zubau: "Zubau", "Neubau", "geplant", Neubau-Schraffur.
- Wenn unklar: in assumptions vermerken.

=== ORIENTIERUNG ===
- Nicht auf Norden-Pfeil verlassen für Maße oder Struktur.
- Einfach extrahieren was beschriftet ist (Süd-Ansicht, Ost-Ansicht, etc.).
- ridgeDirection nur aus expliziter Beschriftung oder eindeutiger Geometrie ableiten, sonst "unbekannt".

=== GEOMETRISCH UNVOLLSTÄNDIGE PLÄNE ===
Wenn Dachneigung NICHT angegeben aber First- und Traufhöhe + Dachbreite vorhanden:
- Berechne: Neigung = arctan((Firsthöhe - Traufhöhe) / (Dachbreite / 2)) in Grad.
- Eintragen in dimensions[] als label="Dachneigung_berechnet", confidence < 0.8.
- In assumptions dokumentieren: "Dachneigung berechnet aus First-/Traufhöhe und Dachbreite".

=== FEHLENDE SCHNITTE ===
Wenn nur Grundriss vorhanden, kein Schnitt:
- planQuality.missingViews muss "Schnitt" enthalten.
- structureHints.confidence maximal 0.4.
- planQuality.warnings: "Kein Schnitt vorhanden – Konstruktionstyp und Höhen unsicher".

=== ALTE PLÄNE (vor 1995) ===
- Handgeschriebene Beschriftungen, ältere Symbolik akzeptieren.
- confidence entsprechend reduzieren, in assumptions vermerken wenn Plan erkennbar alt ist.

=== BEMASSKUNGSKETTEN ===
Wenn mehrere Maße in einer Linie stehen (z.B. 3.50 + 4.20 + 2.80 = 10.50):
- Gesamtmaß → dimensions[] (z.B. label="Gebäudelänge").
- Einzelmaße → spans[] mit fortlaufenden Labels (L1, L2, L3 ...) und jeweiliger confidence.
- Wenn Summe im Plan angegeben: Plausibilitätsprüfung (Einzelmaße + Summe müssen passen).

=== VORHANDENE STATISCHE VORBEMESSUNG ===
Wenn im Plan bereits Bauteilangaben eingetragen sind (z.B. "Sparren 8/16 e=80cm", "IPE 200", "BSH 12/24"):
- Eintragen in structureHints.existingDimensioning als String-Array.
- Auch Hinweise auf Statik-Beilage oder Statiker eintragen.

=== MATERIAL-HINWEISE ===
Erkenne Holz- und Bauteilbezeichnungen und trage in structureHints.materialHints[] ein:
- KVH (Konstruktionsvollholz), BSH (Brettschichtholz / Leimbinder), BFU (Baufurniersperrholz).
- Vollholz, Schnittholz, Nadelholz.
- Stahlträger (IPE, HEA, HEB, RHS), Beton wenn im Dachbereich.

=== SONDERFORMEN DES DACHES ===
Erkenne auch ungewöhnliche Dachformen:
- Sheddach (Sägezahndach) → form="sheddach".
- Tonnendach / Bogendach → form="tonnendach".
- Mansardendach → form="mansardendach".
- Zollinger-Dach → form="sonderfall", notes="Zollinger-Dach".
- Wenn keine passende Kategorie: form="sonderfall", notes mit konkreter Beschreibung.

=== JSON-SCHEMA ===
{
  "texts": [{ "content": "...", "category": "address|dimension|label|note|title|other", "confidence": 0.0..1.0 }],
  "dimensions": [{ "value": 12.5, "unit": "m", "label": "Gebäudelänge|Gebäudebreite|Firsthöhe|Traufhöhe|Dachneigung|Dachneigung_berechnet|Spannweite", "confidence": 0..1 }],
  "addresses": [{ "fullAddress": "...", "context": "z.B. 'Bauvorhaben'", "isBuildingAddress": true|false, "confidence": 0..1, "excludeReason": "z.B. Planerbüro" }],
  "roofHints": { "form": "satteldach|pultdach|walmdach|krueppelwalmdach|flachdach|mischform|sheddach|tonnendach|mansardendach|sonderfall", "pitch": 35, "confidence": 0..1, "ridgeDirection": "Nord-Süd|Ost-West|unbekannt" },
  "structureHints": {
    "type": "sparrendach|kehlbalkendach|pfettendach|leimbinder_haupttraeger|sonderfall",
    "reasoning": "...",
    "confidence": 0..1,
    "visibleMembers": ["sparren","mittelpfette","stuetze","leimbinder"],
    "existingDimensioning": ["Sparren 8/16 cm e=80 cm"],
    "materialHints": ["KVH Sparren", "BSH Mittelpfette"]
  },
  "spans": [{ "label": "L1", "length": 6.5, "confidence": 0..1 }],

  "roofParts": [
    {
      "id": "main",
      "kind": "main|anbau|vordach|gaube|carport|andere",
      "label": "Hauptdach Süd",
      "form": "satteldach|pultdach|walmdach|krueppelwalmdach|flachdach|mischform|sheddach|tonnendach|mansardendach|sonderfall",
      "positionX": 0,
      "positionY": 0,
      "length": 21.8,
      "width": 8.0,
      "ridgeHeight": 6.26,
      "eavesHeight": 4.65,
      "pitch": 22,
      "ridgeDirection": "x|y",
      "confidence": 0.9,
      "notes": "optional – Erkennungshinweis, Bauphase, Sonderform"
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
- Bei Bestand+Zubau: kind="main" für Bestand, kind="anbau" für Zubau.
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
- completeness: Sind alle relevanten Ansichten vorhanden (Grundrisse aller Etagen, Schnitt, Ansichten)? "sketch_only" wenn nur Handskizze ohne Maße.
- missingViews: Liste fehlender Ansichten die für Zimmerei-Vorbemessung wichtig wären.
- warnings: Alles was die Vorbemessung erschwert. PFLICHT-Warnung wenn overallConfidence < 0.5: "Konfidenz unter 50% – manuelle Prüfung der Vorbemessung erforderlich".

=== ALLGEMEINE REGELN ===
- Niemals Werte erfinden. Lieber confidence niedrig setzen oder Feld weglassen.
- Alle neuen Felder (ceilings, openings, stairs, specialFeatures) sind OPTIONAL – nur befüllen wenn tatsächlich erkennbar.
- Konfidenz 0.9+ nur bei klar lesbarem/eindeutigem Inhalt. Unschärfe/Vermutung: 0.4–0.6.
- Strukturhinweise (structureHints) nur wenn Schnitt oder Detailbild vorhanden – sonst structureHints.confidence ≤ 0.4.
- planQuality IMMER befüllen.
- overallConfidence < 0.5 → planQuality.warnings MUSS Hinweis auf manuelle Prüfung enthalten.`;


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { documentId, projectId, retryWith, focusOnMissing } = await req.json();
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

    // focusOnMissing: schärferer Prompt für Second-Pass
    const userPrompt = focusOnMissing
      ? `Analysiere diesen Einreichplan NOCHMALS SEHR SORGFÄLTIG: ${doc.file_name}.\nACHTE BESONDERS AUF: Dachneigung (°), Gebäudegeometrie (Länge/Breite/Firsthöhe/Traufhöhe), Schnittdarstellungen, Bemaßungslinien.\nLiefere JSON laut System-Prompt.`
      : `Analysiere diesen Einreichplan: ${doc.file_name}. Liefere JSON laut System-Prompt.`;

    const text = await geminiVision({
      systemPrompt: SYSTEM,
      userPrompt,
      fileBase64: base64,
      mimeType: 'application/pdf',
      jsonMode: true,
      maxTokens: 65536,
      // retryWith übergibt ein Modell-Override (z.B. 'gemini-2.5-flash'), sonst undefined → Fallback-Kaskade
      ...(retryWith ? { model: retryWith as 'gemini-2.5-flash' } : {}),
    });

    const extracted = parseJsonResponse<Record<string, unknown>>(text);

    await supabase.from('documents').update({ status: 'analyzed', extracted_data: extracted }).eq('id', documentId);

    // Audit-Eintrag
    await supabase.from('audit_log').insert({
      project_id: projectId,
      agent: retryWith ? `Dokumenten-Agent (${retryWith}, Second-Pass)` : 'Dokumenten-Agent (Gemini)',
      action: `PDF analysiert: ${doc.file_name}${focusOnMissing ? ' [fokussierter Pass]' : ''}`,
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
