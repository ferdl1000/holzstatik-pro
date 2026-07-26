import type { RoofPart } from './roofParts';

// ===== Roof Covering =====
export interface RoofCovering {
  type: 'tile_clay' | 'tile_concrete' | 'metal_falz' | 'trapezblech' | 'schiefer' | 'sandwich_paneel' | 'gruendach_ext' | 'gruendach_int' | 'pv' | 'bitumen' | 'sonstiges' | 'unbekannt';
  weight_kN_m2: number;
  evidence?: string;
  confidence: number;
}

// ===== Status & Confidence Types =====
export type StatusLevel = 'green' | 'yellow' | 'red';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface AgentResult<T = unknown> {
  agent: string;
  status: 'completed' | 'needs_review' | 'incomplete' | 'error';
  confidence: number;
  extractedValues: T;
  assumptions: string[];
  conflicts: string[];
  requiredUserActions: string[];
  timestamp: string;
}

// ===== Ceiling Areas =====
export interface CeilingArea {
  id: string;
  level: string;            // "EG", "OG", "DG", "Spitzboden"
  area: number;             // m² Grundfläche
  span: number;             // m längere Spannweite
  nutzung: 'Wohnen' | 'Lager' | 'Versammlung' | 'Spitzboden' | 'Buero' | 'Sonstiges';

  // Konstruktionstyp — bestimmt ob Holzbalken generiert werden
  constructionType?: 'holzbalkendecke' | 'stb_decke' | 'rippendecke' | 'unbekannt';
  evidence?: string;        // z.B. "STB-Decke laut Aufbau 09"

  confidence: number;
}

// ===== Wand-Konstruktion =====
export interface WallConstruction {
  level: string;
  type: 'stb' | 'ziegel' | 'holzstaender' | 'kvh' | 'bsh' | 'mischbau' | 'unbekannt';
  thickness_mm?: number;    // z.B. 250 für STB 25cm, 380 für 38er Ziegel
  material?: string;        // 'STB', 'Ziegel 38', 'Holzständer', etc.
  evidence?: string;
  confidence: number;
}

// ===== Fire Protection =====
export interface FireProtection {
  buildingClass?: 'GK1' | 'GK2' | 'GK3' | 'GK4' | 'GK5';
  buildingClassReason?: string;
  fireResistanceClasses?: Array<{ code: string; applies_to?: string; evidence?: string }>;
  confidence?: number;
}

// ===== Project =====
export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  status: StatusLevel;
  currentStep: number;
  documents: UploadedDocument[];
  address?: ExtractedAddress;
  geometry?: BuildingGeometry;
  roofType?: RoofType;
  structuralSystem?: StructuralSystem;
  loadCases: LoadCase[];
  materials: MaterialProfile[];
  members: TimberMember[];
  calculations: CalculationResult[];
  validationIssues: ValidationIssue[];
  auditEntries: AuditEntry[];
  /** Multi-Dachteil-Erweiterung: erkannte Dachteile mit je eigener Geometrie + Bauteilen */
  roofParts?: RoofPart[];
  /** Erkannte Zwischendecken / Holzbalkendecken */
  ceilings?: CeilingArea[];
  /** Erkannte Eindeckung mit Eigengewicht */
  coveringType?: RoofCovering;
  /** Wand-Konstruktionstypen pro Geschoss */
  wallConstructions?: WallConstruction[];
  /** Brandschutz: Gebäudeklasse + REI-Nachweise aus Plan */
  fireProtection?: FireProtection;
  /** Dimensionierungsmodus: wirtschaftlich (η ≤ 0.95) oder sicher (nächstes Profil, η ≤ 0.85) */
  dimensioningMode?: 'wirtschaftlich' | 'sicher';
  /** Sparrenabstand in m, DIREKT aus dem Plan gelesen (z.B. "e = 80 cm") — hat Vorrang vor dem Default 0,8 */
  sparrenSpacing?: number;
  /** Im Plan beschriftete Holzquerschnitte (z.B. "Sparren 8/16") — Start-Querschnitte für die Bemessung */
  planMemberSections?: { member: 'sparren' | 'pfette' | 'stuetze' | 'kehlbalken'; b: number; h: number; raw: string }[];
  /** Dachüberstand in m (aus Plan gelesen oder Default 0,4) — geht in Dachfläche + Sparrenlänge ein */
  roofOverhang?: number;
  /** Schriftfeld des Einreichplans — damit der Plan eindeutig identifiziert ist:
   *  wer der Bauherr ist, wer geplant hat, und wo gebaut wird. Die Bauadresse
   *  daraus entscheidet über Schneezone und Seehöhe. */
  planHeader?: PlanHeader;
  /** Ergebnis des letzten Auto-Laufs. Wird mitgespeichert, damit Annahmen,
   *  Angebotssumme und die Begründung des Varianten-Vergleichs einen Reload
   *  überleben — vorher lagen sie nur im Komponenten-State und waren nach dem
   *  Neuladen der Seite weg. */
  autoRun?: PersistedAutoRun;
}

