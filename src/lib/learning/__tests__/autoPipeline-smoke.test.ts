import { describe, it, expect } from 'vitest';
import { runAutoPipeline } from '../../auto/autoPipeline';
import { EMPTY_PROJECT } from '../../../data/mockProject';
import type { Project, BuildingGeometry } from '../../../types/project';

/** Geometrie wie nach einer KI-Analyse (Lechner: Pultdach, 8 m breit). */
function nwc(value: number, unit = 'm') {
  return { value, unit, confidence: 0.9, source: 'extracted' as const };
}
const geometry: BuildingGeometry = {
  length: nwc(21.8), width: nwc(8), ridgeHeight: nwc(6.26), eavesHeight: nwc(4.65),
  roofPitch: { value: 10, unit: '°', confidence: 0.9, source: 'extracted' },
  spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
};

describe('runAutoPipeline — Auto-Modell aus Basis-Daten (füllt alle Reiter)', () => {
  it('erzeugt aus Geometrie allein echte Bauteile, Lasten, Bemessung und Kosten', async () => {
    const project: Project = {
      ...EMPTY_PROJECT, id: 't1', name: 'Test',
      geometry, members: [], loadCases: [],
      address: { plz: '8230', city: 'Hartberg', state: 'Steiermark' } as any,
    };
    const r = await runAutoPipeline({ project, sparrenSpacing: 0.8, useOptimizer: true });

    // Bauteile (Tragwerk/Berechnung/Werkstatt/BOM)
    expect(r.calculations.optimizedMembers.length).toBeGreaterThan(0);
    // Lasten (Lasten-Reiter)
    expect(r.loads.loadCases.length).toBeGreaterThan(0);
    // Bemessung pro Bauteil (Berechnung-Reiter)
    expect(r.calculations.members.length).toBeGreaterThan(0);
    // jede Ausnutzung ist eine endliche, plausible Zahl (kein NaN/Infinity)
    for (const m of r.calculations.members) {
      expect(Number.isFinite(m.maxUtilization)).toBe(true);
      expect(m.maxUtilization).toBeGreaterThanOrEqual(0);
      expect(m.maxUtilization).toBeLessThan(100);
    }
    // Kosten (Kosten-Reiter) > 0
    expect(r.costs.withLabor.gross).toBeGreaterThan(0);
  });

  it('läuft auch mit minimalen Default-Werten ohne zu werfen', async () => {
    const project: Project = { ...EMPTY_PROJECT, id: 't2', name: 'Leer', members: [], loadCases: [] };
    const r = await runAutoPipeline({ project, sparrenSpacing: 0.8, useOptimizer: true });
    expect(r.calculations.optimizedMembers.length).toBeGreaterThan(0);
  });
});
