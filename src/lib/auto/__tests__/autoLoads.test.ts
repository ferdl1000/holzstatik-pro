import { describe, it, expect } from 'vitest';
import { autoComputeLoads } from '../autoLoads';
import type { BuildingGeometry, LoadCase } from '@/types/project';

function nwc(value: number, unit = 'm') {
  return { value, unit, confidence: 0.9, source: 'extracted' as const };
}

const geometry: BuildingGeometry = {
  length: nwc(20), width: nwc(10), ridgeHeight: nwc(7), eavesHeight: nwc(4.5),
  roofPitch: { value: 10, unit: '°', confidence: 0.9, source: 'extracted' },
  spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
};

function confirmedLoad(overrides: Partial<LoadCase>): LoadCase {
  return {
    id: 'x', name: 'x', type: 'permanent', value: 1, unit: 'kN/m²',
    source: 'manuell', confidence: 0.5, isEditable: true, userModified: true, parameters: {},
    ...overrides,
  };
}

describe('autoComputeLoads — respektiert vom Nutzer bestätigte Lasten', () => {
  it('berechnet ohne existingLoadCases wie bisher (kein Override)', async () => {
    const r = await autoComputeLoads(undefined, geometry, 'satteldach', undefined);
    expect(r.loadCases.length).toBeGreaterThan(0);
    expect(r.loadCases.every(lc => !lc.source.includes('vom Nutzer bestätigt'))).toBe(true);
  });

  it('übernimmt eine im Lasten-Tab bestätigte Schneelast statt sie neu zu berechnen', async () => {
    const existing: LoadCase[] = [
      confirmedLoad({ id: 'lc-snow', name: 'Schneelast', type: 'snow', value: 4.2 }),
    ];
    const r = await autoComputeLoads(undefined, geometry, 'satteldach', undefined, existing);
    const snow = r.loadCases.find(lc => lc.type === 'snow' && lc.value >= 0);
    expect(snow?.value).toBe(4.2);
    expect(snow?.userModified).toBe(true);
    expect(snow?.source).toContain('vom Nutzer bestätigt');
  });

  it('ignoriert existierende Lasten, die NICHT bestätigt sind (userModified=false)', async () => {
    const fresh = await autoComputeLoads(undefined, geometry, 'satteldach', undefined);
    const unconfirmed: LoadCase[] = [
      confirmedLoad({ id: 'lc-snow', name: 'Schneelast', type: 'snow', value: 99, userModified: false }),
    ];
    const r = await autoComputeLoads(undefined, geometry, 'satteldach', undefined, unconfirmed);
    const snow = r.loadCases.find(lc => lc.type === 'snow' && lc.value >= 0);
    const freshSnow = fresh.loadCases.find(lc => lc.type === 'snow' && lc.value >= 0);
    expect(snow?.value).toBe(freshSnow?.value);
    expect(snow?.value).not.toBe(99);
  });

  it('überschreibt NIE den Windsog (negativer Wert) mit einer Wind-Druck-Bestätigung', async () => {
    const existing: LoadCase[] = [
      confirmedLoad({ id: 'lc-wind', name: 'Windlast (Druck)', type: 'wind', value: 1.5 }),
    ];
    const r = await autoComputeLoads(undefined, geometry, 'satteldach', undefined, existing);
    const druck = r.loadCases.find(lc => lc.type === 'wind' && lc.value >= 0);
    const sog = r.loadCases.find(lc => lc.type === 'wind' && lc.value < 0);
    expect(druck?.value).toBe(1.5);
    expect(sog).toBeDefined();
    expect(sog!.value).toBeLessThan(0);
    expect(sog!.source).not.toContain('vom Nutzer bestätigt');
  });

  it('übernimmt bestätigtes Eigengewicht', async () => {
    const existing: LoadCase[] = [
      confirmedLoad({ id: 'lc-eg', name: 'Eigengewicht Dachaufbau', type: 'permanent', value: 1.1 }),
    ];
    const r = await autoComputeLoads(undefined, geometry, 'satteldach', undefined, existing);
    const eg = r.loadCases.find(lc => lc.type === 'permanent');
    expect(eg?.value).toBe(1.1);
  });
});
