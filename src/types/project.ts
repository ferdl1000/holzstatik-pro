import type { RoofPart } from './roofParts';

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
