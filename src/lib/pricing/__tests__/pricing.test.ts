import { describe, it, expect } from 'vitest';
import { estimateCost, exportEstimateAsCSV, DEFAULT_PRICES, DEFAULT_FACTORS } from '../index';
import type { TimberMember } from '@/types/project';

const sampleMembers: TimberMember[] = [
  { id: '1', name: 'Sparren', type: 'sparren', material: 'C24', width: 80, height: 160, length: 5, quantity: 24, crossSection: '8/16', calculationStatus: 'green' },
  { id: '2', name: 'Mittelpfette', type: 'pfette', material: 'GL24h', width: 120, height: 240, length: 10, quantity: 2, crossSection: '12/24', calculationStatus: 'green' },
];

describe('Kostenschätzer', () => {
  it('berechnet Holzvolumen + Eindeckung + Lohn', () => {
    const r = estimateCost({
      members: sampleMembers, roofArea: 120, groundArea: 100,
      coveringId: 'tile_clay', insulationId: 'ins_mw_200',
      membraneIds: ['mem_under', 'mem_vapor'],
      factors: DEFAULT_FACTORS,
    });
    expect(r.positions.length).toBeGreaterThan(5);
    expect(r.subtotals.material).toBeGreaterThan(0);
    expect(r.subtotals.covering).toBeGreaterThan(0);
    expect(r.subtotals.labor).toBeGreaterThan(0);
    expect(r.gross).toBeGreaterThan(r.net);
  });

  it('Holzvolumen-Berechnung korrekt', () => {
    // Sparren: 0.08*0.16*5*24 = 1.536 m³, mit 10% Verschnitt = 1.69 m³
    const r = estimateCost({
      members: sampleMembers, roofArea: 0, groundArea: 0,
      factors: DEFAULT_FACTORS,
    });
    const woodPos = r.positions.find(p => p.id === 'wood_kvh_c24_nsi');
    expect(woodPos).toBeDefined();
    expect(woodPos!.quantity).toBeGreaterThan(1.5);
    expect(woodPos!.quantity).toBeLessThan(2);
  });

  it('Override-Preis wird angewendet', () => {
    const r = estimateCost({
      members: sampleMembers, roofArea: 120, groundArea: 100,
      coveringId: 'tile_clay',
      overrides: [{ priceItemId: 'tile_clay', price: 50, reason: 'Sonderpreis' }],
    });
    const cov = r.positions.find(p => p.id === 'covering');
    expect(cov?.unitPrice).toBe(50);
    expect(cov?.source).toBe('override');
  });

  it('BSH bekommt Auflagerschuh-Position', () => {
    const r = estimateCost({
      members: sampleMembers, roofArea: 0, groundArea: 0,
      hasGlulam: true, factors: DEFAULT_FACTORS,
    });
    expect(r.positions.some(p => p.id === 'fasteners_bracket')).toBe(true);
    expect(r.positions.some(p => p.id === 'crane')).toBe(true);
  });

  it('Aufschläge werden korrekt addiert', () => {
    const r = estimateCost({
      members: sampleMembers, roofArea: 100, groundArea: 100,
      coveringId: 'tile_clay',
      factors: { wasteTimber: 10, laborMarkup: 40, overhead: 20, profit: 8, vat: 20 },
    });
    expect(r.appliedSurcharges.length).toBe(3);
    expect(r.vat).toBeCloseTo(r.net * 0.20, 1);
  });

  it('CSV-Export hat Header + Daten', () => {
    const r = estimateCost({ members: sampleMembers, roofArea: 100, groundArea: 100, coveringId: 'tile_clay' });
    const csv = exportEstimateAsCSV(r);
    expect(csv).toContain('Kategorie;Beschreibung');
    expect(csv).toContain('GESAMT brutto');
  });
});

describe('Preis-DB-Konsistenz', () => {
  it('alle Preise > 0', () => {
    for (const p of DEFAULT_PRICES) {
      expect(p.price).toBeGreaterThan(0);
    }
  });
  it('alle IDs eindeutig', () => {
    const ids = DEFAULT_PRICES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
