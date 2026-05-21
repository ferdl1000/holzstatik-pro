/**
 * autoCost – Massenauszug + Kostenschätzung (Material-only und Voll-Kalkulation)
 *
 * Erzeugt:
 *  - materialOnly: nur Holz / Eindeckung / Dämmung / Verbinder (kein Lohn, keine Aufschläge)
 *  - withLabor:    vollständige Kalkulation mit Lohn + DEFAULT_FACTORS
 *  - orderList:    Bestellliste gruppiert nach Lieferant
 *  - byRoofPart:   (optional) Aufschlüsselung pro Dachteil wenn opts.roofParts übergeben
 */

import type { TimberMember, BuildingGeometry } from '@/types/project';
import type { RoofPart } from '@/types/roofParts';
import type { AutoCostResult, OrderListItem } from './contracts';
import type { CostEstimate } from '@/lib/pricing';
import { estimateCost } from '@/lib/pricing/estimator';
import { DEFAULT_FACTORS } from '@/lib/pricing/database';

interface AutoCostOptions {
  coveringId?: string;
  insulationId?: string;
  roofParts?: RoofPart[];
  /** Zimmerei-Modus (default): nur Holz + Verbinder + Lohn. Keine Eindeckung/Dämmung/Folien. */
  zimmereiOnly?: boolean;
}

export interface RoofPartCostEntry {
  roofPartId: string;
  label: string;
  materialOnly: CostEstimate;
  withLabor: CostEstimate;
  orderList: OrderListItem[];
}

export interface AutoCostResultExt extends AutoCostResult {
  byRoofPart?: RoofPartCostEntry[];
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

/** Berechnet Material-only + Voll-Kalkulation + Bestellliste für eine einzelne Menge von Members + Geometriewerten */
function computeForMembers(
  members: TimberMember[],
  roofArea: number,
  groundArea: number,
  coveringId: string,
  insulationId: string,
  orderListNotesSuffix?: string,
  zimmereiOnly: boolean = true,
): { materialOnly: CostEstimate; withLabor: CostEstimate; orderList: OrderListItem[] } {
  const hasGlulam = members.some(m => (m.material || '').toLowerCase().includes('gl'));

  // Zimmerei-Modus: keine Eindeckung/Dämmung/Folien
  const commonInput = zimmereiOnly
    ? { members, roofArea, groundArea, coveringId: undefined, insulationId: undefined, membraneIds: [] as string[], hasGlulam }
    : { members, roofArea, groundArea, coveringId, insulationId,
        membraneIds: ['mem_under', 'mem_vapor'] as string[], hasGlulam };

  const withLabor = estimateCost({ ...commonInput, factors: DEFAULT_FACTORS });

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

  const orderList = buildOrderList(materialOnly).map(item =>
    orderListNotesSuffix
      ? { ...item, notes: item.notes ? `${item.notes} | ${orderListNotesSuffix}` : orderListNotesSuffix }
      : item,
  );

  return { materialOnly, withLabor, orderList };
}

/** Addiert zwei CostEstimates zu einer Gesamt-Estimate */
function aggregateEstimates(estimates: CostEstimate[]): CostEstimate {
  if (estimates.length === 0) {
    return {
      positions: [],
      subtotals: { material: 0, covering: 0, insulation: 0, fasteners: 0, labor: 0, other: 0 },
      net: 0, vat: 0, gross: 0,
      factors: DEFAULT_FACTORS,
      appliedSurcharges: [],
      summary: '',
      explanation: '',
    };
  }
  const positions = estimates.flatMap(e => e.positions);
  const subtotals = { material: 0, covering: 0, insulation: 0, fasteners: 0, labor: 0, other: 0 };
  for (const e of estimates) {
    subtotals.material += e.subtotals.material;
    subtotals.covering += e.subtotals.covering;
    subtotals.insulation += e.subtotals.insulation;
    subtotals.fasteners += e.subtotals.fasteners;
    subtotals.labor += e.subtotals.labor;
    subtotals.other += e.subtotals.other;
  }
  const net = estimates.reduce((s, e) => s + e.net, 0);
  const vat = estimates.reduce((s, e) => s + e.vat, 0);
  const gross = estimates.reduce((s, e) => s + e.gross, 0);
  const surchargeMap = new Map<string, number>();
  for (const e of estimates) {
    for (const s of e.appliedSurcharges) {
      surchargeMap.set(s.name, (surchargeMap.get(s.name) ?? 0) + s.amount);
    }
  }
  return {
    positions,
    subtotals,
    net, vat, gross,
    factors: estimates[0].factors,
    appliedSurcharges: Array.from(surchargeMap.entries()).map(([name, amount]) => ({
      name,
      percent: estimates[0].appliedSurcharges.find(s => s.name === name)?.percent ?? 0,
      amount,
    })),
    summary: `Gesamt brutto: ${gross.toLocaleString('de-AT', { maximumFractionDigits: 0 })} € (netto ${net.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €, ${positions.length} Positionen).`,
    explanation: estimates.map(e => e.explanation).join(' | '),
  };
}

/**
 * Hauptfunktion: berechnet Material-only + Voll-Kalkulation + Bestellliste.
 * Wenn opts.roofParts übergeben wird, erfolgt zusätzlich eine Aufschlüsselung pro Dachteil.
 */
export function autoComputeCosts(
  members: TimberMember[],
  geometry: BuildingGeometry,
  opts?: AutoCostOptions,
): AutoCostResultExt {
  const coveringId = opts?.coveringId ?? 'tile_clay';
  const insulationId = opts?.insulationId ?? 'ins_mw_200';
  const roofParts = opts?.roofParts;
  const zimmereiOnly = opts?.zimmereiOnly ?? true;  // Default: Zimmerei-Modus

  // ── Fall 1: roofParts vorhanden → pro Dachteil berechnen ──
  if (roofParts && roofParts.length > 0) {
    const byRoofPart: RoofPartCostEntry[] = roofParts.map(part => {
      const partMembers = part.members && part.members.length > 0
        ? part.members
        : members; // fallback: alle Members wenn Dachteil keine eigenen hat

      const pitchRad = (part.geometry.pitch * Math.PI) / 180;
      const roofArea = part.geometry.length * (part.geometry.width / Math.cos(pitchRad));
      const groundArea = part.geometry.length * part.geometry.width;

      const { materialOnly, withLabor, orderList } = computeForMembers(
        partMembers,
        roofArea,
        groundArea,
        coveringId,
        insulationId,
        `Aus Dachteil: ${part.label}`,
        zimmereiOnly,
      );

      return { roofPartId: part.id, label: part.label, materialOnly, withLabor, orderList };
    });

    // Aggregierte Gesamtsumme
    const materialOnly = aggregateEstimates(byRoofPart.map(p => p.materialOnly));
    const withLabor = aggregateEstimates(byRoofPart.map(p => p.withLabor));
    const orderList = byRoofPart.flatMap(p => p.orderList);

    return { materialOnly, withLabor, orderList, byRoofPart };
  }

  // ── Fall 2: kein roofParts → bestehendes Verhalten ──
  const roofArea = calcRoofArea(geometry);
  const groundArea = calcGroundArea(geometry);
  const { materialOnly, withLabor, orderList } = computeForMembers(
    members,
    roofArea,
    groundArea,
    coveringId,
    insulationId,
    undefined,
    zimmereiOnly,
  );

  return { materialOnly, withLabor, orderList };
}
