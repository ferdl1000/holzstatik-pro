/**
 * Dachflächen-Berechnung MIT Dachüberstand — an einer Stelle für das ganze
 * Programm. Ohne Überstand ist die Fläche (und damit Holzmenge, Eindeckung
 * und Angebotssumme) systematisch ~10 % zu klein: Die Endkontrolle hatte
 * beim Nöhrer-Plan 230 m² real gegen 208 m² gerechnet gemessen.
 *
 * Der Überstand kommt bevorzugt aus dem Plan (textParser: "Dachüberstand 50 cm"),
 * sonst gilt der österreichische Regelwert 0,4 m an allen vier Seiten.
 */
export const DEFAULT_ROOF_OVERHANG = 0.4;

export function roofAreaWithOverhang(
  length: number,
  width: number,
  pitchDeg: number,
  overhang: number = DEFAULT_ROOF_OVERHANG,
): number {
  if (length <= 0 || width <= 0) return 0;
  const o = Math.max(0, overhang);
  const L = length + 2 * o;
  const W = width + 2 * o;
  const cos = Math.cos((Math.min(Math.abs(pitchDeg), 75) * Math.PI) / 180);
  return L * (W / (cos || 1));
}
