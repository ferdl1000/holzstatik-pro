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
 * MULTI-STAGE: 3 gezielte Gemini-Calls für höhere Zuverlässigkeit:
 *   Stage 1 — Inventur (was ist im Plan?)
 *   Stage 2 — Details (Geometrie + Material)
 *   Stage 3 — Validation (Plausibilitätsprüfung + Korrekturen)
 *
 * Verwendet: Gemini 2.5 Flash (Vision, PDF-fähig)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { geminiVision, parseJsonResponse, CORS_HEADERS } from '../_shared/gemini.ts';
import { parseAllFacts, ParsedFacts } from '../_shared/textParser.ts';

// ============================================================
// STAGE 1 — INVENTUR
// ============================================================
const STAGE1_PROMPT = `Du analysierst einen österreichischen Einreichplan (Holzbau/Gewerbebau).
Antworte AUSSCHLIESSLICH mit validem JSON. KEIN erklärender Text, KEINE Markdown-Fences, NUR das JSON-Objekt.

AUFGABE: Erstelle eine schnelle Inventur aller relevanten Elemente im Plan.

=== DACHNEIGUNG — HÖCHSTE PRIORITÄT ===
Suche auf JEDER Seite nach "DN X°" Beschriftungen (österreichische Norm für Dachneigung).
- DN steht für "Dachneigung" und ist IMMER gefolgt von einer Zahl und dem Gradzeichen °
- Beispiele: "DN 10°", "DN 22°", "DN 35°", "DN 8°"
- Diese Beschriftungen stehen typischerweise: im Schnitt (Querschnitt, Längsschnitt), neben Dachflächen, auf Dachlinien
- Bei Pultdächern steht DN NUR EINMAL pro Dachfläche
- Bei Satteldächern steht DN auf BEIDEN Seiten (oft gleicher Wert)
- WICHTIG: Selbst wenn du keine "DN"-Abkürzung siehst, suche nach kleinen Zahlen mit "°" neben Dachlinien!
- Wenn du z.B. "10°" oder "10 Grad" siehst ohne DN-Präfix → trotzdem als DN-Marker aufnehmen!

SUCHE EXPLIZIT NACH:
- "DN X°" Beschriftungen (Dachneigung) — diese stehen oft 5–10× im Schnitt!
- "ÜBERDACHUNG", "Vordach", "Tordach", "Carport" Texte (= separate Dachteile)
- "Holzboden X m²", "Holzbalkendecke" Texte (= Holzbalkendecken)
- "Aufbauten" oder "Bauteilbeschreibungen" Legende mit Code + Schichten (B1, B2, D1, D2, W1 ODER reine Ziffern 06, 09, 11 etc.)
- Maße neben Dachteilen (Firsthöhe, Traufhöhe, Spannweite)
- Adresstexte (Bauvorhaben, Bauplatz, Planerbüro)

Antworte JSON:
{
  "roofParts_inventory": [
    { "label": "Hauptdach Stallgebäude", "form": "pultdach|satteldach|walmdach|krueppelwalmdach|flachdach|mischform|sheddach|tonnendach|mansardendach|sonderfall",
      "position_hint": "zentral|Süd|Ost|Nord|West|...", "approx_size_m2": 200 }
  ],
  "aufbauten_legende": [
    { "code": "D1", "name": "Dachaufbau Stall",
      "schichten": ["BSH/KVH Tragkonstruktion", "2.4 cm Bretterschalung",
                    "regensicheres Unterdach", "5/8 cm Staffellage", "14 cm Trapezblech"] },
    { "code": "06", "name": "Dachkonstruktion",
      "schichten": ["Sparenlage lt. Statik", "Vollschalung", "diff. offene Schalungsbahn",
                    "Konterlattung", "Lattung", "Dacheindeckung"] }
  ],
  "dn_marker": [
    { "value": 10, "unit": "°", "near_roofpart": "Hauptdach", "evidence": "DN 10° in Schnitt A-A" }
  ],
  "höhen_marker": [
    { "value": 6.265, "label": "Firsthöhe", "section": "Schnitt A-A", "ref": "GOK" }
  ],
  "ueberdachung_count": 2,
  "ueberdachung_details": [
    { "label": "ÜBERDACHUNG Eingang", "approx_width_m": 3, "approx_depth_m": 2 }
  ],
  "ceiling_indicators": [
    { "label": "180.50 m² Holzboden LAGER", "level": "OG", "area": 180.5 }
  ],
  "address_hints": [
    { "text": "Musterstraße 1, 8230 Hartberg", "context": "Bauvorhaben" }
  ],
  "plan_pages": 0,
  "has_schnitt": true,
  "has_grundriss": true,
  "has_ansicht": true
}`;

