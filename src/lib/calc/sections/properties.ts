/**
 * Querschnittswerte für rechteckige Holzquerschnitte.
 *
 * b = Breite [mm], h = Höhe [mm]
 *
 *   A   = b·h               Fläche [mm²]
 *   Iy  = b·h³/12           Trägheitsmoment um starke Achse y [mm⁴]
 *   Iz  = h·b³/12           Trägheitsmoment um schwache Achse z [mm⁴]
 *   Wy  = b·h²/6            Widerstandsmoment y [mm³]
 *   Wz  = h·b²/6            Widerstandsmoment z [mm³]
 *   iy  = h/√12             Trägheitsradius y
 *   iz  = b/√12             Trägheitsradius z
 */

export interface SectionProperties {
  b: number; h: number;
  A: number;
  Iy: number; Iz: number;
  Wy: number; Wz: number;
  iy: number; iz: number;
}

export function rectangular(b: number, h: number): SectionProperties {
  return {
    b, h,
    A: b * h,
    Iy: (b * Math.pow(h, 3)) / 12,
    Iz: (h * Math.pow(b, 3)) / 12,
    Wy: (b * h * h) / 6,
    Wz: (h * b * b) / 6,
    iy: h / Math.sqrt(12),
    iz: b / Math.sqrt(12),
  };
}

/** Übliche Holz-Querschnitte für KVH (Sparren/Pfetten) */
export const STANDARD_KVH_SECTIONS: { b: number; h: number; label: string }[] = [
  { b: 60,  h: 120, label: '6/12'  },
  { b: 60,  h: 140, label: '6/14'  },
  { b: 60,  h: 160, label: '6/16'  },
  { b: 80,  h: 140, label: '8/14'  },
  { b: 80,  h: 160, label: '8/16'  },
  { b: 80,  h: 180, label: '8/18'  },
  { b: 80,  h: 200, label: '8/20'  },
  { b: 80,  h: 220, label: '8/22'  },
  { b: 80,  h: 240, label: '8/24'  },
  { b: 100, h: 180, label: '10/18' },
  { b: 100, h: 200, label: '10/20' },
  { b: 100, h: 220, label: '10/22' },
  { b: 100, h: 240, label: '10/24' },
  { b: 100, h: 260, label: '10/26' },
  { b: 120, h: 200, label: '12/20' },
  { b: 120, h: 220, label: '12/22' },
  { b: 120, h: 240, label: '12/24' },
  { b: 140, h: 240, label: '14/24' },
  { b: 160, h: 240, label: '16/24' },
];

/** Übliche BSH-Querschnitte (Brettschichtholz / Leimbinder) */
export const STANDARD_GLULAM_SECTIONS: { b: number; h: number; label: string }[] = [
  { b: 100, h: 200, label: '10/20' },
  { b: 100, h: 240, label: '10/24' },
  { b: 100, h: 280, label: '10/28' },
  { b: 100, h: 320, label: '10/32' },
  { b: 120, h: 320, label: '12/32' },
  { b: 120, h: 400, label: '12/40' },
  { b: 120, h: 480, label: '12/48' },
  { b: 140, h: 480, label: '14/48' },
  { b: 140, h: 560, label: '14/56' },
  { b: 160, h: 560, label: '16/56' },
  { b: 160, h: 640, label: '16/64' },
  { b: 160, h: 720, label: '16/72' },
  { b: 180, h: 720, label: '18/72' },
  { b: 180, h: 800, label: '18/80' },
  { b: 200, h: 800, label: '20/80' },
  { b: 200, h: 900, label: '20/90' },
  { b: 200, h: 1000, label: '20/100' },
  { b: 240, h: 1200, label: '24/120' },
];
