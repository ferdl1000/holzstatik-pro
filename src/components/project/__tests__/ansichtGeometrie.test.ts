/**
 * Geometrische Selbstprüfung der Dachansichten (3D-Tragwerk + schematischer Schnitt).
 *
 * ANLASS: Reklamation des Auftraggebers — „bei den schnitten und ansichten geht der
 * sparren nicht bis oben hin zur firstpfette und somit wird auch die berechnung
 * nicht stimmen."
 *
 * Geprüft wird NUMERISCH an den reinen Rechenfunktionen (kein Canvas-Screenshot):
 *   a) der Sparren reicht bis zum First (Satteldach: beide Sparren treffen sich
 *      in der Gebäudemitte),
 *   b) steht eine Firstpfette in der Bauteilliste, liegt der Sparren AUF ihr
 *      (OK Pfette = UK Sparren an der Firstlinie — keine Lücke, keine Durchdringung),
 *   c) die gezeichnete Sparrenneigung ist die Geometrie-Neigung,
 *   d) die gezeichnete Sparrenlänge ist die Länge aus der Bauteilliste.
 *
 * BEWUSSTE AUSNAHMEN (schematisch, weil es dafür keine Datenquelle gibt) sind
 * unten bei den jeweiligen Tests ausdrücklich dokumentiert.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RoofPart } from '@/types/roofParts';
import type { TimberMember, RoofFormType } from '@/types/project';

// three/@react-three brauchen WebGL — für die reinen Geometriefunktionen nicht nötig.
vi.mock('@react-three/fiber', () => ({
  Canvas: () => null, useFrame: () => {}, useThree: () => ({ camera: {}, gl: { domElement: {} }, invalidate: () => {} }),
}));
vi.mock('@react-three/drei', () => ({ Text: () => null, Line: () => null }));

import { buildPartBoxes, sparrenProfil, kervenTiefe, type BoxData } from '../Roof3D';
import { ansichtGeometrie } from '../RoofVisualization';

// ── Toleranzen (aus der Aufgabenstellung; NICHT aufweichen) ──────────────────
const TOL_M = 0.01;        // 1 cm
const TOL_LEN = 0.05;      // 5 cm
const TOL_GRAD = 0.5;      // 0,5°

const NEIGUNGEN = [5, 15, 30, 45, 60, 70];
const FORMEN: RoofFormType[] = ['satteldach', 'pultdach'];
const UEBERSTAND = 0.4;    // m — Default aus autoMembers/roofArea

const rad = (deg: number) => (deg * Math.PI) / 180;

// ── Testdaten: Geometrie + Bauteilliste exakt nach autoMembers ───────────────
function makeMember(p: Partial<TimberMember> & { name: string; type: TimberMember['type'] }): TimberMember {
  return {
    id: p.id ?? p.name,
    name: p.name,
    type: p.type,
    material: 'C24',
    width: p.width ?? 100,
    height: p.height ?? 220,
    length: p.length ?? 10,
    quantity: p.quantity ?? 1,
    crossSection: `${(p.width ?? 100) / 10}/${(p.height ?? 220) / 10}`,
    calculationStatus: 'green',
  } as TimberMember;
}

interface Fall {
  part: RoofPart;
  /** waagrechte Sparrenprojektion (Satteldach halbe, Pultdach volle Breite) */
  lauf: number;
  /** Sparrenlänge OHNE Überstand */
  sparrenLenGeom: number;
  sparrenMember: TimberMember;
  firstpfette?: TimberMember;
}

