/**
 * Automatische Querschnittsbemessung aller Bauteile.
 *
 * Für jedes TimberMember:
 *  - Lastermittlung (Linienlast q) abhängig von Bauteiltyp
 *  - Optimizer-Lauf → minimaler Querschnitt der alle Nachweise erfüllt
 *  - Stützen: direkt calculateColumn (Knicknachweis)
 *  - Leimbinder / Material enthält 'GL': optimizeGlulam
 *  - Sonst: optimizeBeam (KVH)
 *
 * Norm: EC5 / ÖNORM B 1995-1-1
 */

import type { TimberMember, BuildingGeometry } from '@/types/project';
import type { AutoCalculationResult, AutoAssumption, DimensioningVariant } from './contracts';
import { optimizeBeam } from '@/lib/calc/timber/optimizer';
import { optimizeGlulam } from '@/lib/calc/timber/optimizer';
import { calculateColumn } from '@/lib/calc/timber/column';
import { calculateBeam } from '@/lib/calc/timber/beam';
import { calculateGlulam } from '@/lib/calc/timber/glulam';
import type { BeamInput } from '@/lib/calc/timber/beam';
import type { GlulamBeamInput } from '@/lib/calc/timber/glulam';
import { nextLargerProfile, KVH_PROFILES, BSH_PROFILES } from './standards';
import { TIMBER_CLASSES, K_MOD, GAMMA_M } from '@/lib/calc/materials';

// ─── Typen ────────────────────────────────────────────────────────────────────

type MemberCalcEntry = AutoCalculationResult['members'][number];

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Parst Festigkeitsklasse aus Material-String.
 *  Unterstützt: 'C24', 'C30', 'GL24h', 'GL28h', 'KVH C24', 'BSH GL28h', ...
 */
function parseTimberClass(material: string, isGlulam: boolean): string {
  const upper = material.toUpperCase();
  // GL-Klassen explizit
  const glMatch = upper.match(/GL\s*(\d+)\s*([CH]?)/);
  if (glMatch) return `GL${glMatch[1]}${glMatch[2] || 'h'}`;
  // C-Klassen
  const cMatch = upper.match(/C\s*(\d+)/);
  if (cMatch) return `C${cMatch[1]}`;
  // Default nach Typ
  return isGlulam ? 'GL24h' : 'C24';
}

/** Entscheidet ob Material Brettschichtholz ist. */
function isGlulamMaterial(material: string): boolean {
  const u = material.toUpperCase();
  return u.includes('GL') || u.includes('BSH') || u.includes('LEIMBINDER') || u.includes('BRETTSCHICHT');
}

/** Deckenbalken werden (historisch) als 'nebentraeger' erzeugt und über den
 *  Namen identifiziert. Sie sind KEINE Dachbauteile: weder Dachüberstand noch
 *  Kehlbalken/Zangen dürfen ihre Stützweite verändern. */
function isDeckenbalken(m: TimberMember): boolean {
  return m.name.startsWith('Deckenbalken');
}

/** Die Mauerbank (Fußpfette) liegt VOLLFLÄCHIG auf der Mauerkrone auf — sie hat
 *  keine freie Stützweite und wird nicht auf Biegung bemessen. */
function isMauerbank(m: TimberMember): boolean {
  return m.type === 'pfette' && /mauerbank|fußpfette|fusspfette/i.test(m.name);
}

/** Gibt die Trägerstützweite in Metern zurück (Fallback auf geometrie-basierte Schätzung). */
function resolveSpan(
  member: TimberMember, geometry: BuildingGeometry, supportSpacing = 4.0,
  opts?: { kehlFactor?: number },
): number {
  // Pfetten: member.length ist die Gesamtlänge der Pfette (= Gebäudelänge),
  // NICHT die statische Stützweite. Stützweite = Stützenabstand ≈ Gebäudelänge / Feldanzahl.
  // supportSpacing ist im Tragwerk-Tab konfigurierbar (Default 4.0 m) — ein kleinerer
  // Abstand verkürzt die Pfettenstützweite und erlaubt einen schwächeren Querschnitt.
  // Deckenbalken: Stützweite ist die Deckenspannweite, unabhängig von Dach-
  // neigung, Dachüberstand und Kehlbalken/Zangen.
  if (isDeckenbalken(member)) {
    return member.length > 0 ? +member.length.toFixed(2) : +(geometry.width?.value ?? 8).toFixed(2);
  }
  // Mauerbank: liegt satt auf der Mauerkrone. Als "Stützweite" wird nur der
  // Abstand der Verankerungspunkte (Sturmanker, ca. 1,5 m) angesetzt — sie
  // spannt NICHT über die Gebäudelänge frei.
  if (isMauerbank(member)) return 1.5;
  if (member.type === 'pfette') {
    const buildingLen = geometry.length?.value ?? 21.8;
    const numBays = Math.max(1, Math.ceil(buildingLen / supportSpacing));
    return +(buildingLen / numBays).toFixed(2);
  }
  // Sparren: die STATISCHE Stützweite ist der Abstand Mauerbank↔First aus der
  // Geometrie — NICHT member.length, denn das enthält den Dachüberstand
  // (Kragarm, entlastet das Feld). Kehlbalken/Zangen wirken als Zwischen-
  // stützung → wirksame Stützweite × kehlFactor (klassische Vorbemessung).
  if (member.type === 'sparren' || member.type === 'nebentraeger') {
    const halfWidth = (geometry.width?.value ?? 8) / 2;
    const rise = Math.max(0.1, (geometry.ridgeHeight?.value ?? 6) - (geometry.eavesHeight?.value ?? 4));
    const geomSlope = Math.sqrt(halfWidth * halfWidth + rise * rise);
    // Sattel: Geometrie-Schräge (halbe Breite). Pultdach-Sparren sind länger
    // (volle Breite) — dort member.length abzüglich ~1 m Überstände (beide Enden).
    const span = member.length > 0
      ? Math.min(member.length, Math.max(geomSlope, member.length - 1.0))
      : geomSlope;
    return +(span * (opts?.kehlFactor ?? 1)).toFixed(2);
  }
  if (member.length > 0) return member.length;
  // Fallback aus Geometrie
  const halfWidth = (geometry.width?.value ?? 8) / 2;
  switch (member.type) {
    case 'pfette':     return geometry.length?.value ?? 4;
    case 'kehlbalken': return halfWidth * 0.6;
    case 'leimbinder': return geometry.width?.value ?? 8;
    case 'stuetze':    return geometry.ridgeHeight?.value ?? 3;
    default:           return 4;
  }
}

