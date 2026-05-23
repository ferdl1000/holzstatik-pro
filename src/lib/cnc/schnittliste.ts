/**
 * Schnittlisten-Optimierung für den Zimmerei-Betrieb.
 * Algorithmus: First-Fit-Decreasing (FFD) Bin-Packing.
 * Gruppiert nach Material + Querschnitt, minimiert Verschnitt auf Standard-Stablängen.
 */

import type { TimberMember } from '@/types/project';
import { lookupLengthRule } from '@/lib/auto/standards';

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface CutItem {
  memberId:  string;
  memberName: string;
  length:    number;   // mm
  quantity:  number;
}

export interface StockBar {
  stockLength:  number;   // mm
  cuts:         CutItem[];
  usedLength:   number;   // mm
  wasteLength:  number;   // mm
}

export interface CuttingStock {
  material:       string;
  crossSection:   string;
  stockLength:    number;       // gewählte Standard-Stablänge in mm
  bars:           StockBar[];   // Stäbe mit Zuschnittzuweisung
  totalBars:      number;
  totalUsed_mm:   number;
  totalWaste_mm:  number;
  wastePercent:   number;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Wählt die optimale Standard-Stablänge für eine gegebene maximalen Zuschnittlänge */
function chooseBestStockLength(maxCutLengthMM: number, material: string): number {
  const rule = lookupLengthRule(material);
  // Bevorzugte Längen in mm
  const lengths = rule.preferredLengths.map(l => l * 1000);
  // Kleinste Länge wählen, die >= maxCutLength (plus Sägeblatt-Zugabe 5 mm)
  const suitable = lengths.filter(l => l >= maxCutLengthMM + 5);
  if (suitable.length > 0) return suitable[0];
  // Sonst maximal verfügbare Länge
  return lengths[lengths.length - 1];
}

/** Gruppierungsschlüssel */
function groupKey(m: TimberMember): string {
  return `${m.material || 'C24'}|${m.crossSection || `${m.width}x${m.height}`}`;
}

// ─── FFD Bin-Packing ──────────────────────────────────────────────────────────

function ffdPack(cuts: CutItem[], stockLength: number): StockBar[] {
  const BLADE = 3; // Sägeblatt-Verlust mm

  // Alle Zuschnitte als Einzelschnitte expandieren (Quantity → einzelne Einträge)
  const expanded: CutItem[] = [];
  for (const cut of cuts) {
    for (let q = 0; q < cut.quantity; q++) {
      expanded.push({ ...cut, quantity: 1 });
    }
  }

  // Absteigend nach Länge sortieren (FFD)
  expanded.sort((a, b) => b.length - a.length);

  const bars: StockBar[] = [];

  for (const cut of expanded) {
    const needed = cut.length + BLADE;
    // Ersten Stab finden mit genug Rest
    const bar = bars.find(b => b.usedLength + needed <= stockLength);
    if (bar) {
      bar.cuts.push(cut);
      bar.usedLength   += needed;
      bar.wasteLength   = stockLength - bar.usedLength;
    } else {
      // Neuen Stab öffnen
      bars.push({
        stockLength,
        cuts:        [cut],
        usedLength:  needed,
        wasteLength: stockLength - needed,
      });
    }
  }

  return bars;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Optimiert Schnittlisten für alle TimberMembers.
 * Liefert pro Material+Querschnitt-Gruppe einen CuttingStock mit FFD-Zuweisung.
 */
export function optimizeCutting(members: TimberMember[]): CuttingStock[] {
  // Gruppieren
  const groups = new Map<string, { material: string; crossSection: string; cuts: CutItem[] }>();

  for (const m of members) {
    const key = groupKey(m);
    if (!groups.has(key)) {
      groups.set(key, {
        material:     m.material || 'C24',
        crossSection: m.crossSection || `${m.width}x${m.height}`,
        cuts:         [],
      });
    }
    const lengthMM = Math.round(m.length * 1000);
    groups.get(key)!.cuts.push({
      memberId:   m.id,
      memberName: m.name,
      length:     lengthMM,
      quantity:   m.quantity,
    });
  }

  const result: CuttingStock[] = [];

  for (const g of groups.values()) {
    const maxCut = Math.max(...g.cuts.map(c => c.length));
    const stockLen = chooseBestStockLength(maxCut, g.material);
    const bars  = ffdPack(g.cuts, stockLen);

    const totalUsed  = bars.reduce((s, b) => s + b.usedLength, 0);
    const totalWaste = bars.reduce((s, b) => s + b.wasteLength, 0);
    const totalMM    = bars.length * stockLen;
    const waste      = totalMM > 0 ? (totalWaste / totalMM) * 100 : 0;

    result.push({
      material:      g.material,
      crossSection:  g.crossSection,
      stockLength:   stockLen,
      bars,
      totalBars:     bars.length,
      totalUsed_mm:  totalUsed,
      totalWaste_mm: totalWaste,
      wastePercent:  +waste.toFixed(1),
    });
  }

  // Sortierung: erst nach Verschnitt aufsteigend
  result.sort((a, b) => a.wastePercent - b.wastePercent);
  return result;
}
