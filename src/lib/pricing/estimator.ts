/**
 * Kostenschätzer für Dachtragwerk.
 *
 * Berechnet automatisch:
 *  - Holzvolumen aus Bauteilliste (b × h × l × Stückzahl)
 *  - Dachflächenkosten (Eindeckung, Dämmung, Folien)
 *  - Verbinder (Schätzung pro Bauteil)
 *  - Lohn (pro m² Grundfläche)
 *  - Aufschläge (Verschnitt, Gemeinkosten, MwSt)
 *
 * Liefert detaillierten Massenauszug + Kostenstruktur.
 * Pro Position kann der Anwender einen individuellen Preis hinterlegen.
 */

import type { TimberMember } from '@/types/project';
import { DEFAULT_PRICES, DEFAULT_FACTORS, type PriceItem, type PricingFactors } from './database';

export interface PositionPriceOverride {
  /** ID des Standard-Preisitems – wird überschrieben */
  priceItemId?: string;
  /** ID eines spezifischen Bauteils (z.B. „member_3") */
  memberId?: string;
  /** Überschriebener Preis pro Einheit */
  price: number;
  reason?: string;
}

export interface CostPosition {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  source: 'default' | 'override' | 'custom';
  notes?: string;
}

export interface CostEstimate {
  positions: CostPosition[];
  subtotals: { material: number; covering: number; insulation: number; fasteners: number; labor: number; other: number };
  net: number;            // Summe netto
  vat: number;            // 20 %
  gross: number;          // netto + MwSt
  factors: PricingFactors;
  appliedSurcharges: { name: string; percent: number; amount: number }[];
  summary: string;
  explanation: string;
}

export interface EstimatorInput {
  members: TimberMember[];
  /** Dachfläche in m² (Schräge) */
  roofArea: number;
  /** Grundrissfläche in m² (für Lohnpauschale) */
  groundArea: number;
  /** Welche Eindeckung (priceItemId) */
  coveringId?: string;
  /** Welche Dämmung */
  insulationId?: string;
  /** Aufbau-Membranen */
  membraneIds?: string[];
  /** Spezielle BSH-Komponenten (gebogen, lang) */
  hasGlulam?: boolean;
  /** Standardpreis-Liste (default DEFAULT_PRICES) */
  priceList?: PriceItem[];
  /** Position-spezifische Überschreibungen */
  overrides?: PositionPriceOverride[];
  /** Faktoren */
  factors?: PricingFactors;
}

function findPrice(list: PriceItem[], id: string): PriceItem | undefined {
  return list.find(p => p.id === id);
}

/** Volumen eines Bauteils in m³ */
function memberVolume(m: TimberMember): number {
  return (m.width / 1000) * (m.height / 1000) * m.length * m.quantity;
}

/** Wählt passendes Preisitem für ein Bauteil basierend auf Material */
function priceIdForMember(m: TimberMember): string {
  const mat = (m.material || '').toLowerCase();
  if (mat.includes('gl24')) return 'bsh_gl24h';
  if (mat.includes('gl28')) return 'bsh_gl28h';
  if (mat.includes('c30')) return 'kvh_c30';
  return 'kvh_c24_nsi';
}

