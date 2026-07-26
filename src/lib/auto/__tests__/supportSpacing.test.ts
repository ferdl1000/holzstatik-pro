import { describe, it, expect } from 'vitest';
import { autoGenerateMembers } from '../autoMembers';
import { autoCalculateAllMembers } from '../autoCalculate';
import type { BuildingGeometry, RoofType, StructuralSystem } from '@/types/project';

function nwc(value: number, unit = 'm') {
  return { value, unit, confidence: 0.9, source: 'extracted' as const };
}

const geometry: BuildingGeometry = {
  length: nwc(24), width: nwc(9), ridgeHeight: nwc(6.5), eavesHeight: nwc(4),
  roofPitch: { value: 30, unit: '°', confidence: 0.9, source: 'extracted' },
  spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
};

const roofType: RoofType = { form: 'satteldach', confidence: 0.9, alternatives: [], userConfirmed: false };

function pfettendach(supportSpacing?: number): StructuralSystem {
  return {
    type: 'pfettendach', confidence: 0.9, reasoning: 'test',
    alternatives: [], userConfirmed: false, supportSpacing,
  };
}

describe('supportSpacing — konfigurierbarer Stützenabstand (autoMembers)', () => {
  it('ohne expliziten Stützenabstand: nur 1–2 Lastverteilungs-Steher (Pfetten lagern auf Wänden)', () => {
    const { members: defaultMembers, assumptions } = autoGenerateMembers(geometry, roofType, pfettendach(undefined));
    const stuetzenDefault = defaultMembers.filter(m => m.type === 'stuetze' && m.name.startsWith('Stützen'));
    expect(stuetzenDefault[0]?.quantity).toBeLessThanOrEqual(2);
    expect(assumptions.some(a => a.field === 'stuetze.auflager' && a.reason.includes('tragende'))).toBe(true);
    // KEINE automatischen Zwischensteher-Reihen mehr
    expect(defaultMembers.some(m => m.name.includes('Zwischensteher'))).toBe(false);
  });

  it('explizit gesetzter Stützenabstand (Holzriegel/Halle) erzeugt volle Steher-Reihen', () => {
    const { members: defaultMembers } = autoGenerateMembers(geometry, roofType, pfettendach(undefined));
    const { members: explicit4 } = autoGenerateMembers(geometry, roofType, pfettendach(4.0));
    const nDefault = defaultMembers.find(m => m.type === 'stuetze' && m.name.startsWith('Stützen'))?.quantity ?? 0;
    const nExplicit = explicit4.find(m => m.type === 'stuetze' && m.name.startsWith('Stützen'))?.quantity ?? 0;
    expect(nExplicit).toBeGreaterThan(nDefault);
  });

  it('engerer Stützenabstand erzeugt MEHR Stützen', () => {
    const { members: wide } = autoGenerateMembers(geometry, roofType, pfettendach(4.0));
    const { members: narrow } = autoGenerateMembers(geometry, roofType, pfettendach(2.0));
    const wideCount = wide.find(m => m.type === 'stuetze' && m.name.startsWith('Stützen'))?.quantity ?? 0;
    const narrowCount = narrow.find(m => m.type === 'stuetze' && m.name.startsWith('Stützen'))?.quantity ?? 0;
    expect(narrowCount).toBeGreaterThan(wideCount);
  });
});

describe('supportSpacing — reduziert die statische Pfettenstützweite (autoCalculate)', () => {
  it('kleinerer Stützenabstand → kürzere Pfettenstützweite → geringere Ausnutzung möglich', async () => {
    const { members } = autoGenerateMembers(geometry, roofType, pfettendach(4.0));
    const loads = { gk: 0.6, sk: 1.8 };

    const wideResult = autoCalculateAllMembers(members, loads, geometry, 0.8, 4.0);
    const narrowResult = autoCalculateAllMembers(members, loads, geometry, 0.8, 2.0);

    // Nur echte First-/Mittelpfetten — die Mauerbank liegt satt auf der
    // Mauerkrone und hat gar keine freie Stützweite.
    const istTragendePfette = (m: { member: { type: string; name: string } }) =>
      m.member.type === 'pfette' && /first|mittel/i.test(m.member.name);
    const widePfette = wideResult.members.find(istTragendePfette);
    const narrowPfette = narrowResult.members.find(istTragendePfette);
    expect(widePfette).toBeDefined();
    expect(narrowPfette).toBeDefined();
    // Kürzere Stützweite → geringeres Biegemoment → geringere max. Ausnutzung
    expect(narrowPfette!.maxUtilization).toBeLessThan(widePfette!.maxUtilization);
  });
});
