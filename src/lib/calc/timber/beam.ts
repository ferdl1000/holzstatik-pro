/**
 * Bemessung eines Biegeträgers nach EC5 / ÖNORM B 1995-1-1.
 *
 * Anwendbar auf: Sparren, Pfetten, Kehlbalken, Leimbinder (gerade).
 *
 * Nachweise:
 *  1. Biegespannung:        σ_md ≤ f_md           (η_m = σ/f ≤ 1)
 *  2. Schubspannung:        τ_d  ≤ f_vd           (η_v ≤ 1)
 *  3. Auflagerpressung:     σ_c90d ≤ f_c90d · k_c90 (Querdruck am Auflager)
 *  4. Durchbiegung w_inst:  ≤ l/300 (typisch)
 *  5. Durchbiegung w_fin:   ≤ l/200 (mit Kriechen)
 *  6. Kippstabilität (k_crit) bei schmalen hohen Querschnitten
 *
 * Annahme: Einfeldträger, gleichmäßig verteilte Last q [kN/m].
 *
 *   M_max = q·l²/8        Biegemoment in Mitte [kNm]
 *   V_max = q·l/2         Querkraft am Auflager [kN]
 *   σ_m   = M / W         Biegespannung [N/mm²]
 *   τ     = 1.5·V/(b·h)   max. Schubspannung Rechteck (Faktor 1.5)
 *   w_inst = 5·q·l⁴/(384·E·I)   Durchbiegung Einfeldträger Gleichlast
 */

import { rectangular } from '../sections/properties';
import { TIMBER_CLASSES, K_MOD, GAMMA_M, designStrength } from '../materials';
import type { LoadDuration } from '../materials';
import type { SectionProperties } from '../sections/properties';

export interface BeamInput {
  type: 'sparren' | 'pfette' | 'kehlbalken' | 'leimbinder' | 'nebentraeger';
  span: number;              // Stützweite [m]
  b: number;                 // Breite [mm]
  h: number;                 // Höhe [mm]
  timberClass: string;       // z.B. 'C24', 'GL28h'
  qPermanent: number;        // ständige Last [kN/m] (Eigengewicht + Dachaufbau)
  qVariable: number;         // veränderliche Hauptlast [kN/m] (i.d.R. Schnee)
  variableDuration: LoadDuration;   // Lastdauer der Hauptlast
  serviceClass: '1' | '2' | '3';
  supportWidth?: number;     // Auflagerbreite [mm] für Querdruck-Nachweis (default 100)
  deflectionLimitInst?: number;   // Default l/300
  deflectionLimitFin?: number;    // Default l/200
  inclination?: number;      // Dachneigung [°] (für Sparren mit Schrägstellung)
}

export interface CheckResult {
  name: string;
  description: string;
  formula: string;
  value: number;
  limit: number;
  utilization: number;
  status: 'green' | 'yellow' | 'red';
  explanation: string;
  values: Record<string, number | string>;
}

export interface BeamResult {
  input: BeamInput;
  section: SectionProperties;
  material: typeof TIMBER_CLASSES[string];
  internalForces: { M_Ed: number; V_Ed: number; M_char: number; w_inst: number; w_fin: number };
  checks: CheckResult[];
  overallStatus: 'green' | 'yellow' | 'red';
  maxUtilization: number;
  summary: string;
}

