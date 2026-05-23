/**
 * Montage-Reihenfolge für Zimmerei-Aufbau.
 * Reihenfolge nach Baupraxis: Schwellen → Stützen → Pfetten → BSH → Sparren → Schalung.
 * Dauer-Schätzungen nach Daumenregel (2-Mann-Trupp).
 */

import type { TimberMember } from '@/types/project';

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface MontageSchritt {
  reihenfolge: number;
  label:       string;
  bauteile:    TimberMember[];
  dauer_h:     number;    // Gesamtdauer 2-Mann-Trupp in Stunden
  kran_noetig: boolean;
  hinweis:     string;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Holzdichte-Schätzung kg/m³ nach Material */
function density(material: string): number {
  if (material?.toLowerCase().includes('gl') || material?.toLowerCase().includes('bsh')) return 490;
  return 470; // KVH / C24 / C30
}

/** Gewicht eines Members in kg */
function weightKg(m: TimberMember): number {
  const vol = (m.width / 1000) * (m.height / 1000) * m.length; // m³
  return vol * density(m.material || 'C24') * m.quantity;
}

/** Kran nötig wenn Einzelbauteil > 50 kg ODER Länge > 8 m */
function needsCrane(m: TimberMember): boolean {
  const singleVol    = (m.width / 1000) * (m.height / 1000) * m.length;
  const singleWeight = singleVol * density(m.material || 'C24');
  return singleWeight > 50 || m.length > 8;
}

/** Dauer-Schätzung pro Bauteil-Typ (Stunden/Stück, 2-Mann-Trupp) */
function durationPerPiece(m: TimberMember): number {
  switch (m.type) {
    case 'leimbinder': return 2.0;
    case 'pfette':     return 1.0;
    case 'stuetze':    return 0.75;
    case 'rahm':       return 0.5;
    case 'sparren':    return 0.5;
    case 'kehlbalken': return 0.4;
    case 'zange':      return 0.4;
    case 'auswechslung': return 0.6;
    case 'nebentraeger': return 0.5;
    default:           return 0.5;
  }
}

// ─── Reihenfolge-Definition ───────────────────────────────────────────────────

interface StepDef {
  label:  string;
  types:  TimberMember['type'][];
  hinweis: string;
}

const STEP_ORDER: StepDef[] = [
  {
    label:  'Schwellen & Rähme verlegen',
    types:  ['rahm'],
    hinweis: 'Schwellen auf Ankerbolzen oder Schwellensicke, Wasserwaage, Abdichtungsstreifen prüfen.',
  },
  {
    label:  'Stützen aufstellen',
    types:  ['stuetze'],
    hinweis: 'Stützen lotrecht ausrichten, Hilfsstützen vorhalten, Fußpunkte sofort sichern.',
  },
  {
    label:  'Pfetten auflegen',
    types:  ['pfette'],
    hinweis: 'Pfetten von unten nach oben (Fußpfette → Mittelpfette → Firstpfette), Lage mit Schnur kontrollieren.',
  },
  {
    label:  'Leimbinder / BSH-Hauptträger einbauen',
    types:  ['leimbinder'],
    hinweis: 'Kran oder Teleskop-Stapler erforderlich. Binderabstand kontrollieren, sofort ausstreben.',
  },
  {
    label:  'Sparren aufstellen',
    types:  ['sparren'],
    hinweis: 'Paarweise von Traufe zu First. Erste Sparrenlage als Schablone nutzen. Firstsparren zuerst.',
  },
  {
    label:  'Kehlbalken & Zangen montieren',
    types:  ['kehlbalken', 'zange'],
    hinweis: 'Kehlbalken nach Einbau der Sparren, Zangen beidseitig, Schraubenabstand lt. Statik einhalten.',
  },
  {
    label:  'Auswechslungen & Nebenträger',
    types:  ['auswechslung', 'nebentraeger'],
    hinweis: 'Öffnungen für Dachfenster, Gauben oder Kamine. Auswechslung vor Schalkopf-Abschluss.',
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Erstellt Montage-Reihenfolge aus TimberMember-Liste.
 * Leere Schritte (keine passenden Bauteile) werden ausgelassen.
 */
export function montageReihenfolge(members: TimberMember[]): MontageSchritt[] {
  const schritte: MontageSchritt[] = [];
  let reihenfolge = 1;

  for (const step of STEP_ORDER) {
    const bauteile = members.filter(m => step.types.includes(m.type));
    if (bauteile.length === 0) continue;

    const dauer = bauteile.reduce((sum, m) => sum + durationPerPiece(m) * m.quantity, 0);
    const kranNoetig = bauteile.some(needsCrane);

    schritte.push({
      reihenfolge: reihenfolge++,
      label:       step.label,
      bauteile,
      dauer_h:     +dauer.toFixed(1),
      kran_noetig: kranNoetig,
      hinweis:     step.hinweis,
    });
  }

  return schritte;
}

/** Gesamtdauer aller Schritte (Summe) */
export function gesamtdauer(schritte: MontageSchritt[]): number {
  return +schritte.reduce((s, sc) => s + sc.dauer_h, 0).toFixed(1);
}
