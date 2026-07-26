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
 * Offizielle Österreich-Formel (gilt bis A ≤ 1500 m):
 *
 *   s_k = (0,642 · z + 0,009) · (1 + (A/728)²)
 *
 *   z = Zonenwert laut Schneelastzonen-Karte (1, 2, 3, 4; Zwischenzonen wie 2,5 möglich)
 *   A = Seehöhe in m
 *
 * Beispiele zur Selbstkontrolle: Wien (Zone 2, ~170 m) → 1,36 kN/m²;
 * Hartberg (Zone 3, 367 m) → 2,43 kN/m². Mindestwert s_k ≥ 0,4 kN/m².
 *
 * EINZIGE Quelle für s_k im Programm — auch src/lib/calculations.ts delegiert hierher,
 * damit Lasten-Tab und Auto-Pipeline garantiert identische Werte liefern.
 */
export function characteristicGroundSnow(zone: SnowZone, altitude: number): number {
  const A = Math.max(0, altitude);
  const z = Number(zone);
  const sk = (0.642 * z + 0.009) * (1 + Math.pow(A / 728, 2));
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
  // > 60°: der Schnee rutscht ab — ABER nur, wenn er das auch kann.
  // EC1-1-3 Abschn. 5.3.4: bei Schneefanggittern, Attiken oder anderen
  // Hindernissen darf NICHT abgemindert werden. Ob ein Gitter vorhanden ist,
  // lässt sich aus dem Einreichplan nicht sicher ablesen; für eine Vorstatik
  // wird deshalb der ungünstige Fall angesetzt (vorher: μ = 0, also gar keine
  // Schneelast auf steilen Dächern).
  return 0.8;
}

/**
 * Formbeiwert μ₂ für SCHNEEANHÄUFUNG an einem höheren Bauteil
 * (EC1-1-3 / ÖNORM B 1991-1-3 Abschn. 5.3.6).
 *
 * Das ist der klassische Einsturzfall bei Vordächern, Carports und Anbauten:
 * vom höheren Hauptdach rutscht Schnee ab und der Wind weht zusätzlich
 * Schnee in die Ecke. Auf dem niedrigeren Dach liegt dort ein Vielfaches
 * der normalen Schneelast.
 *
 *   μ_s = Abrutschanteil vom Oberdach (nur bei Neigung > 15°)
 *   μ_w = (b₁ + b₂) / (2·h),  begrenzt auf γ·h / s_k   (γ = 2 kN/m³)
 *   μ₂  = μ_s + μ_w,  geklemmt auf 0,8 … 4,0
 *   l_s = 2·h,  geklemmt auf 5 … 15 m  (Länge des Anhäufungsbereichs)
 *
 * @param sk        charakteristische Schneelast am Boden [kN/m²]
 * @param h         Höhenversprung Oberdach ↔ Unterdach [m]
 * @param b1        Breite des niedrigeren Daches [m]
 * @param b2        Breite des höheren Daches [m]
 * @param pitchOben Neigung des höheren Daches [°]
 */
export function driftShapeFactor(
  sk: number, h: number, b1: number, b2: number, pitchOben: number,
): { mu2: number; ls: number; explanation: string } {
  const hh = Math.max(0.1, h);
  const gamma = 2.0; // kN/m³ Wichte des abgelagerten Schnees
  // Abrutschanteil: nur wenn das obere Dach steil genug ist
  const mu_s = pitchOben > 15 ? 0.5 * Math.min(1, (pitchOben - 15) / 15) : 0;
  const mu_w_roh = (b1 + b2) / (2 * hh);
  const mu_w = Math.min(mu_w_roh, (gamma * hh) / Math.max(0.1, sk));
  const mu2 = Math.min(4.0, Math.max(0.8, mu_s + mu_w));
  const ls = Math.min(15, Math.max(5, 2 * hh));
  return {
    mu2: +mu2.toFixed(2),
    ls: +ls.toFixed(1),
    explanation: `Schneeanhäufung am ${hh.toFixed(2)} m höheren Bauteil: μ_s = ${mu_s.toFixed(2)} (Abrutschen vom ${pitchOben}°-Dach) + μ_w = ${mu_w.toFixed(2)} (Verwehung) → μ₂ = ${mu2.toFixed(2)} über ${ls.toFixed(1)} m Anhäufungslänge.`,
  };
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
