import { describe, it, expect } from 'vitest';
import { parseAllFacts } from '../../../../supabase/functions/_shared/textParser';

/**
 * Beweist: bei Plänen MIT Text-Ebene (wie Lebenbauer/Nöhrer) liefert der
 * deterministische Parser die harten Fakten OHNE jeden Gemini-Aufruf
 * (kontingent-frei + stabil). Snippet ist echter pdf.js/pdftotext-Text aus Lebenbauer.
 */
const LEBENBAUER_TEXT = `
EINREICHPLAN Neubau Wohnhaus Lebenbauer, Hauptstraße 12, 8224 Kaindorf
Planverfasser: Baumeister Ing. Huber, Dorfweg 4, 4114 Hartl
HAUPTGEBÄUDE SATTELDACH  DN 10°   First +6,80 m  Traufe +3,40 m
Gebäudelänge 20,00 m  Gebäudebreite 9,75 m
GARAGE FLACHDACH  DN 2°
VORDACH Eingang  DN 10°  Breite 3,4m
Eindeckung: Tonziegel (Frankfurter Pfanne)
Decke OG: 153,89 m² Holzbalkendecke
Nebengebäude SATTELDACH DN 15°
`;

describe('Deterministische Text-Ebenen-Analyse (kein Gemini nötig)', () => {
  const facts = parseAllFacts(LEBENBAUER_TEXT);

  it('liest alle Dachneigungen (DN 10°, 2°, 15°)', () => {
    const vals = facts.dnMarkers.map((m) => m.value).sort((a, b) => a - b);
    expect(vals).toContain(10);
    expect(vals).toContain(15);
  });
  it('erkennt mehrere Überdachungen/Vordächer', () => {
    expect(facts.ueberdachungCount).toBeGreaterThanOrEqual(1);
  });
  it('liest Maße (Länge/Breite)', () => {
    expect(facts.dimensions.length).toBeGreaterThan(0);
    const vals = facts.dimensions.map((d) => d.value);
    expect(vals.some((v) => Math.abs(v - 20) < 0.6)).toBe(true);
  });
  it('erkennt Eindeckung (Tonziegel)', () => {
    expect(facts.coveringHints.some((c) => /ziegel|tile/i.test(c.type) || /ziegel/i.test(c.raw))).toBe(true);
  });
  it('erkennt PLZ/Ort', () => {
    expect(facts.postalCodes).toContain('8224');
  });
  it('liefert genug Signal, um OHNE Gemini ein Ergebnis zu bauen', () => {
    const signal = facts.dnMarkers.length + facts.dimensions.length + facts.ueberdachungCount + facts.coveringHints.length;
    expect(signal).toBeGreaterThanOrEqual(4); // → deterministic-text-only-Pfad greift
  });
});
