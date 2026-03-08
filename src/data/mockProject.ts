import type { Project, MaterialProfile } from '@/types/project';

/**
 * Referenz-Materialbibliothek – keine Projektdaten, sondern normative Kennwerte.
 * Diese Werte stammen aus EN 338 / EN 14080 und dürfen als Bibliothek vorgehalten werden.
 */
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
 * Leeres Projekt – KEINE vorausgefüllten Projektdaten.
 * Lastfälle werden NICHT vorausgefüllt. Sie werden erst erzeugt, wenn
 * ein bestätigter Standort vorliegt und der Benutzer die Lastermittlung auslöst.
 * Materialien sind Referenzbibliothek, keine Projektdaten.
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
  loadCases: [],
  materials: DEFAULT_MATERIALS,
  members: [],
  calculations: [],
  validationIssues: [],
  auditEntries: [],
};
