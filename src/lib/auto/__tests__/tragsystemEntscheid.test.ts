import { describe, it, expect } from 'vitest';
import { runAutoPipeline } from '@/lib/auto/autoPipeline';
import { EMPTY_PROJECT } from '@/data/mockProject';
import type { Project } from '@/types/project';

function nwc(v: number, unit = 'm') { return { value: v, unit, confidence: 0.9, source: 'extracted' as const }; }

function makeProject(width: number, ridge: number, eaves: number, form: string): Project {
  return {
    ...EMPTY_PROJECT, id: 'p', name: 'T', members: [], loadCases: [],
    geometry: { length: nwc(12), width: nwc(width), ridgeHeight: nwc(ridge), eavesHeight: nwc(eaves),
      roofPitch: { value: 30, unit: '°', confidence: 0.9, source: 'extracted' },
      spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false },
    roofType: { form, confidence: 0.9, alternatives: [], userConfirmed: false } as any,
  } as Project;
}

describe('Statischer Tragsystem-Entscheid (Zimmerer-Praxis: keine unnötigen Pfetten)', () => {
  it('Satteldach 9 m / Sparrenlänge ~5.4 m → Kehlbalkendach: KEINE First-/Mittelpfetten, Kehlbalken + Mauerbank vorhanden', async () => {
    // Nöhrer-Fall: 9 m breit, First 6.5 / Traufe 4.5 → slen = sqrt(4.5² + 2²) ≈ 4.92?
    // Nein: rise 2.0, halb 4.5 → 4.92 ≤ 5 → sparrendach. Nimm First 7.1 → rise 2.6 → slen 5.2 → kehlbalkendach.
    const r = await runAutoPipeline({ project: makeProject(9, 7.1, 4.5, 'satteldach'), sparrenSpacing: 0.8, useOptimizer: true });
    expect(r.structuralSystem.structuralSystem.type).toBe('kehlbalkendach');
    const members = r.calculations.optimizedMembers;
    expect(members.some(m => m.type === 'pfette' && /first/i.test(m.name))).toBe(false);
    expect(members.some(m => m.type === 'pfette' && /mittel/i.test(m.name))).toBe(false);
    expect(members.some(m => m.type === 'kehlbalken')).toBe(true);
    expect(members.some(m => /mauerbank/i.test(m.name))).toBe(true);
    expect(members.some(m => m.type === 'stuetze')).toBe(false);
  });

  it('kleines Satteldach (7 m, Sparren ~4 m) → Sparrendach mit Zangen, ganz ohne Pfetten außer Mauerbank', async () => {
    const r = await runAutoPipeline({ project: makeProject(7, 6.0, 4.0, 'satteldach'), sparrenSpacing: 0.8, useOptimizer: true });
    expect(r.structuralSystem.structuralSystem.type).toBe('sparrendach');
    const members = r.calculations.optimizedMembers;
    expect(members.some(m => m.type === 'pfette' && !/mauerbank/i.test(m.name))).toBe(false);
    expect(members.some(m => m.type === 'zange')).toBe(true);
    expect(members.some(m => /mauerbank/i.test(m.name))).toBe(true);
  });

  it('großes Satteldach (14 m): Varianten-Vergleich wählt die günstigste Variante OHNE rote Nachweise', async () => {
    const r = await runAutoPipeline({ project: makeProject(14, 8.0, 4.0, 'satteldach'), sparrenSpacing: 0.8, useOptimizer: true });
    // Der Preis entscheidet ('viele Wege führen nach Rom') — beide Varianten
    // werden voll durchgerechnet und dokumentiert; keine roten Nachweise erlaubt.
    const vergleich = r.allAssumptions.find(a => a.field === 'tragsystem.variantenvergleich');
    expect(vergleich).toBeDefined();
    expect(vergleich!.reason).toContain('€');
    expect(r.calculations.members.some(m => m.overallStatus === 'red')).toBe(false);
    expect(['kehlbalkendach', 'pfettendach_mittelpfette']).toContain(r.structuralSystem.structuralSystem.type);
    // Der Gewinner ist die im Vergleich dokumentierte Wahl
    expect(vergleich!.value).toBe(r.structuralSystem.structuralSystem.type);
  });

  it('Pultdach rechnet mit der VOLLEN Breite (8 m → keine Sparrendach-Fehlentscheidung) und ohne Zangen', async () => {
    const r = await runAutoPipeline({ project: makeProject(8, 4.5, 3.5, 'pultdach'), sparrenSpacing: 0.8, useOptimizer: true });
    // slen = sqrt(8² + 1²) ≈ 8.06 > 6.5 → Pfettendach, NICHT sparrendach
    expect(r.structuralSystem.structuralSystem.type).toBe('pfettendach_mittelpfette');
    expect(r.calculations.optimizedMembers.some(m => m.type === 'zange')).toBe(false);
  });

  it('vom Nutzer BESTÄTIGTES Tragsystem wird nie überstimmt', async () => {
    const p = makeProject(9, 7.1, 4.5, 'satteldach');
    (p as any).structuralSystem = { type: 'pfettendach_mittelpfette', confidence: 1, reasoning: 'Nutzer', alternatives: [], userConfirmed: true };
    const r = await runAutoPipeline({ project: p, sparrenSpacing: 0.8, useOptimizer: true });
    expect(r.structuralSystem.structuralSystem.type).toBe('pfettendach_mittelpfette');
  });
});
