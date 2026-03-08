/**
 * Eurocode 5 / ÖNORM B 1995-1-1 Holzbemessungsmodul
 * Vorbemessung für Dachtragwerke
 */

import type { TimberMember, MaterialProfile, LoadCase, CalculationResult, StructuralCheck, StatusLevel } from '@/types/project';

// === Eurocode Teilsicherheitsbeiwerte ===
const GAMMA_M = 1.3; // Materialbeiwert Holz (EC5)
const GAMMA_G = 1.35; // ständige Einwirkungen
const GAMMA_Q = 1.5; // veränderliche Einwirkungen
const K_MOD = 0.9; // Modifikationsbeiwert (KLED mittel, NKL 1)
const K_DEF = 0.6; // Verformungsbeiwert (NKL 1, Vollholz)
const PSI_0_SNOW = 0.5; // Kombinationsbeiwert Schnee Österreich
const PSI_0_WIND = 0.6; // Kombinationsbeiwert Wind
const PSI_2_SNOW = 0.0; // quasi-ständiger Beiwert Schnee

// === Querschnittswerte ===
interface CrossSection {
  b: number; // Breite mm
  h: number; // Höhe mm
  A: number; // Fläche mm²
  W: number; // Widerstandsmoment mm³
  I: number; // Trägheitsmoment mm⁴
}

function getCrossSection(b: number, h: number): CrossSection {
  return {
    b,
    h,
    A: b * h,
    W: (b * h * h) / 6,
    I: (b * h * h * h) / 12,
  };
}

// === Lastermittlung ===
interface DesignLoads {
  gd: number; // Bemessungslast ständig kN/m
  qd: number; // Bemessungslast veränderlich kN/m
  totalEd: number; // Gesamte Bemessungslast kN/m
  gk: number; // char. ständig
  qk: number; // char. veränderlich
}

function calculateDesignLoads(
  loadCases: LoadCase[],
  einflussBbreite: number, // m
  roofPitch: number // °
): DesignLoads {
  const permanent = loadCases
    .filter(l => l.type === 'permanent')
    .reduce((sum, l) => sum + l.value, 0);

  const snow = loadCases.find(l => l.type === 'snow')?.value || 0;
  const wind = loadCases.find(l => l.type === 'wind')?.value || 0;
  const variable = loadCases
    .filter(l => l.type === 'variable')
    .reduce((sum, l) => sum + l.value, 0);

  // Projektion auf Sparrenrichtung (cos α für Horizontalprojektion)
  const cosAlpha = Math.cos((roofPitch * Math.PI) / 180);

  // Charakteristische Lasten auf den Sparren (kN/m)
  const gk = permanent * einflussBbreite / cosAlpha;
  const qk_snow = snow * einflussBbreite; // Schnee auf Grundfläche projiziert
  const qk_wind = wind * einflussBbreite;
  const qk_variable = variable * einflussBbreite;

  // Maßgebende veränderliche Last (Schnee als Leiteinwirkung)
  const qk = qk_snow + PSI_0_WIND * qk_wind + qk_variable;

  // Bemessungslasten (GZT)
  const gd = GAMMA_G * gk;
  const qd = GAMMA_Q * qk;
  const totalEd = gd + qd;

  return { gd, qd, totalEd, gk, qk };
}

// === Nachweise ===

function checkBending(
  cs: CrossSection,
  mat: MaterialProfile,
  maxMoment: number // kNm
): StructuralCheck {
  const fmd = (mat.bendingStrength * K_MOD) / GAMMA_M; // N/mm²
  const sigma_md = (maxMoment * 1e6) / cs.W; // N/mm²
  const utilization = sigma_md / fmd;
  const status: StatusLevel = utilization > 1.0 ? 'red' : utilization > 0.8 ? 'yellow' : 'green';

  return {
    name: 'Biegenachweis',
    type: 'stress',
    result: Math.round(utilization * 100) / 100,
    limit: 1.0,
    unit: '-',
    status,
    formula: `σ_m,d / f_m,d = ${sigma_md.toFixed(1)} / ${fmd.toFixed(1)} = ${utilization.toFixed(2)}`,
    details: `Ausnutzung ${(utilization * 100).toFixed(0)}% | M_Ed = ${maxMoment.toFixed(2)} kNm | W = ${(cs.W / 1e3).toFixed(0)} cm³`,
  };
}

