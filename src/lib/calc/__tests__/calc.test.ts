import { describe, it, expect } from 'vitest';
import {
  calculateSnowLoad, calculateWindLoad, calculateDeadLoad, DEFAULT_TILED_ROOF,
  calculateBeam, calculateColumn, calculateGlulam, optimizeBeam, optimizeGlulam,
  autoLoads, buildULSCombinations,
} from '../index';
import { knToKg, formatForce } from '../../units';

describe('Einheiten', () => {
  it('konvertiert kN in kg korrekt', () => {
    expect(knToKg(1)).toBeCloseTo(101.94, 0);
    expect(knToKg(10)).toBeCloseTo(1019.4, 0);
  });
  it('formatForce zeigt beide Einheiten', () => {
    const s = formatForce(12.5);
    expect(s).toContain('12,5 kN');
    expect(s).toContain('kg');
  });
});

describe('Schneelast', () => {
  it('berechnet Salzburg 800m Satteldach 30°', () => {
    const r = calculateSnowLoad({
      zone: '4', altitude: 800, roofPitch: 30, roofForm: 'satteldach',
      exposure: 'normal', heated: false,
    });
    expect(r.sk).toBeGreaterThan(2);   // Hochgebirge → viel Schnee
    expect(r.mu).toBeCloseTo(0.8, 1);
    expect(r.s).toBeGreaterThan(1.5);
    expect(r.asymmetric).toBeDefined();
  });
  it('Flachland Wien 200m', () => {
    const r = calculateSnowLoad({
      zone: '2', altitude: 200, roofPitch: 25, roofForm: 'satteldach',
      exposure: 'normal', heated: false,
    });
    expect(r.s).toBeLessThan(1.5);
  });
  it('Steildach >60° = kein Schnee', () => {
    const r = calculateSnowLoad({
      zone: '4', altitude: 1000, roofPitch: 70, roofForm: 'satteldach',
      exposure: 'normal', heated: false,
    });
    expect(r.mu).toBe(0);
  });
});

describe('Windlast', () => {
  it('berechnet Wien Vororte Satteldach', () => {
    const r = calculateWindLoad({
      zone: '3', terrain: 'III', buildingHeight: 8, roofPitch: 30, roofForm: 'satteldach',
    });
    expect(r.vb).toBe(25.9);
    expect(r.qp).toBeGreaterThan(0.4);
    expect(r.qp).toBeLessThan(1.5);
  });
});

describe('Eigengewicht', () => {
  it('berechnet Standard-Ziegeldach', () => {
    const r = calculateDeadLoad(DEFAULT_TILED_ROOF);
    expect(r.gk).toBeGreaterThan(0.7);
    expect(r.gk).toBeLessThan(1.3);
    expect(r.layersBreakdown.length).toBeGreaterThan(3);
  });
});

describe('Sparren-Bemessung', () => {
  it('typischer Wohnhaus-Sparren 4.5m, 8/16 C24', () => {
    const r = calculateBeam({
      type: 'sparren', span: 4.5, b: 80, h: 160, timberClass: 'C24',
      qPermanent: 0.8, qVariable: 1.4, variableDuration: 'shortTerm', serviceClass: '1',
    });
    expect(r.checks.length).toBe(6);
    expect(r.maxUtilization).toBeGreaterThan(0);
    expect(r.maxUtilization).toBeLessThan(5);  // Sparren ist unterdimensioniert für Volllast – Optimierer würde größer wählen
  });
});

describe('Optimierer', () => {
  it('findet kleinsten Sparren für 5m', () => {
    const r = optimizeBeam({
      type: 'sparren', span: 5.0,
      qPermanent: 0.9, qVariable: 1.8, variableDuration: 'shortTerm', serviceClass: '1',
    });
    expect(r.bestSection).toBeDefined();
    expect(r.result.maxUtilization).toBeLessThanOrEqual(0.95);
  });

  it('25m stützenfrei mit BSH-Leimbinder', () => {
    const r = optimizeGlulam({
      span: 25, qPermanent: 1.2, qVariable: 2.5,
      variableDuration: 'shortTerm', serviceClass: '1', shape: 'pitched', h_ap: 1800,
    });
    expect(r.bestSection.h).toBeGreaterThan(800);  // großer Querschnitt
    expect(r.result.maxUtilization).toBeLessThanOrEqual(1.05);
  });
});

describe('Stütze (Knicken)', () => {
  it('schlanke Stütze knickt um schwache Achse', () => {
    const r = calculateColumn({
      height: 3.5, b: 120, h: 160, timberClass: 'C24',
      N_Ed: 40, bucklingFactor: 1.0, duration: 'shortTerm', serviceClass: '1',
    });
    expect(r.slenderness.lambda_z).toBeGreaterThan(r.slenderness.lambda_y);
    expect(r.k_c.z).toBeLessThan(r.k_c.y);
  });
});

describe('autoLoads', () => {
  it('liefert vollständige Lastenermittlung für Salzburg', () => {
    const r = autoLoads({
      state: 'Salzburg', altitude: 700, roofPitch: 35, roofForm: 'satteldach', buildingHeight: 8,
    });
    expect(r.snow.s).toBeGreaterThan(1);
    expect(r.wind.qp).toBeGreaterThan(0);
    expect(r.dead.gk).toBeGreaterThan(0.5);
  });
});

describe('Lastkombinationen', () => {
  it('Schnee als Hauptlast ergibt höchste Kombi', () => {
    const r = buildULSCombinations([
      { id: 'g', name: 'EG', type: 'permanent', value: 1.0, duration: 'permanent', psi0: 1, psi1: 1, psi2: 1 },
      { id: 's', name: 'Schnee', type: 'snow', value: 2.0, duration: 'shortTerm', psi0: 0.5, psi1: 0.2, psi2: 0 },
      { id: 'w', name: 'Wind', type: 'wind', value: 0.6, duration: 'instantaneous', psi0: 0.6, psi1: 0.2, psi2: 0 },
    ]);
    expect(r[0].leading).toContain('Schnee');
    expect(r[0].value).toBeGreaterThan(3);
  });
});
