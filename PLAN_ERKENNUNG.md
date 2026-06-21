# Plan-Erkennungs-Wissensdatenbank

> Diese Datei ist die zentrale Wissensbasis für die Plan-Analyse. Sie wird bei
> jeder KI-Analyse als Kontext geladen. Neue Erkenntnisse aus Fehlanalysen +
> User-Korrekturen werden hier (bzw. in der DB-Tabelle `erkennungs_regeln`)
> ergänzt. **Selbst-lernend**: jede manuelle Korrektur in der App wird als Regel
> gespeichert und beim nächsten ähnlichen Plan angewandt.

---

## 1. DACHNEIGUNG — Schreibweisen (DETERMINISTISCH per Regex erkennbar)

Die Dachneigung ist der wichtigste Wert. Sie steht IMMER irgendwo im Plan,
oft mehrfach. Folgende Schreibweisen kommen in österreichischen Plänen vor:

| Schreibweise | Regex-Muster | Beispiel-Plan |
|---|---|---|
| `DN X°` | `DN\s*=?\s*(\d+[.,]?\d*)\s*°` | Lechner: "DN 10°" (8×) |
| `Dachneigung X°` | `Dachneigung\s*:?\s*(\d+[.,]?\d*)\s*°` | Nöhrer: "Dachneigung 5°" |
| `DN = X°` | `DN\s*=\s*(\d+[.,]?\d*)\s*°` | Lebenbauer: "DN = 22°" |
| `X°` neben Dachlinie | `(\d+[.,]?\d*)\s*°` (nur in Schnitt/Ansicht) | diverse |
| `X% Gefälle` | `(\d+[.,]?\d*)\s*%\s*Gefälle` (→ Grad umrechnen: arctan(%/100)) | Flachdächer |

**REGEL:** Der per Regex gefundene DN-Wert hat IMMER Vorrang vor einem
berechneten Wert (aus First/Trauf/Breite). Wenn mehrere unterschiedliche
DN-Werte → verschiedene Dachteile mit eigener Neigung.

**Legenden-Hinweis:** "DN" wird in vielen Plänen in der Legende erklärt
("DN = Dachneigung", "DN Dachneigung"). Wenn Legende vorhanden → DN-Bedeutung
bestätigt.

---

## 2. DACHFORM — Erkennungsmerkmale

| Form | Merkmale im Plan | Plausibilität |
|---|---|---|
| **Pultdach** | EINE Dachneigung, First nur an einer Seite, "Pultdach" Text, DN < 15° häufig | pitch 3-25° |
| **Satteldach** | ZWEI gleiche Neigungen, First mittig, symmetrisch | pitch 15-45° |
| **Walmdach** | 4 geneigte Flächen, First kürzer als Gebäude, abgeschrägte Giebel | pitch 20-45° |
| **Krüppelwalm** | wie Walm aber kurze Walmfläche oben, unten Giebeldreieck | pitch 25-45° |
| **Flachdach** | DN ≤ 5°, "Flachdach" Text, oft Attika, "2% Gefälle" | pitch 0-5° |
| **Sheddach** | Sägezahn-Profil, Nordlicht, Industriebau | variabel |

**WICHTIGE PLAUSIBILITÄTS-REGELN (für Selbst-Validierung):**
- `pitch < 12° + form='satteldach'` → WIDERSPRUCH → vermutlich Pultdach
- `pitch ≤ 5°` → Flachdach (egal was die KI sagt)
- `pitch berechnet aus Höhen weicht > 5° von DN-Marker ab` → Höhen prüfen ODER Pultdach (Höhe ist Differenz, nicht symmetrisch)
- Pultdach: Sparrenlänge = √(Breite² + Höhendiff²), NICHT halbe Breite

---

## 3. EINDECKUNG — aus Aufbauten-Legende ableiten

Die Eindeckung steht in der **Aufbauten-Legende** (Bauteilbeschreibung).
Die **letzte/oberste Schicht** eines Dachaufbaus IST die Eindeckung.

| Eindeckungs-Text | Typ | Gewicht kN/m² |
|---|---|---|
| "Tondachziegel", "Dachziegel", "Falzziegel" | tile_clay | 0.55 |
| "Scharren Ziegel", "X Scharren ... Ziegel" | tile_clay | 0.55 |
| "Betondachstein", "Frankfurt" | tile_concrete | 0.55 |
| "Trapezblech", "X cm Trapezblech" | trapezblech | 0.10 |
| "Stehfalz", "Doppelstehfalz", "Falzblech" | metal_falz | 0.12 |
| "Naturschiefer", "Schiefer" | schiefer | 0.55 |
| "Dachpaneele", "Sandwichpaneel", "Sandwich" | sandwich_paneel | 0.18 |
| "Bitumen", "Schweißbahn", "Abdichtung" (Flachdach) | bitumen | 0.30 |
| "Gründach extensiv" | gruendach_ext | 1.0 |
| "Gründach intensiv" | gruendach_int | 2.5 |

**Konkrete Belege aus Test-Plänen:**
- Lechner D1: "...14 cm Trapezblech" → **trapezblech**
- Nöhrer: "6 cm Dachpaneele" → **sandwich_paneel**
- Lebenbauer 06: "2 Scharren 38er Ziegel" → **tile_clay**

---

## 4. AUFBAUTEN-CODES — zwei Schemata