function baueFall(form: RoofFormType, pitchDeg: number, opts?: { mitFirstpfette?: boolean }): Fall {
  const length = 12;
  const width = 8;
  const eavesHeight = 4;
  const halfWidth = width / 2;
  const lauf = form === 'pultdach' ? width : halfWidth;
  // Geometrie in sich stimmig: ridgeHeight = eavesHeight + tan(α)·Lauf
  const ridgeHeight = eavesHeight + Math.tan(rad(pitchDeg)) * lauf;
  const sparrenLenGeom = Math.sqrt(lauf * lauf + (ridgeHeight - eavesHeight) ** 2);
  // Sparrenlänge wie in autoMembers: + Überstand auf der Schräge
  // (Satteldach 1×, Pultdach 2× — am First stößt beim Satteldach der Gegensparren)
  const ovSlope = UEBERSTAND / Math.max(Math.cos(rad(pitchDeg)), 0.5);
  const sparrenLen = +(sparrenLenGeom + ovSlope * (form === 'pultdach' ? 2 : 1)).toFixed(2);

  const sparrenMember = makeMember({
    id: 'SPR-1', name: 'Sparren S1-S32', type: 'sparren',
    width: 80, height: 160, length: sparrenLen, quantity: 32,
  });
  const mauerbank = makeMember({
    id: 'MB-1', name: 'Fußpfette (Mauerbank) 1-2', type: 'pfette',
    width: 140, height: 100, length, quantity: 2,
  });
  const firstpfette = makeMember({
    id: 'FP-1', name: 'Firstpfette FP1', type: 'pfette',
    width: 100, height: 220, length, quantity: 1,
  });
  const mittelpfette = makeMember({
    id: 'MP-1', name: 'Mittelpfette MP1', type: 'pfette',
    width: 100, height: 220, length, quantity: 1,
  });

  const members: TimberMember[] = [sparrenMember, mauerbank, mittelpfette];
  const mitFP = opts?.mitFirstpfette ?? form !== 'pultdach';
  if (mitFP) members.push(firstpfette);

  return {
    part: {
      id: 'main', kind: 'main', label: 'Hauptdach', form,
      positionX: 0, positionY: 0,
      geometry: { length, width, ridgeHeight, eavesHeight, pitch: pitchDeg, ridgeDirection: 'x' },
      members, confidence: 0.9,
    },
    lauf,
    sparrenLenGeom,
    sparrenMember,
    firstpfette: mitFP ? firstpfette : undefined,
  };
}

// ── Auswertung der 3D-Körper ────────────────────────────────────────────────
/**
 * Weltkoordinaten der Profilpunkte eines Sparrenkörpers.
 * Das Profil liegt in (x=quer, y=Höhe) und wird bei rot=[0,−π/2,0] so gedreht,
 * dass Profil-x auf die Welt-Z-Achse fällt (Extrusion entlang X = Sparrenbreite).
 */
function profilWelt(b: BoxData): { z: number; y: number }[] {
  expect(b.profile, `Bauteil ${b.key} hat kein Profil`).toBeTruthy();
  expect(b.rot[1]).toBeCloseTo(-Math.PI / 2, 6); // Profilebene quer zum First
  return b.profile!.map(([pz, py]) => ({ z: b.pos[2] + pz, y: b.pos[1] + py }));
}

function sparrenKoerper(boxes: BoxData[], memberId: string): BoxData[] {
  return boxes.filter((b) => b.memberId === memberId && b.profile);
}

