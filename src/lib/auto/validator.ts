/**
 * Plausibilitäts-Validator für AutoPipelineResult.
 * Erkennt inkonsistente / unplausible Werte und korrigiert automatisch.
 * Läuft als Loop bis alles konsistent oder max 3 Iterationen.
 */

import type { Project, BuildingGeometry } from '@/types/project';
import type { RoofPart } from '@/types/roofParts';
import type { AutoAssumption } from './contracts';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  corrections: AutoAssumption[];
  correctedGeometry?: BuildingGeometry;
  correctedRoofParts?: RoofPart[];
}

/** Hauptvalidator — prüft + korrigiert alle Werte */
export function validateAndCorrect(
  project: Project,
  geometry: BuildingGeometry,
  roofParts?: RoofPart[],
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const corrections: AutoAssumption[] = [];
  let correctedGeom = { ...geometry };
  let correctedRoofParts = roofParts ? roofParts.map(rp => ({
    ...rp,
    geometry: { ...rp.geometry },
  })) : undefined;

  // === CHECK 1: pitch vs dn_markers ===
  // Wenn project._extracted.dn_markers vorhanden, ist der korrekte Wert dort
  const extracted = (project as any)._extracted;
  if (extracted?.dn_markers && Array.isArray(extracted.dn_markers) && extracted.dn_markers.length > 0) {
    const validMarkers = extracted.dn_markers.filter(
      (m: any) => typeof m.value === 'number' && m.value > 0 && m.value < 90,
    );
    if (validMarkers.length > 0) {
      // Pro RoofPart: DN-Marker zuordnen
      if (correctedRoofParts) {
        correctedRoofParts.forEach((rp, idx) => {
          const marker =
            validMarkers.find((m: any) => m.near_roofpart_index === idx) ??
            (idx === 0 ? validMarkers[0] : null);
          if (marker && Math.abs(rp.geometry.pitch - marker.value) > 1) {
            const oldP = rp.geometry.pitch;
            rp.geometry.pitch = marker.value;
            corrections.push({
              field: `roofParts[${idx}].pitch`,
              value: marker.value,
              reason: `Korrektur: pitch ${oldP}° → ${marker.value}° (DN-Marker '${marker.evidence ?? marker.value + '°'}' hat Vorrang vor berechnetem Wert)`,
              source: 'derived',
            });
          }
        });
      }
      // Auch in geometry: erster DN-Marker
      const primary = validMarkers[0];
      if (Math.abs(correctedGeom.roofPitch.value - primary.value) > 1) {
        corrections.push({
          field: 'geometry.roofPitch',
          value: primary.value,
          reason: `Korrektur: Dachneigung ${correctedGeom.roofPitch.value}° → ${primary.value}° aus DN-Marker im Plan.`,
          source: 'derived',
        });
        correctedGeom = {
          ...correctedGeom,
          roofPitch: { ...correctedGeom.roofPitch, value: primary.value, confidence: 0.95 },
        };
      }
    }
  }

  // === CHECK 2: pitch vs Höhen-Geometrie ===
  // pitch_berechnet = atan((ridge - eaves) / (width/2))
  // Wenn pitch_aus_DN davon stark abweicht: Höhen sind möglicherweise falsch
  const halfWidth = correctedGeom.width.value / 2;
  const rise = correctedGeom.ridgeHeight.value - correctedGeom.eavesHeight.value;
  if (halfWidth > 0 && rise > 0) {
    const computed = (Math.atan2(rise, halfWidth) * 180) / Math.PI;
    const actual = correctedGeom.roofPitch.value;
    if (Math.abs(computed - actual) > 5) {
      issues.push({
        severity: 'warning',
        field: 'pitch_vs_height',
        message:
          `Dachneigung ${actual}° passt nicht zu Höhen-Geometrie ` +
          `(berechnet aus First/Trauf/Breite wären ${computed.toFixed(0)}°). ` +
          `Möglicherweise sind Höhen unkorrekt oder Pultdach (nicht Satteldach).`,
      });
    }
  }

  // === CHECK 3: Pultdach-Erkennung ===
  // Wenn pitch < 12° UND form='satteldach' → wahrscheinlich Pultdach
  // Ein echtes Satteldach hat typischerweise > 12°; unter 12° ist Pultdach wahrscheinlicher
  const isLowPitch = correctedGeom.roofPitch.value < 12 && correctedGeom.roofPitch.value > 0;
  const mainPart = correctedRoofParts?.find(rp => rp.kind === 'main');
  if (isLowPitch && mainPart && mainPart.form === 'satteldach') {
    issues.push({
      severity: 'warning',
      field: 'form',
      message: `Dachneigung ${correctedGeom.roofPitch.value}° < 12° — vermutlich Pultdach, nicht Satteldach.`,
    });
    // Automatische Korrektur: pitch < 12° mit satteldach ist fast immer ein Erkennungsfehler
    // Pultdach-Hint aus Plan ODER automatisch bei pitch < 12°
    const hasPultdachHint =
      extracted?.roofHints?.form === 'pultdach' ||
      (extracted?.roofParts as Array<any> | undefined)?.some?.((r: any) => r.form === 'pultdach') ||
      correctedGeom.roofPitch.value < 12; // automatisch bei sehr flachen Dächern
    if (hasPultdachHint) {
      const oldForm = mainPart.form;
      mainPart.form = 'pultdach';
      corrections.push({
        field: 'roofParts[0].form',
        value: 'pultdach',
        reason: `Korrektur: form ${oldForm} → pultdach (pitch ${correctedGeom.roofPitch.value}° < 12° passt nicht zu Satteldach).`,
        source: 'derived',
      });
    }
  }

  // === CHECK 4: Spannweite plausibel ===
  if (correctedGeom.width.value > 50 || correctedGeom.length.value > 100) {
    issues.push({
      severity: 'error',
      field: 'dimensions',
      message: `Außenmaß ${correctedGeom.length.value}×${correctedGeom.width.value} m unrealistisch.`,
    });
  }
  if (correctedGeom.width.value < 2 || correctedGeom.length.value < 2) {
    issues.push({
      severity: 'error',
      field: 'dimensions',
      message:
        `Außenmaß ${correctedGeom.length.value}×${correctedGeom.width.value} m zu klein — ` +
        `möglicherweise Maßeinheit-Fehler (cm statt m).`,
    });
    // Auto-Korrektur: ×100 wenn Werte zu klein
    if (correctedGeom.width.value < 2 && correctedGeom.width.value > 0.01) {
      const oldW = correctedGeom.width.value;
      correctedGeom = {
        ...correctedGeom,
        width: { ...correctedGeom.width, value: oldW * 100, confidence: 0.5 },
      };
      corrections.push({
        field: 'geometry.width',
        value: oldW * 100,
        reason: `Auto-Korrektur: Breite ${oldW}m → ${oldW * 100}m (vermutlich cm statt m).`,
        source: 'fallback',
      });
    }
  }

  return {
    isValid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    corrections,
    correctedGeometry: corrections.length > 0 ? correctedGeom : undefined,
    correctedRoofParts:
      corrections.length > 0 && correctedRoofParts ? correctedRoofParts : undefined,
  };
}

