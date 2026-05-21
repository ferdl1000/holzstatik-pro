/**
 * Zentrales Berechnungs-Modul.
 *
 * Public API – alles was die UI braucht.
 */

export * from './materials';
export * from './sections/properties';
export * from './loads/snow';
export * from './loads/wind';
export * from './loads/dead';
export * from './loads/combinations';
export * from './timber/beam';
export * from './timber/column';
export * from './timber/glulam';
export * from './timber/optimizer';

import { calculateSnowLoad, SNOW_ZONE_BY_STATE, type SnowZone } from './loads/snow';
import { calculateWindLoad, WIND_ZONE_BY_STATE, type WindZone } from './loads/wind';
import { calculateDeadLoad, DEFAULT_TILED_ROOF, type DeadLoadComposition } from './loads/dead';

export interface AutoLoadInput {
  state: string;             // Bundesland
  altitude: number;
  roofPitch: number;
  roofForm: 'satteldach' | 'pultdach' | 'walmdach' | 'flachdach' | 'krueppelwalmdach' | 'mischform';
  buildingHeight: number;
  exposure?: 'normal' | 'windExposed' | 'sheltered';
  terrain?: '0' | 'I' | 'II' | 'III' | 'IV';
  deadComposition?: DeadLoadComposition;
}

/**
 * Bequemer Einstiegspunkt: Liefert komplette Lastenermittlung aus Standort+Geometrie.
 */
export function autoLoads(input: AutoLoadInput) {
  const snowZone = (SNOW_ZONE_BY_STATE[input.state] || '2') as SnowZone;
  const windZone = (WIND_ZONE_BY_STATE[input.state] || '2') as WindZone;
  const terrain = input.terrain || (input.altitude < 200 ? 'II' : input.altitude < 600 ? 'III' : 'I');

  const snow = calculateSnowLoad({
    zone: snowZone, altitude: input.altitude, roofPitch: input.roofPitch,
    roofForm: input.roofForm, exposure: input.exposure || 'normal', heated: false,
  });

  const wind = calculateWindLoad({
    zone: windZone, terrain, buildingHeight: input.buildingHeight,
    roofPitch: input.roofPitch, roofForm: input.roofForm,
  });

  const dead = calculateDeadLoad(input.deadComposition || DEFAULT_TILED_ROOF);

  return {
    snow, wind, dead,
    summary: {
      g_k: dead.gk,
      s_k: snow.s,
      w_pressure: wind.we.pressure,
      w_suction: wind.we.suction,
    },
  };
}
