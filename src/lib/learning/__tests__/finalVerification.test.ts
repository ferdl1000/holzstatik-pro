import { describe, it, expect } from 'vitest';
import {
  compareVerificationPasses, needsRefinedFallback, buildRefinedReanalysisPlan,
  decideFinalStatus, describeConsensus,
  type VerificationPassResult, type ComputedSummary,
} from '../../../../supabase/functions/_shared/finalVerification';

const computed: ComputedSummary = {
  roofAreaM2: 200, roofPartCount: 2, timberVolumeM3: 8, offerTotalEur: 24000,
};

function pass(overrides: Partial<VerificationPassResult>): VerificationPassResult {
  return {
    passId: 'A', strategy: 'test', model: 'test-model',
    roofAreaM2: 200, roofPartCount: 2, timberVolumeM3: 8, offerTotalEur: 24000,
    plausible: true, issues: [], confidence: 0.8,
    ...overrides,
  };
}

describe('compareVerificationPasses — Konsens innerhalb 5% Toleranz', () => {
  it('erreicht Konsens wenn alle 3 Pässe nahezu identisch sind', () => {
    const passes = [
      pass({ passId: 'A' }),
      pass({ passId: 'B', roofAreaM2: 202, timberVolumeM3: 8.1 }),
      pass({ passId: 'C', roofAreaM2: 198, offerTotalEur: 24300 }),
    ];
    const c = compareVerificationPasses(passes, computed);
    expect(c.consensusReached).toBe(true);
    expect(c.deviatingMetrics).toEqual([]);
    expect(c.recommendation).toBe('accept');
    expect(needsRefinedFallback(c)).toBe(false);
  });

  it('erreicht KEINEN Konsens bei >5% Abweichung bei einer Kennzahl', () => {
    const passes = [
      pass({ passId: 'A' }),
      pass({ passId: 'B', roofAreaM2: 250 }), // 25% Abweichung
      pass({ passId: 'C' }),
    ];
    const c = compareVerificationPasses(passes, computed);
    expect(c.consensusReached).toBe(false);
    expect(c.deviatingMetrics).toContain('roofAreaM2');
    expect(c.recommendation).toBe('refine');
    expect(needsRefinedFallback(c)).toBe(true);
  });

  it('erkennt Abweichung auch wenn nur zwei Pässe untereinander abweichen (nicht ggü. Pipeline)', () => {
    // Beide Pässe weichen von der Pipeline nur leicht ab, aber stark voneinander
    const passes = [
      pass({ passId: 'A', roofAreaM2: 205 }),
      pass({ passId: 'B', roofAreaM2: 230 }), // 205 vs 230 = ~11% -> über Toleranz
    ];
    const c = compareVerificationPasses(passes, computed);
    const areaMetric = c.metricComparisons.find(m => m.metric === 'roofAreaM2')!;
    expect(areaMetric.withinTolerance).toBe(false);
    expect(c.consensusReached).toBe(false);
  });

  it('genau an der 5%-Grenze gilt noch als Konsens (<=)', () => {
    const passes = [
      pass({ passId: 'A', roofAreaM2: 210 }), // exakt 5% über 200
    ];
    const c = compareVerificationPasses(passes, computed, 0.05);
    const areaMetric = c.metricComparisons.find(m => m.metric === 'roofAreaM2')!;
    expect(areaMetric.maxDeviationPercent).toBe(5);
    expect(areaMetric.withinTolerance).toBe(true);
  });

  it('Mehrheit "nicht plausibel" verhindert Konsens, selbst wenn Zahlen passen', () => {
    const passes = [
      pass({ passId: 'A', plausible: false, issues: ['Vordach im Plan sichtbar, aber nicht berechnet'] }),
      pass({ passId: 'B', plausible: false }),
      pass({ passId: 'C', plausible: true }),
    ];
    const c = compareVerificationPasses(passes, computed);
    expect(c.majorityPlausible).toBe(false);
    expect(c.consensusReached).toBe(false);
    expect(c.criticalIssues).toContain('Vordach im Plan sichtbar, aber nicht berechnet');
  });

  it('abstain-Stimmen (plausible=null) zählen nicht gegen den Konsens', () => {
    const passes = [
      pass({ passId: 'A', plausible: true }),
      pass({ passId: 'B', plausible: null, issues: [] }),
    ];
    const c = compareVerificationPasses(passes, computed);
    expect(c.abstainVotes).toBe(1);
    expect(c.majorityPlausible).toBe(true);
    expect(c.consensusReached).toBe(true);
  });

  it('wenn KEIN Pass eine Kennzahl liefert, wird kein Schein-Konsens vorgetäuscht', () => {
    const passes = [
      pass({ passId: 'A', roofAreaM2: null, roofPartCount: null, timberVolumeM3: null, offerTotalEur: null, plausible: null, issues: ['Analyse fehlgeschlagen'] }),
    ];
    const c = compareVerificationPasses(passes, computed);
    expect(c.metricComparisons).toEqual([]);
    expect(c.consensusReached).toBe(false);
    expect(needsRefinedFallback(c)).toBe(true);
  });
});