/**
 * Angaben aus dem Schriftfeld (Plankopf) eines österreichischen Einreichplans.
 *
 * WICHTIG: Die Adresse des Planverfassers ist NICHT die Bauadresse. Im
 * Schriftfeld stehen beide oft untereinander — verwechselt man sie, rechnet die
 * Statik mit der falschen Schneezone.
 */
export interface PlanHeader {
  bauvorhaben?: string;
  bauherr?: { name?: string; adresse?: string };
  planverfasser?: { buero?: string; name?: string; adresse?: string };
  bauadresse?: {
    strasse?: string; hausnummer?: string; plz?: string; ort?: string;
    katastralgemeinde?: string; grundstueck?: string;
  };
  planNummer?: string;
  planDatum?: string;
  massstab?: string;
  /** Wörtliches Zitat aus dem Schriftfeld, damit man es am Plan nachschlagen kann */
  evidence?: string;
  confidence?: number;
}

/** Persistierter Auszug eines Pipeline-Laufs (bewusst strukturell definiert,
 *  damit types/project.ts nicht auf lib/auto/contracts angewiesen ist). */
export interface PersistedAutoRun {
  ranAt: string;
  summary?: string;
  assumptions: { field: string; value: unknown; reason: string; source: string }[];
  kosten?: {
    net: number;
    gross: number;
    positions: {
      category: string; description: string; quantity: number;
      unit: string; unitPrice: number; total: number; notes?: string;
    }[];
    surcharges: { name: string; percent: number; amount: number }[];
  };
  joints?: { type: string; position: number; notes: string; extraCost: number }[];
  /** Ergebnis der Gegenprüfung gegen den Einreichplan (siehe lib/auto/selfCheck). */
  gegenpruefung?: {
    bestanden: boolean;
    befunde: {
      id: string; schwere: 'blocker' | 'warnung'; titel: string;
      erwartet: string; gefunden: string; bedeutung: string;
    }[];
  };
}

// ===== Documents =====
export interface UploadedDocument {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: string;
  status: 'uploaded' | 'processing' | 'analyzed' | 'error';
  pages: number;
  extractedData?: DocumentExtraction;
}

export interface DocumentExtraction {
  texts: ExtractedText[];
  dimensions: ExtractedDimension[];
  symbols: ExtractedSymbol[];
  confidence: number;
}

export interface ExtractedText {
  content: string;
  position: { x: number; y: number; width: number; height: number };
  confidence: number;
  category: 'address' | 'dimension' | 'label' | 'note' | 'title' | 'other';
}

export interface ExtractedDimension {
  value: number;
  unit: string;
  label?: string;
  confidence: number;
}

export interface ExtractedSymbol {
  type: string;
  position: { x: number; y: number };
  confidence: number;
}

// ===== Address =====
export interface ExtractedAddress {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  state: string;
  country: string;
  confidence: number;
  source: 'auto_extracted' | 'user_confirmed' | 'user_entered';
  alternatives: AddressCandidate[];
  coordinates?: { lat: number; lng: number };
  elevation?: number;
  terrainCategory?: string;
}

export interface AddressCandidate {
  fullAddress: string;
  confidence: number;
  context: string; // e.g. "found near title block", "found near Bauvorhaben label"
  excluded: boolean;
  excludeReason?: string;
}

// ===== Geometry =====
export interface BuildingGeometry {
  length: NumberWithConfidence;
  width: NumberWithConfidence;
  ridgeHeight: NumberWithConfidence;
  eavesHeight: NumberWithConfidence;
  roofPitch: NumberWithConfidence;
  spans: SpanDefinition[];
  axes: AxisDefinition[];
  isSymmetric: boolean;
  confidence: number;
  userConfirmed: boolean;
}

export interface NumberWithConfidence {
  value: number;
  unit: string;
  confidence: number;
  source: 'extracted' | 'calculated' | 'assumed' | 'user';
}

export interface SpanDefinition {
  id: string;
  label: string;
  length: number;
  direction: 'x' | 'y';
  confidence: number;
}

export interface AxisDefinition {
  id: string;
  label: string;
  position: number;
  direction: 'x' | 'y';
}

// ===== Roof & Structure =====
export type RoofFormType = 'satteldach' | 'pultdach' | 'walmdach' | 'krueppelwalmdach' | 'flachdach' | 'mischform';
export type StructuralSystemType = 'sparrendach' | 'kehlbalkendach' | 'pfettendach' | 'pfettendach_mittelpfette' | 'leimbinder_haupttraeger' | 'sonderfall';

