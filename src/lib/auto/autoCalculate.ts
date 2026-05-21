/**
 * Automatische Querschnittsbemessung aller Bauteile.
 *
 * Für jedes TimberMember:
 *  - Lastermittlung (Linienlast q) abhängig von Bauteiltyp
 *  - Optimizer-Lauf → minimaler Querschnitt der alle Nachweise erfüllt
 *  - Stützen: direkt calculateColumn (Knicknachweis)
 *  - Leimbinder / Material enthält 'GL': optimizeGlulam
 *  - Sonst: optimizeBeam (KVH)
 *
 * Norm: EC5 / ÖNORM B 1995-1-1
 */

import type { TimberMember, BuildingGeometry } from '@/types/project';
import type { AutoCalculationResult, AutoAssumption } from './contracts';
import { optimizeBeam } from '@/lib/calc/timber/optimizer';
import { optimizeGlulam } from '@/lib/calc/timber/optimizer';
import { calculateColumn } from '@/lib/calc/timber/column';
import type { BeamInput } from '@/lib/calc/timber/beam';
import type { GlulamBeamInput } from '@/lib/calc/timber/glulam';

// ─── Typen ────────────────────────────────────────────────────────────────────

type MemberCalcEntry = AutoCalculationResult['members'][number];

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Parst Festigkeitsklasse aus Material-String.
 *  Unterstützt: 'C24', 'C30', 'GL24h', 'GL28h', 'KVH C24', 'BSH GL28h', ...
 */
function parseTimberClass(material: string, isGlulam: boolean): string {
  const upper = material.toUpperCase();
  // GL-Klassen explizit
  const glMatch = upper.match(/GL\s*(\d+)\s*([CH]?)/);
  if (glMatch) return `GL${glMatch[1]}${glMatch[2] || 'h'}`;
  // C-Klassen
  const cMatch = upper.match(/C\s*(\d+)/);
  if (cMatch) return `C${cMatch[1]}`;
  // Default nach Typ
  return isGlulam ? 'GL24h' : 'C24';
}

/** Entscheidet ob Material Brettschichtholz ist. */
function isGlulamMaterial(material: string): boolean {
  const u = material.toUpperCase();
  return u.includes('GL') || u.includes('BSH') || u.includes('LEIMBINDER') || u.includes('BRETTSCHICHT');
}

/** Gibt die Trägerstützweite in Metern zurück (Fallback auf geometrie-basierte Schätzung). */
function resolveSpan(member: TimberMember, geometry: BuildingGeometry): number {
  // Pfetten: member.length ist die Gesamtlänge der Pfette (= Gebäudelänge),
  // NICHT die statische Stützweite. Stützweite = Stützenabstand ≈ Gebäudelänge / Feldanzahl.
  if (member.type === 'pfette') {
    const buildingLen = geometry.length?.value ?? 21.8;
    const numBays = Math.max(1, Math.ceil(buildingLen / 4.0));
    return +(buildingLen / numBays).toFixed(2);
  }
  if (member.length > 0) return member.length;
  // Fallback aus Geometrie
  const halfWidth = (geometry.width?.value ?? 8) / 2;
  switch (member.type) {
    case 'sparren':    return Math.round((halfWidth / Math.cos(((geometry.roofPitch?.value ?? 35) * Math.PI) / 180)) * 10) / 10;
    case 'pfette':     return geometry.length?.value ?? 4;
    case 'kehlbalken': return halfWidth * 0.6;
    case 'leimbinder': return geometry.width?.value ?? 8;
    case 'stuetze':    return geometry.ridgeHeight?.value ?? 3;
    default:           return 4;
  }
}

/** Linienlast [kN/m] für einen Sparren (Eigengewicht + Schnee auf Schräge). */
function sparrenLoad(gk: number, sk: number, spacing: number, roofPitch: number): { qg: number; qs: number } {
  const alpha = (roofPitch * Math.PI) / 180;
  // Eigengewicht bezogen auf Dachfläche → Projektion auf Horizont: gk / cos(α) × spacing
  const qg = (gk / Math.cos(alpha)) * spacing;
  // Schneelast bereits horizontal (nach ÖNORM: auf Grundrissfläche)
  const qs = sk * spacing;
  return { qg, qs };
}

