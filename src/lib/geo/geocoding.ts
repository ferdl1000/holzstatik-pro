/**
 * Geocoding für Österreich via Nominatim (OpenStreetMap).
 *
 * KOSTENLOS, ohne API-Key. Limit: 1 Request/Sekunde laut Nominatim ToS.
 * Wir verwenden es nur sparsam (Adresse → Koordinaten beim Erfassen einer Adresse).
 *
 * Für Produktion bei vielen Anfragen ggf. wechseln auf:
 *   - LocationIQ (Free Tier 5000/Tag)
 *   - Mapbox (kostenpflichtig)
 *   - Eigenes Nominatim-Setup
 */

export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
  road?: string;
  houseNumber?: string;
  postcode?: string;
  city?: string;
  state?: string;
  country?: string;
  confidence: number;
  source: 'nominatim';
}

export async function geocodeAddress(query: string): Promise<GeocodingResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', query);
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'at');
  url.searchParams.set('accept-language', 'de');

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'dachplan-assistent/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const r = data[0];
    return {
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      displayName: r.display_name,
      road: r.address?.road,
      houseNumber: r.address?.house_number,
      postcode: r.address?.postcode,
      city: r.address?.city || r.address?.town || r.address?.village,
      state: r.address?.state,
      country: r.address?.country,
      confidence: Math.min(1, parseFloat(r.importance || '0.5') + 0.3),
      source: 'nominatim',
    };
  } catch (e) {
    console.warn('Geocoding fehlgeschlagen:', e);
    return null;
  }
}

/**
 * Seehöhe aus Koordinaten via Open-Elevation API.
 * KOSTENLOS, ohne API-Key. Limit niedrig, daher cachen.
 */
export async function getElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const res = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.[0]?.elevation ?? null;
  } catch (e) {
    console.warn('Elevation-Lookup fehlgeschlagen:', e);
    return null;
  }
}
