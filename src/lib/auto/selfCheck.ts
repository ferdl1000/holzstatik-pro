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