export function estimateCost(input: EstimatorInput): CostEstimate {
  const list = input.priceList || DEFAULT_PRICES;
  const factors = input.factors || DEFAULT_FACTORS;
  const overrides = input.overrides || [];
  const positions: CostPosition[] = [];

  const findOverride = (priceItemId?: string, memberId?: string) =>
    overrides.find(o => (memberId && o.memberId === memberId) || (priceItemId && o.priceItemId === priceItemId && !o.memberId));

  // 1. Holzmengen pro Bauteil
  const woodVolumes: Record<string, number> = {};
  for (const m of input.members) {
    const pid = priceIdForMember(m);
    const vol = memberVolume(m);
    woodVolumes[pid] = (woodVolumes[pid] || 0) + vol;

    // Wenn Override für genau diesen Member: eigene Position
    const ov = findOverride(undefined, m.id);
    if (ov) {
      positions.push({
        id: `member_${m.id}`,
        category: 'Holz (individuell)',
        description: `${m.name} (${m.width}/${m.height} mm × ${m.length} m × ${m.quantity})`,
        quantity: vol,
        unit: 'm³',
        unitPrice: ov.price,
        total: vol * ov.price,
        source: 'override',
        notes: ov.reason,
      });
    }
  }

  // Holz-Positionen pro Material (ohne explizite Overrides)
  for (const [pid, vol] of Object.entries(woodVolumes)) {
    const memberOverrides = input.members
      .filter(m => priceIdForMember(m) === pid && overrides.find(o => o.memberId === m.id))
      .reduce((s, m) => s + memberVolume(m), 0);
    const remaining = vol - memberOverrides;
    if (remaining <= 0.001) continue;

    const item = findPrice(list, pid);
    if (!item) continue;
    const ov = findOverride(pid);
    const price = ov ? ov.price : item.price;
    // Verschnitt
    const qty = remaining * (1 + factors.wasteTimber / 100);
    positions.push({
      id: `wood_${pid}`,
      category: 'Holz',
      description: `${item.name} (inkl. ${factors.wasteTimber} % Verschnitt)`,
      quantity: parseFloat(qty.toFixed(3)),
      unit: item.unit,
      unitPrice: price,
      total: qty * price,
      source: ov ? 'override' : 'default',
    });
  }

  // 2. Dacheindeckung
  if (input.coveringId && input.roofArea > 0) {
    const item = findPrice(list, input.coveringId);
    if (item) {
      const ov = findOverride(input.coveringId);
      const price = ov ? ov.price : item.price;
      positions.push({
        id: 'covering', category: 'Eindeckung', description: item.name,
        quantity: input.roofArea, unit: item.unit, unitPrice: price,
        total: input.roofArea * price, source: ov ? 'override' : 'default',
      });
    }
  }

  // 3. Dämmung
  if (input.insulationId && input.roofArea > 0) {
    const item = findPrice(list, input.insulationId);
    if (item) {
      positions.push({
        id: 'insulation', category: 'Dämmung', description: item.name,
        quantity: input.roofArea, unit: item.unit, unitPrice: item.price,
        total: input.roofArea * item.price, source: 'default',
      });
    }
  }

  // 4. Membranen
  for (const mid of input.membraneIds || []) {
    const item = findPrice(list, mid);
    if (item) positions.push({
      id: `mem_${mid}`, category: 'Folien', description: item.name,
      quantity: input.roofArea, unit: item.unit, unitPrice: item.price,
      total: input.roofArea * item.price, source: 'default',
    });
  }

  // 5. Verbinder – Schätzung pro Bauteil (ca. 4 Schrauben + 1 Anker pro Sparren)
  const sparrenCount = input.members.filter(m => m.type === 'sparren').reduce((s, m) => s + m.quantity, 0);
  if (sparrenCount > 0) {
    const screw = findPrice(list, 'screw_8x180');
    const tie = findPrice(list, 'tie_down');
    if (screw) positions.push({
      id: 'fasteners_screws', category: 'Verbinder', description: 'Holzbauschrauben (Schätzung 4 Stk pro Sparren)',
      quantity: sparrenCount * 4, unit: 'Stk', unitPrice: screw.price,
      total: sparrenCount * 4 * screw.price, source: 'default',
    });
    if (tie) positions.push({
      id: 'fasteners_tie', category: 'Verbinder', description: 'Sturmanker (1 pro Sparren)',
      quantity: sparrenCount, unit: 'Stk', unitPrice: tie.price,
      total: sparrenCount * tie.price, source: 'default',
    });
  }

  // 6. BSH-Auflagerschuhe
  const glulamMembers = input.members.filter(m => (m.material || '').toLowerCase().includes('gl'));
  if (glulamMembers.length > 0) {
    const bracket = findPrice(list, 'bracket_glulam');
    if (bracket) {
      const qty = glulamMembers.reduce((s, m) => s + m.quantity * 2, 0);  // 2 Auflager pro Träger
      positions.push({
        id: 'fasteners_bracket', category: 'Verbinder', description: 'BSH-Auflagerschuhe (2 pro Träger)',
        quantity: qty, unit: 'Stk', unitPrice: bracket.price,
        total: qty * bracket.price, source: 'default',
      });
    }
  }

  // 7. Lohn
  if (input.groundArea > 0) {
    const lab = findPrice(list, 'labor_assembly');
    if (lab) positions.push({
      id: 'labor_main', category: 'Lohn', description: 'Montage Dachstuhl',
      quantity: input.groundArea, unit: lab.unit, unitPrice: lab.price,
      total: input.groundArea * lab.price, source: 'default',
    });
  }
  if (input.hasGlulam) {
    const glabor = findPrice(list, 'labor_glulam');
    const glulamSpan = glulamMembers.reduce((s, m) => s + m.length * m.quantity, 0);
    if (glabor && glulamSpan > 0) {
      positions.push({
        id: 'labor_glulam', category: 'Lohn', description: 'Montage BSH-Träger inkl. Kran',
        quantity: glulamSpan, unit: 'm', unitPrice: glabor.price,
        total: glulamSpan * glabor.price, source: 'default',
      });
      const crane = findPrice(list, 'crane');
      if (crane) positions.push({
        id: 'crane', category: 'Sonstiges', description: 'Kran-Einsatz',
        quantity: 1, unit: 'pauschal', unitPrice: crane.price,
        total: crane.price, source: 'default',
      });
    }
  }

  // Subtotals
  const subtotals = { material: 0, covering: 0, insulation: 0, fasteners: 0, labor: 0, other: 0 };
  for (const p of positions) {
    if (p.category === 'Holz' || p.category === 'Holz (individuell)') subtotals.material += p.total;
    else if (p.category === 'Eindeckung') subtotals.covering += p.total;
    else if (p.category === 'Dämmung' || p.category === 'Folien') subtotals.insulation += p.total;
    else if (p.category === 'Verbinder') subtotals.fasteners += p.total;
    else if (p.category === 'Lohn') subtotals.labor += p.total;
    else subtotals.other += p.total;
  }

  const baseSum = positions.reduce((s, p) => s + p.total, 0);
  const overhead = baseSum * factors.overhead / 100;
  const profit = (baseSum + overhead) * factors.profit / 100;
  const net = baseSum + overhead + profit;
  const vat = net * factors.vat / 100;
  const gross = net + vat;

  return {
    positions,
    subtotals,
    net, vat, gross, factors,
    appliedSurcharges: [
      { name: `Gemeinkosten (${factors.overhead} %)`, percent: factors.overhead, amount: overhead },
      { name: `Unternehmergewinn (${factors.profit} %)`, percent: factors.profit, amount: profit },
      { name: `Umsatzsteuer (${factors.vat} %)`, percent: factors.vat, amount: vat },
    ],
    summary: `Gesamt brutto: ${gross.toLocaleString('de-AT', { maximumFractionDigits: 0 })} € (netto ${net.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €, ${positions.length} Positionen).`,
    explanation: `Kostenschätzung basiert auf ${input.members.length} Bauteilen mit ${(input.members.reduce((s, m) => s + memberVolume(m), 0)).toFixed(2)} m³ Holz, ${input.roofArea} m² Dachfläche und ${input.groundArea} m² Grundfläche. Aufschläge: ${factors.wasteTimber}% Verschnitt auf Holz, ${factors.overhead}% Gemeinkosten, ${factors.profit}% Gewinn, ${factors.vat}% MwSt. Anpassbar pro Position oder global im Admin.`,
  };
}

/** CSV-Export für Massenauszug */
export function exportEstimateAsCSV(est: CostEstimate): string {
  const lines = ['Kategorie;Beschreibung;Menge;Einheit;EP [€];GP [€];Quelle'];
  for (const p of est.positions) {
    lines.push([
      p.category, p.description.replace(/;/g, ','),
      p.quantity.toLocaleString('de-AT'), p.unit,
      p.unitPrice.toFixed(2), p.total.toFixed(2),
      p.source,
    ].join(';'));
  }
  lines.push('');
  lines.push(`;;;;Zwischensumme netto;${(est.net - est.appliedSurcharges.filter(s => s.name.includes('Mehrwert')).reduce((s, x) => s + x.amount, 0)).toFixed(2)};`);
  for (const s of est.appliedSurcharges) lines.push(`;;;;${s.name};${s.amount.toFixed(2)};`);
  lines.push(`;;;;GESAMT brutto;${est.gross.toFixed(2)};`);
  return lines.join('\n');
}
