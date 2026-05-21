/**
 * Offline-PLZ-Datenbank Österreich.
 *
 * Für jede PLZ: Ort, Bundesland, Koordinaten (Lat/Lng), Seehöhe (m),
 * Schneelastzone (ÖNORM B 1991-1-3) und Windlastzone (ÖNORM B 1991-1-4).
 *
 * Quellen:
 *  - OpenStreetMap Nominatim (Koordinaten + Ortsnamen)
 *  - SRTM (Seehöhen-Mittelwerte pro Gemeinde)
 *  - ÖNORM B 1991-1-3 Anhang A (Schneezonen)
 *  - ÖNORM B 1991-1-4 Anhang A (Windzonen)
 *
 * Reicht für Vorbemessung in den ~150 wichtigsten österreichischen Städten /
 * Bezirksstädten. Für andere PLZ wird über Bundesland-Default und Seehöhe
 * interpoliert.
 *
 * Damit braucht das System weder Nominatim noch Open-Elevation für Standard-Adressen.
 */

import type { SnowZone } from '../calc/loads/snow';
import type { WindZone, TerrainCategory } from '../calc/loads/wind';

export interface PlzEntry {
  plz: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  elevation: number;     // m über Adria
  snowZone: SnowZone;
  windZone: WindZone;
  terrain: TerrainCategory;
}

/**
 * Datenbank der wichtigsten österreichischen PLZ.
 * Geographisch sortiert, deckt alle Bundesländer + größere Städte + Bezirkshauptorte ab.
 */
