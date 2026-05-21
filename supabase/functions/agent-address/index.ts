/**
 * Agent: Adress-Klärung mit Offline-First-Strategie.
 *
 * 1. PLZ aus Bauadresse extrahieren → Offline-Datenbank
 * 2. Falls nicht gefunden → Stadtname-Lookup
 * 3. Letzter Fallback: Nominatim + Open-Elevation
 * 4. Fallback der letzten Instanz: Wien-Default mit niedriger Konfidenz
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CORS_HEADERS } from '../_shared/gemini.ts';
import { lookupPlzNearest, lookupByCity, type PlzEntry } from '../_shared/plzDatabase.ts';

interface AddressCandidate {
  fullAddress: string;
  context: string;
  isBuildingAddress: boolean;
  confidence: number;
  excludeReason?: string;
}

function buildResultFromPlz(entry: PlzEntry, fullAddress: string, candidate: AddressCandidate, candidates: AddressCandidate[]) {
  const streetMatch = fullAddress.match(/^([^,0-9]+?)\s+(\d+[a-zA-Z]?(?:\/\d+)?)/);
  return {
    address: {
      street: streetMatch?.[1]?.trim() || '',
      houseNumber: streetMatch?.[2] || '',
      postalCode: entry.plz,
      city: entry.city,
      state: entry.state,
      country: 'Österreich',
      confidence: candidate.confidence,
      source: 'auto_extracted',
      alternatives: candidates,
      coordinates: { lat: entry.lat, lng: entry.lng },
      elevation: entry.elevation,
      terrainCategory: entry.terrain,
    },
    zones: { snow: entry.snowZone, wind: entry.windZone, terrain: entry.terrain },
    reasoning: `Bauadresse "${fullAddress}" → Offline-DB-Treffer PLZ ${entry.plz} ${entry.city}, ${entry.state}. Seehöhe ${entry.elevation} m, Schneezone ${entry.snowZone}, Windzone ${entry.windZone}, Gelände ${entry.terrain}.`,
    source: 'offline-db',
  };
}

async function geocodeOnline(query: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', query);
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'at');
  const res = await fetch(url.toString(), { headers: { 'User-Agent': 'dachplan-assistent/1.0' } });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function getElevationOnline(lat: number, lng: number): Promise<number | null> {
  try {
    const res = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.[0]?.elevation ?? null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { projectId, candidates } = await req.json() as { projectId: string; candidates: AddressCandidate[] };

    const buildingCandidate = (candidates || [])
      .filter(c => c.isBuildingAddress)
      .sort((a, b) => b.confidence - a.confidence)[0]
      || (candidates || []).sort((a, b) => b.confidence - a.confidence)[0];

    if (!buildingCandidate) {
      return new Response(JSON.stringify({ error: 'Keine Adress-Kandidaten', candidates: [] }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const fullAddress = buildingCandidate.fullAddress;

    // 1. PLZ aus Adresse extrahieren
    const plzMatch = fullAddress.match(/\b(\d{4})\b/);
    if (plzMatch) {
      const entry = lookupPlzNearest(plzMatch[1]);
      if (entry) {
        const result = buildResultFromPlz(entry, fullAddress, buildingCandidate, candidates);
        await logAudit(projectId, result.reasoning, fullAddress);
        return new Response(JSON.stringify(result),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
    }

    // 2. Stadtname-Lookup
    const cityMatch = fullAddress.match(/\b([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)\b/);
    if (cityMatch) {
      const entry = lookupByCity(cityMatch[1]);
      if (entry) {
        const result = buildResultFromPlz(entry, fullAddress, buildingCandidate, candidates);
        await logAudit(projectId, result.reasoning, fullAddress);
        return new Response(JSON.stringify(result),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
    }

    // 3. Online-Fallback
    try {
      const geo = await geocodeOnline(fullAddress);
      if (geo) {
        const lat = parseFloat(geo.lat);
        const lng = parseFloat(geo.lon);
        // Versuche PLZ-Match aus Geo-Result
        if (geo.address?.postcode) {
          const entry = lookupPlzNearest(geo.address.postcode);
          if (entry) {
            const r = buildResultFromPlz(entry, fullAddress, buildingCandidate, candidates);
            r.source = 'nominatim+offline-db';
            r.address.coordinates = { lat, lng };
            await logAudit(projectId, r.reasoning, fullAddress);
            return new Response(JSON.stringify(r),
              { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
          }
        }
        // Sonst manuelle Zuordnung
        const altitude = (await getElevationOnline(lat, lng)) ?? 200;
        const state = geo.address?.state || 'Niederösterreich';
        const result = {
          address: {
            street: geo.address?.road || '', houseNumber: geo.address?.house_number || '',
            postalCode: geo.address?.postcode || '', city: geo.address?.city || geo.address?.town || geo.address?.village || '',
            state, country: 'Österreich',
            confidence: buildingCandidate.confidence, source: 'auto_extracted',
            alternatives: candidates,
            coordinates: { lat, lng }, elevation: altitude,
            terrainCategory: altitude > 800 ? 'I' : altitude > 400 ? 'II' : 'III',
          },
          zones: { snow: '2', wind: '2', terrain: 'III' },
          reasoning: `Online-Geocoding via Nominatim, Seehöhe ${altitude}m. Zonen-Default für ${state}.`,
          source: 'nominatim',
        };
        await logAudit(projectId, result.reasoning, fullAddress);
        return new Response(JSON.stringify(result),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      console.warn('Online-Geocoding fehlgeschlagen:', e);
    }

    // 4. Letzter Fallback: Wien
    const fallback = lookupPlzNearest('1010')!;
    const result = buildResultFromPlz(fallback, fullAddress, buildingCandidate, candidates);
    result.source = 'fallback';
    result.reasoning = `Adresse "${fullAddress}" konnte nicht aufgelöst werden. Verwende Wien als Fallback. BITTE MANUELL PRÜFEN.`;
    await logAudit(projectId, result.reasoning, fullAddress);
    return new Response(JSON.stringify(result),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('agent-address error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});

async function logAudit(projectId: string | undefined, reasoning: string, fullAddress: string) {
  if (!projectId) return;
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await supabase.from('audit_log').insert({
      project_id: projectId, agent: 'Adress-Agent', action: 'Bauadresse aufgelöst',
      field: 'address', new_value: fullAddress, reason: reasoning, user_initiated: false,
    });
  } catch (e) { console.warn('audit log failed:', e); }
}
