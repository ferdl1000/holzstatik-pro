/**
 * Lastfall-Kombinationen nach EN 1990 / ÖNORM B 1990.
 *
 * Grundlegende Kombination (Tragfähigkeit ULS):
 *   E_d = γ_G · G_k + γ_Q · Q_k,1 + Σ γ_Q · ψ_0,i · Q_k,i
 *
 *   γ_G = 1,35   Teilsicherheit ständige Last
 *   γ_Q = 1,50   Teilsicherheit veränderliche Last
 *   ψ_0 = Kombinationsbeiwert Begleitwert (siehe Tabelle)
 *
 * Gebrauchstauglichkeit SLS (Durchbiegung):
 *   E_d = G_k + Q_k,1 + Σ ψ_0,i · Q_k,i   (charakteristische Kombination)
 *   oder mit ψ_2 für quasi-ständig (Kriechen)
 *
 * KLARTEXT FÜR LAIEN:
 *   Wir nehmen nicht einfach Schnee + Wind + Eigengewicht zusammen, weil sehr unwahrscheinlich ist,
 *   dass alle gleichzeitig ihr Maximum erreichen. Stattdessen: eine Last als "Haupt"-Last (volle Stärke),
 *   die andere als "Begleit"-Last (reduzierter Anteil ψ). Sicherheitsfaktoren werden draufgepackt,
 *   damit das Bauteil mit Sicherheits-Puffer dimensioniert wird.
 */

import type { LoadDuration } from '../materials';

export interface LoadComponent {
  id: string;
  name: string;
  type: 'permanent' | 'snow' | 'wind' | 'imposed' | 'maintenance';
  value: number;    // kN/m² oder kN/m oder kN
  duration: LoadDuration;
  psi0: number;     // Kombinationsbeiwert
  psi1: number;     // häufig
  psi2: number;     // quasi-ständig
}

/** Kombinationsbeiwerte ψ nach EN 1990 NA Österreich */
export const PSI_FACTORS: Record<string, { psi0: number; psi1: number; psi2: number }> = {
  snow_below1000: { psi0: 0.5, psi1: 0.2, psi2: 0.0 },
  snow_above1000: { psi0: 0.7, psi1: 0.5, psi2: 0.2 },
  wind:           { psi0: 0.6, psi1: 0.2, psi2: 0.0 },
  imposed_roof:   { psi0: 0.0, psi1: 0.0, psi2: 0.0 },
  imposed_resid:  { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
};

export const GAMMA_G = 1.35;
export const GAMMA_Q = 1.50;
export const GAMMA_G_FAV = 1.00;  // günstig wirkend (Eigengewicht hält dagegen)

export interface CombinationResult {
  name: string;
  leading: string;
  value: number;
  components: { name: string; factor: number; contribution: number }[];
  duration: LoadDuration;
  formula: string;
  explanation: string;
}

/**
 * Erstellt alle maßgebenden Kombinationen für ULS:
 * - Schnee als Haupt-Last, Wind als Begleiter
 * - Wind als Haupt, Schnee als Begleiter
 * - Nur Eigengewicht (selten maßgebend)
 * - Wind-Abheben (Eigengewicht günstig)
 *
 * Gibt sortierte Liste zurück, größter Wert zuerst.
 */
export function buildULSCombinations(loads: LoadComponent[]): CombinationResult[] {
  const permanent = loads.filter(l => l.type === 'permanent');
  const variable = loads.filter(l => l.type !== 'permanent');
  const Gk = permanent.reduce((s, l) => s + l.value, 0);

  const results: CombinationResult[] = [];

  // 1. Jede variable Last einmal als leading
  for (const lead of variable) {
    const others = variable.filter(l => l.id !== lead.id);
    let value = GAMMA_G * Gk + GAMMA_Q * lead.value;
    const components: CombinationResult['components'] = [
      ...permanent.map(l => ({ name: l.name, factor: GAMMA_G, contribution: GAMMA_G * l.value })),
      { name: lead.name + ' (Haupt)', factor: GAMMA_Q, contribution: GAMMA_Q * lead.value },
    ];
    for (const o of others) {
      const psi = o.psi0;
      const contrib = GAMMA_Q * psi * o.value;
      value += contrib;
      components.push({ name: `${o.name} (Begleit, ψ₀=${psi})`, factor: GAMMA_Q * psi, contribution: contrib });
    }
    results.push({
      name: `Kombi-${lead.type}-haupt`,
      leading: lead.name,
      value,
      components,
      duration: lead.duration,
      formula: '1,35·G + 1,50·Q₁ + Σ 1,50·ψ₀·Qᵢ',
      explanation: `${lead.name} ist die maßgebende Hauptlast (volle Stärke), andere Lasten wirken anteilig mit. Faktor 1,35 auf ständige Last (Eigengewicht), 1,50 auf veränderliche Lasten als Sicherheitspuffer.`,
    });
  }

  // 2. Wind-Sog-Lastfall (Eigengewicht günstig → γ_G = 1.0)
  const wind = variable.find(l => l.type === 'wind');
  if (wind && wind.value < 0) {
    let value = GAMMA_G_FAV * Gk + GAMMA_Q * wind.value;
    const components: CombinationResult['components'] = [
      ...permanent.map(l => ({ name: l.name + ' (günstig)', factor: GAMMA_G_FAV, contribution: GAMMA_G_FAV * l.value })),
      { name: wind.name, factor: GAMMA_Q, contribution: GAMMA_Q * wind.value },
    ];
    results.push({
      name: 'Wind-Abheben',
      leading: wind.name,
      value,
      components,
      duration: 'instantaneous',
      formula: '1,00·G + 1,50·W (Sog)',
      explanation: `Wind-Sog kann das Dach abheben. Eigengewicht wirkt jetzt günstig (hält dagegen) → Faktor nur 1,00 statt 1,35. Wenn Summe negativ ist, brauchst du eine Verankerung gegen Abheben.`,
    });
  }

  return results.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** SLS-Kombination charakteristisch (für Durchbiegung w_inst) */
export function buildSLSCharacteristic(loads: LoadComponent[]): CombinationResult {
  const permanent = loads.filter(l => l.type === 'permanent');
  const variable = loads.filter(l => l.type !== 'permanent');
  const Gk = permanent.reduce((s, l) => s + l.value, 0);
  // Annahme: variable mit größtem Wert ist leading
  const sorted = [...variable].sort((a, b) => b.value - a.value);
  const lead = sorted[0];
  const others = sorted.slice(1);

  let value = Gk + (lead?.value || 0);
  const components: CombinationResult['components'] = [
    ...permanent.map(l => ({ name: l.name, factor: 1, contribution: l.value })),
  ];
  if (lead) components.push({ name: lead.name, factor: 1, contribution: lead.value });
  for (const o of others) {
    const contrib = o.psi0 * o.value;
    value += contrib;
    components.push({ name: `${o.name} (ψ₀=${o.psi0})`, factor: o.psi0, contribution: contrib });
  }

  return {
    name: 'SLS-charakteristisch',
    leading: lead?.name || 'G',
    value,
    components,
    duration: lead?.duration || 'permanent',
    formula: 'G + Q₁ + Σ ψ₀·Qᵢ',
    explanation: 'Für Durchbiegungs-Nachweis (Gebrauchstauglichkeit) ohne Sicherheitsfaktoren — wir wollen wissen, wie weit das Bauteil unter realistischer Last durchbiegt.',
  };
}
