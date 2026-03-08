import type { Project, MaterialProfile } from '@/types/project';

export const DEFAULT_MATERIALS: MaterialProfile[] = [
  {
    id: 'mat-1',
    name: 'KVH C24',
    type: 'kvh',
    strengthClass: 'C24',
    density: 420,
    bendingStrength: 24,
    tensionStrength: 14,
    compressionStrength: 21,
    shearStrength: 4.0,
    elasticModulus: 11000,
  },
  {
    id: 'mat-2',
    name: 'BSH GL24h',
    type: 'brettschichtholz',
    strengthClass: 'GL24h',
    density: 420,
    bendingStrength: 24,
    tensionStrength: 16.5,
    compressionStrength: 24,
    shearStrength: 3.5,
    elasticModulus: 11600,
  },
  {
    id: 'mat-3',
    name: 'Schnittholz S10',
    type: 'schnittholz',
    strengthClass: 'S10',
    density: 380,
    bendingStrength: 20,
    tensionStrength: 12,
    compressionStrength: 18,
    shearStrength: 3.5,
    elasticModulus: 9500,
  },
];

/**
 * Empty project template – no fake data.
 * Mock/demo data was removed to avoid presenting invented values as real.
 */
export const EMPTY_PROJECT: Project = {
  id: '',
  name: '',
  description: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'yellow',
  currentStep: 1,
  documents: [],
  loadCases: [
    { id: 'lc-1', name: 'Eigengewicht Dachaufbau', type: 'permanent', value: 0.85, unit: 'kN/m²', source: 'Annahme: Ziegeldeckung + Lattung + Konterlattung + Folie', confidence: 0.70, isEditable: true, userModified: false, parameters: {} },
    { id: 'lc-2', name: 'Schneelast', type: 'snow', value: 0, unit: 'kN/m²', source: 'Noch nicht berechnet – Standort erforderlich', confidence: 0, isEditable: true, userModified: false, parameters: { zone: '2' } },
    { id: 'lc-3', name: 'Windlast (Druck)', type: 'wind', value: 0, unit: 'kN/m²', source: 'Noch nicht berechnet – Standort erforderlich', confidence: 0, isEditable: true, userModified: false, parameters: { zone: '2', terrainCategory: 'III' } },
    { id: 'lc-4', name: 'Nutzlast (nicht begehbar)', type: 'variable', value: 0.50, unit: 'kN/m²', source: 'ÖNORM B 1991-1-1, Kat. H', confidence: 0.95, isEditable: true, userModified: false, parameters: {} },
  ],
  materials: DEFAULT_MATERIALS,
  members: [],
  calculations: [],
  validationIssues: [],
  auditEntries: [],
};

/** @deprecated Use EMPTY_PROJECT for new projects. Kept for backward compat. */
export const MOCK_PROJECT = EMPTY_PROJECT;
