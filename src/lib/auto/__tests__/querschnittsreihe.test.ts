import { describe, it, expect } from 'vitest';
import { KVH_PROFILES, BSH_PROFILES, nextLargerProfile } from '../standards';

/**
 * Die Querschnittsreihe muss der heutigen oststeirischen Lagerhaltung
 * entsprechen — der Optimierer darf nur Profile wählen, die der Zimmerer beim
 * Sägewerk auch wirklich bekommt, und er muss die nächste Stufe treffen und
 * nicht zwei überspringen (das verteuert das Angebot ohne Not).
 */
describe('KVH-Querschnittsreihe (oststeirische Praxis, Stand heute)', () => {
  it('ist streng nach Querschnittsfläche aufsteigend sortiert', () => {
    for (let i = 1; i < KVH_PROFILES.length; i++) {
      const vor = KVH_PROFILES[i - 1].b * KVH_PROFILES[i - 1].h;
      const jetzt = KVH_PROFILES[i].b * KVH_PROFILES[i].h;
      expect(jetzt, `${KVH_PROFILES[i].label} nach ${KVH_PROFILES[i - 1].label}`).toBeGreaterThanOrEqual(vor);
    }
  });

  it.each([
    '6/12', '6/14', '6/16', '8/14', '8/16', '8/18', '8/20', '8/22', '8/24',
    '10/16', '10/18', '10/20', '10/22', '10/24',
    '12/20', '12/22', '12/24', '14/24', '16/24',
  ])('enthält den lagerüblichen Querschnitt %s', (label) => {
    expect(KVH_PROFILES.some(p => p.label === label)).toBe(true);
  });

  it('springt vom Standard-Sparren 8/20 auf 8/22 und nicht gleich auf 10/20', () => {
    // Genau hier wurde vorher eine Stufe übersprungen: 8/20 → 10/20 bedeutet
    // 25 % mehr Holz, obwohl 8/22 gereicht hätte.
    const next = nextLargerProfile({ b: 80, h: 200 }, false);
    expect(next?.label).toBe('8/22');
  });

  it('stuft nach Widerstandsmoment und behält dabei die Breite', () => {
    // Zimmerer-Praxis: gleiche Breite, mehr Höhe. 8/22 → 8/24, NICHT 10/18 —
    // 10/18 hat zwar mehr Fläche, trägt aber deutlich weniger (W = b·h²/6).
    const W = (b: number, h: number) => (b * h * h) / 6;
    expect(W(80, 240)).toBeGreaterThan(W(100, 180));
    expect(nextLargerProfile({ b: 80, h: 220 }, false)?.label).toBe('8/24');
  });

  it('wechselt erst auf ein breiteres Holz, wenn die Breitenreihe ausgeschöpft ist', () => {
    const next = nextLargerProfile({ b: 80, h: 240 }, false);
    expect(next).not.toBeNull();
    expect(next!.b).toBeGreaterThan(80);
    // und es muss wirklich mehr tragen als 8/24
    expect((next!.b * next!.h * next!.h) / 6).toBeGreaterThan((80 * 240 * 240) / 6);
  });

  it('führt die Sparrenreihe 8/16 → 8/18 → 8/20 → 8/22 → 8/24 lückenlos', () => {
    const kette = ['8/16', '8/18', '8/20', '8/22', '8/24'];
    for (let i = 0; i < kette.length - 1; i++) {
      const cur = KVH_PROFILES.find(p => p.label === kette[i])!;
      expect(nextLargerProfile({ b: cur.b, h: cur.h }, false)?.label).toBe(kette[i + 1]);
    }
  });

  it('liefert am Ende der Reihe null statt eines Fantasieprofils', () => {
    const W = (p: { b: number; h: number }) => (p.b * p.h * p.h) / 6;
    const staerkstes = KVH_PROFILES.reduce((a, b) => (W(b) > W(a) ? b : a));
    expect(nextLargerProfile({ b: staerkstes.b, h: staerkstes.h }, false)).toBeNull();
  });

  it('BSH-Reihe ist ebenfalls aufsteigend und in 40-mm-Lamellenschritten', () => {
    for (let i = 1; i < BSH_PROFILES.length; i++) {
      expect(BSH_PROFILES[i].b * BSH_PROFILES[i].h)
        .toBeGreaterThan(BSH_PROFILES[i - 1].b * BSH_PROFILES[i - 1].h);
    }
    for (const p of BSH_PROFILES) {
      expect(p.h % 40, `${p.label} ist kein Vielfaches von 40 mm`).toBe(0);
    }
  });
});
