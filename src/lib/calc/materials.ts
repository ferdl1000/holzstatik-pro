/**
 * Holzmaterial-Datenbank nach EN 338 / EN 14080 / ÖNORM B 1995-1-1.
 *
 * Festigkeitsklassen für Bemessung:
 * - C24: Standard-Bauholz (KVH, Schnittholz) — am häufigsten verwendet
 * - C30: höherwertiges KVH
 * - GL24h/GL28h: Brettschichtholz (Leimbinder, homogen)
 * - GL24c/GL28c: Brettschichtholz (kombiniert)
 *
 * Alle Festigkeitswerte in N/mm² = MPa (charakteristisch, k-Wert).
 * E-Modul in N/mm². Dichte in kg/m³.
 */

export interface TimberStrengthClass {
  id: string;
  name: string;
  category: 'solid' | 'glulam' | 'lvl';
  fmk: number;       // Biegefestigkeit charakteristisch [N/mm²]
  ft0k: number;      // Zug parallel
  ft90k: number;     // Zug senkrecht zur Faser
  fc0k: number;      // Druck parallel
  fc90k: number;     // Druck senkrecht (Auflagerpressung)
  fvk: number;       // Schub
  E0mean: number;    // E-Modul parallel Mittelwert [N/mm²]
  E005: number;      // E-Modul 5%-Quantil (für Stabilitätsnachweise)
  Gmean: number;     // Schubmodul Mittelwert
  rhok: number;      // Charakt. Rohdichte [kg/m³]
  rhomean: number;   // Mittlere Rohdichte
  description: string;
  useCases: string[];
}

export const TIMBER_CLASSES: Record<string, TimberStrengthClass> = {
  C24: {
    id: 'C24',
    name: 'C24 (Nadelholz / KVH)',
    category: 'solid',
    fmk: 24, ft0k: 14.5, ft90k: 0.4, fc0k: 21, fc90k: 2.5, fvk: 4.0,
    E0mean: 11000, E005: 7400, Gmean: 690,
    rhok: 350, rhomean: 420,
    description: 'Standard-Konstruktionsholz für Sparren, Pfetten, Zangen. Häufigste Verwendung im Wohnbau.',
    useCases: ['Sparren', 'Pfetten bis 6 m', 'Kehlbalken', 'Zangen', 'Schalung'],
  },
  C30: {
    id: 'C30',
    name: 'C30 (Hochwertiges KVH)',
    category: 'solid',
    fmk: 30, ft0k: 19, ft90k: 0.4, fc0k: 24, fc90k: 2.7, fvk: 4.0,
    E0mean: 12000, E005: 8000, Gmean: 750,
    rhok: 380, rhomean: 460,
    description: 'Höhere Festigkeit, bei größeren Spannweiten oder höheren Lasten.',
    useCases: ['Pfetten > 6 m', 'hoch beanspruchte Sparren', 'Stützen'],
  },
  GL24h: {
    id: 'GL24h',
    name: 'GL24h (Brettschichtholz homogen)',
    category: 'glulam',
    fmk: 24, ft0k: 19.2, ft90k: 0.5, fc0k: 24, fc90k: 2.5, fvk: 3.5,
    E0mean: 11500, E005: 9600, Gmean: 650,
    rhok: 385, rhomean: 420,
    description: 'Leimbinder homogen aufgebaut. Für mittlere Spannweiten und Sichtqualität.',
    useCases: ['Hauptträger 8–15 m', 'Mittelpfetten lang', 'Riegel'],
  },
  GL28h: {
    id: 'GL28h',
    name: 'GL28h (BSH homogen, hochfest)',
    category: 'glulam',
    fmk: 28, ft0k: 22.3, ft90k: 0.5, fc0k: 28, fc90k: 2.5, fvk: 3.5,
    E0mean: 12600, E005: 10500, Gmean: 650,
    rhok: 425, rhomean: 460,
    description: 'Hochfeste BSH. Für große Spannweiten ohne Stützen, z. B. Hallenbinder, gebogene Träger.',
    useCases: ['Stützenfreie Hallen 15–30 m', 'gebogene Träger', 'Bogenbinder', 'Fischbauchträger'],
  },
  GL24c: {
    id: 'GL24c',
    name: 'GL24c (BSH kombiniert)',
    category: 'glulam',
    fmk: 24, ft0k: 17, ft90k: 0.5, fc0k: 21.5, fc90k: 2.5, fvk: 3.5,
    E0mean: 11000, E005: 9100, Gmean: 650,
    rhok: 365, rhomean: 400,
    description: 'BSH mit höherer Festigkeit in den Außenlagen, wirtschaftlicher als GL24h.',
    useCases: ['Standard-Hauptträger', 'Pfetten'],
  },
  GL28c: {
    id: 'GL28c',
    name: 'GL28c (BSH kombiniert hochfest)',
    category: 'glulam',
    fmk: 28, ft0k: 19.5, ft90k: 0.5, fc0k: 24, fc90k: 2.5, fvk: 3.5,
    E0mean: 12500, E005: 10400, Gmean: 650,
    rhok: 390, rhomean: 425,
    description: 'Hochfester BSH kombiniert, gutes Preis/Leistungs-Verhältnis bei großen Spannweiten.',
    useCases: ['Hallenbinder', 'gebogene Träger ab 20 m'],
  },
};

/**
 * Modifikationsbeiwerte k_mod nach EC5 Tabelle 3.1
 * für Nutzungsklasse 1 oder 2 (überdachte Konstruktion).
 * Berücksichtigt Feuchte und Lastdauer.
 */
export const K_MOD: Record<string, Record<string, number>> = {
  // Nutzungsklasse, Lastdauerklasse
  '1': { permanent: 0.6, longTerm: 0.7, mediumTerm: 0.8, shortTerm: 0.9, instantaneous: 1.1 },
  '2': { permanent: 0.6, longTerm: 0.7, mediumTerm: 0.8, shortTerm: 0.9, instantaneous: 1.1 },
  '3': { permanent: 0.5, longTerm: 0.55, mediumTerm: 0.65, shortTerm: 0.7, instantaneous: 0.9 },
};

/** Teilsicherheitsbeiwert γ_M nach ÖNORM B 1995-1-1 */
export const GAMMA_M: Record<string, number> = {
  solid: 1.3,   // Vollholz, KVH
  glulam: 1.25, // Brettschichtholz
  lvl: 1.2,     // Furnierschichtholz
};

/**
 * Lastdauer-Klassen nach EC5
 * - permanent: Eigengewicht
 * - longTerm: Lagerlast
 * - mediumTerm: Nutzlast Wohnung, Schnee an Standorten >1000m
 * - shortTerm: Schnee (typisch), Wartung
 * - instantaneous: Wind, Einzellasten Stoß
 */
export type LoadDuration = 'permanent' | 'longTerm' | 'mediumTerm' | 'shortTerm' | 'instantaneous';

/** Bemessungswert einer Festigkeit: f_d = k_mod · f_k / γ_M */
export function designStrength(
  characteristic: number,
  kmod: number,
  gammaM: number,
): number {
  return (kmod * characteristic) / gammaM;
}
