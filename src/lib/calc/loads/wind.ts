/**
 * Windlast-Ermittlung nach ÖNORM B 1991-1-4 (Österreich).
 *
 * Grundformel:    w_e = c_pe · q_p(z_e)
 *
 *   q_p(z)   = Geschwindigkeitsdruck in Höhe z [kN/m²]
 *   c_pe     = aerodynamischer Außendruckbeiwert (je nach Bereich/Form, +Druck, −Sog)
 *
 * Geschwindigkeitsdruck:  q_p(z) = c_e(z) · q_b
 *   q_b = 0,5 · ρ · v_b²    Basis-Geschwindigkeitsdruck (ρ = 1,25 kg/m³ Luftdichte)
 *   c_e(z) = Expositionsbeiwert, abhängig von Geländekategorie + Bauwerkshöhe
 *
 * KLARTEXT FÜR LAIEN:
 *   Wind drückt auf das Dach (Druck) und saugt es auf der anderen Seite an (Sog).
 *   Je höher das Haus und je freier es steht (Berg, Feld), desto mehr Wind kommt an.
 *   In Wien weht weniger Wind als im Burgenland an der Ungarischen Grenze.
 *   Sog ist oft kritischer als Druck: Dach kann ABHEBEN wenn die Verankerung schwach ist.
 */

export type WindZone = '1' | '2' | '3' | '4';
export type TerrainCategory = '0' | 'I' | 'II' | 'III' | 'IV';

export interface WindLoadInput {
  zone: WindZone;
  terrain: TerrainCategory;
  buildingHeight: number;   // Firsthöhe in m
  roofPitch: number;        // Grad
  roofForm: 'satteldach' | 'pultdach' | 'walmdach' | 'flachdach' | 'krueppelwalmdach' | 'mischform';
}

export interface WindLoadResult {
  vb: number;       // Basis-Windgeschwindigkeit [m/s]
  qb: number;       // Basis-Geschwindigkeitsdruck [kN/m²]
  ce: number;       // Expositionsbeiwert
  qp: number;       // Geschwindigkeitsdruck in Bauwerkshöhe [kN/m²]
  cpe: { pressure: number; suction: number; areaF: number; areaG: number; areaH: number; areaI?: number; areaJ?: number };
  we: { pressure: number; suction: number };   // resultierende Windlast [kN/m²]
  zoneLabel: string;
  explanation: string;
}

/** Basis-Windgeschwindigkeit nach Zone (ÖNORM B 1991-1-4 Anhang A) */
export const VB_BY_ZONE: Record<WindZone, number> = {
  '1': 17.6,   // Westösterreich Inneralpin (Bregenz, Innsbruck Tal)
  '2': 22.5,   // Norden, Mittelgebirge
  '3': 25.9,   // Wien, Niederösterreich Ost
  '4': 28.3,   // Burgenland, Ungarische Tiefebene
};

/**
 * Expositionsbeiwert c_e(z) nach EC1-1-4 Tab. NA.1.
 * Vereinfachte Form: c_e(z) ≈ k_r² · ln(z/z_0) · (1 + 7·k_l/(c_r·c_o))
 * Hier in tabellarischer Vereinfachung:
 */
export function exposureCoefficient(terrain: TerrainCategory, z: number): number {
  // Werte interpoliert aus EC1-1-4 Bild 4.2, vereinfacht
  const params: Record<TerrainCategory, { z0: number; min: number; max: number }> = {
    '0':  { z0: 0.003, min: 2.5, max: 4.0 },   // Meer, Seen
    'I':  { z0: 0.01,  min: 2.2, max: 3.6 },   // freies Feld
    'II': { z0: 0.05,  min: 1.8, max: 3.0 },   // niedrige Vegetation, vereinzelt Hindernisse
    'III':{ z0: 0.3,   min: 1.3, max: 2.3 },   // Vororte, Wälder
    'IV': { z0: 1.0,   min: 1.0, max: 1.8 },   // Großstadt
  };
  const p = params[terrain];
  const z_eff = Math.max(z, 5);
  // c_e wächst grob log-linear mit z, sättigt bei 200 m
  const f = Math.min(1, Math.log(z_eff / p.z0) / Math.log(200 / p.z0));
  return p.min + (p.max - p.min) * f;
}

