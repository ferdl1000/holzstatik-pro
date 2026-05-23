/**
 * Schallschutz-Vorbemessung für Holzbalkendecken
 * Vereinfacht nach DIN 4109 / OIB RL 5
 * Achtung: Nur Vorbemessung — genaue Werte durch Schallschutznachweisplan
 */

export interface DeckeAufbau {
  holzdicke: number;   // mm Balkenhöhe
  estrich: number;     // mm schwimmender Estrich (0 = keiner)
  dämmung: number;     // mm Trittschalldämmung unter Estrich
  deckenverkleidung?: number; // mm abgehängte GK-Decke (optional)
}

/**
 * Vereinfachte Schätzung Luft-Schalldämmmaß R'w für Holzbalkendecke.
 * Basis: Holzbalkendecke ohne Aufbau ~45 dB, Verbesserungen additiv.
 */
export function schalldämmungHolzbalken(aufbau: DeckeAufbau): number {
  let rw = 45; // Basis Holzbalkendecke (dB)

  // Schwimmender Estrich: ~5–8 dB Verbesserung je nach Dicke
  if (aufbau.estrich >= 40) rw += 5;
  if (aufbau.estrich >= 60) rw += 3; // kumulativ bis 8 dB
  if (aufbau.estrich >= 80) rw += 2; // kumulativ bis 10 dB

  // Trittschalldämmung unter Estrich
  if (aufbau.dämmung >= 20) rw += 2;
  if (aufbau.dämmung >= 30) rw += 1;

  // Abgehängte Deckenverkleidung
  if (aufbau.deckenverkleidung && aufbau.deckenverkleidung >= 12.5) rw += 5;

  // Balkendicke beeinflusst Masse
  if (aufbau.holzdicke >= 200) rw += 2;
  if (aufbau.holzdicke >= 260) rw += 1;

  return Math.min(rw, 70); // Deckel bei 70 dB (realistisches Maximum)
}

/**
 * Bewertetes Schalldämmmaß R'w inkl. Spektrum-Anpassungswert Ctr
 * Typisch Ctr = -2 bis -5 dB für Wohngebäude
 */
export function bewertetesSchalldämmMaßR_w(aufbau: DeckeAufbau, ctr = -3): number {
  return schalldämmungHolzbalken(aufbau) + ctr;
}

export interface SchallschutzErgebnis {
  rw: number;         // dB Luftschalldämmung
  rw_bewerted: number; // dB mit Ctr
  anforderung_wohnen: number; // dB Mindestanforderung OIB RL5 Wohnen
  trittschall_l: number; // dB Trittschallpegel (geschätzt)
  erfuellt: boolean;
  bewertung: 'sehr_gut' | 'gut' | 'ausreichend' | 'mangelhaft';
}

const ANFORDERUNG_RW_WOHNEN = 54; // dB R'w Mindestanforderung OIB RL5

/**
 * Vollständige Schallschutz-Bewertung einer Holzbalkendecke
 */
export function bewerteSchallschutz(aufbau: DeckeAufbau): SchallschutzErgebnis {
  const rw = schalldämmungHolzbalken(aufbau);
  const rw_bewerted = bewertetesSchalldämmMaßR_w(aufbau);

  // Trittschallpegel L'n,w: Basis 80 dB, verbessert durch Dämmung und Estrich
  let ln = 80;
  if (aufbau.estrich >= 40) ln -= 12;
  if (aufbau.dämmung >= 20) ln -= 8;
  if (aufbau.deckenverkleidung) ln -= 5;

  let bewertung: SchallschutzErgebnis['bewertung'];
  if (rw >= 60) bewertung = 'sehr_gut';
  else if (rw >= 56) bewertung = 'gut';
  else if (rw >= ANFORDERUNG_RW_WOHNEN) bewertung = 'ausreichend';
  else bewertung = 'mangelhaft';

  return {
    rw,
    rw_bewerted,
    anforderung_wohnen: ANFORDERUNG_RW_WOHNEN,
    trittschall_l: Math.max(ln, 40),
    erfuellt: rw >= ANFORDERUNG_RW_WOHNEN,
    bewertung,
  };
}
