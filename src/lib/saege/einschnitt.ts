/**
 * einschnitt.ts — Rundholz selber schneiden statt Schnittholz zukaufen.
 *
 * Für den Zimmerer, der ein Sägewerk oder eine Blockbandsäge hat: was muss er
 * an Rundholz kaufen (Zopfmaß, Länge, Festmeter), und was kommt aus einem Stamm
 * tatsächlich heraus — "aus dem Stamm gehen 1 Sparren, 3 Bretter und 2 Latten".
 *
 * Er kann auch mischen: Bretter und Latten selber schneiden, KVH zukaufen.
 *
 * RECHENMODELL (Blockeinschnitt / scharfkantig, wie auf der Blockbandsäge):
 *   Der Stammquerschnitt am Zopf ist ein Kreis mit Durchmesser d. Die Hauptware
 *   (z.B. der Sparren) liegt mittig, darüber und darunter werden Seitenbretter
 *   abgenommen, solange sie noch breit genug sind. Die nutzbare Breite in der
 *   Höhe y ist die Kreissehne 2·√(r² − y²); gerechnet wird mit der Sehne an der
 *   AUSSENKANTE des Brettes, damit das Brett wirklich vollkantig ist.
 *
 * ZWEI ZUSCHLÄGE, die in der Praxis über Erfolg und Ausschuss entscheiden:
 *   - Sägefuge: jeder Schnitt frisst Holz (Blockbandsäge ca. 3 mm).
 *   - Schwundmaß: nass eingeschnittenes Holz schwindet beim Trocknen. Wer auf
 *     Endmaß schneidet, hat hinterher Untermaß. Deshalb wird mit Übermaß
 *     eingeschnitten (Nadelholz ca. 5 % quer zur Faser bis Möbeltrockenheit,
 *     für Bauholz auf ~20 % Holzfeuchte rund 3 %).
 */

/** Sägefuge einer Blockbandsäge [mm]. Gattersäge liegt bei 4–5 mm. */
export const SAEGEFUGE_MM = 3;

/** Schwundmaß-Zuschlag beim Nasseinschnitt auf Bauholz-Feuchte (~20 %). */
export const SCHWUND_ZUSCHLAG = 0.03;

/** Schmalstes Brett, das sich noch lohnt [mm]. */
export const MIN_BRETTBREITE_MM = 80;

/** Abholzigkeit Fichte/Tanne: Durchmesserzunahme je Meter Stammlänge [cm/m]. */
export const ABHOLZIGKEIT_CM_JE_M = 1.0;

export interface Schnittware {
  /** Klartext, z.B. "Sparren 8/16" */
  bezeichnung: string;
  /** Breite [mm] (Endmaß, trocken) */
  b: number;
  /** Höhe/Dicke [mm] (Endmaß, trocken) */
  h: number;
  /** Benötigte Stückzahl */
  stueck: number;
  /** Länge je Stück [m] */
  laenge: number;
  /** Gruppe für die Misch-Entscheidung "selber schneiden oder zukaufen" */
  gruppe: SchnittGruppe;
}

/**
 * Womit der Zimmerer die Entscheidung trifft. KVH ist technisch getrocknet,
 * keilgezinkt und gehobelt — das kann er auf der Blockbandsäge NICHT
 * herstellen, nur besäumtes Bauholz in gleicher Dimension.
 */
export type SchnittGruppe = 'bauholz' | 'schalung' | 'latten';

export interface EinschnittStueck {
  bezeichnung: string;
  /** Einschnittmaß NASS inkl. Schwundzuschlag [mm] */
  bNass: number;
  hNass: number;
  /** Lage im Stamm, für den Schnittplan */
  lage: 'Hauptware (Mitte)' | 'Seitenbrett oben' | 'Seitenbrett unten';
}

export interface EinschnittPlan {
  /** Zopfdurchmesser des Stammes [mm] */
  zopfMm: number;
  /** Stammlänge [m] */
  laengeM: number;
  /** Was aus diesem einen Stamm herausgeht */
  stuecke: EinschnittStueck[];
  /** Festmeter des Stammes [fm] */
  festmeter: number;
  /** Volumen der Schnittware [m³] */
  ausbeuteM3: number;
  /** Ausbeute in Prozent des Stammvolumens */
  ausbeuteProzent: number;
  /** Klartext für den Sägeplan */
  beschreibung: string;
  /** false = die gewünschte Hauptware passt NICHT in diesen Stamm */
  hauptwarePasst: boolean;
}

