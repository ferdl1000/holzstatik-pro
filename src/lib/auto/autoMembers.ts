/**
 * autoMembers.ts
 *
 * Erzeugt eine vollständige Bauteil-Liste (TimberMember[]) aus:
 * - Gebäudegeometrie (autoDeriveGeometry bereits gelaufen)
 * - Dachform (RoofType)
 * - Tragsystem (StructuralSystem)
 */

import type { BuildingGeometry, RoofType, StructuralSystem, TimberMember } from '@/types/project';
import type { AutoAssumption, AutoMembersResult } from '@/lib/auto/contracts';

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

// ────────────────────────────────────────────────────────────────────────────
// Haupt-Export
// ────────────────────────────────────────────────────────────────────────────

export function autoGenerateMembers(
  geometry: BuildingGeometry,
  _roofType: RoofType,
  structuralSystem: StructuralSystem,
  opts?: { sparrenSpacing?: number },
): AutoMembersResult {
  _idCounter = 0; // reset für deterministische IDs

  const assumptions: AutoAssumption[] = [];
  const members: TimberMember[] = [];

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

  const sparrenLen = +sparrenLaenge(geometry).toFixed(2);
  const sparrenCount = sparrenAnzahl(buildingLength, spacing);
  const ridgeHeight = ridgeH - eavesH; // Höhe über Traufe

  const sysType = structuralSystem.type;

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
    reason: 'Standard-KVH-Querschnitt 8/16 cm C24 für Sparren angenommen — wird durch Optimizer verifiziert.',
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

  return { members, assumptions, description };
}
