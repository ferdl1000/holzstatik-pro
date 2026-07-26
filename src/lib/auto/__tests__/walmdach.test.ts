import { describe, it, expect } from 'vitest';
import { autoGenerateMembers } from '../autoMembers';
import type { BuildingGeometry, RoofType, StructuralSystem } from '@/types/project';

function nwc(value: number, unit = 'm') {
  return { value, unit, confidence: 0.9, source: 'extracted' as const };
}

const geometry: BuildingGeometry = {
  length: nwc(14), width: nwc(9), ridgeHeight: nwc(6.5), eavesHeight: nwc(4.5),
  roofPitch: { value: 30, unit: '°', confidence: 0.9, source: 'extracted' },
  spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
};

const system: StructuralSystem = {
  type: 'pfettendach_mittelpfette', confidence: 0.9, reasoning: 'test',
  alternatives: [], userConfirmed: false,
};

function bauteile(form: RoofType['form']) {
  const roofType: RoofType = { form, confidence: 0.9, alternatives: [], userConfirmed: false };
  return autoGenerateMembers(geometry, roofType, system);
}

describe('Walmdach bekommt Gratsparren und Schifter', () => {
  const walm = bauteile('walmdach');
  const sattel = bauteile('satteldach');

  it('enthält vier Gratsparren', () => {
    const grat = walm.members.find(m => m.name.startsWith('Gratsparren'));
    expect(grat).toBeDefined();
    expect(grat!.quantity).toBe(4);
  });

  it('Gratsparren sind länger und stärker als die normalen Sparren', () => {
    const grat = walm.members.find(m => m.name.startsWith('Gratsparren'))!;
    const sparren = walm.members.find(m => m.name.startsWith('Sparren'))!;
    expect(grat.length).toBeGreaterThan(sparren.length);
    expect(grat.height).toBeGreaterThan(sparren.height);
  });

  it('enthält Walmschifter', () => {
    const schifter = walm.members.find(m => m.name.startsWith('Walmschifter'));
    expect(schifter).toBeDefined();
    expect(schifter!.quantity).toBeGreaterThan(0);
  });

  it('Firstpfette ist kürzer als das Gebäude', () => {
    const first = walm.members.find(m => m.name.startsWith('Firstpfette'));
    expect(first).toBeDefined();
    expect(first!.length).toBeLessThan(geometry.length.value);
    // Walm: First = Länge − Breite = 14 − 9 = 5 m
    expect(first!.length).toBeCloseTo(5, 1);
  });

  it('hat weniger volle Sparren als das gleich große Satteldach', () => {
    const wSpr = walm.members.find(m => m.name.startsWith('Sparren'))!.quantity;
    const sSpr = sattel.members.find(m => m.name.startsWith('Sparren'))!.quantity;
    expect(wSpr).toBeLessThan(sSpr);
  });

  it('Satteldach bekommt weiterhin KEINE Gratsparren und den First über die volle Länge', () => {
    expect(sattel.members.some(m => m.name.startsWith('Gratsparren'))).toBe(false);
    // Lange Pfetten werden für den Transport gestoßen — deshalb die Summe aller
    // Firstpfetten-Teilstücke vergleichen, nicht die Länge eines Stücks.
    const firstLfm = sattel.members
      .filter(m => m.name.startsWith('Firstpfette'))
      .reduce((s, m) => s + m.length * m.quantity, 0);
    expect(firstLfm).toBeCloseTo(geometry.length.value, 1);
  });

  it('Krüppelwalm walmt nur teilweise ab — First bleibt länger als beim Vollwalm', () => {
    const krueppel = bauteile('krueppelwalmdach');
    const kFirst = krueppel.members.find(m => m.name.startsWith('Firstpfette'))!.length;
    const wFirst = walm.members.find(m => m.name.startsWith('Firstpfette'))!.length;
    expect(kFirst).toBeGreaterThan(wFirst);
    expect(krueppel.members.some(m => m.name.startsWith('Gratsparren'))).toBe(true);
  });
});