/** Einschnittmaß nass: Endmaß + Schwundzuschlag, auf ganze mm aufgerundet. */
export function nassmass(endmassMm: number): number {
  return Math.ceil(endmassMm * (1 + SCHWUND_ZUSCHLAG));
}

/**
 * Passt ein Querschnitt überhaupt in den Stamm? Maßgebend ist die DIAGONALE:
 * das Kantholz muss in den Kreis am Zopf hineinpassen.
 */
export function passtInStamm(bMm: number, hMm: number, zopfMm: number): boolean {
  return Math.hypot(nassmass(bMm), nassmass(hMm)) <= zopfMm;
}

/** Größtes vollkantiges Quadrat aus einem Stamm: Seite = d / √2. */
export function groesstesQuadrat(zopfMm: number): number {
  return Math.floor(zopfMm / Math.SQRT2);
}

/**
 * Kleinstes Zopfmaß, mit dem ein Querschnitt vollkantig herausgeht — aufgerundet
 * auf die handelsübliche 5-cm-Stufe (Zopfklassen 2a, 2b, 3a, 3b …).
 */
export function empfohlenesZopfmass(bMm: number, hMm: number): number {
  const noetig = Math.hypot(nassmass(bMm), nassmass(hMm));
  return Math.ceil(noetig / 50) * 50;
}

/** Mittendurchmesser aus Zopf und Länge (Abholzigkeit 1 cm/m). */
export function mittendurchmesserMm(zopfMm: number, laengeM: number): number {
  return zopfMm + (ABHOLZIGKEIT_CM_JE_M * 10 * laengeM) / 2;
}

/** Festmeter eines Stammes (Volumen über Mittendurchmesser). */
export function festmeter(zopfMm: number, laengeM: number): number {
  const dM = mittendurchmesserMm(zopfMm, laengeM) / 1000;
  return (Math.PI / 4) * dM * dM * laengeM;
}

/**
 * Schnittplan für EINEN Stamm: mittig die Hauptware, darüber und darunter
 * Seitenbretter, solange sie breit genug bleiben.
 *
 * @param zopfMm       Zopfdurchmesser [mm] — das Maß, das der Zimmerer beim
 *                     Rundholzkauf angibt bzw. am liegenden Stamm misst
 * @param laengeM      Stammlänge [m]
 * @param hauptware    Querschnitt der Hauptware (Endmaß trocken), optional
 * @param brettDickeMm Dicke der Seitenbretter (Rauhschalung typisch 24 mm)
 */
