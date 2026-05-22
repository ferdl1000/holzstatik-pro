/**
 * autoDerive.ts
 *
 * Füllt fehlende oder ungültige Geometriewerte aus dem Vorhandenen auf,
 * sodass die Folge-Pipeline ohne User-Eingabe funktioniert.
 *
 * Schritt 0: sanitizeGeometry() — bereinigt NaN/negative/fehlende Werte
 * Schritt 1: autoDeriveGeometry() — berechnet abgeleitete Größen (Neigung↔First)
 */

import type { BuildingGeometry, NumberWithConfidence, RoofType } from '@/types/project';
import type { AutoAssumption, DerivedGeometry } from '@/lib/auto/contracts';
import { sanitizeGeometry } from '@/lib/auto/sanitize';

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
  return n !== undefined && Number.isFinite(n.value) && n.value > 0;
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
  // ── Schritt 0: Sanitize (NaN, negative, fehlende Werte, Tausch First/Traufe) ──
  const sanitized = sanitizeGeometry(geometry);
  const assumptions: AutoAssumption[] = [...sanitized.assumptions];

  // Nach sanitize ist geometry immer vollständig befüllt
  const sanitizedGeom = sanitized.geometry;

  // ── Tiefe Kopie der bereinigten Eingabe ─────────────────────────────────
  const g: BuildingGeometry = {
    ...sanitizedGeom,
    length:      { ...sanitizedGeom.length },
    width:       { ...sanitizedGeom.width },
    ridgeHeight: { ...sanitizedGeom.ridgeHeight },
    eavesHeight: { ...sanitizedGeom.eavesHeight },
    roofPitch:   { ...sanitizedGeom.roofPitch },
    spans: [...(sanitizedGeom.spans ?? [])],
    axes:  [...(sanitizedGeom.axes  ?? [])],
  };

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
