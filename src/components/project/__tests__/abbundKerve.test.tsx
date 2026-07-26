import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AbbundDetails, AbbundOverview } from '../AbbundDetails';
import type { TimberMember } from '@/types/project';

/**
 * Reklamation des Auftraggebers am Abbundplan:
 *   "hier ist schon wieder das Auflager über dem Sparren … bitte immer in den
 *    Graden zeichnen und an den richtigen Positionen anzeigen, wo es wirklich
 *    liegt, damit es nicht verwirrend wirkt"
 *
 * Der Sparren wird deshalb in der EINBAULAGE gezeichnet — unter seiner echten
 * Neigung — und Mauerbank bzw. Mittelpfette stehen dort, wo sie tatsächlich
 * unter ihm liegen. Diese Tests messen das am fertigen SVG nach.
 *
 * Achtung SVG: y zeigt nach UNTEN. "höher" heißt also kleineres y.
 */

function sparren(over: Partial<TimberMember> = {}): TimberMember {
  return {
    id: 'S', name: 'Sparren S1-S11', type: 'sparren',
    width: 160, height: 240, length: 7.53, quantity: 11,
    material: 'C24', crossSection: '16/24',
    ...over,
  } as TimberMember;
}

const PULT_5 = {
  buildingWidth: 6.7, overhang: 0.4, hasMittelpfette: true,
  isPultdach: true, pfettenBreite: 140, pfettenHoehe: 100,
};

function zeichne(pitch: number, geom: Record<string, unknown>) {
  return renderToStaticMarkup(
    createElement(AbbundDetails, { member: sparren(), roofPitchDeg: pitch, geom: geom as never }) as never,
  );
}

/** Punkte des Sparren-Umrisses aus dem SVG holen. */
function umriss(svg: string): { x: number; y: number }[] {
  const m = svg.match(/<polygon points="([^"]+)"[^>]*stroke-width="1.6"/);
  expect(m, 'Sparren-Umriss nicht gefunden').toBeTruthy();
  return m![1].trim().split(/\s+/).map(p => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });
}

/**
 * Die gezeichneten Auflager (Pfetten) mit ihrer Oberkante.
 * Die Querschnitts-Skizze rechts oben ist ebenfalls ein Holz-Rechteck, gehört
 * aber nicht zum Bauwerk — sie hat feste 34 × 54 px und wird ausgenommen.
 */
function pfetten(svg: string): { x: number; y: number; w: number; h: number }[] {
  return [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" fill="url\(#wood-sp\)"/g)]
    .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }))
    .filter(r => !(r.w === 34 && r.h === 54));
}

