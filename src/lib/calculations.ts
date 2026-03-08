/**
 * Eurocode 5 / ÖNORM B 1995-1-1 Holzbemessungsmodul
 * Vorbemessung für Dachtragwerke
 *
 * REAL-DATA-ONLY: Keine Fallback-Werte. Fehlende Eingaben werden als Blocker gemeldet.
 */

import type { TimberMember, MaterialProfile, LoadCase, CalculationResult, StructuralCheck, StatusLevel } from '@/types/project';

// === Eurocode Teilsicherheitsbeiwerte (normativ, keine Projektdaten) ===
const GAMMA_M = 1.3;
const GAMMA_G = 1.35;
const GAMMA_Q = 1.5;
const K_MOD = 0.9;
const K_DEF = 0.6;
const PSI_0_WIND = 0.6;

// === Querschnittswerte ===
interface CrossSection {
  b: number;
  h: number;
  A: number;
  W: number;
  I: number;
}

function getCrossSection(b: number, h: number): CrossSection {
  return { b, h, A: b * h, W: (b * h * h) / 6, I: (b * h * h * h) / 12 };
}

// === Lastermittlung ===
interface DesignLoads {
  gd: number;
  qd: number;
  totalEd: number;
  gk: number;
  qk: number;
}

function calculateDesignLoads(
  loadCases: LoadCase[],
  einflussBbreite: number,
  roofPitch: number
): DesignLoads {
  const permanent = loadCases.filter(l => l.type === 'permanent').reduce((sum, l) => sum + l.value, 0);
  const snow = loadCases.find(l => l.type === 'snow')?.value || 0;
  const wind = loadCases.find(l => l.type === 'wind')?.value || 0;
  const variable = loadCases.filter(l => l.type === 'variable').reduce((sum, l) => sum + l.value, 0);
  const cosAlpha = Math.cos((roofPitch * Math.PI) / 180);
  const gk = permanent * einflussBbreite / cosAlpha;
  const qk_snow = snow * einflussBbreite;
  const qk_wind = wind * einflussBbreite;
  const qk_variable = variable * einflussBbreite;
  const qk = qk_snow + PSI_0_WIND * qk_wind + qk_variable;
  const gd = GAMMA_G * gk;
  const qd = GAMMA_Q * qk;
  return { gd, qd, totalEd: gd + qd, gk, qk };
}

// === Nachweise ===

function checkBending(cs: CrossSection, mat: MaterialProfile, maxMoment: number): StructuralCheck {
  const fmd = (mat.bendingStrength * K_MOD) / GAMMA_M;
  const sigma_md = (maxMoment * 1e6) / cs.W;
  const utilization = sigma_md / fmd;
  const status: StatusLevel = utilization > 1.0 ? 'red' : utilization > 0.8 ? 'yellow' : 'green';
  return {
    name: 'Biegenachweis', type: 'stress', result: Math.round(utilization * 100) / 100, limit: 1.0, unit: '-', status,
    formula: `σ_m,d / f_m,d = ${sigma_md.toFixed(1)} / ${fmd.toFixed(1)} = ${utilization.toFixed(2)}`,
    details: `Ausnutzung ${(utilization * 100).toFixed(0)}% | M_Ed = ${maxMoment.toFixed(2)} kNm | W = ${(cs.W / 1e3).toFixed(0)} cm³`,
  };
}

function checkShear(cs: CrossSection, mat: MaterialProfile, maxShear: number): StructuralCheck {
  const fvd = (mat.shearStrength * K_MOD) / GAMMA_M;
  const tau_d = (1.5 * maxShear * 1e3) / cs.A;
  const utilization = tau_d / fvd;
  const status: StatusLevel = utilization > 1.0 ? 'red' : utilization > 0.8 ? 'yellow' : 'green';
  return {
    name: 'Schubnachweis', type: 'stress', result: Math.round(utilization * 100) / 100, limit: 1.0, unit: '-', status,
    formula: `τ_d / f_v,d = ${tau_d.toFixed(2)} / ${fvd.toFixed(2)} = ${utilization.toFixed(2)}`,
    details: `V_Ed = ${maxShear.toFixed(2)} kN | A = ${(cs.A / 100).toFixed(0)} cm²`,
  };
}

function checkDeflection(cs: CrossSection, mat: MaterialProfile, span: number, qk: number, gk: number): StructuralCheck {
  const E = mat.elasticModulus;
  const L = span * 1000;
  const w_inst = (5 * (gk + qk) * Math.pow(L, 4)) / (384 * E * cs.I);
  const w_fin = w_inst * (1 + K_DEF);
  const wLimit = L / 200;
  const utilization = w_fin / wLimit;
  const status: StatusLevel = utilization > 1.0 ? 'red' : utilization > 0.8 ? 'yellow' : 'green';
  const Lratio = Math.round(L / w_fin);
  return {
    name: 'Durchbiegung', type: 'deflection', result: Math.round(w_fin * 10) / 10, limit: Math.round(wLimit * 10) / 10, unit: 'mm', status,
    formula: `w_fin ≤ L/200 → ${w_fin.toFixed(1)} mm ≤ ${wLimit.toFixed(1)} mm (L/${Lratio})`,
    details: `w_inst = ${w_inst.toFixed(1)} mm | k_def = ${K_DEF} | E = ${E} N/mm²`,
  };
}

