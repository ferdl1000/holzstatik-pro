import { describe, it, expect } from 'vitest';
import { pruefeErgebnis, neigungAusHoehen, erwarteteSparrenlaenge } from '../selfCheck';
import { runAutoPipeline } from '../autoPipeline';
import type { BuildingGeometry, TimberMember, Project } from '@/types/project';

function nwc(value: number, unit: string, confidence = 0.9) {
  return { value, unit, confidence, source: 'extracted' as const };
}

function geom(width: number, pitch: number, eaves: number, ridge: number, length = 12): BuildingGeometry {
  return {
    length: nwc(length, 'm'), width: nwc(width, 'm'),
    ridgeHeight: nwc(ridge, 'm'), eavesHeight: nwc(eaves, 'm'),
    roofPitch: nwc(pitch, '°'),
    spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
  };
}

function sparren(len: number): TimberMember {
  return {
    id: 'S', name: 'Sparren S1-S32', type: 'sparren', width: 80, height: 160,
    length: len, quantity: 32, material: 'C24', crossSection: '8/16',
  } as TimberMember;
}

const mauerbank = {
  id: 'MB', name: 'Fußpfette (Mauerbank) 1-2', type: 'pfette', width: 140, height: 100,
  length: 12, quantity: 2, material: 'C24', crossSection: '14/10',
} as TimberMember;

describe('Gegenprüfung: gerechnet, gezeichnet und Plan müssen zusammenpassen', () => {
  it('schlägt Alarm, wenn der Plan 5° sagt und die Höhen 70° ergeben', () => {
    // Genau der vom Auftraggeber gemeldete Fall: DN 5° steht dran, der Sparren
    // sieht aber aus wie 70°, weil First/Traufe etwas ganz anderes hergeben.
    const g = geom(9, 5, 4.5, 4.5 + 4.5 * Math.tan(70 * Math.PI / 180));
    const r = pruefeErgebnis({
      geometry: g, roofForm: 'satteldach',
      members: [sparren(erwarteteSparrenlaenge(g, 'satteldach', 0.4)), mauerbank],
      planNeigung: 5, sparrenSpacing: 0.8, roofOverhang: 0.4,
    });

    expect(r.bestanden).toBe(false);
    const blocker = r.befunde.filter(b => b.schwere === 'blocker');
    expect(blocker.some(b => b.id === 'neigung.hoehen')).toBe(true);
    // Und die Prüfung liefert eine reparierte Geometrie zum Neurechnen mit
    expect(r.reparierteGeometrie).toBeDefined();
    expect(neigungAusHoehen(r.reparierteGeometrie!, 'satteldach')).toBeCloseTo(5, 1);
  });

  it('schlägt Alarm, wenn die Berechnung von der Planbeschriftung abweicht', () => {
    // Geometrie in sich stimmig bei 30°, im Plan steht aber 25°
    const g = geom(9, 30, 4.5, 4.5 + 4.5 * Math.tan(30 * Math.PI / 180));
    const r = pruefeErgebnis({
      geometry: g, roofForm: 'satteldach',
      members: [sparren(erwarteteSparrenlaenge(g, 'satteldach', 0.4)), mauerbank],
      planNeigung: 25, sparrenSpacing: 0.8, roofOverhang: 0.4,
    });
    expect(r.bestanden).toBe(false);
    expect(r.befunde.some(b => b.id === 'neigung.plan')).toBe(true);
    expect(r.reparierteGeometrie!.roofPitch.value).toBe(25);
  });

  it('erkennt eine Sparrenlänge, die nicht zur Geometrie passt', () => {
    const g = geom(9, 30, 4.5, 4.5 + 4.5 * Math.tan(30 * Math.PI / 180));
    const r = pruefeErgebnis({
      geometry: g, roofForm: 'satteldach',
      members: [sparren(3.0), mauerbank],   // viel zu kurz
      sparrenSpacing: 0.8, roofOverhang: 0.4,
    });
    expect(r.befunde.some(b => b.id === 'sparren.laenge' && b.schwere === 'blocker')).toBe(true);
  });

  it('lässt ein in sich stimmiges Ergebnis durch', () => {
    const g = geom(9, 30, 4.5, 4.5 + 4.5 * Math.tan(30 * Math.PI / 180));
    const r = pruefeErgebnis({
      geometry: g, roofForm: 'satteldach',
      members: [sparren(erwarteteSparrenlaenge(g, 'satteldach', 0.4)), mauerbank],
      planNeigung: 30, sparrenSpacing: 0.8, roofOverhang: 0.4,
    });
    expect(r.bestanden).toBe(true);
    expect(r.befunde.filter(b => b.schwere === 'blocker')).toHaveLength(0);
  });

  it('blockiert, wenn im Plan kein Bauort steht — die Schneelast wäre geraten', () => {
    const g = geom(9, 30, 4.5, 4.5 + 4.5 * Math.tan(30 * Math.PI / 180));
    const r = pruefeErgebnis({
      geometry: g, roofForm: 'satteldach',
      members: [sparren(erwarteteSparrenlaenge(g, 'satteldach', 0.4)), mauerbank],
      planNeigung: 30, sparrenSpacing: 0.8, roofOverhang: 0.4,
      standortIstErsatz: true,
      standortText: '1010 Wien (Ersatz), Schneezone 2, 171 m',
    });
    expect(r.bestanden).toBe(false);
    const b = r.befunde.find(x => x.id === 'standort.ersatz')!;
    expect(b.schwere).toBe('blocker');
    expect(b.bedeutung).toMatch(/Schneelast/);
  });

  it('deckt die drei Widersprüche auf, die der echte Nöhrer-Plan geliefert hat', () => {
    // Projekt sagt Satteldach, der Dachteil ist als Flachdach geführt, heißt
    // aber "Halle Pultdach" und hat 5° Neigung — und er ist viel kleiner als
    // das Gebäude. Genau so kam es aus der Plananalyse heraus.
    const g = geom(9.75, 5, 3.26, 3.26 + 4.875 * Math.tan(5 * Math.PI / 180), 18.75);
    const r = pruefeErgebnis({
      geometry: g, roofForm: 'satteldach',
      members: [sparren(erwarteteSparrenlaenge(g, 'satteldach', 0.4)), mauerbank],
      sparrenSpacing: 0.8, roofOverhang: 0.4,
      projektDachform: 'satteldach',
      dachteile: [{
        id: 'main', label: 'Halle Pultdach', kind: 'main', form: 'flachdach',
        geometry: { length: 7.5, width: 6.7, pitch: 5, eavesHeight: 3.26, ridgeHeight: 3.83 },
      }],
    });

    expect(r.bestanden).toBe(false);
    const ids = r.befunde.filter(b => b.schwere === 'blocker').map(b => b.id);
    expect(ids).toContain('dachform.widerspruch');      // Satteldach vs. Flachdach
    expect(ids).toContain('dachteil.main.form');        // Flachdach mit 5° Neigung
    expect(ids).toContain('dachteil.grundflaeche');     // 50 m² Dach auf 183 m² Gebäude
  });

  it('lässt einen stimmigen Dachteil durch', () => {
    const g = geom(9, 30, 4.5, 4.5 + 4.5 * Math.tan(30 * Math.PI / 180), 12);
    const r = pruefeErgebnis({
      geometry: g, roofForm: 'satteldach',
      members: [sparren(erwarteteSparrenlaenge(g, 'satteldach', 0.4)), mauerbank],
      planNeigung: 30, sparrenSpacing: 0.8, roofOverhang: 0.4,
      projektDachform: 'satteldach',
      dachteile: [{
        id: 'main', label: 'Hauptdach', kind: 'main', form: 'satteldach',
        geometry: { length: 12, width: 9, pitch: 30, eavesHeight: 4.5, ridgeHeight: 4.5 + 4.5 * Math.tan(30 * Math.PI / 180) },
      }],
    });
    expect(r.bestanden).toBe(true);
  });

  it('meldet fehlende Mauerbank', () => {
    const g = geom(9, 30, 4.5, 4.5 + 4.5 * Math.tan(30 * Math.PI / 180));
    const r = pruefeErgebnis({
      geometry: g, roofForm: 'satteldach',
      members: [sparren(erwarteteSparrenlaenge(g, 'satteldach', 0.4))],
      sparrenSpacing: 0.8, roofOverhang: 0.4,
    });
    expect(r.befunde.some(b => b.id === 'mauerbank.fehlt')).toBe(true);
  });
});

