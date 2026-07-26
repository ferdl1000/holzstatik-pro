import { describe, it, expect } from 'vitest';
import {
  nassmass, passtInStamm, groesstesQuadrat, empfohlenesZopfmass,
  mittendurchmesserMm, festmeter, einschnittPlan, rundholzBedarf, stueckeAusRohling,
  SCHWUND_ZUSCHLAG, MIN_BRETTBREITE_MM, type Schnittware,
} from '../einschnitt';

describe('Einschnittmaß und Schwund', () => {
  it('schneidet mit Übermaß, damit das Holz nach dem Trocknen noch Maß hat', () => {
    // 160 mm Endmaß → nass mind. 160 · 1,03 = 164,8 → 165 mm
    expect(nassmass(160)).toBe(165);
    expect(nassmass(24)).toBe(25);
    expect(nassmass(100)).toBe(103);
  });

  it('rechnet den Schwund quer zur Faser mit 3 % (Bauholzfeuchte)', () => {
    expect(SCHWUND_ZUSCHLAG).toBeCloseTo(0.03, 3);
    expect(nassmass(1000)).toBe(1030);
  });
});

describe('Was passt in den Stamm', () => {
  it('prüft die Diagonale, nicht die Breite', () => {
    // 8/16 nass = 83/165 → Diagonale 184,7 mm
    expect(passtInStamm(80, 160, 200)).toBe(true);
    expect(passtInStamm(80, 160, 180)).toBe(false);
  });

  it('größtes Quadrat ist d / √2', () => {
    expect(groesstesQuadrat(300)).toBe(212);
    expect(groesstesQuadrat(400)).toBe(282);
  });

  it('empfiehlt das Zopfmaß in handelsüblichen 5-cm-Stufen', () => {
    // 8/16 braucht 185 mm Diagonale → nächste Stufe 200 mm
    expect(empfohlenesZopfmass(80, 160)).toBe(200);
    // 10/24 nass = 103/248 → Diagonale 268 → 300 mm
    expect(empfohlenesZopfmass(100, 240)).toBe(300);
    // 14/10 Mauerbank nass = 145/103 → 178 → 200 mm
    expect(empfohlenesZopfmass(140, 100)).toBe(200);
  });
});

describe('Stammvolumen', () => {
  it('rechnet den Mittendurchmesser mit 1 cm Abholzigkeit je Meter', () => {
    // Zopf 250 mm, 6 m lang → am Stammfuß 250 + 60 = 310, in der Mitte 280
    expect(mittendurchmesserMm(250, 6)).toBe(280);
  });

  it('rechnet Festmeter über den Mittendurchmesser', () => {
    // d_mitte = 0,28 m → π/4 · 0,28² · 6 = 0,3695 fm
    expect(festmeter(250, 6)).toBeCloseTo(0.3695, 3);
  });
});

