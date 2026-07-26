/**
 * selfCheck.ts — Gegenprüfung des fertigen Ergebnisses gegen den Einreichplan.
 *
 * Forderung des Auftraggebers (wörtlich):
 *   "es muss immer eine Gegenprüfung nochmal nach der Fertigstellung geben —
 *    wenn das nicht übereinstimmt, visuell oder nach den Daten des
 *    Einreichplans, wieder nochmal neu machen."
 *
 * Hintergrund: Es reicht NICHT, dass jede Teilrechnung für sich stimmt. Wenn im
 * Plan "DN 5°" steht, die Höhenmaße aber 70° ergeben, rechnet die Statik mit der
 * einen Zahl und die Zeichnung zeigt die andere. Ein 6-m-Sparren bei 5° hat eine
 * völlig andere Durchbiegung als bei 70° — das Ergebnis wäre wertlos, obwohl
 * jede einzelne Formel richtig ist.
 *
 * Diese Prüfung vergleicht deshalb die DREI Quellen, die zusammenpassen MÜSSEN:
 *   1. was im Plan steht        (DN-Marker, Maße)
 *   2. was gerechnet wurde      (Geometrie, Bauteile, Stützweiten)
 *   3. was gezeichnet wird      (Neigung aus First-/Traufhöhe — die Zeichnungen
 *                                leiten ihren Winkel aus genau diesen Höhen ab)
 *
 * Ein `blocker` bedeutet: das Ergebnis ist nicht verwendbar. Wo möglich liefert
 * die Prüfung eine reparierte Geometrie mit, damit die Pipeline automatisch
 * nochmal von vorne rechnen kann.
 */

import type { BuildingGeometry, TimberMember } from '@/types/project';

export interface SelbstpruefungBefund {
  id: string;
  schwere: 'blocker' | 'warnung';
  titel: string;
  erwartet: string;
  gefunden: string;
  /** Was der Befund fachlich bedeutet — in der Sprache des Zimmermeisters. */
  bedeutung: string;
}

export interface SelbstpruefungErgebnis {
  bestanden: boolean;
  befunde: SelbstpruefungBefund[];
  /** Automatisch reparierte Geometrie, falls ein Blocker heilbar war. */
  reparierteGeometrie?: BuildingGeometry;
}

export interface SelbstpruefungInput {
  geometry: BuildingGeometry;
  roofForm: string;
  members: TimberMember[];
  /** Dachneigung, die im Plan beschriftet ist (DN-Marker), falls vorhanden. */
  planNeigung?: number;
  sparrenSpacing: number;
  roofOverhang: number;
  /** true, wenn im Plan keine Adresse stand und ein Ersatzstandort verwendet wurde */
  standortIstErsatz?: boolean;
  /** Klartext des verwendeten Standorts, für die Meldung */
  standortText?: string;
  /** Dachform des Gesamtprojekts (project.roofType.form) */
  projektDachform?: string;
  /** Erkannte Dachteile — jeder mit eigener Form und Geometrie */
  dachteile?: {
    id: string; label: string; kind: string; form: string;
    geometry: { length: number; width: number; pitch: number; eavesHeight: number; ridgeHeight: number };
  }[];
}

const TOL_GRAD = 1.0;      // ° — darunter ist es Rundung, darüber ein Widerspruch
const TOL_LAENGE = 0.06;   // m — 6 cm Toleranz auf Bauteillängen