describe('Pipeline rechnet bei nicht bestandener Gegenprüfung automatisch neu', () => {
  it('korrigiert eine widersprüchliche Geometrie und liefert am Ende ein bestandenes Ergebnis', async () => {
    // Plan sagt 5°, die Höhen ergeben aber rund 70°.
    const widerspruch = geom(9, 5, 4.5, 4.5 + 4.5 * Math.tan(70 * Math.PI / 180));
    const project = {
      id: 'p1', name: 'Widerspruchstest', description: '', createdAt: '', updatedAt: '',
      status: 'yellow', currentStep: 1, documents: [],
      geometry: widerspruch,
      roofType: { form: 'satteldach', confidence: 0.9, alternatives: [], userConfirmed: false },
      // Echter Bauort — sonst schlägt (zu Recht) der Standort-Blocker an
      address: {
        street: 'Musterweg', houseNumber: '1', postalCode: '8230', city: 'Hartberg',
        state: 'Steiermark', country: 'Österreich', confidence: 0.9,
        source: 'auto_extracted', alternatives: [],
      },
      loadCases: [], materials: [], members: [], calculations: [],
      validationIssues: [], auditEntries: [],
    } as unknown as Project;

    const r = await runAutoPipeline({ project, sparrenSpacing: 0.8, useOptimizer: true });

    // Das fertige Ergebnis MUSS die Gegenprüfung bestehen …
    expect(r.gegenpruefung).toBeDefined();
    expect(r.gegenpruefung!.bestanden).toBe(true);

    // … gezeichnete und gerechnete Neigung decken sich (das ist der Punkt:
    // die Zeichnung leitet ihren Winkel aus First/Traufe ab)
    const gezeichnet = neigungAusHoehen(r.geometry.geometry, 'satteldach');
    expect(Math.abs(gezeichnet - r.geometry.geometry.roofPitch.value)).toBeLessThan(1);
    expect(r.geometry.geometry.roofPitch.value).toBeCloseTo(5, 1);

    // … die Sparrenlänge passt zur bereinigten Geometrie, nicht zur alten
    const spr = r.members.members.find(m => m.type === 'sparren')!;
    expect(spr.length).toBeCloseTo(erwarteteSparrenlaenge(r.geometry.geometry, 'satteldach', 0.4), 1);

    // … und der Widerspruch steht schwarz auf weiß in den Annahmen, damit der
    // Meister ihn am Plan nachkontrollieren kann (still korrigieren gilt nicht)
    expect(r.allAssumptions.some(a => /Widerspruch/i.test(a.reason))).toBe(true);
  });
});
