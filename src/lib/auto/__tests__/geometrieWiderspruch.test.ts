import { describe, it, expect } from 'vitest';
import { autoDeriveGeometry } from '../autoDerive';
import type { BuildingGeometry, RoofType } from '@/types/project';

function nwc(value: number, unit: string, confidence: number) {
  return { value, unit, confidence, source: 'extracted' as const };
}

function geom(pitch: number, pitchConf: number, ridge: number, ridgeConf: number): BuildingGeometry {
  return {
    length: nwc(12, 'm', 0.9), width: nwc(9, 'm', 0.9),
    ridgeHeight: nwc(ridge, 'm', ridgeConf), eavesHeight: nwc(4.5, 'm', 0.9),
    roofPitch: nwc(pitch, '°', pitchConf),
    spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
  };
}

const sattel: RoofType = { form: 'satteldach', confidence: 0.9, alternatives: [], userConfirmed: false };
const pult: RoofType = { form: 'pultdach', confidence: 0.9, alternatives: [], userConfirmed: false };

describe('Widerspruch zwischen beschrifteter Neigung und Höhenmaßen', () => {
  it('korrigiert die Firsthöhe, wenn die beschriftete Neigung zuverlässiger ist', () => {
    // 12 × 9 m, Traufe 4,5 m, First 6,5 m → das sind 24°, beschriftet ist 30°
    const r = autoDeriveGeometry(geom(30, 0.9, 6.5, 0.5), sattel);
    // 4,5 m halbe Breite × tan 30° = 2,598 → First 7,098
    expect(r.geometry.ridgeHeight.value).toBeCloseTo(7.098, 2);
    expect(r.geometry.roofPitch.value).toBe(30);
    expect(r.assumptions.some(a => a.field === 'ridgeHeight' && /Widerspruch/.test(a.reason))).toBe(true);
  });

  it('korrigiert die Neigung, wenn die Höhenmaße zuverlässiger sind', () => {
    const r = autoDeriveGeometry(geom(30, 0.4, 6.5, 0.95), sattel);
    expect(r.geometry.ridgeHeight.value).toBe(6.5);
    expect(r.geometry.roofPitch.value).toBeCloseTo(23.96, 1);
    expect(r.assumptions.some(a => a.field === 'roofPitch' && /Widerspruch/.test(a.reason))).toBe(true);
  });

  it('lässt stimmige Geometrie unangetastet', () => {
    // 4,5 m × tan 30° = 2,598 → First 7,098 passt zu 30°
    const r = autoDeriveGeometry(geom(30, 0.9, 7.098, 0.9), sattel);
    expect(r.geometry.ridgeHeight.value).toBeCloseTo(7.098, 2);
    expect(r.geometry.roofPitch.value).toBe(30);
    expect(r.assumptions.some(a => /Widerspruch/.test(a.reason))).toBe(false);
  });

  it('rechnet beim Pultdach mit der vollen Gebäudebreite', () => {
    // Pultdach 9 m breit, Traufe 4,5 m, 20° → First = 4,5 + 9·tan20° = 7,776
    const r = autoDeriveGeometry(
      { ...geom(20, 0.9, 0, 0), ridgeHeight: { value: 0, unit: 'm', confidence: 0, source: 'assumed' } },
      pult,
    );
    expect(r.geometry.ridgeHeight.value).toBeCloseTo(4.5 + 9 * Math.tan(20 * Math.PI / 180), 2);
  });
});