describe('3D-Tragwerk: Sparren, First und Firstpfette (Roof3D.buildPartBoxes)', () => {
  for (const form of FORMEN) {
    for (const pitch of NEIGUNGEN) {
      const titel = `${form} ${pitch}°`;

      it(`${titel}: Sparren-Oberkante reicht auf Firsthöhe`, () => {
        const f = baueFall(form, pitch);
        const boxes = buildPartBoxes(f.part, 0, 0, {});
        const koerper = sparrenKoerper(boxes, f.sparrenMember.id);
        expect(koerper.length).toBeGreaterThan(0);
        const ridge = f.part.geometry.ridgeHeight;

        for (const k of koerper) {
          const pts = profilWelt(k);
          const yMax = Math.max(...pts.map((p) => p.y));
          // (a) höchster Punkt des Sparrenkörpers = Firsthöhe
          expect(Math.abs(yMax - ridge)).toBeLessThanOrEqual(TOL_M);
        }
      });

      it(`${titel}: Sparren treffen sich in der Gebäudemitte bzw. am Firstpunkt`, () => {
        const f = baueFall(form, pitch);
        const boxes = buildPartBoxes(f.part, 0, 0, {});
        const koerper = sparrenKoerper(boxes, f.sparrenMember.id);
        const ridge = f.part.geometry.ridgeHeight;
        // Querlage des Firstpunktes: Satteldach Gebäudemitte, Pultdach Hochseite
        const zFirstSoll = form === 'pultdach' ? -f.part.geometry.width / 2 : 0;

        if (form !== 'pultdach') {
          // beide Dachseiten müssen vorkommen
          const seiten = new Set(koerper.map((k) => Math.sign(k.profile![1][0])));
          expect(seiten.has(1) && seiten.has(-1)).toBe(true);
        }
        for (const k of koerper) {
          const pts = profilWelt(k);
          const hoechster = pts.reduce((a, p) => (p.y > a.y ? p : a), pts[0]);
          expect(Math.abs(hoechster.z - zFirstSoll)).toBeLessThanOrEqual(TOL_M);
          expect(Math.abs(hoechster.y - ridge)).toBeLessThanOrEqual(TOL_M);
        }
      });

      it(`${titel}: gezeichnete Sparrenneigung = Geometrie-Neigung`, () => {
        const f = baueFall(form, pitch);
        const boxes = buildPartBoxes(f.part, 0, 0, {});
        for (const k of sparrenKoerper(boxes, f.sparrenMember.id)) {
          const pts = profilWelt(k);
          // Oberkante: Punkt 0 = First, Punkt 1 = Sparrenende
          const dz = Math.abs(pts[1].z - pts[0].z);
          const dy = Math.abs(pts[0].y - pts[1].y);
          const grad = (Math.atan2(dy, dz) * 180) / Math.PI;
          expect(Math.abs(grad - pitch)).toBeLessThanOrEqual(TOL_GRAD);
        }
      });

      it(`${titel}: gezeichnete Sparrenlänge = Länge aus der Bauteilliste`, () => {
        const f = baueFall(form, pitch);
        const boxes = buildPartBoxes(f.part, 0, 0, {});
        for (const k of sparrenKoerper(boxes, f.sparrenMember.id)) {
          const pts = profilWelt(k);
          const len = Math.hypot(pts[1].z - pts[0].z, pts[1].y - pts[0].y);
          expect(Math.abs(len - f.sparrenMember.length)).toBeLessThanOrEqual(TOL_LEN);
        }
      });

      it(`${titel}: Firstpfette trägt den Sparren (OK Pfette = UK Sparren)`, () => {
        // Pultdach hat konstruktionsbedingt KEINE Firstpfette — dort wird nur
        // geprüft, dass auch keine gezeichnet wird.
        const f = baueFall(form, pitch, { mitFirstpfette: true });
        const boxes = buildPartBoxes(f.part, 0, 0, {});
        const fpBox = boxes.find((b) => b.memberId === 'FP-1');

        if (form === 'pultdach') {
          expect(fpBox).toBeUndefined();
          return;
        }
        expect(fpBox, 'Firstpfette steht in der Bauteilliste, fehlt aber im 3D').toBeTruthy();

        const okPfette = fpBox!.pos[1] + fpBox!.dims[1] / 2;
        // Unterkante Sparren an der Firstlinie (z = Gebäudemitte)
        const k = sparrenKoerper(boxes, f.sparrenMember.id)[0];
        const pts = profilWelt(k);
        const amFirst = pts.filter((p) => Math.abs(p.z - 0) < 1e-6);
        expect(amFirst.length).toBeGreaterThanOrEqual(2); // lotrechter Firstschnitt
        const ukSparren = Math.min(...amFirst.map((p) => p.y));

        // keine Lücke UND keine Durchdringung
        expect(Math.abs(okPfette - ukSparren)).toBeLessThanOrEqual(TOL_M);
        // Pfette liegt außerdem mittig unter dem First
        expect(Math.abs(fpBox!.pos[2])).toBeLessThanOrEqual(TOL_M);
      });
    }
  }

  it('Firstpfette wandert mit der Sparrenhöhe mit (keine feste Annahme)', () => {
    const f = baueFall('satteldach', 30, { mitFirstpfette: true });
    const dick = {
      ...f.part,
      members: f.part.members.map((m) => (m.type === 'sparren' ? { ...m, height: 280 } : m)),
    };
    const boxes = buildPartBoxes(dick, 0, 0, {});
    const fp = boxes.find((b) => b.memberId === 'FP-1')!;
    const pts = profilWelt(sparrenKoerper(boxes, f.sparrenMember.id)[0]);
    const uk = Math.min(...pts.filter((p) => Math.abs(p.z) < 1e-6).map((p) => p.y));
    expect(Math.abs(fp.pos[1] + fp.dims[1] / 2 - uk)).toBeLessThanOrEqual(TOL_M);
  });

  it('Mittelpfette trägt den Sparren in der Kervensohle', () => {
    const f = baueFall('satteldach', 30, { mitFirstpfette: true });
    const boxes = buildPartBoxes(f.part, 0, 0, {});
    const mp = boxes.find((b) => b.memberId === 'MP-1')!;
    const okPfette = mp.pos[1] + mp.dims[1] / 2;
    // Kervensohle des Sparrens über der talseitigen Pfettenkante
    const geo = f.part.geometry;
    const tan = (geo.ridgeHeight - geo.eavesHeight) / f.lauf;
    const hV = 0.16 / Math.cos(Math.atan(tan));
    const zStoss = Math.abs(mp.pos[2]) + 0.05;
    const sohle = geo.ridgeHeight - zStoss * tan - hV + kervenTiefe(hV, tan);
    expect(Math.abs(okPfette - sohle)).toBeLessThanOrEqual(TOL_M);
  });

  it('ohne Firstpfette in der Bauteilliste wird auch keine gezeichnet', () => {
    const f = baueFall('satteldach', 30, { mitFirstpfette: false });
    const boxes = buildPartBoxes(f.part, 0, 0, {});
    expect(boxes.some((b) => b.memberId === 'FP-1')).toBe(false);
    // der Sparren reicht trotzdem bis zum First
    const pts = profilWelt(sparrenKoerper(boxes, f.sparrenMember.id)[0]);
    expect(Math.abs(Math.max(...pts.map((p) => p.y)) - f.part.geometry.ridgeHeight)).toBeLessThanOrEqual(TOL_M);
  });

  it('Dachteil-Versatz verschiebt Sparren und Firstpfette gemeinsam', () => {
    const f = baueFall('satteldach', 30, { mitFirstpfette: true });
    const boxes = buildPartBoxes(f.part, 3, 12, {});
    const fp = boxes.find((b) => b.memberId === 'FP-1')!;
    expect(Math.abs(fp.pos[2] - 12)).toBeLessThanOrEqual(TOL_M);
    const pts = profilWelt(sparrenKoerper(boxes, f.sparrenMember.id)[0]);
    const hoechster = pts.reduce((a, p) => (p.y > a.y ? p : a), pts[0]);
    expect(Math.abs(hoechster.z - 12)).toBeLessThanOrEqual(TOL_M);
    expect(Math.abs(fp.pos[1] + fp.dims[1] / 2 - Math.min(...pts.filter(p => Math.abs(p.z - 12) < 1e-6).map(p => p.y))))
      .toBeLessThanOrEqual(TOL_M);
  });

  /**
   * BEWUSSTE AUSNAHME — Mauerbank/Fußpfette.
   * Trauf- und Firsthöhe beziehen sich in dieser Anwendung auf die DACHFLÄCHE
   * (Sparren-Oberkante). Wo genau die Mauerkrone darunter endet, steht weder in
   * `geometry` noch in `members` — die Mauerbank wird deshalb schematisch auf
   * Traufhöhe gelegt (Mauerwerk ist bauseits). Geprüft wird nur, dass sie
   * überhaupt an der Traufe liegt und nicht über den First wandert.
   */
  it('Mauerbank bleibt schematisch auf Traufhöhe (dokumentierte Ausnahme)', () => {
    const f = baueFall('satteldach', 30);
    const boxes = buildPartBoxes(f.part, 0, 0, {});
    const mb = boxes.filter((b) => b.memberId === 'MB-1');
    expect(mb.length).toBe(2);
    for (const b of mb) {
      expect(b.pos[1]).toBeGreaterThan(f.part.geometry.eavesHeight - TOL_M);
      expect(b.pos[1]).toBeLessThan(f.part.geometry.ridgeHeight);
      expect(Math.abs(Math.abs(b.pos[2]) - (f.part.geometry.width / 2 - 0.15))).toBeLessThanOrEqual(TOL_M);
    }
  });
});

