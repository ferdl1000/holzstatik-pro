/**
 * Holzart/Festigkeitsklasse nachträglich ändern und ALLES neu berechnen.
 *
 * Der Endkunde wählt im Material-Reiter eine andere Holzklasse (z.B. C24 → GL28c)
 * und das Programm bemisst alle Bauteile neu (Querschnitte, Ausnutzungen, Status) —
 * ohne dass der Plan erneut analysiert werden muss.
 */
import type { Project, TimberMember } from '@/types/project';
import type { AutoCalculationResult } from '@/lib/auto/contracts';
import { autoCalculateAllMembers } from '@/lib/auto/autoCalculate';
import { TIMBER_CLASSES } from '@/lib/calc/materials';

export interface TimberOption {
  id: string;
  label: string;
  isGlulam: boolean;
}

/** Auswählbare Holzklassen für den Endkunden. */
export function availableTimberOptions(): TimberOption[] {
  return Object.values(TIMBER_CLASSES).map((c) => ({
    id: c.id,
    label: c.name,
    isGlulam: c.id.startsWith('GL'),
  }));
}

export interface RecalcResult {
  members: TimberMember[];
  calculations: AutoCalculationResult;
  green: number;
  yellow: number;
  red: number;
}

/**
 * Setzt für alle Holzbauteile die gewählte Festigkeitsklasse und bemisst neu.
 * Liefert die neu optimierten Bauteile + Nachweis-Ergebnisse.
 */
export function recalcWithTimber(project: Project, gradeId: string): RecalcResult {
  const grade = TIMBER_CLASSES[gradeId];
  if (!grade) throw new Error(`Unbekannte Holzklasse: ${gradeId}`);

  // Lasten aus dem Projekt (Eigengewicht + Schnee), mit sicheren Defaults.
  const lc = project.loadCases || [];
  const sk = lc.find((l) => l.type === 'snow')?.value ?? 1.5;
  const gkRoof = lc.find((l) => l.type === 'permanent')?.value ?? 0.9;

  const geometry = project.geometry ?? ({} as Project['geometry']);
  const sparrenSpacing = 0.8;

  // Material aller Bauteile auf die gewählte Klasse setzen.
  const members: TimberMember[] = (project.members || []).map((m) => ({
    ...m,
    material: grade.id,
  }));

  const calculations = autoCalculateAllMembers(members, { gk: gkRoof, sk }, geometry as any, sparrenSpacing);

  // Wahl des Nutzers EXAKT übernehmen: der Optimizer wählt aus Wirtschaftlichkeit ggf.
  // eine niedrigere Klasse derselben Familie — wir behalten aber die vom Nutzer gewählte
  // Klasse als Material (der Querschnitt ist dafür ausreichend bzw. konservativ bemessen).
  const optimized = calculations.optimizedMembers.map((m) => ({ ...m, material: grade.id }));

  const green = calculations.members.filter((m) => m.overallStatus === 'green').length;
  const yellow = calculations.members.filter((m) => m.overallStatus === 'yellow').length;
  const red = calculations.members.filter((m) => m.overallStatus === 'red').length;

  return { members: optimized, calculations, green, yellow, red };
}
