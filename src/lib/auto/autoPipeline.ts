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
import { sanitizeRoofForm, sanitizeStructuralSystemType } from './sanitize';
import { validateLoop } from './validator';

// ── Helper: Tragsystem je Dachteil aus der STATIK ableiten (Sparrenlänge),
// nicht nur aus der Gebäudebreite — Zimmerer-Praxis: keine Pfetten, wo keine
// gebraucht werden (günstigste Lösung für den Kunden).
function defaultStructuralSystemForPart(rp: RoofPart): StructuralSystem {
  const pitch = rp.geometry.pitch;
  const width = rp.geometry.width;
  const rise = Math.max(0.1, (rp.geometry.ridgeHeight || 0) - (rp.geometry.eavesHeight || 0));
  const halfW = rp.form === 'pultdach' ? width : width / 2;
  const slen = Math.sqrt(halfW * halfW + rise * rise);
  let type: StructuralSystemType;
  let reasoning: string;

  if (pitch < 5) {
    type = 'sonderfall';
    reasoning = `Flachdach (Neigung ${pitch}°) → Sonderfall`;
  } else if (width >= 12) {
    type = 'leimbinder_haupttraeger';
    reasoning = `Große Spannweite ${width}m → Leimbinder`;
  } else if (slen <= 5.0) {
    type = 'sparrendach';
    reasoning = `Sparrenlänge ${slen.toFixed(2)}m ≤ 5m → Sparrendach ohne Pfetten (Mauerbank + Zangen)`;
  } else if (slen <= 6.5) {
    type = 'kehlbalkendach';
    reasoning = `Sparrenlänge ${slen.toFixed(2)}m → Kehlbalkendach (Kehlzangen statt Mittelpfetten)`;
  } else {
    type = 'pfettendach_mittelpfette';
    reasoning = `Sparrenlänge ${slen.toFixed(2)}m > 6,5m → Pfettendach mit Mittelpfette + Zangen`;
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
  // Aus dem PLAN gelesener Sparrenabstand ist die beste Quelle und schlägt den
  // von Aufrufern mitgegebenen Default (0,8 m).
  const sparrenSpacing = project.sparrenSpacing ?? input.sparrenSpacing ?? 0.8;
  const planSections = project.planMemberSections;
  const roofOverhang = project.roofOverhang;
  const ceilings = input.ceilings ?? project.ceilings;

  // ── 0. Pre-Validation: DN-Marker + Plausibilitätsprüfung VOR der Ableitung ──
  // Läuft als Loop (max 3 Iterationen) bis alle Werte konsistent sind.
  const preValidation = validateLoop(
    project,
    project.geometry ?? {
      length:      { value: 0, unit: 'm', confidence: 0, source: 'assumed' },
      width:       { value: 0, unit: 'm', confidence: 0, source: 'assumed' },
      ridgeHeight: { value: 0, unit: 'm', confidence: 0, source: 'assumed' },
      eavesHeight: { value: 0, unit: 'm', confidence: 0, source: 'assumed' },
      roofPitch:   { value: 0, unit: '°', confidence: 0, source: 'assumed' },
      spans: [],
      axes: [],
      isSymmetric: true,
      confidence: 0,
      userConfirmed: false,
    },
    project.roofParts,
    3,
  );
  // Korrigierte Werte als Basis für die restliche Pipeline verwenden
  const validatedGeometry  = preValidation.geometry;
  const validatedRoofParts = preValidation.roofParts;
  const preValidationAssumptions: AutoAssumption[] = preValidation.allCorrections;

  // ── 1. Geometrie ableiten ────────────────────────────────────────────────

  // Sanitize RoofType (ungültiger/fehlender form-Wert → satteldach)
  const structuralSystemAssumptions: AutoAssumption[] = [];
  const roofFormSanitized = sanitizeRoofForm(project.roofType?.form);
  if (roofFormSanitized.assumption) structuralSystemAssumptions.push(roofFormSanitized.assumption);

  const roofTypeRaw: RoofType = project.roofType
    ? { ...project.roofType, form: roofFormSanitized.form }
    : {
        form: roofFormSanitized.form,
        confidence: 0.5,
        alternatives: [],
        userConfirmed: false,
      };

  if (!project.roofType) {
    structuralSystemAssumptions.push({
      field: 'roofType',
      value: roofFormSanitized.form,
      reason: 'Kein Dachtyp aus Plan erkannt – Satteldach als häufigste Bauform angenommen.',
      source: 'default',
    });
  }

  // Verwende pre-validierte Geometrie (DN-Marker-Korrekturen bereits eingearbeitet)
  const derivedGeometry = autoDeriveGeometry(
    validatedGeometry.confidence > 0 ? validatedGeometry : project.geometry,
    roofTypeRaw,
  );

  // ── 2. Tragsystem mit Defaults + Sanitize ───────────────────────────────
  const sysSanitized = sanitizeStructuralSystemType(project.structuralSystem?.type);
  if (sysSanitized.assumption) structuralSystemAssumptions.push(sysSanitized.assumption);

  let structuralSystemRaw: StructuralSystem = project.structuralSystem
    ? { ...project.structuralSystem, type: sysSanitized.type }
    : {
        type: sysSanitized.type,
        confidence: 0.5,
        reasoning: 'Default-Annahme: Pfettendach mit Mittelpfette',
        alternatives: [],
        userConfirmed: false,
      };

  // STATIK ENTSCHEIDET DAS TRAGSYSTEM (Zimmerer-Praxis Oststeiermark, günstigste
  // Lösung für den Kunden): Bei kurzer Sparrenlänge braucht es KEINE Pfetten —
  //   ≤ 5,0 m Schräglänge  → Sparrendach (nur Mauerbank + Zangen)
  //   ≤ 6,5 m              → Kehlbalkendach (Kehlzangen statt Mittelpfetten)
  //   darüber              → Pfettendach mit Mittelpfette (+ Zangen)
  // Nur wenn der Nutzer das Tragsystem nicht ausdrücklich bestätigt hat.
  if (!project.structuralSystem?.userConfirmed &&
      (structuralSystemRaw.type === 'pfettendach' || structuralSystemRaw.type === 'pfettendach_mittelpfette' || structuralSystemRaw.type === 'sparrendach' || structuralSystemRaw.type === 'kehlbalkendach')) {
    const g0 = derivedGeometry.geometry;
    // Pultdach: Sparren spannen die VOLLE Breite (nicht die halbe wie beim Satteldach)
    const hw = roofTypeRaw.form === 'pultdach' ? (g0.width?.value ?? 8) : (g0.width?.value ?? 8) / 2;
    const rise0 = Math.max(0.1, (g0.ridgeHeight?.value ?? 6) - (g0.eavesHeight?.value ?? 4));
    const slen = Math.sqrt(hw * hw + rise0 * rise0);
    const chosen: StructuralSystemType = slen <= 5.0 ? 'sparrendach' : slen <= 6.5 ? 'kehlbalkendach' : 'pfettendach_mittelpfette';
    if (chosen !== structuralSystemRaw.type) {
      structuralSystemAssumptions.push({
        field: 'structuralSystem',
        value: chosen,
        reason: `Statischer Tragsystem-Entscheid: Sparrenlänge ${slen.toFixed(2)} m → ${chosen === 'sparrendach' ? 'Sparrendach ohne Pfetten (nur Mauerbank + Zangen) — günstigste Lösung' : chosen === 'kehlbalkendach' ? 'Kehlbalkendach (Kehlzangen statt Mittelpfetten)' : 'Pfettendach mit Mittelpfette + Zangen'}. Vorher: ${structuralSystemRaw.type}.`,
        source: 'derived',
      });
      structuralSystemRaw = {
        ...structuralSystemRaw,
        type: chosen,
        reasoning: `Aus der Statik abgeleitet: Sparrenlänge ${slen.toFixed(2)} m`,
      };
    }
  }

  if (!project.structuralSystem) {
    structuralSystemAssumptions.push({
      field: 'structuralSystem',
      value: sysSanitized.type,
      reason: 'Kein Tragsystem aus Plan erkannt – Standard-Pfettendach mit Mittelpfette angenommen.',
      source: 'default',
    });
  }

  // ── 2b. Adresse: Wien als Fallback wenn komplett fehlend ─────────────────
  const addressAssumptions: AutoAssumption[] = [];
  if (!project.address) {
    addressAssumptions.push({
      field: 'address',
      value: '1010 Wien',
      reason: 'Keine Adresse im Plan gefunden — Wien (1010) als Fallback für Lastermittlung verwendet.',
      source: 'fallback',
    });
  }

  // ── 3. Bauteile generieren ───────────────────────────────────────────────
  // Multi-Dachteil-Modus: wenn project.roofParts vorhanden, für jeden Teil separat generieren
  // Verwende pre-validierte RoofParts (pitch etc. bereits korrigiert)
  const roofPartsSource = validatedRoofParts ?? project.roofParts;
  const hasMultiParts = Array.isArray(roofPartsSource) && roofPartsSource.length > 0;

  let membersResult: import('./contracts').AutoMembersResult;
  let updatedRoofParts: RoofPart[] | undefined;

  if (hasMultiParts) {
    const allMembers: TimberMember[] = [];
    const allAssumptionsParts: AutoAssumption[] = [];
    const descParts: string[] = [];

    updatedRoofParts = roofPartsSource!.map((rp) => {
      const partGeom = roofPartToGeometry(rp);
      const derivedPartGeom = autoDeriveGeometry(partGeom, {
        form: rp.form,
        confidence: rp.confidence,
        alternatives: [],
        userConfirmed: false,
      });

      const partStructSystem: StructuralSystem = defaultStructuralSystemForPart(rp);
      const partRoofType: RoofType = { form: rp.form, confidence: rp.confidence, alternatives: [], userConfirmed: false };

      // Decken (Deckenbalken) gehören NUR zum Hauptgebäude — sonst bekommt jedes
      // Vordach/Carport nochmal die kompletten Deckenbalken (Preis multipliziert
      // sich mit jedem erkannten Dachteil!). Ebenso Plan-Querschnitte: die gelten
      // fürs Hauptdach, nicht für ein 3-m-Vordach.
      const isMainPart = rp.kind === 'main';
      const partMembersResult = autoGenerateMembers(
        derivedPartGeom.geometry,
        partRoofType,
        partStructSystem,
        {
          sparrenSpacing, roofOverhang,
          ...(isMainPart ? { ceilings, planSections } : {}),
        },
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
      { sparrenSpacing, ceilings, planSections, roofOverhang },
    );
  }

  // ── 4. Lasten ermitteln ──────────────────────────────────────────────────
  // Adresse mit Wien-Fallback (1010) wenn komplett fehlend
  const addressForLoads = project.address ?? {
    street: '',
    houseNumber: '',
    postalCode: '1010',
    city: 'Wien',
    state: 'Wien',
    country: 'Österreich',
    confidence: 0.2,
    source: 'auto_extracted' as const,
    alternatives: [],
  };
  const loadsResult = await autoComputeLoads(
    addressForLoads, derivedGeometry.geometry, roofTypeRaw.form, project.coveringType, project.loadCases,
  );

  // g_k: Summe aller permanenten Lastfälle
  const g_k = loadsResult.loadCases
    .filter((lc) => lc.type === 'permanent')
    .reduce((sum, lc) => sum + lc.value, 0);

  // s_k: Summe aller Schnee-Lastfälle
  const s_k = loadsResult.loadCases
    .filter((lc) => lc.type === 'snow')
    .reduce((sum, lc) => sum + lc.value, 0);

  // ── 4b. VARIANTEN-VERGLEICH: "Viele Wege führen nach Rom — nimm den
  // günstigsten." Wenn das Tragsystem nicht vom Nutzer bestätigt ist, wird
  // die statisch sinnvolle Alternative ebenfalls voll durchgerechnet
  // (Bauteile → Bemessung → Kosten) und die günstigere Variante OHNE rote
  // Nachweise gewählt. Nur Einzeldach-Fall; Formen ohne Gespärre (Pult/Flach)
  // haben keine Kehlbalken-Alternative.
  if (!hasMultiParts && !project.structuralSystem?.userConfirmed &&
      roofTypeRaw.form !== 'pultdach' && roofTypeRaw.form !== 'flachdach' &&
      ['sparrendach', 'kehlbalkendach', 'pfettendach', 'pfettendach_mittelpfette'].includes(structuralSystemRaw.type)) {
    const altType: StructuralSystemType =
      structuralSystemRaw.type === 'pfettendach_mittelpfette' || structuralSystemRaw.type === 'pfettendach'
        ? 'kehlbalkendach'
        : 'pfettendach_mittelpfette';
    const evaluate = async (sysType: StructuralSystemType) => {
      const sys: StructuralSystem = { ...structuralSystemRaw, type: sysType };
      const mem = autoGenerateMembers(derivedGeometry.geometry, roofTypeRaw, sys,
        { sparrenSpacing, ceilings, planSections, roofOverhang });
      const calc = await autoCalculateAllMembers(mem.members, { gk: g_k, sk: s_k },
        derivedGeometry.geometry, sparrenSpacing, sys.supportSpacing ?? 4.0);
      const cost = await autoComputeCosts(calc.optimizedMembers, derivedGeometry.geometry, {
        joints: mem.joints, roofForm: roofTypeRaw.form, includeDeckPlanks: true,
        includeTransport: true, roofOverhang: project.roofOverhang,
        ...(project.coveringType ? { coveringType: project.coveringType } : {}),
      });
      const hasRed = calc.members.some((m) => m.overallStatus === 'red');
      return { sysType, mem, gross: cost.withLabor?.gross ?? Infinity, hasRed };
    };
    const [a, b] = await Promise.all([evaluate(structuralSystemRaw.type), evaluate(altType)]);
    const candidates = [a, b].filter(v => !v.hasRed);
    const winner = (candidates.length > 0 ? candidates : [a, b])
      .reduce((best, v) => (v.gross < best.gross ? v : best));
    if (winner.sysType !== structuralSystemRaw.type) {
      structuralSystemRaw = { ...structuralSystemRaw, type: winner.sysType,
        reasoning: `Varianten-Vergleich: ${winner.sysType} ist günstiger` };
    }
    membersResult = winner.mem;
    const loser = winner === a ? b : a;
    structuralSystemAssumptions.push({
      field: 'tragsystem.variantenvergleich',
      value: winner.sysType,
      reason: `Beide Varianten voll durchgerechnet: ${a.sysType} ${a.gross === Infinity ? '—' : Math.round(a.gross).toLocaleString('de-AT') + ' €'}${a.hasRed ? ' (Nachweis ROT)' : ''} vs. ${b.sysType} ${b.gross === Infinity ? '—' : Math.round(b.gross).toLocaleString('de-AT') + ' €'}${b.hasRed ? ' (Nachweis ROT)' : ''} → ${winner.sysType} gewählt (günstigste Variante ohne rote Nachweise${loser.hasRed ? '' : `, spart ${Math.round(Math.abs(loser.gross - winner.gross)).toLocaleString('de-AT')} €`}).`,
      source: 'derived',
    });
  }

  // ── 5. Berechnung & Optimierung ──────────────────────────────────────────
  const calculationsResult = await autoCalculateAllMembers(
    membersResult.members,
    { gk: g_k, sk: s_k },
    derivedGeometry.geometry,
    sparrenSpacing,
    structuralSystemRaw.supportSpacing ?? 4.0,
  );

  // ── 5b. Modus-abhängige optimizedMembers ─────────────────────────────────
  // Wenn dimensioningMode === 'sicher': optimizedMembers mit sicherer Variante
  const dimensioningMode = project.dimensioningMode ?? 'wirtschaftlich';
  let effectiveOptimizedMembers = calculationsResult.optimizedMembers;
  if (dimensioningMode === 'sicher') {
    effectiveOptimizedMembers = calculationsResult.members.map((m, idx) => {
      const sicher = m.variants?.sicher;
      if (sicher && (sicher.b !== m.section.b || sicher.h !== m.section.h)) {
        return {
          ...calculationsResult.optimizedMembers[idx],
          width: sicher.b,
          height: sicher.h,
          crossSection: sicher.label,
          calculationStatus: sicher.status,
        };
      }
      return calculationsResult.optimizedMembers[idx];
    });
  }

  // ── 6. Kosten ────────────────────────────────────────────────────────────
  const costsResult = await autoComputeCosts(effectiveOptimizedMembers, derivedGeometry.geometry, {
    joints: membersResult.joints,
    roofForm: project.roofType?.form ?? 'satteldach',
    includeDeckPlanks: true,
    includeTransport: true,
    roofOverhang: project.roofOverhang,
    ...(project.coveringType ? { coveringType: project.coveringType } : {}),
    ...(updatedRoofParts && updatedRoofParts.length > 0 ? { roofParts: updatedRoofParts } : {}),
  });

  // ── 6b. Post-Pipeline-Validation: Final-Check der abgeleiteten Geometrie ──
  // Prüft nochmals ob DN-Marker-Werte in der abgeleiteten Geometrie korrekt sind.
  const postValidation = validateLoop(
    project,
    derivedGeometry.geometry,
    updatedRoofParts,
    2, // max 2 weitere Iterationen nach der Pipeline
  );
  // Korrigierte Geometrie in derivedGeometry einpflegen (immutable swap)
  const finalGeometry = postValidation.allCorrections.length > 0
    ? { ...derivedGeometry, geometry: postValidation.geometry }
    : derivedGeometry;
  const finalRoofParts = postValidation.allCorrections.length > 0
    ? (postValidation.roofParts ?? updatedRoofParts)
    : updatedRoofParts;

  // ── 7. Alle Annahmen zusammenfassen ──────────────────────────────────────
  const allAssumptions: AutoAssumption[] = [
    ...preValidationAssumptions,
    ...finalGeometry.assumptions,
    ...structuralSystemAssumptions,
    ...addressAssumptions,
    ...membersResult.assumptions,
    ...loadsResult.assumptions,
    ...calculationsResult.assumptions,
    ...postValidation.allCorrections,
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
  const roofPitch = finalGeometry.geometry.roofPitch?.value ?? 0;
  const sparrenCount = membersResult.members.filter((m) => m.type === 'sparren' || m.type === 'nebentraeger').length;
  const maxEta = calculationsResult.members.length > 0
    ? Math.max(...calculationsResult.members.map((m) => m.maxUtilization))
    : 0;
  const brutto = costsResult.withLabor?.gross ?? costsResult.materialOnly?.gross ?? 0;
  const roofPartsLabel = hasMultiParts ? `, ${roofPartsSource!.length} Dachteile` : '';
  const ceilingsLabel = ceilings && ceilings.length > 0
    ? `, +${ceilings.length} Holzbalkendecke${ceilings.length > 1 ? 'n' : ''} (${ceilings.map(c => c.level).join('/')})`
    : '';

  const summary =
    `Dachneigung ${roofPitch.toFixed(1)}°${roofPartsLabel}${ceilingsLabel}, ${sparrenCount} Sparren, ` +
    `max. Ausnutzung η=${maxEta.toFixed(2)}, ` +
    `Bruttosumme ${brutto.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}.`;

  // ── 10. Rückgabe ─────────────────────────────────────────────────────────
  return {
    geometry: finalGeometry,
    roofType: { roofType: roofTypeRaw, assumptions: structuralSystemAssumptions.filter((a) => a.field === 'roofType') },
    structuralSystem: { structuralSystem: structuralSystemRaw, assumptions: structuralSystemAssumptions.filter((a) => a.field === 'structuralSystem') },
    members: membersResult,
    loads: loadsResult,
    calculations: { ...calculationsResult, optimizedMembers: effectiveOptimizedMembers },
    costs: costsResult,
    allAssumptions,
    confidenceScore,
    summary,
    ...(finalRoofParts ? { roofParts: finalRoofParts } : {}),
    ...(membersResult.joints && membersResult.joints.length > 0 ? { joints: membersResult.joints } : {}),
  };
}