describe('Abbundplan Sparren — Einbaulage statt flach liegend', () => {
  it.each([5, 15, 30, 45])('zeichnet den Sparren unter seiner echten Neigung (%i°)', (pitch) => {
    const svg = zeichne(pitch, { ...PULT_5, isPultdach: pitch === 5 });
    const p = umriss(svg);
    // Die ersten beiden Punkte sind Traufende und Firstende der OBERKANTE
    const [traufe, first] = p;
    const gezeichnet = (Math.atan2(traufe.y - first.y, first.x - traufe.x) * 180) / Math.PI;
    expect(gezeichnet).toBeCloseTo(pitch, 0);
  });

  it('der First liegt höher als die Traufe — der Sparren steigt', () => {
    const p = umriss(zeichne(30, { ...PULT_5, isPultdach: false }));
    expect(p[1].y).toBeLessThan(p[0].y);   // kleineres y = weiter oben
    expect(p[1].x).toBeGreaterThan(p[0].x);
  });

  it('die Auflager liegen UNTER dem Sparren, nicht darüber', () => {
    const svg = zeichne(30, { ...PULT_5, isPultdach: false });
    const p = umriss(svg);
    const holz = pfetten(svg);
    // Sparren-Umriss ohne die Querschnitts-Skizze: Oberkante ist der kleinste y
    const okSparren = Math.min(...p.map(q => q.y));
    // Pfetten (ohne die Querschnitt-Skizze rechts oben, die bei x > 690 liegt)
    const auflager = holz;
    expect(auflager.length).toBeGreaterThanOrEqual(1);
    for (const a of auflager) {
      // Oberkante der Pfette muss unterhalb der Sparren-Oberkante liegen
      expect(a.y, 'Pfette ragt über den Sparren').toBeGreaterThan(okSparren);
    }
  });

  it('jede Pfette berührt die Kervensohle — sie schwebt nicht', () => {
    const svg = zeichne(30, { ...PULT_5, isPultdach: false });
    const p = umriss(svg);
    const auflager = pfetten(svg);
    for (const a of auflager) {
      // Es muss einen Umrisspunkt geben, der auf der Pfetten-Oberkante sitzt
      const treffer = p.some(q => Math.abs(q.y - a.y) < 1.5 && q.x >= a.x - 1 && q.x <= a.x + a.w + 1);
      expect(treffer, `Pfette bei x=${a.x.toFixed(0)} hat keinen Kontakt zum Sparren`).toBe(true);
    }
  });

  it('bei 5° ist die Kerve flach, nicht 40 mm tief', () => {
    // 140 mm Auflagerbreite × tan 5° = 12,2 mm
    expect(zeichne(5, PULT_5)).toMatch(/Kerve t = 12 mm, Sohle 140 mm/);
  });

  it('bei 30° wird die Kerve tiefer — aber nie über h/4', () => {
    const m = zeichne(30, { ...PULT_5, isPultdach: false }).match(/Kerve t = (\d+) mm/);
    expect(m).toBeTruthy();
    const t = Number(m![1]);
    expect(t).toBeGreaterThan(12);
    expect(t).toBeLessThanOrEqual(240 / 4);
    expect(t).toBeLessThanOrEqual(40);
  });

  it('unter 2° wird gar keine Kerve geschnitten', () => {
    const svg = zeichne(1, { ...PULT_5, hasMittelpfette: false });
    expect(svg).toMatch(/keine Kerve/);
    expect(svg).not.toMatch(/Kerve t =/);
  });

  it('Pultdach: die Mittelpfette steht bei rund der halben waagrechten Weite', () => {
    const svg = zeichne(5, PULT_5);
    const auflager = pfetten(svg).sort((a, b) => a.x - b.x);
    expect(auflager.length).toBe(2);
    const p = umriss(svg);
    const xMin = Math.min(...p.map(q => q.x)), xMax = Math.max(...p.map(q => q.x));
    const anteil = (auflager[1].x - xMin) / (xMax - xMin);
    expect(anteil).toBeGreaterThan(0.40);
    expect(anteil).toBeLessThan(0.60);
  });

  it('Satteldach: die Mittelpfette steht bei rund einem Viertel der Breite', () => {
    const svg = zeichne(30, { ...PULT_5, isPultdach: false });
    const auflager = pfetten(svg).sort((a, b) => a.x - b.x);
    expect(auflager.length).toBe(2);
    const p = umriss(svg);
    const xMin = Math.min(...p.map(q => q.x)), xMax = Math.max(...p.map(q => q.x));
    const anteil = (auflager[1].x - xMin) / (xMax - xMin);
    expect(anteil).toBeGreaterThan(0.15);
    expect(anteil).toBeLessThan(0.45);
  });

  it('ohne Mittelpfette in der Bauteilliste wird auch keine gezeichnet', () => {
    const svg = zeichne(30, { ...PULT_5, hasMittelpfette: false, isPultdach: false });
    expect(svg).not.toMatch(/Mittelpfette/);
    expect(svg).toMatch(/Mauerbank/);
    expect(pfetten(svg).length).toBe(1);
  });

  it('unter der Mauerbank steht die Mauerkrone als bauseitige Leistung in Grau', () => {
    const svg = zeichne(30, { ...PULT_5, isPultdach: false });
    expect(svg).toMatch(/Mauerkrone \(bauseits\)/);
    expect(svg).toMatch(/fill="#d4d4d8"/);
  });

  it('nichts läuft aus dem Zeichenbereich', () => {
    for (const pitch of [5, 15, 30, 45, 60]) {
      const svg = zeichne(pitch, { ...PULT_5, isPultdach: pitch === 5 });
      for (const q of umriss(svg)) {
        expect(q.x, `x bei ${pitch}°`).toBeGreaterThanOrEqual(0);
        expect(q.x).toBeLessThanOrEqual(800);
        expect(q.y, `y bei ${pitch}°`).toBeGreaterThanOrEqual(0);
        expect(q.y).toBeLessThanOrEqual(400);
      }
    }
  });
});

describe('AbbundOverview reicht Dachform und Pfettenmaße durch', () => {
  it('gibt isPultdach, Breite und Höhe an die Detailzeichnung weiter', () => {
    const members: TimberMember[] = [
      sparren(),
      { id: 'MB', name: 'Fußpfette (Mauerbank) 1-2', type: 'pfette', width: 140, height: 100, length: 6.7, quantity: 2, material: 'C24', crossSection: '14/10' } as TimberMember,
      { id: 'MP', name: 'Mittelpfette MP1', type: 'pfette', width: 120, height: 200, length: 7.5, quantity: 1, material: 'C24', crossSection: '12/20' } as TimberMember,
    ];
    const svg = renderToStaticMarkup(
      createElement(AbbundOverview, { members, roofPitchDeg: 5, geom: PULT_5 as never }) as never,
    );
    // Käme die Auflagerbreite nicht an, stünden 40 mm statt 12 mm da
    expect(svg).toMatch(/Kerve t = 12 mm, Sohle 140 mm/);
    expect(svg).toMatch(/Mauerbank 140\/100/);
  });
});
