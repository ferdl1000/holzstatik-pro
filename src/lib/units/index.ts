/**
 * Einheiten-Konvertierung mit Klartext-Erklärung für Laien.
 *
 * Statiker rechnen in N/kN. Normale Menschen denken in kg.
 * Diese Helper konvertieren beides und liefern lesbare Strings.
 *
 * Faustregel:  1 kN ≈ 100 kg Gewicht auf der Erde (g = 9.81 m/s²)
 */

export const G = 9.81; // Erdbeschleunigung m/s²

/** Newton → Kilogramm Masse-Äquivalent */
export const nToKg = (n: number): number => n / G;
/** Kilonewton → Kilogramm Masse-Äquivalent */
export const knToKg = (kn: number): number => (kn * 1000) / G;
/** Kilogramm → Newton (Gewichtskraft) */
export const kgToN = (kg: number): number => kg * G;
/** Kilogramm → Kilonewton */
export const kgToKn = (kg: number): number => (kg * G) / 1000;

/** Newton/Meter → Kilogramm/Meter */
export const nPerMToKgPerM = (nm: number): number => nm / G;
/** kN/m² → kg/m² */
export const knPerM2ToKgPerM2 = (knm2: number): number => (knm2 * 1000) / G;
/** kg/m² → kN/m² */
export const kgPerM2ToKnPerM2 = (kgm2: number): number => (kgm2 * G) / 1000;

/**
 * Formatiert eine Kraft als Doppel-Einheit: "12,5 kN ≈ 1.275 kg".
 * Für Anzeige in der UI gedacht.
 */
export function formatForce(kN: number, decimals = 2): string {
  const kg = knToKg(kN);
  return `${kN.toLocaleString('de-AT', { maximumFractionDigits: decimals })} kN ≈ ${kg.toLocaleString('de-AT', { maximumFractionDigits: 0 })} kg`;
}

/** Formatiert Flächenlast: "1,25 kN/m² ≈ 127 kg/m²" */
export function formatAreaLoad(kNm2: number, decimals = 2): string {
  const kgm2 = knPerM2ToKgPerM2(kNm2);
  return `${kNm2.toLocaleString('de-AT', { maximumFractionDigits: decimals })} kN/m² ≈ ${kgm2.toLocaleString('de-AT', { maximumFractionDigits: 0 })} kg/m²`;
}

/** Formatiert Linienlast: "2,5 kN/m ≈ 255 kg/m" */
export function formatLineLoad(kNm: number, decimals = 2): string {
  const kgm = (kNm * 1000) / G;
  return `${kNm.toLocaleString('de-AT', { maximumFractionDigits: decimals })} kN/m ≈ ${kgm.toLocaleString('de-AT', { maximumFractionDigits: 0 })} kg/m`;
}

/** Spannung in N/mm² mit Erklärung */
export function formatStress(nMm2: number): string {
  return `${nMm2.toLocaleString('de-AT', { maximumFractionDigits: 2 })} N/mm²`;
}

/** Moment in kNm mit kg·m Äquivalent */
export function formatMoment(kNm: number): string {
  const kgm = (kNm * 1000) / G;
  return `${kNm.toLocaleString('de-AT', { maximumFractionDigits: 2 })} kNm ≈ ${kgm.toLocaleString('de-AT', { maximumFractionDigits: 0 })} kg·m`;
}

/**
 * Ausnutzungsgrad als Prozent + Ampel.
 * η > 1.0 = Bauteil versagt rechnerisch → rot
 * η > 0.85 = wenig Reserve → gelb
 * η ≤ 0.85 = ok → grün
 */
export function formatUtilization(eta: number): { percent: string; status: 'green' | 'yellow' | 'red'; label: string } {
  const status: 'green' | 'yellow' | 'red' = eta > 1.0 ? 'red' : eta > 0.85 ? 'yellow' : 'green';
  const labels = {
    green: 'OK – ausreichend Tragreserve',
    yellow: 'Knapp – Querschnitt prüfen',
    red: 'Nicht ausreichend – Querschnitt vergrößern',
  };
  return {
    percent: `${(eta * 100).toLocaleString('de-AT', { maximumFractionDigits: 0 })} %`,
    status,
    label: labels[status],
  };
}
