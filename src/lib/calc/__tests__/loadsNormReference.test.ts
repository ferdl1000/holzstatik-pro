import { describe, it, expect } from 'vitest';
import { characteristicGroundSnow, calculateSnowLoad as snowAuto } from '../loads/snow';
import { calculateWindLoad as windAuto, VB_BY_ZONE } from '../loads/wind';
import { calculateSnowLoad as snowTab, calculateWindPressure as windTab } from '../../calculations';

/**
 * Referenzwerte gegen die OFFIZIELLE ÖNORM-B-1991-1-3-Formel (Anhang B):
 *   s_k = (0,642·z + 0,009) · (1 + (A/728)²)
 * Vorher existierten im Programm ZWEI abweichende Implementierungen, die für
 * denselben Ort unterschiedliche Statik lieferten — dieser Test verhindert,
 * dass das je wieder passiert.
 */
describe('Schneelast — Normformel-Referenzwerte (ÖNORM B 1991-1-3 Anhang B)', () => {
  it('Wien, Zone 2, 170 m → s_k = 1,36 kN/m²', () => {
    expect(characteristicGroundSnow('2', 170)).toBeCloseTo(1.36, 2);
  });
  it('Hartberg, Zone 3, 367 m → s_k = 2,43 kN/m²', () => {
    // (0.642·3+0.009)·(1+(367/728)²) = 1.935·1.2541 = 2.4267
    expect(characteristicGroundSnow('3', 367)).toBeCloseTo(2.43, 2);
  });
  it('Zone 1 im Tal greift der Mindestwert nicht (0,651 > 0,4)', () => {
    expect(characteristicGroundSnow('1', 0)).toBeCloseTo(0.65, 2);
  });

  it('Lasten-Tab und Auto-Pipeline liefern IDENTISCHE s_k/s-Werte', () => {
    const tab = snowTab('3', 367, 10)!;
    const auto = snowAuto({ zone: '3', altitude: 367, roofPitch: 10, roofForm: 'satteldach', exposure: 'normal', heated: false });
    expect(tab.sk).toBeCloseTo(auto.sk, 2);
    expect(tab.si).toBeCloseTo(auto.s, 2);
    expect(tab.mu).toBeCloseTo(auto.mu, 2);
  });
});

describe('Windlast — eine Quelle für beide Wege (ÖNORM B 1991-1-4)', () => {
  it('v_b-Zonenwerte liegen im ÖNORM-Band 17,6–28,3 m/s (nicht 25–30)', () => {
    for (const vb of Object.values(VB_BY_ZONE)) {
      expect(vb).toBeGreaterThanOrEqual(17.6);
      expect(vb).toBeLessThanOrEqual(28.3);
    }
  });
  it('Lasten-Tab und Auto-Pipeline liefern IDENTISCHEN Staudruck q_p', () => {
    const tab = windTab('2', 'II', 6.5)!;
    const auto = windAuto({ zone: '2', terrain: 'II', buildingHeight: 6.5, roofPitch: 30, roofForm: 'satteldach' });
    expect(tab.qp).toBeCloseTo(auto.qp, 2);
    expect(tab.vb0).toBe(auto.vb);
  });
  it('Lasten-Tab akzeptiert jetzt auch Windzone 4 (Burgenland)', () => {
    const r = windTab('4', 'II', 6.5);
    expect(r).not.toBeNull();
    expect(r!.vb0).toBe(28.3);
  });
  it('ungültige Zone/Gelände → null (Blocker statt stiller Default)', () => {
    expect(windTab('5', 'II', 6.5)).toBeNull();
    expect(windTab('2', 'X', 6.5)).toBeNull();
    expect(snowTab('9', 300, 30)).toBeNull();
  });
});