// ============================================================
// STAGE 2 — DETAILS
// ============================================================
const STAGE2_PROMPT = `Du analysierst einen österreichischen Einreichplan (Holzbau/Gewerbebau).
Antworte AUSSCHLIESSLICH mit validem JSON. KEIN erklärender Text, KEINE Markdown-Fences, NUR das JSON-Objekt.

Du erhältst im User-Prompt eine Stage-1-Inventur. Nutze diese als Kontext und ergänze alle Details.

=== AUFBAUTEN-CODES: können sein ===
1. Buchstabe + Ziffer (B1, B2, D1, W1, F1 — typisch ZT/Architekt mit Schema)
2. Nur Ziffer (01, 06, 09, 11 — typisch durchnummeriert wie Lebenbauer-Plan)
3. Code + Name in einer Zeile (z.B. "06 Dachkonstruktion")
NACH dem Code folgt der NAME des Aufbau-Bereichs (z.B. "Dachaufbau" oder "Dachkonstruktion").
DARUNTER kommen die Schichten VON UNTEN/INNEN nach OBEN/AUSSEN.
IMMER den name aus der Legende in "name" übernehmen.

=== AUFBAUTEN-MAPPING auf coveringType.type ===
- "Tonziegel"/"Ziegel"/"Dachziegel"/"Falzziegel" → tile_clay
- "Scharren Ziegel"/"Scharren ... Ziegel" → tile_clay  (Zimmerei-Ausdruck: "2 Scharren 38er Ziegel" = Tondachziegel-Eindeckung)
- "Betonstein"/"Betondachstein"/"Frankfurt" → tile_concrete
- "Trapezblech"/"Trapez" → trapezblech  (z.B. "14 cm Trapezblech")
- "Stehfalz"/"Falz"/"Doppelstehfalz" → metal_falz
- "Schiefer"/"Naturschiefer" → schiefer
- "Sandwich"/"Sandwichpaneel"/"Dachpaneel" → sandwich_paneel
- "Bitumen"/"Schweißbahn"/"Bitumen-Schweißbahn"/"Abdichtung" → bitumen
- "Gründach extensiv" → gruendach_ext
- "Gründach intensiv" → gruendach_int
- Generisches "Dacheindeckung" ohne weitere Angabe → unbekannt (suche in anderen Schichten nach Hinweisen)

=== DACHNEIGUNG — PFLICHT ===
VERWENDE den pitch-Wert AUS stage1.dn_marker — NICHT erfinden, NICHT berechnen wenn DN X° angegeben!
Wenn mehrere dn_marker mit unterschiedlichen Werten → liefere mehrere roofParts mit eigenen pitch-Werten.
Nur wenn KEIN dn_marker vorhanden: berechne aus Höhen.

=== VORDÄCHER — PFLICHT ===
Pro stage1.ueberdachung_count ein roofPart kind='vordach'.
Nutze stage1.ueberdachung_details für Label + Geometrie.

=== HOLZBALKENDECKEN — PFLICHT ===
Pro stage1.ceiling_indicators ein ceilings-Eintrag.

=== DECKEN- UND WAND-KONSTRUKTIONSTYP ===

Bei JEDER erkannten Decke (ceilings[]) liefere den Konstruktionstyp (constructionType):
- "STB-Decke" / "Stahlbetondecke" / "Massivdecke" / "Filigrandecke" / "Betondecke" → constructionType="stb_decke"
- "Holzbalkendecke" / "Holzboden" + Holzbalken im Schnitt sichtbar → constructionType="holzbalkendecke"
- "Rippendecke" / "Hourdis-Decke" / "Ziegelhohldecke" → constructionType="rippendecke"
- Unklar / nicht eindeutig → constructionType="unbekannt"

WICHTIG: NUR ceilings mit constructionType="holzbalkendecke" werden im Holzauszug als Deckenbalken berechnet.
STB-Decken sind KEINE Holz-Bauteile — sie werden vom Statiker für Beton separat berechnet.

Wand-Konstruktionstypen pro Geschoss in wallConstructions[]:
- "STB-Wand" / "Stahlbetonwand" / "25 cm STB" → type="stb", thickness_mm=250
- "38er Ziegel" / "Ziegelmauerwerk 38" / "Hohlziegel 38" → type="ziegel", thickness_mm=380
- "25er Ziegel" / "Hohlziegel 25" → type="ziegel", thickness_mm=250
- "BSH/KVH Wandkonstruktion" / "Holzständerwand" / "Holzbau" → type="holzstaender"
- Gemischt (STB + Holz kombiniert) → type="mischbau"
- Unklar → type="unbekannt"

Liefere pro erkennbarem Geschoss einen wallConstructions[]-Eintrag.

=== MASSEINHEITEN ===
Alle Ausgabewerte in Meter (m).
- Wert ≤ 100 ohne Einheit: interpretiere als Meter
- Wert 101–1000 ohne Einheit: Zentimeter → durch 100 teilen
- Wert > 1000 ohne Einheit: Millimeter → durch 1000 teilen

=== MEHRSEITIGE PDFs ===
Analysiere JEDE Seite. Grundrisse, Schnitte, Ansichten oft auf verschiedenen Seiten.
Bevorzuge Höhenwerte aus SCHNITT, Grundrissmaße aus GRUNDRISS.

=== JSON-SCHEMA ===
{
  "texts": [{ "content": "...", "category": "address|dimension|label|note|title|other", "confidence": 0.0..1.0 }],
  "dimensions": [{ "value": 12.5, "unit": "m", "label": "Gebäudelänge|Gebäudebreite|Firsthöhe|Traufhöhe|Dachneigung|Dachneigung_berechnet|Spannweite", "confidence": 0..1 }],
  "addresses": [{ "fullAddress": "...", "context": "z.B. 'Bauvorhaben'", "isBuildingAddress": true, "confidence": 0..1, "excludeReason": "" }],
  "roofHints": { "form": "satteldach|pultdach|walmdach|krueppelwalmdach|flachdach|mischform|sheddach|tonnendach|mansardendach|sonderfall", "pitch": 35, "confidence": 0..1, "ridgeDirection": "Nord-Süd|Ost-West|unbekannt" },
  "covering": {
    "type": "tile_clay|tile_concrete|metal_falz|trapezblech|schiefer|sandwich_paneel|gruendach_ext|gruendach_int|pv|bitumen|sonstiges|unbekannt",
    "weight_kN_m2": 0.55,
    "evidence": "z.B. 'Trapezblech laut Aufbau D1 letzte Schicht'",
    "confidence": 0.0
  },
  "structureHints": {
    "type": "sparrendach|kehlbalkendach|pfettendach|leimbinder_haupttraeger|sonderfall",
    "reasoning": "...",
    "confidence": 0..1,
    "visibleMembers": ["sparren","mittelpfette","stuetze","leimbinder"],
    "existingDimensioning": [],
    "materialHints": []
  },
  "spans": [{ "label": "L1", "length": 6.5, "confidence": 0..1 }],
  "dn_markers": [
    { "value": 10, "unit": "°", "evidence": "DN 10° in Schnitt A-A", "confidence": 0.95, "near_roofpart_index": 0 }
  ],
  "roofParts": [
    {
      "id": "main",
      "kind": "main|anbau|vordach|gaube|carport|andere",
      "label": "Hauptdach",
      "form": "satteldach|pultdach|walmdach|krueppelwalmdach|flachdach|mischform|sheddach|tonnendach|mansardendach|sonderfall",
      "positionX": 0,
      "positionY": 0,
      "length": 21.8,
      "width": 8.0,
      "ridgeHeight": 6.26,
      "eavesHeight": 4.65,
      "pitch": 10,
      "ridgeDirection": "x|y",
      "confidence": 0.9,
      "notes": "",
      "assumptions": ["Pitch aus stage1.dn_marker DN 10°", "Maße aus Schnitt A-A"]
    }
  ],
  "ceilings": [
    {
      "level": "EG|OG|DG|Spitzboden",
      "span": 5.2,
      "area": 65.0,
      "nutzung": "Wohnen|Lager|Spitzboden|Buero|Sonstiges",
      "constructionType": "holzbalkendecke|stb_decke|rippendecke|unbekannt",
      "evidence": "z.B. 'STB-Decke laut Aufbau 09' oder 'Holzboden 180.50 m² LAGER'",
      "confidence": 0.8
    }
  ],
  "wallConstructions": [
    {
      "level": "KG|EG|OG|DG",
      "type": "stb|ziegel|holzstaender|kvh|bsh|mischbau|unbekannt",
      "thickness_mm": 250,
      "material": "z.B. 'STB-Wand', 'Ziegel 38', 'BSH/KVH'",
      "evidence": "z.B. '25 cm STB-Wand laut Aufbau' oder '2 Scharren 38er Ziegel'",
      "confidence": 0.85
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
    "missingViews": [],
    "warnings": []
  },
  "overallConfidence": 0.8,
  "unreliableAreas": [],
  "assumptions": []
}`;