function checkShear(
  cs: CrossSection,
  mat: MaterialProfile,
  maxShear: number // kN
): StructuralCheck {
  const fvd = (mat.shearStrength * K_MOD) / GAMMA_M;
  const tau_d = (1.5 * maxShear * 1e3) / cs.A; // N/mm² (Rechteckquerschnitt)
  const utilization = tau_d / fvd;
  const status: StatusLevel = utilization > 1.0 ? 'red' : utilization > 0.8 ? 'yellow' : 'green';

  return {
    name: 'Schubnachweis',
    type: 'stress',
    result: Math.round(utilization * 100) / 100,
    limit: 1.0,
    unit: '-',
    status,
    formula: `τ_d / f_v,d = ${tau_d.toFixed(2)} / ${fvd.toFixed(2)} = ${utilization.toFixed(2)}`,
    details: `V_Ed = ${maxShear.toFixed(2)} kN | A = ${(cs.A / 100).toFixed(0)} cm²`,
  };
}

function checkDeflection(
  cs: CrossSection,
  mat: MaterialProfile,
  span: number, // m
  qk: number, // kN/m (char. Gesamtlast)
  gk: number // kN/m (char. ständige Last)
): StructuralCheck {
  const E = mat.elasticModulus; // N/mm²
  const L = span * 1000; // mm

  // Sofortige Durchbiegung unter char. Kombination
  const w_inst = (5 * (gk + qk) * Math.pow(L, 4)) / (384 * E * cs.I); // mm
  // Endgültige Durchbiegung mit Kriechen
  const w_fin = w_inst * (1 + K_DEF); // vereinfacht

  const wLimit = L / 200; // Grenzwert L/200
  const utilization = w_fin / wLimit;
  const status: StatusLevel = utilization > 1.0 ? 'red' : utilization > 0.8 ? 'yellow' : 'green';

  const Lratio = Math.round(L / w_fin);

  return {
    name: 'Durchbiegung',
    type: 'deflection',
    result: Math.round(w_fin * 10) / 10,
    limit: Math.round(wLimit * 10) / 10,
    unit: 'mm',
    status,
    formula: `w_fin ≤ L/200 → ${w_fin.toFixed(1)} mm ≤ ${wLimit.toFixed(1)} mm (L/${Lratio})`,
    details: `w_inst = ${w_inst.toFixed(1)} mm | k_def = ${K_DEF} | E = ${E} N/mm²`,
  };
}

function checkCompression(
  cs: CrossSection,
  mat: MaterialProfile,
  axialForce: number, // kN
  bucklingLength: number // m
): StructuralCheck {
  const fcd = (mat.compressionStrength * K_MOD) / GAMMA_M;
  const sigma_cd = (axialForce * 1e3) / cs.A;

  // Knicknachweis nach EC5 6.3.2
  const i = Math.sqrt(cs.I / cs.A); // Trägheitsradius mm
  const lk = bucklingLength * 1000; // mm
  const lambda = lk / i;
  const lambda_rel = (lambda / Math.PI) * Math.sqrt(mat.compressionStrength / mat.elasticModulus * 1000);

  let kc = 1.0;
  if (lambda_rel > 0.3) {
    const betaC = 0.2; // Vollholz
    const k = 0.5 * (1 + betaC * (lambda_rel - 0.3) + lambda_rel * lambda_rel);
    kc = 1 / (k + Math.sqrt(k * k - lambda_rel * lambda_rel));
  }

  const utilization = sigma_cd / (kc * fcd);
  const status: StatusLevel = utilization > 1.0 ? 'red' : utilization > 0.8 ? 'yellow' : 'green';

  return {
    name: 'Knicken / Stabilität',
    type: 'stability',
    result: Math.round(utilization * 100) / 100,
    limit: 1.0,
    unit: '-',
    status,
    formula: `σ_c,d / (k_c · f_c,d) = ${sigma_cd.toFixed(2)} / (${kc.toFixed(3)} · ${fcd.toFixed(1)}) = ${utilization.toFixed(2)}`,
    details: `λ_rel = ${lambda_rel.toFixed(2)} | k_c = ${kc.toFixed(3)} | N_Ed = ${axialForce.toFixed(1)} kN`,
  };
}

