/**
 * Schnee- und Windzonen-Zuordnung für Österreich basierend auf Postleitzahl
 * bzw. Bundesland + Bezirk.
 *
 * Werte aus ÖNORM B 1991-1-3 (Schnee) und ÖNORM B 1991-1-4 (Wind).
 * Vereinfachung: nicht jede Gemeinde einzeln, sondern Mapping nach PLZ-Bereichen
 * mit Korrektur für bekannte Sonderfälle (Hochgebirge, exponierte Lagen).
 *
 * Für genaue Werte muss Gemeinde-Zonenkarte konsultiert werden – wir liefern
 * brauchbare Default-Werte, die Anwender kann sie im Admin pro PLZ feintunen.
 */

import type { SnowZone } from '../calc/loads/snow';
import type { WindZone, TerrainCategory } from '../calc/loads/wind';
import { SNOW_ZONE_BY_STATE } from '../calc/loads/snow';
import { WIND_ZONE_BY_STATE } from '../calc/loads/wind';

/** PLZ-Bereich → Bundesland (vereinfacht) */
function plzToState(plz: string): string {
  const n = parseInt(plz);
  if (n >= 1000 && n < 2000) return 'Wien';
  if (n >= 2000 && n < 4000) return 'Niederösterreich';
  if (n >= 7000 && n < 8000) return 'Burgenland';
  if (n >= 4000 && n < 5000) return 'Oberösterreich';
  if (n >= 5000 && n < 6000) return 'Salzburg';
  if (n >= 6000 && n < 7000) return 'Tirol';
  if (n >= 6800 && n < 6999) return 'Vorarlberg';
  if (n >= 8000 && n < 9000) return 'Steiermark';
  if (n >= 9000 && n < 10000) return 'Kärnten';
  return 'Niederösterreich';
}

/**
 * Sonderfälle: bekannte Hochgebirgs-/Talkessel-PLZ mit abweichender Zone.
 * Hier nur Beispiele – pro Gemeinde feintunbar via Admin.
 */
const SNOW_ZONE_OVERRIDES: Record<string, SnowZone> = {
  // Innergebirg / Pongau / Pinzgau
  '5550': '4', '5600': '4', '5640': '4', '5710': '4',
  // Tiroler Hochtäler
  '6500': '4', '6580': '4', '6671': '4',
  // Vorarlberg Bregenzerwald
  '6863': '4', '6883': '4',
  // Mariazell / Hochsteiermark
  '8630': '4',
};

const WIND_ZONE_OVERRIDES: Record<string, WindZone> = {
  // Burgenland Ost-Exposition
  '7000': '4', '7100': '4', '7400': '4',
  // Wiener Becken
  '1010': '3', '1100': '3', '2700': '3',
};

export interface ZoneInfo {
  snowZone: SnowZone;
  windZone: WindZone;
  terrain: TerrainCategory;
  state: string;
  altitude?: number;
  source: 'plz' | 'state' | 'override';
  notes: string;
}

/**
 * Liefert empfohlene Zonen für eine Adresse.
 *
 * Vereinfachte Heuristik:
 *  1. PLZ → Bundesland
 *  2. Bundesland-Default für Schnee + Wind
 *  3. PLZ-Override falls vorhanden (Hochgebirge)
 *  4. Seehöhe modifiziert: > 1000 m → Schneezone +1, > 1500 m → +2
 */
export function lookupZones(plz: string | undefined, altitude?: number): ZoneInfo {
  const state = plz ? plzToState(plz) : 'Niederösterreich';
  let snowZone: SnowZone = SNOW_ZONE_BY_STATE[state] || '2';
  let windZone: WindZone = WIND_ZONE_BY_STATE[state] || '2';
  let source: ZoneInfo['source'] = 'state';
  const notes: string[] = [];

  if (plz && SNOW_ZONE_OVERRIDES[plz]) {
    snowZone = SNOW_ZONE_OVERRIDES[plz];
    source = 'override';
    notes.push(`PLZ ${plz} bekannt als Hochgebirgs-/Sonderzone (Schnee).`);
  }

  if (plz && WIND_ZONE_OVERRIDES[plz]) {
    windZone = WIND_ZONE_OVERRIDES[plz];
    notes.push(`PLZ ${plz} hat erhöhte Windzone.`);
  }

  if (altitude) {
    if (altitude > 1500 && parseInt(snowZone) < 4) {
      const newZone = '4';
      notes.push(`Seehöhe ${altitude} m > 1500 m → Schneezone auf ${newZone} erhöht.`);
      snowZone = newZone as SnowZone;
    } else if (altitude > 1000 && parseInt(snowZone) < 3) {
      const inc = (parseInt(snowZone) + 1).toString() as SnowZone;
      notes.push(`Seehöhe ${altitude} m > 1000 m → Schneezone auf ${inc} erhöht.`);
      snowZone = inc;
    }
  }

  // Geländekategorie: aus Seehöhe + Bundesland herleiten
  let terrain: TerrainCategory = 'III';
  if (altitude && altitude > 800) terrain = 'I';
  else if (altitude && altitude > 400) terrain = 'II';
  else if (state === 'Burgenland' || state === 'Wien') terrain = 'III';

  return {
    snowZone, windZone, terrain, state, altitude,
    source,
    notes: notes.length ? notes.join(' ') : `Default-Werte für ${state}. Bitte für genaue Werte ÖNORM-Zonenkarte prüfen.`,
  };
}

export { plzToState };
