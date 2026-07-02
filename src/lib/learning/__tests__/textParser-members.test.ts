import { describe, it, expect } from 'vitest';
import { parseSparrenabstand, parseMemberSections, parseAllFacts } from '../../../../supabase/functions/_shared/textParser';
import { autoGenerateMembers } from '@/lib/auto/autoMembers';
import type { BuildingGeometry, RoofType, StructuralSystem } from '@/types/project';

describe('parseSparrenabstand — Sparrenabstand direkt aus dem Plan', () => {
  it('liest "Sparrenabstand 80 cm"', () => {
    expect(parseSparrenabstand('Sparren 8/16, Sparrenabstand 80 cm')).toBe(0.8);
  });
  it('liest "e = 90 cm" nur mit Sparren-Kontext', () => {
    expect(parseSparrenabstand('Sparren C24 e = 90 cm lt. Statik')).toBe(0.9);
    // ohne Kontext (könnte irgendein Maß sein) → null
    expect(parseSparrenabstand('Beton e = 90 cm Fundament')).toBeNull();
  });
  it('liest Meter-Angaben: "Achsabstand 0,625 m" → 0,625', () => {
    expect(parseSparrenabstand('Achsabstand 0,625 m')).toBe(0.625);
  });
  it('verwirft unplausible Werte (>150 cm / <30 cm)', () => {
    expect(parseSparrenabstand('Sparrenabstand 400 cm')).toBeNull();
    expect(parseSparrenabstand('Sparrenabstand 10 cm')).toBeNull();
  });
  it('häufigster Wert gewinnt bei mehreren Angaben', () => {
    expect(parseSparrenabstand('Sparrenabstand 80 cm ... Sparrenabstand 80 cm ... Sparrenabstand 75 cm')).toBe(0.8);
  });
});

describe('parseMemberSections — beschriftete Querschnitte', () => {
  it('liest "Sparren 8/16" als cm → 80/160 mm', () => {
    expect(parseMemberSections('Sparren 8/16 C24')).toEqual([
      expect.objectContaining({ member: 'sparren', b: 80, h: 160 }),
    ]);
  });
  it('liest "Pfette 10/22 cm" und "Stütze 12/12"', () => {
    const r = parseMemberSections('Firstpfette Pfette 10/22 cm, Steher 12/12');
    expect(r).toContainEqual(expect.objectContaining({ member: 'pfette', b: 100, h: 220 }));
    expect(r).toContainEqual(expect.objectContaining({ member: 'stuetze', b: 120, h: 120 }));
  });
  it('mm-Angaben bleiben mm: "Sparren 100/200 mm"', () => {
    expect(parseMemberSections('Sparren 100/200 mm')).toEqual([
      expect.objectContaining({ member: 'sparren', b: 100, h: 200 }),
    ]);
  });
  it('verwirft Unplausibles (Maßstab "1/50" fängt es nicht)', () => {
    expect(parseMemberSections('Grundriss Sparren M 1/50')).toEqual([]);
  });
  it('parseAllFacts liefert beide neuen Felder', () => {
    const f = parseAllFacts('Sparren 8/16, Sparrenabstand 80 cm, DN 22°');
    expect(f.sparrenSpacing).toBe(0.8);
    expect(f.memberSections.length).toBe(1);
  });
});

describe('autoGenerateMembers — Plan-Querschnitte schlagen Defaults', () => {
  const nwc = (value: number, unit = 'm') => ({ value, unit, confidence: 0.9, source: 'extracted' as const });
  const geometry: BuildingGeometry = {
    length: nwc(20), width: nwc(9), ridgeHeight: nwc(6.5), eavesHeight: nwc(4),
    roofPitch: { value: 30, unit: '°', confidence: 0.9, source: 'extracted' },
    spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
  };
  const roofType: RoofType = { form: 'satteldach', confidence: 0.9, alternatives: [], userConfirmed: false };
  const sys: StructuralSystem = { type: 'pfettendach', confidence: 0.9, reasoning: 't', alternatives: [], userConfirmed: false };

  it('nutzt Plan-Querschnitt 10/20 für Sparren statt Default 8/16', () => {
    const { members, assumptions } = autoGenerateMembers(geometry, roofType, sys, {
      planSections: [{ member: 'sparren', b: 100, h: 200, raw: 'Sparren 10/20' }],
    });
    const spr = members.find(m => m.type === 'sparren');
    expect(spr?.crossSection).toBe('10/20');
    expect(assumptions.some(a => a.reason.includes('Planbeschriftung'))).toBe(true);
  });
  it('ohne Plan-Angabe bleibt der Default 8/16', () => {
    const { members } = autoGenerateMembers(geometry, roofType, sys, {});
    expect(members.find(m => m.type === 'sparren')?.crossSection).toBe('8/16');
  });
});
