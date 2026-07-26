/**
 * GEOMETRISCHE SELBSTPRÜFUNG DER 2D-SCHNITTE
 * ==========================================
 *
 * Anlass ist die Reklamation des Zimmermeisters:
 *   „bei den schnitten und ansichten geht der sparren nicht bis oben hin zur
 *    firstpfette und somit wird auch die berechnung nicht stimmen"
 *   „wenn im plan DN 5 grad steht und ich sehe sparren die aussehen wie
 *    70 grad dann stimmt etwas nicht"
 *
 * Dieser Test LIEST NICHT DEN CODE, sondern RENDERT die Zeichnungen und
 * VERMISST das entstandene SVG: aus den x/y-Attributen der erzeugten
 * <line>/<polygon>/<rect>-Elemente wird nachgerechnet, was auf dem Blatt steht.
 *
 * Geprüfte Invarianten (für 5°…70°, Satteldach UND Pultdach):
 *   a) GEZEICHNETER WINKEL = GEOMETRIE-WINKEL        (Toleranz 1,0°)
 *   b) SPARREN REICHT BIS ZUM FIRST und liegt dort
 *      auf der Firstpfette auf                        (Toleranz 2 px)
 *   c) MASSSTAB IST ISOTROP (1 m waagrecht = 1 m lotrecht)
 *   d) NICHTS LÄUFT AUS DEM BILD (alles innerhalb der viewBox)
 *
 * Die Geometrie der Prüffälle ist in sich stimmig:
 *   ridgeHeight = eavesHeight + tan(pitch) · Spannweite
 *   (Satteldach: halbe Breite, Pultdach: volle Breite)
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Querschnitt, Laengsschnitt, DetailTraufe } from '../SchnittViews';
import type { BuildingGeometry, TimberMember } from '@/types/project';

// ── Prüffälle ───────────────────────────────────────────────────────────────
const NEIGUNGEN = [5, 10, 15, 25, 30, 45, 60, 70];
const FORMEN = ['satteldach', 'pultdach'] as const;

const BREITE = 9;      // m lichte Gebäudebreite
const LAENGE = 12;     // m Gebäudelänge
const TRAUFE = 4.5;    // m Traufhöhe (OK Mauerbank)
const UEBERSTAND = 0.4; // m Dachüberstand

/** Toleranzen — bewusst eng, ein Bauplan verzeiht nichts. */
const TOL_WINKEL = 1.0;   // °
const TOL_PX = 2.0;       // px

function nwc(value: number, unit: string) {
  return { value, unit, confidence: 0.9, source: 'extracted' as const };
}

/** In sich stimmige Geometrie: die Firsthöhe FOLGT aus Neigung und Spannweite. */
function geometrie(pitchDeg: number, form: string): BuildingGeometry {
  const spann = form === 'pultdach' ? BREITE : BREITE / 2;
  const ridge = TRAUFE + Math.tan((pitchDeg * Math.PI) / 180) * spann;
  return {
    length: nwc(LAENGE, 'm'), width: nwc(BREITE, 'm'),
    ridgeHeight: nwc(ridge, 'm'), eavesHeight: nwc(TRAUFE, 'm'),
    roofPitch: nwc(pitchDeg, '°'),
    spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
  };
}

/** Pfettendach: Firstpfette + Mittelpfetten + Steher stehen in der Liste. */
const PFETTENDACH: TimberMember[] = [
  { id: 'S', name: 'Sparren S1-S32', type: 'sparren', width: 80, height: 160, length: 5.7, quantity: 32, material: 'C24', crossSection: '8/16' },
  { id: 'MB', name: 'Fußpfette (Mauerbank) 1-2', type: 'pfette', width: 140, height: 100, length: 12, quantity: 2, material: 'C24', crossSection: '14/10' },
  { id: 'FP', name: 'Firstpfette', type: 'pfette', width: 100, height: 220, length: 12, quantity: 1, material: 'C24', crossSection: '10/22' },
  { id: 'MP', name: 'Mittelpfetten', type: 'pfette', width: 100, height: 220, length: 12, quantity: 2, material: 'C24', crossSection: '10/22' },
  { id: 'ST', name: 'Pfettenstützen', type: 'stuetze', width: 100, height: 100, length: 1.6, quantity: 6, material: 'C24', crossSection: '10/10' },
] as TimberMember[];

