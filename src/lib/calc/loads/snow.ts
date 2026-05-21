/**
 * Schneelast-Ermittlung nach ÖNORM B 1991-1-3 (Österreich-spezifisch).
 *
 * Formel: s = μ_i · C_e · C_t · s_k
 *
 *   s_k   = charakteristische Schneelast am Boden [kN/m²], zonenabhängig + seehöhenabhängig
 *   μ_i   = Formbeiwert (abhängig von Dachform und Neigung)
 *   C_e   = Umgebungsbeiwert (1.0 normal, 0.8 windexponiert, 1.2 windgeschützt)
 *   C_t   = Thermischer Beiwert (1.0 außer bei stark beheizten Glasdächern)
 *
 * Ergebnis s = Bemessungs-Schneelast auf dem Dach [kN/m²].
 *
 * KLARTEXT FÜR LAIEN:
 *   Schnee drückt von oben auf das Dach. Je nach Region (Hochgebirge vs. Wienerwald)
 *   und Seehöhe (1000 m vs. 200 m) liegt mehr oder weniger Schnee. Die Zahl in kN/m²
 *   sagt: "So viel Kilogramm pro Quadratmeter musst du annehmen". 1 kN/m² ≈ 100 kg/m².
 */

export type SnowZone = '1' | '2' | '3' | '4';

export interface SnowLoadInput {
  zone: SnowZone;
  altitude: number;       // m über Adria
  roofPitch: number;      // Grad
  roofForm: 'satteldach' | 'pultdach' | 'walmdach' | 'flachdach' | 'krueppelwalmdach' | 'mischform';
  exposure: 'normal' | 'windExposed' | 'sheltered';
  heated: boolean;        // wenn beheiztes Glasdach: C_t < 1
}

export interface SnowLoadResult {
  sk: number;          // charakteristische Bodenschneelast [kN/m²]
  mu: number;          // Formbeiwert
  Ce: number;
  Ct: number;
  s: number;           // Bemessungswert Dach [kN/m²]
  asymmetric?: { windward: number; leeward: number };  // einseitiger Lastfall
  formula: string;
  explanation: string;
  zoneLabel: string;
}

/**
 * Charakteristische Bodenschneelast s_k(A) nach ÖNORM B 1991-1-3 Anhang B.
 * A = Seehöhe in m. Formel je Zone:
 *
 *   Zone 1: s_k = 0,642 · ((1 + (A/728)²)
 *   Zone 2: s_k = 0,933 · ((1 + (A/512)²)
 *   Zone 3: s_k = 1,114 · (1 + (A/438)²)
 *   Zone 4: s_k = 1,549 · (1 + (A/452)²)
 *
 * (Vereinfachte Polynom-Ansätze gemäß ÖNORM Anhang B – ausreichend genau für Vorbemessung)
 *
 * Mindestwert: s_k ≥ 0.4 kN/m² (auch im Tal).
 */
export function characteristicGroundSnow(zone: SnowZone, altitude: number): number {
  const A = Math.max(0, altitude);
  let sk: number;
  switch (zone) {
    case '1': sk = 0.642 * (1 + Math.pow(A / 728, 2)); break;
    case '2': sk = 0.933 * (1 + Math.pow(A / 512, 2)); break;
    case '3': sk = 1.114 * (1 + Math.pow(A / 438, 2)); break;
    case '4': sk = 1.549 * (1 + Math.pow(A / 452, 2)); break;
  }
  return Math.max(0.4, Math.round(sk * 100) / 100);
}

/**
 * Formbeiwert μ_1 für Sattel-/Pultdach nach EC1-1-3 Tab. 5.2.
 * Bei steilem Dach (>60°) rutscht der Schnee ab → μ wird kleiner.
 */
export function shapeFactor(roofPitch: number, form: SnowLoadInput['roofForm']): number {
  const alpha = Math.abs(roofPitch);
  if (form === 'flachdach') return 0.8;
  if (alpha <= 30) return 0.8;
  if (alpha < 60) return 0.8 * (60 - alpha) / 30;
  return 0; // > 60° → kein Schnee dauerhaft
}

/** Schneelast für Sattel-/Pultdach: symmetrisch + einseitig (windverwehter Schnee) */
export function calculateSnowLoad(input: SnowLoadInput): SnowLoadResult {
  const sk = characteristicGroundSnow(input.zone, input.altitude);
  const mu = shapeFactor(input.roofPitch, input.roofForm);
  const Ce = input.exposure === 'windExposed' ? 0.8 : input.exposure === 'sheltered' ? 1.2 : 1.0;
  const Ct = input.heated ? 0.8 : 1.0;
  const s = mu * Ce * Ct * sk;

  // Einseitiger Schneelastfall (eine Seite voll, andere halb)
  let asymmetric: { windward: number; leeward: number } | undefined;
  if (input.roofForm === 'satteldach' && input.roofPitch >= 15 && input.roofPitch <= 60) {
    asymmetric = { windward: 0.5 * s, leeward: s };
  }

  const explanation = `Schnee-Region Zone ${input.zone} bei ${input.altitude} m Seehöhe → ${sk.toFixed(2)} kN/m² (≈ ${Math.round(sk * 102)} kg) Schnee am Boden. ` +
    `Dachneigung ${input.roofPitch}° → Formbeiwert μ = ${mu.toFixed(2)} (steileres Dach hält weniger Schnee). ` +
    `Auf dem Dach wirken daher ${s.toFixed(2)} kN/m² (≈ ${Math.round(s * 102)} kg pro m²).`;

  const zoneLabel = `Zone ${input.zone} (s_k bei A=${input.altitude} m: ${sk.toFixed(2)} kN/m²)`;

  return {
    sk, mu, Ce, Ct, s, asymmetric,
    formula: 's = μ · Cₑ · Cₜ · s_k',
    explanation,
    zoneLabel,
  };
}

/**
 * Vereinfachtes Zonen-Lookup nach österreichischen Bundesländern.
 * (Detail: ÖNORM B 1991-1-3 Anhang A mit Gemeinde-genauer Zonenkarte —
 * hier nur grobe Default-Werte; im Admin kann pro Gemeinde feingetuned werden.)
 */
export const SNOW_ZONE_BY_STATE: Record<string, SnowZone> = {
  'Wien': '2',
  'Niederösterreich': '2',
  'Burgenland': '1',
  'Oberösterreich': '2',
  'Steiermark': '3',
  'Kärnten': '3',
  'Salzburg': '4',
  'Tirol': '4',
  'Vorarlberg': '4',
};
