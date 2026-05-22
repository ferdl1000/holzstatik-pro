/**
 * Praxis-Standards für Holzbau Österreich.
 * Zentrale Datenbank für Standardlängen, Querschnittsreihen, Stoßstellen-Regeln.
 *
 * Wird vom Optimizer + Stoß-Generator + Cost-Estimator verwendet.
 */

import type { TimberMember } from '@/types/project';

// ─── Standard-Lieferlängen ─────────────────────────────────────────────────────

export interface StandardLengthRule {
  material: string;
  maxLength: number;     // m — wenn überschritten: Stoß nötig oder Sondertransport
  preferredLengths: number[]; // bevorzugte Längen in m
  transportNote?: string;
}

export const STANDARD_LENGTHS: StandardLengthRule[] = [
  // KVH: typisch 6m (kurz), 12m (mittel), 13m (max ohne Sondertransport)
  { material: 'C24',  maxLength: 13.0, preferredLengths: [4, 5, 6, 8, 10, 12, 13] },
  { material: 'C30',  maxLength: 13.0, preferredLengths: [4, 5, 6, 8, 10, 12, 13] },
  // KVH-Sicht
  { material: 'C24_Si', maxLength: 12.0, preferredLengths: [4, 5, 6, 8, 10, 12] },
  // BSH gerade: bis 18m Standard, bis 24m mit Sondertransport
  { material: 'GL24h', maxLength: 18.0, preferredLengths: [6, 8, 10, 12, 15, 18], transportNote: '>12m Sondertransport empfehlen' },
  { material: 'GL28h', maxLength: 24.0, preferredLengths: [8, 10, 12, 15, 18, 20, 24], transportNote: '>18m Sondertransport zwingend' },
  // BSH gebogen: bis ca. 30m am Stück möglich
  { material: 'GL28h_curved', maxLength: 30.0, preferredLengths: [15, 18, 20, 24, 27, 30], transportNote: 'Gebogene Träger >18m: Schwertransport' },
  // BSH Sattelträger
  { material: 'GL24h_pitched', maxLength: 22.0, preferredLengths: [10, 12, 15, 18, 22] },
];

export function lookupLengthRule(material: string): StandardLengthRule {
  return STANDARD_LENGTHS.find(r => r.material === material)
    || STANDARD_LENGTHS[0]; // default C24
}

// ─── Querschnitt-Reihen (kommerziell verfügbar) ────────────────────────────────

/** Übliche KVH-Querschnitte (b/h in mm). Sortiert nach Tragfähigkeit aufsteigend. */
export const KVH_PROFILES: Array<{ b: number; h: number; label: string }> = [
  { b: 60, h: 120,  label: '6/12'  },
  { b: 60, h: 140,  label: '6/14'  },
  { b: 60, h: 160,  label: '6/16'  },
  { b: 80, h: 140,  label: '8/14'  },
  { b: 80, h: 160,  label: '8/16'  },
  { b: 80, h: 180,  label: '8/18'  },
  { b: 80, h: 200,  label: '8/20'  },
  { b: 100, h: 200, label: '10/20' },
  { b: 100, h: 220, label: '10/22' },
  { b: 100, h: 240, label: '10/24' },
  { b: 100, h: 260, label: '10/26' },
  { b: 120, h: 240, label: '12/24' },
  { b: 120, h: 280, label: '12/28' },
  { b: 140, h: 240, label: '14/24' },
  { b: 160, h: 280, label: '16/28' },
];

/** BSH-Querschnitte (gestaffelt nach Lamellenzahl, h immer Vielfaches von 40mm). */
export const BSH_PROFILES: Array<{ b: number; h: number; label: string }> = [
  { b: 100, h: 200, label: '10/20' },
  { b: 100, h: 240, label: '10/24' },
  { b: 120, h: 280, label: '12/28' },
  { b: 120, h: 320, label: '12/32' },
  { b: 140, h: 360, label: '14/36' },
  { b: 160, h: 400, label: '16/40' },
  { b: 160, h: 480, label: '16/48' },
  { b: 160, h: 560, label: '16/56' },
  { b: 200, h: 600, label: '20/60' },
  { b: 200, h: 680, label: '20/68' },
  { b: 200, h: 760, label: '20/76' },
  { b: 240, h: 800, label: '24/80' },
  { b: 240, h: 880, label: '24/88' },
  { b: 240, h: 1000, label: '24/100' },
];

