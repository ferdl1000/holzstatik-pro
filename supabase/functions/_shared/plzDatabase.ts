/**
 * Offline-PLZ-Datenbank für Edge Functions (Deno).
 * Kopie der wichtigsten Einträge aus src/lib/geo/plzDatabase.ts.
 * Damit Edge Functions ohne Nominatim/Open-Elevation funktionieren.
 */

export interface PlzEntry {
  plz: string; city: string; state: string;
  lat: number; lng: number; elevation: number;
  snowZone: '1' | '2' | '3' | '4';
  windZone: '1' | '2' | '3' | '4';
  terrain: '0' | 'I' | 'II' | 'III' | 'IV';
}

export const PLZ_DATABASE: PlzEntry[] = [
  // Wien
  { plz: '1010', city: 'Wien', state: 'Wien', lat: 48.2082, lng: 16.3738, elevation: 171, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1020', city: 'Wien', state: 'Wien', lat: 48.2167, lng: 16.4000, elevation: 161, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1030', city: 'Wien', state: 'Wien', lat: 48.2000, lng: 16.4000, elevation: 175, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1100', city: 'Wien', state: 'Wien', lat: 48.1758, lng: 16.3792, elevation: 180, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1110', city: 'Wien', state: 'Wien', lat: 48.1722, lng: 16.4378, elevation: 158, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1120', city: 'Wien', state: 'Wien', lat: 48.1750, lng: 16.3333, elevation: 195, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1130', city: 'Wien', state: 'Wien', lat: 48.1875, lng: 16.3000, elevation: 230, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1140', city: 'Wien', state: 'Wien', lat: 48.2000, lng: 16.2833, elevation: 270, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1150', city: 'Wien', state: 'Wien', lat: 48.2000, lng: 16.3333, elevation: 200, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1160', city: 'Wien', state: 'Wien', lat: 48.2167, lng: 16.3167, elevation: 230, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1170', city: 'Wien', state: 'Wien', lat: 48.2333, lng: 16.3167, elevation: 240, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1180', city: 'Wien', state: 'Wien', lat: 48.2333, lng: 16.3333, elevation: 220, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1190', city: 'Wien', state: 'Wien', lat: 48.2500, lng: 16.3500, elevation: 200, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1210', city: 'Wien', state: 'Wien', lat: 48.2667, lng: 16.4000, elevation: 161, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1220', city: 'Wien', state: 'Wien', lat: 48.2333, lng: 16.4667, elevation: 158, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1230', city: 'Wien', state: 'Wien', lat: 48.1333, lng: 16.2833, elevation: 250, snowZone: '2', windZone: '3', terrain: 'III' },
  // Niederösterreich
  { plz: '2000', city: 'Stockerau', state: 'Niederösterreich', lat: 48.3833, lng: 16.2167, elevation: 173, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2100', city: 'Korneuburg', state: 'Niederösterreich', lat: 48.3500, lng: 16.3333, elevation: 167, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2320', city: 'Schwechat', state: 'Niederösterreich', lat: 48.1333, lng: 16.4833, elevation: 158, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2340', city: 'Mödling', state: 'Niederösterreich', lat: 48.0833, lng: 16.2833, elevation: 240, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2500', city: 'Baden', state: 'Niederösterreich', lat: 48.0083, lng: 16.2342, elevation: 226, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2700', city: 'Wiener Neustadt', state: 'Niederösterreich', lat: 47.8167, lng: 16.2500, elevation: 265, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '3100', city: 'St. Pölten', state: 'Niederösterreich', lat: 48.2000, lng: 15.6333, elevation: 267, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '3300', city: 'Amstetten', state: 'Niederösterreich', lat: 48.1167, lng: 14.8667, elevation: 269, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '3500', city: 'Krems', state: 'Niederösterreich', lat: 48.4167, lng: 15.6000, elevation: 221, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '3580', city: 'Horn', state: 'Niederösterreich', lat: 48.6667, lng: 15.6500, elevation: 309, snowZone: '2', windZone: '2', terrain: 'II' },
  // Burgenland
  { plz: '7000', city: 'Eisenstadt', state: 'Burgenland', lat: 47.8458, lng: 16.5278, elevation: 184, snowZone: '1', windZone: '4', terrain: 'II' },
  { plz: '7100', city: 'Neusiedl am See', state: 'Burgenland', lat: 47.9500, lng: 16.8500, elevation: 134, snowZone: '1', windZone: '4', terrain: 'II' },
  { plz: '7210', city: 'Mattersburg', state: 'Burgenland', lat: 47.7333, lng: 16.4000, elevation: 254, snowZone: '1', windZone: '4', terrain: 'II' },
  { plz: '7400', city: 'Oberwart', state: 'Burgenland', lat: 47.2833, lng: 16.2000, elevation: 326, snowZone: '1', windZone: '4', terrain: 'II' },
  // Oberösterreich
  { plz: '4020', city: 'Linz', state: 'Oberösterreich', lat: 48.3061, lng: 14.2861, elevation: 266, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4040', city: 'Linz', state: 'Oberösterreich', lat: 48.3167, lng: 14.2833, elevation: 270, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4060', city: 'Leonding', state: 'Oberösterreich', lat: 48.2833, lng: 14.2500, elevation: 295, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4150', city: 'Rohrbach', state: 'Oberösterreich', lat: 48.5667, lng: 13.9833, elevation: 600, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '4240', city: 'Freistadt', state: 'Oberösterreich', lat: 48.5167, lng: 14.5000, elevation: 560, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '4400', city: 'Steyr', state: 'Oberösterreich', lat: 48.0500, lng: 14.4167, elevation: 310, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4600', city: 'Wels', state: 'Oberösterreich', lat: 48.1561, lng: 14.0297, elevation: 317, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4810', city: 'Gmunden', state: 'Oberösterreich', lat: 47.9167, lng: 13.8000, elevation: 425, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '4820', city: 'Bad Ischl', state: 'Oberösterreich', lat: 47.7167, lng: 13.6167, elevation: 469, snowZone: '3', windZone: '2', terrain: 'I' },
  { plz: '4840', city: 'Vöcklabruck', state: 'Oberösterreich', lat: 48.0000, lng: 13.6500, elevation: 433, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '4910', city: 'Ried im Innkreis', state: 'Oberösterreich', lat: 48.2167, lng: 13.4833, elevation: 433, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '5280', city: 'Braunau am Inn', state: 'Oberösterreich', lat: 48.2575, lng: 13.0364, elevation: 352, snowZone: '2', windZone: '2', terrain: 'II' },
  // Salzburg
  { plz: '5020', city: 'Salzburg', state: 'Salzburg', lat: 47.8095, lng: 13.0550, elevation: 424, snowZone: '4', windZone: '2', terrain: 'III' },
  { plz: '5071', city: 'Wals', state: 'Salzburg', lat: 47.8000, lng: 12.9833, elevation: 425, snowZone: '4', windZone: '2', terrain: 'II' },
  { plz: '5400', city: 'Hallein', state: 'Salzburg', lat: 47.6833, lng: 13.1000, elevation: 461, snowZone: '4', windZone: '2', terrain: 'II' },
  { plz: '5500', city: 'Bischofshofen', state: 'Salzburg', lat: 47.4167, lng: 13.2167, elevation: 547, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5550', city: 'Radstadt', state: 'Salzburg', lat: 47.3833, lng: 13.4500, elevation: 858, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5600', city: 'St. Johann im Pongau', state: 'Salzburg', lat: 47.3500, lng: 13.2000, elevation: 568, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5640', city: 'Bad Gastein', state: 'Salzburg', lat: 47.1167, lng: 13.1333, elevation: 1083, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5700', city: 'Zell am See', state: 'Salzburg', lat: 47.3239, lng: 12.7951, elevation: 757, snowZone: '4', windZone: '1', terrain: 'I' },
  // Tirol
  { plz: '6020', city: 'Innsbruck', state: 'Tirol', lat: 47.2692, lng: 11.4041, elevation: 574, snowZone: '4', windZone: '1', terrain: 'III' },
  { plz: '6060', city: 'Hall in Tirol', state: 'Tirol', lat: 47.2833, lng: 11.5167, elevation: 574, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6130', city: 'Schwaz', state: 'Tirol', lat: 47.3500, lng: 11.7000, elevation: 545, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6300', city: 'Wörgl', state: 'Tirol', lat: 47.4833, lng: 12.0667, elevation: 511, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6330', city: 'Kufstein', state: 'Tirol', lat: 47.5833, lng: 12.1667, elevation: 503, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6370', city: 'Kitzbühel', state: 'Tirol', lat: 47.4467, lng: 12.3925, elevation: 762, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6460', city: 'Imst', state: 'Tirol', lat: 47.2500, lng: 10.7333, elevation: 828, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6500', city: 'Landeck', state: 'Tirol', lat: 47.1333, lng: 10.5667, elevation: 816, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6580', city: 'St. Anton am Arlberg', state: 'Tirol', lat: 47.1333, lng: 10.2667, elevation: 1304, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '9900', city: 'Lienz', state: 'Tirol', lat: 46.8294, lng: 12.7700, elevation: 678, snowZone: '4', windZone: '1', terrain: 'I' },
  // Vorarlberg
  { plz: '6700', city: 'Bludenz', state: 'Vorarlberg', lat: 47.1500, lng: 9.8333, elevation: 588, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6800', city: 'Feldkirch', state: 'Vorarlberg', lat: 47.2417, lng: 9.5994, elevation: 460, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6850', city: 'Dornbirn', state: 'Vorarlberg', lat: 47.4128, lng: 9.7392, elevation: 437, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6900', city: 'Bregenz', state: 'Vorarlberg', lat: 47.5031, lng: 9.7471, elevation: 396, snowZone: '4', windZone: '1', terrain: 'II' },
  // Steiermark
  { plz: '8010', city: 'Graz', state: 'Steiermark', lat: 47.0707, lng: 15.4395, elevation: 353, snowZone: '3', windZone: '2', terrain: 'III' },
  { plz: '8160', city: 'Weiz', state: 'Steiermark', lat: 47.2167, lng: 15.6167, elevation: 466, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8200', city: 'Gleisdorf', state: 'Steiermark', lat: 47.1000, lng: 15.7000, elevation: 366, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8230', city: 'Hartberg', state: 'Steiermark', lat: 47.2833, lng: 15.9667, elevation: 367, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8330', city: 'Feldbach', state: 'Steiermark', lat: 46.9500, lng: 15.8833, elevation: 282, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8430', city: 'Leibnitz', state: 'Steiermark', lat: 46.7833, lng: 15.5333, elevation: 274, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8600', city: 'Bruck an der Mur', state: 'Steiermark', lat: 47.4167, lng: 15.2667, elevation: 487, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8630', city: 'Mariazell', state: 'Steiermark', lat: 47.7833, lng: 15.3167, elevation: 870, snowZone: '4', windZone: '2', terrain: 'I' },
  { plz: '8700', city: 'Leoben', state: 'Steiermark', lat: 47.3833, lng: 15.0833, elevation: 540, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8970', city: 'Schladming', state: 'Steiermark', lat: 47.3937, lng: 13.6877, elevation: 745, snowZone: '4', windZone: '2', terrain: 'I' },
  // Kärnten
  { plz: '9020', city: 'Klagenfurt', state: 'Kärnten', lat: 46.6228, lng: 14.3050, elevation: 446, snowZone: '3', windZone: '1', terrain: 'III' },
  { plz: '9100', city: 'Völkermarkt', state: 'Kärnten', lat: 46.6667, lng: 14.6333, elevation: 462, snowZone: '3', windZone: '1', terrain: 'II' },
  { plz: '9300', city: 'St. Veit an der Glan', state: 'Kärnten', lat: 46.7667, lng: 14.3667, elevation: 483, snowZone: '3', windZone: '1', terrain: 'II' },
  { plz: '9400', city: 'Wolfsberg', state: 'Kärnten', lat: 46.8333, lng: 14.8333, elevation: 462, snowZone: '3', windZone: '1', terrain: 'II' },
  { plz: '9500', city: 'Villach', state: 'Kärnten', lat: 46.6167, lng: 13.8500, elevation: 501, snowZone: '3', windZone: '1', terrain: 'II' },
  { plz: '9800', city: 'Spittal an der Drau', state: 'Kärnten', lat: 46.8000, lng: 13.5000, elevation: 554, snowZone: '3', windZone: '1', terrain: 'II' },
];

export function lookupPlz(plz: string): PlzEntry | null {
  const cleaned = plz?.toString().trim();
  if (!cleaned) return null;
  return PLZ_DATABASE.find(e => e.plz === cleaned) || null;
}

export function lookupPlzNearest(plz: string): PlzEntry | null {
  const exact = lookupPlz(plz);
  if (exact) return exact;
  const prefix1 = plz.toString().trim().slice(0, 1);
  const candidates = PLZ_DATABASE.filter(e => e.plz.startsWith(prefix1));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => Math.abs(parseInt(a.plz) - parseInt(plz)) - Math.abs(parseInt(b.plz) - parseInt(plz)))[0];
}

export function lookupByCity(city: string): PlzEntry | null {
  const needle = city.toLowerCase().trim();
  if (!needle) return null;
  return PLZ_DATABASE.find(e => e.city.toLowerCase().includes(needle)) || null;
}
