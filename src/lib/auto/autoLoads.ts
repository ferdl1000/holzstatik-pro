/**
 * Automatische Lasten-Ermittlung.
 *
 * Bestimmt Schnee-, Wind- und Eigenlasten aus Adresse + Geometrie.
 * Fallback auf sinnvolle Defaults wenn keine Adresse vorhanden.
 *
 * Normen: ÖNORM B 1991-1-1 / -1-3 / -1-4
 */

import type { ExtractedAddress, BuildingGeometry, LoadCase } from '@/types/project';
import type { AutoLoadsResult, AutoAssumption } from './contracts';
import { lookupPlzNearest } from '@/lib/geo/plzDatabase';
import { calculateSnowLoad, SNOW_ZONE_BY_STATE } from '@/lib/calc/loads/snow';
import { calculateWindLoad, WIND_ZONE_BY_STATE } from '@/lib/calc/loads/wind';
import { calculateDeadLoad, DEFAULT_TILED_ROOF } from '@/lib/calc/loads/dead';
import type { SnowZone } from '@/lib/calc/loads/snow';
import type { WindZone, TerrainCategory } from '@/lib/calc/loads/wind';

/** Interne UUID-Generierung (ohne externe Dependency) */
function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function autoComputeLoads(
  address: ExtractedAddress | undefined,
  geometry: BuildingGeometry,
  roofForm: 'satteldach' | 'pultdach' | 'walmdach' | 'flachdach' | 'krueppelwalmdach' | 'mischform',
): AutoLoadsResult {
  const assumptions: AutoAssumption[] = [];

  // ─── 1. Geozonen aus PLZ-Datenbank oder Fallback ───────────────────────────

  const plzEntry = lookupPlzNearest(address?.postalCode);

  let snowZone: SnowZone;
  let windZone: WindZone;
  let terrain: TerrainCategory;
  let altitude: number;
  let state: string;
  let zonesFromDb: boolean;

  if (plzEntry) {
    snowZone = plzEntry.snowZone;
    windZone = plzEntry.windZone;
    terrain  = plzEntry.terrain;
    altitude = address?.elevation ?? plzEntry.elevation;
    state    = plzEntry.state;
    zonesFromDb = true;
  } else if (address?.state && (SNOW_ZONE_BY_STATE[address.state] || WIND_ZONE_BY_STATE[address.state])) {
    // Fallback auf Bundesland-Default
    state    = address.state;
    snowZone = (SNOW_ZONE_BY_STATE[state] as SnowZone) ?? '2';
    windZone = (WIND_ZONE_BY_STATE[state] as WindZone) ?? '2';
    terrain  = (address.terrainCategory as TerrainCategory) ?? 'III';
    altitude = address.elevation ?? 300;
    zonesFromDb = false;
    assumptions.push({
      field: 'snowZone',
      value: snowZone,
      reason: `PLZ nicht in Datenbank – Bundesland-Default für ${state} verwendet`,
      source: 'fallback',
    });
    assumptions.push({
      field: 'windZone',
      value: windZone,
      reason: `PLZ nicht in Datenbank – Bundesland-Default für ${state} verwendet`,
      source: 'fallback',
    });
  } else {
    // Letzter Fallback: Niederösterreich / Zone 2
    state    = 'Niederösterreich';
    snowZone = '2';
    windZone = '2';
    terrain  = 'III';
    altitude = 200;
    zonesFromDb = false;
    assumptions.push({
      field: 'location',
      value: 'Niederösterreich, Zone 2/2/III, 200 m',
      reason: 'Keine Adresse vorhanden – Minimum-Standardwert (Niederösterreich) verwendet',
      source: 'default',
    });
  }

  // PLZ-Lookup-Annahme protokollieren
  if (zonesFromDb && plzEntry) {
    if (address?.postalCode && plzEntry.plz !== address.postalCode) {
      assumptions.push({
        field: 'postalCode',
        value: plzEntry.plz,
        reason: `Exakte PLZ ${address.postalCode} nicht in DB – nächste bekannte PLZ ${plzEntry.plz} (${plzEntry.city}) verwendet`,
        source: 'derived',
      });
    }
    if (address?.elevation) {
      assumptions.push({
        field: 'altitude',
        value: altitude,
        reason: 'Seehöhe aus extrahierter Adresse übernommen',
        source: 'derived',
      });
    }
  }

  const confidence = zonesFromDb ? 0.9 : 0.6;
  const confidenceLabel = zonesFromDb ? 'hoch (aus PLZ-Datenbank)' : 'mittel (Default-Wert)';

  // ─── 2. Geometrie ──────────────────────────────────────────────────────────

  const roofPitch = geometry.roofPitch?.value ?? 35;
  const ridgeHeight = geometry.ridgeHeight?.value ?? (geometry.eavesHeight?.value ?? 6) + 2;

  if (!geometry.roofPitch?.value) {
    assumptions.push({
      field: 'roofPitch',
      value: roofPitch,
      reason: 'Dachneigung nicht aus Plan extrahiert – 35° als typischer Wert angenommen',
      source: 'default',
    });
  }

  // ─── 3. Schneelast ────────────────────────────────────────────────────────

  const snowResult = calculateSnowLoad({
    zone: snowZone,
    altitude,
    roofPitch,
    roofForm,
    exposure: 'normal',
    heated: false,
  });

  // ─── 4. Windlast ──────────────────────────────────────────────────────────

  const windResult = calculateWindLoad({
    zone: windZone,
    terrain,
    buildingHeight: ridgeHeight,
    roofPitch,
    roofForm,
  });

  // ─── 5. Eigengewicht ──────────────────────────────────────────────────────

  const deadResult = calculateDeadLoad(DEFAULT_TILED_ROOF);

  assumptions.push({
    field: 'roofComposition',
    value: 'Tondachziegel + Lattung + Mineralwolle 200mm + GK 12,5mm',
    reason: `Standard-Wohndach-Aufbau (DEFAULT_TILED_ROOF) angenommen: ${deadResult.gk.toFixed(2)} kN/m². Kann im Lastmodul angepasst werden.`,
    source: 'standard',
  });

  // ─── 6. LoadCases zusammenstellen ────────────────────────────────────────

  const snowSource = `ÖNORM B 1991-1-3, Zone ${snowZone} (${confidenceLabel}), ${snowResult.zoneLabel}`;
  const windSource = `ÖNORM B 1991-1-4, ${windResult.zoneLabel}, Gelände ${terrain} (${confidenceLabel})`;

  const loadCases: LoadCase[] = [
    // Eigengewicht (ständig)
    {
      id: makeId('lc_eg'),
      name: 'Eigengewicht Dachaufbau',
      type: 'permanent',
      value: deadResult.gk,
      unit: 'kN/m²',
      source: `ÖNORM B 1991-1-1; ${deadResult.layersBreakdown.map(l => l.name).join(' + ')}`,
      confidence,
      isEditable: true,
      userModified: false,
      parameters: {
        gk: deadResult.gk,
        layers: deadResult.layersBreakdown.map(l => `${l.name}: ${l.weight.toFixed(2)} kN/m²`).join('; '),
      },
    },

    // Schneelast
    {
      id: makeId('lc_sn'),
      name: 'Schneelast',
      type: 'snow',
      value: snowResult.s,
      unit: 'kN/m²',
      source: snowSource,
      confidence,
      isEditable: true,
      userModified: false,
      parameters: {
        zone: snowZone,
        altitude,
        sk: snowResult.sk,
        mu: snowResult.mu,
        Ce: snowResult.Ce,
        Ct: snowResult.Ct,
        s: snowResult.s,
        roofPitch,
        state,
      },
    },

    // Windlast Druck
    {
      id: makeId('lc_wd'),
      name: 'Windlast Druck',
      type: 'wind',
      value: windResult.we.pressure,
      unit: 'kN/m²',
      source: windSource,
      confidence,
      isEditable: true,
      userModified: false,
      parameters: {
        zone: windZone,
        terrain,
        vb: windResult.vb,
        qb: windResult.qb,
        ce: windResult.ce,
        qp: windResult.qp,
        cpe_pressure: windResult.cpe.pressure,
        we_pressure: windResult.we.pressure,
        buildingHeight: ridgeHeight,
        roofPitch,
      },
    },

    // Windlast Sog (negativ!)
    {
      id: makeId('lc_ws'),
      name: 'Windlast Sog',
      type: 'wind',
      value: windResult.we.suction,   // bereits negativ aus calculateWindLoad
      unit: 'kN/m²',
      source: windSource,
      confidence,
      isEditable: true,
      userModified: false,
      parameters: {
        zone: windZone,
        terrain,
        cpe_suction: windResult.cpe.suction,
        we_suction: windResult.we.suction,
        note: 'Negativ = abhebend (Sog). Für Verankerungsnachweis maßgebend.',
      },
    },

    // Nutzlast Wartung (begehbares Wartungsdach nach ÖNORM)
    {
      id: makeId('lc_wt'),
      name: 'Nutzlast Wartung',
      type: 'maintenance',
      value: 1.0,
      unit: 'kN/m²',
      source: 'ÖNORM B 1991-1-1 Tab. 6.1 – Kategorie H (Dächer, nur Wartungszwecke)',
      confidence: 0.95,
      isEditable: true,
      userModified: false,
      parameters: {
        qk: 1.0,
        category: 'H',
        note: 'Für Zugang zu Dachaufbauten (Kamin, Antenne). Nicht mit Schneelast kombinieren wenn ungünstiger.',
      },
    },
  ];

  // Einseitiger Schnee-Lastfall (Satteldach ≥ 15°)
  if (snowResult.asymmetric) {
    loadCases.push({
      id: makeId('lc_sna'),
      name: 'Schneelast einseitig (Verwehung)',
      type: 'snow',
      value: snowResult.asymmetric.leeward,
      unit: 'kN/m²',
      source: `${snowSource} – einseitiger Lastfall nach EC1-1-3 Abschn. 5.3.3`,
      confidence,
      isEditable: true,
      userModified: false,
      parameters: {
        windward: snowResult.asymmetric.windward,
        leeward: snowResult.asymmetric.leeward,
        note: 'Luvseitig 50% – Leeseitig 100% der symmetrischen Schneelast. Kritisch für Pfettenlast.',
      },
    });
  }

  return {
    loadCases,
    assumptions,
    snowZone,
    windZone,
    terrain,
    altitude,
    state,
  };
}
