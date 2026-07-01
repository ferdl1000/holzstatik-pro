/**
 * Nachgelagerte Mehrfach-Gegenprüfung ("Endkontrolle").
 *
 * Nachdem Statik + Angebot vollständig berechnet sind, prüfen mehrere
 * UNABHÄNGIGE Prüfverfahren (unterschiedliche Prompts/Modelle — niemals
 * identisch), ob das Ergebnis zum Einreichplan passt. Ziel: der Nutzer soll
 * sich darauf verlassen können, dass ein Angebot nur dann als "geprüft" gilt,
 * wenn mehrere unabhängige Prüfläufe im Wesentlichen (≤5% Abweichung) zum
 * selben Ergebnis kommen — analog zur internen Zweitprüfung eines Meisters/
 * Bauleiters in einem gut organisierten Zimmereibetrieb, bevor ein Angebot
 * rausgeht.
 *
 * Diese Datei enthält NUR reine Vergleichs-/Entscheidungslogik (keine KI-API-
 * Aufrufe) → vollständig unit-testbar. Die eigentlichen KI-Prüfläufe und das
 * Ausführen des Fallback-Verfahrens leben in agent-final-check/index.ts.
 */

export interface VerificationPassResult {
  /** Eindeutige ID des Prüfverfahrens, z.B. 'A_neuvermessung' */
  passId: string;
  /** Klartext-Beschreibung, WIE dieser Pass prüft (muss sich von den anderen unterscheiden) */
  strategy: string;
  /** Welches Modell tatsächlich geantwortet hat (für Transparenz/Debugging) */
  model: string;
  roofAreaM2: number | null;
  roofPartCount: number | null;
  timberVolumeM3: number | null;
  offerTotalEur: number | null;
  /** null = Pass konnte keine Plausibilitätsaussage treffen (z.B. Fehler) */
  plausible: boolean | null;
  issues: string[];
  confidence: number;
}

export interface ComputedSummary {
  roofAreaM2: number;
  roofPartCount: number;
  timberVolumeM3: number;
  offerTotalEur: number;
}

export type VerificationMetricKey = 'roofAreaM2' | 'roofPartCount' | 'timberVolumeM3' | 'offerTotalEur';

export const VERIFICATION_METRICS: VerificationMetricKey[] = [
  'roofAreaM2', 'roofPartCount', 'timberVolumeM3', 'offerTotalEur',
];

export interface MetricComparison {
  metric: VerificationMetricKey;
  reference: number;
  values: Array<{ passId: string; value: number }>;
  /** größte relative Abweichung (in %) — sowohl Pass-vs-Pipeline als auch Pass-vs-Pass */
  maxDeviationPercent: number;
  withinTolerance: boolean;
}

export interface ConsensusResult {
  consensusReached: boolean;
  toleranceRatio: number;
  metricComparisons: MetricComparison[];
  deviatingMetrics: VerificationMetricKey[];
  plausibleVotes: number;
  implausibleVotes: number;
  abstainVotes: number;
  majorityPlausible: boolean | null;
  criticalIssues: string[];
  recommendation: 'accept' | 'refine';
}

export const DEFAULT_TOLERANCE_RATIO = 0.05;

/**
 * Vergleicht N unabhängige Prüfläufe untereinander UND gegen das tatsächlich
 * berechnete Pipeline-Ergebnis. Konsens nur wenn ALLE bewerteten Kennzahlen
 * innerhalb der Toleranz liegen UND keine Mehrheit "nicht plausibel" sagt.
 */
export function compareVerificationPasses(
  passes: VerificationPassResult[],
  computed: ComputedSummary,
  toleranceRatio: number = DEFAULT_TOLERANCE_RATIO,
): ConsensusResult {
  const metricComparisons: MetricComparison[] = [];
  const deviatingMetrics: VerificationMetricKey[] = [];

  for (const metric of VERIFICATION_METRICS) {
    const reference = computed[metric];
    const values = passes
      .map((p) => ({ passId: p.passId, value: p[metric] }))
      .filter((v): v is { passId: string; value: number } =>
        typeof v.value === 'number' && Number.isFinite(v.value));
    // Keine Aussage von irgendeinem Pass zu dieser Kennzahl → nicht werten (kein falscher Konsens vortäuschen)
    if (values.length === 0) continue;

    let maxDev = 0;
    for (const v of values) {
      const dev = reference !== 0
        ? Math.abs(v.value - reference) / Math.abs(reference)
        : (v.value === 0 ? 0 : 1);
      if (dev > maxDev) maxDev = dev;
    }
    // Pässe auch untereinander vergleichen (Cross-Konsistenz, nicht nur ggü. Pipeline)
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const a = values[i].value, b = values[j].value;
        const base = Math.max(Math.abs(a), Math.abs(b), 1e-9);
        const dev = Math.abs(a - b) / base;
        if (dev > maxDev) maxDev = dev;
      }
    }
    const withinTolerance = maxDev <= toleranceRatio;
    if (!withinTolerance) deviatingMetrics.push(metric);
    metricComparisons.push({
      metric, reference, values,
      maxDeviationPercent: Math.round(maxDev * 1000) / 10,
      withinTolerance,
    });
  }

  let plausibleVotes = 0, implausibleVotes = 0, abstainVotes = 0;
  for (const p of passes) {
    if (p.plausible === true) plausibleVotes++;
    else if (p.plausible === false) implausibleVotes++;
    else abstainVotes++;
  }
  const totalVotes = plausibleVotes + implausibleVotes;
  const majorityPlausible = totalVotes === 0 ? null : plausibleVotes > implausibleVotes;

  const criticalIssues = [...new Set(passes.flatMap((p) => p.issues))];

  // Keine bewertbare Kennzahl vorhanden (alle Pässe fehlgeschlagen) → niemals als Konsens durchgehen lassen
  const metricsOk = metricComparisons.length > 0 && deviatingMetrics.length === 0;
  const plausibilityOk = majorityPlausible !== false;
  const consensusReached = metricsOk && plausibilityOk;

  return {
    consensusReached,
    toleranceRatio,
    metricComparisons,
    deviatingMetrics,
    plausibleVotes, implausibleVotes, abstainVotes,
    majorityPlausible,
    criticalIssues,
    recommendation: consensusReached ? 'accept' : 'refine',
  };
}