/** Linienlast [kN/m] für einen Sparren, ZERLEGT in die Sparrenachse.
 *
 *  Der Sparren ist ein SCHRÄGER Träger. Für das Biegemoment zählt nur der
 *  Lastanteil SENKRECHT zur Sparrenachse; der Anteil längs der Achse wirkt als
 *  Normalkraft (siehe sparrenNormalkraft).
 *
 *    g_k  [kN/m² Dachfläche]  → je m Sparren: g_k · e         → ⊥: × cos α
 *    s_k  [kN/m² Grundriss]   → je m Sparren: s_k · e · cos α → ⊥: × cos α
 *
 *  Damit gilt M = q_⊥ · l_Schräge² / 8 — genau so, wie es ein Zimmermeister
 *  mit der Sparrenlänge nachrechnet. (Vorher wurden horizontale Lasten mit der
 *  Schräglänge kombiniert → Moment um 1/cos²α zu groß, bei 30° +33 %.)
 */
function sparrenLoad(gk: number, sk: number, spacing: number, roofPitch: number): { qg: number; qs: number } {
  const alpha = (roofPitch * Math.PI) / 180;
  const cosA = Math.cos(alpha);
  return {
    qg: gk * spacing * cosA,
    qs: sk * spacing * cosA * cosA,
  };
}

/** Ergebnis der Traufschub-Ermittlung eines Gespärres. */
interface Traufschub {
  /** Horizontalschub am Auflager [kN] (Bemessungswert) */
  H: number;
  /** Vertikale Auflagerkraft je Sparrenfuß [kN] */
  V: number;
  /** Drucknormalkraft im Sparren [kN] */
  N: number;
  erklaerung: string;
}

/**
 * Traufschub / Normalkraft eines Sparrens.
 *
 *  Sparren- und Kehlbalkendach sind Dreiecksbinder: das Dach drückt die Wände
 *  auseinander. Der Horizontalschub H muss von Zangen / Kehlbalken / Decken-
 *  balken als ZUG aufgenommen werden, und er läuft als DRUCK durch den Sparren.
 *
 *    q_v = vertikale Bemessungslast je m Grundriss und Sparren [kN/m]
 *    V   = q_v · B / 2                (vertikale Auflagerkraft)
 *    H   = q_v · B² / (8 · f)         (Dreigelenk-Analogie, f = Firsthöhe über Zugband)
 *    N   = V · sin α + H · cos α      (Druck im Sparren am Fußpunkt)
 *
 *  Beim Pfettendach nehmen Pfetten und Steher die Vertikallast ab; es entsteht
 *  kein Dreiecksschub, nur die Längskomponente der Dachlast.
 */
function sparrenNormalkraft(
  gk: number, sk: number, spacing: number, roofPitch: number,
  buildingWidth: number, rise: number, mitPfetten: boolean, slopeLen: number,
): Traufschub {
  const alpha = (roofPitch * Math.PI) / 180;
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  // Vertikale Bemessungslast je m Grundriss (Eigengewicht auf Dachfläche → /cos α)
  const qv = 1.35 * (gk / Math.max(0.2, cosA)) * spacing + 1.5 * sk * spacing;

  if (mitPfetten) {
    // Pfettendach: nur die Längskomponente der Dachlast läuft bis zur Mauerbank
    const N = qv * cosA * sinA * slopeLen;
    return {
      H: 0, V: qv * slopeLen * cosA / 2, N,
      erklaerung: `Pfettendach: kein Dreiecksschub (Pfetten/Steher tragen vertikal ab). Längskraft im Sparren N = q_v·cos α·sin α·l = ${N.toFixed(1)} kN.`,
    };
  }

  const f = Math.max(0.4, rise);
  const V = (qv * buildingWidth) / 2;
  const H = (qv * buildingWidth * buildingWidth) / (8 * f);
  const N = V * sinA + H * cosA;
  return {
    H, V, N,
    erklaerung: `Sparren-/Kehlbalkendach: q_v = ${qv.toFixed(2)} kN/m, B = ${buildingWidth.toFixed(2)} m, f = ${f.toFixed(2)} m → V = ${V.toFixed(1)} kN, Traufschub H = ${H.toFixed(1)} kN, Sparrendruck N = ${N.toFixed(1)} kN.`,
  };
}

/** Linienlast [kN/m] für Pfetten.
 *
 *  Lasteinzugsbreite einer Mittelpfette = halbe Sparrenlänge oben + halbe Sparrenlänge unten
 *  = sparrenLaenge / 2 (bei symmetrischem Dach mit Pfette in Hälfte).
 *  Allgemeiner Fall: tributaryWidth = sparrenLaenge / 2.
 *
 *  NICHT: sparrenSpacing (Sparrenabstand), der senkrecht zur Last wirkt.
 */
function pfettenLoad(gk: number, sk: number, sparrenLaenge: number, _pfettenSpan: number): { qg: number; qs: number; tributaryWidth: number } {
  // Mittelpfette: trägt je halbe Sparrenlänge von oben und unten → gesamt sparrenLaenge/2
  const tributaryWidth = sparrenLaenge / 2;
  const qg = gk * tributaryWidth;
  const qs = sk * tributaryWidth;
  return { qg, qs, tributaryWidth };
}

/** Linienlast [kN/m] für Kehlbalken (Zugglied, vereinfacht: 50% Sparrenlast). */
function kehlbalkenLoad(gk: number, sk: number, spacing: number): { qg: number; qs: number } {
  // Kehlbalken wirkt hauptsächlich auf Zug, aber auch auf Querbiegung
  // Vereinfachung: 50% der Sparrenlast als Biegelast
  return {
    qg: 0.5 * gk * spacing,
    qs: 0.5 * sk * spacing,
  };
}

/** Linienlast [kN/m] für Leimbinder (trägt volles Lastfeld = pfettenSpan). */
function leimbinderLoad(gk: number, sk: number, pfettenSpan: number): { qg: number; qs: number } {
  return {
    qg: gk * pfettenSpan,
    qs: sk * pfettenSpan,
  };
}

/**
 * Nachweis eines Zuggliedes (Zange / Kehlbalken) auf Zug + Biegung nach EC5 6.2.3.
 *
 *   σ_t,0,d = N_d / (k_A · A)      mit k_A = 0,85 (Schwächung durch Bolzen/Nägel)
 *   σ_t,0,d / f_t,0,d + σ_m,d / f_m,d ≤ 1
 *
 * Es wird das ZANGENPAAR betrachtet: die Zugkraft teilt sich auf beide Hölzer.
 */
