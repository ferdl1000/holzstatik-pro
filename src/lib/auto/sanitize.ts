/**
 * sanitize.ts
 *
 * Bereinigt rohe (KI-extrahierte) Geometrie- und Systemwerte bevor die
 * autoPipeline weiterarbeitet. Alle Korrekturen werden als AutoAssumption
 * mit source='fallback' protokolliert — keine stille Korrektur.
 */

import type { BuildingGeometry, NumberWithConfidence, RoofFormType, StructuralSystemType } from '@/types/project';
import type { AutoAssumption } from '@/lib/auto/contracts';

// ── EFH-Defaults ─────────────────────────────────────────────────────────────
export const EFH_DEFAULTS = {
  length: 12.0,
  width: 9.0,
  eavesHeight: 4.5,
  ridgeHeight: 6.5,
  roofPitch: 30,
} as const;

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function nwc(
  value: number,
  unit: string,
  confidence = 0.3,
): NumberWithConfidence {
  return { value, unit, confidence, source: 'assumed' };
}

/** Prüft ob ein Wert nutzbar ist (nicht NaN, nicht Infinity, positiv) */
function isUsable(n: NumberWithConfidence | undefined): boolean {
  if (!n) return false;
  const v = n.value;
  return Number.isFinite(v) && v > 0;
}

/** Erzeugt einen Fallback-Assumption-Eintrag */
function warn(
  field: string,
  value: number | string,
  reason: string,
): AutoAssumption {
  return { field, value, reason, source: 'fallback' };
}

// ── Hauptexport ───────────────────────────────────────────────────────────────

export interface SanitizeGeometryResult {
  geometry: BuildingGeometry;
  assumptions: AutoAssumption[];
}

/**
 * Bereinigt eine (möglicherweise unvollständige) BuildingGeometry.
 * Gibt immer eine vollständige, plausible Geometrie zurück.
 */
export function sanitizeGeometry(
  g: Partial<BuildingGeometry> | undefined,
): SanitizeGeometryResult {
  const assumptions: AutoAssumption[] = [];

  // ── Fall 1: Geometrie komplett leer ─────────────────────────────────────
  if (!g) {
    assumptions.push(warn(
      'geometry',
      `${EFH_DEFAULTS.length}m × ${EFH_DEFAULTS.width}m`,
      `Keine Geometrie vorhanden — Einfamilienhaus-Defaults verwendet ` +
      `(${EFH_DEFAULTS.length} m × ${EFH_DEFAULTS.width} m, Traufe ${EFH_DEFAULTS.eavesHeight} m, First ${EFH_DEFAULTS.ridgeHeight} m, ${EFH_DEFAULTS.roofPitch}°).`,
    ));
    return {
      geometry: buildFullDefault(),
      assumptions,
    };
  }

  // ── Tiefe Kopie (mit undefined-sicheren Feldern) ─────────────────────────
  const out: BuildingGeometry = {
    length:      g.length      ? { ...g.length }      : nwc(0, 'm'),
    width:       g.width       ? { ...g.width }        : nwc(0, 'm'),
    ridgeHeight: g.ridgeHeight ? { ...g.ridgeHeight }  : nwc(0, 'm'),
    eavesHeight: g.eavesHeight ? { ...g.eavesHeight }  : nwc(0, 'm'),
    roofPitch:   g.roofPitch   ? { ...g.roofPitch }    : nwc(0, '°'),
    spans:       [...(g.spans  ?? [])],
    axes:        [...(g.axes   ?? [])],
    isSymmetric: g.isSymmetric ?? true,
    confidence:  g.confidence  ?? 0.3,
    userConfirmed: g.userConfirmed ?? false,
  };

  // ── Negative / NaN / Infinity korrigieren ────────────────────────────────
  for (const key of ['length', 'width', 'ridgeHeight', 'eavesHeight', 'roofPitch'] as const) {
    const field = out[key] as NumberWithConfidence;
    if (!Number.isFinite(field.value) || field.value < 0) {
      const fallback = key === 'roofPitch' ? EFH_DEFAULTS.roofPitch
                     : key === 'length'    ? EFH_DEFAULTS.length
                     : key === 'width'     ? EFH_DEFAULTS.width
                     : key === 'eavesHeight' ? EFH_DEFAULTS.eavesHeight
                     : EFH_DEFAULTS.ridgeHeight;
      assumptions.push(warn(
        key,
        fallback,
        `Ungültiger Wert (${field.value}) für „${key}" — auf EFH-Default ${fallback} gesetzt.`,
      ));
      (out[key] as NumberWithConfidence) = nwc(fallback, field.unit);
    }
  }

  const hasLength = isUsable(out.length);
  const hasWidth  = isUsable(out.width);

  // ── Fall 2: Nur Länge bekannt → Breite = Länge × 0.6 ────────────────────
  if (hasLength && !hasWidth) {
    const derived = +(out.length.value * 0.6).toFixed(2);
    out.width = nwc(derived, 'm', 0.4);
    assumptions.push(warn(
      'width',
      derived,
      `Gebäudebreite fehlt, Länge ${out.length.value} m bekannt — Breite = Länge × 0,6 = ${derived} m (typisches EFH-Verhältnis).`,
    ));
  }

  // ── Fall 3: Nur Breite bekannt → Länge = Breite × 1.4 ───────────────────
  if (!hasLength && hasWidth) {
    const derived = +(out.width.value * 1.4).toFixed(2);
    out.length = nwc(derived, 'm', 0.4);
    assumptions.push(warn(
      'length',
      derived,
      `Gebäudelänge fehlt, Breite ${out.width.value} m bekannt — Länge = Breite × 1,4 = ${derived} m (typisches EFH-Verhältnis).`,
    ));
  }

  // ── Noch immer keine Länge/Breite → volle Defaults ──────────────────────
  if (!isUsable(out.length)) {
    out.length = nwc(EFH_DEFAULTS.length, 'm');
    assumptions.push(warn('length', EFH_DEFAULTS.length,
      `Gebäudelänge nicht ableitbar — EFH-Default ${EFH_DEFAULTS.length} m verwendet.`));
  }
  if (!isUsable(out.width)) {
    out.width = nwc(EFH_DEFAULTS.width, 'm');
    assumptions.push(warn('width', EFH_DEFAULTS.width,
      `Gebäudebreite nicht ableitbar — EFH-Default ${EFH_DEFAULTS.width} m verwendet.`));
  }

  // ── Traufe fehlt ─────────────────────────────────────────────────────────
  if (!isUsable(out.eavesHeight)) {
    out.eavesHeight = nwc(EFH_DEFAULTS.eavesHeight, 'm');
    assumptions.push(warn('eavesHeight', EFH_DEFAULTS.eavesHeight,
      `Traufhöhe fehlt — EFH-Default ${EFH_DEFAULTS.eavesHeight} m verwendet.`));
  }

  // ── Fall 4: First < Traufe → vertauschen + Warnung ───────────────────────
  if (isUsable(out.ridgeHeight) && out.ridgeHeight.value < out.eavesHeight.value) {
    const tmp = out.ridgeHeight.value;
    out.ridgeHeight = nwc(out.eavesHeight.value, 'm', 0.4);
    out.eavesHeight = nwc(tmp, 'm', 0.4);
    assumptions.push(warn(
      'ridgeHeight',
      out.ridgeHeight.value,
      `Firsthöhe (${tmp} m) < Traufhöhe (${out.eavesHeight.value} m) — Werte vertauscht (wahrscheinlicher Planfehler).`,
    ));
  }

  // ── Fall 5: Dachneigung = 0, aber Satteldach (oder kein Flachdach) ───────
  // Wird von autoDeriveGeometry weiterbehandelt; hier nur NaN/0 normieren
  if (out.roofPitch.value === 0 && isUsable(out.ridgeHeight)) {
    // Neigung aus First/Traufe/Breite berechnen — autoDeriveGeometry macht das
    // korrekt; hier nur Kennzeichnung damit autoDeriveGeometry den richtigen Pfad nimmt.
    // (roofPitch.value bleibt 0 → isValid() = false → autoDeriveGeometry leitet ab)
    out.roofPitch = { ...out.roofPitch, value: 0, source: 'assumed' };
  }

  // ── Fall 12/13: Spannweiten-Plausibilitätsprüfung ────────────────────────
  const width = out.width.value;
  if (isUsable(out.width)) {
    if (width > 50) {
      assumptions.push({
        field: 'width',
        value: width,
        reason: `Spannweite ${width} m ist ungewöhnlich groß (> 50 m). Bitte prüfen — Maßstabsfehler oder Sonderbau?`,
        source: 'fallback',
      });
    } else if (width < 2) {
      const corrected = +(width * 100).toFixed(1);
      assumptions.push(warn(
        'width',
        corrected,
        `Spannweite ${width} m < 2 m — möglicher Maßfehler (cm statt m?). Prüfe ob ${corrected} m gemeint ist.`,
      ));
      // Wert NICHT automatisch korrigieren (zu riskant), nur Warnung
    }
  }

  return { geometry: out, assumptions };
}