| Schema | Beispiel | Plan |
|---|---|---|
| Buchstabe+Ziffer | B1, B2, D1, W1, F1 | Lechner |
| reine Ziffer | 06, 09, 11 | Lebenbauer |

**Typ aus Code/Inhalt:**
- B / "Boden", "Fundament" → Bodenaufbau
- D / "Dach", "Dachkonstruktion", "Sparren", "Eindeckung" → Dachaufbau
- W / "Wand" → Wandaufbau
- K / "Decke", "Terrasse" → Deckenaufbau

---

## 5. VORDÄCHER / ANBAUTEN — separate Dachteile

Diese Wörter signalisieren EIGENE Dachteile (kind != 'main'):

| Wort | kind | Plan |
|---|---|---|
| "ÜBERDACHUNG" | vordach | Lechner (Ost + West = 2 Stück!) |
| "VORDACHKANTE-SATTELDACH" | vordach | Lebenbauer |
| "VORDACHKANTE-FLACHDACH" | vordach | Lebenbauer |
| "Vordach", "Tordach" | vordach | diverse |
| "Carport" | carport | diverse |
| "Garage" (mit eigenem Dach) | anbau | Lebenbauer |
| "Zubau", "Anbau", "Erweiterung" | anbau | diverse |

**REGEL:** Jedes ÜBERDACHUNG/VORDACHKANTE wird als eigener roofPart gezählt.
Lechner hat ZWEI ÜBERDACHUNG (Ost + West) → 3 Dachteile gesamt
(Hauptpultdach + 2 Vordächer).

---

## 6. DECKEN — Holz vs. Stahlbeton UNTERSCHEIDEN

| Text | constructionType | Im Holzauszug? |
|---|---|---|
| "Holzboden X m²", "Holzbalkendecke", Holzbalken im Schnitt | holzbalkendecke | JA → Deckenbalken |
| "STB-Decke", "Stahlbetondecke", "Massivdecke", "Filigrandecke" | stb_decke | NEIN (Statiker rechnet Beton) |
| "Rippendecke", "Hourdis", "Ziegelhohldecke" | rippendecke | NEIN |

**Belege:**
- Lechner: "180,50 m² Holzboden LAGER" → **holzbalkendecke** (im Holzauszug)
- Lebenbauer 09: "...STB-Decke" → **stb_decke** (NICHT im Holzauszug)

---

## 7. WÄNDE — Konstruktionstyp

| Text | type | thickness |
|---|---|---|
| "BSH/KVH Wandkonstruktion", "Holzständerwand" | holzstaender | ~200mm |
| "25 cm STB", "Stahlbetonwand" | stb | 250mm |
| "38er Ziegel", "Ziegelmauerwerk 38" | ziegel | 380mm |
| "25er Ziegel" | ziegel | 250mm |

---

## 8. BRANDSCHUTZ — GK + REI

- "GK1"–"GK5" = Gebäudeklasse OIB
- "REI 30/60/90", "R 30", "EI 30-C", "RM" = Brandwiderstandsklassen
- Legende erklärt oft die Codes (siehe Nöhrer-Plan: vollständige REI-Legende)

GK aus Gebäudedaten ableitbar:
- ≤3 Geschosse + Fluchtniveau ≤7m + ≤400m² BGF → GK2

---

## 9. ADRESSE — Bauadresse vs. Planer

- "Bauvorhaben", "Bauplatz", "Bauadresse" → Bauadresse (isBuildingAddress=true)
- "Planung", "ZT", "Ingenieurbüro", "Baumeister", "Architekt" → Planeradresse
- Grundstücksnummer (Grst.Nr., EZ, KG) = Bauplatz-Lage

**Beleg Nöhrer:** "8274 Unterdombach 14" = Bauadresse, Steiermark Bezirk Hartberg-Fürstenfeld

---

## 10. SELBST-VALIDIERUNGS-CHECKLISTE (nach jeder Analyse automatisch)

1. ☐ pitch aus DN-Marker übernommen (nicht berechnet)?
2. ☐ pitch < 12° → form ≠ satteldach?
3. ☐ pitch ≤ 5° → form = flachdach?
4. ☐ Anzahl roofParts = Anzahl (ÜBERDACHUNG + Hauptdach + Anbauten)?
5. ☐ Eindeckung aus letzter Dachaufbau-Schicht?
6. ☐ STB-Decken NICHT im Holzauszug?
7. ☐ Außenmaße plausibel (2-100m)?
8. ☐ Spannweite plausibel (Pultdach Sparrenlänge = volle Breite)?
9. ☐ Schneezone passt zur PLZ?
10. ☐ Bei jedem unsicheren Wert: in 2-3 Analysen gleicher Wert (Konsens)?

---

## ÄNDERUNGSHISTORIE (selbst-lernend)

<!-- Hier werden automatisch neue Regeln aus User-Korrekturen ergänzt -->
<!-- Format: YYYY-MM-DD | Plan-Typ | Falsch erkannt | Korrektur | Neue Regel -->

- 2026-05-23 | Lechner Stallgebäude | pitch 30° statt 10° | DN 10° per OCR | DN-Marker hat Vorrang, OCR-First
- 2026-05-23 | Lechner | form satteldach statt pultdach | pitch<12° | Pultdach-Heuristik bei flacher Neigung
- 2026-05-23 | Lebenbauer | STB-Decke als Holzbalkendecke | constructionType | STB-Decken nicht im Holzauszug
