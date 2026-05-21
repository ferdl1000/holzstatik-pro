import { describe, it, expect } from 'vitest';
import { lookupPlz, lookupPlzNearest, lookupByCity, PLZ_DATABASE } from '../plzDatabase';
import { lookupZones } from '../zones';

describe('PLZ-Datenbank', () => {
  it('hat genug Einträge (>50)', () => {
    expect(PLZ_DATABASE.length).toBeGreaterThan(50);
  });

  it('findet Wien 1010', () => {
    const e = lookupPlz('1010');
    expect(e).not.toBeNull();
    expect(e?.state).toBe('Wien');
    expect(e?.snowZone).toBe('2');
    expect(e?.windZone).toBe('3');
  });

  it('findet Salzburg 5020 mit Schneezone 4', () => {
    const e = lookupPlz('5020');
    expect(e?.state).toBe('Salzburg');
    expect(e?.snowZone).toBe('4');
    expect(e?.elevation).toBeGreaterThan(400);
  });

  it('findet Bad Gastein 5640 mit Höhe > 1000m', () => {
    const e = lookupPlz('5640');
    expect(e?.elevation).toBeGreaterThan(1000);
    expect(e?.snowZone).toBe('4');
  });

  it('Nearest-Lookup findet ähnliche PLZ', () => {
    const e = lookupPlzNearest('5025');  // nicht in DB, nahe 5020
    expect(e).not.toBeNull();
    expect(e?.state).toBe('Salzburg');
  });

  it('Stadt-Lookup case-insensitive', () => {
    const e = lookupByCity('GRAZ');
    expect(e?.state).toBe('Steiermark');
  });

  it('Burgenland hat Windzone 4', () => {
    const e = lookupPlz('7000');
    expect(e?.windZone).toBe('4');
  });

  it('Alpine PLZ haben Schneezone 4 + niedrige Windzone', () => {
    const innsbruck = lookupPlz('6020');
    expect(innsbruck?.snowZone).toBe('4');
    expect(innsbruck?.windZone).toBe('1');
  });

  it('Alle PLZ haben gültige Zonen', () => {
    for (const e of PLZ_DATABASE) {
      expect(['1','2','3','4']).toContain(e.snowZone);
      expect(['1','2','3','4']).toContain(e.windZone);
      expect(['0','I','II','III','IV']).toContain(e.terrain);
      expect(e.lat).toBeGreaterThan(46);
      expect(e.lat).toBeLessThan(50);
      expect(e.lng).toBeGreaterThan(9);
      expect(e.lng).toBeLessThan(17);
    }
  });
});

describe('Zonen-Lookup', () => {
  it('Höhenkorrektur bei >1000m', () => {
    const z = lookupZones('1010', 1200);
    expect(['3', '4']).toContain(z.snowZone);
  });

  it('Default-Werte ohne PLZ', () => {
    const z = lookupZones(undefined);
    expect(z.state).toBe('Niederösterreich');
  });
});