describe('buildRefinedReanalysisPlan — 3-stufiges Fallback-Verfahren', () => {
  it('liefert genau 3 Stufen mit aufsteigender Nummerierung', () => {
    const plan = buildRefinedReanalysisPlan({ deviatingMetrics: ['roofAreaM2'], criticalIssues: ['Carport übersehen'] });
    expect(plan).toHaveLength(3);
    expect(plan.map(s => s.stage)).toEqual([1, 2, 3]);
    expect(plan[0].instructionForAi).toContain('roofAreaM2');
    expect(plan[0].instructionForAi).toContain('Carport übersehen');
  });

  it('funktioniert auch ohne konkrete Gründe (Default-Text)', () => {
    const plan = buildRefinedReanalysisPlan({ deviatingMetrics: [], criticalIssues: [] });
    expect(plan[0].instructionForAi).toContain('keine spezifischen Kennzahlen');
  });
});

describe('decideFinalStatus', () => {
  it('gibt consensus zurück wenn Erstprüfung schon konvergiert', () => {
    const initial = compareVerificationPasses([pass({ passId: 'A' }), pass({ passId: 'B' })], computed);
    expect(decideFinalStatus(initial)).toBe('consensus');
  });

  it('gibt refined_accepted zurück wenn Fallback konvergiert', () => {
    const initial = compareVerificationPasses([pass({ passId: 'A', roofAreaM2: 400 })], computed);
    const refined = compareVerificationPasses([pass({ passId: 'A2' }), pass({ passId: 'B2' })], computed);
    expect(decideFinalStatus(initial, refined)).toBe('refined_accepted');
  });

  it('gibt refined_failed zurück wenn auch das Fallback nicht konvergiert (ehrlich, kein Schein-Ergebnis)', () => {
    const initial = compareVerificationPasses([pass({ passId: 'A', roofAreaM2: 400 })], computed);
    const refined = compareVerificationPasses([pass({ passId: 'A2', roofAreaM2: 500 })], computed);
    expect(decideFinalStatus(initial, refined)).toBe('refined_failed');
  });

  it('gibt refined_failed zurück wenn kein refined-Ergebnis übergeben wurde', () => {
    const initial = compareVerificationPasses([pass({ passId: 'A', roofAreaM2: 400 })], computed);
    expect(decideFinalStatus(initial, undefined)).toBe('refined_failed');
  });
});

describe('describeConsensus', () => {
  it('beschreibt Konsens-Fall lesbar', () => {
    const c = compareVerificationPasses([pass({ passId: 'A' }), pass({ passId: 'B' })], computed);
    expect(describeConsensus(c)).toContain('Konsens erreicht');
  });

  it('beschreibt Abweichungs-Fall mit konkreter Kennzahl', () => {
    const c = compareVerificationPasses([pass({ passId: 'A', roofAreaM2: 300 })], computed);
    expect(describeConsensus(c)).toContain('roofAreaM2');
  });
});
