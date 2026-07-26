/**
 * autoCost – Massenauszug + Kostenschätzung (Material-only und Voll-Kalkulation)
 *
 * Erzeugt:
 *  - materialOnly: nur Holz / Eindeckung / Dämmung / Verbinder (kein Lohn, keine Aufschläge)
 *  - withLabor:    vollständige Kalkulation mit Lohn + DEFAULT_FACTORS
 *  - orderList:    Bestellliste gruppiert nach Lieferant
 *  - byRoofPart:   (optional) Aufschlüsselung pro Dachteil wenn opts.roofParts übergeben
 */

import type { TimberMember, BuildingGeometry, RoofCovering, WallConstruction } from '@/types/project';
import type { RoofPart } from '@/types/roofParts';
import type { AutoCostResult, OrderListItem } from './contracts';
import type { CostEstimate, CostPosition } from '@/lib/pricing';
import type { JointSpec, TransportPlan } from '@/lib/auto/standards';
import { suggestDeckPlanks, computeTransportPlan } from '@/lib/auto/standards';
import { estimateCost } from '@/lib/pricing/estimator';
import { DEFAULT_FACTORS } from '@/lib/pricing/database';
import { roofAreaWithOverhang, DEFAULT_ROOF_OVERHANG } from '@/lib/calc/roofArea';

/** Mappe RoofCovering.type auf Preislisten-coveringId */
function coveringTypeToCoveringId(type: RoofCovering['type']): string {
  const map: Record<RoofCovering['type'], string> = {
    tile_clay:       'tile_clay',
    tile_concrete:   'tile_concrete',
    metal_falz:      'metal_falz',
    trapezblech:     'trapezblech',
    schiefer:        'schiefer',
    sandwich_paneel: 'sandwich_paneel',
    gruendach_ext:   'gruendach_ext',
    gruendach_int:   'gruendach_int',
    pv:              'tile_clay', // PV ist Zusatz, Basiseindeckung Standard
    bitumen:         'bitumen',
    sonstiges:       'tile_clay',
    unbekannt:       'tile_clay',
  };
  return map[type] ?? 'tile_clay';
}

interface AutoCostOptions {
  coveringId?: string;
  /** Erkannte Eindeckung aus KI-Extraktion (überschreibt coveringId wenn vorhanden) */
  coveringType?: RoofCovering;
  insulationId?: string;
  roofParts?: RoofPart[];
  /** Zimmerei-Modus (default): nur Holz + Verbinder + Lohn. Keine Eindeckung/Dämmung/Folien. */
  zimmereiOnly?: boolean;
  /** Stoßstellen aus autoMembers */
  joints?: JointSpec[];
  /** Dachform für Verschalung-Empfehlung */
  roofForm?: string;
  /** Verschalung/Lattung mit-kalkulieren (default true für Zimmerei) */
  includeDeckPlanks?: boolean;
  /** Transport-Plan automatisch dazu rechnen (default true) */
  includeTransport?: boolean;
  /** Dachüberstand in m (aus Plan gelesen oder Default 0,4) — vergrößert die reale Dachfläche */
  roofOverhang?: number;
  /** Wand-Konstruktionstypen für Zusatzpositionen (optional) */
  wallConstructions?: WallConstruction[];
  /** Grundfläche pro Geschoss für Holzständerwand-Berechnung (m²) — wird aus geometry abgeleitet wenn nicht angegeben */
  floorAreaPerLevel?: number;
}

export interface AutoCostExtras {
  transport?: TransportPlan;
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
  transport?: TransportPlan;
}

