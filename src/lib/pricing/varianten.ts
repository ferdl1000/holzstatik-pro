/**
 * Angebotsvarianten für den Zimmerei-Kunden.
 *
 * Standard  – keine Anpassung (KVH C24, Nicht-Sicht)
 * Premium   – +25 % Material (KVH C30 statt C24, höhere Festigkeit)
 * Sicht     – +60 % Material (KVH Sichtqualität, gefast, gehobelt) + +15 % Lohn für beide
 */

import type { CostEstimate, CostPosition } from '@/lib/pricing';

export type AngebotsVariante = 'standard' | 'premium' | 'sicht';

export const VARIANTE_LABELS: Record<AngebotsVariante, string> = {
  standard: 'Standard-Ausführung',
  premium: 'Premium (höhere Festigkeit C30)',
  sicht: 'Sicht-Qualität (Wohnraum, KVH SI)',
};

export const VARIANTE_DESCRIPTIONS: Record<AngebotsVariante, string> = {
  standard: 'KVH C24 NSi, technisch getrocknet, gehobelt.',
  premium: 'KVH C30, höhere Festigkeit. +25 % Materialkosten, +15 % Lohn.',
  sicht: 'KVH C24 Sicht-Qualität, gefast, gehobelt, für sichtbare Tragwerke. +60 % Materialkosten, +15 % Lohn.',
};

const MATERIAL_CATEGORIES = new Set(['Holz', 'Holz (individuell)', 'Eindeckung', 'Dämmung', 'Folien', 'Verbinder']);
const LABOR_CATEGORIES = new Set(['Lohn']);

function scalePosition(
  p: CostPosition,
  materialFactor: number,
  laborFactor: number,
): CostPosition {
  let factor = 1;
  if (MATERIAL_CATEGORIES.has(p.category)) factor = materialFactor;
  else if (LABOR_CATEGORIES.has(p.category)) factor = laborFactor;

  const unitPrice = p.unitPrice * factor;
  return { ...p, unitPrice, total: unitPrice * p.quantity };
}

export function applyVarianteToCosts(
  baseCost: CostEstimate,
  variante: AngebotsVariante,
): CostEstimate {
  if (variante === 'standard') return baseCost;

  const materialFactor = variante === 'premium' ? 1.25 : 1.60;
  const laborFactor = 1.15;  // both premium & sicht

  const positions = baseCost.positions.map(p =>
    scalePosition(p, materialFactor, laborFactor),
  );

  const baseSum = positions.reduce((s, p) => s + p.total, 0);
  const f = baseCost.factors;
  const overhead = baseSum * f.overhead / 100;
  const profit = (baseSum + overhead) * f.profit / 100;
  const net = baseSum + overhead + profit;
  const vat = net * f.vat / 100;
  const gross = net + vat;

  const subtotals = { ...baseCost.subtotals };
  for (const p of positions) {
    if (p.category === 'Holz' || p.category === 'Holz (individuell)') subtotals.material += p.total;
  }
  // Recompute subtotals cleanly
  const newSub = { material: 0, covering: 0, insulation: 0, fasteners: 0, labor: 0, other: 0 };
  for (const p of positions) {
    if (p.category === 'Holz' || p.category === 'Holz (individuell)') newSub.material += p.total;
    else if (p.category === 'Eindeckung') newSub.covering += p.total;
    else if (p.category === 'Dämmung' || p.category === 'Folien') newSub.insulation += p.total;
    else if (p.category === 'Verbinder') newSub.fasteners += p.total;
    else if (p.category === 'Lohn') newSub.labor += p.total;
    else newSub.other += p.total;
  }

  return {
    ...baseCost,
    positions,
    subtotals: newSub,
    net, vat, gross,
    appliedSurcharges: [
      { name: `Gemeinkosten (${f.overhead} %)`, percent: f.overhead, amount: overhead },
      { name: `Unternehmergewinn (${f.profit} %)`, percent: f.profit, amount: profit },
      { name: `Umsatzsteuer (${f.vat} %)`, percent: f.vat, amount: vat },
    ],
    summary: `${VARIANTE_LABELS[variante]} – Gesamt brutto: ${gross.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €`,
    explanation: `${VARIANTE_DESCRIPTIONS[variante]} ${baseCost.explanation}`,
  };
}
