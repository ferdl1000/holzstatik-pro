/**
 * Multi-Dachteil-Erweiterung des Project-Modells.
 *
 * Ein Bauwerk kann mehrere Dachteile haben:
 *  - Hauptdach (z.B. Satteldach)
 *  - Anbau-Dach (Pultdach an einer Seite, andere Höhe)
 *  - Vordach (z.B. über Eingang)
 *  - Gaube (Dachgaube auf Hauptdach)
 *  - Walm/Krüppelwalm-Teile
 *
 * Jeder Dachteil hat eigene Geometrie + Bauteile.
 * Die Bestellliste gruppiert nach `roofPartId`.
 */

import type { RoofFormType, TimberMember, BuildingGeometry } from './project';

export type RoofPartKind = 'main' | 'anbau' | 'vordach' | 'gaube' | 'carport' | 'andere';

export interface RoofPart {
  id: string;
  kind: RoofPartKind;
  /** Klartext, z.B. "Hauptdach", "Anbau Ost", "Vordach Eingang" */
  label: string;
  form: RoofFormType;
  /** Position des Dachteils relativ zum Hauptdach (m). 0/0 = Mittelpunkt Grundriss Hauptdach. */
  positionX: number;
  positionY: number;
  /** Lokale Geometrie dieses Teils */
  geometry: {
    length: number;        // m
    width: number;         // m
    ridgeHeight: number;   // m (relativ zur Bodenkante)
    eavesHeight: number;   // m
    pitch: number;         // Grad
    ridgeDirection: 'x' | 'y';
  };
  /** Bauteile dieses Dachteils (Sparren/Pfetten/Stützen) */
  members: TimberMember[];
  /** Konfidenz aus KI-Extraktion */
  confidence: number;
  /** Hinweise / Notizen */
  notes?: string;
}

/**
 * Helper um aus dem alten Single-Roof-Modell einen RoofPart zu machen.
 * Damit funktioniert die App rückwärtskompatibel.
 */
export function legacyToRoofPart(
  geometry: BuildingGeometry | undefined,
  form: RoofFormType,
  members: TimberMember[],
): RoofPart | null {
  if (!geometry) return null;
  return {
    id: 'main',
    kind: 'main',
    label: 'Hauptdach',
    form,
    positionX: 0,
    positionY: 0,
    geometry: {
      length: geometry.length.value,
      width: geometry.width.value,
      ridgeHeight: geometry.ridgeHeight.value,
      eavesHeight: geometry.eavesHeight.value,
      pitch: geometry.roofPitch.value,
      ridgeDirection: 'x',
    },
    members,
    confidence: geometry.confidence,
  };
}

/** Erweitert Project optional um roofParts (Backward-compatible) */
export interface ProjectRoofParts {
  roofParts?: RoofPart[];
}
