import { describe, it, expect } from 'vitest';
import {
  normalizePlanerKey,
  derivePlanerKey,
  derivePlanerKeyFromText,
  buildRulesPromptBlock,
  applyLearnedRules,
  type LearnedRule,
} from '../../../../supabase/functions/_shared/learning';

describe('normalizePlanerKey', () => {
  it('slugifies a büro name and strips generic suffixes', () => {
    expect(normalizePlanerKey('ZT Mustermann Planungs GmbH, 8230 Hartberg')).toBe('zt-mustermann');
    expect(normalizePlanerKey('ZT Mustermann GmbH')).toBe('zt-mustermann');
  });
  it('handles umlauts', () => {
    expect(normalizePlanerKey('Architekt Müller')).toBe('architekt-mueller');
  });
  it('returns null for empty/too short', () => {
    expect(normalizePlanerKey('')).toBeNull();
    expect(normalizePlanerKey(null)).toBeNull();
  });
});

describe('derivePlanerKey', () => {
  it('derives a stable key from a Planverfasser street address (context schema)', () => {
    const addrs = [
      { context: 'Bauwerber', fullAddress: 'Nörning 25, 8273 Ebersdorf', isBuildingAddress: true },
      { context: 'Planverfasser', fullAddress: 'Bahnhofstraße 14c, 8350 Fehring', isBuildingAddress: false },
    ];
    const { key } = derivePlanerKey(addrs);
    expect(key).toBe('bahnhofstrasse-14c-8350-fehring');
  });
  it('prefers a büro name over the street when a name is present', () => {
    const addrs = [{ type: 'planer', raw: 'ZT Mustermann GmbH, Hauptstraße 1, 8010 Graz' }];
    expect(derivePlanerKey(addrs).key).toBe('zt-mustermann');
  });
  it('ignores building addresses', () => {
    const addrs = [{ context: 'Bauwerber', fullAddress: 'Nörning 25, 8273 Ebersdorf', isBuildingAddress: true }];
    expect(derivePlanerKey(addrs).key).toBeNull();
  });
});

describe('derivePlanerKeyFromText (deterministic fallback)', () => {
  it('extracts the planer address after a keyword', () => {
    const raw = 'EINREICHPLAN ... Bauherr: Lechner, Nörning 25, 8273 Ebersdorf.\nPlanverfasser: Bahnhofstraße 14c, 8350 Fehring';
    const { key } = derivePlanerKeyFromText(raw);
    expect(key).toContain('bahnhofstrasse-14c');
    expect(key).toContain('8350');
  });
  it('returns null when no planer block is present', () => {
    expect(derivePlanerKeyFromText('nur irgendein text ohne planer').key).toBeNull();
  });
});

describe('buildRulesPromptBlock', () => {
  it('is empty when there are no rules', () => {
    expect(buildRulesPromptBlock([])).toBe('');
  });
  it('lists rules with correct values', () => {
    const rules: LearnedRule[] = [{
      id: '1', field: 'coveringType', trigger_pattern: null, trigger_context: 'Planer X',
      wrong_value: 'ziegel', correct_value: 'trapezblech', reason: 'Stalldach', applied_count: 3,
    }];
    const block = buildRulesPromptBlock(rules);
    expect(block).toContain('GELERNTE KORREKTUREN');
    expect(block).toContain('trapezblech');
    expect(block).toContain('3× bestätigt');
  });
});

describe('applyLearnedRules', () => {
  const rule = (over: Partial<LearnedRule>): LearnedRule => ({
    id: '1', field: 'coveringType', trigger_pattern: null, trigger_context: null,
    wrong_value: null, correct_value: 'trapezblech', reason: null, applied_count: 1, ...over,
  });

  it('fills an empty field', () => {
    const ex: Record<string, any> = { coveringType: '' };
    const { applied } = applyLearnedRules(ex, [rule({})]);
    expect(ex.coveringType).toBe('trapezblech');
    expect(applied).toHaveLength(1);
  });
  it('overwrites an exact wrong_value match', () => {
    const ex: Record<string, any> = { coveringType: 'ziegel' };
    applyLearnedRules(ex, [rule({ wrong_value: 'ziegel' })]);
    expect(ex.coveringType).toBe('trapezblech');
  });
  it('does NOT clobber a correct existing value when confidence is high', () => {
    const ex: Record<string, any> = { coveringType: 'schiefer', overallConfidence: 0.95 };
    const { applied } = applyLearnedRules(ex, [rule({ wrong_value: 'ziegel' })]);
    expect(ex.coveringType).toBe('schiefer');
    expect(applied).toHaveLength(0);
  });
  it('applies a multiply-confirmed rule when confidence is low', () => {
    const ex: Record<string, any> = { coveringType: 'schiefer', overallConfidence: 0.5 };
    applyLearnedRules(ex, [rule({ applied_count: 3 })]);
    expect(ex.coveringType).toBe('trapezblech');
  });
  it('ignores fields not in the safe-list', () => {
    const ex: Record<string, any> = { randomField: 'x' };
    const { applied } = applyLearnedRules(ex, [rule({ field: 'randomField', correct_value: 'y' })]);
    expect(applied).toHaveLength(0);
  });
});