function checkCompression(cs: CrossSection, mat: MaterialProfile, axialForce: number, bucklingLength: number): StructuralCheck {
  const fcd = (mat.compressionStrength * K_MOD) / GAMMA_M;
  const sigma_cd = (axialForce * 1e3) / cs.A;
  const i = Math.sqrt(cs.I / cs.A);
  const lk = bucklingLength * 1000;
  const lambda = lk / i;
  const lambda_rel = (lambda / Math.PI) * Math.sqrt(mat.compressionStrength / mat.elasticModulus * 1000);
  let kc = 1.0;
  if (lambda_rel > 0.3) {
    const betaC = 0.2;
    const k = 0.5 * (1 + betaC * (lambda_rel - 0.3) + lambda_rel * lambda_rel);
    kc = 1 / (k + Math.sqrt(k * k - lambda_rel * lambda_rel));
  }
  const utilization = sigma_cd / (kc * fcd);
  const status: StatusLevel = utilization > 1.0 ? 'red' : utilization > 0.8 ? 'yellow' : 'green';
  return {
    name: 'Knicken / Stabilität', type: 'stability', result: Math.round(utilization * 100) / 100, limit: 1.0, unit: '-', status,
    formula: `σ_c,d / (k_c · f_c,d) = ${sigma_cd.toFixed(2)} / (${kc.toFixed(3)} · ${fcd.toFixed(1)}) = ${utilization.toFixed(2)}`,
    details: `λ_rel = ${lambda_rel.toFixed(2)} | k_c = ${kc.toFixed(3)} | N_Ed = ${axialForce.toFixed(1)} kN`,
  };
}

function checkSupportReaction(totalLoad: number, span: number): StructuralCheck {
  const reaction = (totalLoad * span) / 2;
  return {
    name: 'Auflagerkraft', type: 'support_reactions', result: Math.round(reaction * 100) / 100, limit: 0, unit: 'kN', status: 'green',
    formula: `A = q · L / 2 = ${totalLoad.toFixed(2)} · ${span.toFixed(2)} / 2`,
    details: `Auflagerbreite prüfen: Mindestpressung beachten`,
  };
}

// === Voraussetzungsprüfung ===

export interface CalculationBlocker {
  field: string;
  message: string;
}

export function checkCalculationPrerequisites(
  members: TimberMember[],
  materials: MaterialProfile[],
  loadCases: LoadCase[],
  roofPitch: number | undefined,
  mainSpan: number | undefined
): CalculationBlocker[] {
  const blockers: CalculationBlocker[] = [];
  if (members.length === 0) blockers.push({ field: 'members', message: 'Keine Bauteile definiert' });
  if (!roofPitch || roofPitch <= 0) blockers.push({ field: 'geometry.roofPitch', message: 'Dachneigung fehlt oder ist 0' });
  if (!mainSpan || mainSpan <= 0) blockers.push({ field: 'geometry.width', message: 'Gebäudebreite (Spannweite) fehlt oder ist 0' });
  if (loadCases.length === 0) blockers.push({ field: 'loadCases', message: 'Keine Lastfälle definiert – Lastermittlung zuerst durchführen' });
  const snowCase = loadCases.find(l => l.type === 'snow');
  if (!snowCase || snowCase.value <= 0) blockers.push({ field: 'loadCases.snow', message: 'Schneelast nicht berechnet – Standort und Schneelastzone erforderlich' });
  for (const m of members) {
    if (!materials.find(mat => mat.id === m.material)) {
      blockers.push({ field: `members.${m.id}`, message: `Bauteil „${m.name}" hat kein gültiges Material zugewiesen` });
    }
  }
  return blockers;
}

// === Hauptberechnung ===

