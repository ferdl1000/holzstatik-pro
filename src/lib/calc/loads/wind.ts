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
  // EC1-1-4 Abschn. 4.3 — echte Formel statt Interpolationstabelle:
  //   k_r   = 0,19 · (z_0 / z_0,II)^0,07        Geländefaktor
  //   c_r   = k_r · ln(z / z_0)                  Rauigkeitsbeiwert
  //   I_v   = k_l / (c_o · ln(z / z_0))          Turbulenzintensität (k_l = 1, c_o = 1)
  //   c_e   = c_r² · c_o² · (1 + 7 · I_v)
  const params: Record<TerrainCategory, { z0: number; zmin: number }> = {
    '0':  { z0: 0.003, zmin: 1 },    // Meer, Seen
    'I':  { z0: 0.01,  zmin: 1 },    // freies Feld
    'II': { z0: 0.05,  zmin: 2 },    // niedrige Vegetation, vereinzelte Hindernisse
    'III':{ z0: 0.3,   zmin: 5 },    // Vororte, Wälder
    'IV': { z0: 1.0,   zmin: 10 },   // Großstadt
  };
  const p = params[terrain];
  const z_eff = Math.max(z, p.zmin);
  const kr = 0.19 * Math.pow(p.z0 / 0.05, 0.07);
  const lnz = Math.log(z_eff / p.z0);
  const cr = kr * lnz;
  const Iv = 1 / lnz;
  return cr * cr * (1 + 7 * Iv);
}

/**
 * Außendruckbeiwerte c_pe,10 für Satteldach nach EC1-1-4 Tab. 7.4a.
 * α = Dachneigung. Druck positiv, Sog negativ.
 */
export function cpeSaddleRoof(alpha: number): { pressure: number; suction: number; areaF: number; areaG: number; areaH: number; areaI: number; areaJ: number } {
  // Tab. 7.4a — Wind SENKRECHT zum First (θ = 0°). Luv F/G/H, Lee I/J.
  const t0 =
    alpha <= 5  ? { F: -1.7, G: -1.2, H: -0.6, I: -0.6, J: -0.6, p: 0.0 } :
    alpha <= 15 ? { F: -0.9, G: -0.8, H: -0.3, I: -0.4, J: -1.0, p: 0.2 } :
    alpha <= 30 ? { F: -0.5, G: -0.5, H: -0.2, I: -0.4, J: -0.5, p: 0.7 } :
    alpha <= 45 ? { F:  0.0, G:  0.0, H:  0.0, I: -0.2, J: -0.3, p: 0.7 } :
    alpha <= 60 ? { F:  0.7, G:  0.7, H:  0.7, I: -0.2, J: -0.3, p: 0.7 } :
                  { F:  0.8, G:  0.8, H:  0.8, I: -0.2, J: -0.3, p: 0.8 };

  // Tab. 7.4b — Wind PARALLEL zum First (θ = 90°). Hier entsteht auch bei
  // steilen Dächern erheblicher Sog über die GESAMTE Dachfläche. Dieser Fall
  // wurde bisher komplett ignoriert, wodurch der Sog bei 30°–60° zu exakt
  // 0,00 kN/m² wurde — bei keinem Steildach ein realistischer Wert.
  const t90 =
    alpha <= 5  ? { F: -1.6, G: -1.8, H: -0.6, I: -0.5 } :
    alpha <= 15 ? { F: -1.3, G: -2.0, H: -0.6, I: -0.5 } :
    alpha <= 30 ? { F: -1.1, G: -1.5, H: -0.8, I: -0.5 } :
    alpha <= 45 ? { F: -1.1, G: -1.4, H: -0.9, I: -0.5 } :
                  { F: -1.1, G: -1.2, H: -0.8, I: -0.5 };

  const suction = Math.min(t0.F, t0.G, t0.H, t0.I, t0.J, t90.F, t90.G, t90.H, t90.I);
  return {
    pressure: t0.p,
    suction,
    areaF: Math.min(t0.F, t90.F),
    areaG: Math.min(t0.G, t90.G),
    areaH: Math.min(t0.H, t90.H),
    areaI: Math.min(t0.I, t90.I),
    areaJ: t0.J,
  };
}

