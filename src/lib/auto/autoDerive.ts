/**
 * autoDerive.ts
 *
 * Füllt fehlende oder ungültige Geometriewerte aus dem Vorhandenen auf,
 * sodass die Folge-Pipeline ohne User-Eingabe funktioniert.
 */

import type { BuildingGeometry, NumberWithConfidence, RoofType } from '@/types/project';
import type { AutoAssumption, DerivedGeometry } from '@/lib/auto/contracts';

// ────────────────────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ────────────────────────────────────────────────────────────────────────────

function nwc(
  value: number,
  unit: string,
  source: NumberWithConfidence['source'],
  confidence = 0.7,
): NumberWithConfidence {
  return { value, unit, confidence, source };
}

function isValid(n: NumberWithConfidence | undefined): boolean {
  return n !== undefined && n.value > 0;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ────────────────────────────────────────────────────────────────────────────
// Haupt-Export
// ────────────────────────────────────────────────────────────────────────────

export function autoDeriveGeometry(
  geometry: BuildingGeometry | undefined,
  _roofType?: RoofType,
): DerivedGeometry {
  const assumptions: AutoAssumption[] = [];

  // ── Vollständige Fallback-Geometrie ──────────────────────────────────────
  if (!geometry) {
    assumptions.push({
      field: 'geometry',
      value: 'Satteldach 30°, 8 m × 12 m, Traufe 4.5 m',
      reason: 'Keine Geometrie aus Planextraktion vorhanden — vollständiger Default verwendet.',
      source: 'fallback',
    });

    const defaultRidgeHeight = 4.5 + Math.tan(degToRad(30)) * (8 / 2); // ≈ 6.81 m
    const derived: BuildingGeometry = {
      length: nwc(12.0, 'm', 'assumed', 0.3),
      width: nwc(8.0, 'm', 'assumed', 0.3),
      ridgeHeight: nwc(defaultRidgeHeight, 'm', 'assumed', 0.3),
      eavesHeight: nwc(4.5, 'm', 'assumed', 0.3),
      roofPitch: nwc(30, '°', 'assumed', 0.3),
      spans: [],
      axes: [],
      isSymmetric: true,
      confidence: 0.3,
      userConfirmed: false,
    };
    return { geometry: derived, assumptions };
  }

  // ── Tiefe Kopie der Eingabe ──────────────────────────────────────────────
  const g: BuildingGeometry = {
    ...geometry,
    length: { ...geometry.length },
    width: { ...geometry.width },
    ridgeHeight: { ...geometry.ridgeHeight },
    eavesHeight: { ...geometry.eavesHeight },
    roofPitch: { ...geometry.roofPitch },
    spans: [...(geometry.spans ?? [])],
    axes: [...(geometry.axes ?? [])],
  };

  // ── Traufe (eavesHeight) ─────────────────────────────────────────────────
  if (!isValid(g.eavesHeight)) {
    g.eavesHeight = nwc(3.0, 'm', 'assumed', 0.5);
    assumptions.push({
      field: 'eavesHeight',
      value: 3.0,
      reason: 'Traufhöhe fehlt — Standard-Geschosshöhe 3.0 m angenommen.',
      source: 'default',
    });
  }

  // ── Breite (width) ───────────────────────────────────────────────────────
  if (!isValid(g.width)) {
    g.width = nwc(8.0, 'm', 'assumed', 0.4);
    assumptions.push({
      field: 'width',
      value: 8.0,
      reason: 'Gebäudebreite fehlt — Standardbreite 8.0 m angenommen.',
      source: 'default',
    });
  }

  // ── Länge (length) ───────────────────────────────────────────────────────
  if (!isValid(g.length)) {
    g.length = nwc(12.0, 'm', 'assumed', 0.4);
    assumptions.push({
      field: 'length',
      value: 12.0,
      reason: 'Gebäudelänge fehlt — Standardlänge 12.0 m angenommen.',
      source: 'default',
    });
  }

  const halfWidth = g.width.value / 2;
  const eaves = g.eavesHeight.value;

  // ── Dachneigung + First: alle vier Kombinationen ─────────────────────────

  const hasPitch = isValid(g.roofPitch);
  const hasRidge = isValid(g.ridgeHeight);

  if (!hasPitch && !hasRidge) {
    // Nichts da → Default 30°
    const pitch = 30;
    const ridge = eaves + Math.tan(degToRad(pitch)) * halfWidth;

    g.roofPitch = nwc(pitch, '°', 'assumed', 0.4);
    g.ridgeHeight = nwc(ridge, 'm', 'assumed', 0.4);

    assumptions.push({
      field: 'roofPitch',
      value: pitch,
      reason: 'Dachneigung weder im Plan vorhanden noch ableitbar — Default 30° angenommen.',
      source: 'default',
    });
    assumptions.push({
      field: 'ridgeHeight',
      value: +ridge.toFixed(3),
      reason: `Firsthöhe aus Default-Neigung 30° und Traufe ${eaves} m berechnet.`,
      source: 'derived',
    });
  } else if (!hasPitch && hasRidge) {
    // First bekannt, Neigung fehlt → ableiten
    const ridgeHeight = g.ridgeHeight.value;
    const pitch = radToDeg(Math.atan2(ridgeHeight - eaves, halfWidth));

    g.roofPitch = nwc(+pitch.toFixed(2), '°', 'calculated', 0.75);

    assumptions.push({
      field: 'roofPitch',
      value: +pitch.toFixed(2),
      reason: `Dachneigung berechnet aus First (${ridgeHeight} m), Traufe (${eaves} m) und halber Breite (${halfWidth} m).`,
      source: 'derived',
    });
  } else if (hasPitch && !hasRidge) {
    // Neigung bekannt, First fehlt → berechnen
    const pitch = g.roofPitch.value;
    const ridge = eaves + Math.tan(degToRad(pitch)) * halfWidth;

    g.ridgeHeight = nwc(+ridge.toFixed(3), 'm', 'calculated', 0.75);

    assumptions.push({
      field: 'ridgeHeight',
      value: +ridge.toFixed(3),
      reason: `Firsthöhe berechnet aus Neigung ${pitch}°, Traufe ${eaves} m und halber Breite ${halfWidth} m.`,
      source: 'derived',
    });
  }
  // else: beide vorhanden → nichts zu tun

  // ── Konsistenz-Clamp: First ≥ Traufe ────────────────────────────────────
  if (g.ridgeHeight.value < g.eavesHeight.value) {
    const corrected = g.eavesHeight.value + 0.5;
    g.ridgeHeight = nwc(corrected, 'm', 'assumed', 0.3);
    assumptions.push({
      field: 'ridgeHeight',
      value: corrected,
      reason: `Firsthöhe war kleiner als Traufe — auf Traufe + 0.5 m korrigiert.`,
      source: 'fallback',
    });
  }

  return { geometry: g, assumptions };
}
