import { describe, it, expect } from 'vitest';
import {
  isGarbageLabel, cleanRoofLabel, arbitratePitch, dedupeParts, reconcileRoofParts,
} from '../../../../supabase/functions/_shared/roofParts';

const base = { length: 27, width: 8, ridgeHeight: 6.26, eavesHeight: 4.65 };

describe('isGarbageLabel / cleanRoofLabel', () => {
  it('erkennt Textfragmente als Müll', () => {
    expect(isGarbageLabel('ÜBERDACHUNG, STALL NEU, EINREICHPLAN.')).toBe(true);
    expect(isGarbageLabel('Vordach Maße: 28.65m, 16.15')).toBe(true);
    expect(isGarbageLabel('Vordach 28,650 16,150')).toBe(true);
    expect(isGarbageLabel('Hauptdach')).toBe(false);
    expect(isGarbageLabel('Garagendach')).toBe(false);
  });
  it('ersetzt Müll-Labels durch saubere Namen', () => {
    expect(cleanRoofLabel('ÜBERDACHUNG, STALL NEU, EINREICHPLAN.', 'main', 1)).toBe('Hauptdach');
    expect(cleanRoofLabel('Vordach 28,650 16,150', 'vordach', 2)).toBe('Vordach 2');
    expect(cleanRoofLabel('Stallgebäude Dach', 'main', 1)).toBe('Stallgebäude Dach');
  });
});

describe('arbitratePitch', () => {
  it('akzeptiert DN-Marker wenn geometrie-bestätigt (Lechner 10° Pultdach)', () => {
    const r = arbitratePitch({ kind: 'main', form: 'satteldach', width: 8, ridgeHeight: 6.26, eavesHeight: 4.65 }, [10]);
    expect(r.pitch).toBe(10);
    expect(r.form).toBe('pultdach'); // satteldach→pultdach korrigiert
  });
  it('nimmt Flachdach bei First≈Traufe', () => {
    const r = arbitratePitch({ kind: 'vordach', width: 8, ridgeHeight: 4, eavesHeight: 4 }, []);
    expect(r.form).toBe('flachdach');
  });
});

describe('reconcileRoofParts — die echten Varianz-Fälle', () => {
  it('6 Müll-Dachteile → wenige saubere (Lechner-Katastrophe)', () => {
    const kiParts = [
      { kind: 'main', label: 'Hauptgebäude Dach', form: 'satteldach', width: 8, length: 27, ridgeHeight: 6.26, eavesHeight: 4.65 },
      { kind: 'vordach', label: 'ÜBERDACHUNG, STALL NEU, EINREICHPLAN.', form: 'pultdach', width: 8, length: 27, ridgeHeight: 6.26, eavesHeight: 4.65 },
      { kind: 'vordach', label: 'Vordach Maße: 28.65m, 16.15', form: 'pultdach', width: 8, length: 27, ridgeHeight: 6.26, eavesHeight: 4.65 },
      { kind: 'vordach', label: 'Vordach 28,650 16,150', form: 'pultdach', width: 8, length: 27, ridgeHeight: 6.26, eavesHeight: 4.65 },
    ];
    const { parts } = reconcileRoofParts({ kiParts, dnMarkers: [10], ueberdachungCount: 1, base });
    // keine Müll-Labels mehr
    for (const p of parts) expect(isGarbageLabel(p.label)).toBe(false);
    // genau ein Hauptdach
    expect(parts.filter(p => p.kind === 'main').length).toBe(1);
    // Duplikate (gleiche Grundfläche) zusammengefasst
    expect(parts.length).toBeLessThanOrEqual(2);
  });

  it('KI liefert nur Hauptdach, Text fand Überdachung → Vordach ergänzt', () => {
    const kiParts = [{ kind: 'main', label: 'Hauptdach', form: 'pultdach', width: 8, length: 27, ridgeHeight: 6.26, eavesHeight: 4.65 }];
    const { parts } = reconcileRoofParts({ kiParts, dnMarkers: [10], ueberdachungCount: 1, base });
    expect(parts.length).toBe(2);
    expect(parts.some(p => p.kind === 'vordach')).toBe(true);
  });

  it('Vordach mit steiler Geometrie → Neigung auf ≤15° gekappt', () => {
    const kiParts = [
      { kind: 'main', label: 'Hauptdach', form: 'pultdach', width: 8, length: 27, ridgeHeight: 6.26, eavesHeight: 4.65 },
      { kind: 'vordach', label: 'Vordach', form: 'pultdach', width: 3, length: 27, ridgeHeight: 4.65, eavesHeight: 2.85 }, // rise 1.8 / w 3 → steil
    ];
    const { parts } = reconcileRoofParts({ kiParts, dnMarkers: [], ueberdachungCount: 0, base });
    const v = parts.find(p => p.kind === 'vordach')!;
    expect(v.pitch).toBeLessThanOrEqual(15);
  });

  it('leere KI-Ausgabe → Hauptdach synthetisiert', () => {
    const { parts } = reconcileRoofParts({ kiParts: [], dnMarkers: [10], ueberdachungCount: 0, base });
    expect(parts.length).toBe(1);
    expect(parts[0].kind).toBe('main');
    expect(parts[0].pitch).toBe(10);
  });

  it('über-gezählte Überdachungen (Wort-Vorkommen) → max 2 Vordächer', () => {
    const kiParts = [{ kind: 'main', label: 'Hauptdach', form: 'pultdach', width: 8, length: 27, ridgeHeight: 6.26, eavesHeight: 4.65 }];
    const { parts } = reconcileRoofParts({ kiParts, dnMarkers: [10], ueberdachungCount: 7, base });
    expect(parts.filter(p => p.kind === 'vordach').length).toBeLessThanOrEqual(2);
  });

  it('DETERMINISTISCH: gleiche Eingabe → identisches Ergebnis (kein Schwanken)', () => {
    const kiParts = [
      { kind: 'main', label: 'Hauptdach', form: 'satteldach', width: 8, length: 27, ridgeHeight: 6.26, eavesHeight: 4.65 },
      { kind: 'vordach', label: 'müll, müll, müll', form: 'pultdach', width: 3, length: 27, ridgeHeight: 3, eavesHeight: 2.85 },
    ];
    const a = reconcileRoofParts({ kiParts, dnMarkers: [10], ueberdachungCount: 1, base }).parts;
    const b = reconcileRoofParts({ kiParts, dnMarkers: [10], ueberdachungCount: 1, base }).parts;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('dedupeParts', () => {
  it('fasst near-identische Garagen zusammen (Lebenbauer-Bug)', () => {
    const mk = (w: number, l: number, p: number): any => ({ id: 'x', kind: 'vordach', label: 'Flachdach Garage', form: 'flachdach', positionX: 0, positionY: 0, length: l, width: w, ridgeHeight: 3, eavesHeight: 3, pitch: p, ridgeDirection: 'x', confidence: 0.5 });
    const out = dedupeParts([mk(6, 6, 2), mk(6.1, 6.0, 1.9)]);
    expect(out.length).toBe(1);
  });
});