export function calculateBeam(input: BeamInput): BeamResult {
  const mat = TIMBER_CLASSES[input.timberClass];
  if (!mat) throw new Error(`Unbekannte Festigkeitsklasse: ${input.timberClass}`);

  const sec = rectangular(input.b, input.h);
  const gammaM = GAMMA_M[mat.category];

  // Bemessungslasten ULS
  const q_d = 1.35 * input.qPermanent + 1.50 * input.qVariable;       // kN/m
  const q_char = input.qPermanent + input.qVariable;                  // SLS
  const L = input.span;                                                // m
  const L_mm = L * 1000;

  const M_Ed = q_d * L * L / 8;                  // kNm
  const V_Ed = q_d * L / 2;                      // kN
  const M_char = q_char * L * L / 8;

  // k_mod für ungünstigste Last
  const kmod = K_MOD[input.serviceClass][input.variableDuration];

  // --- 1. Biegespannung ---
  // k_h = Höhenbeiwert für Vollholz: bei h < 150mm → leichte Steigerung. Für BSH ähnlich.
  const k_h_solid = mat.category === 'solid' && input.h < 150 ? Math.min(1.3, Math.pow(150 / input.h, 0.2)) : 1.0;
  const k_h_glulam = mat.category === 'glulam' && input.h < 600 ? Math.min(1.1, Math.pow(600 / input.h, 0.1)) : 1.0;
  const k_h = mat.category === 'solid' ? k_h_solid : k_h_glulam;

  const f_md = designStrength(mat.fmk, kmod, gammaM) * k_h;
  const sigma_m = (M_Ed * 1e6) / sec.Wy;                              // N/mm²
  const eta_m = sigma_m / f_md;

  // --- 2. Schub ---
  const k_cr = 0.67;  // Rissfaktor für effektive Breite EC5 6.1.7
  const f_vd = designStrength(mat.fvk, kmod, gammaM);
  const tau = (1.5 * V_Ed * 1000) / (k_cr * sec.b * sec.h);            // N/mm²
  const eta_v = tau / f_vd;

  // --- 3. Auflagerpressung (Querdruck) ---
  const b_support = input.supportWidth || 100;
  const k_c90 = 1.5;  // für seitliche Auflager nach EC5 6.1.5
  const f_c90d = designStrength(mat.fc90k, kmod, gammaM);
  const F_support = V_Ed;
  const sigma_c90 = (F_support * 1000) / (input.b * b_support);        // N/mm²
  const eta_c90 = sigma_c90 / (f_c90d * k_c90);

  // --- 4./5. Durchbiegung ---
  // w_inst = 5·q·l⁴ / (384·E·I)
  // mit q in N/mm, l in mm, E in N/mm², I in mm⁴ → w in mm
  const q_inst_Nmm = q_char;  // kN/m = N/mm
  const w_inst = (5 * q_inst_Nmm * Math.pow(L_mm, 4)) / (384 * mat.E0mean * sec.Iy);

  // Kriechen: w_fin = w_inst · (1 + k_def)
  // k_def für Nutzungsklasse 1 + Vollholz = 0.6, BSH = 0.6
  const k_def = input.serviceClass === '1' ? 0.6 : input.serviceClass === '2' ? 0.8 : 2.0;
  // Anteil ständig vs variabel mit ψ_2
  const psi2 = input.variableDuration === 'shortTerm' ? 0.0 : 0.2;
  const w_perm = (5 * input.qPermanent * Math.pow(L_mm, 4)) / (384 * mat.E0mean * sec.Iy);
  const w_var  = (5 * input.qVariable * Math.pow(L_mm, 4)) / (384 * mat.E0mean * sec.Iy);
  const w_fin = w_perm * (1 + k_def) + w_var * (1 + psi2 * k_def);

  const limInst = L_mm / (input.deflectionLimitInst || 300);
  const limFin = L_mm / (input.deflectionLimitFin || 200);
  const eta_def_inst = w_inst / limInst;
  const eta_def_fin = w_fin / limFin;

  // --- 6. Kippstabilität (vereinfacht) ---
  // l_ef ≈ 0.9 · l für Einfeldträger mit Belastung am Obergurt
  const lef = 0.9 * L_mm;
  const sigma_m_crit = (0.78 * sec.b * sec.b * mat.E005) / (input.h * lef);
  const lambda_rel_m = Math.sqrt(mat.fmk / sigma_m_crit);
  let k_crit = 1.0;
  if (lambda_rel_m > 0.75 && lambda_rel_m <= 1.4) k_crit = 1.56 - 0.75 * lambda_rel_m;
  else if (lambda_rel_m > 1.4) k_crit = 1 / (lambda_rel_m * lambda_rel_m);
  const eta_kipp = sigma_m / (k_crit * f_md);

  const statusOf = (eta: number): CheckResult['status'] => eta > 1 ? 'red' : eta > 0.85 ? 'yellow' : 'green';

  const checks: CheckResult[] = [
    {
      name: 'Biegung', description: 'Spannung in Trägermitte ≤ Bemessungsfestigkeit',
      formula: 'σ_m,d = M_Ed / W_y ≤ f_m,d',
      value: sigma_m, limit: f_md, utilization: eta_m, status: statusOf(eta_m),
      explanation: `Das Bauteil wird auf Biegung beansprucht. In der Mitte entsteht die größte Spannung. Wir vergleichen mit der zulässigen Biegefestigkeit. M_Ed = ${M_Ed.toFixed(2)} kNm, W_y = ${(sec.Wy / 1000).toFixed(0)} cm³ → σ = ${sigma_m.toFixed(2)} N/mm² (zulässig ${f_md.toFixed(2)} N/mm²).`,
      values: { 'M_Ed [kNm]': M_Ed.toFixed(2), 'W_y [cm³]': (sec.Wy / 1000).toFixed(0), 'σ_m [N/mm²]': sigma_m.toFixed(2), 'f_m,d [N/mm²]': f_md.toFixed(2), 'k_h': k_h.toFixed(3), 'k_mod': kmod },
    },
    {
      name: 'Schub', description: 'Schubspannung am Auflager ≤ zulässig',
      formula: 'τ_d = 1.5·V_Ed / (k_cr·b·h) ≤ f_v,d',
      value: tau, limit: f_vd, utilization: eta_v, status: statusOf(eta_v),
      explanation: `Am Auflager wird der Träger auf Schub beansprucht (vertikales Abreißen der Holzfasern). Der Faktor 1,5 berücksichtigt den parabolischen Spannungsverlauf. V_Ed = ${V_Ed.toFixed(2)} kN → τ = ${tau.toFixed(2)} N/mm².`,
      values: { 'V_Ed [kN]': V_Ed.toFixed(2), 'τ [N/mm²]': tau.toFixed(2), 'f_v,d [N/mm²]': f_vd.toFixed(2), 'k_cr': k_cr },
    },
    {
      name: 'Auflagerpressung', description: 'Querdruck am Auflager',
      formula: 'σ_c90 = F / (b · l_A) ≤ k_c90 · f_c90,d',
      value: sigma_c90, limit: k_c90 * f_c90d, utilization: eta_c90, status: statusOf(eta_c90),
      explanation: `Wo der Träger aufliegt, drückt er senkrecht zur Holzfaser ins Auflager. Holz ist quer zur Faser viel weicher als längs! Bei ${b_support} mm Auflagerlänge: σ = ${sigma_c90.toFixed(2)} N/mm². Falls zu hoch → Auflager verbreitern oder Stahlplatte unterlegen.`,
      values: { 'F [kN]': F_support.toFixed(2), 'b [mm]': input.b, 'l_A [mm]': b_support, 'σ_c90 [N/mm²]': sigma_c90.toFixed(2), 'f_c90,d [N/mm²]': f_c90d.toFixed(2) },
    },
    {
      name: 'Durchbiegung sofort', description: 'Elastische Durchbiegung w_inst ≤ l/300',
      formula: 'w_inst = 5·q·l⁴ / (384·E·I_y) ≤ l/300',
      value: w_inst, limit: limInst, utilization: eta_def_inst, status: statusOf(eta_def_inst),
      explanation: `So weit biegt sich der Träger SOFORT durch, wenn die volle Last draufkommt (z.B. erster Schneefall). Grenze l/300 = ${limInst.toFixed(0)} mm. Bei ${L} m Stützweite spürt man Durchbiegungen >${(L * 1000 / 300).toFixed(0)} mm.`,
      values: { 'w_inst [mm]': w_inst.toFixed(1), 'Grenze [mm]': limInst.toFixed(1), 'L/w': (L_mm / w_inst).toFixed(0) },
    },
    {
      name: 'Durchbiegung Endzustand', description: 'Mit Kriechen w_fin ≤ l/200',
      formula: 'w_fin = w_inst·(1 + k_def)  (Kriechen)',
      value: w_fin, limit: limFin, utilization: eta_def_fin, status: statusOf(eta_def_fin),
      explanation: `Über Jahre "kriecht" Holz unter Dauerlast (Eigengewicht) weiter durch. k_def = ${k_def} berücksichtigt das. Wichtig damit Decken/Dächer langfristig nicht durchhängen.`,
      values: { 'w_fin [mm]': w_fin.toFixed(1), 'Grenze [mm]': limFin.toFixed(1), 'k_def': k_def },
    },
    {
      name: 'Kippsicherheit', description: 'Stabilität gegen seitliches Ausweichen',
      formula: 'σ_m ≤ k_crit · f_m,d',
      value: sigma_m, limit: k_crit * f_md, utilization: eta_kipp, status: statusOf(eta_kipp),
      explanation: `Schmale hohe Träger können seitlich wegkippen (Kippen). k_crit = ${k_crit.toFixed(2)} reduziert die zulässige Spannung wenn Gefahr besteht. Bei h/b = ${(input.h / input.b).toFixed(1)} ${(input.h / input.b) > 4 ? 'AUFPASSEN - schlanker Träger!' : 'unkritisch'}.`,
      values: { 'λ_rel,m': lambda_rel_m.toFixed(2), 'k_crit': k_crit.toFixed(2), 'h/b': (input.h / input.b).toFixed(2) },
    },
  ];

  const maxEta = Math.max(...checks.map(c => c.utilization));
  const overallStatus: CheckResult['status'] = maxEta > 1 ? 'red' : maxEta > 0.85 ? 'yellow' : 'green';

  const summary = `Bauteil ${input.type} aus ${mat.name}, Querschnitt ${input.b}/${input.h} mm, Stützweite ${L} m. ` +
    `Maßgebende Ausnutzung η = ${maxEta.toFixed(2)} (${(maxEta * 100).toFixed(0)} %) ` +
    `aus Nachweis "${checks.find(c => c.utilization === maxEta)?.name}". ` +
    `Status: ${overallStatus === 'green' ? 'OK' : overallStatus === 'yellow' ? 'knapp, prüfen' : 'NICHT AUSREICHEND - Querschnitt vergrößern'}.`;

  return {
    input, section: sec, material: mat,
    internalForces: { M_Ed, V_Ed, M_char, w_inst, w_fin },
    checks, overallStatus, maxUtilization: maxEta, summary,
  };
}