// ============================================================
// STAGE 3 — VALIDATION
// ============================================================
const STAGE3_PROMPT = `Du analysierst einen österreichischen Einreichplan (Holzbau/Gewerbebau).
Antworte AUSSCHLIESSLICH mit validem JSON. KEIN erklärender Text, KEINE Markdown-Fences, NUR das JSON-Objekt.

Du erhältst im User-Prompt das Stage-2-Ergebnis. Prüfe es gegen den Plan und korrigiere Fehler.

=== VALIDIERUNGS-CHECKLISTE ===

1. DACHTEILE VOLLSTÄNDIG?
   - Zähle alle sichtbaren Dachteile im Plan (Haupt + Anbauten + Vordächer).
   - Jedes "ÜBERDACHUNG"/"Vordach"/"Tordach" im Plan → ein roofPart kind='vordach'? Wenn nein: HINZUFÜGEN.
   - Stimmt roofParts.length mit sichtbaren Dächern überein?

2. DACHNEIGUNG KORREKT?
   - Suche ALLE "DN X°" Beschriftungen im Plan.
   - Stimmt pitch jedes roofPart mit der zugehörigen DN-Beschriftung überein?
   - Wenn nicht: KORRIGIEREN (z.B. DN 10° → pitch: 10, NICHT 22°).

3. EINDECKUNGS-MATERIAL KORREKT?
   - Lies die Aufbauten-Legende (D1, D2, B1, B2...) im Plan.
   - Welches Material ist die LETZTE (äußerste) Schicht?
   - Stimmt covering.type damit überein? Wenn nicht: KORRIGIEREN.
   - Trapezblech ist häufig bei Stall/Gewerbe — nicht automatisch Ziegel annehmen!

4. HOLZBALKENDECKEN VOLLSTÄNDIG?
   - Suche alle "Holzboden X m²"/"Holzbalkendecke" Texte im Plan.
   - Alle in ceilings[] eingetragen? Wenn nicht: HINZUFÜGEN.

5. HÖHEN PLAUSIBEL?
   - Sind ridgeHeight und eavesHeight konsistent mit Schnitt-Bemaßungen?
   - Differenz ridgeHeight − eavesHeight ergibt bei pitch und width plausiblen Wert?

6. CONFIDENCE ANPASSEN?
   - Wenn du Korrekturen gemacht hast → overallConfidence ggf. anpassen.
   - Korrigierte Werte: confidence auf max. 0.85 (war offensichtlich falsch).

Liefere KORRIGIERTES JSON (gleiche Struktur wie Stage 2 — vollständiges JSON, nicht nur Deltas).
Bei JEDER Korrektur: in assumptions[]-Array eintragen "Stage 3 Korrektur: <was wurde geändert und warum>".
Wenn keine Korrekturen nötig: assumptions[] behält bestehende Einträge, kein neuer "Stage 3" Eintrag.`;

// ============================================================
// PASS 0 — OCR (reiner Text-Extrakt, kein JSON)
// ============================================================
const OCR_PROMPT = `Du bist ein OCR-System. Gib ALLEN sichtbaren Text aus diesem Plan zurück.
KEINE Interpretation, KEINE Struktur — nur den ROHEN TEXT, Zeile für Zeile, so vollständig wie möglich.
Lies ALLE Beschriftungen, Maße, Legenden, Tabellen, Schriftfelder.
Wichtig: Erfasse besonders sorgfältig:
- Alle "DN X°" und "Dachneigung X°" Angaben
- Alle Aufbauten-Legenden (B1, D1, 06, etc. mit ihren Schichten)
- Alle "ÜBERDACHUNG", "Vordach", "VORDACHKANTE" Texte
- Alle Maße mit Einheit
- Adressen + PLZ
Gib NUR den Text zurück, kein JSON, keine Erklärung.`;