/** Linienlast [kN/m] für Pfetten.
 *
 *  Lasteinzugsbreite einer Mittelpfette = halbe Sparrenlänge oben + halbe Sparrenlänge unten
 *  = sparrenLaenge / 2 (bei symmetrischem Dach mit Pfette in Hälfte).
 *  Allgemeiner Fall: tributaryWidth = sparrenLaenge / 2.
 *
 *  NICHT: sparrenSpacing (Sparrenabstand), der senkrecht zur Last wirkt.
 */
function pfettenLoad(gk: number, sk: number, sparrenLaenge: number, _pfettenSpan: number): { qg: number; qs: number; tributaryWidth: number } {
  // Mittelpfette: trägt je halbe Sparrenlänge von oben und unten → gesamt sparrenLaenge/2
  const tributaryWidth = sparrenLaenge / 2;
  const qg = gk * tributaryWidth;
  const qs = sk * tributaryWidth;
  return { qg, qs, tributaryWidth };
}

/** Linienlast [kN/m] für Kehlbalken (Zugglied, vereinfacht: 50% Sparrenlast). */
function kehlbalkenLoad(gk: number, sk: number, spacing: number): { qg: number; qs: number } {
  // Kehlbalken wirkt hauptsächlich auf Zug, aber auch auf Querbiegung
  // Vereinfachung: 50% der Sparrenlast als Biegelast
  return {
    qg: 0.5 * gk * spacing,
    qs: 0.5 * sk * spacing,
  };
}

/** Linienlast [kN/m] für Leimbinder (trägt volles Lastfeld = pfettenSpan). */
function leimbinderLoad(gk: number, sk: number, pfettenSpan: number): { qg: number; qs: number } {
  return {
    qg: gk * pfettenSpan,
    qs: sk * pfettenSpan,
  };
}

