/**
 * Verifiziert die Auto-Modell-Ableitung an den ECHTEN Lechner-Projektdaten
 * (aus der Live-DB exportiert): Pultdach 10°, Vordach, BSH-Haupttragwerk.
 * Beweist, dass nach dem Öffnen alle Reiter echte Bauteile/Lasten/Bemessung/Kosten haben.
 */
import { describe, it, expect } from 'vitest';
import { runAutoPipeline } from '@/lib/auto/autoPipeline';
import { EMPTY_PROJECT } from '@/data/mockProject';
import type { Project } from '@/types/project';

const LECHNER = {
  geometry: {
    axes: [], spans: [
      { id: 'Spannweite Hauptträger', label: 'Spannweite Hauptträger', length: 5, direction: 'x', confidence: 0.85 },
      { id: 'Spannweite Endfeld', label: 'Spannweite Endfeld', length: 6.795, direction: 'x', confidence: 0.85 },
    ],
    width: { unit: 'm', value: 7.8, source: 'extracted', confidence: 0.95 },
    length: { unit: 'm', value: 27.05, source: 'extracted', confidence: 0.95 },
    roofPitch: { unit: '°', value: 10, source: 'extracted', confidence: 0.95 },
    confidence: 0.95,
    eavesHeight: { unit: 'm', value: 4.655, source: 'extracted', confidence: 0.9 },
    isSymmetric: true,
    ridgeHeight: { unit: 'm', value: 6.265, source: 'extracted', confidence: 0.9 },
    userConfirmed: false,
  },
  roofParts: [
    { id: 'main', form: 'pultdach', kind: 'main', label: 'Hauptdach Stallgebäude', members: [],
      geometry: { pitch: 10, width: 7.8, length: 27.05, eavesHeight: 4.655, ridgeHeight: 6.265, ridgeDirection: 'x' },
      positionX: 0, positionY: 0, confidence: 0.95 },
    { id: 'vordach', form: 'pultdach', kind: 'vordach', label: 'Vordach Stall', members: [],
      geometry: { pitch: 12.2, width: 8.35, length: 28.65, eavesHeight: 2.855, ridgeHeight: 4.655, ridgeDirection: 'x' },
      positionX: 0, positionY: 0, confidence: 0.9 },
  ],
  roofType: { form: 'pultdach', confidence: 0.95, alternatives: [], userConfirmed: false },
  address: { city: 'Hartberg', state: 'Steiermark', postalCode: '8230', elevation: 367, terrainCategory: 'II' },
  ceilings: [{ id: 'ceil_0', area: 180.5, span: 5, level: 'EG', nutzung: 'Lager', confidence: 0.95, constructionType: 'holzbalkendecke' }],
  coveringType: { type: 'trapezblech', confidence: 0.95, weight_kN_m2: 0.2 },
  structuralSystem: { type: 'leimbinder_haupttraeger', confidence: 0.9, alternatives: [], userConfirmed: false },
} as any;

describe('Echte Lechner-Daten → vollständiges Statik-Modell', () => {
  it('erzeugt Bauteile, Lasten, Bemessung und Kosten', async () => {
    const project: Project = { ...EMPTY_PROJECT, id: 'lechner', name: 'Lechner', members: [], loadCases: [], ...LECHNER };
    const r = await runAutoPipeline({ project, sparrenSpacing: 0.8, useOptimizer: true });

    expect(r.calculations.optimizedMembers.length).toBeGreaterThan(0);
    expect(r.loads.loadCases.length).toBeGreaterThan(0);
    expect(r.calculations.members.length).toBeGreaterThan(0);
    // Schneezone Steiermark/Hartberg muss echte Schneelast liefern
    const snow = r.loads.loadCases.find((l) => l.type === 'snow');
    expect(snow).toBeTruthy();
    // alle Ausnutzungen endlich + plausibel
    for (const m of r.calculations.members) {
      expect(Number.isFinite(m.maxUtilization)).toBe(true);
      expect(m.maxUtilization).toBeGreaterThanOrEqual(0);
    }
    // Kosten realistisch (> 1000 € für ein Stallgebäude-Dach)
    expect(r.costs.withLabor.gross).toBeGreaterThan(1000);
  });
});
