/**
 * Druckstab / Stütze mit Knicknachweis nach EC5 6.3.2.
 *
 * Stützen werden auf zentrischen Druck oder Druck+Biegung nachgewiesen.
 * Hauptkriterium: Knicken (Stabilität).
 *
 *   λ = l_ef / i           Schlankheit
 *   λ_rel = λ/π · √(f_c0k / E_005)
 *   k_y = 0.5·(1 + β_c·(λ_rel - 0.3) + λ_rel²)
 *   k_c = 1 / (k_y + √(k_y² - λ_rel²))         Knickbeiwert
 *   σ_c0d / (k_c · f_c0d) ≤ 1                  Nachweis
 *
 * β_c = 0.2 für Vollholz / 0.1 für BSH (Imperfektionsbeiwert).
 *
 * KLARTEXT FÜR LAIEN:
 *   Eine Stütze, die zu lang und zu dünn ist, kann unter Druck seitlich ausknicken
 *   (wie eine zerdrückte Cola-Dose). Je länger und dünner → desto schneller knickt sie.
 *   Wir prüfen, ob die Stütze die Last sicher tragen kann ohne wegzuknicken.
 */

import { rectangular } from '../sections/properties';
import { TIMBER_CLASSES, K_MOD, GAMMA_M, designStrength } from '../materials';
import type { LoadDuration } from '../materials';
import type { CheckResult } from './beam';

export interface ColumnInput {
  height: number;            // Stützenhöhe [m]
  b: number; h: number;      // Querschnitt [mm]
  timberClass: string;
  N_Ed: number;              // Bemessungs-Drucknormalkraft [kN] (POSITIV = Druck)
  M_Ed_y?: number;           // Biegung um y-Achse [kNm]
  M_Ed_z?: number;
  bucklingFactor: number;    // β = l_ef/l, default 1.0 (gelenkig-gelenkig), 0.7 (eingespannt-gelenkig), 2.0 (Kragstütze)
  duration: LoadDuration;
  serviceClass: '1' | '2' | '3';
}

export interface ColumnResult {
  input: ColumnInput;
  slenderness: { lambda_y: number; lambda_z: number; lambda_rel_y: number; lambda_rel_z: number };
  k_c: { y: number; z: number };
  checks: CheckResult[];
  maxUtilization: number;
  overallStatus: 'green' | 'yellow' | 'red';
  summary: string;
}

