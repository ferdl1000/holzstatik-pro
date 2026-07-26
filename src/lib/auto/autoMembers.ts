/**
 * autoMembers.ts
 *
 * Erzeugt eine vollständige Bauteil-Liste (TimberMember[]) aus:
 * - Gebäudegeometrie (autoDeriveGeometry bereits gelaufen)
 * - Dachform (RoofType)
 * - Tragsystem (StructuralSystem)
 */

import type { BuildingGeometry, RoofType, StructuralSystem, TimberMember, CeilingArea, WallConstruction } from '@/types/project';
import type { AutoAssumption, AutoMembersResult } from '@/lib/auto/contracts';
import type { JointSpec } from '@/lib/auto/standards';
import { splitMemberAtJoints, suggestCeilingBeam, KEHLBALKEN_HOEHENFAKTOR } from '@/lib/auto/standards';
import { sanitizeGeometry, sanitizeStructuralSystemType } from '@/lib/auto/sanitize';

// ────────────────────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ────────────────────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${++_idCounter}`;
}

function makeMember(
  partial: Omit<TimberMember, 'id' | 'calculationStatus'> & { idPrefix?: string },
): TimberMember {
  const { idPrefix, ...rest } = partial;
  return {
    id: nextId(idPrefix ?? rest.type),
    calculationStatus: 'yellow',
    ...rest,
  };
}

function sparrenLaenge(geometry: BuildingGeometry): number {
  const halfWidth = geometry.width.value / 2;
  const rise = geometry.ridgeHeight.value - geometry.eavesHeight.value;
  return Math.sqrt(halfWidth * halfWidth + rise * rise);
}

function sparrenAnzahl(length: number, spacing: number): number {
  // Beide Dachseiten + je 1 Endgiebel-Sparren
  return Math.ceil(length / spacing) * 2 + 2;
}

function sparrenAnzahlPultdach(length: number, spacing: number): number {
  // Nur EINE Seite + je 1 Endgiebel-Sparren
  return Math.ceil(length / spacing) + 1;
}

// ────────────────────────────────────────────────────────────────────────────
// Haupt-Export
// ────────────────────────────────────────────────────────────────────────────

