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
  // === Konstruktionsholz === // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'kvh_c24_nsi',  category: 'timber', name: 'KVH C24, Nicht-Sicht-Qualität',  unit: 'm³', price: 510,  description: 'Konstruktionsvollholz Fichte, kammergetrocknet, gehobelt (NSi-Standard)' }, // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'kvh_c24_si',   category: 'timber', name: 'KVH C24, Sicht-Qualität',         unit: 'm³', price: 690,  description: 'KVH mit gehobelter Oberfläche, gefast, Sicht-Qualität' }, // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'kvh_c30',      category: 'timber', name: 'KVH C30',                          unit: 'm³', price: 640,  description: 'Höhere Festigkeitsklasse, begrenzte Verfügbarkeit' }, // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'bsh_gl24h',    category: 'timber', name: 'BSH GL24h (Leimbinder)',           unit: 'm³', price: 920,  description: 'Brettschichtholz homogen, Standardqualität' }, // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'bsh_gl28h',    category: 'timber', name: 'BSH GL28h',                        unit: 'm³', price: 1080, description: 'Hochfest, für große Spannweiten' }, // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'bsh_curved',   category: 'timber', name: 'BSH gebogen (Bogenbinder)',        unit: 'm³', price: 1850, description: 'Gebogene Leimbinder, Aufpreis ggü. gerade (gestiegen 2026)' }, // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'bsh_pitched',  category: 'timber', name: 'BSH Sattelträger',                 unit: 'm³', price: 1220, description: 'BSH mit konstanter Untergurt-Schräge' }, // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'lvl',          category: 'timber', name: 'Furnierschichtholz (Kerto/LVL)',   unit: 'm³', price: 1380, description: 'Sehr hohe Festigkeit, dünne Querschnitte möglich' }, // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'schalung',     category: 'timber', name: 'Schalung Fichte 24 mm',            unit: 'm²', price: 14,   description: '24mm Brettschalung Fichte ab Sägewerk' }, // Quelle: AT-Sägewerks-Großhandel 2026-Q1
  { id: 'osb_22',       category: 'timber', name: 'OSB-Platte 22 mm',                 unit: 'm²', price: 18,   description: 'OSB/3 als Beplankung (Importpreis gestiegen)' }, // Quelle: AT-Baustoffhandel 2026-Q1

  // === Dacheindeckung === // Quelle: AT-Dachdeckerpreise 2026-Q1
  { id: 'tile_clay',    category: 'covering', name: 'Tondachziegel inkl. Lattung',    unit: 'm²', price: 42,  description: 'Standard-Tondachziegel inkl. Lattung und Konterlattung' }, // Quelle: AT-Dachdeckerpreise 2026-Q1
  { id: 'tile_concrete',category: 'covering', name: 'Betondachsteine',                 unit: 'm²', price: 26,  description: 'Beton-Dachstein, günstige Alternative zu Ton' }, // Quelle: AT-Dachdeckerpreise 2026-Q1
  { id: 'metal_falz',   category: 'covering', name: 'Stehfalz-Blechdach Zink',         unit: 'm²', price: 125, description: 'Doppelstehfalz Zink inkl. Schalung (Material + Verlegung)' }, // Quelle: AT-Dachdeckerpreise 2026-Q1
  { id: 'slate',        category: 'covering', name: 'Naturschiefer',                   unit: 'm²', price: 165, description: 'Sehr langlebig, hochwertig' }, // Quelle: AT-Dachdeckerpreise 2026-Q1
  { id: 'green_ext',    category: 'covering', name: 'Gründach extensiv',               unit: 'm²', price: 78,  description: 'Aufbau inkl. Drainage, Substrat, Sedum' }, // Quelle: AT-Dachdeckerpreise 2026-Q1
  { id: 'green_int',    category: 'covering', name: 'Gründach intensiv',               unit: 'm²', price: 210, description: 'Begehbar, intensive Bepflanzung' }, // Quelle: AT-Dachdeckerpreise 2026-Q1
  { id: 'pv',           category: 'covering', name: 'PV-Modul (zusätzlich)',           unit: 'm²', price: 195, description: 'Aufgeständert, inkl. Unterkonstruktion (PV-Preise gesunken)' }, // Quelle: AT-Photovoltaik-Marktpreis 2026-Q1

  // === Dämmung === // Quelle: AT-Baustoffhandel 2026-Q1
  { id: 'ins_mw_200',   category: 'insulation', name: 'Mineralwolle 200 mm WLG 035',   unit: 'm²', price: 28, description: 'Zwischensparrendämmung Mineralwolle' }, // Quelle: AT-Baustoffhandel 2026-Q1
  { id: 'ins_zell_240', category: 'insulation', name: 'Zellulose-Einblasdämmung 240 mm', unit: 'm²', price: 38, description: 'Ökologisch, gute Hitzeschutz' }, // Quelle: AT-Baustoffhandel 2026-Q1
  { id: 'ins_pir_140',  category: 'insulation', name: 'PIR Aufsparrendämmung 140 mm',  unit: 'm²', price: 64, description: 'Sehr gute Dämmwirkung pro mm' }, // Quelle: AT-Baustoffhandel 2026-Q1
  { id: 'ins_holzf',    category: 'insulation', name: 'Holzfaserdämmung 180 mm',       unit: 'm²', price: 52, description: 'Ökologisch, gute Schalldämmung' }, // Quelle: AT-Baustoffhandel 2026-Q1

  // === Folien === // Quelle: AT-Baustoffhandel 2026-Q1
  { id: 'mem_vapor',    category: 'membrane', name: 'Dampfbremse',                      unit: 'm²', price: 5,  description: 'PE/PA-Folie, Dampfbremse' }, // Quelle: AT-Baustoffhandel 2026-Q1
  { id: 'mem_under',    category: 'membrane', name: 'Unterspannbahn diffusionsoffen',   unit: 'm²', price: 8,  description: 'Diffusionsoffene Unterspannbahn' }, // Quelle: AT-Baustoffhandel 2026-Q1

  // === Verbinder === // Quelle: AT-Holzbauverbinder-Großhandel 2026-Q1
  { id: 'screw_8x180',  category: 'fastener', name: 'Holzbauschraube 8×180',           unit: 'Stk', price: 0.42, description: 'Sparrenschraube' }, // Quelle: AT-Holzbauverbinder-Großhandel 2026-Q1
  { id: 'screw_8x240',  category: 'fastener', name: 'Holzbauschraube 8×240',           unit: 'Stk', price: 0.68 }, // Quelle: AT-Holzbauverbinder-Großhandel 2026-Q1
  { id: 'angle_bracket',category: 'fastener', name: 'Winkelverbinder 90×90×65',        unit: 'Stk', price: 5.20, description: 'Sparren-Pfette-Verbindung' }, // Quelle: AT-Holzbauverbinder-Großhandel 2026-Q1
  { id: 'tie_down',     category: 'fastener', name: 'Sturmanker',                       unit: 'Stk', price: 11,  description: 'Gegen Wind-Sog/Abheben' }, // Quelle: AT-Holzbauverbinder-Großhandel 2026-Q1
  { id: 'bracket_glulam',category:'fastener', name: 'BSH-Auflagerschuh Stahl verzinkt', unit: 'Stk', price: 115, description: 'Für Hauptträger-Auflager, Stahl verzinkt' }, // Quelle: AT-Holzbauverbinder-Großhandel 2026-Q1

  // === Lohn === // Quelle: AT-Kollektivvertrag Zimmerei + Kalkulations-Verrechnungssatz 2026
  { id: 'labor_carp',   category: 'labor', name: 'Zimmermann-Stunde',                   unit: 'h',  price: 82, description: 'Verrechnungssatz inkl. AG-Nebenkosten und Aufschläge' }, // Quelle: AT-Zimmerei-Verrechnungssatz 2026
  { id: 'labor_helper', category: 'labor', name: 'Helfer-Stunde',                       unit: 'h',  price: 58, description: 'Helfer-Verrechnungssatz inkl. AG-Nebenkosten' }, // Quelle: AT-Zimmerei-Verrechnungssatz 2026
  { id: 'labor_assembly',category:'labor', name: 'Montage Dachstuhl (m² Grundfläche)',  unit: 'm²', price: 68, description: 'Pauschale Aufbauleistung KVH-Standard' }, // Quelle: AT-Zimmerei-Pauschalkalkulation 2026
  { id: 'labor_glulam', category: 'labor', name: 'Montage BSH-Träger',                  unit: 'm',  price: 120, description: 'Aufpreis für Großkomponenten + Kran-Anteil' }, // Quelle: AT-Zimmerei-Pauschalkalkulation 2026

  // === Sonstiges === // Quelle: AT-Maschinenkosten 2026-Q1
  { id: 'crane',        category: 'other', name: 'Kran-Tag',                            unit: 'pauschal', price: 980, description: 'Mobilkran inkl. Bediener, Tagessatz' }, // Quelle: AT-Maschinenkosten 2026-Q1
  { id: 'transport',    category: 'other', name: 'Transport BSH',                        unit: 'pauschal', price: 480, description: 'Sondertransport > 12 m, Standard-Route AT' }, // Quelle: AT-Transportkosten 2026-Q1
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
  wasteTimber: 8,   // Quelle: AT-Zimmerei-Praxis 2026 (KVH-Verschnitt realistisch 6–10%)
  laborMarkup: 45,  // Quelle: AT-Holzbau-Verbandskennwerte 2026 (Lohn-Material-Verhältnis)
  overhead: 18,     // Quelle: AT-Zimmerei-Betriebskostenanalyse 2026
  profit: 7,        // Quelle: AT-Baugewerbe-Marktübersicht 2026 (Unternehmergewinn)
  vat: 20,          // Österreich Standard (unverändert)
};
