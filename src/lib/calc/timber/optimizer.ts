/**
 * Querschnitts-Optimierer:
 * Findet kleinstmöglichen Standard-Querschnitt der alle Nachweise mit Reserve erfüllt.
 *
 * Strategie:
 *  1. Iteriere über Standard-Querschnitte (aufsteigend nach Volumen)
 *  2. Berechne alle Nachweise
 *  3. Erster Querschnitt mit max(η) ≤ targetUtilization wird genommen
 *  4. Fallback: höchste Festigkeitsklasse + größter Querschnitt
 */

import { calculateBeam, type BeamInput, type BeamResult } from './beam';
import { calculateGlulam, type GlulamBeamInput, type GlulamResult } from './glulam';
import { STANDARD_KVH_SECTIONS, STANDARD_GLULAM_SECTIONS } from '../sections/properties';

export interface OptimizeResult {
  bestSection: { b: number; h: number; label: string };
  bestClass: string;
  result: BeamResult | GlulamResult;
  attempted: { b: number; h: number; cls: string; maxEta: number; status: string }[];
  reasoning: string;
}

export function optimizeBeam(
  baseInput: Omit<BeamInput, 'b' | 'h' | 'timberClass'> & { preferredClasses?: string[] },
  targetUtilization = 0.95,
): OptimizeResult {
  const classes = baseInput.preferredClasses || ['C24', 'C30'];
  const sections = STANDARD_KVH_SECTIONS;
  const attempted: OptimizeResult['attempted'] = [];

  for (const cls of classes) {
    for (const sec of sections) {
      const r = calculateBeam({ ...baseInput, b: sec.b, h: sec.h, timberClass: cls });
      attempted.push({ b: sec.b, h: sec.h, cls, maxEta: r.maxUtilization, status: r.overallStatus });
      if (r.maxUtilization <= targetUtilization) {
        return {
          bestSection: sec, bestClass: cls, result: r, attempted,
          reasoning: `Kleinster Querschnitt mit ausreichender Reserve: ${sec.label} (${cls}), η_max = ${(r.maxUtilization * 100).toFixed(0)} %. Aus ${attempted.length} geprüften Varianten.`,
        };
      }
    }
  }

  // Fallback: größter geprüfter Querschnitt mit höchster Klasse
  const last = attempted[attempted.length - 1];
  const lastSec = sections[sections.length - 1];
  const r = calculateBeam({ ...baseInput, b: lastSec.b, h: lastSec.h, timberClass: classes[classes.length - 1] });
  return {
    bestSection: lastSec, bestClass: classes[classes.length - 1], result: r, attempted,
    reasoning: `Kein Standard-KVH-Querschnitt reicht. Empfehlung: auf BSH (Leimbinder) wechseln. Größter geprüfter: ${lastSec.label} mit η = ${(r.maxUtilization * 100).toFixed(0)} %.`,
  };
}

export function optimizeGlulam(
  baseInput: Omit<GlulamBeamInput, 'b' | 'h' | 'timberClass'> & { preferredClasses?: string[] },
  targetUtilization = 0.95,
): OptimizeResult {
  const classes = baseInput.preferredClasses || ['GL24h', 'GL28h'];
  const sections = STANDARD_GLULAM_SECTIONS;
  const attempted: OptimizeResult['attempted'] = [];

  for (const cls of classes) {
    for (const sec of sections) {
      const r = calculateGlulam({ ...baseInput, b: sec.b, h: sec.h, timberClass: cls });
      attempted.push({ b: sec.b, h: sec.h, cls, maxEta: r.maxUtilization, status: r.overallStatus });
      if (r.maxUtilization <= targetUtilization) {
        return {
          bestSection: sec, bestClass: cls, result: r, attempted,
          reasoning: `Optimaler BSH-Querschnitt: ${sec.label} (${cls}), η_max = ${(r.maxUtilization * 100).toFixed(0)} %. Spannweite ${baseInput.span} m mit Form "${baseInput.shape}".`,
        };
      }
    }
  }

  const lastSec = sections[sections.length - 1];
  const r = calculateGlulam({ ...baseInput, b: lastSec.b, h: lastSec.h, timberClass: 'GL28h' });
  return {
    bestSection: lastSec, bestClass: 'GL28h', result: r, attempted,
    reasoning: `Selbst maximaler BSH-Querschnitt reicht nicht. Empfehlung: Sattel-/Bogenbinder, Fachwerk oder zusätzliche Stütze. Aktuell η = ${(r.maxUtilization * 100).toFixed(0)} %.`,
  };
}
