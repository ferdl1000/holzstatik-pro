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
import { splitMemberAtJoints, suggestCeilingBeam } from '@/lib/auto/standards';
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
  opts?: { sparrenSpacing?: number; ceilings?: CeilingArea[]; wallConstructions?: WallConstruction[] },
): AutoMembersResult {
  _idCounter = 0; // reset für deterministische IDs

  const assumptions: AutoAssumption[] = [];
  const members: TimberMember[] = [];

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
  const sparrenLen = +sparrenLenRaw.toFixed(2);
  const sparrenCount = isPultdachForm
    ? sparrenAnzahlPultdach(buildingLength, spacing)
    : sparrenAnzahl(buildingLength, spacing);
  const ridgeHeight = ridgeH - eavesH; // Höhe über Traufe

  const sysType = structuralSystem.type;

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
  const sparren = makeMember({
    idPrefix: 'SPR',
    name: `Sparren S1-S${sparrenCount}`,
    type: 'sparren',
    material: 'C24',
    width: 80,
    height: 160,
    length: sparrenLen,
    quantity: sparrenCount,
    crossSection: '8/16',
  });
  members.push(sparren);

  assumptions.push({
    field: 'sparren.crossSection',
    value: '8/16',
    reason: isPultdachForm
      ? `Standard-KVH-Querschnitt 8/16 cm C24 für Pultdach-Sparren angenommen (eine Seite, Länge ${sparrenLen} m über volle Gebäudebreite) — wird durch Optimizer verifiziert.`
      : 'Standard-KVH-Querschnitt 8/16 cm C24 für Sparren angenommen — wird durch Optimizer verifiziert.',
    source: 'standard',
  });

  // ── Tragsystem-spezifische Zusatzbauteile ────────────────────────────────

  if (sysType === 'kehlbalkendach') {
    // Kehlbalken: jeder 2. Sparren (Sparrenpaar), auf 2/3 der Firsthöhe
    const kehlbalkenHoehe = eavesH + (2 / 3) * ridgeHeight;
    const kehlbalkenLen = +(buildingWidth * (ridgeH - kehlbalkenHoehe) / ridgeHeight).toFixed(2);
    // horizontale Länge auf Kehlhöhe (ähnliche Dreiecksrechnung)
    const kehlLen = +(buildingWidth * (1 - (kehlbalkenHoehe - eavesH) / ridgeHeight)).toFixed(2);
    const kehlCount = Math.ceil(sparrenCount / 4); // 1 pro Sparrenpaar, beide Seiten → /4

    assumptions.push({
      field: 'kehlbalken.position',
      value: `${+(kehlbalkenHoehe).toFixed(2)} m ü. FFB`,
      reason: `Kehlbalken auf 2/3 der Firsthöhe (${+(2 / 3 * 100).toFixed(0)} %) positioniert (Regelwerk).`,
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
    // Firstpfette
    members.push(makeMember({
      idPrefix: 'FP',
      name: 'Firstpfette FP1',
      type: 'pfette',
      material: 'C24',
      width: 100,
      height: 220,
      length: buildingLength,
      quantity: 1,
      crossSection: '10/22',
    }));

    assumptions.push({
      field: 'firstpfette.crossSection',
      value: '10/22',
      reason: 'Standard-Querschnitt 10/22 cm C24 für Firstpfette angenommen.',
      source: 'standard',
    });

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
          width: 100,
          height: 220,
          length: buildingLength,
          quantity: 1,
          crossSection: '10/22',
        }));
      }

      assumptions.push({
        field: 'mittelpfette.crossSection',
        value: '10/22',
        reason: 'Standard-Querschnitt 10/22 cm C24 für Mittelpfetten angenommen.',
        source: 'standard',
      });
    }

    // Stützen alle 4 m unter First- und ggf. Mittelpfette
    const stuetzenAbstand = 4.0;
    const stuetzenAnzahlFirst = Math.max(1, Math.ceil(buildingLength / stuetzenAbstand) - 1);
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

    members.push(makeMember({
      idPrefix: 'ST',
      name: `Stützen ST1-ST${totalStuetzen}`,
      type: 'stuetze',
      material: 'C24',
      width: 100,
      height: 100,
      length: stuetzenHoeheKorrekt,
      quantity: totalStuetzen,
      crossSection: '10/10',
    }));

    assumptions.push({
      field: 'stuetze.spacing',
      value: stuetzenAbstand,
      reason: `Stützenabstand ${stuetzenAbstand} m angenommen (übliche Feldlänge für KVH-Pfetten).`,
      source: 'standard',
    });
    assumptions.push({
      field: 'stuetze.crossSection',
      value: '10/10',
      reason: 'Standard-Querschnitt 10/10 cm C24 für Pfettenstützen angenommen.',
      source: 'standard',
    });

    // Zwischensteher (Auflagerung Sparren in der Mitte) wenn Sparrenstützweite > 3.5 m
    const halfSpan = buildingWidth / 2;  // klassische Sparrenstützweite ist halbe Gebäudebreite
    if (halfSpan > 3.5) {
      const zwischenAbstand = 0.8 * 2; // jeder 2. Sparren
      const zwischenstAnzahl = Math.max(2, Math.ceil(buildingLength / zwischenAbstand) * 2); // beide Seiten
      const zwischenstHoehe = +(ridgeHeight * 0.5).toFixed(2);
      members.push(makeMember({
        idPrefix: 'ZS',
        name: `Zwischensteher ZS1-ZS${zwischenstAnzahl}`,
        type: 'stuetze',
        material: 'C24',
        width: 100,
        height: 100,
        length: zwischenstHoehe,
        quantity: zwischenstAnzahl,
        crossSection: '10/10',
      }));
      assumptions.push({
        field: 'zwischensteher',
        value: `${zwischenstAnzahl} Stk`,
        reason: `Sparrenstützweite ${halfSpan.toFixed(1)} m > 3,5 m → Zwischensteher in halber Höhe alle 1.6 m (jeder 2. Sparren), beide Dachseiten. Höhe ${zwischenstHoehe} m, 10/10 cm.`,
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
    const stuetzenAbstand = 4.0;
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
