import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AbbundDetails } from '../AbbundDetails';
import type { TimberMember } from '@/types/project';

/**
 * Der Auftraggeber hat am Abbundplan reklamiert: "schaut das für dich richtig
 * aus, dass der Sparren nur bis Mitte Pfette geht, und wo die Kervenschnitte
 * sind, und dass die Pfette vorne in der Luft ist?"
 *
 * Ursache war die Umkehrung der Kerven-Geometrie: die Tiefe war fix (40 mm) und
 * die Sohle wurde daraus als t/tan α gerechnet. Bei 5° Dachneigung ergab das
 * eine Sohle von 457 mm — bei einer 120 mm breiten Pfette. Zwei solche Kerven
 * fraßen das linke Drittel des Sparrens auf.
 *
 * Richtig ist es umgekehrt: die Sohle ist so lang wie die Pfette breit ist
 * (sie liegt ja darauf), und daraus folgt die Tiefe t = Breite · tan α.
 */

function sparren(over: Partial<TimberMember> = {}): TimberMember {
  return {
    id: 'S', name: 'Sparren S1-S11', type: 'sparren',
    width: 160, height: 240, length: 7.53, quantity: 11,
    material: 'C24', crossSection: '16/24',
    ...over,
  } as TimberMember;
}

function zeichne(pitch: number, geom: Record<string, unknown>) {
  return renderToStaticMarkup(
    createElement(AbbundDetails, { member: sparren(), roofPitchDeg: pitch, geom: geom as never }) as never,
  );
}

const PULT_5 = { buildingWidth: 6.7, overhang: 0.4, hasMittelpfette: true, isPultdach: true, pfettenBreite: 120 };

describe('AbbundOverview reicht Dachform und Pfettenbreite durch', () => {
  it('gibt isPultdach und pfettenBreite an die Detailzeichnung weiter', async () => {
    const { AbbundOverview } = await import('../AbbundDetails');
    const members: TimberMember[] = [
      sparren(),
      { id: 'MB', name: 'Fußpfette (Mauerbank) 1-2', type: 'pfette', width: 140, height: 100, length: 6.7, quantity: 2, material: 'C24', crossSection: '14/10' } as TimberMember,
      { id: 'MP', name: 'Mittelpfette MP1', type: 'pfette', width: 120, height: 200, length: 7.5, quantity: 1, material: 'C24', crossSection: '12/20' } as TimberMember,
    ];
    const svg = renderToStaticMarkup(
      createElement(AbbundOverview, { members, roofPitchDeg: 5, geom: PULT_5 as never }) as never,
    );
    // 120 mm Pfette × tan 5° ≈ 10 mm — käme die Breite nicht an, stünden 40 mm da
    expect(svg).toMatch(/t = 1[01] mm/);
    // und die Mittelpfetten-Kerve muss beim Pultdach in die Sparrenmitte rücken
    const m = svg.match(/<text x="([\d.]+)"[^>]*>Kerve Mittelpfette/);
    expect(m).toBeTruthy();
    const anteil = (Number(m![1]) - 100) / 600;
    expect(anteil).toBeGreaterThan(0.40);
  });
});

describe('Abbundplan Sparren — Kerve folgt der Pfettenbreite, nicht umgekehrt', () => {
  it('bei 5° ist die Kerve flach, nicht 40 mm tief', () => {
    const svg = zeichne(5, PULT_5);
    // 120 mm Pfette × tan 5° = 10,5 mm → gerundet 11 mm
    expect(svg).toMatch(/Kerve Fußpfette t = 1[01] mm/);
    expect(svg).not.toMatch(/t = 40 mm/);
  });

  it('schreibt die Sohlenlänge an, damit sie am Bauholz nachmessbar ist', () => {
    expect(zeichne(5, PULT_5)).toMatch(/Sohle 120 mm/);
  });

  it('bei 30° darf die Kerve tiefer werden — aber nie über h/4', () => {
    const svg = zeichne(30, { ...PULT_5, isPultdach: false });
    const m = svg.match(/Kerve Fußpfette t = (\d+) mm/);
    expect(m).toBeTruthy();
    const t = Number(m![1]);
    expect(t).toBeGreaterThan(11);        // steiler ⇒ tiefer
    expect(t).toBeLessThanOrEqual(240 / 4); // aber nie über h/4 = 60 mm
    expect(t).toBeLessThanOrEqual(40);      // und nie über das Regelmaß
  });

  it('unter 2° wird gar keine Kerve geschnitten', () => {
    const svg = zeichne(1, { ...PULT_5, hasMittelpfette: false });
    expect(svg).toMatch(/keine Kerve/);
    expect(svg).not.toMatch(/Kerve Fußpfette t =/);
  });

  it('Pultdach: die Mittelpfetten-Kerve sitzt bei rund der halben Sparrenlänge', () => {
    const svg = zeichne(5, PULT_5);
    // Kervenbeschriftungen tragen ihre x-Position im text-Element
    const texte = [...svg.matchAll(/<text x="([\d.]+)"[^>]*>Kerve (Fußpfette|Mittelpfette)/g)];
    expect(texte.length).toBe(2);
    const xFuss = Number(texte.find(t => t[2] === 'Fußpfette')![1]);
    const xMitte = Number(texte.find(t => t[2] === 'Mittelpfette')![1]);
    // Zeichenbereich: startX = 100, drawLen = 600
    const anteil = (xMitte - 100) / 600;
    expect(anteil).toBeGreaterThan(0.40);   // vorher lag sie bei 0,28
    expect(anteil).toBeLessThan(0.60);
    expect(xMitte).toBeGreaterThan(xFuss);
  });

  it('Satteldach: die Mittelpfette sitzt bei rund einem Viertel der Gebäudebreite', () => {
    const svg = zeichne(30, { ...PULT_5, isPultdach: false });
    const texte = [...svg.matchAll(/<text x="([\d.]+)"[^>]*>Kerve (Fußpfette|Mittelpfette)/g)];
    const xMitte = Number(texte.find(t => t[2] === 'Mittelpfette')![1]);
    // halbe Breite 3,35 m, davon die Hälfte = 1,675 m auf 7,53 m Sparren ≈ 27 %
    const anteil = (xMitte - 100) / 600;
    expect(anteil).toBeGreaterThan(0.20);
    expect(anteil).toBeLessThan(0.45);
  });

  it('ohne Mittelpfette in der Bauteilliste wird auch keine Kerve dafür gezeichnet', () => {
    const svg = zeichne(30, { ...PULT_5, hasMittelpfette: false, isPultdach: false });
    expect(svg).not.toMatch(/Kerve Mittelpfette/);
    expect(svg).toMatch(/Kerve Fußpfette/);
  });
});