export function autoGenerateMembers(
  geometry: BuildingGeometry,
  _roofType: RoofType,
  structuralSystem: StructuralSystem,
  opts?: {
    sparrenSpacing?: number; ceilings?: CeilingArea[]; wallConstructions?: WallConstruction[];
    /** Im Plan beschriftete Querschnitte (aus textParser) — Start-Querschnitte statt Defaults */
    planSections?: { member: string; b: number; h: number; raw: string }[];
    /** Dachüberstand in m (aus Plan oder Default 0,4) — verlängert die Sparren real */
    roofOverhang?: number;
  },
): AutoMembersResult {
  _idCounter = 0; // reset für deterministische IDs

  const assumptions: AutoAssumption[] = [];
  const members: TimberMember[] = [];

  // Plan-Querschnitt je Bauteiltyp nachschlagen; Default nur wenn Plan nichts sagt.
  const planSec = (member: string, defB: number, defH: number): { b: number; h: number; fromPlan: boolean } => {
    const s = opts?.planSections?.find((x) => x.member === member);
    if (s) {
      assumptions.push({
        field: `${member}.crossSection`,
        value: `${s.b / 10}/${s.h / 10}`,
        reason: `Querschnitt ${s.b / 10}/${s.h / 10} cm DIREKT aus Planbeschriftung „${s.raw}" übernommen — Optimizer prüft die Tragfähigkeit.`,
        source: 'derived',
      });
      return { b: s.b, h: s.h, fromPlan: true };
    }
    return { b: defB, h: defH, fromPlan: false };
  };

  // ── Sanity-Check Geometrie (Schutz gegen NaN/Infinity/negative Werte) ────
  const sanitized = sanitizeGeometry(geometry);
  if (sanitized.assumptions.length > 0) {
    assumptions.push(...sanitized.assumptions);
    geometry = sanitized.geometry; // eslint-disable-line no-param-reassign
  }

  // ── Sanity-Check Tragsystem ───────────────────────────────────────────────
  const sysSanitized = sanitizeStructuralSystemType(structuralSystem.type);
  if (sysSanitized.assumption) {
    assumptions.push(sysSanitized.assumption);
    structuralSystem = { ...structuralSystem, type: sysSanitized.type }; // eslint-disable-line no-param-reassign
  }

  const spacing = opts?.sparrenSpacing ?? 0.8;
  if (!opts?.sparrenSpacing) {
    assumptions.push({
      field: 'sparrenSpacing',
      value: spacing,
      reason: 'Kein Sparrenabstand aus Plan ableitbar — Standard 0.80 m (e = 80 cm) angenommen.',
      source: 'default',
    });
  }

  const buildingLength = geometry.length.value;
  const buildingWidth = geometry.width.value;
  const eavesH = geometry.eavesHeight.value;
  const ridgeH = geometry.ridgeHeight.value;

  const isPultdachForm = _roofType.form === 'pultdach';
  // Pultdach: volle Breite als Sparrenlänge (nicht halbe), nur eine Seite
  const sparrenLenRaw = isPultdachForm
    ? Math.sqrt(buildingWidth * buildingWidth + (ridgeH - eavesH) * (ridgeH - eavesH))
    : +sparrenLaenge(geometry).toFixed(2);
  // Dachüberstand verlängert jeden Sparren real (Überstand horizontal → Schräge):
  // Traufseite immer, beim Satteldach zählt der Firstpunkt nicht (dort stößt der Gegensparren).
  const overhang = opts?.roofOverhang ?? 0.4;
  const pitchRadOv = ((geometry.roofPitch?.value ?? 30) * Math.PI) / 180;
  const overhangSlope = overhang / Math.max(Math.cos(pitchRadOv), 0.5);
  const sparrenLen = +(sparrenLenRaw + overhangSlope * (isPultdachForm ? 2 : 1)).toFixed(2);
  assumptions.push({
    field: 'roofOverhang',
    value: overhang,
    reason: opts?.roofOverhang != null
      ? `Dachüberstand ${(overhang * 100).toFixed(0)} cm aus dem Plan gelesen — Sparrenlänge + Dachfläche entsprechend vergrößert.`
      : `Dachüberstand nicht im Plan beschriftet — Regelwert ${(overhang * 100).toFixed(0)} cm angesetzt (Sparrenlänge + Dachfläche entsprechend vergrößert).`,
    source: opts?.roofOverhang != null ? 'derived' : 'standard',
  });
  // Beim Walmdach sind die Sparren im Bereich der Walmflächen keine vollen
  // Sparren mehr, sondern Schifter (weiter unten eigens erfasst). Die Zahl der
  // VOLLEN Sparren richtet sich deshalb nur nach der Firstlänge.
  const walmAbzug =
    _roofType.form === 'walmdach' ? buildingWidth :
    _roofType.form === 'krueppelwalmdach' ? buildingWidth / 2 : 0;
  const sparrenLaengsMass = Math.max(1, buildingLength - walmAbzug);
  const sparrenCount = isPultdachForm
    ? sparrenAnzahlPultdach(buildingLength, spacing)
    : sparrenAnzahl(sparrenLaengsMass, spacing);
  const ridgeHeight = ridgeH - eavesH; // Höhe über Traufe

  const sysType = structuralSystem.type;

  // Walmdach: der First endet vor der Stirnseite, dort laufen die Gratsparren
  // zusammen. Krüppelwalm: nur der obere Teil ist abgewalmt.
  const walmTiefeGesamt =
    _roofType.form === 'walmdach' ? buildingWidth :
    _roofType.form === 'krueppelwalmdach' ? buildingWidth / 2 : 0;
  const firstLaenge = +Math.max(1, buildingLength - walmTiefeGesamt).toFixed(2);

  // ═══════════════════════════════════════════════════════════════════════════
  // HALLEN-MODUS (BSH-Binder, Großspannweiten >14 m oder Hallen-Tragwerk)
  // ═══════════════════════════════════════════════════════════════════════════
  const isHalleMode = sysType === 'leimbinder_haupttraeger' || buildingWidth > 14;

  if (isHalleMode) {
    // Hauptträger-Abstand: 5.5 m typisch
    const traegerAbstand = 5.5;
    const traegerCount = Math.max(2, Math.ceil(buildingLength / traegerAbstand) + 1);
    const spannweite = buildingWidth;

    // BSH-Querschnitt: h = Spannweite/15, gerundet auf 40 mm
    const hRaw = (spannweite * 1000) / 15;
    const h = Math.ceil(hRaw / 40) * 40;
    const bsh_b = spannweite > 20 ? 200 : 160;
    const isBogenbinder = spannweite > 24;
    const material = isBogenbinder ? 'GL28h_curved' : (spannweite >= 20 ? 'GL28h' : 'GL24h');

    members.push(makeMember({
      idPrefix: 'HT',
      name: `Hauptträger HT1-HT${traegerCount}`,
      type: 'leimbinder',
      material,
      width: bsh_b,
      height: h,
      length: spannweite,
      quantity: traegerCount,
      crossSection: `${bsh_b / 10}/${h / 10}`,
    }));

    assumptions.push({
      field: 'halle.mode',
      value: 'aktiv',
      reason: `Hallen-Modus aktiv: Spannweite ${spannweite} m > 14 m → BSH-Hauptträger statt klassischer Sparrenkonstruktion.`,
      source: 'derived',
    });
    assumptions.push({
      field: 'ht.spacing',
      value: traegerAbstand,
      reason: `Achsabstand Hauptträger ${traegerAbstand} m → ${traegerCount} Träger insgesamt.`,
      source: 'standard',
    });
    assumptions.push({
      field: 'ht.crossSection',
      value: `${bsh_b}/${h}`,
      reason: `BSH-Querschnitt aus Daumenregel h = L/15 = ${Math.round(hRaw)} mm → gerundet ${h} mm. Material ${material}.`,
      source: 'derived',
    });
    if (isBogenbinder) {
      assumptions.push({
        field: 'ht.bogen',
        value: `Pfeilhöhe ${Math.round(spannweite * 100)} cm`,
        reason: `Spannweite ${spannweite} m > 24 m → gebogener BSH-Binder GL28h, Pfeilhöhe 10 % der Spannweite.`,
        source: 'standard',
      });
    }

    // Längspfetten (KVH auf Hauptträgern)
    // Anzahl: bei Sattel ca 4-6 pro Seite (8-12 gesamt), bei Pult 5-8
    const isPult = (geometry.roofPitch?.value ?? 30) < 5 || _roofType.form === 'pultdach';
    const pfettenProSeite = isPult ? 6 : 4;
    const totalPfetten = isPult ? pfettenProSeite : pfettenProSeite * 2;
    members.push(makeMember({
      idPrefix: 'LP',
      name: `Längspfette P1-P${totalPfetten}`,
      type: 'pfette',
      material: 'C24',
      width: 100,
      height: 240,
      length: traegerAbstand,  // pro Feld zwischen Hauptträgern
      quantity: totalPfetten * (traegerCount - 1),  // mal Anzahl Felder
      crossSection: '10/24',
    }));
    assumptions.push({
      field: 'pfetten.raster',
      value: pfettenProSeite,
      reason: `${pfettenProSeite} Längspfetten pro Dachseite × ${traegerCount - 1} Felder = ${totalPfetten * (traegerCount - 1)} KVH-Stück.`,
      source: 'standard',
    });

    // Kopfband bei jedem inneren Hauptträger (2 Stk pro Träger)
    if (traegerCount > 2) {
      const kopfbandCount = (traegerCount - 2) * 2;
      members.push(makeMember({
        idPrefix: 'KB',
        name: `Kopfband KB1-KB${kopfbandCount}`,
        type: 'rahm',
        material: 'C24',
        width: 100,
        height: 120,
        length: 1.5,
        quantity: kopfbandCount,
        crossSection: '10/12',
      }));
      assumptions.push({
        field: 'kopfband',
        value: `${kopfbandCount} Stück`,
        reason: `Kopfband (45°-Knagge) zwischen Innenstütze und Hauptträger, 2 Stück pro Innenträger, 100/120 mm × 1,5 m.`,
        source: 'standard',
      });
    }

    // Deckenbalken für Hallen-Modus (nur Holzbalkendecken)
    if (opts?.ceilings && opts.ceilings.length > 0) {
      for (const ceiling of opts.ceilings) {
        const cType = ceiling.constructionType;
        // STB-Decken: überspringen, Annahme eintragen
        if (cType === 'stb_decke' || cType === 'rippendecke') {
          assumptions.push({
            field: `decke.${ceiling.id}`,
            value: 'nicht im Holzauszug',
            reason: `${cType === 'stb_decke' ? 'STB-Decke' : 'Rippendecke'} ${ceiling.level}: außerhalb Zimmerei-Lieferumfang — vom Statiker für Beton separat zu berechnen.${ceiling.evidence ? ` Nachweis: ${ceiling.evidence}` : ''}`,
            source: 'derived',
          });
          continue;
        }
        // unbekannt: Holzbalkendecke als Default (mit Warnung)
        if (cType === 'unbekannt') {
          assumptions.push({
            field: `decke.${ceiling.id}.typ`,
            value: 'holzbalkendecke (angenommen)',
            reason: `Decke ${ceiling.level}: Konstruktionstyp unklar — Holzbalkendecke angenommen. Bitte im Plan prüfen!`,
            source: 'fallback',
          });
        }
        const spec = { span: ceiling.span, area: ceiling.area, nutzung: ceiling.nutzung };
        const { b, h: dh, spacing } = suggestCeilingBeam(spec);
        const orthoSpan = ceiling.area / ceiling.span;
        const count = Math.ceil(orthoSpan / spacing);
        const cs = `${b / 10}/${dh / 10}`;
        members.push(makeMember({
          idPrefix: 'DB',
          name: `Deckenbalken ${ceiling.level}`,
          type: 'nebentraeger',
          material: 'C24',
          width: b,
          height: dh,
          length: ceiling.span,
          quantity: count,
          crossSection: cs,
        }));
        assumptions.push({
          field: `decke.${ceiling.id}`,
          value: `${count}× ${cs} C24 @ ${spacing * 100} cm`,
          reason: `Holzbalkendecke ${ceiling.level} (${ceiling.nutzung}, ${ceiling.area} m², Spannweite ${ceiling.span} m): ` +
            `${count} Deckenbalken ${cs} C24, Achsabstand ${spacing * 100} cm.`,
          source: 'derived',
        });
      }
    }

    const memberSummary = members.map(m => `${m.name} (${m.crossSection} ${m.material}, n=${m.quantity})`).join('; ');
    const description =
      `HALLE: BSH-Hauptträger ${bsh_b}/${h} mm ${material} mit ${traegerCount} Achsen à ${traegerAbstand} m. ` +
      `Spannweite ${spannweite} m${isBogenbinder ? ' (gebogen, Pfeilhöhe 10 %)' : ''}. ` +
      `${memberSummary}. Keine klassischen Sparren — Dachhaut direkt auf Längspfetten.`;

    // Stoßstellen-Aufteilung (Hallen-Modus)
    const { splitMembers: halleSplitMembers, joints: halleJoints } = applySplitJoints(members, [], assumptions);
    return { members: halleSplitMembers, assumptions, description, joints: halleJoints };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KLASSISCH (Sparrendach / Pfettendach / Kehlbalken / etc.)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Sparren (alle Tragsysteme) ───────────────────────────────────────────
  const sprSec = planSec('sparren', 80, 160);
  const sparren = makeMember({
    idPrefix: 'SPR',
    name: `Sparren S1-S${sparrenCount}`,
    type: 'sparren',
    material: 'C24',
    width: sprSec.b,
    height: sprSec.h,
    length: sparrenLen,
    quantity: sparrenCount,
    crossSection: `${sprSec.b / 10}/${sprSec.h / 10}`,
  });
  members.push(sparren);

  if (!sprSec.fromPlan) {
    assumptions.push({
      field: 'sparren.crossSection',
      value: '8/16',
      reason: isPultdachForm
        ? `Standard-KVH-Querschnitt 8/16 cm C24 für Pultdach-Sparren angenommen (eine Seite, Länge ${sparrenLen} m über volle Gebäudebreite) — wird durch Optimizer verifiziert.`
        : 'Standard-KVH-Querschnitt 8/16 cm C24 für Sparren angenommen — wird durch Optimizer verifiziert.',
      source: 'standard',
    });
  }

  // ── Walm / Krüppelwalm: Gratsparren + Schifter ───────────────────────────
  // Ein Walmdach hat an den Stirnseiten keine Giebelwand, sondern eine geneigte
  // Dachfläche. Dort laufen vier GRATSPARREN von der Traufecke zum Firstende,
  // und die dazwischen liegenden Sparren sind SCHIFTER (unterschiedlich lang).
  // Bisher bekam ein Walmdach exakt dieselbe Stückliste wie ein Satteldach —
  // die Gratsparren und Schifter fehlten komplett, das Angebot war zu billig
  // und die 3D-Ansicht zeigte Bauteile, die es in der Liste nicht gab.
  const istWalm = _roofType.form === 'walmdach' || _roofType.form === 'krueppelwalmdach';
  if (istWalm && !isPultdachForm) {
    // Beim Krüppelwalm ist nur der obere Teil abgewalmt → halbe Walmtiefe
    const walmTiefe = _roofType.form === 'walmdach' ? buildingWidth / 2 : buildingWidth / 4;
    // Grat läuft diagonal: horizontal √(walmTiefe² + (Breite/2)²), dazu die Höhe
    const gratHoriz = Math.sqrt(walmTiefe * walmTiefe + (buildingWidth / 2) * (buildingWidth / 2));
    const gratLen = +(Math.sqrt(gratHoriz * gratHoriz + ridgeHeight * ridgeHeight) + overhangSlope).toFixed(2);
    // Gratsparren tragen die Schifter → eine Querschnittsstufe stärker
    members.push(makeMember({
      idPrefix: 'GR',
      name: 'Gratsparren G1-G4',
      type: 'sparren',
      material: 'C24',
      width: sprSec.b,
      height: sprSec.h + 40,
      length: gratLen,
      quantity: 4,
      crossSection: `${sprSec.b / 10}/${(sprSec.h + 40) / 10}`,
    }));

    // Schifter je Walmseite: von voller bis fast null Länge → im Mittel halb
    const schifterProSeite = Math.max(1, Math.round(walmTiefe / spacing));
    const schifterAnzahl = schifterProSeite * 4;           // 2 Walmseiten × 2 Dachflächen
    const schifterLen = +(sparrenLen / 2).toFixed(2);
    members.push(makeMember({
      idPrefix: 'SCH',
      name: `Walmschifter SCH1-SCH${schifterAnzahl}`,
      type: 'sparren',
      material: 'C24',
      width: sprSec.b,
      height: sprSec.h,
      length: schifterLen,
      quantity: schifterAnzahl,
      crossSection: `${sprSec.b / 10}/${sprSec.h / 10}`,
    }));

    assumptions.push({
      field: 'walm.gratsparren',
      value: `4 Gratsparren à ${gratLen} m, ${schifterAnzahl} Schifter à ${schifterLen} m (Mittelwert)`,
      reason: `${_roofType.form === 'walmdach' ? 'Walmdach' : 'Krüppelwalmdach'}: Walmtiefe ${walmTiefe.toFixed(2)} m. Die vier Gratsparren sind eine Querschnittsstufe stärker gewählt, weil sie die Schifter tragen. Die Schifter sind unterschiedlich lang — für Menge und Preis ist der Mittelwert (halbe Sparrenlänge) angesetzt; für den Abbund zählt die Einzellänge aus dem Werkplan.`,
      source: 'derived',
    });
  }

  // ── Mauerbank (Fußpfette): gehört zu JEDEM klassischen Dachstuhl ──────────
  // Liegt auf der Mauerkrone, nimmt die Sparrenfüße (Kerve) auf und wird mit
  // der Mauer verankert. Beidseitig über die volle Gebäudelänge.
  members.push(makeMember({
    idPrefix: 'MB',
    name: 'Fußpfette (Mauerbank) 1-2',
    type: 'pfette',
    material: 'C24',
    width: 140,
    height: 100,
    length: buildingLength,
    quantity: 2,
    crossSection: '14/10',
  }));
  assumptions.push({
    field: 'mauerbank',
    value: '14/10 C24, 2 Stk',
    reason: 'Mauerbank (Fußpfette) 14/10 cm beidseitig auf der Mauerkrone — Auflager der Sparrenfüße, mit Sturmanker zu verankern.',
    source: 'standard',
  });

  // ── Zangen: halten den Dachstuhl in Querrichtung zusammen ────────────────
  // Sparrendach: Zangenpaar unten (Deckenniveau) an jedem 2. Gespärre.
  // Pfettendach mit Mittelpfette: Zangenpaar auf Mittelpfettenhöhe, klemmt
  // Sparren + Mittelpfette (übliche Oststeiermark-Bauweise).
  // Zangen brauchen Gespärre-PAARE — beim Pult-/Flachdach gibt es keine
  // gegenüberliegenden Sparren, dort entfallen sie.
  const hasGespaerre = !isPultdachForm && _roofType.form !== 'flachdach';
  if (hasGespaerre && (sysType === 'sparrendach' || sysType === 'pfettendach_mittelpfette')) {
    const gespaerreCount = Math.ceil(buildingLength / spacing);
    const zangenPaare = Math.max(2, Math.ceil(gespaerreCount / 2));
    const zangenLen = sysType === 'sparrendach'
      ? +(buildingWidth - 0.6).toFixed(2)
      : +(buildingWidth * 0.55).toFixed(2);
    members.push(makeMember({
      idPrefix: 'ZG',
      name: `Zangen Z1-Z${zangenPaare * 2} (paarweise)`,
      type: 'zange',
      material: 'C24',
      width: 60,
      height: 160,
      length: Math.max(zangenLen, 1.0),
      quantity: zangenPaare * 2,
      crossSection: '6/16',
    }));
    assumptions.push({
      field: 'zangen',
      value: `${zangenPaare} Paar 6/16`,
      reason: sysType === 'sparrendach'
        ? `Sparrendach: ${zangenPaare} Zangenpaare 6/16 cm auf Deckenniveau (jedes 2. Gespärre) — nehmen den Horizontalschub auf.`
        : `${zangenPaare} Zangenpaare 6/16 cm auf Mittelpfettenhöhe (jedes 2. Gespärre) — klemmen Sparren + Mittelpfette, halten den Dachstuhl zusammen.`,
      source: 'standard',
    });
  }

  // ── Tragsystem-spezifische Zusatzbauteile ────────────────────────────────

  if (sysType === 'kehlbalkendach') {
    // Kehlbalken: jeder 2. Sparren (Sparrenpaar), auf 2/3 der Firsthöhe.
    // Faktor zentral in standards.ts, damit 3D-Ansicht und Schnitte den
    // Kehlbalken an derselben Stelle zeichnen, an der er gerechnet wird.
    const kehlbalkenHoehe = eavesH + KEHLBALKEN_HOEHENFAKTOR * ridgeHeight;
    const kehlbalkenLen = +(buildingWidth * (ridgeH - kehlbalkenHoehe) / ridgeHeight).toFixed(2);
    // horizontale Länge auf Kehlhöhe (ähnliche Dreiecksrechnung)
    const kehlLen = +(buildingWidth * (1 - (kehlbalkenHoehe - eavesH) / ridgeHeight)).toFixed(2);
    const kehlCount = Math.ceil(sparrenCount / 4); // 1 pro Sparrenpaar, beide Seiten → /4

    assumptions.push({
      field: 'kehlbalken.position',
      value: `${+(kehlbalkenHoehe).toFixed(2)} m ü. FFB`,
      reason: `Kehlbalken auf ${+(KEHLBALKEN_HOEHENFAKTOR * 100).toFixed(0)} % der Firsthöhe positioniert (Regelwerk 2/3).`,
      source: 'standard',
    });

    members.push(makeMember({
      idPrefix: 'KHB',
      name: `Kehlbalken K1-K${kehlCount}`,
      type: 'kehlbalken',
      material: 'C24',
      width: 80,
      height: 160,
      length: Math.max(kehlLen, 1.0),
      quantity: kehlCount,
      crossSection: '8/16',
    }));

    assumptions.push({
      field: 'kehlbalken.crossSection',
      value: '8/16',
      reason: 'Standard-Querschnitt 8/16 cm C24 für Kehlbalken angenommen.',
      source: 'standard',
    });
  }

  if (sysType === 'pfettendach' || sysType === 'pfettendach_mittelpfette' || sysType === 'sonderfall') {
    // Firstpfette — Querschnitt aus Planbeschriftung, wenn vorhanden
    const pfSec = planSec('pfette', 100, 220);
    members.push(makeMember({
      idPrefix: 'FP',
      name: 'Firstpfette FP1',
      type: 'pfette',
      material: 'C24',
      width: pfSec.b,
      height: pfSec.h,
      // Beim Walmdach ist der First KÜRZER als das Gebäude — er endet dort, wo
      // die Gratsparren zusammenlaufen.
      length: firstLaenge,
      quantity: 1,
      crossSection: `${pfSec.b / 10}/${pfSec.h / 10}`,
    }));

    if (!pfSec.fromPlan) {
      assumptions.push({
        field: 'firstpfette.crossSection',
        value: '10/22',
        reason: 'Standard-Querschnitt 10/22 cm C24 für Firstpfette angenommen.',
        source: 'standard',
      });
    }

    if (sysType === 'pfettendach_mittelpfette') {
      // Mittelpfette je Dachseite
      const mittelpfetteHoehe = eavesH + ridgeHeight / 2;
      assumptions.push({
        field: 'mittelpfette.position',
        value: `${+mittelpfetteHoehe.toFixed(2)} m ü. FFB`,
        reason: 'Mittelpfette auf halber Dachhöhe positioniert (Hälfte zwischen Traufe und First).',
        source: 'standard',
      });

      for (let side = 1; side <= 2; side++) {
        members.push(makeMember({
          idPrefix: 'MP',
          name: `Mittelpfette MP${side}`,
          type: 'pfette',
          material: 'C24',
          width: pfSec.b,
          height: pfSec.h,
          length: buildingLength,
          quantity: 1,
          crossSection: `${pfSec.b / 10}/${pfSec.h / 10}`,
        }));
      }

      assumptions.push({
        field: 'mittelpfette.crossSection',
        value: '10/22',
        reason: 'Standard-Querschnitt 10/22 cm C24 für Mittelpfetten angenommen.',
        source: 'standard',
      });
    }

    // Stützen (Steher): Im Massivbau lagern Pfetten auf Giebel- und tragenden
    // Innenwänden — Holzsteher gibt es dort NICHT flächendeckend, sondern nur
    // 1–2 Stück zur Lastverteilung, und nur wo tragende Wände/Unterzüge darunter
    // stehen (Zimmerer-Praxis; Hinweis vom Nutzer). Volle Steher-Reihen nur,
    // wenn der Nutzer den Stützenabstand im Tragwerk-Tab EXPLIZIT setzt
    // (z.B. Holzriegelbau/offene Halle).
    // REGEL DES AUFTRAGGEBERS: Wo im Plan KEIN Holzsteher eingezeichnet ist,
    // wird auch keiner erzeugt und keiner gezeichnet. Ein Steher entsteht nur
    // aus einem Beleg:
    //   (a) der Nutzer setzt den Stützenabstand im Tragwerk-Tab (Holzriegelbau,
    //       offene Halle) → volle Steherreihen, oder
    //   (b) der Plan beschriftet einen Stützenquerschnitt (z.B. "Stütze 12/12")
    //       → es gibt Steher, Anzahl aus dem Stützenabstand.
    // Sonst: KEINE Steher. Die Pfetten liegen dann auf Giebel- und tragenden
    // Innenwänden — das ist Mauerwerk und damit bauseits, kein Zimmererholz.
    const stuetzenAbstand = structuralSystem.supportSpacing ?? 4.0;
    const explicitSpacing = structuralSystem.supportSpacing != null;
    const stuetzeImPlan = !!opts?.planSections?.some(s => s.member === 'stuetze');
    const stuetzenBelegt = explicitSpacing || stuetzeImPlan;
    const stuetzenAnzahlFirst = stuetzenBelegt
      ? Math.max(1, Math.ceil(buildingLength / stuetzenAbstand) - 1)
      : 0;
    if (!stuetzenBelegt) {
      assumptions.push({
        field: 'stuetze.auflager',
        value: 'keine Holzsteher',
        reason: `Im Plan ist kein Holzsteher eingezeichnet oder beschriftet — es werden deshalb KEINE angesetzt und keine gezeichnet. ` +
          `Die Pfetten liegen auf den Giebelwänden und auf tragenden Innenwänden (bauseits, Mauerwerk); die statische Stützweite ist mit ${stuetzenAbstand} m angenommen. ` +
          `Falls die Innenwände fehlen oder doch Steher gewünscht sind: im Tragwerk-Tab den Stützenabstand setzen, dann werden Steher erzeugt, bemessen und eingepreist.`,
        source: 'standard',
      });
    } else if (stuetzeImPlan && !explicitSpacing) {
      assumptions.push({
        field: 'stuetze.auflager',
        value: `${stuetzenAnzahlFirst} Steher je Pfettenreihe`,
        reason: `Der Plan beschriftet einen Stützenquerschnitt — es gibt also Holzsteher. Anzahl aus dem angenommenen Stützenabstand ${stuetzenAbstand} m abgeleitet. Positionen am Plan prüfen.`,
        source: 'derived',
      });
    }
    const stuetzenHoehe = +(ridgeH / 2 - 2.5).toFixed(2); // vereinfacht: halbe Gebäudehöhe - Deckenebene

    const stuetzenHoeheKorrekt = Math.max(stuetzenHoehe, 0.5); // mindestens 0.5 m sinnvoll
    if (stuetzenHoehe !== stuetzenHoeheKorrekt) {
      assumptions.push({
        field: 'stuetze.height',
        value: stuetzenHoeheKorrekt,
        reason: 'Berechnete Stützenhöhe < 0.5 m — auf Minimum 0.5 m begrenzt.',
        source: 'fallback',
      });
    }

    const pfettenCount = sysType === 'pfettendach_mittelpfette' ? 3 : 1; // First + 2 × Mitte
    const totalStuetzen = stuetzenAnzahlFirst * pfettenCount;

    // Ohne Beleg im Plan entsteht KEIN Steher-Bauteil — dann steht auch nichts
    // in der Stückliste, im Angebot und in keiner Zeichnung.
    if (totalStuetzen > 0) {
      const stSec = planSec('stuetze', 100, 100);
      members.push(makeMember({
        idPrefix: 'ST',
        name: `Stützen ST1-ST${totalStuetzen}`,
        type: 'stuetze',
        material: 'C24',
        width: stSec.b,
        height: stSec.h,
        length: stuetzenHoeheKorrekt,
        quantity: totalStuetzen,
        crossSection: `${stSec.b / 10}/${stSec.h / 10}`,
      }));

      assumptions.push({
        field: 'stuetze.spacing',
        value: stuetzenAbstand,
        reason: `Stützenabstand ${stuetzenAbstand} m angenommen (übliche Feldlänge für KVH-Pfetten).`,
        source: 'standard',
      });
      if (!stSec.fromPlan) {
        assumptions.push({
          field: 'stuetze.crossSection',
          value: '10/10',
          reason: 'Standard-Querschnitt 10/10 cm C24 für Pfettenstützen angenommen.',
          source: 'standard',
        });
      }
    }

    // KEINE automatischen Zwischensteher-Reihen: große Sparrenstützweiten werden
    // über die Mittelpfette abgetragen (die auf tragenden Wänden lagert), nicht
    // über Steher-Wälder unter jedem 2. Sparren. Steher nur, wenn der Plan sie
    // zeigt (Holzriegelbau/Halle → Stützenabstand im Tragwerk-Tab setzen).
    const halfSpan = buildingWidth / 2;
    if (halfSpan > 4.5 && sysType !== 'pfettendach_mittelpfette') {
      assumptions.push({
        field: 'sparren.stuetzweite',
        value: `${halfSpan.toFixed(1)} m`,
        reason: `Sparrenstützweite ${halfSpan.toFixed(1)} m ist groß — Mittelpfette (Tragsystem „Pfettendach mit Mittelpfette") oder tragende Zwischenwand lt. Plan prüfen.`,
        source: 'derived',
      });
    }
  }

  if (sysType === 'leimbinder_haupttraeger') {
    // BSH-Hauptträger alle 4-5 m (Mittelwert 4.5 m)
    const traegerAbstand = 4.5;
    const traegerCount = Math.max(2, Math.ceil(buildingLength / traegerAbstand) + 1);
    const traegerLen = buildingWidth;

    members.push(makeMember({
      idPrefix: 'LB',
      name: `Leimbinder LB1-LB${traegerCount}`,
      type: 'leimbinder',
      material: 'GL24h',
      width: 120,
      height: 400,
      length: traegerLen,
      quantity: traegerCount,
      crossSection: '12/40',
    }));

    assumptions.push({
      field: 'leimbinder.spacing',
      value: traegerAbstand,
      reason: `Leimbinder-Abstand ${traegerAbstand} m angenommen (wirtschaftlicher Regelabstand für GL24h).`,
      source: 'standard',
    });
    assumptions.push({
      field: 'leimbinder.crossSection',
      value: '12/40',
      reason: 'Vorläufiger BSH-Querschnitt 12/40 cm GL24h — wird durch Optimizer optimiert.',
      source: 'standard',
    });

    // Nebenträger (Sparren) bereits oben eingefügt, material gleich lassen
    // Querschnitt für Nebenträger anpassen
    const nebentraeger = members.find(m => m.type === 'sparren');
    if (nebentraeger) {
      nebentraeger.name = nebentraeger.name.replace('Sparren', 'Nebenträger/Sparren');
      nebentraeger.type = 'nebentraeger';
    }
  }

  // ── Beschreibung ─────────────────────────────────────────────────────────

  const memberSummary = members.map(m => `${m.name} (${m.crossSection} ${m.material}, n=${m.quantity})`).join('; ');
  const description =
    `Tragsystem „${sysType}": ${members.length} Bauteiltypen generiert — ${memberSummary}. ` +
    `Sparrenabstand ${spacing * 100} cm, Sparrenlänge ${sparrenLen} m. ` +
    `Alle Querschnitte vorläufig (calculationStatus=yellow), Optimizer-Schritt ausstehend.`;

  // ── Deckenbalken aus erkannten Decken (nur Holzbalkendecken) ────────────────
  if (opts?.ceilings && opts.ceilings.length > 0) {
    for (const ceiling of opts.ceilings) {
      const cType = ceiling.constructionType;
      // STB-Decken: überspringen, Annahme eintragen
      if (cType === 'stb_decke' || cType === 'rippendecke') {
        assumptions.push({
          field: `decke.${ceiling.id}`,
          value: 'nicht im Holzauszug',
          reason: `${cType === 'stb_decke' ? 'STB-Decke' : 'Rippendecke'} ${ceiling.level}: außerhalb Zimmerei-Lieferumfang — vom Statiker für Beton separat zu berechnen.${ceiling.evidence ? ` Nachweis: ${ceiling.evidence}` : ''}`,
          source: 'derived',
        });
        continue;
      }
      // unbekannt: Holzbalkendecke als Default (mit Warnung)
      if (cType === 'unbekannt') {
        assumptions.push({
          field: `decke.${ceiling.id}.typ`,
          value: 'holzbalkendecke (angenommen)',
          reason: `Decke ${ceiling.level}: Konstruktionstyp unklar — Holzbalkendecke angenommen. Bitte im Plan prüfen!`,
          source: 'fallback',
        });
      }
      const spec = { span: ceiling.span, area: ceiling.area, nutzung: ceiling.nutzung };
      const { b, h, spacing } = suggestCeilingBeam(spec);
      const orthoSpan = ceiling.area / ceiling.span;
      const count = Math.ceil(orthoSpan / spacing);
      const cs = `${b / 10}/${h / 10}`;
      members.push(makeMember({
        idPrefix: 'DB',
        name: `Deckenbalken ${ceiling.level}`,
        type: 'nebentraeger',
        material: 'C24',
        width: b,
        height: h,
        length: ceiling.span,
        quantity: count,
        crossSection: cs,
      }));
      assumptions.push({
        field: `decke.${ceiling.id}`,
        value: `${count}× ${cs} C24 @ ${spacing * 100} cm`,
        reason: `Holzbalkendecke ${ceiling.level} (${ceiling.nutzung}, ${ceiling.area} m², Spannweite ${ceiling.span} m): ` +
          `${count} Deckenbalken ${cs} C24, Achsabstand ${spacing * 100} cm (Daumenregel h=L/${spec.nutzung === 'Spitzboden' ? 20 : 17}).`,
        source: 'derived',
      });
    }
  }

  // ── Wand-Konstruktionen: Annahmen eintragen (keine Holz-Member für STB/Ziegel) ──
  if (opts?.wallConstructions && opts.wallConstructions.length > 0) {
    const stbLevels = opts.wallConstructions.filter(w => w.type === 'stb').map(w => w.level);
    const ziegelLevels = opts.wallConstructions.filter(w => w.type === 'ziegel').map(w => w.level);
    const holzLevels = opts.wallConstructions.filter(w => ['holzstaender', 'kvh', 'bsh'].includes(w.type)).map(w => w.level);

    if (stbLevels.length > 0) {
      assumptions.push({
        field: 'waende.stb',
        value: stbLevels.join(', '),
        reason: `Wände ${stbLevels.join(', ')}: STB → außerhalb Zimmerei-Lieferumfang. Keine Wand-Member im Holzauszug.`,
        source: 'derived',
      });
    }
    if (ziegelLevels.length > 0) {
      assumptions.push({
        field: 'waende.ziegel',
        value: ziegelLevels.join(', '),
        reason: `Wände ${ziegelLevels.join(', ')}: Ziegelmauerwerk → außerhalb Zimmerei-Lieferumfang. Keine Wand-Member im Holzauszug.`,
        source: 'derived',
      });
    }
    if (holzLevels.length > 0) {
      assumptions.push({
        field: 'waende.holz',
        value: holzLevels.join(', '),
        reason: `Wände ${holzLevels.join(', ')}: Holzständerbau — ggf. Schwellen + Riegel in Kostenschätzung ergänzen (separater Schritt).`,
        source: 'derived',
      });
    }
  }

  // Stoßstellen-Aufteilung: Stützpositionen aus Stützen ableiten
  const stuetzen = members.filter(m => m.type === 'stuetze');
  const stuetzPositions: number[] = [];
  if (stuetzen.length > 0) {
    const stuetzenAbstand = structuralSystem.supportSpacing ?? 4.0;
    const stuetzenAnz = Math.max(1, Math.ceil(buildingLength / stuetzenAbstand) - 1);
    for (let i = 1; i <= stuetzenAnz; i++) {
      stuetzPositions.push(+(i * stuetzenAbstand).toFixed(2));
    }
  }

  const { splitMembers, joints } = applySplitJoints(members, stuetzPositions, assumptions);
  return { members: splitMembers, assumptions, description, joints };
}

// ────────────────────────────────────────────────────────────────────────────
// Hilfsfunktion: Stoßstellen-Aufteilung
// ────────────────────────────────────────────────────────────────────────────

function applySplitJoints(
  members: TimberMember[],
  supportPositions: number[],
  assumptions: AutoAssumption[],
): { splitMembers: TimberMember[]; joints: JointSpec[] } {
  const splitMembers: TimberMember[] = [];
  const allJoints: JointSpec[] = [];

  for (const member of members) {
    const { segments, joints } = splitMemberAtJoints(member, supportPositions.length > 0 ? supportPositions : undefined);
    splitMembers.push(...segments);
    allJoints.push(...joints);
    if (joints.length > 0) {
      assumptions.push({
        field: `stoss.${member.id}`,
        value: joints.length,
        reason: `${member.name} (L=${member.length} m) überschreitet Standard-Lieferlänge → ${joints.length} Stoß/Stöße bei ${joints.map(j => j.position.toFixed(2) + ' m').join(', ')}.`,
        source: 'standard',
      });
    }
  }

  return { splitMembers, joints: allJoints };
}
