/**
 * Preis-Datenbank für Holzbau-Vorbemessung.
 *
 * Default-Preise (Stand 2026, Österreich). Können im Admin überschrieben werden.
 * Alle Preise in EUR netto.
 *
 * Quellen: durchschnittliche Großhandelspreise + Holzbau-Verbandskennwerte.
 * In der Realität stark schwankend – Anwender soll eigene Preise hinterlegen.
 */

export type PriceCategory = 'timber' | 'covering' | 'insulation' | 'membrane' | 'fastener' | 'labor' | 'other';

export type PriceUnit = 'm³' | 'm²' | 'm' | 'kg' | 'Stk' | 'h' | 'pauschal';

export interface PriceItem {
  id: string;
  category: PriceCategory;
  name: string;
  unit: PriceUnit;
  price: number;          // EUR netto pro Einheit
  description?: string;
  source?: string;
}

/**
 * Standard-Preisliste. Wird in DB seedingt, danach pro Anwender überschreibbar.
 */
export const DEFAULT_PRICES: PriceItem[] = [
  // === Konstruktionsholz ===
  { id: 'kvh_c24_nsi',  category: 'timber', name: 'KVH C24, Nicht-Sicht-Qualität',  unit: 'm³', price: 540,  description: 'Konstruktionsvollholz Fichte, technisch getrocknet, gehobelt' },
  { id: 'kvh_c24_si',   category: 'timber', name: 'KVH C24, Sicht-Qualität',         unit: 'm³', price: 720,  description: 'KVH mit gehobelter Oberfläche, gefast' },
  { id: 'kvh_c30',      category: 'timber', name: 'KVH C30',                          unit: 'm³', price: 690,  description: 'Höhere Festigkeitsklasse' },
  { id: 'bsh_gl24h',    category: 'timber', name: 'BSH GL24h (Leimbinder)',           unit: 'm³', price: 950,  description: 'Brettschichtholz homogen, Standardqualität' },
  { id: 'bsh_gl28h',    category: 'timber', name: 'BSH GL28h',                        unit: 'm³', price: 1150, description: 'Hochfest, für große Spannweiten' },
  { id: 'bsh_curved',   category: 'timber', name: 'BSH gebogen (Bogenbinder)',        unit: 'm³', price: 1750, description: 'Gebogene Leimbinder, Aufpreis ggü. gerade' },
  { id: 'bsh_pitched',  category: 'timber', name: 'BSH Sattelträger',                 unit: 'm³', price: 1280, description: 'BSH mit konstanter Untergurt-Schräge' },
  { id: 'lvl',          category: 'timber', name: 'Furnierschichtholz (Kerto/LVL)',   unit: 'm³', price: 1450, description: 'Sehr hohe Festigkeit, dünne Querschnitte möglich' },
  { id: 'schalung',     category: 'timber', name: 'Schalung Fichte 24 mm',            unit: 'm²', price: 16,   description: 'Brettschalung' },
  { id: 'osb_22',       category: 'timber', name: 'OSB-Platte 22 mm',                 unit: 'm²', price: 14,   description: 'OSB/3 als Beplankung' },

  // === Dacheindeckung ===
  { id: 'tile_clay',    category: 'covering', name: 'Tondachziegel inkl. Lattung',    unit: 'm²', price: 35,  description: 'Standard-Dachziegel' },
  { id: 'tile_concrete',category: 'covering', name: 'Betondachsteine',                 unit: 'm²', price: 22,  description: 'Günstige Alternative zu Ton' },
  { id: 'metal_falz',   category: 'covering', name: 'Stehfalz-Blechdach Zink',         unit: 'm²', price: 95,  description: 'Doppelstehfalz inkl. Schalung' },
  { id: 'slate',        category: 'covering', name: 'Naturschiefer',                   unit: 'm²', price: 145, description: 'Sehr langlebig, hochwertig' },
  { id: 'green_ext',    category: 'covering', name: 'Gründach extensiv',               unit: 'm²', price: 65,  description: 'Aufbau inkl. Drainage, Substrat, Sedum' },
  { id: 'green_int',    category: 'covering', name: 'Gründach intensiv',               unit: 'm²', price: 180, description: 'Begehbar, intensive Bepflanzung' },
  { id: 'pv',           category: 'covering', name: 'PV-Modul (zusätzlich)',           unit: 'm²', price: 220, description: 'Aufgeständert, inkl. Unterkonstruktion' },

  // === Dämmung ===
  { id: 'ins_mw_200',   category: 'insulation', name: 'Mineralwolle 200 mm WLG 035',   unit: 'm²', price: 26, description: 'Zwischensparrendämmung' },
  { id: 'ins_zell_240', category: 'insulation', name: 'Zellulose-Einblasdämmung 240 mm', unit: 'm²', price: 34, description: 'Ökologisch, gute Hitzeschutz' },
  { id: 'ins_pir_140',  category: 'insulation', name: 'PIR Aufsparrendämmung 140 mm',  unit: 'm²', price: 58, description: 'Sehr gute Dämmwirkung pro mm' },
  { id: 'ins_holzf',    category: 'insulation', name: 'Holzfaserdämmung 180 mm',       unit: 'm²', price: 48, description: 'Ökologisch, gute Schalldämmung' },

  // === Folien ===
  { id: 'mem_vapor',    category: 'membrane', name: 'Dampfbremse',                      unit: 'm²', price: 4,  description: 'PE/PA-Folie' },
  { id: 'mem_under',    category: 'membrane', name: 'Unterspannbahn diffusionsoffen',   unit: 'm²', price: 6,  description: 'Klassisch' },

  // === Verbinder ===
  { id: 'screw_8x180',  category: 'fastener', name: 'Holzbauschraube 8×180',           unit: 'Stk', price: 0.35, description: 'Sparrenschraube' },
  { id: 'screw_8x240',  category: 'fastener', name: 'Holzbauschraube 8×240',           unit: 'Stk', price: 0.55 },
  { id: 'angle_bracket',category: 'fastener', name: 'Winkelverbinder 90×90×65',        unit: 'Stk', price: 4.5, description: 'Sparren-Pfette-Verbindung' },
  { id: 'tie_down',     category: 'fastener', name: 'Sturmanker',                       unit: 'Stk', price: 8.5, description: 'Gegen Wind-Sog/Abheben' },
  { id: 'bracket_glulam',category:'fastener', name: 'BSH-Auflagerschuh Stahl verzinkt', unit: 'Stk', price: 95,  description: 'Für Hauptträger-Auflager' },

  // === Lohn ===
  { id: 'labor_carp',   category: 'labor', name: 'Zimmermann-Stunde',                   unit: 'h',  price: 75 },
  { id: 'labor_helper', category: 'labor', name: 'Helfer-Stunde',                       unit: 'h',  price: 48 },
  { id: 'labor_assembly',category:'labor', name: 'Montage Dachstuhl (m² Grundfläche)',  unit: 'm²', price: 55, description: 'Pauschale Aufbauleistung KVH-Standard' },
  { id: 'labor_glulam', category: 'labor', name: 'Montage BSH-Träger',                  unit: 'm',  price: 95, description: 'Aufpreis für Großkomponenten + Kran' },

  // === Sonstiges ===
  { id: 'crane',        category: 'other', name: 'Kran-Tag',                            unit: 'pauschal', price: 850, description: 'Mobilkran inkl. Bedienung' },
  { id: 'transport',    category: 'other', name: 'Transport BSH',                        unit: 'pauschal', price: 420, description: 'Sondertransport > 12 m' },
];

/** Aufschläge / Faktoren (vom Admin überschreibbar) */
export interface PricingFactors {
  /** Verschnitt bei Holz [%], typisch 8-15 % */
  wasteTimber: number;
  /** Lohnaufschlag auf Material [%], typisch 30-60 % bei Eigenleistung Zimmerei */
  laborMarkup: number;
  /** Gemeinkostenaufschlag [%], typisch 15-25 % */
  overhead: number;
  /** Unternehmergewinn [%], typisch 5-10 % */
  profit: number;
  /** Umsatzsteuer [%], in Österreich 20 % */
  vat: number;
}

export const DEFAULT_FACTORS: PricingFactors = {
  wasteTimber: 10,
  laborMarkup: 40,
  overhead: 20,
  profit: 8,
  vat: 20,
};
