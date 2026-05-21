export * from './geocoding';
export * from './zones';
export * from './plzDatabase';

import { geocodeAddress, getElevation } from './geocoding';
import { lookupZones, type ZoneInfo } from './zones';
import { lookupPlzNearest, lookupByCity, type PlzEntry } from './plzDatabase';

export interface LocationResolved {
  lat: number;
  lng: number;
  displayName: string;
  postcode?: string;
  city?: string;
  state?: string;
  altitude: number;
  zones: ZoneInfo;
  source: 'offline-db' | 'nominatim' | 'fallback';
}

/**
 * Komplett-Lookup mit Offline-First-Strategie:
 *
 *  1. Versuche PLZ-Erkennung im Such-String (z.B. "5020 Salzburg" → PLZ 5020)
 *     → liefert ALLE Daten ohne Netzwerk-Aufruf.
 *  2. Versuche Stadtnamen-Lookup in Offline-DB.
 *  3. Fallback auf Nominatim + Open-Elevation (nur wenn Online).
 *  4. Letzter Fallback: Default-Werte (Wien) mit niedriger Konfidenz.
 *
 * So funktioniert das System auch offline für die meisten österreichischen Adressen.
 */
export async function resolveLocation(address: string): Promise<LocationResolved | null> {
  // 1. Erkenne PLZ im Input (4-stellig)
  const plzMatch = address.match(/\b(\d{4})\b/);
  if (plzMatch) {
    const entry = lookupPlzNearest(plzMatch[1]);
    if (entry) return entryToLocation(entry, 'offline-db');
  }

  // 2. Versuche Ortsnamen-Lookup
  const cityMatch = address.match(/\b([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)\b/);
  if (cityMatch) {
    const entry = lookupByCity(cityMatch[1]);
    if (entry) return entryToLocation(entry, 'offline-db');
  }

  // 3. Online-Fallback nur wenn kein Offline-Treffer
  try {
    const geo = await geocodeAddress(address);
    if (geo) {
      // Prüfe nochmal in Offline-DB mit der jetzt bekannten PLZ
      if (geo.postcode) {
        const entry = lookupPlzNearest(geo.postcode);
        if (entry) return { ...entryToLocation(entry, 'offline-db'), lat: geo.lat, lng: geo.lng, displayName: geo.displayName };
      }
      const altitude = (await getElevation(geo.lat, geo.lng)) ?? 200;
      const zones = lookupZones(geo.postcode, altitude);
      return {
        lat: geo.lat, lng: geo.lng, displayName: geo.displayName,
        postcode: geo.postcode, city: geo.city, state: geo.state,
        altitude, zones, source: 'nominatim',
      };
    }
  } catch {
    // Online-Lookup fehlgeschlagen — fällt durch zu Fallback
  }

  // 4. Letzter Fallback: Wien
  return {
    lat: 48.2082, lng: 16.3738, displayName: 'Unbekannte Adresse (Default: Wien)',
    postcode: '1010', city: 'Wien', state: 'Wien',
    altitude: 171,
    zones: { snowZone: '2', windZone: '3', terrain: 'III', state: 'Wien', altitude: 171, source: 'state', notes: 'Default-Werte – Adresse konnte nicht aufgelöst werden.' },
    source: 'fallback',
  };
}

function entryToLocation(entry: PlzEntry, source: LocationResolved['source']): LocationResolved {
  return {
    lat: entry.lat, lng: entry.lng,
    displayName: `${entry.plz} ${entry.city}, ${entry.state}`,
    postcode: entry.plz, city: entry.city, state: entry.state,
    altitude: entry.elevation,
    zones: {
      snowZone: entry.snowZone, windZone: entry.windZone, terrain: entry.terrain,
      state: entry.state, altitude: entry.elevation,
      source: 'override',
      notes: `Aus Offline-PLZ-Datenbank (${entry.plz} ${entry.city}). Schneezone ${entry.snowZone}, Windzone ${entry.windZone}.`,
    },
    source,
  };
}
