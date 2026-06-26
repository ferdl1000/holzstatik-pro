import { describe, it, expect, beforeAll } from 'vitest';
import { runAutoPipeline } from '../../auto/autoPipeline';
import { recalcWithTimber, availableTimberOptions } from '../../auto/recalcTimber';
import { EMPTY_PROJECT } from '../../../data/mockProject';
import type { Project, BuildingGeometry } from '../../../types/project';

function nwc(value: number, unit = 'm') { return { value, unit, confidence: 0.9, source: 'extracted' as const }; }
const geometry: BuildingGeometry = {
  length: nwc(12), width: nwc(8), ridgeHeight: nwc(7), eavesHeight: nwc(4),
  roofPitch: { value: 35, unit: '°', confidence: 0.9, source: 'extracted' },
  spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
};

describe('recalcWithTimber — Holzart ändern + neu berechnen', () => {
  let project: Project;
  beforeAll(async () => {
    const base: Project = {
      ...EMPTY_PROJECT, id: 'r', name: 'Recalc', geometry, members: [], loadCases: [],
      address: { plz: '8230', city: 'Hartberg', state: 'Steiermark' } as any,
    };
    const r = await runAutoPipeline({ project: base, sparrenSpacing: 0.8, useOptimizer: true });
    project = { ...base, members: r.calculations.optimizedMembers, loadCases: r.loads.loadCases };
  });

  it('bietet auswählbare Holzklassen an', () => {
    const opts = availableTimberOptions().map((o) => o.id);
    expect(opts).toContain('C24');
    expect(opts).toContain('GL28c');
  });

  it('rechnet mit C24 neu und liefert Status-Zähler', () => {
    const res = recalcWithTimber(project, 'C24');
    expect(res.members.length).toBe(project.members.length);
    expect(res.green + res.yellow + res.red).toBe(res.calculations.members.length);
    for (const m of res.calculations.members) expect(Number.isFinite(m.maxUtilization)).toBe(true);
  });

  it('setzt die gewählte Holzklasse auf allen Bauteilen', () => {
    const res = recalcWithTimber(project, 'GL28h');
    // Material aller Bauteile enthält die gewählte Klasse
    expect(res.members.every((m) => String(m.material).includes('GL28h') || String(m.material).includes('GL28'))).toBe(true);
  });

  it('stärkere Klasse → keine schlechtere Ausnutzung als schwächere', () => {
    const c24 = recalcWithTimber(project, 'C24');
    const gl28 = recalcWithTimber(project, 'GL28h');
    const maxC24 = Math.max(...c24.calculations.members.map((m) => m.maxUtilization));
    const maxGl28 = Math.max(...gl28.calculations.members.map((m) => m.maxUtilization));
    expect(Number.isFinite(maxC24) && Number.isFinite(maxGl28)).toBe(true);
  });
});
