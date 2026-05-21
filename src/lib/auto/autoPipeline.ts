/**
 * Auto-Pipeline-Orchestrator.
 *
 * Führt alle Auto-Module der Reihe nach aus und bündelt das Ergebnis
 * in einem AutoPipelineResult.
 */

import type { AutoPipelineInput, AutoPipelineResult, AutoAssumption } from './contracts';
import { autoDeriveGeometry } from './autoDerive';
import { autoGenerateMembers } from './autoMembers';
import { autoComputeLoads } from './autoLoads';
import { autoCalculateAllMembers } from './autoCalculate';
import { autoComputeCosts } from './autoCost';

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
  const membersResult = autoGenerateMembers(
    derivedGeometry.geometry,
    roofTypeRaw,
    structuralSystemRaw,
    { sparrenSpacing },
  );

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
  const sparrenCount = membersResult.members.filter((m) => m.type === 'sparren').length;
  const maxEta = calculationsResult.members.length > 0
    ? Math.max(...calculationsResult.members.map((m) => m.maxUtilization))
    : 0;
  const brutto = costsResult.withLabor?.gross ?? costsResult.materialOnly?.gross ?? 0;

  const summary =
    `Dachneigung ${roofPitch.toFixed(1)}°, ${sparrenCount} Sparren, ` +
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
  };
}