// ============================================================
// applyHardFacts — erzwingt deterministisch extrahierte Werte
// ============================================================
function applyHardFacts(extracted: Record<string, unknown>, facts: ParsedFacts): Record<string, unknown> {
  // 1) DN-Marker erzwingen
  if (facts.dnMarkers.length > 0 && Array.isArray(extracted.roofParts)) {
    const primary = facts.dnMarkers[0].value;
    const parts = extracted.roofParts as Array<Record<string, unknown>>;
    parts.forEach((rp, i) => {
      const newPitch = facts.dnMarkers[i]?.value ?? primary;
      const oldPitch = rp.pitch as number | undefined;
      rp.pitch = newPitch;
      // Dachform-Heuristik
      if (newPitch <= 5) {
        rp.form = 'flachdach';
      } else if (newPitch < 12 && rp.form === 'satteldach') {
        rp.form = 'pultdach';
      }
      if (oldPitch !== undefined && Math.abs(oldPitch - newPitch) > 2) {
        extracted.assumptions = extracted.assumptions ?? [];
        (extracted.assumptions as string[]).push(
          `HardFacts-Override roofPart[${i}]: pitch ${oldPitch}° → ${newPitch}° (aus TextParser DN-Marker "${facts.dnMarkers[i]?.raw ?? facts.dnMarkers[0].raw}")`
        );
      }
    });
    // Auch dimensions[Dachneigung] synchronisieren
    if (Array.isArray(extracted.dimensions)) {
      const dims = extracted.dimensions as Array<Record<string, unknown>>;
      const existing = dims.find(d => d.label === 'Dachneigung');
      if (existing) {
        existing.value = primary;
        existing._source = 'TextParser';
      } else {
        dims.push({ label: 'Dachneigung', value: primary, unit: '°', confidence: 0.98, _source: 'TextParser' });
      }
    }
  }

  // 2) Eindeckung erzwingen (nur wenn KI unsicher oder leer)
  if (facts.coveringHints.length > 0) {
    const current = extracted.covering as Record<string, unknown> | undefined;
    const currentConf = (current?.confidence as number | undefined) ?? 0;
    if (!current || currentConf < 0.9) {
      extracted.covering = {
        type: facts.coveringHints[0].type,
        weight_kN_m2: 0.55,
        evidence: `Aus TextParser: ${facts.coveringHints[0].raw}`,
        confidence: 0.95,
      };
      extracted.assumptions = extracted.assumptions ?? [];
      (extracted.assumptions as string[]).push(
        `HardFacts-Override covering: ${facts.coveringHints[0].type} (KI-Konfidenz war ${currentConf.toFixed(2)})`
      );
    }
  }

  return extracted;
}

// ============================================================
// SINGLE-STAGE FALLBACK (großer Prompt — bewährt)
// ============================================================
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

=== AUFBAUTEN / EINDECKUNG ===
Suche AKTIV nach Hinweisen auf Eindeckungstyp:
- LEGENDE / Aufbauten-Liste (z.B. "B1: Ziegel ... B2: ..." ODER reine Ziffern "06 Dachkonstruktion")
- Beschriftung am Plan ("Tondachziegel", "Stehfalz", "Trapezblech", "Sandwichpaneel")
- Im Schnitt sichtbarer Aufbau (Ziegel = wellig, Blech = gerade Linien, Sandwich = dicke einheitliche Schicht)
- Bei Industriebauten/Hallen: meist Trapezblech oder Sandwich
- Bei Wohnbau (Satteldach/Walm): meist Ziegel

AUFBAUTEN-CODES: können sein:
1. Buchstabe + Ziffer (B1, B2, D1, W1, F1 — typisch ZT/Architekt mit Schema)
2. Nur Ziffer (01, 06, 09, 11 — typisch durchnummeriert wie Lebenbauer-Plan)
3. Code + Name in einer Zeile (z.B. "06 Dachkonstruktion")
NACH dem Code folgt der NAME des Aufbau-Bereichs. IMMER in "name" übernehmen.

AUFBAUTEN-MAPPING auf coveringType.type:
- "Tonziegel"/"Ziegel"/"Dachziegel" → tile_clay
- "Scharren Ziegel"/"Scharren ... Ziegel" → tile_clay  ("2 Scharren 38er Ziegel" = Tondachziegel-Eindeckung, Zimmerei-Ausdruck)
- "Betonstein"/"Frankfurt" → tile_concrete
- "Trapezblech"/"Trapez" → trapezblech
- "Stehfalz"/"Falz"/"Doppelstehfalz" → metal_falz
- "Schiefer"/"Naturschiefer" → schiefer
- "Sandwich"/"Sandwichpaneel"/"Dachpaneel" → sandwich_paneel
- "Bitumen"/"Schweißbahn"/"Bitumen-Schweißbahn" → bitumen
- "Gründach extensiv" → gruendach_ext
- "Gründach intensiv" → gruendach_int
- Generisches "Dacheindeckung" ohne weitere Angabe → unbekannt

WENN UNKLAR: covering.type='unbekannt', confidence niedrig setzen, weight_kN_m2=0.55 als Default.

=== DACHNEIGUNG ERKENNEN (DN-Symbol) — KRITISCH ===
In österreichischen Plänen: "DN X°" = Dachneigung X Grad. Steht oft 5–10× im Plan (Schnitt, Lageplan, neben Dachflächen).
SUCHE AKTIV nach "DN X°" Beschriftungen im Plan!
VERWENDE den abgelesenen DN-Wert direkt als pitch — NIEMALS aus Höhen berechnen wenn DN angegeben!
Wenn mehrere DN-Werte für verschiedene Dachteile → NICHT mitteln, sondern pro roofPart eigenen pitch setzen.
Wenn DN 10° aber rechnerisch 22°: DN-Wert nehmen, Abweichung in unreliableAreas notieren.

Liefere auch "dn_markers" im JSON:
"dn_markers": [
  { "value": 10, "unit": "°", "evidence": "DN 10° in Schnitt A-A", "confidence": 0.95, "near_roofpart_index": 0 }
]

Wenn KEIN DN vorhanden: berechne aus Höhen und label="Dachneigung_berechnet".

=== VORDÄCHER — KRITISCH ===
SUCHE AKTIV nach "ÜBERDACHUNG", "Vordach", "Tordach", "Carport" Texten.
Jeder gefundene Text → eigener roofPart kind='vordach'.

=== BRANDSCHUTZ-KLASSE & GEBÄUDEKLASSE ===

Liefere neue Felder, wenn im Plan erkennbar:

"fireProtection": {
  "buildingClass": "GK1|GK2|GK3|GK4|GK5",
  "buildingClassReason": "Wohnhaus 2-geschossig <400m² BGF → GK2 nach OIB",
  "fireResistanceClasses": [
    { "code": "REI 30", "applies_to": "Trennwand WC", "evidence": "REI 30 in Beschriftung neben Tür" }
  ],
  "confidence": 0..1
}