/**
 * Validation-Loop: führt validateAndCorrect bis zu maxIterations-mal aus.
 * Bricht ab sobald keine neuen Korrekturen mehr anfallen.
 * Gibt das finale (konsistente) Ergebnis zurück.
 */
export function validateLoop(
  project: Project,
  geometry: BuildingGeometry,
  roofParts: RoofPart[] | undefined,
  maxIterations = 3,
): {
  geometry: BuildingGeometry;
  roofParts: RoofPart[] | undefined;
  allCorrections: AutoAssumption[];
  allIssues: ValidationIssue[];
  iterations: number;
} {
  let currentGeom = geometry;
  let currentParts = roofParts;
  const allCorrections: AutoAssumption[] = [];
  const allIssues: ValidationIssue[] = [];
  let iterations = 0;

  for (let i = 0; i < maxIterations; i++) {
    iterations = i + 1;
    const result = validateAndCorrect(project, currentGeom, currentParts);
    allIssues.push(...result.issues);
    allCorrections.push(...result.corrections);

    if (result.corrections.length === 0) {
      // Keine Korrekturen mehr → konsistent
      break;
    }

    // Korrigierte Werte für nächste Iteration übernehmen
    if (result.correctedGeometry) currentGeom = result.correctedGeometry;
    if (result.correctedRoofParts) currentParts = result.correctedRoofParts;
  }

  return {
    geometry: currentGeom,
    roofParts: currentParts,
    allCorrections,
    allIssues,
    iterations,
  };
}