function checkSupportReaction(
  totalLoad: number, // kN/m
  span: number // m
): StructuralCheck {
  const reaction = (totalLoad * span) / 2;
  return {
    name: 'Auflagerkraft',
    type: 'support_reactions',
    result: Math.round(reaction * 100) / 100,
    limit: 0,
    unit: 'kN',
    status: 'green',
    formula: `A = q · L / 2 = ${totalLoad.toFixed(2)} · ${span.toFixed(2)} / 2`,
    details: `Auflagerbreite prüfen: Mindestpressung beachten`,
  };
}

// === Hauptberechnung ===

export function calculateMember(
  member: TimberMember,
  material: MaterialProfile,
  loadCases: LoadCase[],
  roofPitch: number,
  mainSpan: number // m (Hauptspannweite)
): CalculationResult {
  const cs = getCrossSection(member.width, member.height);
  const checks: StructuralCheck[] = [];
  const missingInputs: string[] = [];

  // Einflussbreite basierend auf Bauteiltyp
  let einflussBbreite = 0.8; // Standard Sparrenabstand
  let effectiveSpan = member.length;

  switch (member.type) {
    case 'sparren':
      einflussBbreite = 0.8; // typischer Sparrenabstand
      effectiveSpan = mainSpan / Math.cos((roofPitch * Math.PI) / 180); // Sparrenlänge
      break;
    case 'pfette':
      // Pfette trägt Last von Sparren über die gesamte Dachbreite
      einflussBbreite = mainSpan / 2; // Halbe Spannweite bei Mittelpfette
      effectiveSpan = member.length > 6 ? member.length / 2 : member.length; // Annahme Zwischenauflager
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
    // Stützennachweis: Knicken
    const tributaryArea = 3.0 * (mainSpan / 2); // Annahme: 3m Stützenabstand
    const permanentLoad = loadCases
      .filter(l => l.type === 'permanent')
      .reduce((sum, l) => sum + l.value, 0);
    const snowLoad = loadCases.find(l => l.type === 'snow')?.value || 0;
    const axialForce = (GAMMA_G * permanentLoad + GAMMA_Q * snowLoad) * tributaryArea;

    checks.push(checkCompression(cs, material, axialForce, member.length));
    checks.push({
      name: 'Auflagerkraft (axial)',
      type: 'support_reactions',
      result: Math.round(axialForce * 100) / 100,
      limit: 0,
      unit: 'kN',
      status: 'green',
      formula: `N_Ed = (γ_G·g + γ_Q·s) · A_trib`,
      details: `Einzugsfläche: ${tributaryArea.toFixed(1)} m²`,
    });

    if (!material.compressionStrength) missingInputs.push('Druckfestigkeit prüfen');
  } else {
    // Biegebeanspruchte Bauteile
    const loads = calculateDesignLoads(loadCases, einflussBbreite, roofPitch);

    // Maximales Feldmoment (Einfeldträger)
    const Md = (loads.totalEd * effectiveSpan * effectiveSpan) / 8;
    // Maximale Querkraft
    const Vd = (loads.totalEd * effectiveSpan) / 2;

    checks.push(checkBending(cs, material, Md));
    checks.push(checkShear(cs, material, Vd));
    checks.push(checkDeflection(cs, material, effectiveSpan, loads.qk / 1000, loads.gk / 1000));
    checks.push(checkSupportReaction(loads.totalEd, effectiveSpan));
  }

  // Determine overall status
  const hasRed = checks.some(c => c.status === 'red');
  const hasYellow = checks.some(c => c.status === 'yellow');
  const overallStatus: StatusLevel = hasRed ? 'red' : hasYellow ? 'yellow' : 'green';

  // Check for missing inputs
  if (!loadCases.some(l => l.type === 'snow')) missingInputs.push('Schneelast fehlt');
  if (!loadCases.some(l => l.type === 'wind')) missingInputs.push('Windlast fehlt');
  if (loadCases.some(l => !l.userModified && l.confidence < 0.7)) {
    missingInputs.push('Lastannahmen mit niedriger Konfidenz – Bestätigung empfohlen');
  }

  return {
    id: `calc-${member.id}`,
    memberId: member.id,
    memberName: `${member.name} ${member.crossSection}`,
    checks,
    overallStatus,
    missingInputs,
    timestamp: new Date().toISOString(),
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
        id: `calc-${member.id}`,
        memberId: member.id,
        memberName: member.name,
        checks: [],
        overallStatus: 'red' as StatusLevel,
        missingInputs: ['Material nicht zugewiesen'],
        timestamp: new Date().toISOString(),
      };
    }
    return calculateMember(member, material, loadCases, roofPitch, mainSpan);
  });
}