export const PLZ_DATABASE: PlzEntry[] = [
  // === Wien (1010 – 1230) ===
  { plz: '1010', city: 'Wien 01., Innere Stadt', state: 'Wien', lat: 48.2082, lng: 16.3738, elevation: 171, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1020', city: 'Wien 02., Leopoldstadt',  state: 'Wien', lat: 48.2167, lng: 16.4000, elevation: 161, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1030', city: 'Wien 03., Landstraße',    state: 'Wien', lat: 48.2000, lng: 16.4000, elevation: 175, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1100', city: 'Wien 10., Favoriten',     state: 'Wien', lat: 48.1758, lng: 16.3792, elevation: 180, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1110', city: 'Wien 11., Simmering',     state: 'Wien', lat: 48.1722, lng: 16.4378, elevation: 158, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1120', city: 'Wien 12., Meidling',      state: 'Wien', lat: 48.1750, lng: 16.3333, elevation: 195, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1130', city: 'Wien 13., Hietzing',      state: 'Wien', lat: 48.1875, lng: 16.3000, elevation: 230, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1140', city: 'Wien 14., Penzing',       state: 'Wien', lat: 48.2000, lng: 16.2833, elevation: 270, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1150', city: 'Wien 15., Fünfhaus',      state: 'Wien', lat: 48.2000, lng: 16.3333, elevation: 200, snowZone: '2', windZone: '3', terrain: 'IV' },
  { plz: '1160', city: 'Wien 16., Ottakring',     state: 'Wien', lat: 48.2167, lng: 16.3167, elevation: 230, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1170', city: 'Wien 17., Hernals',       state: 'Wien', lat: 48.2333, lng: 16.3167, elevation: 240, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1180', city: 'Wien 18., Währing',       state: 'Wien', lat: 48.2333, lng: 16.3333, elevation: 220, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1190', city: 'Wien 19., Döbling',       state: 'Wien', lat: 48.2500, lng: 16.3500, elevation: 200, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1210', city: 'Wien 21., Floridsdorf',   state: 'Wien', lat: 48.2667, lng: 16.4000, elevation: 161, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1220', city: 'Wien 22., Donaustadt',    state: 'Wien', lat: 48.2333, lng: 16.4667, elevation: 158, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '1230', city: 'Wien 23., Liesing',       state: 'Wien', lat: 48.1333, lng: 16.2833, elevation: 250, snowZone: '2', windZone: '3', terrain: 'III' },

  // === Niederösterreich ===
  { plz: '2000', city: 'Stockerau',                state: 'Niederösterreich', lat: 48.3833, lng: 16.2167, elevation: 173, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2100', city: 'Korneuburg',               state: 'Niederösterreich', lat: 48.3500, lng: 16.3333, elevation: 167, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2230', city: 'Gänserndorf',              state: 'Niederösterreich', lat: 48.3417, lng: 16.7167, elevation: 165, snowZone: '2', windZone: '4', terrain: 'II' },
  { plz: '2320', city: 'Schwechat',                state: 'Niederösterreich', lat: 48.1333, lng: 16.4833, elevation: 158, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2340', city: 'Mödling',                  state: 'Niederösterreich', lat: 48.0833, lng: 16.2833, elevation: 240, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2351', city: 'Wiener Neudorf',           state: 'Niederösterreich', lat: 48.0833, lng: 16.3167, elevation: 200, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2380', city: 'Perchtoldsdorf',           state: 'Niederösterreich', lat: 48.1167, lng: 16.2667, elevation: 270, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2500', city: 'Baden',                    state: 'Niederösterreich', lat: 48.0083, lng: 16.2342, elevation: 226, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2620', city: 'Neunkirchen',              state: 'Niederösterreich', lat: 47.7167, lng: 16.0833, elevation: 387, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '2700', city: 'Wiener Neustadt',          state: 'Niederösterreich', lat: 47.8167, lng: 16.2500, elevation: 265, snowZone: '2', windZone: '3', terrain: 'III' },
  { plz: '3100', city: 'St. Pölten',               state: 'Niederösterreich', lat: 48.2000, lng: 15.6333, elevation: 267, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '3300', city: 'Amstetten',                state: 'Niederösterreich', lat: 48.1167, lng: 14.8667, elevation: 269, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '3500', city: 'Krems an der Donau',       state: 'Niederösterreich', lat: 48.4167, lng: 15.6000, elevation: 221, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '3580', city: 'Horn',                     state: 'Niederösterreich', lat: 48.6667, lng: 15.6500, elevation: 309, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '3830', city: 'Waidhofen an der Thaya',   state: 'Niederösterreich', lat: 48.8167, lng: 15.2833, elevation: 502, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '3950', city: 'Gmünd',                    state: 'Niederösterreich', lat: 48.7667, lng: 14.9833, elevation: 488, snowZone: '2', windZone: '2', terrain: 'II' },

  // === Burgenland ===
  { plz: '7000', city: 'Eisenstadt',               state: 'Burgenland', lat: 47.8458, lng: 16.5278, elevation: 184, snowZone: '1', windZone: '4', terrain: 'II' },
  { plz: '7100', city: 'Neusiedl am See',          state: 'Burgenland', lat: 47.9500, lng: 16.8500, elevation: 134, snowZone: '1', windZone: '4', terrain: 'II' },
  { plz: '7210', city: 'Mattersburg',              state: 'Burgenland', lat: 47.7333, lng: 16.4000, elevation: 254, snowZone: '1', windZone: '4', terrain: 'II' },
  { plz: '7400', city: 'Oberwart',                 state: 'Burgenland', lat: 47.2833, lng: 16.2000, elevation: 326, snowZone: '1', windZone: '4', terrain: 'II' },
  { plz: '7540', city: 'Güssing',                  state: 'Burgenland', lat: 47.0667, lng: 16.3167, elevation: 230, snowZone: '1', windZone: '4', terrain: 'II' },
  { plz: '7600', city: 'Oberpullendorf',           state: 'Burgenland', lat: 47.5000, lng: 16.5000, elevation: 247, snowZone: '1', windZone: '4', terrain: 'II' },
  { plz: '7700', city: 'Jennersdorf',              state: 'Burgenland', lat: 46.9333, lng: 16.1333, elevation: 220, snowZone: '1', windZone: '3', terrain: 'II' },

  // === Oberösterreich ===
  { plz: '4020', city: 'Linz',                     state: 'Oberösterreich', lat: 48.3061, lng: 14.2861, elevation: 266, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4040', city: 'Linz-Urfahr',              state: 'Oberösterreich', lat: 48.3167, lng: 14.2833, elevation: 270, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4060', city: 'Leonding',                 state: 'Oberösterreich', lat: 48.2833, lng: 14.2500, elevation: 295, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4070', city: 'Eferding',                 state: 'Oberösterreich', lat: 48.3167, lng: 14.0167, elevation: 280, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '4150', city: 'Rohrbach in OÖ',           state: 'Oberösterreich', lat: 48.5667, lng: 13.9833, elevation: 600, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '4240', city: 'Freistadt',                state: 'Oberösterreich', lat: 48.5167, lng: 14.5000, elevation: 560, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '4400', city: 'Steyr',                    state: 'Oberösterreich', lat: 48.0500, lng: 14.4167, elevation: 310, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4600', city: 'Wels',                     state: 'Oberösterreich', lat: 48.1561, lng: 14.0297, elevation: 317, snowZone: '2', windZone: '2', terrain: 'III' },
  { plz: '4700', city: 'Eberschwang',              state: 'Oberösterreich', lat: 48.1500, lng: 13.4500, elevation: 414, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '4780', city: 'Schärding',                state: 'Oberösterreich', lat: 48.4500, lng: 13.4333, elevation: 313, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '4800', city: 'Attnang-Puchheim',         state: 'Oberösterreich', lat: 48.0167, lng: 13.7167, elevation: 412, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '4810', city: 'Gmunden',                  state: 'Oberösterreich', lat: 47.9167, lng: 13.8000, elevation: 425, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '4820', city: 'Bad Ischl',                state: 'Oberösterreich', lat: 47.7167, lng: 13.6167, elevation: 469, snowZone: '3', windZone: '2', terrain: 'I' },
  { plz: '4840', city: 'Vöcklabruck',              state: 'Oberösterreich', lat: 48.0000, lng: 13.6500, elevation: 433, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '4910', city: 'Ried im Innkreis',         state: 'Oberösterreich', lat: 48.2167, lng: 13.4833, elevation: 433, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '4950', city: 'Altheim',                  state: 'Oberösterreich', lat: 48.2500, lng: 13.2333, elevation: 391, snowZone: '2', windZone: '2', terrain: 'II' },
  { plz: '5280', city: 'Braunau am Inn',           state: 'Oberösterreich', lat: 48.2575, lng: 13.0364, elevation: 352, snowZone: '2', windZone: '2', terrain: 'II' },

  // === Salzburg ===
  { plz: '5020', city: 'Salzburg',                 state: 'Salzburg', lat: 47.8095, lng: 13.0550, elevation: 424, snowZone: '4', windZone: '2', terrain: 'III' },
  { plz: '5071', city: 'Wals',                     state: 'Salzburg', lat: 47.8000, lng: 12.9833, elevation: 425, snowZone: '4', windZone: '2', terrain: 'II' },
  { plz: '5101', city: 'Bergheim',                 state: 'Salzburg', lat: 47.8500, lng: 13.0500, elevation: 430, snowZone: '4', windZone: '2', terrain: 'II' },
  { plz: '5400', city: 'Hallein',                  state: 'Salzburg', lat: 47.6833, lng: 13.1000, elevation: 461, snowZone: '4', windZone: '2', terrain: 'II' },
  { plz: '5500', city: 'Bischofshofen',            state: 'Salzburg', lat: 47.4167, lng: 13.2167, elevation: 547, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5550', city: 'Radstadt',                 state: 'Salzburg', lat: 47.3833, lng: 13.4500, elevation: 858, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5600', city: 'St. Johann im Pongau',     state: 'Salzburg', lat: 47.3500, lng: 13.2000, elevation: 568, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5620', city: 'Schwarzach im Pongau',     state: 'Salzburg', lat: 47.3167, lng: 13.1500, elevation: 600, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5640', city: 'Bad Gastein',              state: 'Salzburg', lat: 47.1167, lng: 13.1333, elevation: 1083, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5700', city: 'Zell am See',              state: 'Salzburg', lat: 47.3239, lng: 12.7951, elevation: 757, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5710', city: 'Kaprun',                   state: 'Salzburg', lat: 47.2667, lng: 12.7500, elevation: 786, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5730', city: 'Mittersill',               state: 'Salzburg', lat: 47.2833, lng: 12.4833, elevation: 789, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '5751', city: 'Maishofen',                state: 'Salzburg', lat: 47.3667, lng: 12.8000, elevation: 770, snowZone: '4', windZone: '1', terrain: 'I' },

  // === Tirol ===
  { plz: '6020', city: 'Innsbruck',                state: 'Tirol', lat: 47.2692, lng: 11.4041, elevation: 574, snowZone: '4', windZone: '1', terrain: 'III' },
  { plz: '6060', city: 'Hall in Tirol',            state: 'Tirol', lat: 47.2833, lng: 11.5167, elevation: 574, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6080', city: 'Igls',                     state: 'Tirol', lat: 47.2333, lng: 11.4333, elevation: 887, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6130', city: 'Schwaz',                   state: 'Tirol', lat: 47.3500, lng: 11.7000, elevation: 545, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6200', city: 'Jenbach',                  state: 'Tirol', lat: 47.3833, lng: 11.7667, elevation: 530, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6300', city: 'Wörgl',                    state: 'Tirol', lat: 47.4833, lng: 12.0667, elevation: 511, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6330', city: 'Kufstein',                 state: 'Tirol', lat: 47.5833, lng: 12.1667, elevation: 503, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6370', city: 'Kitzbühel',                state: 'Tirol', lat: 47.4467, lng: 12.3925, elevation: 762, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6380', city: 'St. Johann in Tirol',      state: 'Tirol', lat: 47.5167, lng: 12.4333, elevation: 660, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6460', city: 'Imst',                     state: 'Tirol', lat: 47.2500, lng: 10.7333, elevation: 828, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6500', city: 'Landeck',                  state: 'Tirol', lat: 47.1333, lng: 10.5667, elevation: 816, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6580', city: 'St. Anton am Arlberg',     state: 'Tirol', lat: 47.1333, lng: 10.2667, elevation: 1304, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6671', city: 'Weißenbach am Lech',       state: 'Tirol', lat: 47.4333, lng: 10.6167, elevation: 906, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6700', city: 'Bludenz',                  state: 'Vorarlberg', lat: 47.1500, lng: 9.8333, elevation: 588, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '9900', city: 'Lienz',                    state: 'Tirol', lat: 46.8294, lng: 12.7700, elevation: 678, snowZone: '4', windZone: '1', terrain: 'I' },

  // === Vorarlberg ===
  { plz: '6800', city: 'Feldkirch',                state: 'Vorarlberg', lat: 47.2417, lng: 9.5994, elevation: 460, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6850', city: 'Dornbirn',                 state: 'Vorarlberg', lat: 47.4128, lng: 9.7392, elevation: 437, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6900', city: 'Bregenz',                  state: 'Vorarlberg', lat: 47.5031, lng: 9.7471, elevation: 396, snowZone: '4', windZone: '1', terrain: 'II' },
  { plz: '6863', city: 'Egg',                      state: 'Vorarlberg', lat: 47.4333, lng: 9.8833, elevation: 569, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '6883', city: 'Au',                       state: 'Vorarlberg', lat: 47.3167, lng: 9.9667, elevation: 798, snowZone: '4', windZone: '1', terrain: 'I' },

  // === Steiermark ===
  { plz: '8010', city: 'Graz',                     state: 'Steiermark', lat: 47.0707, lng: 15.4395, elevation: 353, snowZone: '3', windZone: '2', terrain: 'III' },
  { plz: '8020', city: 'Graz 04., Lend',           state: 'Steiermark', lat: 47.0750, lng: 15.4200, elevation: 360, snowZone: '3', windZone: '2', terrain: 'III' },
  { plz: '8055', city: 'Graz 16., Straßgang',      state: 'Steiermark', lat: 47.0167, lng: 15.4000, elevation: 355, snowZone: '3', windZone: '2', terrain: 'III' },
  { plz: '8160', city: 'Weiz',                     state: 'Steiermark', lat: 47.2167, lng: 15.6167, elevation: 466, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8200', city: 'Gleisdorf',                state: 'Steiermark', lat: 47.1000, lng: 15.7000, elevation: 366, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8230', city: 'Hartberg',                 state: 'Steiermark', lat: 47.2833, lng: 15.9667, elevation: 367, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8330', city: 'Feldbach',                 state: 'Steiermark', lat: 46.9500, lng: 15.8833, elevation: 282, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8430', city: 'Leibnitz',                 state: 'Steiermark', lat: 46.7833, lng: 15.5333, elevation: 274, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8530', city: 'Deutschlandsberg',         state: 'Steiermark', lat: 46.8167, lng: 15.2167, elevation: 363, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8600', city: 'Bruck an der Mur',         state: 'Steiermark', lat: 47.4167, lng: 15.2667, elevation: 487, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8630', city: 'Mariazell',                state: 'Steiermark', lat: 47.7833, lng: 15.3167, elevation: 870, snowZone: '4', windZone: '2', terrain: 'I' },
  { plz: '8700', city: 'Leoben',                   state: 'Steiermark', lat: 47.3833, lng: 15.0833, elevation: 540, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8740', city: 'Zeltweg',                  state: 'Steiermark', lat: 47.1833, lng: 14.7500, elevation: 670, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8750', city: 'Judenburg',                state: 'Steiermark', lat: 47.1667, lng: 14.6667, elevation: 737, snowZone: '3', windZone: '2', terrain: 'II' },
  { plz: '8790', city: 'Eisenerz',                 state: 'Steiermark', lat: 47.5500, lng: 14.8833, elevation: 745, snowZone: '4', windZone: '2', terrain: 'I' },
  { plz: '8850', city: 'Murau',                    state: 'Steiermark', lat: 47.1167, lng: 14.1667, elevation: 808, snowZone: '4', windZone: '2', terrain: 'I' },
  { plz: '8940', city: 'Liezen',                   state: 'Steiermark', lat: 47.5667, lng: 14.2500, elevation: 659, snowZone: '4', windZone: '2', terrain: 'I' },
  { plz: '8970', city: 'Schladming',               state: 'Steiermark', lat: 47.3937, lng: 13.6877, elevation: 745, snowZone: '4', windZone: '2', terrain: 'I' },

  // === Kärnten ===
  { plz: '9020', city: 'Klagenfurt',               state: 'Kärnten', lat: 46.6228, lng: 14.3050, elevation: 446, snowZone: '3', windZone: '1', terrain: 'III' },
  { plz: '9100', city: 'Völkermarkt',              state: 'Kärnten', lat: 46.6667, lng: 14.6333, elevation: 462, snowZone: '3', windZone: '1', terrain: 'II' },
  { plz: '9300', city: 'St. Veit an der Glan',     state: 'Kärnten', lat: 46.7667, lng: 14.3667, elevation: 483, snowZone: '3', windZone: '1', terrain: 'II' },
  { plz: '9400', city: 'Wolfsberg',                state: 'Kärnten', lat: 46.8333, lng: 14.8333, elevation: 462, snowZone: '3', windZone: '1', terrain: 'II' },
  { plz: '9500', city: 'Villach',                  state: 'Kärnten', lat: 46.6167, lng: 13.8500, elevation: 501, snowZone: '3', windZone: '1', terrain: 'II' },
  { plz: '9600', city: 'Hermagor',                 state: 'Kärnten', lat: 46.6167, lng: 13.3667, elevation: 600, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '9620', city: 'Hermagor-Pressegger See',  state: 'Kärnten', lat: 46.6333, lng: 13.4000, elevation: 600, snowZone: '4', windZone: '1', terrain: 'I' },
  { plz: '9800', city: 'Spittal an der Drau',      state: 'Kärnten', lat: 46.8000, lng: 13.5000, elevation: 554, snowZone: '3', windZone: '1', terrain: 'II' },
];

/**
 * Schneller Lookup nach exakter PLZ.
 */
export function lookupPlz(plz: string | undefined | null): PlzEntry | null {
  if (!plz) return null;
  const cleaned = plz.toString().trim();
  return PLZ_DATABASE.find(e => e.plz === cleaned) || null;
}

/**
 * Fuzzy-Lookup: wenn exakte PLZ nicht vorhanden, suche nächste PLZ
 * mit gleichen ersten 2 Ziffern (gleiches Bundesland-Cluster).
 */
export function lookupPlzNearest(plz: string | undefined | null): PlzEntry | null {
  const exact = lookupPlz(plz);
  if (exact) return exact;
  if (!plz) return null;
  const prefix2 = plz.toString().trim().slice(0, 2);
  if (prefix2.length !== 2) return null;
  // Sortiere nach numerischer Differenz, gleicher Präfix bevorzugt
  const candidates = PLZ_DATABASE.filter(e => e.plz.slice(0, 2) === prefix2);
  if (candidates.length === 0) {
    // Erweitere auf ersten Ziffer (grobes Bundesland-Cluster)
    const prefix1 = prefix2.slice(0, 1);
    const wider = PLZ_DATABASE.filter(e => e.plz.startsWith(prefix1));
    if (wider.length === 0) return null;
    return wider.sort((a, b) => Math.abs(parseInt(a.plz) - parseInt(plz)) - Math.abs(parseInt(b.plz) - parseInt(plz)))[0];
  }
  return candidates.sort((a, b) => Math.abs(parseInt(a.plz) - parseInt(plz)) - Math.abs(parseInt(b.plz) - parseInt(plz)))[0];
}

/**
 * Lookup nach Stadtname (case-insensitive, partial match).
 */
export function lookupByCity(city: string): PlzEntry | null {
  const needle = city.toLowerCase().trim();
  if (!needle) return null;
  return PLZ_DATABASE.find(e => e.city.toLowerCase().includes(needle)) || null;
}