export function nextLargerProfile(
  current: { b: number; h: number },
  isBSH: boolean,
): { b: number; h: number; label: string } | null {
  const list = isBSH ? BSH_PROFILES : KVH_PROFILES;
  const currentArea = current.b * current.h;
  const next = list.find(p => p.b * p.h > currentArea);
  return next ?? null;
}

// ─── Stoßstellen-Logik ─────────────────────────────────────────────────────────

export interface JointSpec {
  position: number;     // m vom Anfang
  type: 'Stoß über Stütze' | 'Zapfenstoß' | 'Hakenblatt' | 'Schräger Schnitt mit Bolzen' | 'Lasche';
  notes: string;
  extraCost: number;    // EUR pauschal pro Stoß
}

/**
 * Berechnet Stoßstellen für einen langen Träger.
 * Stoßt bevorzugt über Stützen (wenn pos bekannt), sonst gleichmäßig verteilt.
 */
export function computeJoints(
  member: TimberMember,
  supportPositions?: number[],
): JointSpec[] {
  const rule = lookupLengthRule(member.material || 'C24');
  if (member.length <= rule.maxLength) return [];

  const nSegments = Math.ceil(member.length / rule.maxLength);
  const nJoints = nSegments - 1;

  const joints: JointSpec[] = [];

  // Wenn Stützenpositionen vorhanden: möglichst über Stützen stoßen
  if (supportPositions && supportPositions.length > 0) {
    const sorted = [...supportPositions].sort((a, b) => a - b);
    const idealSpacing = member.length / nSegments;
    for (let i = 1; i <= nJoints; i++) {
      const idealPos = i * idealSpacing;
      // nächste Stützenposition
      const closestSupport = sorted.reduce((prev, curr) =>
        Math.abs(curr - idealPos) < Math.abs(prev - idealPos) ? curr : prev,
      );
      joints.push({
        position: closestSupport,
        type: 'Stoß über Stütze',
        notes: `Stoß bei ${closestSupport.toFixed(2)} m (über Stütze). Aufgekämmt + 2 Bolzen M12, Stoßlasche aufgenagelt.`,
        extraCost: 45,
      });
    }
  } else {
    // Gleichmäßig verteilt
    const spacing = member.length / nSegments;
    for (let i = 1; i <= nJoints; i++) {
      joints.push({
        position: i * spacing,
        type: member.material?.includes('GL') ? 'Lasche' : 'Schräger Schnitt mit Bolzen',
        notes: `Stoß bei ${(i * spacing).toFixed(2)} m. ${member.material?.includes('GL') ? 'Stoßlasche Stahl beidseitig, 4×M16 vorgespannt.' : 'Schräge Schäftung 1:8 mit 2 Bolzen M12.'}`,
        extraCost: member.material?.includes('GL') ? 320 : 65,
      });
    }
  }

  return joints;
}

/**
 * Teilt einen Member in mehrere Member auf, sodass jeder ≤ maxLength.
 * Liefert die Liste der Segment-Member + die Joints zwischen ihnen.
 */
export function splitMemberAtJoints(
  member: TimberMember,
  supportPositions?: number[],
): { segments: TimberMember[]; joints: JointSpec[] } {
  const joints = computeJoints(member, supportPositions);
  if (joints.length === 0) {
    return { segments: [member], joints: [] };
  }
  const nSegments = joints.length + 1;
  const segLen = +(member.length / nSegments).toFixed(2);
  const segments: TimberMember[] = [];
  for (let i = 0; i < nSegments; i++) {
    segments.push({
      ...member,
      id: `${member.id}-S${i + 1}`,
      name: `${member.name} (Stoß ${i + 1}/${nSegments})`,
      length: segLen,
      quantity: member.quantity,
    });
  }
  return { segments, joints };
}

// ─── Stiegen/Decken (Holzbalkendecken-Erkennung) ───────────────────────────────

export interface CeilingSpec {
  /** Spannweite der Decke in m */
  span: number;
  /** Decken-Auflagerfläche in m² */
  area: number;
  /** Nutzungsklasse */
  nutzung: 'Wohnen' | 'Lager' | 'Versammlung' | 'Spitzboden';
}