/** Sparren-/Kehlbalkendach: KEINE Pfetten außer der Mauerbank. */
const SPARRENDACH: TimberMember[] = [
  { id: 'S', name: 'Sparren S1-S32', type: 'sparren', width: 80, height: 160, length: 5.7, quantity: 32, material: 'C24', crossSection: '8/16' },
  { id: 'MB', name: 'Fußpfette (Mauerbank) 1-2', type: 'pfette', width: 140, height: 100, length: 12, quantity: 2, material: 'C24', crossSection: '14/10' },
  { id: 'K', name: 'Kehlbalken K1-K8', type: 'kehlbalken', width: 80, height: 160, length: 3, quantity: 8, material: 'C24', crossSection: '8/16' },
] as TimberMember[];

// ── SVG einlesen und vermessen ──────────────────────────────────────────────
function svgDoc(markup: string): Document {
  const mitNs = markup.includes('xmlns=')
    ? markup
    : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const doc = new DOMParser().parseFromString(mitNs, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror').length).toBe(0);
  return doc;
}

const attr = (el: Element, name: string) => parseFloat(el.getAttribute(name) ?? 'NaN');

function teile(doc: Document, name: string): Element[] {
  return Array.from(doc.querySelectorAll(`[data-teil="${name}"]`));
}
function einTeil(doc: Document, name: string): Element {
  const t = teile(doc, name);
  expect(t.length, `Bauteil "${name}" fehlt in der Zeichnung`).toBeGreaterThan(0);
  return t[0];
}

function punkte(el: Element): Array<[number, number]> {
  return (el.getAttribute('points') ?? '').trim().split(/\s+/)
    .map(p => p.split(',').map(Number) as [number, number]);
}

/**
 * Endpunkte einer Maßlinie. Die Pfeilspitzen der Bemaßung liegen EXAKT auf den
 * bemaßten Punkten (erster Punkt jedes Pfeil-Polygons) — damit ist das Maß aus
 * der gezeichneten Grafik gemessen und nicht aus Metadaten abgelesen.
 */
function massStrecke(doc: Document, name: string) {
  const g = doc.querySelector(`[data-mass="${name}"]`);
  expect(g, `Maßlinie "${name}" fehlt`).not.toBeNull();
  const polys = Array.from(g!.querySelectorAll('polygon'));
  expect(polys.length).toBe(2);
  const [x1, y1] = punkte(polys[0])[0];
  const [x2, y2] = punkte(polys[1])[0];
  return { x1, y1, x2, y2, dx: x2 - x1, dy: y2 - y1 };
}

/** Winkel einer Strecke gegen die Waagrechte, in Grad (y zeigt nach unten). */
function winkelGrad(dx: number, dy: number): number {
  return (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
}

function abstandPunktGerade(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.abs((px - x1) * dy - (py - y1) * dx) / Math.hypot(dx, dy);
}

function inDefs(el: Element): boolean {
  let p: Element | null = el.parentElement;
  while (p) {
    if (p.tagName.toLowerCase() === 'defs' || p.tagName.toLowerCase() === 'pattern') return true;
    p = p.parentElement;
  }
  return false;
}

/**
 * Alle gezeichneten Koordinaten, die außerhalb der viewBox liegen.
 * Textelemente werden mit ihrem Ankerpunkt geprüft (die tatsächliche Textbreite
 * ist in jsdom nicht messbar — Schriftlänge ist deshalb bewusst nicht Teil der
 * Prüfung, Ankerpunkte sehr wohl).
 */
function ausserhalbViewBox(doc: Document): string[] {
  const svg = doc.documentElement;
  const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const raus: string[] = [];
  const pruefe = (was: string, x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < vx - 0.01 || x > vx + vw + 0.01 || y < vy - 0.01 || y > vy + vh + 0.01) {
      raus.push(`${was} → (${x.toFixed(1)}|${y.toFixed(1)})`);
    }
  };
  for (const el of Array.from(doc.querySelectorAll('line'))) {
    if (inDefs(el)) continue;
    pruefe('line', attr(el, 'x1'), attr(el, 'y1'));
    pruefe('line', attr(el, 'x2'), attr(el, 'y2'));
  }
  for (const el of Array.from(doc.querySelectorAll('rect'))) {
    if (inDefs(el)) continue;
    const x = attr(el, 'x'), y = attr(el, 'y');
    pruefe('rect', x, y);
    pruefe('rect', x + attr(el, 'width'), y + attr(el, 'height'));
  }
  for (const el of Array.from(doc.querySelectorAll('polygon'))) {
    if (inDefs(el)) continue;
    for (const [x, y] of punkte(el)) pruefe('polygon', x, y);
  }
  for (const el of Array.from(doc.querySelectorAll('text'))) {
    if (inDefs(el)) continue;
    pruefe(`text "${(el.textContent ?? '').slice(0, 18)}"`, attr(el, 'x'), attr(el, 'y'));
  }
  // Einziger <path> ist der Neigungsbogen "M x,y A r,r 0 f,f ex,ey"
  for (const el of Array.from(doc.querySelectorAll('path'))) {
    if (inDefs(el)) continue;
    const n = (el.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (n.length >= 4) {
      pruefe('path-start', n[0], n[1]);
      pruefe('path-ende', n[n.length - 2], n[n.length - 1]);
    }
  }
  return raus;
}

// ════════════════════════════════════════════════════════════════════════════
// QUERSCHNITT
// ════════════════════════════════════════════════════════════════════════════
describe('Querschnitt — die gezeichnete Neigung ist die gerechnete', () => {
  for (const form of FORMEN) {
    for (const pitch of NEIGUNGEN) {
      const geo = geometrie(pitch, form);
      const ridgeH = geo.ridgeHeight.value;
      const doc = () => svgDoc(renderToStaticMarkup(
        <Querschnitt geometry={geo} members={PFETTENDACH} roofForm={form} roofOverhang={UEBERSTAND} />,
      ));

      it(`${form} ${pitch}°: c) Maßstab isotrop — 1 m waagrecht = 1 m lotrecht`, () => {
        const d = doc();
        const breite = massStrecke(d, 'breite');
        const traufe = massStrecke(d, 'traufhoehe');
        const first = massStrecke(d, 'firsthoehe');

        const sWaagrecht = Math.abs(breite.dx) / BREITE;
        const sLotrecht = Math.abs(traufe.dy) / TRAUFE;
        const sFirst = Math.abs(first.dy) / ridgeH;

        expect(sWaagrecht).toBeGreaterThan(1);
        expect(Math.abs(sWaagrecht - sLotrecht) / sWaagrecht).toBeLessThan(0.005);
        expect(Math.abs(sWaagrecht - sFirst) / sWaagrecht).toBeLessThan(0.005);

        // … und die Maßlinien bemaßen wirklich das, was gezeichnet ist:
        const wandL = einTeil(d, 'wand-links'), wandR = einTeil(d, 'wand-rechts');
        expect(Math.abs(breite.x1 - (attr(wandL, 'x') + attr(wandL, 'width')))).toBeLessThan(0.5);
        expect(Math.abs(breite.x2 - attr(wandR, 'x'))).toBeLessThan(0.5);
        // Traufhöhe endet an der Oberkante der Mauerbank = Auflagerebene
        expect(Math.abs(traufe.y2 - attr(einTeil(d, 'mauerbank'), 'y'))).toBeLessThan(0.5);
      });

      it(`${form} ${pitch}°: a) gezeichneter Sparrenwinkel = ${pitch}°`, () => {
        const d = doc();
        const sparren = teile(d, 'sparren');
        expect(sparren.length).toBe(form === 'pultdach' ? 1 : 2);
        for (const l of sparren) {
          const w = winkelGrad(attr(l, 'x2') - attr(l, 'x1'), attr(l, 'y2') - attr(l, 'y1'));
          expect(Math.abs(w - pitch), `gezeichnet ${w.toFixed(2)}° statt ${pitch}°`).toBeLessThan(TOL_WINKEL);
        }
      });

      it(`${form} ${pitch}°: b) Sparren reicht bis zum First`, () => {
        const d = doc();
        const traufe = massStrecke(d, 'traufhoehe');
        const wandL = einTeil(d, 'wand-links'), wandR = einTeil(d, 'wand-rechts');
        const s = Math.abs(traufe.dy) / TRAUFE;              // px je m
        const xLinks = attr(wandL, 'x') + attr(wandL, 'width');
        const xRechts = attr(wandR, 'x');
        const yBoden = traufe.y1;
        const yFirst = yBoden - ridgeH * s;
        // Satteldach: First über der Gebäudemitte. Pultdach: der First IST die
        // hohe Traufe — dort läuft der Sparren als Überstand darüber hinaus,
        // deshalb wird die Firstlage an der Sparrenlinie geprüft, nicht am Ende.
        const xFirst = form === 'pultdach' ? xRechts : (xLinks + xRechts) / 2;

        for (const l of teile(d, 'sparren')) {
          const x1 = attr(l, 'x1'), y1 = attr(l, 'y1'), x2 = attr(l, 'x2'), y2 = attr(l, 'y2');
          if (form === 'pultdach') {
            expect(abstandPunktGerade(xFirst, yFirst, x1, y1, x2, y2)).toBeLessThan(TOL_PX);
            expect(Math.max(x1, x2)).toBeGreaterThanOrEqual(xRechts - 0.01);  // Überstand am First
          } else {
            const oben = y1 < y2 ? [x1, y1] : [x2, y2];
            expect(Math.hypot(oben[0] - xFirst, oben[1] - yFirst),
              `Sparrenende (${oben[0].toFixed(1)}|${oben[1].toFixed(1)}) trifft Firstpunkt (${xFirst.toFixed(1)}|${yFirst.toFixed(1)}) nicht`,
            ).toBeLessThan(TOL_PX);
          }
        }
      });

      if (form === 'satteldach') {
        it(`${form} ${pitch}°: b) Sparren liegt auf der Firstpfette auf (keine Lücke, kein Eindringen)`, () => {
          const d = doc();
          const traufe = massStrecke(d, 'traufhoehe');
          const s = Math.abs(traufe.dy) / TRAUFE;
          const wandL = einTeil(d, 'wand-links'), wandR = einTeil(d, 'wand-rechts');
          const xFirst = (attr(wandL, 'x') + attr(wandL, 'width') + attr(wandR, 'x')) / 2;
          const yFirst = traufe.y1 - ridgeH * s;

          const sparrenLinie = teile(d, 'sparren')[0];
          const sw = attr(sparrenLinie, 'stroke-width');      // = Sparrenhöhe in px
          const alpha = winkelGrad(
            attr(sparrenLinie, 'x2') - attr(sparrenLinie, 'x1'),
            attr(sparrenLinie, 'y2') - attr(sparrenLinie, 'y1'),
          );
          // Die Sparrenlinie ist mittig gezeichnet: ihre Unterkante liegt
          // lotrecht (h/2)/cos α unter der Achse.
          const ukAmFirst = yFirst + (sw / 2) / Math.cos((alpha * Math.PI) / 180);

          const fp = einTeil(d, 'firstpfette');
          expect(Math.abs(attr(fp, 'y') - ukAmFirst),
            `Pfetten-OK ${attr(fp, 'y').toFixed(1)} px, Sparren-UK ${ukAmFirst.toFixed(1)} px`,
          ).toBeLessThan(TOL_PX);
          // mittig unter dem First und mit echter Querschnittshöhe (10/22)
          expect(Math.abs(attr(fp, 'x') + attr(fp, 'width') / 2 - xFirst)).toBeLessThan(TOL_PX);
          expect(Math.abs(attr(fp, 'height') - 0.22 * s)).toBeLessThan(0.5);
          expect(Math.abs(attr(fp, 'width') - 0.10 * s)).toBeLessThan(0.5);
        });

        it(`${form} ${pitch}°: b) auch die Mittelpfetten tragen die Sparren`, () => {
          const d = doc();
          const traufe = massStrecke(d, 'traufhoehe');
          const s = Math.abs(traufe.dy) / TRAUFE;
          const sparrenLinie = teile(d, 'sparren')[0];
          const sw = attr(sparrenLinie, 'stroke-width');
          const alpha = winkelGrad(
            attr(sparrenLinie, 'x2') - attr(sparrenLinie, 'x1'),
            attr(sparrenLinie, 'y2') - attr(sparrenLinie, 'y1'),
          );
          const yMitte = traufe.y1 - (TRAUFE + (ridgeH - TRAUFE) * 0.5) * s;
          const ukMitte = yMitte + (sw / 2) / Math.cos((alpha * Math.PI) / 180);
          const mp = teile(d, 'mittelpfette');
          expect(mp.length).toBe(2);
          for (const p of mp) expect(Math.abs(attr(p, 'y') - ukMitte)).toBeLessThan(TOL_PX);
        });
      }

      it(`${form} ${pitch}°: d) nichts läuft aus dem Bild`, () => {
        expect(ausserhalbViewBox(doc())).toEqual([]);
      });
    }
  }

  it('Sparrendach ohne Firstpfette: es wird auch keine gezeichnet', () => {
    // Bewusst eigener Fall: die Zeichnung folgt der Bauteilliste. Steht keine
    // Firstpfette drin, darf auch keine im Schnitt erscheinen — dann greift die
    // Auflager-Prüfung aus b) naturgemäß nicht.
    const d = svgDoc(renderToStaticMarkup(
      <Querschnitt geometry={geometrie(30, 'satteldach')} members={SPARRENDACH} roofForm="satteldach" roofOverhang={UEBERSTAND} />,
    ));
    expect(teile(d, 'firstpfette').length).toBe(0);
    expect(teile(d, 'mittelpfette').length).toBe(0);
    expect(teile(d, 'sparren').length).toBe(2);
    expect(ausserhalbViewBox(d)).toEqual([]);
  });

  it('widersprüchlicher Plan (DN 30° angeschrieben, Höhen ergeben 22°) wird ANGESCHRIEBEN, nicht versteckt', () => {
    const geo = geometrie(22, 'satteldach');
    geo.roofPitch = nwc(30, '°');   // Plan sagt 30°, die Höhen sagen 22°
    const markup = renderToStaticMarkup(
      <Querschnitt geometry={geo} members={PFETTENDACH} roofForm="satteldach" roofOverhang={UEBERSTAND} />,
    );
    expect(markup).toContain('22° gezeichnet');
    expect(markup).toContain('Plan sagt 30°, PRÜFEN');
    // gezeichnet wird die Geometrie, nicht die Beschriftung
    const d = svgDoc(markup);
    const l = teile(d, 'sparren')[0];
    const w = winkelGrad(attr(l, 'x2') - attr(l, 'x1'), attr(l, 'y2') - attr(l, 'y1'));
    expect(Math.abs(w - 22)).toBeLessThan(TOL_WINKEL);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LÄNGSSCHNITT
// ════════════════════════════════════════════════════════════════════════════
describe('Längsschnitt — Länge und Höhe im selben Maßstab', () => {
  for (const form of FORMEN) {
    for (const pitch of NEIGUNGEN) {
      const geo = geometrie(pitch, form);
      const ridgeH = geo.ridgeHeight.value;
      const doc = () => svgDoc(renderToStaticMarkup(
        <Laengsschnitt geometry={geo} members={PFETTENDACH} roofForm={form} />,
      ));

      it(`${form} ${pitch}°: c) Maßstab isotrop`, () => {
        const d = doc();
        const laenge = massStrecke(d, 'laenge');
        const traufe = massStrecke(d, 'traufhoehe');
        const first = massStrecke(d, 'firsthoehe');
        const sWaagrecht = Math.abs(laenge.dx) / LAENGE;
        expect(Math.abs(sWaagrecht - Math.abs(traufe.dy) / TRAUFE) / sWaagrecht).toBeLessThan(0.005);
        expect(Math.abs(sWaagrecht - Math.abs(first.dy) / ridgeH) / sWaagrecht).toBeLessThan(0.005);

        // Gegenprobe an den gezeichneten Giebelwänden statt an den Maßlinien
        const gL = einTeil(d, 'giebel-links'), gR = einTeil(d, 'giebel-rechts');
        const sAusWand = (attr(gR, 'x') - (attr(gL, 'x') + attr(gL, 'width'))) / LAENGE;
        const sAusHoehe = attr(gL, 'height') / ridgeH;
        expect(Math.abs(sAusWand - sWaagrecht) / sWaagrecht).toBeLessThan(0.005);
        expect(Math.abs(sAusHoehe - sWaagrecht) / sWaagrecht).toBeLessThan(0.005);
      });

      it(`${form} ${pitch}°: b) Firstpfette hängt unter der Sparrenlage am First`, () => {
        // Im Längsschnitt liegt die Sparrenlage quer zur Blickrichtung — geprüft
        // wird daher die HÖHENLAGE der Pfette (dieselbe Regel wie im Querschnitt).
        const d = doc();
        const traufe = massStrecke(d, 'traufhoehe');
        const s = Math.abs(traufe.dy) / TRAUFE;
        const yFirst = traufe.y1 - ridgeH * s;
        const fp = einTeil(d, 'firstpfette');
        const sparrenH = 0.16 * s;                    // Sparren 8/16 aus der Liste
        const spann = form === 'pultdach' ? BREITE : BREITE / 2;
        const cosA = Math.cos(Math.atan((ridgeH - TRAUFE) / spann));
        expect(Math.abs(attr(fp, 'y') - (yFirst + (sparrenH / 2) / cosA))).toBeLessThan(TOL_PX);
        expect(Math.abs(attr(fp, 'height') - 0.22 * s)).toBeLessThan(0.5);
      });

      it(`${form} ${pitch}°: d) nichts läuft aus dem Bild`, () => {
        expect(ausserhalbViewBox(doc())).toEqual([]);
      });
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DETAIL TRAUFE
// ════════════════════════════════════════════════════════════════════════════
describe('Detail Traufe — Sparren, Kerve und Mauerbank passen zusammen', () => {
  for (const form of FORMEN) {
    for (const pitch of NEIGUNGEN) {
      const geo = geometrie(pitch, form);
      const doc = () => svgDoc(renderToStaticMarkup(
        <DetailTraufe geometry={geo} members={PFETTENDACH} roofOverhang={UEBERSTAND} roofForm={form} />,
      ));

      it(`${form} ${pitch}°: a) gezeichnete Sparrenoberkante = ${pitch}°`, () => {
        const d = doc();
        const p = punkte(einTeil(d, 'sparren'));
        // Punkt 0 → 1 ist die durchgehende Oberkante des Sparrens
        const w = winkelGrad(p[1][0] - p[0][0], p[1][1] - p[0][1]);
        expect(Math.abs(w - pitch), `gezeichnet ${w.toFixed(2)}° statt ${pitch}°`).toBeLessThan(TOL_WINKEL);
      });

      it(`${form} ${pitch}°: b) Kervensohle liegt auf OK Mauerbank, kein Eindringen in die Mauerkrone`, () => {
        const d = doc();
        const bank = einTeil(d, 'mauerbank');
        const krone = einTeil(d, 'mauerkrone');
        const bankOK = attr(bank, 'y');
        const p = punkte(einTeil(d, 'sparren'));

        // Mauerbank steht auf der Mauerkrone (Unterkante = OK Krone)
        expect(Math.abs(attr(bank, 'y') + attr(bank, 'height') - attr(krone, 'y'))).toBeLessThan(0.5);

        // mindestens ein Umrisspunkt (die Kervensohle) liegt exakt auf OK Mauerbank
        const aufBank = p.filter(([x, y]) =>
          Math.abs(y - bankOK) < TOL_PX && x >= attr(bank, 'x') - 0.5 && x <= attr(bank, 'x') + attr(bank, 'width') + 0.5);
        expect(aufBank.length, 'keine Kervensohle auf OK Mauerbank').toBeGreaterThanOrEqual(2);

        // über der Mauerkrone darf kein Sparrenpunkt unter deren Oberkante liegen
        const kroneX0 = attr(krone, 'x'), kroneX1 = kroneX0 + attr(krone, 'width');
        for (const [x, y] of p) {
          if (x >= kroneX0 - 0.5 && x <= kroneX1 + 0.5) {
            expect(y, `Sparrenpunkt (${x.toFixed(1)}|${y.toFixed(1)}) dringt in die Mauerkrone ein`)
              .toBeLessThanOrEqual(attr(krone, 'y') + 0.5);
          }
        }
      });

      it(`${form} ${pitch}°: c) Maßstab isotrop (Mauerkrone 30/24 cm)`, () => {
        const d = doc();
        const krone = einTeil(d, 'mauerkrone');
        const sWaagrecht = attr(krone, 'width') / 0.30;
        const sLotrecht = attr(krone, 'height') / 0.24;
        expect(Math.abs(sWaagrecht - sLotrecht) / sWaagrecht).toBeLessThan(0.005);
        // und das Überstandsmaß ist im selben Maßstab gezeichnet
        const ue = massStrecke(d, 'ueberstand');
        expect(Math.abs(Math.abs(ue.dx) / UEBERSTAND - sWaagrecht) / sWaagrecht).toBeLessThan(0.005);
      });

      it(`${form} ${pitch}°: d) nichts läuft aus dem Bild`, () => {
        expect(ausserhalbViewBox(doc())).toEqual([]);
      });
    }
  }

  it('widersprüchlicher Plan wird auch im Traufdetail angeschrieben', () => {
    const geo = geometrie(22, 'satteldach');
    geo.roofPitch = nwc(30, '°');
    const markup = renderToStaticMarkup(
      <DetailTraufe geometry={geo} members={PFETTENDACH} roofOverhang={UEBERSTAND} roofForm="satteldach" />,
    );
    expect(markup).toContain('22° gezeichnet');
    expect(markup).toContain('Plan sagt 30°, PRÜFEN');
  });
});
