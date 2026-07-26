import { describe, it, expect } from 'vitest';
import { autoCalculateAllMembers } from '../autoCalculate';
import { autoComputeCosts } from '../autoCost';
import type { TimberMember, BuildingGeometry } from '@/types/project';

/**
 * Referenzangebot: Dachstuhl 12,0 × 9,0 m, Satteldach 30°, Sparrendach.
 * ca. 145 m² Dachfläche inkl. 0,4 m Überstand.
 *
 * Ein solcher Dachstuhl kostet in der Oststeiermark als reine Zimmererleistung
 * (Holz + Abbund + Montage + Lattung, ohne Eindeckung und Spengler) grob
 * 13.000–30.000 € netto. Der Test hält diesen Korridor fest, damit ein
 * Rechenfehler in Lasten oder Mengen sofort am Preis auffällt.
 */
const geometry = {
  length: { value: 12, unit: 'm', source: 'user', confidence: 1 },
  width: { value: 9, unit: 'm', source: 'user', confidence: 1 },
  roofPitch: { value: 30, unit: '°', source: 'user', confidence: 1 },
  ridgeHeight: { value: 6.5, unit: 'm', source: 'user', confidence: 1 },
  eavesHeight: { value: 4.5, unit: 'm', source: 'user', confidence: 1 },
} as unknown as BuildingGeometry;

function member(over: Partial<TimberMember>): TimberMember {
  return {
    id: over.id ?? 'x', name: over.name ?? 'X', type: over.type ?? 'sparren',
    width: over.width ?? 80, height: over.height ?? 200, length: over.length ?? 5.32,
    quantity: over.quantity ?? 1, material: over.material ?? 'C24',
    crossSection: over.crossSection ?? '8/20',
  } as TimberMember;
}

const members: TimberMember[] = [
  member({ id: 'S', name: 'Sparren S1-S32', type: 'sparren', quantity: 32, length: 5.32 }),
  member({ id: 'MB', name: 'Fußpfette (Mauerbank) 1-2', type: 'pfette', width: 140, height: 100, length: 12, quantity: 2 }),
  member({ id: 'Z', name: 'Zangen Z1-Z16', type: 'zange', width: 60, height: 160, length: 8.4, quantity: 16 }),
];

const calc = autoCalculateAllMembers(members, { gk: 1.2, sk: 2.43 }, geometry, 0.8, 4.0);
const cost = autoComputeCosts(calc.optimizedMembers, geometry, { roofForm: 'satteldach', roofOverhang: 0.4 });

describe('Angebot enthält alles, was eine Zimmerei verrechnet', () => {
  const beschreibungen = cost.withLabor.positions.map(p => p.description).join(' | ');

  it.each([
    ['Konstruktionsholz', /KVH|BSH|Konstruktionsvollholz/i],
    ['Abbund', /Abbund/i],
    ['Montage', /Montage/i],
    ['Anlieferung', /Anlieferung|Transport/i],
    ['Kran/Aufstellhilfe', /Kran/i],
    ['Baustelleneinrichtung', /Baustelleneinrichtung/i],
    ['Werk-/Abbundplan', /Werk- und Abbundplan/i],
    ['Dachlattung', /Dachlattung/i],
    ['Verbinder', /Schrauben|Sturmanker/i],
  ])('Position "%s" ist im Angebot', (_label, muster) => {
    expect(beschreibungen).toMatch(muster);
  });
});

describe('Angebotssumme ist plausibel und in sich stimmig', () => {
  it('liegt im realistischen Korridor für einen 12×9-m-Dachstuhl', () => {
    expect(cost.withLabor.net).toBeGreaterThan(13000);
    expect(cost.withLabor.net).toBeLessThan(30000);
  });

  it('Gemeinkosten, Gewinn und MwSt passen exakt zu den Prozentsätzen', () => {
    const basis = cost.withLabor.positions.reduce((s, p) => s + p.total, 0);
    const f = cost.withLabor.factors;
    const gk = basis * f.overhead / 100;
    const gewinn = (basis + gk) * f.profit / 100;
    const netto = basis + gk + gewinn;

    const zeige = (name: string) => cost.withLabor.appliedSurcharges.find(s => s.name.startsWith(name))?.amount ?? 0;
    expect(zeige('Gemeinkosten')).toBeCloseTo(gk, 1);
    expect(zeige('Unternehmergewinn')).toBeCloseTo(gewinn, 1);
    expect(cost.withLabor.net).toBeCloseTo(netto, 1);
    expect(cost.withLabor.gross).toBeCloseTo(netto * (1 + f.vat / 100), 1);
  });

  it('Materialliste enthält keine Lohnpositionen', () => {
    expect(cost.materialOnly.positions.some(p => p.category === 'Lohn')).toBe(false);
  });
});
