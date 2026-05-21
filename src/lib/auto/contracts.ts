/**
 * Schnittstellen-Verträge für die Auto-Pipeline.
 *
 * Diese Datei wird vom Orchestrator gelesen und legt fest, wie die einzelnen
 * Auto-Module miteinander reden.
 *
 * Pipeline:
 *   Project (KI-extrahiert)
 *     → autoDerive: füllt fehlende Geometriewerte sinnvoll auf
 *     → autoMembers: erzeugt Sparren/Pfetten/Stützen aus Tragsystem + Geometrie
 *     → autoLoads:   ermittelt Lasten (Schnee/Wind/Eigengewicht) mit Defaults
 *     → autoCalculate: dimensioniert jedes Bauteil per Optimizer
 *     → autoCost:    Massenauszug + Kostenschätzung mit/ohne Lohn
 *
 * JEDE Annahme wird in `assumptions[]` protokolliert, damit User später ändern kann.
 */

import type { Project, BuildingGeometry, RoofType, StructuralSystem, TimberMember, LoadCase } from '@/types/project';
import type { RoofPart } from '@/types/roofParts';
import type { CostEstimate } from '@/lib/pricing';

export interface AutoAssumption {
  field: string;
  value: string | number;
  reason: string;
  source: 'default' | 'derived' | 'standard' | 'fallback';
}

export interface DerivedGeometry {
  geometry: BuildingGeometry;
  assumptions: AutoAssumption[];
}

export interface AutoMembersResult {
  members: TimberMember[];
  assumptions: AutoAssumption[];
  description: string;
}

export interface AutoLoadsResult {
  loadCases: LoadCase[];
  assumptions: AutoAssumption[];
  snowZone: '1' | '2' | '3' | '4';
  windZone: '1' | '2' | '3' | '4';
  terrain: '0' | 'I' | 'II' | 'III' | 'IV';
  altitude: number;
  state: string;
}

export interface AutoCalculationResult {
  /** Pro Bauteil: Optimizer-Ergebnis */
  members: Array<{
    member: TimberMember;
    section: { b: number; h: number; label: string };
    timberClass: string;
    maxUtilization: number;
    overallStatus: 'green' | 'yellow' | 'red';
    summary: string;
    checks: Array<{ name: string; utilization: number; status: string; explanation: string }>;
  }>;
  /** Verbesserte Members mit Optimizer-Ergebnis (b, h, material updated) */
  optimizedMembers: TimberMember[];
  assumptions: AutoAssumption[];
}

export interface AutoCostResult {
  materialOnly: CostEstimate;     // nur Material (Holz + Verbinder + Eindeckung)
  withLabor: CostEstimate;         // Material + Lohn + Aufschläge
  orderList: OrderListItem[];      // konkrete Bestellliste
}

export interface OrderListItem {
  /** Lieferant-Kategorie: Sägewerk, Eindeckung, Verbinder, Dämmung */
  supplier: 'Sägewerk' | 'Eindeckung' | 'Verbinder' | 'Dämmung' | 'Folien' | 'Sonstiges';
  description: string;
  dimensions?: string;     // z.B. "8/16 cm"
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  notes?: string;
}

/**
 * Komplett-Ergebnis der Auto-Pipeline.
 */
export interface AutoPipelineResult {
  geometry: DerivedGeometry;
  roofType: { roofType: RoofType; assumptions: AutoAssumption[] };
  structuralSystem: { structuralSystem: StructuralSystem; assumptions: AutoAssumption[] };
  members: AutoMembersResult;
  loads: AutoLoadsResult;
  calculations: AutoCalculationResult;
  costs: AutoCostResult;
  /** Gesamtsumme aller Annahmen */
  allAssumptions: AutoAssumption[];
  /** "Komplett bestätigte Werte ohne Annahme" Quote */
  confidenceScore: number;
  /** Human-readable Zusammenfassung */
  summary: string;
  /** Aktualisierte Dachteile mit generierten Members (nur wenn multi-part) */
  roofParts?: RoofPart[];
}

export interface AutoPipelineInput {
  project: Project;
  /** Standard-Sparrenabstand wenn aus Plan nicht ableitbar (default 0.8m) */
  sparrenSpacing?: number;
  /** Standard-Dachaufbau (default Tondachziegel + Mineralwolle) */
  roofComposition?: 'ziegel_standard' | 'blech' | 'gruendach';
  /** Mit oder ohne Optimizer (default true) */
  useOptimizer?: boolean;
}