export interface RoofType {
  form: RoofFormType;
  confidence: number;
  alternatives: { form: RoofFormType; confidence: number }[];
  userConfirmed: boolean;
}

export interface StructuralSystem {
  type: StructuralSystemType;
  confidence: number;
  reasoning: string;
  alternatives: { type: StructuralSystemType; reasoning: string; confidence: number }[];
  userConfirmed: boolean;
  /** Abstand der Pfettenstützen in m (Default 4.0). Kleinerer Abstand → kürzere
   *  Pfettenstützweite → schwächerer Pfettenquerschnitt möglich, dafür mehr Stützen. */
  supportSpacing?: number;
}

// ===== Loads =====
export interface LoadCase {
  id: string;
  name: string;
  type: 'permanent' | 'variable' | 'snow' | 'wind' | 'maintenance';
  value: number;
  unit: string;
  source: string;
  confidence: number;
  isEditable: boolean;
  userModified: boolean;
  parameters: Record<string, string | number>;
}

export interface AustrianLoadProfile {
  snowLoadZone: string;
  snowLoad: number;
  windZone: string;
  windPressure: number;
  terrainCategory: string;
  altitude: number;
  exposure: string;
}

// ===== Materials =====
export interface MaterialProfile {
  id: string;
  name: string;
  type: 'kvh' | 'schnittholz' | 'brettschichtholz' | 'other';
  strengthClass: string;
  density: number;
  bendingStrength: number;
  tensionStrength: number;
  compressionStrength: number;
  shearStrength: number;
  elasticModulus: number;
}

// ===== Timber Members =====
export interface TimberMember {
  id: string;
  name: string;
  type: 'sparren' | 'pfette' | 'zange' | 'kehlbalken' | 'leimbinder' | 'stuetze' | 'rahm' | 'auswechslung' | 'nebentraeger';
  material: string;
  width: number;
  height: number;
  length: number;
  quantity: number;
  crossSection: string;
  calculationStatus: StatusLevel;
}

// ===== Calculations =====
export interface CalculationResult {
  id: string;
  memberId: string;
  memberName: string;
  checks: StructuralCheck[];
  overallStatus: StatusLevel;
  missingInputs: string[];
  timestamp: string;
}

export interface StructuralCheck {
  name: string;
  type: 'geometry' | 'load_path' | 'internal_forces' | 'stress' | 'deflection' | 'stability' | 'support_reactions';
  result: number; // utilization ratio
  limit: number;
  unit: string;
  status: StatusLevel;
  formula?: string;
  details?: string;
}

// ===== Validation & Audit =====
export interface ValidationIssue {
  id: string;
  severity: StatusLevel;
  category: string;
  message: string;
  affectedField: string;
  suggestion?: string;
  resolved: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  agent: string;
  action: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  reason: string;
  userInitiated: boolean;
}

export interface UserCorrection {
  id: string;
  field: string;
  originalValue: string;
  correctedValue: string;
  reason: string;
  timestamp: string;
}

// ===== Workflow Steps =====
export const WORKFLOW_STEPS = [
  { id: 1, key: 'plan', label: 'Plan', icon: 'FileText' },
  { id: 2, key: 'extraction', label: 'Extraktion', icon: 'Scan' },
  { id: 3, key: 'address', label: 'Adresse', icon: 'MapPin' },
  { id: 4, key: 'geometry', label: 'Geometrie', icon: 'Ruler' },
  { id: 5, key: 'structure', label: 'Tragwerk', icon: 'Building' },
  { id: 6, key: 'loads', label: 'Lasten', icon: 'Weight' },
  { id: 7, key: 'materials', label: 'Materialien', icon: 'Trees' },
  { id: 8, key: 'calculation', label: 'Berechnung', icon: 'Calculator' },
  { id: 9, key: 'review', label: 'Prüfung', icon: 'CheckCircle' },
  { id: 10, key: 'report', label: 'Bericht', icon: 'FileOutput' },
] as const;

export type WorkflowStepKey = typeof WORKFLOW_STEPS[number]['key'];

// ===== Roof form labels =====
export const ROOF_FORM_LABELS: Record<RoofFormType, string> = {
  satteldach: 'Satteldach',
  pultdach: 'Pultdach',
  walmdach: 'Walmdach',
  krueppelwalmdach: 'Krüppelwalmdach',
  flachdach: 'Flachdach',
  mischform: 'Mischform',
};

export const STRUCTURAL_SYSTEM_LABELS: Record<StructuralSystemType, string> = {
  sparrendach: 'Sparrendach',
  kehlbalkendach: 'Kehlbalkendach',
  pfettendach: 'Pfettendach',
  pfettendach_mittelpfette: 'Pfettendach mit Mittelpfetten',
  leimbinder_haupttraeger: 'Leimbinder-Hauptträger',
  sonderfall: 'Sonderfall',
};
