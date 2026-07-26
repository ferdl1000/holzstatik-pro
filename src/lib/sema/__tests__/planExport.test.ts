import { describe, it, expect } from 'vitest';
import { exportPlanZeichnungen } from '../plan-export';
import type { BuildingGeometry, TimberMember } from '@/types/project';

function nwc(value: number, unit: string) {
  return { value, unit, confidence: 0.9, source: 'extracted' as const };
}

const geometry: BuildingGeometry = {
  length: nwc(12, 'm'), width: nwc(9, 'm'),
  ridgeHeight: nwc(7.098, 'm'), eavesHeight: nwc(4.5, 'm'),
  roofPitch: nwc(30, '°'),
  spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
};

const members: TimberMember[] = [
  { id: 'S', name: 'Sparren S1-S32', type: 'sparren', width: 80, height: 160, length: 5.66, quantity: 32, material: 'C24', crossSection: '8/16' },
  { id: 'MB', name: 'Fußpfette (Mauerbank) 1-2', type: 'pfette', width: 140, height: 100, length: 12, quantity: 2, material: 'C24', crossSection: '14/10' },
  { id: 'K', name: 'Kehlbalken K1-K8', type: 'kehlbalken', width: 80, height: 160, length: 3, quantity: 8, material: 'C24', crossSection: '8/16' },
] as TimberMember[];

describe('Zeichnungs-Export für SEMA und Baustelle', () => {
  const zeichnungen = exportPlanZeichnungen({
    geometry, roofForm: 'satteldach', members, roofOverhang: 0.4,
  });

  it('liefert Querschnitt, Längsschnitt und Traufdetail', () => {
    const namen = zeichnungen.map(z => z.name);
    expect(namen).toContain('schnitt_quer.svg');
    expect(namen).toContain('schnitt_laengs.svg');
    expect(namen).toContain('detail_traufe.svg');
  });

  it('liefert je einen Abbundplan pro Bauteiltyp', () => {
    const abbund = zeichnungen.filter(z => z.name.startsWith('abbund_'));
    // sparren, pfette, kehlbalken → 3 Typen
    expect(abbund.length).toBe(3);
  });

  it('erzeugt eigenständige, gültige SVG-Dokumente', () => {
    for (const z of zeichnungen) {
      expect(z.svg.startsWith('<?xml'), z.name).toBe(true);
      expect(z.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(z.svg).toContain('</svg>');
      expect(z.svg.length).toBeGreaterThan(500);
    }
  });

  it('zeichnet bauseitige Teile grau und Holz beige', () => {
    const quer = zeichnungen.find(z => z.name === 'schnitt_quer.svg')!;
    // Mauerwerk nutzt die bauseits-Schraffur …
    expect(quer.svg).toContain('bauseits');
    // … und die Legende erklärt den Unterschied
    expect(quer.svg).toContain('bauseits (Mauerwerk/Beton)');
    expect(quer.svg).toContain('Holz (Zimmerei)');
  });

  it('zeichnet keine Steher, wenn keine in der Bauteilliste stehen', () => {
    const laengs = zeichnungen.find(z => z.name === 'schnitt_laengs.svg')!;
    expect(members.some(m => m.type === 'stuetze')).toBe(false);
    expect(laengs.svg).not.toMatch(/Steher\b/);
  });

  it('bricht nicht ab, wenn die Bauteilliste leer ist', () => {
    const leer = exportPlanZeichnungen({ geometry, roofForm: 'satteldach', members: [] });
    expect(Array.isArray(leer)).toBe(true);
  });
});
