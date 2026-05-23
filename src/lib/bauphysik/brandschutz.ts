/**
 * Brandschutz-Bemessung nach OIB-Richtlinie 2 (Österreich)
 * Abbrandrate KVH: 0.65 mm/min | BSH: 0.7 mm/min
 */

export type BauKlasse = 'GK1' | 'GK2' | 'GK3' | 'GK4' | 'GK5';
export type REI = 'REI 30' | 'REI 60' | 'REI 90' | 'REI 120';

// ===== REI-Klassen-Parsing (OIB RL2 / EN 13501) =====

export interface FireResistanceClass {
  code: string;          // 'REI 30', 'R 60', 'EI 30-C', etc.
  R?: boolean;           // Tragfähigkeit
  E?: boolean;           // Raumabschluß
  I?: boolean;           // Wärmedämmung
  M?: boolean;           // mechanische Beanspruchung
  C?: boolean;           // Selbstschließend
  duration_min: number;  // 30, 60, 90, 120, 180
}

/**
 * Parst einen REI-Klassencode aus einem Plan-Beschriftungstext.
 * Unterstützt: "REI 30" / "R 60" / "EI 30-C" / "REI 90-M" / "RM"
 */
export function parseREIClass(code: string): FireResistanceClass | null {
  const upper = code.toUpperCase().trim();
  if (upper === 'RM') return { code: 'RM', R: true, M: true, duration_min: 0 };
  const m = upper.match(/^([REIMW]+)\s*(\d+)(?:-([CMS]+))?$/);
  if (!m) return null;
  const flags = m[1];
  const duration = parseInt(m[2], 10);
  const extras = m[3] || '';
  return {
    code: upper,
    R: flags.includes('R'),
    E: flags.includes('E'),
    I: flags.includes('I'),
    M: flags.includes('M') || extras.includes('M'),
    C: extras.includes('C'),
    duration_min: duration,
  };
}

/** Empfohlene REI-Mindestanforderung je GK (OIB RL2) */
export const GK_REI_EMPFEHLUNG: Record<BauKlasse, { rei: REI | null; beschreibung: string }> = {
  GK1: { rei: null,       beschreibung: 'GK1 – keine Anforderung' },
  GK2: { rei: 'REI 30',  beschreibung: 'GK2 – REI 30 (brandhemmend)' },
  GK3: { rei: 'REI 60',  beschreibung: 'GK3 – REI 60 (hochbrandhemmend)' },
  GK4: { rei: 'REI 90',  beschreibung: 'GK4 – REI 90 (brandbeständig)' },
  GK5: { rei: 'REI 90',  beschreibung: 'GK5 – REI 90 (Sonderbau, brandbeständig)' },
};

/** Mindestanforderungen nach OIB RL2 Tabelle 1 */
const REI_MATRIX: Record<BauKlasse, { tragwerk: REI; decke: REI }> = {
  GK1: { tragwerk: 'REI 30', decke: 'REI 30' },
  GK2: { tragwerk: 'REI 30', decke: 'REI 30' },
  GK3: { tragwerk: 'REI 60', decke: 'REI 60' },
  GK4: { tragwerk: 'REI 90', decke: 'REI 90' },
  GK5: { tragwerk: 'REI 120', decke: 'REI 120' },
};

export function brandschutzAnforderung(bauklasse: BauKlasse, ebene: 'tragwerk' | 'decke'): REI {
  return REI_MATRIX[bauklasse][ebene];
}

/** Abbrandminuten pro REI-Klasse */
const REI_MINUTEN: Record<REI, number> = {
  'REI 30': 30,
  'REI 60': 60,
  'REI 90': 90,
  'REI 120': 120,
};

export interface AbbrandErgebnis {
  b: number;        // Mindestbreite mm
  h: number;        // Mindesthöhe mm
  abbrandRate: number; // mm/min
  abbrandTiefe: number; // mm pro belastete Seite
  bemerkung: string;
}

/**
 * Berechnet Mindestquerschnitt unter Abbrand (KVH, 3-seitig beaufschlagt).
 * @param rei   Feuerwiderstandsklasse
 * @param baseB Nenn-Breite mm (ohne Abbrand)
 * @param baseH Nenn-Höhe mm (ohne Abbrand)
 */
export function mindestQuerschnitt(rei: REI, baseB: number, baseH: number): AbbrandErgebnis {
  const abbrandRate = 0.65; // KVH-Standard
  const t = REI_MINUTEN[rei];
  const tiefe = abbrandRate * t; // mm einseitig

  // 3-seitig beaufschlagt: beidseitig Breite, einseitig Höhe (Unterseite)
  const b = baseB + 2 * tiefe;
  const h = baseH + tiefe;

  return {
    b: Math.ceil(b),
    h: Math.ceil(h),
    abbrandRate,
    abbrandTiefe: tiefe,
    bemerkung: `Abbrandtiefe ${tiefe.toFixed(0)} mm/Seite bei ${t} min (KVH 0.65 mm/min)`,
  };
}

export interface BrandschutzInfo {
  bauklasse: BauKlasse;
  rei_tragwerk: REI;
  rei_decke: REI;
  beschreibung: string;
  holzbauZulaessig: boolean;
}

export const BAUKLASSE_BESCHREIBUNG: Record<BauKlasse, string> = {
  GK1: 'Bis 3 oberirdische Geschosse, max. 7 m Fußbodenhöhe',
  GK2: 'Bis 3 oberirdische Geschosse, max. 11 m Fußbodenhöhe',
  GK3: 'Bis 5 oberirdische Geschosse, max. 16 m Fußbodenhöhe',
  GK4: 'Bis 7 oberirdische Geschosse, max. 22 m Fußbodenhöhe',
  GK5: 'Hochhaus, mehr als 22 m Fußbodenhöhe',
};

export function getBrandschutzInfo(bauklasse: BauKlasse): BrandschutzInfo {
  return {
    bauklasse,
    rei_tragwerk: brandschutzAnforderung(bauklasse, 'tragwerk'),
    rei_decke: brandschutzAnforderung(bauklasse, 'decke'),
    beschreibung: BAUKLASSE_BESCHREIBUNG[bauklasse],
    holzbauZulaessig: bauklasse !== 'GK5',
  };
}