export function einschnittPlan(
  zopfMm: number,
  laengeM: number,
  hauptware: { bezeichnung: string; b: number; h: number } | null,
  brettDickeMm = 24,
): EinschnittPlan {
  const r = zopfMm / 2;
  const stuecke: EinschnittStueck[] = [];

  let obenAb = 0;   // Oberkante der Hauptware (0 = Stammachse)
  let untenAb = 0;
  let hauptwarePasst = true;

  if (hauptware) {
    const bN = nassmass(hauptware.b);
    const hN = nassmass(hauptware.h);
    if (Math.hypot(bN, hN) <= zopfMm) {
      stuecke.push({ bezeichnung: hauptware.bezeichnung, bNass: bN, hNass: hN, lage: 'Hauptware (Mitte)' });
      obenAb = hN / 2;
      untenAb = hN / 2;
    } else {
      hauptwarePasst = false;
    }
  }

  const brettN = nassmass(brettDickeMm);
  // Seitenbretter oben und unten, symmetrisch
  for (const seite of ['oben', 'unten'] as const) {
    let y = (seite === 'oben' ? obenAb : untenAb) + SAEGEFUGE_MM;
    for (let i = 0; i < 12; i++) {
      const yAussen = y + brettN;                       // Außenkante des Brettes
      if (yAussen >= r) break;
      // Vollkantige Breite = Sehne an der Außenkante (das schmalste Maß)
      const breite = Math.floor(2 * Math.sqrt(r * r - yAussen * yAussen));
      if (breite < MIN_BRETTBREITE_MM) break;
      stuecke.push({
        bezeichnung: `Brett ${brettDickeMm} mm × ${breite} mm`,
        bNass: breite,
        hNass: brettN,
        lage: seite === 'oben' ? 'Seitenbrett oben' : 'Seitenbrett unten',
      });
      y = yAussen + SAEGEFUGE_MM;
    }
  }

  const fm = festmeter(zopfMm, laengeM);
  const ausbeuteM3 = stuecke.reduce((s, x) => s + (x.bNass / 1000) * (x.hNass / 1000) * laengeM, 0);

  const zusammenfassung = new Map<string, number>();
  for (const s of stuecke) zusammenfassung.set(s.bezeichnung, (zusammenfassung.get(s.bezeichnung) ?? 0) + 1);
  const text = [...zusammenfassung.entries()].map(([k, v]) => `${v}× ${k}`).join(', ');

  return {
    zopfMm,
    laengeM,
    stuecke,
    festmeter: +fm.toFixed(3),
    ausbeuteM3: +ausbeuteM3.toFixed(3),
    ausbeuteProzent: fm > 0 ? +((ausbeuteM3 / fm) * 100).toFixed(1) : 0,
    hauptwarePasst,
    beschreibung: (() => {
      const warnung = hauptware && !hauptwarePasst
        ? `ACHTUNG: ${hauptware.bezeichnung} geht bei ${zopfMm} mm Zopf NICHT vollkantig heraus — dafür braucht es mindestens ${empfohlenesZopfmass(hauptware.b, hauptware.h)} mm Zopf. `
        : '';
      if (stuecke.length === 0) {
        return `${warnung}Aus einem Stamm mit ${zopfMm} mm Zopf geht bei dieser Vorgabe nichts Vollkantiges heraus — stärkeres Rundholz nötig.`;
      }
      return `${warnung}Aus dem Stamm (Zopf ${zopfMm} mm, ${laengeM.toFixed(2)} m) gehen heraus: ${text}. Ausbeute ${((ausbeuteM3 / fm) * 100).toFixed(0)} % von ${fm.toFixed(2)} fm.`;
    })(),
  };
}

export interface RundholzBedarf {
  gruppe: SchnittGruppe;
  /** Empfohlenes Zopfmaß [mm] */
  zopfMm: number;
  /** Stammlänge [m] */
  laengeM: number;
  /** Anzahl Stämme */
  staemme: number;
  /** Gesamt-Festmeter */
  festmeter: number;
  positionen: string[];
  hinweis: string;
  /** Was EIN Stamm hergibt — "1 Sparren, 3 Bretter, 2 Latten" */
  proStamm: { bezeichnung: string; stueck: number }[];
}

/**
 * Wie viele Stück einer Schnittware gehen aus einem Rohling (Hauptware oder
 * Seitenbrett) heraus? Einfacher Rasterschnitt mit Sägefuge — ein 150 mm
 * breites Brett gibt eben 2 Latten à 50 mm her und nicht 3.
 */
export function stueckeAusRohling(
  rohling: { bNass: number; hNass: number },
  ziel: { b: number; h: number },
): number {
  // n Stück brauchen n·Zielmaß + (n−1)·Sägefuge ≤ Rohling
  //   →  n ≤ (Rohling + Fuge) / (Zielmaß + Fuge)
  // Wichtig: bei n = 1 fällt die Fuge heraus. Sonst käme aus einem 30er-Brett
  // keine 30er-Latte mehr, obwohl das Brett dafür geschnitten wurde.
  const wieOft = (roh: number, zielMm: number) =>
    Math.floor((roh + SAEGEFUGE_MM) / (nassmass(zielMm) + SAEGEFUGE_MM));
  const gerade = wieOft(rohling.bNass, ziel.b) * wieOft(rohling.hNass, ziel.h);
  const gedreht = wieOft(rohling.bNass, ziel.h) * wieOft(rohling.hNass, ziel.b);
  return Math.max(gerade, gedreht);
}

