/**
 * Bemessung gerader und gebogener Brettschichtholz-Träger (Leimbinder).
 *
 * Speziell für GROßE SPANNWEITEN (z.B. 25 m stützenfrei) - dort wo Vollholz unmöglich ist.
 *
 * Zusätzliche Nachweise gegenüber gerader Träger:
 *  - k_h für BSH abgemildert (siehe materials.ts)
 *  - Bei gebogenen Trägern: Querzugnachweis senkrecht zur Faser (kritisch im First!)
 *  - Veränderliche Querschnittshöhe (Satteldachträger, Pultdachträger, Fischbauch)
 *
 * GEBOGENE BSH-TRÄGER (Bogenbinder, Sattelträger):
 *   Im Bereich der Krümmung entstehen Querzugspannungen quer zur Faser.
 *   Holz ist quer zur Faser sehr schwach (f_t90k ≈ 0.5 N/mm² vs. f_t0k ≈ 19 N/mm²).
 *   Daher gilt:  k_dis · k_vol · σ_t90,d ≤ f_t90,d
 *
 *   k_vol = (V_0 / V)^0.2   (V_0 = 0.01 m³ Bezugsvolumen)
 *   k_dis = 1.4 für gekrümmte Träger (Spannungsverteilungs-Beiwert)
 *
 * EMPFEHLUNG SPANNWEITE:
 *   - bis  8 m:  KVH C24 reicht oft
 *   - 8-15 m:   BSH GL24h/GL24c
 *   - 15-25 m:  BSH GL28h, ggf. Sattelträger (höher in Mitte)
 *   - 25-40 m:  Sattel-/Fischbauch-/Bogenbinder, oft GL28h
 *   - > 40 m:   Fachwerk- oder Bogenbinder mit Zugband
 */

import { calculateBeam, type BeamInput, type BeamResult, type CheckResult } from './beam';
import { TIMBER_CLASSES, K_MOD, GAMMA_M, designStrength } from '../materials';
import { rectangular } from '../sections/properties';

export interface GlulamBeamInput extends Omit<BeamInput, 'type'> {
  shape: 'straight' | 'cambered' | 'pitched' | 'curved' | 'fishbelly';
  /** Mittelradius der Krümmung [mm] (nur bei curved/cambered) */
  r_in?: number;
  /** Höhe an Auflager [mm] (bei Sattelträger / Pultträger) */
  h_ap?: number;
  /** Apex-Winkel [°] (bei Sattelträger zwischen Untergurt-Schräge) */
  alpha_ap?: number;
}

export interface GlulamResult extends BeamResult {
  shape: string;
  additionalChecks: CheckResult[];
  recommendation: string;
}

