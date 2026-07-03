import { describe, it, expect } from 'vitest';
import { runAutoPipeline } from '@/lib/auto/autoPipeline';
import { EMPTY_PROJECT } from '@/data/mockProject';
import type { Project } from '@/types/project';

function nwc(v: number, unit = 'm') { return { value: v, unit, confidence: 0.9, source: 'extracted' as const }; }

describe('Preis-Stabilität bei wiederholter Analyse', () => {
  it('zweiter Pipeline-Lauf auf dem Ergebnis des ersten liefert DENSELBEN Preis', async () => {
    const base: Project = {
      ...EMPTY_PROJECT, id: 'p1', name: 'T', members: [], loadCases: [],
      geometry: { length: nwc(20), width: nwc(8), ridgeHeight: nwc(4.5), eavesHeight: nwc(3.5),
        roofPitch: { value: 10, unit: '°', confidence: 0.9, source: 'extracted' },
        spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false },
      roofType: { form: 'pultdach', confidence: 0.9, alternatives: [], userConfirmed: false } as any,
      ceilings: [{ id: 'c1', level: 'EG', area: 120, span: 5, nutzung: 'Lager', confidence: 0.8 }] as any,
      roofParts: [
        { id: 'main', kind: 'main', label: 'Hauptdach', form: 'pultdach', positionX: 0, positionY: 0,
          geometry: { length: 20, width: 8, ridgeHeight: 4.5, eavesHeight: 3.5, pitch: 10, ridgeDirection: 'x' },
          members: [], confidence: 0.9 },
        { id: 'v1', kind: 'vordach', label: 'Vordach 1', form: 'flachdach', positionX: 0, positionY: 6,
          geometry: { length: 6, width: 3, ridgeHeight: 3.5, eavesHeight: 3, pitch: 3, ridgeDirection: 'x' },
          members: [], confidence: 0.6 },
      ] as any,
    };
    const r1 = await runAutoPipeline({ project: base, sparrenSpacing: 0.8, useOptimizer: true });
    const p2: Project = { ...base, members: r1.calculations.optimizedMembers, loadCases: r1.loads.loadCases,
      ...(r1.roofParts ? { roofParts: r1.roofParts } : {}) } as Project;
    const r2 = await runAutoPipeline({ project: p2, sparrenSpacing: 0.8, useOptimizer: true });
    const g1 = r1.costs.withLabor?.gross ?? 0;
    const g2 = r2.costs.withLabor?.gross ?? 0;
    console.log('LAUF1:', g1.toFixed(0), 'Members:', r1.calculations.optimizedMembers.length,
      '| LAUF2:', g2.toFixed(0), 'Members:', r2.calculations.optimizedMembers.length);
    expect(Math.abs(g2 - g1) / g1).toBeLessThan(0.02);
    // Deckenbalken dürfen nur EINMAL existieren (nicht je Dachteil dupliziert)
    const db1 = r1.calculations.optimizedMembers.filter(m => m.name.includes('Deckenbalken'));
    console.log('Deckenbalken-Einträge:', db1.map(d => `${d.name} n=${d.quantity}`).join('; '));
    expect(db1.length).toBeLessThanOrEqual(1);
  });
});