/** Erzeugt CostPositions für Verschalung + Lattung */
function buildDeckPlankPositions(roofForm: string, hasLeimbinder: boolean, roofArea: number): CostPosition[] {
  if (roofArea <= 0) return [];
  const planks = suggestDeckPlanks(roofForm, hasLeimbinder);
  const out: CostPosition[] = [];
  planks.forEach((p, idx) => {
    // Preis pro lfm aus Volumen: 540 €/m³ × Querschnitt × lfm
    const lfm = p.lfmPerM2 > 0 ? roofArea * p.lfmPerM2 * 1.1 /* 10% Verschnitt */ : roofArea;
    const unit = p.lfmPerM2 > 0 ? 'lfm' : 'm²';
    const vol_per_unit = p.lfmPerM2 > 0
      ? (p.b / 1000) * (p.h / 1000)        // m³/lfm
      : (p.h / 1000);                       // m³/m² für Vollschalung
    const pricePerM3 = 540;
    const unitPrice = +(vol_per_unit * pricePerM3).toFixed(2);
    out.push({
      id: `plank_${idx}`,
      description: `${p.name} (${p.description})`,
      category: 'Holz',
      quantity: Math.round(lfm),
      unit,
      unitPrice,
      total: +(lfm * unitPrice).toFixed(2),
      notes: 'Inkl. 10% Verschnitt',
    });
  });
  return out;
}

/**
 * Zimmerei-Nebenleistungen, die in JEDEM echten Angebot stehen, bisher aber
 * komplett gefehlt haben: Abbund, Kran/Aufstellhilfe, Anlieferung des
 * Konstruktionsholzes und Baustelleneinrichtung. Alle Ansätze sind
 * Erfahrungswerte für die Oststeiermark und im Kosten-Tab überschreibbar.
 */
function buildZimmereiNebenleistungen(timberVolume: number, roofArea: number, hasGlulam: boolean): CostPosition[] {
  if (timberVolume <= 0) return [];
  const out: CostPosition[] = [];

  // Abbund (Zuschnitt): CNC-Abbund eines Standard-Dachstuhls
  const abbundSatz = 95; // €/m³
  out.push({
    id: 'abbund',
    description: 'Abbund Konstruktionsholz (CNC, inkl. Kerven, Schmiegen, Zierschnitt)',
    category: 'Lohn',
    quantity: +timberVolume.toFixed(2),
    unit: 'm³',
    unitPrice: abbundSatz,
    total: +(timberVolume * abbundSatz).toFixed(2),
    notes: 'Erfahrungswert Standard-Dachstuhl. Handabbund oder aufwendige Anschlüsse teurer.',
  });

  // Anlieferung Konstruktionsholz (Sondertransport für BSH läuft separat)
  if (!hasGlulam) {
    out.push({
      id: 'anlieferung',
      description: 'Anlieferung Konstruktionsholz auf die Baustelle',
      category: 'Lohn',
      quantity: 1, unit: 'pauschal', unitPrice: 280, total: 280,
      notes: 'LKW-Fuhre innerhalb der Region. Bei weiter Anfahrt anpassen.',
    });
  }

  // Kran / Aufstellhilfe (bei BSH wird der Kran bereits separat verrechnet)
  if (!hasGlulam) {
    out.push({
      id: 'kran_aufstellen',
      description: 'Kran / Aufstellhilfe (Halbtag) für das Aufrichten des Dachstuhls',
      category: 'Lohn',
      quantity: 1, unit: 'pauschal', unitPrice: 490, total: 490,
      notes: 'Halber Tagessatz Mobilkran inkl. Bediener.',
    });
  }

  // Baustelleneinrichtung + Nebenleistungen
  out.push({
    id: 'baustelle',
    description: 'Baustelleneinrichtung, Absturzsicherung, Nebenleistungen',
    category: 'Lohn',
    quantity: 1, unit: 'pauschal', unitPrice: 350, total: 350,
    notes: 'Ohne Gerüststellung — Gerüst wird üblicherweise vom Bauherrn beigestellt.',
  });

  // Werk-/Abbundplan
  out.push({
    id: 'werkplan',
    description: 'Werk- und Abbundplan, Aufmaß vor Ort',
    category: 'Lohn',
    quantity: 1, unit: 'pauschal', unitPrice: 380, total: 380,
    notes: `Bezogen auf ${Math.round(roofArea)} m² Dachfläche.`,
  });

  return out;
}

/** Transport-Positionen aus computeTransportPlan ableiten */
function buildTransportPositions(plan: TransportPlan): CostPosition[] {
  if (plan.segments.length === 0) return [];
  return plan.segments.map((s, idx) => ({
    id: `transport_${idx}`,
    description: `Transport-Segment ${s.segmentIndex}: ${s.length_m.toFixed(1)} m, ${s.category}`,
    category: 'Lohn',
    quantity: 1,
    unit: 'pauschal',
    unitPrice: s.extraCost,
    total: s.extraCost,
    notes: s.note,
  }));
}

