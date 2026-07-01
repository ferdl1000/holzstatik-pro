/**
 * Client-Helper für die "Endkontrolle" (mehrstufige KI-Gegenprüfung nach der
 * Berechnung). Baut die ComputedSummary aus dem aktuellen Projektstand (wie
 * CostsTab/BillOfMaterialsTab das auch tun — direkt aus project.members/
 * project.roofParts/project.geometry, da diese Felder persistiert sind,
 * anders als das transiente AutoPipelineResult) und ruft die Edge Function
 * `agent-final-check` auf. Diese startet 3 unabhängige Prüfläufe gegen den
 * Original-Plan und schiebt bei Abweichung >5% automatisch ein verfeinertes
 * 3-stufiges Fallback-Verfahren nach.
 *
 * Siehe supabase/functions/_shared/finalVerification.ts für die reine
 * Vergleichs-/Konsens-Logik und supabase/functions/agent-final-check für die
 * Orchestrierung der KI-Aufrufe.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Project } from '@/types/project';
import { estimateCost, DEFAULT_FACTORS } from '@/lib/pricing';
import type { ComputedSummary } from '../../../supabase/functions/_shared/finalVerification';

export type { ComputedSummary } from '../../../supabase/functions/_shared/finalVerification';
export type {
  VerificationPassResult, ConsensusResult, FinalVerificationStatus,
} from '../../../supabase/functions/_shared/finalVerification';

/** Fasst den aktuellen Projektstand zu den 4 Kennzahlen zusammen, gegen die geprüft wird. */
export function buildComputedSummary(project: Project): ComputedSummary {
  const roofParts = project.roofParts;
  const roofAreaM2 = roofParts && roofParts.length > 0
    ? roofParts.reduce((sum, rp) => sum + rp.geometry.length * rp.geometry.width, 0)
    : (project.geometry ? project.geometry.length.value * project.geometry.width.value : 0);
  const roofPartCount = roofParts && roofParts.length > 0 ? roofParts.length : 1;

  const members = project.members || [];
  const timberVolumeM3 = members.reduce(
    (sum, m) => sum + (m.width / 1000) * (m.height / 1000) * m.length * m.quantity, 0,
  );

  const groundArea = project.geometry ? project.geometry.length.value * project.geometry.width.value : 0;
  const pitch = project.geometry?.roofPitch.value ?? 0;
  const roofAreaForCost = groundArea > 0
    ? Math.round(groundArea / Math.cos((pitch * Math.PI) / 180) * 10) / 10
    : roofAreaM2;
  const estimate = estimateCost({
    members, roofArea: roofAreaForCost, groundArea,
    coveringId: 'tile_clay',
    insulationId: 'ins_mw_200', membraneIds: ['mem_under', 'mem_vapor'],
    hasGlulam: members.some((m) => (m.material || '').toLowerCase().includes('gl')),
    factors: DEFAULT_FACTORS,
  });
  const offerTotalEur = estimate.gross;

  return { roofAreaM2, roofPartCount, timberVolumeM3, offerTotalEur };
}

export interface FinalVerificationResponse {
  status: 'consensus' | 'refined_accepted' | 'refined_failed';
  checkedAt: string;
  passes: Array<{
    passId: string; strategy: string; model: string;
    roofAreaM2: number | null; roofPartCount: number | null;
    timberVolumeM3: number | null; offerTotalEur: number | null;
    plausible: boolean | null; issues: string[]; confidence: number;
  }>;
  consensus: {
    consensusReached: boolean; toleranceRatio: number;
    metricComparisons: Array<{ metric: string; reference: number; maxDeviationPercent: number; withinTolerance: boolean }>;
    deviatingMetrics: string[];
    criticalIssues: string[];
  };
  refinedConsensus?: FinalVerificationResponse['consensus'];
  refinedValues?: ComputedSummary;
  log: string[];
}

/** Holt die zuletzt analysierte Plan-Datei des Projekts (für die Endkontrolle gegen den Original-Plan). */
export async function findLatestDocumentId(projectId: string): Promise<string | null> {
  const { data } = await supabase
    .from('documents')
    .select('id, status, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  const analyzed = (data || []).find((d: any) => d.status === 'analyzed');
  return (analyzed?.id as string) ?? (data?.[0]?.id as string) ?? null;
}

export async function runFinalVerification(
  projectId: string, documentId: string, project: Project, analysisQuality?: string,
): Promise<FinalVerificationResponse> {
  const computed = buildComputedSummary(project);
  const { data, error } = await supabase.functions.invoke('agent-final-check', {
    body: { projectId, documentId, computed, analysisQuality },
  });
  if (error) throw new Error(`Endkontrolle fehlgeschlagen: ${error.message}`);
  if (data?.error) throw new Error(`Endkontrolle fehlgeschlagen: ${data.error}`);
  return data.finalVerification as FinalVerificationResponse;
}
