/**
 * Auto-Pipeline-Orchestrator.
 *
 * Führt alle Auto-Module der Reihe nach aus und bündelt das Ergebnis
 * in einem AutoPipelineResult.
 */

import type { AutoPipelineInput, AutoPipelineResult, AutoAssumption } from './contracts';
import type { BuildingGeometry, RoofType, StructuralSystem, StructuralSystemType, TimberMember } from '@/types/project';
import type { RoofPart } from '@/types/roofParts';
import { autoDeriveGeometry } from './autoDerive';
import { autoGenerateMembers } from './autoMembers';
import { autoComputeLoads } from './autoLoads';
import { autoCalculateAllMembers } from './autoCalculate';
import { autoComputeCosts } from './autoCost';

// ── Helper: Wähle ein sinnvolles Tragsystem basierend auf Dachteil-Geometrie ──
function defaultStructuralSystemForPart(rp: RoofPart): StructuralSystem {
  const pitch = rp.geometry.pitch;
  const width = rp.geometry.width;
  let type: StructuralSystemType;
  let reasoning: string;

  if (pitch < 5) {
    type = 'sonderfall';
    reasoning = `Flachdach (Neigung ${pitch}°) → Sonderfall`;
  } else if (width < 6) {
    type = 'sparrendach';
    reasoning = `Kleine Spannweite ${width}m → Sparrendach`;
  } else if (width < 10) {
    type = 'pfettendach_mittelpfette';
    reasoning = `Mittlere Spannweite ${width}m → Pfettendach mit Mittelpfette`;
  } else {
    type = 'leimbinder_haupttraeger';
    reasoning = `Große Spannweite ${width}m → Leimbinder`;
  }

  return { type, confidence: 0.5, reasoning, alternatives: [], userConfirmed: false };
}

// ── Helper: Konvertiere RoofPart.geometry → BuildingGeometry ─────────────────
function roofPartToGeometry(rp: RoofPart): BuildingGeometry {
  const src = 'extracted' as const;
  return {
    length:      { value: rp.geometry.length,      unit: 'm', confidence: rp.confidence, source: src },
    width:       { value: rp.geometry.width,        unit: 'm', confidence: rp.confidence, source: src },
    ridgeHeight: { value: rp.geometry.ridgeHeight,  unit: 'm', confidence: rp.confidence, source: src },
    eavesHeight: { value: rp.geometry.eavesHeight,  unit: 'm', confidence: rp.confidence, source: src },
    roofPitch:   { value: rp.geometry.pitch,        unit: '°', confidence: rp.confidence, source: src },
    spans: [],
    axes: [],
    isSymmetric: true,
    confidence: rp.confidence,
    userConfirmed: false,
  };
}

// ── Helper: Prefix member IDs mit Dachteil-ID ────────────────────────────────
function prefixMemberIds(members: TimberMember[], prefix: string): TimberMember[] {
  return members.map(m => ({ ...m, id: `${prefix}_${m.id}`, name: m.name }));
}

