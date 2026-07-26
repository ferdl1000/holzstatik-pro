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
  it('ohne Beleg im Plan: GAR KEINE Holzsteher (Pfetten lagern auf Wänden, bauseits)', () => {
    const { members: defaultMembers, assumptions } = autoGenerateMembers(geometry, roofType, pfettendach(undefined));
    // Regel des Auftraggebers: wo im Plan kein Steher eingezeichnet ist, wird
    // auch keiner erzeugt, bemessen, eingepreist oder gezeichnet.
    expect(defaultMembers.some(m => m.type === 'stuetze')).toBe(false);
    expect(assumptions.some(a => a.field === 'stuetze.auflager' && /kein Holzsteher eingezeichnet/.test(a.reason))).toBe(true);
    expect(defaultMembers.some(m => m.name.includes('Zwischensteher'))).toBe(false);
  });

  it('beschrifteter Stützenquerschnitt im Plan gilt als Beleg → Steher werden erzeugt', () => {
    const { members } = autoGenerateMembers(geometry, roofType, pfettendach(undefined), {
      planSections: [{ member: 'stuetze', b: 120, h: 120, raw: 'Stütze 12/12' }],
    });
    const st = members.find(m => m.type === 'stuetze');
    expect(st).toBeDefined();
    expect(st!.quantity).toBeGreaterThan(0);
    // Querschnitt kommt aus der Planbeschriftung, nicht aus dem Default 10/10
    expect(st!.width).toBe(120);
    expect(st!.height).toBe(120);
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
  it('kleinerer Stützenabstand → kürzere Pfettenstützweite → schwächerer Querschnitt reicht', async () => {
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
    // Kürzere Stützweite → geringeres Biegemoment → es reicht ein schwächerer
    // Querschnitt. (Die Ausnutzung selbst bleibt hoch, weil der Optimierer das
    // Profil bis knapp unter die Grenze verkleinert — verglichen wird deshalb
    // das Widerstandsmoment, nicht η.)
    const wy = (s: { b: number; h: number }) => s.b * s.h * s.h / 6;
    expect(wy(narrowPfette!.section)).toBeLessThan(wy(widePfette!.section));
  });
});