export function needsRefinedFallback(consensus: ConsensusResult): boolean {
  return !consensus.consensusReached;
}

/**
 * Das 3-stufige verfeinerte Fallback-Verfahren, das greift wenn die 3
 * unabhängigen Prüfläufe NICHT innerhalb der Toleranz konvergieren. Beginnt
 * bewusst wieder "von vorne" statt die vorhandene (offenbar unsichere)
 * Extraktion weiter zu patchen.
 */
export interface RefinedStageSpec {
  stage: 1 | 2 | 3;
  title: string;
  goal: string;
  instructionForAi: string;
}

export function buildRefinedReanalysisPlan(reason: {
  deviatingMetrics: string[];
  criticalIssues: string[];
}): RefinedStageSpec[] {
  const deviations = reason.deviatingMetrics.join(', ') || 'keine spezifischen Kennzahlen benannt';
  const issues = reason.criticalIssues.join(' | ') || 'keine spezifischen Probleme benannt';
  return [
    {
      stage: 1,
      title: 'Dachform je Dachteil einzeln (von Grund auf neu)',
      goal: 'Anzahl und Form jedes Dachteils unabhängig von der bisherigen Berechnung neu bestimmen.',
      instructionForAi:
        'Ignoriere jede vorherige Berechnung vollständig und beginne ausschließlich anhand des Plans neu. ' +
        'Zähle jedes einzelne Dach-/Überdachungselement separat (Hauptdach, jeder Anbau, jedes Vordach, ' +
        'jeder Carport, jede Terrassenüberdachung, jede Gaube) und bestimme jeweils die Dachform ' +
        '(Sattel-/Pult-/Flach-/Walm-/Krüppelwalmdach). ' +
        `Die erste Prüfung wich bei folgenden Kennzahlen ab: ${deviations}. ` +
        `Gemeldete Probleme: ${issues}.`,
    },
    {
      stage: 2,
      title: 'Maße je Dachteil einzeln mit Referenzpunkten',
      goal: 'Für jedes in Stufe 1 identifizierte Dachteil eigenständig Länge, Breite, Höhen und Neigung ablesen.',
      instructionForAi:
        'Lies für jedes Dachteil aus Stufe 1 Länge, Breite, Firsthöhe, Traufhöhe und Neigungswinkel EINZELN ' +
        'und mit direktem Bezug auf eine im Plan sichtbare Bemaßungslinie, Kote oder DN-Angabe ab. ' +
        'Übernimm KEINE Werte von einem anderen Dachteil, auch wenn sie ähnlich aussehen — jedes Maß muss ' +
        'einen eigenen Beleg im Plan haben.',
    },
    {
      stage: 3,
      title: 'Cross-Check gegen Statik/Angebot',
      goal: 'Die aus Stufe 1+2 gewonnene Geometrie mit der ursprünglich berechneten Statik/dem Angebot abgleichen.',
      instructionForAi:
        'Vergleiche die in Stufe 1 und 2 neu ermittelte Geometrie mit den ursprünglich berechneten Werten. ' +
        'Benenne jede Abweichung explizit und gib an, welche Version durch ein Zitat/Beleg aus dem Plan besser ' +
        'gestützt ist. Liefere abschließend eine einzige, in sich konsistente, finale Fassung.',
    },
  ];
}

export type FinalVerificationStatus = 'consensus' | 'refined_accepted' | 'refined_failed';

/**
 * Entscheidet den Endstatus: Erst-Konsens erreicht → fertig. Sonst greift das
 * Fallback-Verfahren; dessen eigenes (erneutes) Konsens-Ergebnis entscheidet,
 * ob es jetzt passt — oder ob ehrlich als "nicht verifizierbar" markiert wird
 * (NIEMALS ein Schein-Ergebnis vortäuschen).
 */
export function decideFinalStatus(
  initial: ConsensusResult,
  refined?: ConsensusResult,
): FinalVerificationStatus {
  if (initial.consensusReached) return 'consensus';
  if (!refined) return 'refined_failed';
  return refined.consensusReached ? 'refined_accepted' : 'refined_failed';
}

/** Kompakte, lesbare Zusammenfassung für Logs/Audit-Trail. */
export function describeConsensus(consensus: ConsensusResult): string {
  if (consensus.consensusReached) {
    return `Konsens erreicht (Toleranz ${(consensus.toleranceRatio * 100).toFixed(0)}%, ` +
      `${consensus.plausibleVotes} plausibel-Stimmen, 0 abweichende Kennzahlen)`;
  }
  const devs = consensus.metricComparisons
    .filter((m) => !m.withinTolerance)
    .map((m) => `${m.metric}: max. Abweichung ${m.maxDeviationPercent}%`)
    .join('; ');
  return `Kein Konsens (Toleranz ${(consensus.toleranceRatio * 100).toFixed(0)}%): ` +
    `${devs || 'keine gemeinsame Kennzahl bewertbar'}` +
    `${consensus.majorityPlausible === false ? ' — Mehrheit hält Ergebnis für NICHT plausibel' : ''}`;
}