/** Decken-Standard-Querschnitt aus Spannweite (KVH C24) */
export function suggestCeilingBeam(spec: CeilingSpec): { b: number; h: number; spacing: number } {
  // Daumenregel: h = span/17 (Wohnen), span/15 (Versammlung)
  const ratio = spec.nutzung === 'Versammlung' ? 15 : spec.nutzung === 'Spitzboden' ? 20 : 17;
  const hRaw = (spec.span * 1000) / ratio;
  const profile = KVH_PROFILES.find(p => p.h >= hRaw) || KVH_PROFILES[KVH_PROFILES.length - 1];
  return { b: profile.b, h: profile.h, spacing: 0.8 }; // 80cm Standardabstand
}

// ─── Verschalung / Staffel / Lattung (Standard-Aufbau) ────────────────────────

export interface DeckPlankSpec {
  /** Bauteil-Name in der Bestellliste */
  name: string;
  /** Querschnitt b/h in mm */
  b: number;
  h: number;
  /** Verbrauch pro m² Dachfläche (lfm/m²) */
  lfmPerM2: number;
  /** Material */
  material: 'C24' | 'Fichte_unbehandelt';
  /** Hinweis */
  description: string;
}

export const DECK_PLANKS: DeckPlankSpec[] = [
  { name: 'Konterlattung 30/50',           b: 30, h: 50, lfmPerM2: 1.25, material: 'Fichte_unbehandelt',
    description: 'Konterlattung längs auf Sparren, Standardabstand 80 cm' },
  { name: 'Dachlattung 30/50',             b: 30, h: 50, lfmPerM2: 3.0,  material: 'Fichte_unbehandelt',
    description: 'Dachlattung quer auf Konterlattung, Lattenabstand nach Ziegelhersteller' },
  { name: 'Schalung 24 mm Brettschalung',  b: 240, h: 24, lfmPerM2: 0,   material: 'Fichte_unbehandelt',
    description: 'Vollschalung als Steifigkeitsebene oder unter Blechdach (Stk. = m² Dachfläche)' },
];

/** Empfiehlt Verschalungs-Aufbau abhängig von Dachform & Tragsystem */
export function suggestDeckPlanks(
  roofForm: string,
  hasLeimbinder: boolean,
): DeckPlankSpec[] {
  // Bei Hallen (Leimbinder + Pfetten) braucht es typisch NUR die Schalung/Lattung quer auf den Pfetten
  if (hasLeimbinder) {
    return [DECK_PLANKS[1]]; // nur Lattung
  }
  // Klassisch (Pfettendach / Sparrendach): volle Aufbauten
  if (roofForm === 'flachdach') {
    return [DECK_PLANKS[2]]; // Schalung
  }
  return [DECK_PLANKS[0], DECK_PLANKS[1]]; // Konter + Lattung
}

// ─── Zwischensteher / Zwischenstützen ──────────────────────────────────────────

/** Berechnet ob Zwischensteher zwischen Mittelpfette und Firstpfette nötig sind */
export function needsIntermediateStuetzen(
  spanMM: number,
  sparrenH_mm: number,
): { needed: boolean; positionRatio: number; reason: string } {
  // Wenn Sparrenabstand zwischen Auflagern > 3.5 m UND Sparrenhöhe nicht > 240 mm
  // → Zwischensteher in der Sparrenmitte als zusätzliche Auflagerung empfohlen
  const spanM = spanMM / 1000;
  if (spanM > 3.5 && sparrenH_mm <= 240) {
    return { needed: true, positionRatio: 0.5,
      reason: `Sparrenstützweite ${spanM.toFixed(2)} m > 3,5 m bei Sparrenhöhe ${sparrenH_mm} mm — Zwischensteher in der Mitte empfohlen.` };
  }
  return { needed: false, positionRatio: 0, reason: 'Keine Zwischensteher nötig.' };
}

// ─── Transport-Limits Österreich ───────────────────────────────────────────────

/**
 * Transport-Limits für Holzbau-Lieferungen in Österreich.
 * Wichtig für Fertigteil-Aufteilung von Hallen-Bindern + langen BSH-Trägern.
 *
 * Quellen: § 4 StVO-Richtlinien (allgemeine Maße) und VbF (Sondertransport-Bewilligung).
 */
