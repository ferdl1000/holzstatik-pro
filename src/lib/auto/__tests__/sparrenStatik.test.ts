import { describe, it, expect } from 'vitest';
import { autoCalculateAllMembers } from '../autoCalculate';
import { calculateBeam } from '@/lib/calc/timber/beam';
import type { TimberMember, BuildingGeometry } from '@/types/project';

/**
 * Referenz-Handrechnung: Satteldach 12,0 × 9,0 m, 30°, Traufe 4,5 m, First 6,5 m.
 * Sparrenabstand 0,80 m. g_k = 1,20 kN/m² Dachfläche, s_k = 2,43 kN/m² Grundriss.
 *
 * Ein Zimmermeister rechnet nach:
 *   Sparrenlänge (Schräge) = √(4,50² + 2,00²) = 4,92 m
 *   q⊥,g = 1,20 · 0,80 · cos30° = 0,831 kN/m
 *   q⊥,s = 2,43 · 0,80 · cos²30° = 1,458 kN/m
 *   q_v  = 1,35 · (1,20/cos30°) · 0,80 + 1,5 · 2,43 · 0,80 = 4,41 kN/m
 *   V    = 4,41 · 9,0 / 2 = 19,9 kN
 *   H    = 4,41 · 9,0² / (8 · 2,0) = 22,3 kN   (Traufschub)
 *   N    = 19,9 · sin30° + 22,3 · cos30° = 29,2 kN
 */

const geometry = {
  length: { value: 12, unit: 'm', source: 'user', confidence: 1 },
  width: { value: 9, unit: 'm', source: 'user', confidence: 1 },
  roofPitch: { value: 30, unit: '°', source: 'user', confidence: 1 },
  ridgeHeight: { value: 6.5, unit: 'm', source: 'user', confidence: 1 },
  eavesHeight: { value: 4.5, unit: 'm', source: 'user', confidence: 1 },
} as unknown as BuildingGeometry;

const loads = { gk: 1.2, sk: 2.43 };

function member(over: Partial<TimberMember>): TimberMember {
  return {
    id: over.id ?? 'x', name: over.name ?? 'X', type: over.type ?? 'sparren',
    width: over.width ?? 80, height: over.height ?? 200, length: over.length ?? 5.32,
    quantity: over.quantity ?? 1, material: over.material ?? 'C24',
    crossSection: over.crossSection ?? '8/20',
  } as TimberMember;
}

describe('Sparren-Statik zimmerermäßig nachrechenbar', () => {
  const members: TimberMember[] = [
    member({ id: 'S', name: 'Sparren S1-S32', type: 'sparren', quantity: 32, length: 5.32 }),
    member({ id: 'MB', name: 'Fußpfette (Mauerbank) 1-2', type: 'pfette', width: 140, height: 100, length: 12, quantity: 2 }),
    member({ id: 'Z', name: 'Zangen Z1-Z16', type: 'zange', width: 60, height: 160, length: 8.4, quantity: 16 }),
  ];

  const res = autoCalculateAllMembers(members, loads, geometry, 0.8, 4.0);

  it('zerlegt die Sparrenlast senkrecht zur Sparrenachse', () => {
    const a = res.assumptions.find(x => x.field.includes('Sparren') && x.field.endsWith('.last'));
    expect(a).toBeTruthy();
    // q⊥,g = 1,20 · 0,80 · cos30° = 0,831 ; q⊥,s = 2,43 · 0,80 · cos²30° = 1,458
    expect(String(a!.value)).toContain('0.83');
    expect(String(a!.value)).toContain('1.46');
  });

  it('ermittelt den Traufschub des Gespärres (kein Pfettendach)', () => {
    const a = res.assumptions.find(x => x.field === 'tragwerk.normalkraft');
    expect(a).toBeTruthy();
    const m = String(a!.reason).match(/Traufschub H = ([\d.]+) kN/);
    expect(m).toBeTruthy();
    const H = parseFloat(m![1]);
    expect(H).toBeGreaterThan(20);
    expect(H).toBeLessThan(25);   // Handrechnung 22,3 kN
    const n = String(a!.reason).match(/Sparrendruck N = ([\d.]+) kN/);
    const N = parseFloat(n![1]);
    expect(N).toBeGreaterThan(27);
    expect(N).toBeLessThan(32);   // Handrechnung 29,2 kN
  });

  it('weist den Sparren auf Druck + Biegung nach', () => {
    const sp = res.members.find(m => m.member.type === 'sparren')!;
    expect(sp.checks.some(c => c.name === 'Druck + Biegung')).toBe(true);
  });

  it('weist die Zange als Zugglied mit dem echten Traufschub nach', () => {
    const z = res.members.find(m => m.member.type === 'zange')!;
    expect(z.checks.some(c => c.name === 'Zug längs der Faser')).toBe(true);
    expect(z.checks.some(c => c.name === 'Anschluss Zange–Sparren')).toBe(true);
    expect(z.summary).toMatch(/Bolzen M12/);
    // 16 Zangenhölzer = 8 Paare, 16 Sparren-Gespärre → Zugkraft je Paar = 2 · H
    const a = res.assumptions.find(x => x.field.includes('Zangen') && x.field.endsWith('.last'));
    expect(a).toBeTruthy();
    const kn = parseFloat(String(a!.value).match(/([\d.]+) kN/)![1]);
    expect(kn).toBeGreaterThan(40);
    expect(kn).toBeLessThan(50);
  });

  it('rechnet den Steher mit Stützenabstand, nicht mit Sparrenabstand', () => {
    const withColumn = [
      ...members,
      member({ id: 'MP', name: 'Mittelpfette MP1', type: 'pfette', width: 120, height: 200, length: 12, quantity: 2 }),
      member({ id: 'ST', name: 'Steher ST1', type: 'stuetze', width: 120, height: 160, length: 2.0, quantity: 2 }),
    ];
    const r = autoCalculateAllMembers(withColumn, loads, geometry, 0.8, 4.0);
    const a = r.assumptions.find(x => x.field.includes('Steher') && x.field.endsWith('.last'))!;
    const n = parseFloat(String(a.value).match(/N_Ed=([\d.]+)/)![1]);
    // Lasteinzug 4,0 m × 2,60 m ≈ 10,4 m² → N ≈ 1,35·1,2·10,4 + 1,5·2,43·9,0 ≈ 49 kN
    expect(n).toBeGreaterThan(35);
    expect(n).toBeLessThan(70);
  });
});

describe('Biegeträger: maßgebende Lastkombination', () => {
  it('wählt die ständige Kombination wenn sie ungünstiger ist', () => {
    // Sehr hohe ständige Last, fast keine veränderliche → 1,35·G/0,6 maßgebend
    const r = calculateBeam({
      type: 'pfette', span: 4, b: 100, h: 200, timberClass: 'C24',
      qPermanent: 5, qVariable: 0.1, variableDuration: 'shortTerm', serviceClass: '1',
    });
    expect(r.checks[0].values['Kombination']).toMatch(/ständig \(/);
  });

  it('wählt die Schneekombination im Normalfall', () => {
    const r = calculateBeam({
      type: 'sparren', span: 4.9, b: 80, h: 200, timberClass: 'C24',
      qPermanent: 0.83, qVariable: 1.46, variableDuration: 'shortTerm', serviceClass: '1',
    });
    expect(r.checks[0].values['Kombination']).toMatch(/veränderlich/);
  });
});
