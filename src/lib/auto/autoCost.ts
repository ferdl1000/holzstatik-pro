/**
 * autoCost – Massenauszug + Kostenschätzung (Material-only und Voll-Kalkulation)
 *
 * Erzeugt:
 *  - materialOnly: nur Holz / Eindeckung / Dämmung / Verbinder (kein Lohn, keine Aufschläge)
 *  - withLabor:    vollständige Kalkulation mit Lohn + DEFAULT_FACTORS
 *  - orderList:    Bestellliste gruppiert nach Lieferant
 */

import type { TimberMember, BuildingGeometry } from '@/types/project';
import type { AutoCostResult, OrderListItem } from './contracts';
import type { CostEstimate } from '@/lib/pricing';
import { estimateCost } from '@/lib/pricing/estimator';
import { DEFAULT_FACTORS } from '@/lib/pricing/database';

interface AutoCostOptions {
  coveringId?: string;
  insulationId?: string;
}

/** Dachfläche (Schräge) aus Grundriss + Neigung */
function calcRoofArea(geometry: BuildingGeometry): number {
  const L = geometry.length.value;
  const W = geometry.width.value;
  const pitchDeg = geometry.roofPitch.value;
  return L * (W / Math.cos((pitchDeg * Math.PI) / 180));
}

/** Grundrissfläche */
function calcGroundArea(geometry: BuildingGeometry): number {
  return geometry.length.value * geometry.width.value;
}

/**
 * Baut aus einer CostEstimate (mit Lohn) eine reine Material-Estimate.
 * Filtert alle Positionen mit category === 'Lohn' heraus und rechnet
 * net/vat/gross neu – ohne overhead / profit Aufschläge.
 */
function buildMaterialOnly(full: CostEstimate): CostEstimate {
  const positions = full.positions.filter(p => p.category !== 'Lohn');

  const subtotals = { material: 0, covering: 0, insulation: 0, fasteners: 0, labor: 0, other: 0 };
  for (const p of positions) {
    if (p.category === 'Holz' || p.category === 'Holz (individuell)') subtotals.material += p.total;
    else if (p.category === 'Eindeckung') subtotals.covering += p.total;
    else if (p.category === 'Dämmung' || p.category === 'Folien') subtotals.insulation += p.total;
    else if (p.category === 'Verbinder') subtotals.fasteners += p.total;
    else subtotals.other += p.total;
  }

  const baseSum = positions.reduce((s, p) => s + p.total, 0);
  // Material-only: keine Gemeinkosten / Gewinnaufschlag, nur MwSt 20 %
  const vatRate = full.factors.vat;
  const vat = baseSum * vatRate / 100;
  const gross = baseSum + vat;

  return {
    positions,
    subtotals,
    net: baseSum,
    vat,
    gross,
    factors: {
      wasteTimber: full.factors.wasteTimber,
      laborMarkup: 0,
      overhead: 0,
      profit: 0,
      vat: vatRate,
    },
    appliedSurcharges: [
      { name: `Umsatzsteuer (${vatRate} %)`, percent: vatRate, amount: vat },
    ],
    summary: `Nur Material brutto: ${gross.toLocaleString('de-AT', { maximumFractionDigits: 0 })} € (netto ${baseSum.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €, ${positions.length} Positionen).`,
    explanation: full.explanation,
  };
}

/** Ordnet eine CostPosition-Kategorie einem Lieferanten zu */
function supplierForCategory(category: string): OrderListItem['supplier'] {
  switch (category) {
    case 'Holz':
    case 'Holz (individuell)':
      return 'Sägewerk';
    case 'Eindeckung':
      return 'Eindeckung';
    case 'Dämmung':
      return 'Dämmung';
    case 'Folien':
      return 'Folien';
    case 'Verbinder':
      return 'Verbinder';
    default:
      return 'Sonstiges';
  }
}

/** Baut die Bestellliste aus den Material-only-Positionen */
function buildOrderList(materialOnly: CostEstimate): OrderListItem[] {
  return materialOnly.positions.map(p => ({
    supplier: supplierForCategory(p.category),
    description: p.description,
    dimensions: undefined,
    quantity: p.quantity,
    unit: p.unit,
    unitPrice: p.unitPrice,
    total: p.total,
    notes: p.notes,
  }));
}

/**
 * Hauptfunktion: berechnet Material-only + Voll-Kalkulation + Bestellliste.
 */
export function autoComputeCosts(
  members: TimberMember[],
  geometry: BuildingGeometry,
  opts?: AutoCostOptions,
): AutoCostResult {
  const coveringId = opts?.coveringId ?? 'tile_clay';
  const insulationId = opts?.insulationId ?? 'ins_mw_200';
  const roofArea = calcRoofArea(geometry);
  const groundArea = calcGroundArea(geometry);
  const hasGlulam = members.some(m => (m.material || '').toLowerCase().includes('gl'));

  const commonInput = {
    members,
    roofArea,
    groundArea,
    coveringId,
    insulationId,
    membraneIds: ['mem_under', 'mem_vapor'] as string[],
    hasGlulam,
  };

  // Voll-Kalkulation mit DEFAULT_FACTORS (Lohn + Aufschläge)
  const withLabor = estimateCost({
    ...commonInput,
    factors: DEFAULT_FACTORS,
  });

  // Material-only: rufe estimateCost ebenfalls mit factors.laborMarkup=0, overhead=0, profit=0 auf,
  // dann filter 'Lohn'-Positionen raus und rechne neu
  const fullForFiltering = estimateCost({
    ...commonInput,
    factors: {
      wasteTimber: DEFAULT_FACTORS.wasteTimber,
      laborMarkup: 0,
      overhead: 0,
      profit: 0,
      vat: DEFAULT_FACTORS.vat,
    },
  });
  const materialOnly = buildMaterialOnly(fullForFiltering);

  const orderList = buildOrderList(materialOnly);

  return { materialOnly, withLabor, orderList };
}