SUCHE IM PLAN nach:
- "GK1" / "GK2" / "GK3" / "GK4" / "GK5" (Gebäudeklasse) — oft im Schriftfeld Brandschutz
- "REI X" / "R X" / "EI X" / "EI X-C" / "RM" — Brandwiderstandsklassen
- "Brandwiderstand 30/60/90 min" — alternative Schreibweise
- "Brandhemmend" (30), "Hochbrandhemmend" (60), "Brandbeständig" (90), "Hochbrandbeständig" (180)

WENN GK nicht explizit angegeben aber Gebäude-Daten ableitbar:
- 1-3 Geschosse + Fluchtniveau ≤ 7m + ≤400m² BGF → GK2
- 1-3 Geschosse + Fluchtniveau ≤ 7m + Wohnnutzung + ≤800m² → GK2 (freistehend)
- mehr Geschosse → höhere GK
Eintragen mit confidence < 0.5 + assumption "GK aus Gebäude-Daten abgeleitet".

=== JSON-SCHEMA ===
{
  "texts": [{ "content": "...", "category": "address|dimension|label|note|title|other", "confidence": 0.0..1.0 }],
  "dimensions": [{ "value": 12.5, "unit": "m", "label": "Gebäudelänge|Gebäudebreite|Firsthöhe|Traufhöhe|Dachneigung|Dachneigung_berechnet|Spannweite", "confidence": 0..1 }],
  "addresses": [{ "fullAddress": "...", "context": "z.B. 'Bauvorhaben'", "isBuildingAddress": true, "confidence": 0..1, "excludeReason": "" }],
  "roofHints": { "form": "satteldach|pultdach|walmdach|krueppelwalmdach|flachdach|mischform|sheddach|tonnendach|mansardendach|sonderfall", "pitch": 35, "confidence": 0..1, "ridgeDirection": "Nord-Süd|Ost-West|unbekannt" },
  "covering": {
    "type": "tile_clay|tile_concrete|metal_falz|trapezblech|schiefer|sandwich_paneel|gruendach_ext|gruendach_int|pv|bitumen|sonstiges|unbekannt",
    "weight_kN_m2": 0.55,
    "evidence": "z.B. 'Tondachziegel laut Legende B2' oder 'Stehfalzblech laut Beschriftung Schnitt'",
    "confidence": 0.0
  },
  "structureHints": {
    "type": "sparrendach|kehlbalkendach|pfettendach|leimbinder_haupttraeger|sonderfall",
    "reasoning": "...",
    "confidence": 0..1,
    "visibleMembers": ["sparren","mittelpfette","stuetze","leimbinder"],
    "existingDimensioning": [],
    "materialHints": []
  },
  "spans": [{ "label": "L1", "length": 6.5, "confidence": 0..1 }],
  "dn_markers": [
    { "value": 10, "unit": "°", "evidence": "DN 10° in Schnitt A-A, Position Hauptdach", "confidence": 0.95, "near_roofpart_index": 0 }
  ],
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
      "pitch": 10,
      "ridgeDirection": "x|y",
      "confidence": 0.9,
      "notes": "optional",
      "assumptions": ["Maße aus Schnitt Seite 2", "Neigung aus DN 10° im Plan"]
    }
  ],
  "ceilings": [
    {
      "level": "EG|OG|DG|Spitzboden",
      "span": 5.2,
      "area": 65.0,
      "nutzung": "Wohnen|Lager|Spitzboden|Buero|Sonstiges",
      "constructionType": "holzbalkendecke|stb_decke|rippendecke|unbekannt",
      "evidence": "z.B. 'STB-Decke laut Aufbau 09' oder 'Holzboden 180.50 m² LAGER'",
      "confidence": 0.8
    }
  ],
  "wallConstructions": [
    {
      "level": "KG|EG|OG|DG",
      "type": "stb|ziegel|holzstaender|kvh|bsh|mischbau|unbekannt",
      "thickness_mm": 250,
      "material": "z.B. 'STB-Wand', 'Ziegel 38', 'BSH/KVH'",
      "evidence": "z.B. '25 cm STB-Wand laut Aufbau' oder '2 Scharren 38er Ziegel'",
      "confidence": 0.85
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
  "fireProtection": {
    "buildingClass": "GK1|GK2|GK3|GK4|GK5",
    "buildingClassReason": "...",
    "fireResistanceClasses": [
      { "code": "REI 30", "applies_to": "Trennwand", "evidence": "..." }
    ],
    "confidence": 0..1
  },
  "overallConfidence": 0..1,
  "unreliableAreas": ["..."],
  "assumptions": ["..."]
}`;

// ============================================================
// DN-Marker Post-Processing (backward-compatible helper)
// ============================================================
function applyDnMarkers(extracted: Record<string, unknown>): void {
  // Map dn_markers → roofParts.pitch (DN-Wert hat Vorrang)
  if (extracted.dn_markers && Array.isArray(extracted.dn_markers) && Array.isArray(extracted.roofParts)) {
    const parts = extracted.roofParts as Array<Record<string, unknown>>;
    for (const marker of extracted.dn_markers as Array<{ value: number; near_roofpart_index?: number; evidence?: string }>) {
      const idx = typeof marker.near_roofpart_index === 'number' ? marker.near_roofpart_index : 0;
      if (parts[idx]) {
        const oldPitch = parts[idx].pitch as number | undefined;
        parts[idx].pitch = marker.value;
        if (oldPitch !== undefined && Math.abs(oldPitch - marker.value) > 2) {
          extracted.assumptions = extracted.assumptions || [];
          (extracted.assumptions as string[]).push(
            `Dachneigung roofPart[${idx}]: ${oldPitch}° (berechnet) → ${marker.value}° (aus DN-Marker: "${marker.evidence ?? ''}"). DN-Wert hat Vorrang.`
          );
        }
      }
    }
  }
  // Plausibilitätsprüfung: dimensions[Dachneigung] vs roofParts[0].pitch
  if (Array.isArray(extracted.dimensions) && Array.isArray(extracted.roofParts)) {
    const dims = extracted.dimensions as Array<{ label?: string; value?: number }>;
    const mainPitchDim = dims.find(d => d.label === 'Dachneigung');
    const parts = extracted.roofParts as Array<Record<string, unknown>>;
    if (mainPitchDim && parts[0] && typeof parts[0].pitch === 'number') {
      const dimPitch = mainPitchDim.value ?? 0;
      const partPitch = parts[0].pitch as number;
      if (Math.abs(dimPitch - partPitch) > 2) {
        const pq = (extracted.planQuality ?? {}) as Record<string, unknown>;
        pq.warnings = pq.warnings ?? [];
        (pq.warnings as string[]).push(
          `Dachneigung-Widerspruch: dimensions[Dachneigung]=${dimPitch}° vs roofParts[0].pitch=${partPitch}° — bitte prüfen.`
        );
        extracted.planQuality = pq;
      }
    }
  }
}

// ============================================================
// Multi-Stage Analyse
// ============================================================
async function analyzeDocumentMultiStage(
  base64: string,
  fileName: string,
): Promise<Record<string, unknown>> {
  const stageLog: { stages: unknown[] } = { stages: [] };

  // --- Pass 0: OCR-Text (deterministisch, kein JSON) ---
  let ocrText = '';
  let facts: ParsedFacts = {
    dnMarkers: [], dimensions: [], coveringHints: [], ueberdachungCount: 0,
    ueberdachungLabels: [], ceilingHints: [], aufbautenCodes: [], postalCodes: [],
    fireProtection: { reiClasses: [] }, wallHints: [], structureHints: [],
  };
  try {
    ocrText = await geminiVision({
      systemPrompt: OCR_PROMPT,
      userPrompt: `Extrahiere allen Text aus: ${fileName}`,
      fileBase64: base64,
      mimeType: 'application/pdf',
      jsonMode: false,
      maxTokens: 16000,
      model: 'gemini-2.5-flash',
    });
    // Pass 0.5: deterministischer Parser
    facts = parseAllFacts(ocrText);
    stageLog.stages.push({
      stage: 0, status: 'ok',
      summary: `OCR: ${ocrText.length} Zeichen | DN-Marker: ${facts.dnMarkers.map(d => d.value + '°').join(', ') || 'keine'} | Überdachungen: ${facts.ueberdachungCount} | Eindeckung: ${facts.coveringHints.map(c => c.type).join(', ') || 'unklar'}`,
    });
  } catch (ocrErr) {
    // Quota o.ä. — graceful degradation, facts bleibt leer
    stageLog.stages.push({ stage: 0, status: 'skipped', reason: String(ocrErr) });
  }

  // Harte Fakten als Kontext für Stage-1-Prompt aufbereiten
  const hardFactsHint = facts.dnMarkers.length > 0 || facts.coveringHints.length > 0
    ? `\n\n=== HARTE FAKTEN AUS OCR-TEXT-ANALYSE (VERBINDLICH!) ===
Diese Werte wurden deterministisch per Regex aus dem rohen OCR-Text extrahiert:
- Dachneigung(en): ${facts.dnMarkers.map(d => `${d.value}° (${d.raw})`).join(', ') || 'keine gefunden'}
- Eindeckung: ${facts.coveringHints.map(c => c.type).join(', ') || 'unklar'}
- Vordächer/Überdachungen: ${facts.ueberdachungCount} (${facts.ueberdachungLabels.join('; ') || 'keine'})
- Aufbauten-Codes: ${facts.aufbautenCodes.map(a => a.code).join(', ') || 'keine'}
- PLZ: ${facts.postalCodes.join(', ') || 'keine'}
- Maße: ${facts.dimensions.map(d => `${d.label}=${d.value}m`).join(', ') || 'keine'}
REGELN: Verwende diese Werte als Primärquelle. Wenn DN-Marker vorhanden, NIEMALS selbst berechnen!`
    : '';

  // ═══════════════════════════════════════════════════════════════════════
  // SCHNELL-PFAD: Wenn OCR harte Fakten lieferte (DN-Marker da), reicht EINE
  // Interpretation statt 3 Stages — spart Zeit (150s Edge-Limit) + Quota.
  // ═══════════════════════════════════════════════════════════════════════
  const ocrOk = ocrText.length > 100 && facts.dnMarkers.length > 0;

  // --- Stage 2 (Haupt-Interpretation) — IMMER nötig ---
  const stage2Text = await geminiVision({
    systemPrompt: STAGE2_PROMPT,
    userPrompt: `Analysiere den Plan "${fileName}" und liefere ALLE Details als JSON (roofParts mit Geometrie, ceilings, covering, addresses, structureHints, dimensions, openings, stairs, specialFeatures, planQuality).${hardFactsHint}`,
    fileBase64: base64,
    mimeType: 'application/pdf',
    jsonMode: true,
    maxTokens: 32000,
    model: 'gemini-2.5-flash',
  });
  const stage2 = parseJsonResponse<Record<string, unknown>>(stage2Text);
  stageLog.stages.push({
    stage: 2, status: 'ok',
    summary: `${(stage2.roofParts as unknown[] | undefined)?.length ?? 0} roofParts, ${(stage2.ceilings as unknown[] | undefined)?.length ?? 0} ceilings`,
  });

  let stage3: Record<string, unknown>;
  if (ocrOk) {
    // Schnell-Pfad: harte Fakten sind verlässlich → keine Validation-Stage nötig.
    // applyHardFacts (unten) erzwingt die Fakten ohnehin deterministisch.
    stage3 = stage2;
    stageLog.stages.push({ stage: 3, status: 'skipped-ocr-fast', summary: 'OCR-Fakten verlässlich → Validation übersprungen' });
    stage3._analysisMethod = 'ocr-first-fast';
  } else {
    // Langsam-Pfad: kein verlässlicher OCR → Validation-Stage zur Absicherung
    const stage3Text = await geminiVision({
      systemPrompt: STAGE3_PROMPT,
      userPrompt: `Stage-2-Ergebnis:\n${JSON.stringify(stage2, null, 2)}\n\nValidiere und korrigiere gegen den Plan "${fileName}".`,
      fileBase64: base64,
      mimeType: 'application/pdf',
      jsonMode: true,
      maxTokens: 32000,
      model: 'gemini-2.5-flash',
    });
    stage3 = parseJsonResponse<Record<string, unknown>>(stage3Text);
    stageLog.stages.push({
      stage: 3, status: 'ok',
      summary: `Finale Konfidenz: ${(((stage3.overallConfidence as number | undefined) ?? 0) * 100).toFixed(0)}%`,
    });
    stage3._analysisMethod = 'multi-stage-validated';
  }

  // Metadaten anhängen
  stage3._multiStageLog = stageLog;
  // Harte Fakten für Debugging + Konsens-Engine speichern
  stage3.parsedFacts = facts;

  // ── DN-Marker auf roofParts mappen ──────────────────
  // Primärquelle: OCR-Text-Parser (facts.dnMarkers, deterministisch!), dann KI-Stages.
  const dnMarkersOcr = facts.dnMarkers.map(d => ({ value: d.value, evidence: d.raw }));
  const dnMarkersStage2 = (stage2.dn_markers as Array<{ value: number; near_roofpart?: string; near_roofpart_index?: number; evidence?: string }> | undefined) ?? [];
  const dnMarkersStage3 = (stage3.dn_markers as Array<{ value: number; near_roofpart?: string; near_roofpart_index?: number; evidence?: string }> | undefined) ?? [];
  // OCR hat Vorrang (deterministisch), dann Stage2, dann Stage3
  const dnMarkers = dnMarkersOcr.length > 0
    ? dnMarkersOcr
    : dnMarkersStage2.length > 0
      ? dnMarkersStage2
      : dnMarkersStage3;
  if (dnMarkers.length > 0 && Array.isArray(stage3.roofParts)) {
    const parts = stage3.roofParts as Array<Record<string, unknown>>;
    for (const marker of dnMarkers) {
      const idx = typeof marker.near_roofpart_index === 'number'
        ? marker.near_roofpart_index
        : parts.findIndex(p => marker.near_roofpart && String(p.label ?? '').toLowerCase().includes(marker.near_roofpart.toLowerCase()));
      const targetIdx = idx >= 0 ? idx : 0;
      if (parts[targetIdx]) {
        const oldPitch = parts[targetIdx].pitch as number | undefined;
        parts[targetIdx].pitch = marker.value;
        if (oldPitch !== undefined && Math.abs(oldPitch - marker.value) > 2) {
          stage3.assumptions = stage3.assumptions || [];
          (stage3.assumptions as string[]).push(
            `DN-Korrektur roofPart[${targetIdx}] "${parts[targetIdx].label}": ${oldPitch}° → ${marker.value}° (aus DN-Marker: "${marker.evidence ?? ''}"). DN-Wert hat Vorrang.`
          );
        }
      }
    }
    // dn_markers im finalen Output speichern
    stage3.dn_markers = dnMarkers;
  }

  // ── Plausibilitätsprüfung: dimensions[Dachneigung] vs roofParts[0].pitch ──
  if (Array.isArray(stage3.dimensions) && Array.isArray(stage3.roofParts)) {
    const dims = stage3.dimensions as Array<{ label?: string; value?: number }>;
    const mainPitchDim = dims.find(d => d.label === 'Dachneigung');
    const parts = stage3.roofParts as Array<Record<string, unknown>>;
    if (mainPitchDim && parts[0] && typeof parts[0].pitch === 'number') {
      const dimPitch = mainPitchDim.value ?? 0;
      const partPitch = parts[0].pitch as number;
      if (Math.abs(dimPitch - partPitch) > 2) {
        const pq = (stage3.planQuality ?? {}) as Record<string, unknown>;
        pq.warnings = pq.warnings ?? [];
        (pq.warnings as string[]).push(
          `Dachneigung-Widerspruch: dimensions[Dachneigung]=${dimPitch}° vs roofParts[0].pitch=${partPitch}° — bitte prüfen.`
        );
        stage3.planQuality = pq;
      }
    }
  }

  // ── applyHardFacts: harte Fakten aus TextParser FINAL erzwingen ──
  applyHardFacts(stage3, facts);

  return stage3;
}

// ============================================================
// Serve
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { documentId, projectId, retryWith, focusOnMissing, useMultiStage, analysisQuality } = await req.json();
    // Hochgenau-Modus: gemini-2.5-pro für den Vision-Hauptcall (kostenpflichtig, höhere Lese-Genauigkeit).
    // Standard (default): gemini-2.5-flash (kostenlos). Pro fällt bei Quota automatisch auf Flash zurück.
    const primaryVisionModel = analysisQuality === 'hochgenau' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    if (!documentId || !projectId) {
      return new Response(JSON.stringify({ error: 'documentId und projectId erforderlich' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Default: Multi-Stage an
    const multiStage = useMultiStage !== false;

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

    let extracted: Record<string, unknown>;
    let analysisMethod: string;

    if (multiStage && !retryWith) {
      // ── SINGLE-COMBINED-CALL (schnell, 1 Gemini-Call, deterministische Fakten) ──
      // Ein Vision-Call liefert rawText (für Regex-Parser) UND strukturierte Daten.
      // Vermeidet das 150s-Edge-Limit das bei mehreren Vision-Calls auftritt.
      try {
        const combinedPrompt = `${SYSTEM}

=== ZUSÄTZLICH: ROHTEXT + DACHNEIGUNGEN ===
Füge dem JSON zwei zusätzliche Felder hinzu:

1. "_rawText": ALLER sichtbare Text aus dem Plan (Beschriftungen, Maße, Legenden,
   DN-Angaben, ÜBERDACHUNG-Texte, Aufbauten-Codes, Adressen). Vollständig, Zeile für Zeile.

2. "_dachneigungen": ein Array ALLER im Plan gefundenen Dachneigungs-Werte in Grad.
   KRITISCH WICHTIG: Suche SEHR GENAU nach Dachneigungs-Angaben! Diese stehen als:
   - "DN 10°", "DN=22°", "DN 5°" (DN = Dachneigung, sehr häufig in AT-Plänen!)
   - "Dachneigung 10°", "10° Dachneigung"
   - kleine Gradzahlen neben Dachlinien im Schnitt/in Ansichten
   - "X% Gefälle" (bei Flachdächern)
   Schau in JEDEN Schnitt, JEDE Ansicht, JEDES Dachsymbol.
   Beispiel: wenn du "DN 10°" 5× im Plan siehst → "_dachneigungen": [10]
   Wenn Hauptdach 10° und Vordach 5° → "_dachneigungen": [10, 5]
   Diese Werte sind WICHTIGER als alles andere — finde sie unbedingt!`;
        const text = await geminiVision({
          systemPrompt: combinedPrompt,
          userPrompt: `Analysiere diesen österreichischen Einreichplan: ${doc.file_name}. Liefere das vollständige JSON inkl. _rawText.`,
          fileBase64: base64,
          mimeType: 'application/pdf',
          jsonMode: true,
          maxTokens: 60000,
          model: primaryVisionModel,
        });
        extracted = parseJsonResponse<Record<string, unknown>>(text);
        analysisMethod = `single-combined-${primaryVisionModel === 'gemini-2.5-pro' ? 'pro' : 'flash'}`;
        extracted._analysisMethod = analysisMethod;

        // Deterministischer Parser auf MEHRERE Textquellen:
        // _rawText + alle texts[].content + Eindeckungs-Evidenz zusammenführen,
        // damit DN-Marker gefunden werden egal wo die KI sie ablegte.
        const rawText = (extracted._rawText as string) || '';
        const textsContent = Array.isArray(extracted.texts)
          ? (extracted.texts as Array<{content?: string}>).map(t => t.content || '').join('\n')
          : '';
        const combinedText = `${rawText}\n${textsContent}`;
        const facts = parseAllFacts(combinedText);

        // Zusätzlich: KI-geliefertes _dachneigungen-Array als DN-Quelle nutzen,
        // falls der Regex-Parser nichts fand (KI sieht manchmal mehr als der Text-Dump zeigt).
        const kiDn = extracted._dachneigungen;
        if (facts.dnMarkers.length === 0 && Array.isArray(kiDn)) {
          for (const v of kiDn as number[]) {
            if (typeof v === 'number' && v > 0 && v <= 75) {
              facts.dnMarkers.push({ value: v, raw: `_dachneigungen: ${v}°`, source: 'DN' });
            }
          }
        }
        extracted.parsedFacts = facts;
        applyHardFacts(extracted, facts);
      } catch (combinedErr) {
        const errMsg = combinedErr instanceof Error ? combinedErr.message : String(combinedErr);
        const isQuotaError = errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted');
        if (isQuotaError) {
          // Quota: einfacher Single-Call ohne _rawText, mit DN-Marker-Post-Processing
          console.warn('Combined-Call Quota-Fehler, Minimal-Fallback:', errMsg);
          const text = await geminiVision({
            systemPrompt: SYSTEM,
            userPrompt: `Analysiere diesen Einreichplan: ${doc.file_name}. Liefere JSON laut System-Prompt.`,
            fileBase64: base64,
            mimeType: 'application/pdf',
            jsonMode: true,
            maxTokens: 60000,
          });
          extracted = parseJsonResponse<Record<string, unknown>>(text);
          extracted._analysisMethod = 'single-stage-quota-fallback';
          analysisMethod = 'single-stage-quota-fallback';
          applyDnMarkers(extracted);
          // Rohtext aus dem Ergebnis falls vorhanden
          const rawFb = (extracted._rawText as string) || '';
          if (rawFb.length > 50) {
            const factsFb = parseAllFacts(rawFb);
            extracted.parsedFacts = factsFb;
            applyHardFacts(extracted, factsFb);
          }
        } else {
          throw combinedErr;
        }
      }
    } else {
      // Single-Stage (explizit deaktiviert oder retryWith)
      const userPrompt = focusOnMissing
        ? `Analysiere diesen Einreichplan NOCHMALS SEHR SORGFÄLTIG: ${doc.file_name}.\nACHTE BESONDERS AUF: Dachneigung (°), Gebäudegeometrie (Länge/Breite/Firsthöhe/Traufhöhe), Schnittdarstellungen, Bemaßungslinien.\nFüge ein Feld "_rawText" mit allem sichtbaren Text hinzu.\nLiefere JSON laut System-Prompt.`
        : `Analysiere diesen Einreichplan: ${doc.file_name}. Füge ein Feld "_rawText" mit allem sichtbaren Text hinzu. Liefere JSON laut System-Prompt.`;
      const text = await geminiVision({
        systemPrompt: SYSTEM,
        userPrompt,
        fileBase64: base64,
        mimeType: 'application/pdf',
        jsonMode: true,
        maxTokens: 80000,
        ...(retryWith ? { model: retryWith as 'gemini-2.5-flash' } : {}),
      });
      extracted = parseJsonResponse<Record<string, unknown>>(text);
      analysisMethod = retryWith ? `single-stage-${retryWith}` : 'single-stage';
      applyDnMarkers(extracted);
      // Rohtext-Parser falls _rawText im Ergebnis
      const rawSingle = (extracted._rawText as string) || '';
      if (rawSingle.length > 50) {
        const factsSingle = parseAllFacts(rawSingle);
        extracted.parsedFacts = factsSingle;
        applyHardFacts(extracted, factsSingle);
      }
    }

    await supabase.from('documents').update({ status: 'analyzed', extracted_data: extracted }).eq('id', documentId);

    // Audit-Eintrag
    const stageInfo = (extracted._multiStageLog as Record<string, unknown> | undefined)?.stages;
    const stagesStr = stageInfo
      ? `Stages: ${JSON.stringify(stageInfo)}`
      : (retryWith ? `Modell: ${retryWith}, Second-Pass` : 'Single-Stage');
    await supabase.from('audit_log').insert({
      project_id: projectId,
      agent: `Dokumenten-Agent (${analysisMethod})`,
      action: `PDF analysiert: ${doc.file_name}${focusOnMissing ? ' [fokussierter Pass]' : ''}`,
      field: 'documents',
      reason: `Konfidenz ${((extracted.overallConfidence as number || 0) * 100).toFixed(0)}% | ${stagesStr}`,
      new_value: `Texte: ${(extracted.texts as unknown[])?.length || 0}, Maße: ${(extracted.dimensions as unknown[])?.length || 0}, Dachteile: ${(extracted.roofParts as unknown[])?.length || 0}`,
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
