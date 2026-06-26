import { describe, it, expect } from 'vitest';
import { parseDimensions } from '../../../../supabase/functions/_shared/textParser';

const vals = (t: string) => parseDimensions(t).map((d) => d.value).sort((a, b) => a - b);

describe('parseDimensions — auch unbeschriftete Maße (Scan/OCR-Pläne)', () => {
  it('liest beschriftete Maße', () => {
    const v = vals('Gebäudelänge: 27,05 m, Breite 7,80 m');
    expect(v).toContain(27.05);
    expect(v).toContain(7.8);
  });
  it('liest BARE Maße ohne Beschriftung (typisch Scan)', () => {
    const v = vals('... 8,00m ... 23,0 m ... 3,50m ... 10.98 m ...');
    expect(v).toEqual(expect.arrayContaining([3.5, 8, 10.98, 23]));
  });
  it('ignoriert Kleinkram (<1m) und zu große Werte (>60m)', () => {
    const v = vals('0,53m Schichtdicke, 93.78 m Grundstück, 8,00m Gebäude');
    expect(v).toContain(8);
    expect(v).not.toContain(0.53);
    expect(v).not.toContain(93.78);
  });
  it('dedupliziert beschriftet + bare gleichen Wert nicht doppelt', () => {
    const all = parseDimensions('Gebäudebreite 8,00 m ... irgendwo 8,00m');
    const eights = all.filter((d) => d.value === 8);
    expect(eights.length).toBe(1);
  });
  it('verwechselt Rohr-Nennweiten NICHT mit Maßen', () => {
    // "DN150" hat keine Dezimalstelle + kein " m" → kein Treffer
    expect(vals('Entwässerung DN150, DN100')).toEqual([]);
  });
});