describe('Schnittplan: was geht aus dem Stamm heraus', () => {
  it('legt die Hauptware mittig und nimmt Seitenbretter ab', () => {
    const p = einschnittPlan(300, 6, { bezeichnung: 'Sparren 8/16', b: 80, h: 160 }, 24);
    const haupt = p.stuecke.filter(s => s.lage === 'Hauptware (Mitte)');
    const bretter = p.stuecke.filter(s => s.lage !== 'Hauptware (Mitte)');
    expect(haupt).toHaveLength(1);
    expect(haupt[0].bNass).toBe(83);    // 80 mm + Schwund
    expect(haupt[0].hNass).toBe(165);
    expect(bretter.length).toBeGreaterThan(0);
    // Der Klartext sagt dem Zimmerer, was rauskommt
    expect(p.beschreibung).toMatch(/1× Sparren 8\/16/);
    expect(p.beschreibung).toMatch(/Ausbeute \d+ %/);
  });

  it('liefert nur vollkantige Bretter — keines schmäler als das Mindestmaß', () => {
    const p = einschnittPlan(350, 5, { bezeichnung: 'Sparren 10/20', b: 100, h: 200 }, 24);
    for (const s of p.stuecke.filter(x => x.lage !== 'Hauptware (Mitte)')) {
      expect(s.bNass).toBeGreaterThanOrEqual(MIN_BRETTBREITE_MM);
    }
  });

  it('kein Brett und keine Hauptware ragt aus dem Stamm heraus', () => {
    const zopf = 320;
    const p = einschnittPlan(zopf, 5, { bezeichnung: 'Pfette 12/20', b: 120, h: 200 }, 24);
    const r = zopf / 2;
    // Hauptware: Diagonale muss in den Kreis passen
    const h = p.stuecke.find(s => s.lage === 'Hauptware (Mitte)')!;
    expect(Math.hypot(h.bNass, h.hNass)).toBeLessThanOrEqual(zopf);
    // Bretter: halbe Breite und Außenkante müssen im Kreis liegen
    for (const s of p.stuecke.filter(x => x.lage !== 'Hauptware (Mitte)')) {
      expect(s.bNass / 2).toBeLessThanOrEqual(r);
    }
  });

  it('meldet ehrlich, wenn die Hauptware nicht in den Stamm passt', () => {
    // 10/24 braucht 300 mm Zopf — aus 150 mm gehen nur noch Bretter heraus
    const p = einschnittPlan(150, 5, { bezeichnung: 'Sparren 10/24', b: 100, h: 240 }, 24);
    expect(p.hauptwarePasst).toBe(false);
    expect(p.stuecke.some(s => s.lage === 'Hauptware (Mitte)')).toBe(false);
    expect(p.beschreibung).toMatch(/NICHT vollkantig/);
    expect(p.beschreibung).toMatch(/mindestens 300 mm Zopf/);
    // Bretter gehen trotzdem heraus — das darf nicht verschwiegen werden
    expect(p.stuecke.length).toBeGreaterThan(0);
  });

  it('meldet, wenn gar nichts mehr herausgeht', () => {
    const p = einschnittPlan(90, 4, { bezeichnung: 'Sparren 10/24', b: 100, h: 240 }, 24);
    expect(p.stuecke).toHaveLength(0);
    expect(p.beschreibung).toMatch(/stärkeres Rundholz/);
  });

  it('Ausbeute bleibt unter 100 % des Stammvolumens', () => {
    for (const zopf of [200, 250, 300, 350, 400]) {
      const p = einschnittPlan(zopf, 6, { bezeichnung: 'Sparren 8/16', b: 80, h: 160 }, 24);
      expect(p.ausbeuteProzent).toBeGreaterThan(0);
      expect(p.ausbeuteProzent).toBeLessThan(100);
    }
  });

  it('dickerer Stamm gibt mehr Bretter her', () => {
    const klein = einschnittPlan(250, 6, { bezeichnung: 'S', b: 80, h: 160 }, 24);
    const gross = einschnittPlan(400, 6, { bezeichnung: 'S', b: 80, h: 160 }, 24);
    expect(gross.stuecke.length).toBeGreaterThan(klein.stuecke.length);
  });
});

