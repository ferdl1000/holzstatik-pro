import { describe, it, expect } from 'vitest';
import { PLZ_DATABASE } from '../plzDatabase';
import { characteristicGroundSnow } from '@/lib/calc/loads/snow';

/**
 * Der Auftraggeber baut in der Oststeiermark. Zone und Seehöhe entscheiden
 * unmittelbar über die Schneelast und damit über jeden Querschnitt — deshalb
 * werden die Orte seines Einzugsgebiets hier festgenagelt.
 *
 * Referenz: ÖNORM B 1991-1-3, s_k = (0,642·z + 0,009) · (1 + (A/728)²)
 */
const ORTE: { plz: string; ort: string; zone: string; hoeheVon: number; hoeheBis: number }[] = [
  { plz: '8230', ort: 'Hartberg',                 zone: '3', hoeheVon: 330, hoeheBis: 400 },
  { plz: '8224', ort: 'Kaindorf bei Hartberg',    zone: '3', hoeheVon: 280, hoeheBis: 360 },
  { plz: '8225', ort: 'Pöllau',                   zone: '3', hoeheVon: 380, hoeheBis: 460 },
  { plz: '8240', ort: 'Friedberg',                zone: '3', hoeheVon: 600, hoeheBis: 700 },
  { plz: '8250', ort: 'Vorau',                    zone: '3', hoeheVon: 680, hoeheBis: 760 },
  { plz: '8255', ort: 'St. Jakob im Walde',       zone: '4', hoeheVon: 1000, hoeheBis: 1120 },
  { plz: '8273', ort: 'Ebersdorf bei Hartberg',   zone: '3', hoeheVon: 270, hoeheBis: 340 },
  { plz: '8280', ort: 'Fürstenfeld',              zone: '3', hoeheVon: 240, hoeheBis: 310 },
  { plz: '8160', ort: 'Weiz',                     zone: '3', hoeheVon: 430, hoeheBis: 500 },
  { plz: '8200', ort: 'Gleisdorf',                zone: '3', hoeheVon: 330, hoeheBis: 400 },
];

describe('Oststeiermark: Schneezone und Seehöhe je PLZ', () => {
  it.each(ORTE)('$plz $ort → Zone $zone', ({ plz, ort, zone, hoeheVon, hoeheBis }) => {
    const e = PLZ_DATABASE.find(x => x.plz === plz);
    expect(e, `PLZ ${plz} (${ort}) fehlt in der Datenbank`).toBeDefined();
    expect(e!.snowZone, `${ort}: falsche Schneezone`).toBe(zone);
    expect(e!.state).toBe('Steiermark');
    expect(e!.elevation, `${ort}: Seehöhe ${e!.elevation} m außerhalb ${hoeheVon}–${hoeheBis} m`)
      .toBeGreaterThanOrEqual(hoeheVon);
    expect(e!.elevation).toBeLessThanOrEqual(hoeheBis);
  });

  it('Hartberg liefert die normrichtige Bodenschneelast 2,43 kN/m²', () => {
    const e = PLZ_DATABASE.find(x => x.plz === '8230')!;
    // (0,642·3 + 0,009) · (1 + (367/728)²) = 1,935 · 1,2541 = 2,427
    expect(characteristicGroundSnow(e.snowZone, e.elevation)).toBeCloseTo(2.43, 2);
  });

  it('liegt deutlich über dem Wien-Ersatzstandort — deshalb ist die Adresse Pflicht', () => {
    const hartberg = characteristicGroundSnow('3', 367);
    const wienErsatz = characteristicGroundSnow('2', 171);
    expect(hartberg / wienErsatz).toBeGreaterThan(1.6);
  });

  it('höher gelegene Orte bekommen mehr Schnee als tiefer gelegene derselben Zone', () => {
    const vorau = PLZ_DATABASE.find(x => x.plz === '8250')!;
    const fuerstenfeld = PLZ_DATABASE.find(x => x.plz === '8280')!;
    expect(characteristicGroundSnow(vorau.snowZone, vorau.elevation))
      .toBeGreaterThan(characteristicGroundSnow(fuerstenfeld.snowZone, fuerstenfeld.elevation));
  });

  it('keine steirische PLZ hat eine unplausible Seehöhe', () => {
    for (const e of PLZ_DATABASE.filter(x => x.state === 'Steiermark')) {
      expect(e.elevation, `${e.plz} ${e.city}`).toBeGreaterThan(150);
      expect(e.elevation, `${e.plz} ${e.city}`).toBeLessThan(2000);
    }
  });
});
