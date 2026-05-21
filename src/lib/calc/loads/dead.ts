/**
 * Eigengewicht / Ständige Lasten g_k nach ÖNORM B 1991-1-1.
 *
 * Sammlung typischer Dachaufbauten. Werte in kN/m² (auf Dachfläche bezogen).
 * Für Laien: 1 kN/m² ≈ 100 kg/m² → das, was ein Quadratmeter Dachaufbau wiegt.
 *
 * Anwender kann eigene Schichten kombinieren oder Default-Aufbauten wählen.
 */

export interface RoofLayer {
  id: string;
  name: string;
  weight: number;     // kN/m² (auf horizontaler Projektion oder Dachfläche je nach context)
  thickness?: number; // mm (optional, für Info)
  category: 'covering' | 'insulation' | 'membrane' | 'structure' | 'finish' | 'other';
  description: string;
}

/**
 * Bibliothek typischer Dachschichten.
 * Werte aus ÖNORM B 1991-1-1 Anhang A und Herstellerdaten.
 */
export const ROOF_LAYERS: RoofLayer[] = [
  // Dacheindeckung
  { id: 'ziegel_ton',       name: 'Tondachziegel',                    weight: 0.55, category: 'covering', description: 'Klassische Tondachziegel inkl. Lattung. ~55 kg/m².' },
  { id: 'ziegel_beton',     name: 'Betondachsteine',                  weight: 0.50, category: 'covering', description: 'Betondachsteine. ~50 kg/m².' },
  { id: 'blech_doppelstehfalz', name: 'Blechdach Doppelstehfalz',     weight: 0.10, category: 'covering', description: 'Stahl-/Aluminium-Falzdach. ~10 kg/m², sehr leicht.' },
  { id: 'schiefer',         name: 'Schieferdeckung',                  weight: 0.55, category: 'covering', description: 'Naturschiefer auf Schalung. ~55 kg/m².' },
  { id: 'gruendach_extensiv', name: 'Gründach extensiv',              weight: 1.20, category: 'covering', description: 'Extensives Gründach (10cm Substrat) bei Sättigung. ~120 kg/m².' },
  { id: 'gruendach_intensiv', name: 'Gründach intensiv',              weight: 3.00, category: 'covering', description: 'Intensives Gründach (Erde, Bepflanzung). ~300 kg/m². STATISCH PRÜFEN!' },
  { id: 'pv_modul',         name: 'PV-Module (zusätzlich)',           weight: 0.15, category: 'covering', description: 'Aufgeständerte PV-Anlage. ~15 kg/m² zusätzlich.' },

  // Lattung / Schalung
  { id: 'lattung',          name: 'Konterlattung + Lattung',          weight: 0.10, thickness: 60, category: 'structure', description: '5/8 cm Konterlattung + 3/5 cm Lattung. ~10 kg/m².' },
  { id: 'schalung_24mm',    name: 'Vollholz-Schalung 24 mm',          weight: 0.15, thickness: 24, category: 'structure', description: '24 mm Brettschalung Fichte. ~15 kg/m².' },
  { id: 'osb_22mm',         name: 'OSB-Platte 22 mm',                 weight: 0.13, thickness: 22, category: 'structure', description: 'OSB/3 22 mm. ~13 kg/m².' },

  // Dämmung
  { id: 'mineralwolle_200', name: 'Mineralwolle 200 mm',              weight: 0.06, thickness: 200, category: 'insulation', description: 'Mineralwolle WLG 035, 200 mm. ~6 kg/m².' },
  { id: 'zellulose_240',    name: 'Zellulose-Einblasdämmung 240 mm',  weight: 0.13, thickness: 240, category: 'insulation', description: 'Zellulose 50 kg/m³, 240 mm Sparrenfeld. ~13 kg/m².' },
  { id: 'pir_140',          name: 'PIR-Aufsparrendämmung 140 mm',     weight: 0.05, thickness: 140, category: 'insulation', description: 'PIR/PUR-Hartschaum 140 mm. ~5 kg/m².' },
  { id: 'holzfaser_180',    name: 'Holzfaserdämmung 180 mm',          weight: 0.30, thickness: 180, category: 'insulation', description: 'Holzweichfaser 160 kg/m³, 180 mm. ~30 kg/m².' },

  // Folien
  { id: 'dampfbremse',      name: 'Dampfbremse',                      weight: 0.01, category: 'membrane', description: 'PE-/PA-Dampfbremse. Vernachlässigbar.' },
  { id: 'unterspannbahn',   name: 'Unterspannbahn',                   weight: 0.01, category: 'membrane', description: 'Diffusionsoffene Unterspannbahn.' },

  // Innenausbau
  { id: 'gk_12_5',          name: 'Gipskartonplatte 12,5 mm',         weight: 0.12, thickness: 12.5, category: 'finish', description: 'GK 12,5 mm. ~12 kg/m².' },
  { id: 'gk_2x12_5',        name: 'Gipskarton 2-lagig 25 mm (Brandschutz)', weight: 0.24, category: 'finish', description: '2 × 12,5 mm GK F30. ~24 kg/m².' },
  { id: 'lehmputz_20mm',    name: 'Lehmputz 20 mm',                   weight: 0.36, thickness: 20, category: 'finish', description: 'Lehmputz auf Schilfrohr. ~36 kg/m².' },
];

export interface DeadLoadComposition {
  layers: { layerId: string; quantity?: number }[];
  additionalWeight?: number;  // freier Zuschlag in kN/m²
  notes?: string;
}

export interface DeadLoadResult {
  gk: number;                       // gesamt [kN/m²]
  layersBreakdown: { name: string; weight: number }[];
  explanation: string;
}

export function calculateDeadLoad(comp: DeadLoadComposition): DeadLoadResult {
  const layersBreakdown: { name: string; weight: number }[] = [];
  let gk = 0;
  for (const { layerId, quantity = 1 } of comp.layers) {
    const layer = ROOF_LAYERS.find(l => l.id === layerId);
    if (!layer) continue;
    const w = layer.weight * quantity;
    layersBreakdown.push({ name: quantity !== 1 ? `${layer.name} × ${quantity}` : layer.name, weight: w });
    gk += w;
  }
  if (comp.additionalWeight) {
    layersBreakdown.push({ name: 'Zuschlag', weight: comp.additionalWeight });
    gk += comp.additionalWeight;
  }

  const kgm2 = (gk * 1000) / 9.81;
  const explanation = `Dachaufbau gesamt: ${gk.toFixed(2)} kN/m² (≈ ${kgm2.toFixed(0)} kg pro m² Dachfläche). ` +
    `Setzt sich zusammen aus: ${layersBreakdown.map(l => `${l.name} (${l.weight.toFixed(2)} kN/m²)`).join(', ')}.`;

  return { gk, layersBreakdown, explanation };
}

/** Default-Aufbau: klassisches Steildach mit Tonziegel + Zwischensparrendämmung */
export const DEFAULT_TILED_ROOF: DeadLoadComposition = {
  layers: [
    { layerId: 'ziegel_ton' },
    { layerId: 'lattung' },
    { layerId: 'unterspannbahn' },
    { layerId: 'mineralwolle_200' },
    { layerId: 'dampfbremse' },
    { layerId: 'gk_12_5' },
  ],
  notes: 'Standard-Wohndach mit Tondachziegel und Zwischensparrendämmung',
};
