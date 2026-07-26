import { describe, it, expect } from 'vitest';
import { driftShapeFactor, characteristicGroundSnow } from '../loads/snow';
import { cpeForRoof, exposureCoefficient } from '../loads/wind';

describe('Schneeanhäufung an höheren Bauteilen (EC1-1-3 Abschn. 5.3.6)', () => {
  const sk = characteristicGroundSnow('3', 367); // Hartberg-Niveau

  it('erhöht die Schneelast auf einem Vordach unter einem höheren Hauptdach deutlich', () => {
    // Vordach 3 m breit, Hauptdach 9 m breit, 3 m Höhenversprung, Oberdach 35°
    const d = driftShapeFactor(sk, 3.0, 3.0, 9.0, 35);
    expect(d.mu2).toBeGreaterThan(0.8);   // mehr als der Normalfall μ₁
    expect(d.mu2).toBeLessThanOrEqual(4.0);
    expect(d.ls).toBeGreaterThanOrEqual(5);
    expect(d.ls).toBeLessThanOrEqual(15);
  });

  it('bleibt bei winzigem Höhenversprung beim Mindestwert 0,8', () => {
    const d = driftShapeFactor(sk, 0.2, 3.0, 9.0, 10);
    expect(d.mu2).toBeGreaterThanOrEqual(0.8);
  });

  it('kappt μ₂ nach oben bei 4,0', () => {
    const d = driftShapeFactor(sk, 8.0, 20.0, 30.0, 45);
    expect(d.mu2).toBeLessThanOrEqual(4.0);
  });

  it('flaches Oberdach liefert keinen Abrutschanteil', () => {
    const flach = driftShapeFactor(sk, 3.0, 3.0, 9.0, 5);
    const steil = driftShapeFactor(sk, 3.0, 3.0, 9.0, 45);
    expect(steil.mu2).toBeGreaterThan(flach.mu2);
  });
});

describe('Windsog ist bei keiner Dachform und keiner Neigung null', () => {
  const formen = ['satteldach', 'pultdach', 'walmdach', 'krueppelwalmdach', 'flachdach', 'mischform'] as const;
  const neigungen = [0, 5, 10, 15, 25, 30, 35, 40, 45, 50, 60, 70];

  it.each(formen)('%s liefert für jede Neigung einen echten Sog', (form) => {
    for (const alpha of neigungen) {
      const cpe = cpeForRoof(form, alpha);
      expect(cpe.suction, `${form} bei ${alpha}°`).toBeLessThan(0);
    }
  });

  it('Satteldach 35° hat erheblichen Sog (Wind parallel zum First)', () => {
    // Vorher war der Sog hier exakt 0,00 — der Abhebenachweis lief ins Leere.
    expect(cpeForRoof('satteldach', 35).suction).toBeLessThan(-1.0);
  });
});

describe('Expositionsbeiwert nach EC1-1-4 Abschn. 4.3', () => {
  it('liegt für Geländekategorie II in 10 m Höhe im erwarteten Bereich', () => {
    const ce = exposureCoefficient('II', 10);
    expect(ce).toBeGreaterThan(2.0);
    expect(ce).toBeLessThan(2.7);
  });

  it('wächst mit der Höhe und fällt mit rauerem Gelände', () => {
    expect(exposureCoefficient('II', 20)).toBeGreaterThan(exposureCoefficient('II', 8));
    expect(exposureCoefficient('IV', 10)).toBeLessThan(exposureCoefficient('II', 10));
  });
});