describe('Rundholzbedarf im Mischbetrieb', () => {
  const ware: Schnittware[] = [
    { bezeichnung: 'Sparren 8/16', b: 80, h: 160, stueck: 32, laenge: 5.66, gruppe: 'bauholz' },
    { bezeichnung: 'Fußpfette (Mauerbank) 14/10', b: 140, h: 100, stueck: 2, laenge: 12, gruppe: 'bauholz' },
    { bezeichnung: 'Rauhschalung 24 mm', b: 150, h: 24, stueck: 400, laenge: 4, gruppe: 'schalung' },
    { bezeichnung: 'Dachlatte 3/5', b: 50, h: 30, stueck: 300, laenge: 4, gruppe: 'latten' },
  ];

  it('rechnet nur die Gruppen, die der Zimmerer selber schneidet', () => {
    const nurBretter = rundholzBedarf(ware, ['schalung', 'latten']);
    expect(nurBretter.map(r => r.gruppe).sort()).toEqual(['latten', 'schalung']);
    // Bauholz wird zugekauft → taucht im Rundholzbedarf NICHT auf
    expect(nurBretter.some(r => r.gruppe === 'bauholz')).toBe(false);
  });

  it('leitet Zopfmaß aus dem stärksten Querschnitt der Gruppe ab', () => {
    const [bauholz] = rundholzBedarf(ware, ['bauholz']);
    // stärkster Querschnitt ist die Mauerbank 14/10 (14000 mm²) gegen 8/16 (12800)
    expect(bauholz.zopfMm).toBeGreaterThanOrEqual(200);
    expect(bauholz.staemme).toBeGreaterThan(0);
    expect(bauholz.festmeter).toBeGreaterThan(0);
  });

  it('gibt Stammlänge mit Übermaß fürs Ablängen an', () => {
    const [bauholz] = rundholzBedarf(ware, ['bauholz']);
    // längstes Stück 12 m + 0,10 m Übermaß
    expect(bauholz.laengeM).toBeCloseTo(12.1, 2);
  });

  it('listet auf, welche Positionen aus diesem Rundholz entstehen', () => {
    const [latten] = rundholzBedarf(ware, ['latten']);
    expect(latten.positionen.join(' ')).toMatch(/300× Dachlatte 3\/5/);
    expect(latten.hinweis).toMatch(/Zopf/);
  });

  it('rechnet MEHRERE Stück je Stamm — ein Stamm gibt viele Bretter her', () => {
    const [schalung] = rundholzBedarf(ware, ['schalung']);
    const jeStamm = schalung.proStamm.find(p => /Rauhschalung/.test(p.bezeichnung))!;
    expect(jeStamm.stueck).toBeGreaterThan(1);
    // 400 Bretter dürfen NICHT 400 Stämme brauchen
    expect(schalung.staemme).toBeLessThan(400);
    expect(schalung.staemme).toBe(Math.ceil(400 / jeStamm.stueck));
    expect(schalung.hinweis).toMatch(/Aus EINEM Stamm/);
  });

  it('sagt im Klartext, was aus einem Stamm herausgeht', () => {
    const [latten] = rundholzBedarf(ware, ['latten']);
    expect(latten.hinweis).toMatch(/Aus EINEM Stamm .* gehen heraus: \d+× Dachlatte/);
  });

  it('deckt bei mehreren Positionen einer Gruppe ALLE ab', () => {
    const gemischt: Schnittware[] = [
      { bezeichnung: 'Dachlatte 3/5', b: 50, h: 30, stueck: 300, laenge: 4, gruppe: 'latten' },
      { bezeichnung: 'Konterlatte 5/8', b: 80, h: 50, stueck: 100, laenge: 4, gruppe: 'latten' },
    ];
    const [r] = rundholzBedarf(gemischt, ['latten']);
    for (const t of gemischt) {
      const jeStamm = r.proStamm.find(p => p.bezeichnung === t.bezeichnung)!.stueck;
      expect(jeStamm * r.staemme, `${t.bezeichnung} nicht gedeckt`).toBeGreaterThanOrEqual(t.stueck);
    }
  });
});

describe('Ausbeute aus einem Rohling', () => {
  it('aus einem 24-mm-Brett kommt KEINE 30er-Dachlatte', () => {
    // Physikalisch unmöglich — das Brett ist dünner als die Latte hoch ist.
    expect(stueckeAusRohling({ bNass: 155, hNass: 25 }, { b: 50, h: 30 })).toBe(0);
  });

  it('aus einem 150 mm breiten 30er-Brett gehen 2 Dachlatten 3/5', () => {
    // Brett 31 mm nass, Latte 52 mm nass breit: (155+3)/(52+3) = 2
    expect(stueckeAusRohling({ bNass: 155, hNass: 31 }, { b: 50, h: 30 })).toBe(2);
  });

  it('gibt 0 zurück, wenn das Zielmaß nicht hineinpasst', () => {
    expect(stueckeAusRohling({ bNass: 100, hNass: 25 }, { b: 80, h: 160 })).toBe(0);
  });

  it('ein Rohling in exakt Zielgröße gibt genau ein Stück — die Fuge zählt nur zwischen zwei Schnitten', () => {
    expect(stueckeAusRohling({ bNass: nassmass(150), hNass: nassmass(24) }, { b: 150, h: 24 })).toBe(1);
  });

  it('darf den Rohling drehen, wenn es mehr Stücke bringt', () => {
    expect(stueckeAusRohling({ bNass: 60, hNass: 200 }, { b: 50, h: 30 })).toBeGreaterThan(0);
  });
});

describe('Alles zukaufen', () => {
  const ware: Schnittware[] = [
    { bezeichnung: 'Sparren 8/16', b: 80, h: 160, stueck: 32, laenge: 5.66, gruppe: 'bauholz' },
  ];

  it('liefert nichts zurück, wenn alles zugekauft wird', () => {
    expect(rundholzBedarf(ware, [])).toHaveLength(0);
  });
});