describe('sparrenProfil: Zimmerer-Schnitte bleiben in sich stimmig', () => {
  it('lotrechter Firstschnitt: Ober- und Unterkante liegen auf derselben Querlage', () => {
    const pts = sparrenProfil(0, 4.2, 6.31, Math.tan(rad(30)), 0.185, [3.9]);
    const first = pts.filter((p) => Math.abs(p[0]) < 1e-9);
    expect(first.length).toBe(2);
    expect(Math.abs((first[0][1] - first[1][1]) - 0.185)).toBeLessThan(1e-9);
  });

  it('Kerventiefe bleibt ≤ h/4', () => {
    for (const pitch of NEIGUNGEN) {
      const hV = 0.16 / Math.cos(rad(pitch));
      expect(kervenTiefe(hV, Math.tan(rad(pitch)))).toBeLessThanOrEqual(hV / 4 + 1e-9);
    }
  });
});

describe('Schnitt-Ansicht (RoofVisualization.ansichtGeometrie)', () => {
  for (const form of FORMEN) {
    for (const pitch of NEIGUNGEN) {
      it(`${form} ${pitch}°: gezeichnete Dachschräge = Geometrie-Neigung`, () => {
        const f = baueFall(form, pitch);
        const a = ansichtGeometrie({
          buildingWidth: f.part.geometry.width,
          eavesH: f.part.geometry.eavesHeight,
          ridgeH: f.part.geometry.ridgeHeight,
          form,
          sparrenHoehe: 0.16,
          sparrenLaenge: f.sparrenMember.length,
          ueberstand: UEBERSTAND,
        });
        expect(Math.abs(a.neigungGrad - pitch)).toBeLessThanOrEqual(TOL_GRAD);
        for (const s of a.sparren) {
          expect(Math.abs(s.neigungGrad - pitch)).toBeLessThanOrEqual(TOL_GRAD);
        }
      });

      it(`${form} ${pitch}°: Sparren läuft bis zum First und liegt auf der Firstpfette`, () => {
        const f = baueFall(form, pitch);
        const geo = f.part.geometry;
        const a = ansichtGeometrie({
          buildingWidth: geo.width, eavesH: geo.eavesHeight, ridgeH: geo.ridgeHeight,
          form, sparrenHoehe: 0.16, sparrenLaenge: f.sparrenMember.length, ueberstand: UEBERSTAND,
        });
        const firstX = form === 'pultdach' ? 0 : geo.width / 2;
        for (const s of a.sparren) {
          expect(Math.abs(s.okFirst[0] - firstX)).toBeLessThanOrEqual(TOL_M);
          expect(Math.abs(s.okFirst[1] - geo.ridgeHeight)).toBeLessThanOrEqual(TOL_M);
          // Oberkante ist die höchste Linie des Sparrens
          expect(s.okFirst[1]).toBeGreaterThan(s.ukFirst[1]);
        }
        // Oberkante Firstpfette = Unterkante Sparren am First
        expect(Math.abs(a.firstpfetteOkY - a.sparren[0].ukFirst[1])).toBeLessThanOrEqual(TOL_M);
      });

      it(`${form} ${pitch}°: gezeichnete Sparrenlänge passt zur Bauteilliste`, () => {
        const f = baueFall(form, pitch);
        const geo = f.part.geometry;
        const a = ansichtGeometrie({
          buildingWidth: geo.width, eavesH: geo.eavesHeight, ridgeH: geo.ridgeHeight,
          form, sparrenHoehe: 0.16, sparrenLaenge: f.sparrenMember.length, ueberstand: UEBERSTAND,
        });
        // BEWUSSTE FESTLEGUNG (in beiden Ansichten gleich): der gesamte Überstand
        // wird an der TRAUFE gezeichnet. Beim Pultdach rechnet autoMembers mit
        // Überstand an beiden Enden — wie er sich aufteilt, steht in keiner
        // Datenquelle. So bleibt der Hochpunkt exakt auf Firsthöhe UND die
        // gezeichnete Länge ist die bestellte.
        for (const s of a.sparren) {
          expect(Math.abs(s.laenge - f.sparrenMember.length)).toBeLessThanOrEqual(TOL_LEN);
        }
      });
    }
  }

  it('Satteldach: beide Sparren treffen sich in der Gebäudemitte', () => {
    const a = ansichtGeometrie({ buildingWidth: 8, eavesH: 4, ridgeH: 6.31, form: 'satteldach', sparrenHoehe: 0.16 });
    expect(a.sparren.length).toBe(2);
    expect(a.sparren[0].okFirst[0]).toBeCloseTo(4, 6);
    expect(a.sparren[1].okFirst[0]).toBeCloseTo(4, 6);
    expect(a.sparren[0].okFirst[1]).toBeCloseTo(a.sparren[1].okFirst[1], 6);
    // je ein Sparren nach links und nach rechts
    expect(Math.sign(a.sparren[0].okTraufe[0] - 4)).toBe(-1);
    expect(Math.sign(a.sparren[1].okTraufe[0] - 4)).toBe(1);
  });

  it('Mittelpfetten liegen unter der Sparren-Oberkante, nicht darüber', () => {
    const a = ansichtGeometrie({ buildingWidth: 8, eavesH: 4, ridgeH: 6.31, form: 'satteldach', sparrenHoehe: 0.16 });
    const tan = (6.31 - 4) / 4;
    for (const mp of a.mittelpfetten) {
      const ok = 6.31 - Math.abs(mp.x - 4) * tan;
      expect(mp.okY).toBeLessThan(ok);
      expect(Math.abs(ok - mp.okY - a.hVSparren)).toBeLessThanOrEqual(TOL_M);
    }
  });
});