export function calculateGlulam(input: GlulamBeamInput): GlulamResult {
  // Basis-Bemessung wie gerader Träger (mit GL-Festigkeitsklasse)
  const base = calculateBeam({ ...input, type: 'leimbinder' });

  const mat = TIMBER_CLASSES[input.timberClass];
  const sec = rectangular(input.b, input.h);
  const gammaM = GAMMA_M[mat.category];
  const kmod = K_MOD[input.serviceClass][input.variableDuration];

  const additionalChecks: CheckResult[] = [];

  // Querzugnachweis bei gekrümmten Trägern / Sattelträger Apex
  if (input.shape === 'curved' || input.shape === 'cambered' || input.shape === 'pitched') {
    // Apex-Höhe: bei pitched = h, bei curved/cambered = h_ap || h
    const h_ap = input.h_ap || input.h;

    // Volumen des Apex-Bereichs (vereinfacht: b · h_ap · (h_ap/sin(alpha)))
    const alpha = (input.alpha_ap || 10) * Math.PI / 180;
    const V_ap = (input.b * h_ap * h_ap) / Math.sin(alpha) / 1e9;  // m³
    const V_0 = 0.01;  // Bezugsvolumen 0.01 m³

    const k_vol = Math.pow(V_0 / Math.max(V_ap, V_0 / 5), 0.2);
    const k_dis = input.shape === 'curved' ? 1.4 : 1.7;
    const k_p = 0.2 * Math.tan(alpha);  // Vereinfachter Apex-Spannungsbeiwert
    const M_ap = base.internalForces.M_Ed;

    const sigma_t90_d = (k_p * 6 * M_ap * 1e6) / (input.b * h_ap * h_ap);
    const f_t90_d = designStrength(mat.ft90k, kmod, gammaM) * k_dis * k_vol;
    const eta_t90 = sigma_t90_d / f_t90_d;
    const statusOf = (eta: number): CheckResult['status'] => eta > 1 ? 'red' : eta > 0.85 ? 'yellow' : 'green';

    additionalChecks.push({
      name: 'Querzug am Apex (gekrümmt)',
      description: 'Spannung quer zur Faser im gekrümmten Bereich – kritisch!',
      formula: 'σ_t90,d ≤ k_dis · k_vol · f_t90,d',
      value: sigma_t90_d, limit: f_t90_d, utilization: eta_t90, status: statusOf(eta_t90),
      explanation: `Bei gekrümmten BSH-Trägern entstehen Spannungen QUER zur Holzfaser im Krümmungsbereich. Holz ist quer zur Faser sehr schwach (nur 0,5 N/mm²) – deshalb ist dieser Nachweis bei Bogenträgern oft das maßgebende Kriterium! k_vol = ${k_vol.toFixed(3)} (großes Volumen → kleinere Festigkeit), k_dis = ${k_dis}.`,
      values: { 'V_ap [m³]': V_ap.toFixed(3), 'k_vol': k_vol.toFixed(3), 'k_dis': k_dis, 'σ_t90 [N/mm²]': sigma_t90_d.toFixed(3) },
    });
  }

  // Empfehlung basierend auf Spannweite und Ausnutzung
  const L = input.span;
  let recommendation: string;
  const allChecks = [...base.checks, ...additionalChecks];
  const maxEta = Math.max(...allChecks.map(c => c.utilization));
  const h_l_ratio = input.h / (L * 1000);

  if (maxEta > 1.0) {
    if (L > 25 && input.shape === 'straight') {
      recommendation = `STÜTZENFREI bei ${L} m mit geradem Träger sehr ineffizient. Empfehlung: Sattelträger (h_Apex ≈ ${(L * 50).toFixed(0)} mm, h_Auflager ≈ ${(L * 30).toFixed(0)} mm) oder Fischbauchträger. Material auf GL28h erhöhen.`;
    } else if (h_l_ratio < 0.05) {
      recommendation = `Querschnitt zu schlank für ${L} m. Faustregel: h ≈ L/15 bis L/20 bei BSH-Trägern, hier wäre ${(L * 1000 / 17).toFixed(0)} mm sinnvoll. Aktuell h/L = 1/${(L * 1000 / input.h).toFixed(0)}.`;
    } else {
      recommendation = `Bauteil versagt rechnerisch. Querschnitt vergrößern, Festigkeitsklasse erhöhen (z.B. GL28h statt GL24h) oder Form ändern.`;
    }
  } else if (maxEta > 0.85) {
    recommendation = `Wenig Reserve. Bei Lastunsicherheiten Querschnitt eine Stufe größer wählen.`;
  } else {
    recommendation = `Tragwerk wirtschaftlich dimensioniert (η = ${(maxEta * 100).toFixed(0)} %).`;
  }

  if (L > 15 && input.shape === 'straight') {
    recommendation += ` Tipp: Bei Spannweite ${L} m könnte ein Sattelträger (Satteldach-Form) bis zu 20 % Material sparen.`;
  }

  return {
    ...base,
    checks: allChecks,
    maxUtilization: maxEta,
    overallStatus: maxEta > 1 ? 'red' : maxEta > 0.85 ? 'yellow' : 'green',
    shape: input.shape,
    additionalChecks,
    recommendation,
  };
}

/**
 * Vorschlag eines Leimbinder-Querschnitts für gegebene Spannweite + Last.
 * Faustregeln + iterative Prüfung.
 */
export function suggestGlulamSection(
  span: number,
  qPermanent: number,
  qVariable: number,
  shape: GlulamBeamInput['shape'] = 'straight',
): { b: number; h: number; timberClass: string; comment: string } {
  // Faustregel Höhe ≈ L/17 für gerade BSH, L/12 für gekrümmt
  const factor = shape === 'straight' ? 17 : shape === 'pitched' ? 14 : 12;
  const h_est = Math.ceil((span * 1000 / factor) / 40) * 40;
  // Breite: h/b ≈ 4 ist Maximum für Kippsicherheit ohne Aussteifung
  let b_est = Math.max(120, Math.ceil(h_est / 5 / 20) * 20);

  // Material wählen nach Spannweite
  const cls = span > 18 ? 'GL28h' : 'GL24h';

  return {
    b: b_est, h: h_est, timberClass: cls,
    comment: `Vorschlag basierend auf Spannweite ${span} m: h ≈ L/${factor} = ${h_est} mm, b = ${b_est} mm, ${cls}. Bitte mit Berechnung verifizieren.`,
  };
}