/** Drucknormalkraft [kN] für Stütze (trägt halbe Pfettenspannweite × Belastung). */
function stutzeNormalForce(gk: number, sk: number, tributaryArea: number): number {
  const gGd = 1.35 * gk;
  const qSd = 1.5 * sk;
  return (gGd + qSd) * tributaryArea;
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────

export function autoCalculateAllMembers(
  members: TimberMember[],
  loads: { gk: number; sk: number },
  geometry: BuildingGeometry,
  sparrenSpacing: number,
): AutoCalculationResult {
  const assumptions: AutoAssumption[] = [];
  const resultMembers: MemberCalcEntry[] = [];
  const optimizedMembers: TimberMember[] = [];

  const roofPitch = geometry.roofPitch?.value ?? 35;
  const pfettenSpan = geometry.length?.value ?? 4;
  const buildingWidth = geometry.width?.value ?? 8;
  // Sparrenlänge (Schräge) = halbe Gebäudebreite / cos(α)
  const sparrenLaenge = (buildingWidth / 2) / Math.cos((roofPitch * Math.PI) / 180);

  assumptions.push({
    field: 'sparrenSpacing',
    value: sparrenSpacing,
    reason: `Sparrenabstand ${sparrenSpacing} m verwendet für Lastermittlung aller Bauteile`,
    source: 'derived',
  });
  assumptions.push({
    field: 'serviceClass',
    value: '1',
    reason: 'Nutzungsklasse 1 (überdacht, trocken) für alle Holzbauteile angenommen',
    source: 'standard',
  });
  assumptions.push({
    field: 'loadDuration',
    value: 'shortTerm',
    reason: 'Schneelast als kurzzeitig (shortTerm) klassifiziert – ungünstigste k_mod-Annahme',
    source: 'standard',
  });

  for (const member of members) {
    try {
      const span = resolveSpan(member, geometry);
      const useGlulam = isGlulamMaterial(member.material) || member.type === 'leimbinder';
      const timberClass = parseTimberClass(member.material, useGlulam);

      // ── Lasten je Bauteiltyp ───────────────────────────────────────────────
      let qg = 0;
      let qs = 0;
      let N_Ed = 0;
      let isColumn = false;

      switch (member.type) {
        case 'sparren': {
          const l = sparrenLoad(loads.gk, loads.sk, sparrenSpacing, roofPitch);
          qg = l.qg; qs = l.qs;
          assumptions.push({
            field: `${member.name}.last`,
            value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m`,
            reason: `Sparren: Last = (gk/cos(α) + sk) × Sparrenabstand ${sparrenSpacing} m`,
            source: 'derived',
          });
          break;
        }
        case 'pfette': {
          const l = pfettenLoad(loads.gk, loads.sk, sparrenLaenge, pfettenSpan);
          qg = l.qg; qs = l.qs;
          assumptions.push({
            field: `${member.name}.last`,
            value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m`,
            reason: `Pfette: Lasteinzugsbreite = sparrenLänge/2 = ${l.tributaryWidth.toFixed(2)} m (Mittelpfette, halbe Sparrenlänge je Seite)`,
            source: 'derived',
          });
          break;
        }
        case 'kehlbalken': {
          const l = kehlbalkenLoad(loads.gk, loads.sk, sparrenSpacing);
          qg = l.qg; qs = l.qs;
          assumptions.push({
            field: `${member.name}.last`,
            value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m`,
            reason: 'Kehlbalken: vereinfacht 50% der Sparrenlast als Querlast angenommen',
            source: 'derived',
          });
          break;
        }
        case 'leimbinder': {
          const l = leimbinderLoad(loads.gk, loads.sk, pfettenSpan);
          qg = l.qg; qs = l.qs;
          assumptions.push({
            field: `${member.name}.last`,
            value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m`,
            reason: `Leimbinder: Lasteinzugsbreite = Pfettenabstand ${pfettenSpan} m (volles Lastfeld)`,
            source: 'derived',
          });
          break;
        }
        case 'stuetze': {
          isColumn = true;
          // Tributarfläche: halbe Pfettenspannweite × Pfettenabstand
          const tribArea = (pfettenSpan / 2) * sparrenSpacing;
          N_Ed = stutzeNormalForce(loads.gk, loads.sk, tribArea);
          assumptions.push({
            field: `${member.name}.last`,
            value: `N_Ed=${N_Ed.toFixed(1)} kN`,
            reason: `Stütze: Tributarfläche = (pfettenSpan/2) × sparrenAbstand = ${tribArea.toFixed(2)} m², N_Ed aus ULS-Kombination`,
            source: 'derived',
          });
          break;
        }
        case 'zange':
        case 'rahm':
        case 'auswechslung':
        case 'nebentraeger': {
          // Generische Schätzung: Nebenträger trägt halbes Feld
          qg = loads.gk * sparrenSpacing * 0.5;
          qs = loads.sk * sparrenSpacing * 0.5;
          assumptions.push({
            field: `${member.name}.last`,
            value: `qg=${qg.toFixed(2)} kN/m, qs=${qs.toFixed(2)} kN/m`,
            reason: `${member.type}: vereinfacht 50% Sparrenlast als Nebenträger angenommen`,
            source: 'fallback',
          });
          break;
        }
        default: {
          qg = loads.gk * sparrenSpacing * 0.5;
          qs = loads.sk * sparrenSpacing * 0.5;
          break;
        }
      }

      // ── Bemessung ─────────────────────────────────────────────────────────

      if (isColumn) {
        // Stütze: direkter Knicknachweis mit vorhandenem Querschnitt
        const colB = member.width  > 0 ? member.width  : 120;
        const colH = member.height > 0 ? member.height : 160;
        const colClass = timberClass.startsWith('GL') ? timberClass : 'C24';

        const colResult = calculateColumn({
          height: span,
          b: colB,
          h: colH,
          timberClass: colClass,
          N_Ed,
          bucklingFactor: 1.0,
          duration: 'shortTerm',
          serviceClass: '1',
        });

        const entry: MemberCalcEntry = {
          member,
          section: { b: colB, h: colH, label: `${colB}/${colH} mm` },
          timberClass: colClass,
          maxUtilization: colResult.maxUtilization,
          overallStatus: colResult.overallStatus,
          summary: colResult.summary,
          checks: colResult.checks.map(c => ({
            name: c.name,
            utilization: c.utilization,
            status: c.status,
            explanation: c.explanation,
          })),
        };
        resultMembers.push(entry);

        optimizedMembers.push({
          ...member,
          width: colB,
          height: colH,
          calculationStatus: colResult.overallStatus,
        });

      } else if (useGlulam) {
        // Leimbinder: optimizeGlulam
        const shape: GlulamBeamInput['shape'] = span > 12 ? 'pitched' : 'straight';
        const glulamInput: Omit<GlulamBeamInput, 'b' | 'h' | 'timberClass'> & { preferredClasses?: string[] } = {
          type: 'leimbinder',
          span,
          qPermanent: qg,
          qVariable: qs,
          variableDuration: 'shortTerm',
          serviceClass: '1',
          shape,
          preferredClasses: ['GL24h', 'GL28h'],
        };

        const optResult = optimizeGlulam(glulamInput);

        const entry: MemberCalcEntry = {
          member,
          section: optResult.bestSection,
          timberClass: optResult.bestClass,
          maxUtilization: optResult.result.maxUtilization,
          overallStatus: optResult.result.overallStatus,
          summary: optResult.reasoning,
          checks: optResult.result.checks.map(c => ({
            name: c.name,
            utilization: c.utilization,
            status: c.status,
            explanation: c.explanation,
          })),
        };
        resultMembers.push(entry);

        optimizedMembers.push({
          ...member,
          width: optResult.bestSection.b,
          height: optResult.bestSection.h,
          crossSection: optResult.bestSection.label,
          material: optResult.bestClass,
          calculationStatus: optResult.result.overallStatus,
        });

      } else {
        // KVH / Vollholz: optimizeBeam
        const beamType = (
          member.type === 'sparren'    ? 'sparren'    :
          member.type === 'pfette'     ? 'pfette'     :
          member.type === 'kehlbalken' ? 'kehlbalken' :
          'nebentraeger'
        ) as BeamInput['type'];

        const beamInput: Omit<BeamInput, 'b' | 'h' | 'timberClass'> & { preferredClasses?: string[] } = {
          type: beamType,
          span,
          qPermanent: qg,
          qVariable: qs,
          variableDuration: 'shortTerm',
          serviceClass: '1',
          preferredClasses: ['C24', 'C30'],
        };

        const optResult = optimizeBeam(beamInput);

        const entry: MemberCalcEntry = {
          member,
          section: optResult.bestSection,
          timberClass: optResult.bestClass,
          maxUtilization: optResult.result.maxUtilization,
          overallStatus: optResult.result.overallStatus,
          summary: optResult.reasoning,
          checks: optResult.result.checks.map(c => ({
            name: c.name,
            utilization: c.utilization,
            status: c.status,
            explanation: c.explanation,
          })),
        };
        resultMembers.push(entry);

        optimizedMembers.push({
          ...member,
          width: optResult.bestSection.b,
          height: optResult.bestSection.h,
          crossSection: optResult.bestSection.label,
          material: optResult.bestClass,
          calculationStatus: optResult.result.overallStatus,
        });
      }

    } catch (err) {
      // Fehler-Handling: Bauteil mit Status 'red' markieren
      const reason = err instanceof Error ? err.message : String(err);
      resultMembers.push({
        member,
        section: { b: member.width || 0, h: member.height || 0, label: '—' },
        timberClass: '—',
        maxUtilization: 9.99,
        overallStatus: 'red',
        summary: `Bemessung fehlgeschlagen: ${reason}`,
        checks: [],
      });
      optimizedMembers.push({
        ...member,
        calculationStatus: 'red',
      });
      assumptions.push({
        field: `${member.name}.error`,
        value: reason,
        reason: `Bemessung konnte nicht durchgeführt werden – Bauteil als NICHT OK markiert`,
        source: 'fallback',
      });
    }
  }

  return {
    members: resultMembers,
    optimizedMembers,
    assumptions,
  };
}
