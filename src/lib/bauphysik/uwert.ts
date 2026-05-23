/**
 * U-Wert-Berechnung für Dachaufbauten nach EN ISO 6946
 * Rsi = 0.10 m²K/W (Innen), Rse = 0.04 m²K/W (Außen)
 */

export interface UWertSchicht {
  name: string;
  lambda: number;   // W/mK Wärmeleitfähigkeit
  dicke_mm: number; // Schichtdicke in mm
}

/** Wärmedurchgangswiderstände Oberfläche */
const RSI = 0.10; // m²K/W innen
const RSE = 0.04; // m²K/W außen

/**
 * Typische Dachaufbauten EFH (von innen nach außen)
 */
export const DACH_AUFBAUTEN: Record<string, UWertSchicht[]> = {
  standard_zwischensparren: [
    { name: 'Gipskarton', lambda: 0.21, dicke_mm: 12.5 },
    { name: 'Dampfbremse', lambda: 0.50, dicke_mm: 1 },
    { name: 'Zwischensparrendämmung (Mineralwolle)', lambda: 0.035, dicke_mm: 180 },
    { name: 'OSB', lambda: 0.13, dicke_mm: 18 },
    { name: 'Lattung Hinterlüftung', lambda: 0.13, dicke_mm: 40 },
    { name: 'Ziegel/Eindeckung', lambda: 1.00, dicke_mm: 30 },
  ],
  aufsparren_dämmung: [
    { name: 'Gipskarton', lambda: 0.21, dicke_mm: 12.5 },
    { name: 'Dampfbremse', lambda: 0.50, dicke_mm: 1 },
    { name: 'Zwischensparren (Holzfaser)', lambda: 0.040, dicke_mm: 120 },
    { name: 'Schalung', lambda: 0.13, dicke_mm: 24 },
    { name: 'Aufsparrendämmung PUR', lambda: 0.024, dicke_mm: 120 },
    { name: 'Lattung Hinterlüftung', lambda: 0.13, dicke_mm: 40 },
    { name: 'Ziegel/Eindeckung', lambda: 1.00, dicke_mm: 30 },
  ],
  passivhaus: [
    { name: 'Gipskarton', lambda: 0.21, dicke_mm: 12.5 },
    { name: 'Dampfbremse', lambda: 0.50, dicke_mm: 1 },
    { name: 'Zwischensparren (Zellulose)', lambda: 0.038, dicke_mm: 240 },
    { name: 'OSB', lambda: 0.13, dicke_mm: 18 },
    { name: 'Aufsparrendämmung PUR', lambda: 0.024, dicke_mm: 160 },
    { name: 'Lattung Hinterlüftung', lambda: 0.13, dicke_mm: 40 },
    { name: 'Ziegel/Eindeckung', lambda: 1.00, dicke_mm: 30 },
  ],
};

export const DACH_AUFBAUTEN_LABELS: Record<string, string> = {
  standard_zwischensparren: 'Standard EFH (Zwischensparren)',
  aufsparren_dämmung: 'KfW 55 (Auf-+Zwischensparren)',
  passivhaus: 'Passivhaus (Zellulose + PUR)',
};

/** Zielwerte W/m²K */
export const UWERT_ZIELWERTE = {
  standard_zwischensparren: 0.20,
  aufsparren_dämmung: 0.15,
  passivhaus: 0.10,
};

/**
 * Berechnet U-Wert nach EN ISO 6946 (Serienreihung der Schichten)
 * @returns U-Wert in W/(m²K)
 */
export function calcUWert(schichten: UWertSchicht[]): number {
  const R_sum = schichten.reduce((sum, s) => sum + (s.dicke_mm / 1000) / s.lambda, 0);
  const R_T = RSI + R_sum + RSE;
  return 1 / R_T;
}

export interface UWertErgebnis {
  uwert: number;
  bewertung: 'sehr_gut' | 'gut' | 'ausreichend' | 'mangelhaft';
  anforderungEnev: number; // OIB RL6 Referenzwert Dach
  erfuellt: boolean;
  schichten: (UWertSchicht & { R: number })[];
}

const UWERT_GRENZWERT_OIB = 0.20; // W/m²K Dach OIB RL6

export function bewerteUWert(schichten: UWertSchicht[]): UWertErgebnis {
  const uwert = calcUWert(schichten);
  const schichtenMitR = schichten.map(s => ({
    ...s,
    R: (s.dicke_mm / 1000) / s.lambda,
  }));

  let bewertung: UWertErgebnis['bewertung'];
  if (uwert <= 0.10) bewertung = 'sehr_gut';
  else if (uwert <= 0.15) bewertung = 'gut';
  else if (uwert <= 0.20) bewertung = 'ausreichend';
  else bewertung = 'mangelhaft';

  return {
    uwert: Math.round(uwert * 1000) / 1000,
    bewertung,
    anforderungEnev: UWERT_GRENZWERT_OIB,
    erfuellt: uwert <= UWERT_GRENZWERT_OIB,
    schichten: schichtenMitR,
  };
}