// === Austrian Snow Load Calculation ===
// ÖNORM B 1991-1-3 / Eurocode 1 Teil 1-3

export function calculateSnowLoad(
  zone: string, // '1' | '2' | '3' | '4'
  altitude: number, // m ü.A.
  roofPitch: number // °
): { sk: number; si: number; mu: number } {
  // Charakteristische Schneelast am Boden sk (kN/m²)
  // Vereinfachte Zonenzuordnung nach ÖNORM B 1991-1-3
  let sk0: number;
  switch (zone) {
    case '1': sk0 = 1.00; break;
    case '2': sk0 = 1.60; break;
    case '3': sk0 = 2.30; break;
    case '4': sk0 = 3.40; break;
    default: sk0 = 1.60;
  }

  // Höhenkorrektur (vereinfachte Formel)
  const sk = sk0 * (1 + (altitude / 728) ** 2);

  // Formbeiwert μ nach EC1-1-3 Tabelle 5.2
  let mu: number;
  if (roofPitch <= 30) {
    mu = 0.8;
  } else if (roofPitch <= 60) {
    mu = 0.8 * (60 - roofPitch) / 30;
  } else {
    mu = 0;
  }

  const si = mu * sk;

  return {
    sk: Math.round(sk * 100) / 100,
    si: Math.round(si * 100) / 100,
    mu: Math.round(mu * 100) / 100,
  };
}

// === Wind Load (simplified) ===
// ÖNORM B 1991-1-4

export function calculateWindPressure(
  zone: string, // '1' | '2' | '3'
  terrainCategory: string, // 'I' | 'II' | 'III' | 'IV'
  height: number // m (Gebäudehöhe)
): { qp: number; vb0: number } {
  // Basiswindgeschwindigkeit vb,0 (m/s)
  let vb0: number;
  switch (zone) {
    case '1': vb0 = 25.0; break;
    case '2': vb0 = 27.3; break;
    case '3': vb0 = 30.0; break;
    default: vb0 = 27.3;
  }

  // Geländekategorie-Beiwerte (vereinfacht)
  let kr: number, z0: number;
  switch (terrainCategory) {
    case 'I': kr = 0.17; z0 = 0.01; break;
    case 'II': kr = 0.19; z0 = 0.05; break;
    case 'III': kr = 0.22; z0 = 0.30; break;
    case 'IV': kr = 0.24; z0 = 1.00; break;
    default: kr = 0.22; z0 = 0.30;
  }

  // Böengeschwindigkeitsdruck qp(z)
  const zMin = Math.max(height, z0 * 10);
  const cr = kr * Math.log(zMin / z0);
  const qb = 0.5 * 1.25 * vb0 * vb0 / 1000; // kN/m²
  const ce = cr * cr * (1 + 7 / (cr * Math.log(zMin / z0)));
  const qp = ce * qb;

  return {
    qp: Math.round(qp * 100) / 100,
    vb0,
  };
}