export function calculateColumn(input: ColumnInput): ColumnResult {
  const mat = TIMBER_CLASSES[input.timberClass];
  const sec = rectangular(input.b, input.h);
  const gammaM = GAMMA_M[mat.category];
  const kmod = K_MOD[input.serviceClass][input.duration];
  const beta_c = mat.category === 'glulam' ? 0.1 : 0.2;

  const lef = input.bucklingFactor * input.height * 1000;
  const lambda_y = lef / sec.iy;
  const lambda_z = lef / sec.iz;
  const lambda_rel_y = (lambda_y / Math.PI) * Math.sqrt(mat.fc0k / mat.E005);
  const lambda_rel_z = (lambda_z / Math.PI) * Math.sqrt(mat.fc0k / mat.E005);

  const calcKc = (lambda_rel: number): number => {
    if (lambda_rel <= 0.3) return 1.0;
    const ky = 0.5 * (1 + beta_c * (lambda_rel - 0.3) + lambda_rel * lambda_rel);
    return 1 / (ky + Math.sqrt(ky * ky - lambda_rel * lambda_rel));
  };
  const k_c_y = calcKc(lambda_rel_y);
  const k_c_z = calcKc(lambda_rel_z);

  const f_c0d = designStrength(mat.fc0k, kmod, gammaM);
  const f_md = designStrength(mat.fmk, kmod, gammaM);

  const sigma_c0 = (input.N_Ed * 1000) / sec.A;
  const sigma_m_y = input.M_Ed_y ? (input.M_Ed_y * 1e6) / sec.Wy : 0;
  const sigma_m_z = input.M_Ed_z ? (input.M_Ed_z * 1e6) / sec.Wz : 0;

  const km = 0.7;  // Beiwert kombinierte Biegung Rechteckquerschnitt

  // Reine Knickung
  const eta_buck_y = sigma_c0 / (k_c_y * f_c0d);
  const eta_buck_z = sigma_c0 / (k_c_z * f_c0d);

  // Druck + Biegung (EC5 6.3.2)
  const eta_comb_y = sigma_c0 / (k_c_y * f_c0d) + sigma_m_y / f_md + km * (sigma_m_z / f_md);
  const eta_comb_z = sigma_c0 / (k_c_z * f_c0d) + km * (sigma_m_y / f_md) + sigma_m_z / f_md;

  const statusOf = (eta: number): CheckResult['status'] => eta > 1 ? 'red' : eta > 0.85 ? 'yellow' : 'green';

  const checks: CheckResult[] = [
    {
      name: 'Knicken um y-Achse', description: 'Stabilität in starker Richtung',
      formula: 'σ_c0 / (k_c,y · f_c0,d) ≤ 1',
      value: sigma_c0, limit: k_c_y * f_c0d, utilization: eta_buck_y, status: statusOf(eta_buck_y),
      explanation: `Schlankheit λ_y = ${lambda_y.toFixed(0)}. ${lambda_rel_y > 0.3 ? `Knickbeiwert k_c,y = ${k_c_y.toFixed(2)} reduziert zulässige Druckfestigkeit (je länger/dünner → kleiner k_c).` : 'Stütze ist gedrungen → kein Knicken kritisch.'}`,
      values: { 'λ_y': lambda_y.toFixed(0), 'λ_rel,y': lambda_rel_y.toFixed(2), 'k_c,y': k_c_y.toFixed(3), 'σ_c [N/mm²]': sigma_c0.toFixed(2) },
    },
    {
      name: 'Knicken um z-Achse', description: 'Stabilität in schwacher Richtung',
      formula: 'σ_c0 / (k_c,z · f_c0,d) ≤ 1',
      value: sigma_c0, limit: k_c_z * f_c0d, utilization: eta_buck_z, status: statusOf(eta_buck_z),
      explanation: `Schlankheit λ_z = ${lambda_z.toFixed(0)} um schwache Achse. ${eta_buck_z > eta_buck_y ? 'MAßGEBEND - Stütze knickt zuerst seitlich (in Richtung der kleineren Querschnittsdimension).' : 'unkritisch.'}`,
      values: { 'λ_z': lambda_z.toFixed(0), 'λ_rel,z': lambda_rel_z.toFixed(2), 'k_c,z': k_c_z.toFixed(3) },
    },
  ];

  if (input.M_Ed_y || input.M_Ed_z) {
    checks.push({
      name: 'Druck + Biegung (y)', description: 'Interaktion Druck + Biegung',
      formula: 'σ_c/(k_c,y·f_c0,d) + σ_m,y/f_m,d + 0.7·σ_m,z/f_m,d ≤ 1',
      value: eta_comb_y, limit: 1, utilization: eta_comb_y, status: statusOf(eta_comb_y),
      explanation: `Stütze trägt Druck UND Biegung gleichzeitig (z.B. exzentrische Last, Windkraft seitlich). Beide Anteile zusammen müssen unter 1 bleiben.`,
      values: { 'σ_c': sigma_c0.toFixed(2), 'σ_m,y': sigma_m_y.toFixed(2), 'σ_m,z': sigma_m_z.toFixed(2) },
    });
  }

  const maxEta = Math.max(...checks.map(c => c.utilization));
  const overallStatus: CheckResult['status'] = maxEta > 1 ? 'red' : maxEta > 0.85 ? 'yellow' : 'green';

  return {
    input,
    slenderness: { lambda_y, lambda_z, lambda_rel_y, lambda_rel_z },
    k_c: { y: k_c_y, z: k_c_z },
    checks, maxUtilization: maxEta, overallStatus,
    summary: `Stütze ${input.b}/${input.h} mm, ${input.height} m hoch, ${mat.name}. Schlankheit λ_max = ${Math.max(lambda_y, lambda_z).toFixed(0)}. Ausnutzung η = ${maxEta.toFixed(2)}.`,
  };
}