function grad(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Neigung, die sich aus First-, Traufhöhe und Breite ergibt. GENAU diese Zahl
 * zeichnen die Schnitte — deshalb ist sie die "gezeichnete" Neigung.
 */
export function neigungAusHoehen(geometry: BuildingGeometry, roofForm: string): number {
  const breite = roofForm === 'pultdach'
    ? geometry.width.value
    : geometry.width.value / 2;
  const rise = geometry.ridgeHeight.value - geometry.eavesHeight.value;
  if (breite <= 0) return 0;
  return grad(Math.atan2(rise, breite));
}

/** Sparrenlänge (Schräge) inkl. Dachüberstand — so wie autoMembers sie bildet. */
export function erwarteteSparrenlaenge(
  geometry: BuildingGeometry, roofForm: string, overhang: number,
): number {
  const istPult = roofForm === 'pultdach';
  const breite = istPult ? geometry.width.value : geometry.width.value / 2;
  const rise = geometry.ridgeHeight.value - geometry.eavesHeight.value;
  const schraege = Math.sqrt(breite * breite + rise * rise);
  const alpha = (geometry.roofPitch.value * Math.PI) / 180;
  const ueberstandSchraege = overhang / Math.max(Math.cos(alpha), 0.5);
  return schraege + ueberstandSchraege * (istPult ? 2 : 1);
}

export function pruefeErgebnis(input: SelbstpruefungInput): SelbstpruefungErgebnis {
  const { geometry, roofForm, members, planNeigung, roofOverhang } = input;
  const befunde: SelbstpruefungBefund[] = [];
  let repariert: BuildingGeometry | undefined;

  const pitch = geometry.roofPitch.value;
  const istFlach = roofForm === 'flachdach';
  const istWalm = roofForm === 'walmdach' || roofForm === 'krueppelwalmdach';

  // ── 1. Grundplausibilität ───────────────────────────────────────────────
  if (geometry.ridgeHeight.value <= geometry.eavesHeight.value && !istFlach) {
    befunde.push({
      id: 'first.unter.traufe',
      schwere: 'blocker',
      titel: 'Firsthöhe liegt nicht über der Traufe',
      erwartet: 'First > Traufe',
      gefunden: `First ${geometry.ridgeHeight.value} m, Traufe ${geometry.eavesHeight.value} m`,
      bedeutung: 'Mit dieser Geometrie gibt es kein Dach — jede Sparrenlänge und jede Last wäre falsch.',
    });
  }
  if (pitch < 0 || pitch > 75) {
    befunde.push({
      id: 'neigung.band',
      schwere: 'blocker',
      titel: 'Dachneigung außerhalb des möglichen Bereichs',
      erwartet: '0° bis 75°',
      gefunden: `${pitch}°`,
      bedeutung: 'Ein solches Dach gibt es im Wohnbau nicht — der Wert wurde falsch aus dem Plan gelesen.',
    });
  }

  // ── 2. Gerechnete Neigung == gezeichnete Neigung ────────────────────────
  // Das ist der Kern: die Zeichnungen leiten ihren Winkel aus First-/Traufhöhe
  // ab, die Statik rechnet mit geometry.roofPitch. Klaffen die auseinander,
  // steht im Bild etwas anderes als in der Berechnung.
  if (!istFlach) {
    const gezeichnet = neigungAusHoehen(geometry, roofForm);
    if (Math.abs(gezeichnet - pitch) > TOL_GRAD) {
      befunde.push({
        id: 'neigung.hoehen',
        schwere: 'blocker',
        titel: 'Gerechnete und gezeichnete Dachneigung stimmen nicht überein',
        erwartet: `${pitch.toFixed(1)}° (Wert, mit dem gerechnet wurde)`,
        gefunden: `${gezeichnet.toFixed(1)}° aus First ${geometry.ridgeHeight.value} m, Traufe ${geometry.eavesHeight.value} m und ${roofForm === 'pultdach' ? 'voller' : 'halber'} Breite`,
        bedeutung: `Die Zeichnung würde ${gezeichnet.toFixed(0)}° zeigen, gerechnet wurde mit ${pitch.toFixed(0)}°. Ein Sparren bei ${pitch.toFixed(0)}° hat eine völlig andere Durchbiegung als bei ${gezeichnet.toFixed(0)}° — das Ergebnis ist so nicht verwendbar.`,
      });
      // Heilbar: Firsthöhe aus der gerechneten Neigung nachziehen.
      const breite = roofForm === 'pultdach' ? geometry.width.value : geometry.width.value / 2;
      const neuerFirst = +(geometry.eavesHeight.value + Math.tan((pitch * Math.PI) / 180) * breite).toFixed(3);
      repariert = {
        ...geometry,
        ridgeHeight: { ...geometry.ridgeHeight, value: neuerFirst, source: 'calculated', confidence: 0.6 },
      };
    }
  }

  // ── 3. Gerechnete Neigung == Plan-Beschriftung (DN-Marker) ──────────────
  if (planNeigung != null && planNeigung > 0 && Math.abs(planNeigung - pitch) > TOL_GRAD) {
    befunde.push({
      id: 'neigung.plan',
      schwere: 'blocker',
      titel: 'Dachneigung weicht von der Beschriftung im Plan ab',
      erwartet: `${planNeigung}° laut Plan (DN-Marker)`,
      gefunden: `${pitch.toFixed(1)}° in der Berechnung`,
      bedeutung: 'Der Plan ist die Wahrheit. Weicht die Berechnung davon ab, sind Sparrenlänge, Lasten und Durchbiegung falsch.',
    });
    const breite = roofForm === 'pultdach' ? geometry.width.value : geometry.width.value / 2;
    const neuerFirst = +(geometry.eavesHeight.value + Math.tan((planNeigung * Math.PI) / 180) * breite).toFixed(3);
    repariert = {
      ...(repariert ?? geometry),
      roofPitch: { ...geometry.roofPitch, value: planNeigung, source: 'extracted', confidence: 0.95 },
      ridgeHeight: { ...geometry.ridgeHeight, value: neuerFirst, source: 'calculated', confidence: 0.7 },
    };
  }

  // ── 4. Sparrenlänge passt zur Geometrie ─────────────────────────────────
  const sparren = members.filter(m => m.type === 'sparren' && !/grat|schifter/i.test(m.name));
  if (sparren.length > 0 && !istFlach) {
    const soll = erwarteteSparrenlaenge(geometry, roofForm, roofOverhang);
    const ist = sparren[0].length;
    if (Math.abs(ist - soll) > TOL_LAENGE) {
      befunde.push({
        id: 'sparren.laenge',
        schwere: 'blocker',
        titel: 'Sparrenlänge passt nicht zur Geometrie',
        erwartet: `${soll.toFixed(2)} m (Schräge aus Breite/Höhe + ${(roofOverhang * 100).toFixed(0)} cm Überstand)`,
        gefunden: `${ist.toFixed(2)} m in der Stückliste`,
        bedeutung: 'Bemessen wurde ein anderer Sparren als der, der laut Geometrie gebraucht wird — Stützweite, Durchbiegung und Holzmenge stimmen dann nicht.',
      });
    }
  }

  // ── 5. Sparrenanzahl passt zu Gebäudelänge und Sparrenabstand ───────────
  if (sparren.length > 0 && !istWalm) {
    const laenge = geometry.length.value;
    const e = input.sparrenSpacing;
    const sollAnzahl = roofForm === 'pultdach'
      ? Math.ceil(laenge / e) + 1
      : Math.ceil(laenge / e) * 2 + 2;
    const istAnzahl = sparren.reduce((s, m) => s + m.quantity, 0);
    if (Math.abs(istAnzahl - sollAnzahl) > 2) {
      befunde.push({
        id: 'sparren.anzahl',
        schwere: 'warnung',
        titel: 'Sparrenanzahl passt nicht zu Länge und Sparrenabstand',
        erwartet: `${sollAnzahl} Stück (${laenge} m ÷ ${e} m)`,
        gefunden: `${istAnzahl} Stück`,
        bedeutung: 'Die Holzmenge und damit der Angebotspreis weichen entsprechend ab.',
      });
    }
  }

  // ── 6. Steher nur mit Beleg ─────────────────────────────────────────────
  // Regel des Auftraggebers: wo im Plan kein Holzsteher eingezeichnet ist, darf
  // auch keiner in Stückliste, Angebot oder Zeichnung auftauchen.
  const steher = members.filter(m => m.type === 'stuetze');
  if (steher.length > 0) {
    const stk = steher.reduce((s, m) => s + m.quantity, 0);
    if (stk > 0 && !input.members.some(m => m.type === 'stuetze' && m.crossSection)) {
      befunde.push({
        id: 'stuetze.ohne.beleg',
        schwere: 'warnung',
        titel: 'Holzsteher ohne Querschnittsangabe',
        erwartet: 'Steher nur mit Beleg aus Plan oder Nutzereingabe',
        gefunden: `${stk} Steher in der Stückliste`,
        bedeutung: 'Steher, die im Plan nicht eingezeichnet sind, gehören nicht ins Angebot.',
      });
    }
  }

  // ── 6b. Ohne Bauort ist die Schneelast geraten ──────────────────────────
  // Die Schneelast folgt unmittelbar aus Schneezone und Seehöhe. Zwischen dem
  // Ersatzstandort Wien (Zone 2, 171 m → 1,36 kN/m²) und der Oststeiermark
  // (Hartberg, Zone 3, 367 m → 2,43 kN/m²) liegen rund 80 %. Wer damit baut,
  // baut zu schwach. Das ist kein Schönheitsfehler, sondern ein Blocker.
  if (input.standortIstErsatz) {
    befunde.push({
      id: 'standort.ersatz',
      schwere: 'blocker',
      titel: 'Kein Bauort im Plan gefunden — Schneelast beruht auf einem Ersatzstandort',
      erwartet: 'Adresse aus dem Einreichplan (Schneezone und Seehöhe des Bauplatzes)',
      gefunden: input.standortText ?? 'Ersatzstandort',
      bedeutung: 'Die Schneelast hängt direkt von Zone und Seehöhe ab — zwischen dem Ersatzstandort und der Oststeiermark liegen rund 80 %. Bitte im Reiter „Adresse" den Bauort eintragen und neu rechnen; vorher ist diese Statik nicht verwendbar.',
    });
  }

  // ── 6c. Die Dachteile müssen zum Projekt und zu sich selbst passen ──────
  // Ein Plan ist erst dann verstanden, wenn Dachform, Neigung und Maße an
  // JEDER Stelle dasselbe sagen. Sonst steht auf der Ergebnisseite "Satteldach",
  // im Dachteil "Flachdach" und im Namen "Pultdach" — und die Statik rechnet
  // mit dem, was gerade zufällig gewinnt.
  const teile = input.dachteile ?? [];
  const hauptteil = teile.find(t => t.kind === 'main') ?? teile[0];

  if (hauptteil && input.projektDachform && hauptteil.form !== input.projektDachform) {
    befunde.push({
      id: 'dachform.widerspruch',
      schwere: 'blocker',
      titel: 'Dachform des Projekts und des Hauptdachs widersprechen sich',
      erwartet: `einheitlich (Projekt sagt "${input.projektDachform}")`,
      gefunden: `Hauptdach "${hauptteil.label}" ist als "${hauptteil.form}" geführt`,
      bedeutung: 'Sparrenlänge, Lastansatz und Zeichnung hängen an der Dachform. Solange zwei verschiedene Formen im Projekt stehen, rechnet die Statik nicht das, was der Plan zeigt.',
    });
  }

  for (const t of teile) {
    const b = t.form === 'pultdach' ? t.geometry.width : t.geometry.width / 2;
    const rise = t.geometry.ridgeHeight - t.geometry.eavesHeight;

    // Flachdach mit spürbarer Neigung ist ein Pultdach — und wird anders gerechnet
    if (t.form === 'flachdach' && t.geometry.pitch >= 3) {
      befunde.push({
        id: `dachteil.${t.id}.form`,
        schwere: 'blocker',
        titel: `„${t.label}" ist als Flachdach geführt, hat aber ${t.geometry.pitch}° Neigung`,
        erwartet: 'Flachdach unter 3° — darüber ist es ein Pultdach',
        gefunden: `${t.geometry.pitch}° bei Form "flachdach"`,
        bedeutung: 'Beim Flachdach spannt der Sparren anders und der Schnee bleibt voll liegen. Die falsche Form verfälscht Sparrenlänge, Schneelast und Zeichnung gleichzeitig.',
      });
    }

    // Neigung des Teils gegen seine eigenen Höhen
    if (b > 0 && t.form !== 'flachdach') {
      const implizit = grad(Math.atan2(rise, b));
      if (Math.abs(implizit - t.geometry.pitch) > 2) {
        befunde.push({
          id: `dachteil.${t.id}.neigung`,
          schwere: 'blocker',
          titel: `„${t.label}": Neigung passt nicht zu First- und Traufhöhe`,
          erwartet: `${t.geometry.pitch}°`,
          gefunden: `${implizit.toFixed(1)}° aus First ${t.geometry.ridgeHeight} m, Traufe ${t.geometry.eavesHeight} m und ${t.form === 'pultdach' ? 'voller' : 'halber'} Breite ${t.geometry.width} m`,
          bedeutung: 'Auch hier gilt: die Zeichnung folgt den Höhen, die Statik der Neigung. Klaffen sie auseinander, ist beides nicht zu gebrauchen.',
        });
      }
    }
  }

  // Hauptdach muss das Gebäude auch wirklich abdecken
  if (hauptteil) {
    const gebFlaeche = geometry.length.value * geometry.width.value;
    const teilFlaeche = hauptteil.geometry.length * hauptteil.geometry.width;
    if (gebFlaeche > 0 && teilFlaeche > 0) {
      const verhaeltnis = teilFlaeche / gebFlaeche;
      if (verhaeltnis < 0.8 || verhaeltnis > 1.25) {
        befunde.push({
          id: 'dachteil.grundflaeche',
          schwere: 'blocker',
          titel: 'Hauptdach deckt das Gebäude nicht ab',
          erwartet: `rund ${gebFlaeche.toFixed(0)} m² (Gebäude ${geometry.length.value} × ${geometry.width.value} m)`,
          gefunden: `${teilFlaeche.toFixed(0)} m² (Dachteil ${hauptteil.geometry.length} × ${hauptteil.geometry.width} m)`,
          bedeutung: 'Holzmenge und Angebotssumme richten sich nach der Dachfläche. Ist der Dachteil kleiner als das Gebäude, ist das Angebot entsprechend zu billig — und umgekehrt.',
        });
      }
    }
  }

  // ── 7. Mauerbank gehört zu jedem klassischen Dachstuhl ──────────────────
  const hatMauerbank = members.some(m => m.type === 'pfette' && /(mauerbank|fußpfette|fusspfette)/i.test(m.name));
  const hatSparren = sparren.length > 0;
  if (hatSparren && !hatMauerbank && !istFlach) {
    befunde.push({
      id: 'mauerbank.fehlt',
      schwere: 'warnung',
      titel: 'Keine Mauerbank in der Stückliste',
      erwartet: 'Fußpfette (Mauerbank) auf der Mauerkrone',
      gefunden: 'fehlt',
      bedeutung: 'Ohne Mauerbank gibt es kein Auflager für die Sparrenfüße und keine Verankerung gegen Windsog.',
    });
  }

  const blocker = befunde.filter(b => b.schwere === 'blocker');
  return {
    bestanden: blocker.length === 0,
    befunde,
    ...(repariert ? { reparierteGeometrie: repariert } : {}),
  };
}