/** Dachfläche (Schräge) aus Grundriss + Neigung, INKL. Dachüberstand */
function calcRoofArea(geometry: BuildingGeometry, overhang: number = DEFAULT_ROOF_OVERHANG): number {
  return roofAreaWithOverhang(geometry.length.value, geometry.width.value, geometry.roofPitch.value, overhang);
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

/** Erzeugt CostPosition-Einträge für Stoßstellen (Verbinder + optionaler Lohn) */
function buildJointPositions(joints: JointSpec[], withLabor: boolean): CostPosition[] {
  if (joints.length === 0) return [];
  const positions: CostPosition[] = [];
  joints.forEach((j, idx) => {
    positions.push({
      id: `joint_connector_${idx}`,
      description: `Stoß ${j.type} bei ${j.position.toFixed(2)} m – ${j.notes}`,
      category: 'Verbinder',
      quantity: 1,
      unit: 'Stk',
      unitPrice: j.extraCost,
      total: j.extraCost,
      source: 'default' as const,
      notes: `Stoßlasche/Bolzen pauschal`,
    });
    if (withLabor) {
      positions.push({
        id: `joint_labor_${idx}`,
        description: `Stoß ausführen bei ${j.position.toFixed(2)} m`,
        category: 'Lohn',
        quantity: 1,
        unit: 'h',
        unitPrice: 75,
        total: 75,
        source: 'default' as const,
        notes: `Zimmererleistung Stoß, 1 h à 75 €`,
      });
    }
  });
  return positions;
}

/** Fügt Stoßstellen-Positionen in eine CostEstimate ein und aktualisiert Subtotals/Net/Vat/Gross */
function injectJointsIntoEstimate(estimate: CostEstimate, joints: JointSpec[], withLabor: boolean): CostEstimate {
  return addPositionsToEstimate(estimate, buildJointPositions(joints, withLabor), withLabor);
}

/**
 * Fügt Positionen in eine fertige CostEstimate ein und rechnet Gemeinkosten,
 * Gewinn und MwSt korrekt NACH. Vorher wurden nachträglich eingefügte
 * Positionen (Verschalung, Transport, Stöße) nur auf netto addiert — sie
 * bekamen weder Gemeinkosten- noch Gewinnaufschlag, und die ausgewiesenen
 * Prozentsätze stimmten nicht mehr mit den Beträgen überein.
 */
function addPositionsToEstimate(est: CostEstimate, extras: CostPosition[], applySurcharges: boolean): CostEstimate {
  if (extras.length === 0) return est;
  const positions = [...est.positions, ...extras];
  const addBase = extras.reduce((s, p) => s + p.total, 0);

  const ovRate = applySurcharges ? est.factors.overhead / 100 : 0;
  const prRate = applySurcharges ? est.factors.profit / 100 : 0;
  const addOverhead = addBase * ovRate;
  const addProfit = (addBase + addOverhead) * prRate;
  const addNet = addBase + addOverhead + addProfit;
  const vatRate = est.factors.vat;
  const addVat = addNet * vatRate / 100;

  const subtotals = { ...est.subtotals };
  for (const p of extras) {
    if (p.category === 'Holz' || p.category === 'Holz (individuell)') subtotals.material += p.total;
    else if (p.category === 'Eindeckung') subtotals.covering += p.total;
    else if (p.category === 'Dämmung' || p.category === 'Folien') subtotals.insulation += p.total;
    else if (p.category === 'Verbinder') subtotals.fasteners += p.total;
    else if (p.category === 'Lohn') subtotals.labor += p.total;
    else subtotals.other += p.total;
  }

  const net = est.net + addNet;
  const vat = est.vat + addVat;
  const gross = net + vat;

  const surcharges = est.appliedSurcharges.map(s => {
    if (s.name.startsWith('Gemeinkosten')) return { ...s, amount: s.amount + addOverhead };
    if (s.name.startsWith('Unternehmergewinn')) return { ...s, amount: s.amount + addProfit };
    if (s.name.startsWith('Umsatzsteuer')) return { ...s, amount: s.amount + addVat };
    return s;
  });

  return {
    ...est,
    positions,
    subtotals,
    net, vat, gross,
    appliedSurcharges: surcharges,
    summary: `Gesamt brutto: ${gross.toLocaleString('de-AT', { maximumFractionDigits: 0 })} € (netto ${net.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €, ${positions.length} Positionen).`,
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
  const coveringId = opts?.coveringType
    ? coveringTypeToCoveringId(opts.coveringType.type)
    : (opts?.coveringId ?? 'tile_clay');
  const insulationId = opts?.insulationId ?? 'ins_mw_200';
  const roofParts = opts?.roofParts;
  const zimmereiOnly = opts?.zimmereiOnly ?? true;  // Default: Zimmerei-Modus
  const joints = opts?.joints ?? [];
  const roofForm = opts?.roofForm ?? 'satteldach';
  const includeDeckPlanks = opts?.includeDeckPlanks ?? true;
  const includeTransport = opts?.includeTransport ?? true;

  // Helper: Verschalung + Transport in eine CostEstimate einfügen
  const hasLeimbinder = members.some(m => m.type === 'leimbinder');
  const overhang = opts?.roofOverhang ?? DEFAULT_ROOF_OVERHANG;
  const totalRoofArea = roofParts && roofParts.length > 0
    ? roofParts.reduce((s, p) => s + roofAreaWithOverhang(p.geometry.length, p.geometry.width, p.geometry.pitch, overhang), 0)
    : calcRoofArea(geometry, overhang);
  const transportPlan = includeTransport ? computeTransportPlan(members) : undefined;
  const plankPositions = includeDeckPlanks ? buildDeckPlankPositions(roofForm, hasLeimbinder, totalRoofArea) : [];
  const transportPositions = transportPlan ? buildTransportPositions(transportPlan) : [];
  const timberVolume = members.reduce(
    (s, m) => s + (m.width / 1000) * (m.height / 1000) * m.length * m.quantity, 0,
  );
  const nebenleistungen = buildZimmereiNebenleistungen(timberVolume, totalRoofArea, hasLeimbinder);

  function injectExtras(est: CostEstimate, withLaborMode: boolean): CostEstimate {
    const extras: CostPosition[] = [
      ...plankPositions,
      // Abbund, Anlieferung, Kran, Baustelleneinrichtung, Werkplan: nur in der
      // Voll-Kalkulation, nicht in der reinen Materialliste.
      ...(withLaborMode ? [...transportPositions, ...nebenleistungen] : []),
    ];
    // In der Voll-Kalkulation bekommen die Zusatzpositionen Gemeinkosten und
    // Gewinn wie jede andere Position; in der reinen Materialliste nicht.
    return addPositionsToEstimate(est, extras, withLaborMode);
  }
  const extraOrderItems: OrderListItem[] = plankPositions.map(p => ({
    supplier: 'Sägewerk' as const,
    description: p.description, quantity: p.quantity, unit: p.unit,
    unitPrice: p.unitPrice, total: p.total, notes: p.notes,
  }));

  // ── Fall 1: roofParts vorhanden → pro Dachteil berechnen ──
  if (roofParts && roofParts.length > 0) {
    const byRoofPart: RoofPartCostEntry[] = roofParts.map(part => {
      const partMembers = part.members && part.members.length > 0
        ? part.members
        : members; // fallback: alle Members wenn Dachteil keine eigenen hat

      const roofArea = roofAreaWithOverhang(part.geometry.length, part.geometry.width, part.geometry.pitch, overhang);
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
    let materialOnly = aggregateEstimates(byRoofPart.map(p => p.materialOnly));
    let withLabor = aggregateEstimates(byRoofPart.map(p => p.withLabor));
    let orderList = byRoofPart.flatMap(p => p.orderList);

    // Stoßstellen-Kosten in Gesamtsumme einarbeiten
    if (joints.length > 0) {
      materialOnly = injectJointsIntoEstimate(materialOnly, joints, false);
      withLabor = injectJointsIntoEstimate(withLabor, joints, true);
      const jointOrderItems: OrderListItem[] = joints.map((j, idx) => ({
        supplier: 'Verbinder' as const,
        description: `Stoß ${j.type} bei ${j.position.toFixed(2)} m`,
        quantity: 1,
        unit: 'Stk',
        unitPrice: j.extraCost,
        total: j.extraCost,
        notes: j.notes,
      }));
      orderList = [...orderList, ...jointOrderItems];
    }

    // Verschalung + Transport einfügen
    materialOnly = injectExtras(materialOnly, false);
    withLabor = injectExtras(withLabor, true);
    orderList = [...orderList, ...extraOrderItems];

    return { materialOnly, withLabor, orderList, byRoofPart, transport: transportPlan };
  }

  // ── Fall 2: kein roofParts → bestehendes Verhalten ──
  const roofArea = calcRoofArea(geometry);
  const groundArea = calcGroundArea(geometry);
  let { materialOnly, withLabor, orderList } = computeForMembers(
    members,
    roofArea,
    groundArea,
    coveringId,
    insulationId,
    undefined,
    zimmereiOnly,
  );

  // Stoßstellen-Kosten einfügen
  if (joints.length > 0) {
    materialOnly = injectJointsIntoEstimate(materialOnly, joints, false);
    withLabor = injectJointsIntoEstimate(withLabor, joints, true);
    const jointOrderItems: OrderListItem[] = joints.map((j) => ({
      supplier: 'Verbinder' as const,
      description: `Stoß ${j.type} bei ${j.position.toFixed(2)} m`,
      quantity: 1,
      unit: 'Stk',
      unitPrice: j.extraCost,
      total: j.extraCost,
      notes: j.notes,
    }));
    orderList = [...orderList, ...jointOrderItems];
  }

  // Verschalung + Transport
  materialOnly = injectExtras(materialOnly, false);
  withLabor = injectExtras(withLabor, true);
  orderList = [...orderList, ...extraOrderItems];

  // Holzständerwand-Pauschalposition wenn vorhanden
  const wallItems = buildWallConstructionPositions(opts?.wallConstructions, opts?.floorAreaPerLevel ?? groundArea);
  if (wallItems.length > 0) {
    withLabor = addPositionsToEstimate(withLabor, wallItems, true);
    orderList = [...orderList, ...wallItems.map(p => ({
      supplier: 'Sonstiges' as const,
      description: p.description,
      quantity: p.quantity,
      unit: p.unit,
      unitPrice: p.unitPrice,
      total: p.total,
      notes: p.notes,
    }))];
  }

  return { materialOnly, withLabor, orderList, transport: transportPlan };
}

/** Erzeugt Pauschal-Positionen für Holzständerwände (50 €/m² Lohn) */
function buildWallConstructionPositions(walls: WallConstruction[] | undefined, floorArea: number): CostPosition[] {
  if (!walls || walls.length === 0) return [];
  const holzWalls = walls.filter(w => ['holzstaender', 'kvh', 'bsh'].includes(w.type));
  if (holzWalls.length === 0) return [];
  // Grobe Schätzung: Wandfläche = Umfang × 2.7 m lichte Höhe
  // Umfang aus Grundfläche: Annahme quadratisch → Seite = sqrt(A), Umfang = 4 × Seite
  const sideLen = Math.sqrt(Math.max(floorArea, 1));
  const perimeter = 4 * sideLen;
  const wallHeightDefault = 2.7;
  const wallArea = Math.round(perimeter * wallHeightDefault * holzWalls.length);
  const unitPrice = 50; // €/m² Lohn pauschal
  return [{
    id: 'holzstaenderwand_lohn',
    description: `Holzständerwand Lohn pauschal (${holzWalls.map(w => w.level).join(', ')}) — Schätzwert`,
    category: 'Lohn',
    quantity: wallArea,
    unit: 'm²',
    unitPrice,
    total: wallArea * unitPrice,
    notes: `Pauschal 50 €/m² Zimmerei-Lohn für Holzständerwand. Wand-Fläche aus Grundriss geschätzt (${wallArea} m²). Bitte prüfen!`,
  }];
}