function checkZugglied(
  b: number, h: number, timberClass: string, zugkraftPaar: number,
  span: number, qg: number, qs: number,
): { checks: MemberCalcEntry['checks']; eta: number; status: 'green' | 'yellow' | 'red'; erfBolzen: number } {
  const mat = TIMBER_CLASSES[timberClass] ?? TIMBER_CLASSES.C24;
  const kmod = K_MOD['1'].shortTerm;
  const gammaM = GAMMA_M[mat.category];
  const A = b * h;
  const kA = 0.85;
  const N_d = (zugkraftPaar / 2) * 1000;                     // N je Holz
  const sigma_t = N_d / (kA * A);
  const kh = h < 150 ? Math.min(1.3, Math.pow(150 / h, 0.2)) : 1;
  const f_t0d = (kmod * mat.ft0k * kh) / gammaM;
  const eta_t = sigma_t / f_t0d;

  // Begleitende Biegung aus Eigengewicht über die halbe Zangenlänge
  const q_d = 1.35 * qg + 1.5 * qs;
  const M_d = (q_d * span * span) / 8;
  const W = (b * h * h) / 6;
  const sigma_m = (M_d * 1e6) / W;
  const f_md = (kmod * mat.fmk * kh) / gammaM;
  const eta_m = sigma_m / f_md;
  const eta_komb = eta_t + eta_m;

  // Anschluss: Tragfähigkeit eines Bolzens M12 im zweischnittigen Holz-Holz-
  // Anschluss überschlägig 12 kN (ÖNORM EN 1995-1-1, Johansen).
  const erfBolzen = Math.max(2, Math.ceil(zugkraftPaar / 12));

  const st = (e: number): 'green' | 'yellow' | 'red' => e > 1 ? 'red' : e > 0.85 ? 'yellow' : 'green';
  return {
    eta: eta_komb,
    status: st(eta_komb),
    erfBolzen,
    checks: [
      {
        name: 'Zug längs der Faser',
        utilization: eta_t,
        status: st(eta_t),
        explanation: `Die Zange hält das Gespärre zusammen: sie nimmt den Traufschub als Zugkraft auf. N = ${zugkraftPaar.toFixed(1)} kN je Zangenpaar, also ${(zugkraftPaar / 2).toFixed(1)} kN je Holz. Mit 15 % Querschnittsschwächung durch die Bolzen: σ_t,0,d = ${sigma_t.toFixed(2)} N/mm² gegen f_t,0,d = ${f_t0d.toFixed(2)} N/mm².`,
      },
      {
        name: 'Zug + Biegung',
        utilization: eta_komb,
        status: st(eta_komb),
        explanation: `Zug und Biegung wirken gemeinsam (EC5 6.2.3): σ_t/f_t + σ_m/f_m = ${eta_t.toFixed(2)} + ${eta_m.toFixed(2)} = ${eta_komb.toFixed(2)}.`,
      },
      {
        name: 'Anschluss Zange–Sparren',
        utilization: 0,
        status: 'green',
        explanation: `Für ${zugkraftPaar.toFixed(1)} kN Zugkraft sind je Anschlusspunkt rechnerisch ${erfBolzen} Bolzen M12 (zweischnittig, ca. 12 kN je Bolzen) oder gleichwertige Vollgewindeschrauben erforderlich. Das ist der Punkt, an dem ein Sparrendach tatsächlich versagt — nicht das Holz selbst.`,
      },
    ],
  };
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────

export function autoCalculateAllMembers(
  members: TimberMember[],
  loads: { gk: number; sk: number; altitude?: number; wk_suction?: number },
  geometry: BuildingGeometry,
  sparrenSpacing: number,
  supportSpacing = 4.0,
): AutoCalculationResult {
  // ÖNORM B 1995-1-1: Schnee ist bis 1000 m Seehöhe eine KURZE Einwirkung
  // (k_mod 0,9), darüber eine MITTLERE (k_mod 0,8).
  const schneeDauer: BeamInput['variableDuration'] =
    (loads.altitude ?? 0) > 1000 ? 'mediumTerm' : 'shortTerm';
  const assumptions: AutoAssumption[] = [];
  const resultMembers: MemberCalcEntry[] = [];
  const optimizedMembers: TimberMember[] = [];

  const roofPitch = geometry.roofPitch?.value ?? 35;
  const pfettenSpan = geometry.length?.value ?? 4;
  const buildingWidth = geometry.width?.value ?? 8;
  // Sparrenlänge (Schräge) = halbe Gebäudebreite / cos(α)
  const sparrenLaenge = (buildingWidth / 2) / Math.cos((roofPitch * Math.PI) / 180);

  assumptions.push({
    field: 'sparrenSpacing',
    value: sparrenSpacing,
    reason: `Sparrenabstand ${sparrenSpacing} m verwendet für Lastermittlung aller Bauteile`,
    source: 'derived',
  });
  assumptions.push({
    field: 'serviceClass',
    value: '1',
    reason: 'Nutzungsklasse 1 (überdacht, trocken) für alle Holzbauteile angenommen',
    source: 'standard',
  });
  assumptions.push({
    field: 'loadDuration',
    value: 'shortTerm',
    reason: 'Schneelast als kurzzeitig (shortTerm) klassifiziert – ungünstigste k_mod-Annahme',
    source: 'standard',
  });

  // Kehlbalken/Zangen stützen den Sparren quer → wirksame Biege-Stützweite
  // reduziert (klassische Vorbemessung: Kehlbalken ≈ Zwischenauflager, Faktor
  // 0,7; Zangenpaar etwas schwächer, Faktor 0,85).
  const hasKehl = members.some(m => m.type === 'kehlbalken');
  const hasZange = members.some(m => m.type === 'zange');
  const kehlFactor = hasKehl ? 0.7 : hasZange ? 0.85 : 1;

  // ── Tragsystem erkennen → Traufschub / Normalkräfte ───────────────────────
  // Ein Gespärre-Dach (Sparren-/Kehlbalkendach) hat KEINE tragende First-/
  // Mittelpfette; dort entsteht Traufschub, den Zangen/Kehlbalken abfangen.
  const hasTragendePfette = members.some(m => m.type === 'pfette' && /first|mittel/i.test(m.name));
  const istGespaerre = !hasTragendePfette && (hasZange || hasKehl);
  const rise = Math.max(0.1, (geometry.ridgeHeight?.value ?? 6) - (geometry.eavesHeight?.value ?? 4));
  const schub = sparrenNormalkraft(
    loads.gk, loads.sk, sparrenSpacing, roofPitch,
    buildingWidth, rise, !istGespaerre, sparrenLaenge,
  );
  assumptions.push({
    field: 'tragwerk.normalkraft',
    value: `N = ${schub.N.toFixed(1)} kN${schub.H > 0 ? `, H = ${schub.H.toFixed(1)} kN` : ''}`,
    reason: schub.erklaerung,
    source: 'derived',
  });

  // Zugband-Kräfte: der Traufschub aller Gespärre verteilt sich auf die
  // vorhandenen Zangen-/Kehlbalkenpaare.
  const sparrenStk = members.filter(m => m.type === 'sparren').reduce((s, m) => s + m.quantity, 0);
  const zugbandStk = members.filter(m => m.type === 'zange' || m.type === 'kehlbalken').reduce((s, m) => s + m.quantity, 0);
  const gespaerreAnzahl = Math.max(1, Math.round(sparrenStk / 2));
  const zugbandPaare = Math.max(1, Math.round(zugbandStk / 2));
  const zugkraftProPaar = istGespaerre ? schub.H * (gespaerreAnzahl / zugbandPaare) : 0;
  if (kehlFactor < 1) {
    assumptions.push({
      field: 'sparren.stuetzweite',
      value: `× ${kehlFactor}`,
      reason: `${hasKehl ? 'Kehlbalken' : 'Zangen'} wirken als Zwischenstützung der Sparren → wirksame Biege-Stützweite × ${kehlFactor} (Vorbemessung).`,
      source: 'standard',
    });
  }

  for (const member of members) {
    try {
      const span = resolveSpan(member, geometry, supportSpacing, { kehlFactor });
      const useGlulam = isGlulamMaterial(member.material) || member.type === 'leimbinder';
      const timberClass = parseTimberClass(member.material, useGlulam);

      // ── Lasten je Bauteiltyp ───────────────────────────────────────────────
      let qg = 0;
      let qs = 0;
      let N_Ed = 0;
      let isColumn = false;
      /** Drucknormalkraft im Biegestab [kN] (Sparren) */
      let nAxial = 0;
      /** Abstand der seitlichen Halterung [m] (Lattung/Schalung) */
      let lateralSupport: number | undefined;
      /** Zugglied (Zange/Kehlbalken) → eigener Zugnachweis statt Biegeoptimierung */
      let isTie = false;
      let zugkraft = 0;
      /** Lasteinwirkungsdauer der veränderlichen Hauptlast (bestimmt k_mod) */
      let duration: BeamInput['variableDuration'] = schneeDauer;

      switch (member.type) {
        case 'sparren': {
          const l = sparrenLoad(loads.gk, loads.sk, sparrenSpacing, roofPitch);
          qg = l.qg; qs = l.qs;
          nAxial = schub.N;
          // Dachlattung/Vollschalung halten den Sparren in der Dachebene:
          // Knicklänge quer zur Dachebene konservativ 1,0 m.
          lateralSupport = 1.0;
          assumptions.push({
            field: `${member.name}.last`,
            value: `q⊥,g=${qg.toFixed(2)} kN/m, q⊥,s=${qs.toFixed(2)} kN/m, N=${nAxial.toFixed(1)} kN`,
            reason: `Sparren (schräger Träger): Lasten senkrecht zur Sparrenachse zerlegt — g = gk·e·cos α, s = sk·e·cos²α bei α = ${roofPitch}° und Sparrenabstand ${sparrenSpacing} m. Der Längsanteil wirkt als Normalkraft N = ${nAxial.toFixed(1)} kN (Nachweis Druck + Biegung).`,
            source: 'derived',
          });
          break;
        }
        case 'pfette': {
          const l = pfettenLoad(loads.gk, loads.sk, sparrenLaenge, pfettenSpan);
          qg = l.qg; qs = l.qs;
          assumptions.push({
            field: `${member.name}.last`,
            value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m`,
            reason: `Pfette: Lasteinzugsbreite = sparrenLänge/2 = ${l.tributaryWidth.toFixed(2)} m (Mittelpfette, halbe Sparrenlänge je Seite)`,
            source: 'derived',
          });
          break;
        }
        case 'kehlbalken': {
          // Kehlbalken sind primär Druck-/Zugglieder des Gespärres. Wenn ein
          // Traufschub ermittelt wurde, wird dieser als Zugkraft nachgewiesen;
          // zusätzlich wirkt Eigengewicht (und ggf. begehbarer Dachboden).
          const l = kehlbalkenLoad(loads.gk, loads.sk, sparrenSpacing);
          qg = l.qg; qs = l.qs;
          if (zugkraftProPaar > 0) {
            isTie = true;
            zugkraft = zugkraftProPaar;
          }
          assumptions.push({
            field: `${member.name}.last`,
            value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m${zugkraftProPaar > 0 ? `, N_Zug=${zugkraftProPaar.toFixed(1)} kN` : ''}`,
            reason: `Kehlbalken: 50 % der Sparrenlast als Querlast${zugkraftProPaar > 0 ? ` + Traufschub ${zugkraftProPaar.toFixed(1)} kN als Zugkraft` : ''}`,
            source: 'derived',
          });
          break;
        }
        case 'leimbinder': {
          const l = leimbinderLoad(loads.gk, loads.sk, pfettenSpan);
          qg = l.qg; qs = l.qs;
          assumptions.push({
            field: `${member.name}.last`,
            value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m`,
            reason: `Leimbinder: Lasteinzugsbreite = Pfettenabstand ${pfettenSpan} m (volles Lastfeld)`,
            source: 'derived',
          });
          break;
        }
        case 'stuetze': {
          isColumn = true;
          // Ein Steher trägt das Stück Mittel-/Firstpfette zwischen den
          // Nachbarstehern (= Stützenabstand) mal der Lasteinzugsbreite der
          // Pfette (= halbe Sparrenlänge). Vorher wurde fälschlich der
          // Sparrenabstand (0,8 m) statt des Stützenabstands eingesetzt —
          // die Steherlast war dadurch um ein Vielfaches zu klein.
          const alphaR = (roofPitch * Math.PI) / 180;
          const einzugSchraege = sparrenLaenge / 2;              // m entlang Dachfläche
          const tribDach = supportSpacing * einzugSchraege;      // m² Dachfläche (für gk)
          const tribGrund = supportSpacing * einzugSchraege * Math.cos(alphaR); // m² Grundriss (für sk)
          N_Ed = 1.35 * loads.gk * tribDach + 1.5 * loads.sk * tribGrund;
          assumptions.push({
            field: `${member.name}.last`,
            value: `N_Ed=${N_Ed.toFixed(1)} kN`,
            reason: `Steher: Lasteinzug = Stützenabstand ${supportSpacing.toFixed(2)} m × halbe Sparrenlänge ${einzugSchraege.toFixed(2)} m = ${tribDach.toFixed(2)} m² Dachfläche (${tribGrund.toFixed(2)} m² Grundriss für Schnee). N_Ed = 1,35·g + 1,5·s.`,
            source: 'derived',
          });
          break;
        }
        case 'zange': {
          // Zangen sind ZUGGLIEDER: sie fangen den Traufschub des Gespärres ab
          // und tragen KEINE Dachfläche. Sie werden auf Zug nachgewiesen, nicht
          // als Biegeträger (das würde absurd große Querschnitte liefern).
          isTie = true;
          zugkraft = zugkraftProPaar;
          qg = 0.15; // Eigengewicht + Montagelast
          qs = 0.1;
          break;
        }
        case 'rahm':
        case 'auswechslung':
        case 'nebentraeger': {
          // Deckenbalken: eigene Nutzlast statt Schneelast
          if (isDeckenbalken(member)) {
            const isSpitzboden = member.name.includes('Spitzboden');
            const qk = isSpitzboden ? 1.0 : 2.0; // kN/m² Nutzlast
            const beamSpacing = 0.8; // Standard-Achsabstand
            qg = 1.5 * beamSpacing; // Eigengewicht Deckenaufbau ~1.5 kN/m²
            qs = qk * beamSpacing;
            // Nutzlast im Wohnbau ist MITTELFRISTIG (k_mod 0,8), nicht kurz —
            // sonst wird die Decke rund 12 % zu günstig gerechnet.
            duration = 'mediumTerm';
            assumptions.push({
              field: `${member.name}.last`,
              value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m`,
              reason: `Deckenbalken: Eigengewicht 1.5 kN/m² + Nutzlast ${qk} kN/m² (${isSpitzboden ? 'Spitzboden' : 'Wohnen'}) × Achsabstand ${beamSpacing} m, Stützweite ${span.toFixed(2)} m (Deckenspannweite), Lasteinwirkungsdauer mittel (k_mod 0,8).`,
              source: 'standard',
            });
          } else {
            // Generische Schätzung: Nebenträger trägt halbes Feld
            qg = loads.gk * sparrenSpacing * 0.5;
            qs = loads.sk * sparrenSpacing * 0.5;
            assumptions.push({
              field: `${member.name}.last`,
              value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m`,
              reason: `${member.type}: vereinfacht 50% Sparrenlast als Nebenträger angenommen`,
              source: 'fallback',
            });
          }
          break;
        }
        default: {
          qg = loads.gk * sparrenSpacing * 0.5;
          qs = loads.sk * sparrenSpacing * 0.5;
          break;
        }
      }

      // ── Bemessung ─────────────────────────────────────────────────────────

      if (isMauerbank(member)) {
        // ── Mauerbank (Fußpfette) ───────────────────────────────────────────
        // Liegt vollflächig auf der Mauerkrone und wird NICHT auf Biegung
        // bemessen. Maßgebend ist der Querdruck aus dem Sparrenfuß (Holz ist
        // quer zur Faser weich) und die Verankerung gegen Windsog. Der
        // Querschnitt ist konstruktiv (üblich 12/12 bis 16/12) und darf vom
        // Optimierer nicht auf ein Sparrenprofil heruntergerechnet werden.
        const mbB = member.width > 0 ? member.width : 140;
        const mbH = member.height > 0 ? member.height : 100;
        const mat = TIMBER_CLASSES.C24;
        const f_c90d = (K_MOD['1'].shortTerm * mat.fc90k) / GAMMA_M.solid;
        const kc90 = 1.5;
        // Auflagerfläche Sparrenfuß: Sparrenbreite × Kervenlänge (≈ 120 mm)
        const sparrenB = members.find(m => m.type === 'sparren')?.width || 80;
        const auflagerA = sparrenB * 120;
        const V_fuss = schub.V > 0 ? schub.V : 1;
        const sigma_c90 = (V_fuss * 1000) / auflagerA;
        const etaMB = sigma_c90 / (kc90 * f_c90d);
        const stMB: 'green' | 'yellow' | 'red' = etaMB > 1 ? 'red' : etaMB > 0.85 ? 'yellow' : 'green';

        resultMembers.push({
          member,
          section: { b: mbB, h: mbH, label: `${mbB / 10}/${mbH / 10}` },
          timberClass: 'C24',
          maxUtilization: etaMB,
          overallStatus: stMB,
          summary: `Mauerbank ${mbB / 10}/${mbH / 10} C24 konstruktiv auf der Mauerkrone. Maßgebend ist der Querdruck aus dem Sparrenfuß: η = ${etaMB.toFixed(2)}.`,
          checks: [{
            name: 'Querdruck aus Sparrenfuß',
            utilization: etaMB,
            status: stMB,
            explanation: `Jeder Sparren drückt mit ${V_fuss.toFixed(1)} kN auf die Mauerbank. Quer zur Faser ist Holz viel weicher als längs. Auflagerfläche = Sparrenbreite ${sparrenB} mm × Kerve 120 mm → σ_c,90,d = ${sigma_c90.toFixed(2)} N/mm² gegen k_c,90·f_c,90,d = ${(kc90 * f_c90d).toFixed(2)} N/mm². Die Mauerbank spannt NICHT frei, sie liegt satt auf der Mauerkrone auf.`,
          }, {
            name: 'Verankerung in der Mauerkrone',
            utilization: 0,
            status: 'green',
            explanation: `Die Mauerbank ist mit Ankerschrauben oder Gewindestangen in der Mauerkrone zu verankern (üblich alle 1,5 m, mindestens 2 Stück je Wandabschnitt). Sie überträgt Windsog und Traufschub in das Mauerwerk.`,
          }],
        });
        optimizedMembers.push({
          ...member,
          width: mbB, height: mbH,
          crossSection: `${mbB / 10}/${mbH / 10}`,
          material: 'C24',
          calculationStatus: stMB,
        });

      } else if (isTie) {
        // ── Zugglied (Zange / Kehlbalken): Zug + Biegung statt Biegeoptimierung ──
        let tb = member.width > 0 ? member.width : 60;
        let th = member.height > 0 ? member.height : 160;
        let tie = checkZugglied(tb, th, 'C24', zugkraft, span, qg, qs);

        // Falls der Zugnachweis nicht reicht: Querschnitt hochstufen
        for (let iter = 0; iter < 6 && tie.eta > 0.95; iter++) {
          const next = nextLargerProfile({ b: tb, h: th }, false);
          if (!next) break;
          assumptions.push({
            field: `iteration.${member.id ?? member.name}.${iter + 1}`,
            value: `${tb}/${th}→${next.label} mm bei η=${tie.eta.toFixed(2)}`,
            reason: `Zugnachweis der Zange nicht erfüllt → Querschnitt hochgestuft`,
            source: 'derived',
          });
          tb = next.b; th = next.h;
          tie = checkZugglied(tb, th, 'C24', zugkraft, span, qg, qs);
        }

        assumptions.push({
          field: `${member.name}.last`,
          value: `N_Zug = ${zugkraft.toFixed(1)} kN je Paar`,
          reason: `Zange als Zugglied: der Traufschub von ${gespaerreAnzahl} Gespärren verteilt sich auf ${zugbandPaare} Zangenpaare → ${zugkraft.toFixed(1)} kN je Paar. Anschluss: ${tie.erfBolzen} Bolzen M12 je Anschlusspunkt.`,
          source: 'derived',
        });

        resultMembers.push({
          member,
          section: { b: tb, h: th, label: `${tb / 10}/${th / 10}` },
          timberClass: 'C24',
          maxUtilization: tie.eta,
          overallStatus: tie.status,
          summary: `Zange ${tb / 10}/${th / 10} C24 als Zugglied: N = ${zugkraft.toFixed(1)} kN je Paar, η = ${tie.eta.toFixed(2)}. Anschluss mit ${tie.erfBolzen} Bolzen M12 je Punkt.`,
          checks: tie.checks,
        });
        optimizedMembers.push({
          ...member,
          width: tb,
          height: th,
          crossSection: `${tb / 10}/${th / 10}`,
          material: 'C24',
          calculationStatus: tie.status,
        });

      } else if (isColumn) {
        // Stütze: direkter Knicknachweis mit vorhandenem Querschnitt
        const colB = member.width  > 0 ? member.width  : 120;
        const colH = member.height > 0 ? member.height : 160;
        const colClass = timberClass.startsWith('GL') ? timberClass : 'C24';

        const colResult = calculateColumn({
          height: span,
          b: colB,
          h: colH,
          timberClass: colClass,
          N_Ed,
          bucklingFactor: 1.0,
          duration: 'shortTerm',
          serviceClass: '1',
        });

        const entry: MemberCalcEntry = {
          member,
          section: { b: colB, h: colH, label: `${colB}/${colH} mm` },
          timberClass: colClass,
          maxUtilization: colResult.maxUtilization,
          overallStatus: colResult.overallStatus,
          summary: colResult.summary,
          checks: colResult.checks.map(c => ({
            name: c.name,
            utilization: c.utilization,
            status: c.status,
            explanation: c.explanation,
          })),
        };
        resultMembers.push(entry);

        optimizedMembers.push({
          ...member,
          width: colB,
          height: colH,
          calculationStatus: colResult.overallStatus,
        });

      } else if (useGlulam) {
        // Leimbinder: optimizeGlulam → dann ggf. Profil hochstufen bis η ≤ 0.95
        const shape: GlulamBeamInput['shape'] = span > 12 ? 'pitched' : 'straight';
        const glulamBaseInput: Omit<GlulamBeamInput, 'b' | 'h' | 'timberClass'> & { preferredClasses?: string[] } = {
          type: 'leimbinder',
          span,
          qPermanent: qg,
          qVariable: qs,
          variableDuration: duration,
          serviceClass: '1',
          shape,
          preferredClasses: ['GL24h', 'GL28h'],
        };

        const optResult = optimizeGlulam(glulamBaseInput);

        // ── Upscaling-Loop: falls Optimizer-Ergebnis η > 0.95 ─────────────────
        const MAX_ITER = 8;
        const TARGET_ETA = 0.95;
        let currentSection = { b: optResult.bestSection.b, h: optResult.bestSection.h, label: optResult.bestSection.label };
        let currentClass = optResult.bestClass;
        let currentResult = optResult.result;
        let upscaleStatus: 'green' | 'yellow' | 'red' = currentResult.overallStatus;

        // Optional: Prüfe ob kleineres Profil reicht (η < 0.5 → eine Stufe kleiner)
        if (currentResult.maxUtilization < 0.5) {
          const profileList = BSH_PROFILES;
          const currentIdx = profileList.findIndex(p => p.b === currentSection.b && p.h === currentSection.h);
          if (currentIdx > 0) {
            const smallerSec = profileList[currentIdx - 1];
            const testResult = calculateGlulam({
              ...glulamBaseInput,
              b: smallerSec.b,
              h: smallerSec.h,
              timberClass: currentClass,
            });
            if (testResult.maxUtilization <= TARGET_ETA) {
              assumptions.push({
                field: `iteration.${member.id ?? member.name}.downsize`,
                value: `${currentSection.label}→${smallerSec.label} mm bei η=${testResult.maxUtilization.toFixed(2)}`,
                reason: `η < 0.5 beim Optimizer-Ergebnis → kleineres BSH-Profil geprüft und ausreichend`,
                source: 'derived',
              });
              currentSection = smallerSec;
              currentResult = testResult;
            }
          }
        }

        if (currentResult.maxUtilization > TARGET_ETA) {
          for (let iter = 0; iter < MAX_ITER; iter++) {
            const prevLabel = currentSection.label;
            const prevEta = currentResult.maxUtilization;
            const next = nextLargerProfile({ b: currentSection.b, h: currentSection.h }, true);
            if (!next) {
              upscaleStatus = 'red';
              assumptions.push({
                field: `iteration.${member.id ?? member.name}.${iter + 1}`,
                value: `${prevLabel} mm bei η=${prevEta.toFixed(2)} → Profil-Reihe ausgeschöpft`,
                reason: `Kein größeres BSH-Standardprofil verfügbar – Bauteil als NICHT OK markiert`,
                source: 'derived',
              });
              break;
            }
            const testResult = calculateGlulam({
              ...glulamBaseInput,
              b: next.b,
              h: next.h,
              timberClass: currentClass,
            });
            assumptions.push({
              field: `iteration.${member.id ?? member.name}.${iter + 1}`,
              value: `${prevLabel}→${next.label} mm bei η=${testResult.maxUtilization.toFixed(2)}`,
              reason: `η=${prevEta.toFixed(2)} > 0.95 → Profil auf ${next.label} hochgestuft`,
              source: 'derived',
            });
            currentSection = next;
            currentResult = testResult;
            if (testResult.maxUtilization <= TARGET_ETA) {
              upscaleStatus = 'green';
              break;
            }
          }
        }

        const finalSummary = currentResult.maxUtilization > TARGET_ETA && upscaleStatus === 'red'
          ? `Profil-Reihe ausgeschöpft – kein BSH-Standardprofil ausreichend. ${optResult.reasoning}`
          : optResult.reasoning;

        // ── Varianten berechnen (wirtschaftlich + sicher) ────────────────────
        const wirtschaftlichVariant: DimensioningVariant = {
          b: currentSection.b,
          h: currentSection.h,
          label: currentSection.label,
          eta: currentResult.maxUtilization,
          status: upscaleStatus === 'red' ? 'red' : currentResult.overallStatus,
        };

        let sicherVariant: DimensioningVariant;
        const nextForSicher = nextLargerProfile({ b: currentSection.b, h: currentSection.h }, true);
        if (nextForSicher && upscaleStatus !== 'red') {
          const sicherResult = calculateGlulam({
            ...glulamBaseInput,
            b: nextForSicher.b,
            h: nextForSicher.h,
            timberClass: currentClass,
          });
          sicherVariant = {
            b: nextForSicher.b,
            h: nextForSicher.h,
            label: nextForSicher.label,
            eta: sicherResult.maxUtilization,
            status: sicherResult.overallStatus,
          };
        } else {
          // Kein größeres Profil → sicher = wirtschaftlich
          sicherVariant = { ...wirtschaftlichVariant };
        }

        const entry: MemberCalcEntry = {
          member,
          section: currentSection,
          timberClass: currentClass,
          maxUtilization: currentResult.maxUtilization,
          overallStatus: upscaleStatus === 'red' ? 'red' : currentResult.overallStatus,
          summary: finalSummary,
          checks: currentResult.checks.map(c => ({
            name: c.name,
            utilization: c.utilization,
            status: c.status,
            explanation: c.explanation,
          })),
          variants: { wirtschaftlich: wirtschaftlichVariant, sicher: sicherVariant },
        };
        resultMembers.push(entry);

        optimizedMembers.push({
          ...member,
          width: currentSection.b,
          height: currentSection.h,
          crossSection: currentSection.label,
          material: currentClass,
          calculationStatus: upscaleStatus === 'red' ? 'red' : currentResult.overallStatus,
        });

      } else {
        // KVH / Vollholz: optimizeBeam → dann ggf. Profil hochstufen bis η ≤ 0.95
        const beamType = (
          member.type === 'sparren'    ? 'sparren'    :
          member.type === 'pfette'     ? 'pfette'     :
          member.type === 'kehlbalken' ? 'kehlbalken' :
          'nebentraeger'
        ) as BeamInput['type'];

        const beamBaseInput: Omit<BeamInput, 'b' | 'h' | 'timberClass'> & { preferredClasses?: string[] } = {
          type: beamType,
          span,
          qPermanent: qg,
          qVariable: qs,
          variableDuration: duration,
          serviceClass: '1',
          N_Ed: nAxial,
          lateralSupport,
          inclination: member.type === 'sparren' ? roofPitch : undefined,
          preferredClasses: ['C24', 'C30'],
        };

        const optResult = optimizeBeam(beamBaseInput);

        // ── Upscaling-Loop: falls Optimizer-Ergebnis η > 0.95 ─────────────────
        const MAX_ITER_KVH = 8;
        const TARGET_ETA_KVH = 0.95;
        let currentSection = { b: optResult.bestSection.b, h: optResult.bestSection.h, label: optResult.bestSection.label };
        let currentClass = optResult.bestClass;
        let currentResult = optResult.result;
        let upscaleStatus: 'green' | 'yellow' | 'red' = currentResult.overallStatus;

        // Optional: Prüfe ob kleineres Profil reicht (η < 0.5 → eine Stufe kleiner)
        if (currentResult.maxUtilization < 0.5) {
          const profileList = KVH_PROFILES;
          const currentIdx = profileList.findIndex(p => p.b === currentSection.b && p.h === currentSection.h);
          if (currentIdx > 0) {
            const smallerSec = profileList[currentIdx - 1];
            const testResult = calculateBeam({
              ...beamBaseInput,
              b: smallerSec.b,
              h: smallerSec.h,
              timberClass: currentClass,
            });
            if (testResult.maxUtilization <= TARGET_ETA_KVH) {
              assumptions.push({
                field: `iteration.${member.id ?? member.name}.downsize`,
                value: `${currentSection.label}→${smallerSec.label} mm bei η=${testResult.maxUtilization.toFixed(2)}`,
                reason: `η < 0.5 beim Optimizer-Ergebnis → kleineres KVH-Profil geprüft und ausreichend`,
                source: 'derived',
              });
              currentSection = smallerSec;
              currentResult = testResult;
            }
          }
        }

        if (currentResult.maxUtilization > TARGET_ETA_KVH) {
          for (let iter = 0; iter < MAX_ITER_KVH; iter++) {
            const prevLabel = currentSection.label;
            const prevEta = currentResult.maxUtilization;
            const next = nextLargerProfile({ b: currentSection.b, h: currentSection.h }, false);
            if (!next) {
              upscaleStatus = 'red';
              assumptions.push({
                field: `iteration.${member.id ?? member.name}.${iter + 1}`,
                value: `${prevLabel} mm bei η=${prevEta.toFixed(2)} → Profil-Reihe ausgeschöpft`,
                reason: `Kein größeres KVH-Standardprofil verfügbar – Bauteil als NICHT OK markiert`,
                source: 'derived',
              });
              break;
            }
            const testResult = calculateBeam({
              ...beamBaseInput,
              b: next.b,
              h: next.h,
              timberClass: currentClass,
            });
            assumptions.push({
              field: `iteration.${member.id ?? member.name}.${iter + 1}`,
              value: `${prevLabel}→${next.label} mm bei η=${testResult.maxUtilization.toFixed(2)}`,
              reason: `η=${prevEta.toFixed(2)} > 0.95 → Profil auf ${next.label} hochgestuft`,
              source: 'derived',
            });
            currentSection = next;
            currentResult = testResult;
            if (testResult.maxUtilization <= TARGET_ETA_KVH) {
              upscaleStatus = 'green';
              break;
            }
          }
        }

        const finalSummary = currentResult.maxUtilization > TARGET_ETA_KVH && upscaleStatus === 'red'
          ? `Profil-Reihe ausgeschöpft – kein KVH-Standardprofil ausreichend. Empfehlung: auf BSH wechseln. ${optResult.reasoning}`
          : optResult.reasoning;

        // ── Varianten berechnen (wirtschaftlich + sicher) ──────────────────
        const wirtschaftlichVariantKVH: DimensioningVariant = {
          b: currentSection.b,
          h: currentSection.h,
          label: currentSection.label,
          eta: currentResult.maxUtilization,
          status: upscaleStatus === 'red' ? 'red' : currentResult.overallStatus,
        };

        let sicherVariantKVH: DimensioningVariant;
        const nextForSicherKVH = nextLargerProfile({ b: currentSection.b, h: currentSection.h }, false);
        if (nextForSicherKVH && upscaleStatus !== 'red') {
          const sicherResultKVH = calculateBeam({
            ...beamBaseInput,
            b: nextForSicherKVH.b,
            h: nextForSicherKVH.h,
            timberClass: currentClass,
          });
          sicherVariantKVH = {
            b: nextForSicherKVH.b,
            h: nextForSicherKVH.h,
            label: nextForSicherKVH.label,
            eta: sicherResultKVH.maxUtilization,
            status: sicherResultKVH.overallStatus,
          };
        } else {
          // Kein größeres Profil oder Profil-Reihe ausgeschöpft → sicher = wirtschaftlich
          sicherVariantKVH = { ...wirtschaftlichVariantKVH };
        }

        const entry: MemberCalcEntry = {
          member,
          section: currentSection,
          timberClass: currentClass,
          maxUtilization: currentResult.maxUtilization,
          overallStatus: upscaleStatus === 'red' ? 'red' : currentResult.overallStatus,
          summary: finalSummary,
          checks: currentResult.checks.map(c => ({
            name: c.name,
            utilization: c.utilization,
            status: c.status,
            explanation: c.explanation,
          })),
          variants: { wirtschaftlich: wirtschaftlichVariantKVH, sicher: sicherVariantKVH },
        };
        resultMembers.push(entry);

        optimizedMembers.push({
          ...member,
          width: currentSection.b,
          height: currentSection.h,
          crossSection: currentSection.label,
          material: currentClass,
          calculationStatus: upscaleStatus === 'red' ? 'red' : currentResult.overallStatus,
        });
      }

    } catch (err) {
      // Fehler-Handling: Bauteil mit Status 'red' markieren
      const reason = err instanceof Error ? err.message : String(err);
      resultMembers.push({
        member,
        section: { b: member.width || 0, h: member.height || 0, label: '—' },
        timberClass: '—',
        maxUtilization: 9.99,
        overallStatus: 'red',
        summary: `Bemessung fehlgeschlagen: ${reason}`,
        checks: [],
      });
      optimizedMembers.push({
        ...member,
        calculationStatus: 'red',
      });
      assumptions.push({
        field: `${member.name}.error`,
        value: reason,
        reason: `Bemessung konnte nicht durchgeführt werden – Bauteil als NICHT OK markiert`,
        source: 'fallback',
      });
    }
  }

  // ── Abhebenachweis (Windsog) ──────────────────────────────────────────────
  // ÖNORM B 1991-1-4 / EN 1990: für das Abheben ist das Eigengewicht GÜNSTIG,
  // also mit γ_G = 1,0 anzusetzen, der Sog mit γ_Q = 1,5. Der Sog wirkt
  // senkrecht zur Dachhaut, vom Eigengewicht hält nur die Normalkomponente
  // (g·cos α) dagegen. Ohne diesen Nachweis wurden Sturmanker bisher blind
  // mitverrechnet, ohne dass je geprüft wurde, ob das Dach überhaupt abhebt.
  const wSog = Math.abs(loads.wk_suction ?? 0);
  if (wSog > 0) {
    const alphaR = (roofPitch * Math.PI) / 180;
    const sogD = 1.5 * wSog;                            // kN/m² Dachfläche
    const haltD = 1.0 * loads.gk * Math.cos(alphaR);    // kN/m² Dachfläche
    const netto = sogD - haltD;                         // > 0 → Dach hebt ab
    // Auflagerkraft je Sparrenfuß: halbe Sparrenlast auf die Traufe
    const F_ab = +(netto * sparrenSpacing * sparrenLaenge / 2).toFixed(2);
    // Sturmanker/Winkelverbinder tragen überschlägig 5 kN je Stück (Nagelbild)
    const ankerJeSparren = F_ab > 0 ? Math.max(1, Math.ceil(F_ab / 5)) : 0;
    const eta = haltD > 0 ? sogD / haltD : 9.99;

    for (const entry of resultMembers) {
      if (entry.member.type !== 'sparren') continue;
      entry.checks.push({
        name: 'Abhebesicherung (Windsog)',
        utilization: F_ab > 0 ? Math.min(0.99, eta / 3) : 0,
        status: 'green',
        explanation: F_ab > 0
          ? `Windsog ${wSog.toFixed(2)} kN/m² × 1,5 = ${sogD.toFixed(2)} kN/m² gegen Eigengewicht ${loads.gk.toFixed(2)} × cos ${roofPitch}° = ${haltD.toFixed(2)} kN/m² (γ_G = 1,0, weil günstig). Das Dach hebt mit ${netto.toFixed(2)} kN/m² ab → ${F_ab.toFixed(1)} kN Zug je Sparrenfuß. Erforderlich: ${ankerJeSparren} Sturmanker bzw. Winkelverbinder je Sparren, durchgehend bis in die Mauerbank und von dort in die Mauerkrone verankert.`
          : `Windsog ${wSog.toFixed(2)} kN/m² × 1,5 = ${sogD.toFixed(2)} kN/m² ist kleiner als das haltende Eigengewicht ${haltD.toFixed(2)} kN/m². Das Dach hebt rechnerisch nicht ab; Sturmanker trotzdem konstruktiv setzen (1 Stk je Sparren).`,
      });
    }

    assumptions.push({
      field: 'tragwerk.abhebesicherung',
      value: F_ab > 0 ? `${F_ab.toFixed(1)} kN je Sparrenfuß → ${ankerJeSparren} Anker` : 'kein Abheben',
      reason: F_ab > 0
        ? `Abhebenachweis: 1,5·Sog − 1,0·g·cos α = ${netto.toFixed(2)} kN/m² → ${F_ab.toFixed(1)} kN Zug je Sparrenfuß, ${ankerJeSparren} Sturmanker je Sparren erforderlich.`
        : `Abhebenachweis erfüllt: das Eigengewicht (${haltD.toFixed(2)} kN/m²) hält den Windsog (${sogD.toFixed(2)} kN/m²) nieder. Sturmanker konstruktiv.`,
      source: 'derived',
    });
  }

  return {
    members: resultMembers,
    optimizedMembers,
    assumptions,
  };
}
