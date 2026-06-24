import { describe, it, expect } from 'vitest';
import { parseDachneigung } from '../../../../supabase/functions/_shared/textParser';

const vals = (t: string) => parseDachneigung(t).map((m) => m.value).sort((a, b) => a - b);

describe('parseDachneigung — Robustheit über Planformate', () => {
  it('liest DN mit Gradsymbol (Lechner)', () => {
    expect(vals('Stallgebäude DN 10° Pultdach')).toEqual([10]);
  });
  it('liest Dachneigung mit Gradsymbol', () => {
    expect(vals('Dachneigung: 35° Satteldach')).toContain(35);
  });
  it('liest Gefälle-Prozent in Grad um', () => {
    // 10% Gefälle = atan(0.10) ≈ 5,7°
    expect(parseDachneigung('Flachdach 10% Gefälle')[0].value).toBeCloseTo(5.7, 1);
  });
  it('liest "Dachneigung 5" OHNE Gradsymbol (gescannter/OCR-Plan Nöhrer)', () => {
    expect(vals('6cm Dachpaneele Dachneigung 5 Pultdach')).toEqual([5]);
  });
  it('liest mehrere unterschiedliche Neigungen (Hauptdach + Vordach)', () => {
    expect(vals('DN 22° Hauptdach, Vordach DN 7°')).toEqual([7, 22]);
  });
  it('verwechselt Maße NICHT mit Neigung (kein Fehlalarm)', () => {
    // "Dachneigung" gefolgt von cm/m darf NICHT als Grad gelesen werden
    expect(vals('Dachpaneele 6cm, Wandhöhe 3,20 m')).toEqual([]);
    expect(vals('DN 250 mm Rohr')).toEqual([]); // DN = Nennweite, keine Neigung
  });
  it('dedupliziert gleiche Werte aus °- und no-°-Treffer', () => {
    expect(vals('Dachneigung 5° ... weiter unten Dachneigung 5')).toEqual([5]);
  });
});