/** Pultdach — EC1-1-4 Tab. 7.3a/b (θ = 0°, 180°, 90°). */
export function cpeMonopitchRoof(alpha: number) {
  const luv =
    alpha <= 5  ? { F: -1.7, G: -1.2, H: -0.6, p: 0.0 } :
    alpha <= 15 ? { F: -0.9, G: -0.8, H: -0.3, p: 0.2 } :
    alpha <= 30 ? { F: -0.5, G: -0.5, H: -0.2, p: 0.7 } :
    alpha <= 45 ? { F:  0.0, G:  0.0, H:  0.0, p: 0.7 } :
                  { F:  0.7, G:  0.7, H:  0.7, p: 0.8 };
  // θ = 180° (Wind auf die hohe Traufkante) und θ = 90° liefern den Sog
  const lee =
    alpha <= 5  ? { F: -2.3, G: -1.3, H: -0.8 } :
    alpha <= 15 ? { F: -2.5, G: -1.3, H: -0.9 } :
    alpha <= 30 ? { F: -1.1, G: -0.8, H: -0.8 } :
    alpha <= 45 ? { F: -0.6, G: -0.5, H: -0.5 } :
                  { F: -0.5, G: -0.5, H: -0.5 };
  const quer = alpha <= 15 ? -2.1 : alpha <= 30 ? -1.8 : -1.5;
  const suction = Math.min(luv.F, luv.G, luv.H, lee.F, lee.G, lee.H, quer);
  return { pressure: luv.p, suction, areaF: Math.min(luv.F, lee.F), areaG: Math.min(luv.G, lee.G), areaH: Math.min(luv.H, lee.H), areaI: quer, areaJ: quer };
}

/** Walmdach / Krüppelwalmdach — EC1-1-4 Tab. 7.5. */
export function cpeHippedRoof(alpha: number) {
  const t =
    alpha <= 5  ? { F: -1.7, G: -1.2, H: -0.6, I: -0.3, J: -0.6, p: 0.0 } :
    alpha <= 15 ? { F: -1.3, G: -1.3, H: -0.6, I: -0.5, J: -0.7, p: 0.2 } :
    alpha <= 30 ? { F: -1.2, G: -1.4, H: -0.8, I: -0.5, J: -0.7, p: 0.5 } :
    alpha <= 45 ? { F: -1.2, G: -1.4, H: -0.8, I: -0.5, J: -0.7, p: 0.7 } :
                  { F: -1.2, G: -1.2, H: -0.8, I: -0.5, J: -0.7, p: 0.8 };
  return { pressure: t.p, suction: Math.min(t.F, t.G, t.H, t.I, t.J), areaF: t.F, areaG: t.G, areaH: t.H, areaI: t.I, areaJ: t.J };
}

/** Flachdach — EC1-1-4 Tab. 7.2 (scharfkantige Attika). */
export function cpeFlatRoof() {
  return { pressure: 0.2, suction: -1.8, areaF: -1.8, areaG: -1.2, areaH: -0.7, areaI: -0.2, areaJ: 0.2 };
}

/** Wählt die zur Dachform passende cpe-Tabelle. */
export function cpeForRoof(form: WindLoadInput['roofForm'], alpha: number) {
  switch (form) {
    case 'flachdach':        return cpeFlatRoof();
    case 'pultdach':         return cpeMonopitchRoof(alpha);
    case 'walmdach':
    case 'krueppelwalmdach': return cpeHippedRoof(alpha);
    case 'satteldach':       return cpeSaddleRoof(alpha);
    default: {
      // Mischform: konservativ der ungünstigste Wert aus Sattel- und Walmdach
      const s = cpeSaddleRoof(alpha);
      const w = cpeHippedRoof(alpha);
      return {
        pressure: Math.max(s.pressure, w.pressure),
        suction: Math.min(s.suction, w.suction),
        areaF: Math.min(s.areaF, w.areaF), areaG: Math.min(s.areaG, w.areaG),
        areaH: Math.min(s.areaH, w.areaH), areaI: Math.min(s.areaI, w.areaI),
        areaJ: Math.min(s.areaJ, w.areaJ),
      };
    }
  }
}

export function calculateWindLoad(input: WindLoadInput): WindLoadResult {
  const vb = VB_BY_ZONE[input.zone];
  const rho = 1.25; // kg/m³ Luftdichte
  const qb = 0.5 * rho * vb * vb / 1000; // [kN/m²]
  const ce = exposureCoefficient(input.terrain, input.buildingHeight);
  const qp = ce * qb;

  // Dachform bestimmt die cpe-Tabelle (vorher wurde für JEDE Form die
  // Satteldach-Tabelle verwendet).
  const cpe = cpeForRoof(input.roofForm, input.roofPitch);

  const we = {
    pressure: cpe.pressure * qp,
    // Sicherung: Sog ist bei keinem Dach exakt null.
    suction: Math.min(cpe.suction, -0.3) * qp,
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