/**
 * Außendruckbeiwerte c_pe,10 für Satteldach nach EC1-1-4 Tab. 7.4a.
 * α = Dachneigung. Druck positiv, Sog negativ.
 */
export function cpeSaddleRoof(alpha: number): { pressure: number; suction: number; areaF: number; areaG: number; areaH: number; areaI: number; areaJ: number } {
  // Vereinfachte Tabellenwerte (Wind senkrecht zum First)
  // Bereiche F/G/H = Luvseite, I/J = Leeseite
  if (alpha <= 5)   return { pressure: 0.0,  suction: -1.8, areaF: -1.8, areaG: -1.2, areaH: -0.7, areaI: -0.6, areaJ: 0.2 };
  if (alpha <= 15)  return { pressure: 0.2,  suction: -1.7, areaF: -0.9, areaG: -0.8, areaH: -0.3, areaI: -0.4, areaJ: -1.0 };
  if (alpha <= 30)  return { pressure: 0.7,  suction: -0.5, areaF: -0.5, areaG: -0.5, areaH: -0.2, areaI: -0.4, areaJ: -0.5 };
  if (alpha <= 45)  return { pressure: 0.7,  suction: -0.0, areaF: 0.0,  areaG: 0.0,  areaH: 0.0,  areaI: -0.2, areaJ: -0.3 };
  if (alpha <= 60)  return { pressure: 0.7,  suction: 0.0,  areaF: 0.7,  areaG: 0.7,  areaH: 0.7,  areaI: -0.2, areaJ: -0.3 };
  return            { pressure: 0.8,  suction: 0.0,  areaF: 0.8,  areaG: 0.8,  areaH: 0.8,  areaI: -0.2, areaJ: -0.3 };
}

export function calculateWindLoad(input: WindLoadInput): WindLoadResult {
  const vb = VB_BY_ZONE[input.zone];
  const rho = 1.25; // kg/m³ Luftdichte
  const qb = 0.5 * rho * vb * vb / 1000; // [kN/m²]
  const ce = exposureCoefficient(input.terrain, input.buildingHeight);
  const qp = ce * qb;

  const cpe = cpeSaddleRoof(input.roofPitch);

  const we = {
    pressure: cpe.pressure * qp,
    suction: cpe.suction * qp,
  };

  const explanation = `Windzone ${input.zone}: Basis-Windgeschwindigkeit v_b = ${vb} m/s (≈ ${(vb * 3.6).toFixed(0)} km/h). ` +
    `Basis-Staudruck q_b = ${qb.toFixed(2)} kN/m². ` +
    `Geländekategorie ${input.terrain} bei ${input.buildingHeight} m Höhe → Expositionsbeiwert c_e = ${ce.toFixed(2)}. ` +
    `Damit q_p = ${qp.toFixed(2)} kN/m² Staudruck am Dach. ` +
    `Bei ${input.roofPitch}° Dachneigung ergibt sich Druck ${we.pressure.toFixed(2)} kN/m² (≈ ${Math.round(we.pressure * 102)} kg/m²) und Sog ${we.suction.toFixed(2)} kN/m² (≈ ${Math.round(Math.abs(we.suction) * 102)} kg/m² Abhebekraft).`;

  return {
    vb, qb, ce, qp, cpe, we,
    zoneLabel: `Zone ${input.zone} (v_b = ${vb} m/s)`,
    explanation,
  };
}

/** Windzonen-Default nach Bundesland */
export const WIND_ZONE_BY_STATE: Record<string, WindZone> = {
  'Wien': '3',
  'Niederösterreich': '3',
  'Burgenland': '4',
  'Oberösterreich': '2',
  'Steiermark': '2',
  'Kärnten': '1',
  'Salzburg': '2',
  'Tirol': '1',
  'Vorarlberg': '1',
};