/**
 * Wie viel Rundholz braucht es für die selbst zu schneidenden Positionen?
 *
 * Gerechnet wird pro Gruppe (Bauholz / Schalung / Latten) mit dem stärksten
 * darin vorkommenden Querschnitt als Hauptware — danach richtet sich das
 * Zopfmaß, das der Zimmerer bestellen muss.
 */
export function rundholzBedarf(
  ware: Schnittware[],
  selbstSchneiden: SchnittGruppe[],
): RundholzBedarf[] {
  const out: RundholzBedarf[] = [];

  for (const gruppe of selbstSchneiden) {
    const teile = ware.filter(w => w.gruppe === gruppe && w.stueck > 0);
    if (teile.length === 0) continue;

    // Hauptware = größter Querschnitt der Gruppe; sie bestimmt das Zopfmaß.
    const haupt = teile.reduce((a, b) => (a.b * a.h >= b.b * b.h ? a : b));
    const zopfMm = Math.max(empfohlenesZopfmass(haupt.b, haupt.h), 200);
    // Stammlänge nach dem längsten Stück + 10 cm Übermaß fürs Ablängen
    const laengeM = +(Math.max(...teile.map(t => t.laenge)) + 0.1).toFixed(2);

    // Brettdicke so wählen, dass die übrigen Positionen der Gruppe daraus auch
    // wirklich herausgehen: aus einem 24-mm-Brett wird nie eine 30er-Dachlatte.
    const uebrige = teile.filter(t => t !== haupt);
    const brettDicke = uebrige.length > 0
      ? Math.min(...uebrige.map(t => Math.min(t.b, t.h)))
      : Math.min(haupt.b, haupt.h);

    const plan = einschnittPlan(
      zopfMm, laengeM,
      { bezeichnung: haupt.bezeichnung, b: haupt.b, h: haupt.h },
      brettDicke,
    );

    // Ausbeute je Stamm: jeder Rohling (Hauptware und Seitenbretter) wird dem
    // GRÖSSTEN noch offenen Zielquerschnitt zugeordnet, der aus ihm herausgeht.
    // So entsteht der Korb "1 Sparren, 3 Bretter, 2 Latten" — und nicht die
    // Fehlannahme, ein Stamm liefere genau ein Stück.
    const nachGroesse = [...teile].sort((a, b) => b.b * b.h - a.b * a.h);
    const proStammMap = new Map<string, number>();
    for (const rohling of plan.stuecke) {
      for (const ziel of nachGroesse) {
        const n = stueckeAusRohling(rohling, ziel);
        if (n > 0) {
          proStammMap.set(ziel.bezeichnung, (proStammMap.get(ziel.bezeichnung) ?? 0) + n);
          break;   // jeder Rohling wird nur EINMAL verwertet
        }
      }
    }

    const proStamm = teile.map(t => ({ bezeichnung: t.bezeichnung, stueck: proStammMap.get(t.bezeichnung) ?? 0 }));
    // Es braucht so viele Stämme, dass JEDE Position gedeckt ist.
    const staemme = Math.max(1, ...teile.map(t => {
      const jeStamm = proStammMap.get(t.bezeichnung) ?? 0;
      return jeStamm > 0 ? Math.ceil(t.stueck / jeStamm) : 0;
    }));

    const korb = proStamm.filter(p => p.stueck > 0).map(p => `${p.stueck}× ${p.bezeichnung}`).join(', ');

    out.push({
      gruppe,
      zopfMm,
      laengeM,
      staemme,
      festmeter: +(festmeter(zopfMm, laengeM) * staemme).toFixed(2),
      positionen: teile.map(t => `${t.stueck}× ${t.bezeichnung} (${t.laenge.toFixed(2)} m)`),
      proStamm,
      hinweis: korb
        ? `Aus EINEM Stamm (Zopf ${zopfMm} mm, ${laengeM.toFixed(2)} m) gehen heraus: ${korb}. ${plan.hauptwarePasst ? '' : 'ACHTUNG: die Hauptware passt nicht — stärkeres Rundholz nötig. '}Ausbeute ${plan.ausbeuteProzent.toFixed(0)} % von ${plan.festmeter.toFixed(2)} fm.`
        : plan.beschreibung,
    });
  }

  return out;
}