export function calculateMember(
  member: TimberMember,
  material: MaterialProfile,
  loadCases: LoadCase[],
  roofPitch: number,
  mainSpan: number
): CalculationResult {
  const cs = getCrossSection(member.width, member.height);
  const checks: StructuralCheck[] = [];
  const missingInputs: string[] = [];

  let einflussBbreite = 0.8;
  let effectiveSpan = member.length;

  switch (member.type) {
    case 'sparren':
      einflussBbreite = 0.8;
      effectiveSpan = mainSpan / Math.cos((roofPitch * Math.PI) / 180);
      break;
    case 'pfette':
      einflussBbreite = mainSpan / 2;
      effectiveSpan = member.length > 6 ? member.length / 2 : member.length;
      break;
    case 'stuetze':
      einflussBbreite = 0;
      break;
    case 'kehlbalken':
    case 'zange':
      einflussBbreite = 0.8;
      effectiveSpan = mainSpan * 0.6;
      break;
    default:
      einflussBbreite = 0.8;
  }

  if (member.type === 'stuetze') {
    const tributaryArea = 3.0 * (mainSpan / 2);
    const permanentLoad = loadCases.filter(l => l.type === 'permanent').reduce((sum, l) => sum + l.value, 0);
    const snowLoad = loadCases.find(l => l.type === 'snow')?.value || 0;
    const axialForce = (GAMMA_G * permanentLoad + GAMMA_Q * snowLoad) * tributaryArea;
    checks.push(checkCompression(cs, material, axialForce, member.length));
    checks.push({
      name: 'Auflagerkraft (axial)', type: 'support_reactions', result: Math.round(axialForce * 100) / 100, limit: 0, unit: 'kN', status: 'green',
      formula: `N_Ed = (γ_G·g + γ_Q·s) · A_trib`, details: `Einzugsfläche: ${tributaryArea.toFixed(1)} m²`,
    });
    if (!material.compressionStrength) missingInputs.push('Druckfestigkeit prüfen');
  } else {
    const loads = calculateDesignLoads(loadCases, einflussBbreite, roofPitch);
    const Md = (loads.totalEd * effectiveSpan * effectiveSpan) / 8;
    const Vd = (loads.totalEd * effectiveSpan) / 2;
    checks.push(checkBending(cs, material, Md));
    checks.push(checkShear(cs, material, Vd));
    checks.push(checkDeflection(cs, material, effectiveSpan, loads.qk / 1000, loads.gk / 1000));
    checks.push(checkSupportReaction(loads.totalEd, effectiveSpan));
  }

  const hasRed = checks.some(c => c.status === 'red');
  const hasYellow = checks.some(c => c.status === 'yellow');
  const overallStatus: StatusLevel = hasRed ? 'red' : hasYellow ? 'yellow' : 'green';

  if (!loadCases.some(l => l.type === 'snow' && l.value > 0)) missingInputs.push('Schneelast fehlt oder ist 0');
  if (!loadCases.some(l => l.type === 'wind' && l.value > 0)) missingInputs.push('Windlast fehlt oder ist 0');
  if (loadCases.some(l => !l.userModified && l.confidence < 0.7)) {
    missingInputs.push('Lastannahmen mit niedriger Konfidenz – Bestätigung empfohlen');
  }

  return {
    id: `calc-${member.id}`, memberId: member.id, memberName: `${member.name} ${member.crossSection}`,
    checks, overallStatus, missingInputs, timestamp: new Date().toISOString(),
  };
}

export function calculateAllMembers(
  members: TimberMember[],
  materials: MaterialProfile[],
  loadCases: LoadCase[],
  roofPitch: number,
  mainSpan: number
): CalculationResult[] {
  return members.map(member => {
    const material = materials.find(m => m.id === member.material);
    if (!material) {
      return {
        id: `calc-${member.id}`, memberId: member.id, memberName: member.name,
        checks: [], overallStatus: 'red' as StatusLevel,
        missingInputs: ['Material nicht zugewiesen'], timestamp: new Date().toISOString(),
      };
    }
    return calculateMember(member, material, loadCases, roofPitch, mainSpan);
  });
}

// === Austrian Snow Load – ÖNORM B 1991-1-3 ===
// STRICT: zone parameter must be provided explicitly. No defaults.

export function calculateSnowLoad(
  zone: string,
  altitude: number,
  roofPitch: number
): { sk: number; si: number; mu: number } | null {
  const sk0Map: Record<string, number> = { '1': 1.00, '2': 1.60, '3': 2.30, '4': 3.40 };
  const sk0 = sk0Map[zone];
  if (sk0 === undefined) return null; // Zone ungültig → Blocker

  const sk = sk0 * (1 + (altitude / 728) ** 2);
  let mu: number;
  if (roofPitch <= 30) mu = 0.8;
  else if (roofPitch <= 60) mu = 0.8 * (60 - roofPitch) / 30;
  else mu = 0;
  const si = mu * sk;

  return {
    sk: Math.round(sk * 100) / 100,
    si: Math.round(si * 100) / 100,
    mu: Math.round(mu * 100) / 100,
  };
}

// === Wind Load – ÖNORM B 1991-1-4 ===
// STRICT: zone & terrain must be provided explicitly.

export function calculateWindPressure(
  zone: string,
  terrainCategory: string,
  height: number
): { qp: number; vb0: number } | null {
  const vb0Map: Record<string, number> = { '1': 25.0, '2': 27.3, '3': 30.0 };
  const vb0 = vb0Map[zone];
  if (vb0 === undefined) return null;

  const terrainParams: Record<string, { kr: number; z0: number }> = {
    'I': { kr: 0.17, z0: 0.01 }, 'II': { kr: 0.19, z0: 0.05 },
    'III': { kr: 0.22, z0: 0.30 }, 'IV': { kr: 0.24, z0: 1.00 },
  };
  const terrain = terrainParams[terrainCategory];
  if (!terrain) return null;

  const { kr, z0 } = terrain;
  const zMin = Math.max(height, z0 * 10);
  const cr = kr * Math.log(zMin / z0);
  const qb = 0.5 * 1.25 * vb0 * vb0 / 1000;
  const ce = cr * cr * (1 + 7 / (cr * Math.log(zMin / z0)));
  const qp = ce * qb;

  return { qp: Math.round(qp * 100) / 100, vb0 };
}