export const TRANSPORT_LIMITS = {
  /** Allgemeiner LKW ohne Sondergenehmigung */
  standard:    { maxLength: 13.6, maxWidth: 2.55, maxHeight: 4.0, maxWeight_kg: 40000,
                 note: 'Standard-LKW (Sattelzug) — keine Sondergenehmigung nötig.' },
  /** Mittlerer Sondertransport (Tieflader, halbe Behördenbewilligung) */
  oversize_S:  { maxLength: 18.0, maxWidth: 3.0,  maxHeight: 4.3, maxWeight_kg: 50000,
                 note: 'Sondertransport S — Anzeige + Begleitfahrzeug bei Bedarf.' },
  /** Großer Sondertransport (Tiefbett, Police-Eskorte, kostenintensiv) */
  oversize_L:  { maxLength: 25.0, maxWidth: 3.5,  maxHeight: 4.5, maxWeight_kg: 80000,
                 note: 'Sondertransport L — Genehmigung der ASFINAG, ggf. Polizei-Eskorte.' },
  /** XXL-Schwertransport (sehr aufwendig) */
  oversize_XL: { maxLength: 30.0, maxWidth: 4.0,  maxHeight: 4.5, maxWeight_kg: 120000,
                 note: 'Schwertransport XL — Wochenend-Genehmigung, Eskorte, hohe Mehrkosten (€ 2-5k).' },
} as const;

export interface TransportSegment {
  segmentIndex: number;       // 1, 2, 3 ...
  length_m: number;
  width_m: number;
  height_m: number;
  category: 'standard' | 'oversize_S' | 'oversize_L' | 'oversize_XL';
  note: string;
  extraCost: number;          // pauschale Mehrkosten in EUR
}

/**
 * Bestimmt Transport-Kategorie aus Bauteil-Maßen.
 */
export function transportCategoryFor(member: TimberMember): TransportSegment['category'] {
  const l = member.length;
  const w_m = member.width / 1000;
  const h_m = member.height / 1000;

  if (l <= TRANSPORT_LIMITS.standard.maxLength && w_m <= TRANSPORT_LIMITS.standard.maxWidth) return 'standard';
  if (l <= TRANSPORT_LIMITS.oversize_S.maxLength) return 'oversize_S';
  if (l <= TRANSPORT_LIMITS.oversize_L.maxLength) return 'oversize_L';
  return 'oversize_XL';
}

/**
 * Erzeugt eine Transport-Übersicht für eine Bauteil-Liste.
 * Gruppiert nach Kategorie, addiert Mehrkosten.
 */
export interface TransportPlan {
  segments: TransportSegment[];
  totalExtraCost: number;
  summary: string;
}

export function computeTransportPlan(members: TimberMember[]): TransportPlan {
  const segments: TransportSegment[] = [];
  const costByCat: Record<TransportSegment['category'], { count: number; cost: number }> = {
    standard:    { count: 0, cost: 0 },
    oversize_S:  { count: 0, cost: 0 },
    oversize_L:  { count: 0, cost: 0 },
    oversize_XL: { count: 0, cost: 0 },
  };

  members.forEach((m, idx) => {
    const cat = transportCategoryFor(m);
    const extra = cat === 'standard' ? 0
      : cat === 'oversize_S' ? 250
      : cat === 'oversize_L' ? 1200
      : 3500;
    costByCat[cat].count++;
    costByCat[cat].cost += extra;
    if (cat !== 'standard') {
      segments.push({
        segmentIndex: idx + 1,
        length_m: m.length,
        width_m: m.width / 1000,
        height_m: m.height / 1000,
        category: cat,
        note: `${m.name} (${m.length.toFixed(1)} m) → ${TRANSPORT_LIMITS[cat].note}`,
        extraCost: extra,
      });
    }
  });

  const totalExtra = segments.reduce((s, seg) => s + seg.extraCost, 0);
  const summary = `Transport: ${costByCat.standard.count} Standard-LKW, ` +
    `${costByCat.oversize_S.count} Sondertransport S, ` +
    `${costByCat.oversize_L.count} Sondertransport L, ` +
    `${costByCat.oversize_XL.count} Schwertransport XL. ` +
    `Mehrkosten: ${totalExtra.toLocaleString('de-AT')} €.`;

  return { segments, totalExtraCost: totalExtra, summary };
}