// ── Vollständige Default-Geometrie ───────────────────────────────────────────

function buildFullDefault(): BuildingGeometry {
  return {
    length:      nwc(EFH_DEFAULTS.length,      'm'),
    width:       nwc(EFH_DEFAULTS.width,        'm'),
    eavesHeight: nwc(EFH_DEFAULTS.eavesHeight,  'm'),
    ridgeHeight: nwc(EFH_DEFAULTS.ridgeHeight,  'm'),
    roofPitch:   nwc(EFH_DEFAULTS.roofPitch,    '°'),
    spans: [],
    axes: [],
    isSymmetric: true,
    confidence: 0.2,
    userConfirmed: false,
  };
}

// ── RoofType / StructuralSystem Sanitizer ─────────────────────────────────────

const VALID_ROOF_FORMS: RoofFormType[] = [
  'satteldach', 'pultdach', 'walmdach', 'krueppelwalmdach', 'flachdach', 'mischform',
];

const VALID_STRUCTURAL_SYSTEMS: StructuralSystemType[] = [
  'sparrendach', 'kehlbalkendach', 'pfettendach', 'pfettendach_mittelpfette',
  'leimbinder_haupttraeger', 'sonderfall',
];

export function sanitizeRoofForm(
  form: string | undefined,
): { form: RoofFormType; assumption?: AutoAssumption } {
  if (form && VALID_ROOF_FORMS.includes(form as RoofFormType)) {
    return { form: form as RoofFormType };
  }
  return {
    form: 'satteldach',
    assumption: warn(
      'roofType.form',
      'satteldach',
      `Unbekannte Dachform „${form ?? 'undefined'}" — Satteldach als häufigste Bauform angenommen.`,
    ),
  };
}

export function sanitizeStructuralSystemType(
  type: string | undefined,
): { type: StructuralSystemType; assumption?: AutoAssumption } {
  if (type && VALID_STRUCTURAL_SYSTEMS.includes(type as StructuralSystemType)) {
    return { type: type as StructuralSystemType };
  }
  return {
    type: 'pfettendach_mittelpfette',
    assumption: warn(
      'structuralSystem.type',
      'pfettendach_mittelpfette',
      `Unbekanntes Tragsystem „${type ?? 'undefined'}" — Pfettendach mit Mittelpfette angenommen.`,
    ),
  };
}