export async function runAutoPipeline(input: AutoPipelineInput): Promise<AutoPipelineResult> {
  const { project } = input;
  const sparrenSpacing = input.sparrenSpacing ?? 0.8;

  // ── 1. Geometrie ableiten ────────────────────────────────────────────────
  const roofTypeRaw = project.roofType ?? {
    form: 'satteldach' as const,
    confidence: 0.5,
    alternatives: [],
    userConfirmed: false,
  };

  const derivedGeometry = autoDeriveGeometry(project.geometry, roofTypeRaw);

  // ── 2. Tragsystem mit Defaults ───────────────────────────────────────────
  const structuralSystemRaw = project.structuralSystem ?? {
    type: 'pfettendach_mittelpfette' as const,
    confidence: 0.5,
    reasoning: 'Default-Annahme: Pfettendach mit Mittelpfette',
    alternatives: [],
    userConfirmed: false,
  };

  const structuralSystemAssumptions: AutoAssumption[] = [];
  if (!project.structuralSystem) {
    structuralSystemAssumptions.push({
      field: 'structuralSystem',
      value: 'pfettendach_mittelpfette',
      reason: 'Kein Tragsystem aus Plan erkannt – Standard-Pfettendach mit Mittelpfette angenommen.',
      source: 'default',
    });
  }
  if (!project.roofType) {
    structuralSystemAssumptions.push({
      field: 'roofType',
      value: 'satteldach',
      reason: 'Kein Dachtyp aus Plan erkannt – Satteldach als häufigste Bauform angenommen.',
      source: 'default',
    });
  }

  // ── 3. Bauteile generieren ───────────────────────────────────────────────
  // Multi-Dachteil-Modus: wenn project.roofParts vorhanden, für jeden Teil separat generieren
  const hasMultiParts = Array.isArray(project.roofParts) && project.roofParts.length > 0;

  let membersResult: import('./contracts').AutoMembersResult;
  let updatedRoofParts: RoofPart[] | undefined;

  if (hasMultiParts) {
    const allMembers: TimberMember[] = [];
    const allAssumptionsParts: AutoAssumption[] = [];
    const descParts: string[] = [];

    updatedRoofParts = project.roofParts!.map((rp) => {
      const partGeom = roofPartToGeometry(rp);
      const derivedPartGeom = autoDeriveGeometry(partGeom, {
        form: rp.form,
        confidence: rp.confidence,
        alternatives: [],
        userConfirmed: false,
      });

      const partStructSystem: StructuralSystem = defaultStructuralSystemForPart(rp);
      const partRoofType: RoofType = { form: rp.form, confidence: rp.confidence, alternatives: [], userConfirmed: false };

      const partMembersResult = autoGenerateMembers(
        derivedPartGeom.geometry,
        partRoofType,
        partStructSystem,
        { sparrenSpacing },
      );

      const prefixedMembers = prefixMemberIds(partMembersResult.members, rp.id);
      allMembers.push(...prefixedMembers);
      allAssumptionsParts.push(...partMembersResult.assumptions.map(a => ({
        ...a,
        field: `${rp.id}.${a.field}`,
        reason: `[${rp.label}] ${a.reason}`,
      })));
      descParts.push(`${rp.label}: ${partMembersResult.description}`);

      return { ...rp, members: prefixedMembers };
    });

    membersResult = {
      members: allMembers,
      assumptions: allAssumptionsParts,
      description: descParts.join(' | '),
    };
  } else {
    membersResult = autoGenerateMembers(
      derivedGeometry.geometry,
      roofTypeRaw,
      structuralSystemRaw,
      { sparrenSpacing },
    );
  }

  // ── 4. Lasten ermitteln ──────────────────────────────────────────────────
  const loadsResult = await autoComputeLoads(project.address, derivedGeometry.geometry, roofTypeRaw.form);

  // g_k: Summe aller permanenten Lastfälle
  const g_k = loadsResult.loadCases
    .filter((lc) => lc.type === 'permanent')
    .reduce((sum, lc) => sum + lc.value, 0);

  // s_k: Summe aller Schnee-Lastfälle
  const s_k = loadsResult.loadCases
    .filter((lc) => lc.type === 'snow')
    .reduce((sum, lc) => sum + lc.value, 0);

  // ── 5. Berechnung & Optimierung ──────────────────────────────────────────
  const calculationsResult = await autoCalculateAllMembers(
    membersResult.members,
    { gk: g_k, sk: s_k },
    derivedGeometry.geometry,
    sparrenSpacing,
  );

  // ── 6. Kosten ────────────────────────────────────────────────────────────
  const costsResult = await autoComputeCosts(calculationsResult.optimizedMembers, derivedGeometry.geometry);

  // ── 7. Alle Annahmen zusammenfassen ──────────────────────────────────────
  const allAssumptions: AutoAssumption[] = [
    ...derivedGeometry.assumptions,
    ...structuralSystemAssumptions,
    ...membersResult.assumptions,
    ...loadsResult.assumptions,
    ...calculationsResult.assumptions,
  ];

  // ── 8. Confidence-Score ──────────────────────────────────────────────────
  // Anteil aller Lastfälle/Bauteile mit confidence > 0.7 an der Gesamtzahl.
  const confidenceValues: number[] = [
    ...(project.geometry ? [project.geometry.confidence] : [0.5]),
    ...(project.roofType ? [project.roofType.confidence] : [0.5]),
    ...(project.structuralSystem ? [project.structuralSystem.confidence] : [0.5]),
    ...loadsResult.loadCases.map((lc) => lc.confidence),
    ...membersResult.members.map(() => 0.8), // generated members sind definiert
  ];
  const confidenceScore =
    confidenceValues.length > 0
      ? confidenceValues.filter((v) => v > 0.7).length / confidenceValues.length
      : 0;

  // ── 9. Summary ───────────────────────────────────────────────────────────
  const roofPitch = derivedGeometry.geometry.roofPitch?.value ?? 0;
  const sparrenCount = membersResult.members.filter((m) => m.type === 'sparren' || m.type === 'nebentraeger').length;
  const maxEta = calculationsResult.members.length > 0
    ? Math.max(...calculationsResult.members.map((m) => m.maxUtilization))
    : 0;
  const brutto = costsResult.withLabor?.gross ?? costsResult.materialOnly?.gross ?? 0;
  const roofPartsLabel = hasMultiParts ? `, ${project.roofParts!.length} Dachteile` : '';

  const summary =
    `Dachneigung ${roofPitch.toFixed(1)}°${roofPartsLabel}, ${sparrenCount} Sparren, ` +
    `max. Ausnutzung η=${maxEta.toFixed(2)}, ` +
    `Bruttosumme ${brutto.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}.`;

  // ── 10. Rückgabe ─────────────────────────────────────────────────────────
  return {
    geometry: derivedGeometry,
    roofType: { roofType: roofTypeRaw, assumptions: structuralSystemAssumptions.filter((a) => a.field === 'roofType') },
    structuralSystem: { structuralSystem: structuralSystemRaw, assumptions: structuralSystemAssumptions.filter((a) => a.field === 'structuralSystem') },
    members: membersResult,
    loads: loadsResult,
    calculations: calculationsResult,
    costs: costsResult,
    allAssumptions,
    confidenceScore,
    summary,
    ...(updatedRoofParts ? { roofParts: updatedRoofParts } : {}),
  };
}
