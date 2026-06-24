import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Project } from '@/types/project';
import type { AutoPipelineResult, AutoAssumption } from '@/lib/auto/contracts';
import { runAutoPipeline } from '@/lib/auto/autoPipeline';
import { InfoTooltip } from '@/components/help/InfoTooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { loadApplicableRules, applyRules } from '@/lib/learning/captureCorrection';
import { getAnalysisQuality } from '@/lib/settings/analysisQuality';
import {
  Sparkles, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';

interface AutoAnalysisTabProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

const PIPELINE_STEPS = [
  'Geometrie ableiten…',
  'Bauteile generieren…',
  'Lasten ermitteln…',
  'Optimieren…',
  'Kosten berechnen…',
  'Fertig!',
];

function StatusDot({ status }: { status: 'green' | 'yellow' | 'red' }) {
  if (status === 'green') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === 'yellow') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function overallStatus(result: AutoPipelineResult): 'green' | 'yellow' | 'red' {
  const statuses = result.calculations.members.map((m) => m.overallStatus);
  if (statuses.some((s) => s === 'red')) return 'red';
  if (statuses.some((s) => s === 'yellow')) return 'yellow';
  return 'green';
}

export function AutoAnalysisTab({ project, onUpdate }: AutoAnalysisTabProps) {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [running, setRunning] = useState(false);
  const [progressStep, setProgressStep] = useState<number>(-1);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [result, setResult] = useState<AutoPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [dimMode, setDimMode] = useState<'wirtschaftlich' | 'sicher'>(
    project.dimensioningMode ?? 'wirtschaftlich',
  );

  // Auto-trigger analysis when navigated from NewProject with ?autoAnalyze=true
  useEffect(() => {
    if (searchParams.get('autoAnalyze') === 'true') {
      // Remove the param so a refresh won't re-trigger
      setSearchParams(prev => {
        prev.delete('autoAnalyze');
        return prev;
      }, { replace: true });
      handleRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyResult(pipelineResult: AutoPipelineResult) {
    setResult(pipelineResult);

    if (onUpdate) {
      onUpdate({
        geometry: pipelineResult.geometry.geometry,
        roofType: pipelineResult.roofType.roofType,
        structuralSystem: pipelineResult.structuralSystem.structuralSystem,
        members: pipelineResult.calculations.optimizedMembers,
        loadCases: pipelineResult.loads.loadCases,
        ...(pipelineResult.roofParts ? { roofParts: pipelineResult.roofParts } : {}),
      });
    }

    toast({
      title: 'Komplett-Analyse abgeschlossen',
      description: pipelineResult.summary,
    });

    // Toast für automatische Korrekturen
    const corrections = pipelineResult.allAssumptions.filter(
      (a) => typeof a.reason === 'string' && a.reason.includes('Korrektur:'),
    );
    if (corrections.length > 0) {
      toast({
        title: `${corrections.length} automatische Korrektur${corrections.length > 1 ? 'en' : ''} aus Plausibilitätsprüfung`,
        description: 'Siehe Annahmen-Liste für Details.',
      });
    }
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgressStep(-1);
    setProgressLabel('');

    try {
      const projectId = (project as Project & { id?: string }).id;

      // ── Schritt 1: KI-Analyse (agent-orchestrator) für jeden Plan ──────────
      if (projectId) {
        const { data: docs } = await supabase
          .from('documents')
          .select('id, status, file_name')
          .eq('project_id', projectId);

        if (docs && docs.length > 0) {
          for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            setProgressLabel(`KI-Analyse Plan ${i + 1}/${docs.length}: ${doc.file_name} …`);
            try {
              const { error: orchError } = await supabase.functions.invoke('agent-orchestrator', {
                body: { projectId, documentId: doc.id, analysisQuality: getAnalysisQuality() },
              });
              if (orchError) {
                console.warn(`KI-Analyse fehlgeschlagen für ${doc.file_name}:`, orchError);
                // Nicht abbrechen — mit nächstem Plan / bestehenden Daten weitermachen
              }
            } catch (orchEx) {
              console.warn(`KI-Analyse exception für ${doc.file_name}:`, orchEx);
            }
          }

          // ── Schritt 2: Projekt-Daten nach KI-Analyse neu laden ──────────────
          setProgressLabel('Projekt-Daten neu laden …');
          const { data: refreshed } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

          if (refreshed) {
            let refreshedProject: Project = {
              ...project,
              ...(refreshed.project_data ?? {}),
              id: projectId,
            } as Project;

            // ── Schritt 2b: Lern-Regeln anwenden ────────────────────────────
            try {
              const triggerContext = (refreshedProject as any).planerKey
                || (refreshedProject as any).planerLabel || refreshedProject.name || undefined;
              const rules = await loadApplicableRules(triggerContext);
              if (rules.length > 0) {
                // Auf Toplevel-Felder des Projekts anwenden (roofForm, structuralSystemType etc.)
                const flatProject: Record<string, unknown> = {
                  roofForm: refreshedProject.roofType?.form,
                  structuralSystemType: refreshedProject.structuralSystem?.type,
                  roofPitch: refreshedProject.geometry?.roofPitch?.value,
                  coveringType: refreshedProject.coveringType?.type,
                };
                const { result: patched, applied } = applyRules(flatProject, rules);
                if (applied.length > 0) {
                  // Überschriebene Felder zurückschreiben
                  if (patched.roofForm && refreshedProject.roofType) {
                    refreshedProject = { ...refreshedProject, roofType: { ...refreshedProject.roofType, form: patched.roofForm as any } };
                  }
                  if (patched.structuralSystemType && refreshedProject.structuralSystem) {
                    refreshedProject = { ...refreshedProject, structuralSystem: { ...refreshedProject.structuralSystem, type: patched.structuralSystemType as any } };
                  }
                  if (patched.roofPitch !== undefined && refreshedProject.geometry?.roofPitch) {
                    refreshedProject = { ...refreshedProject, geometry: { ...refreshedProject.geometry!, roofPitch: { ...refreshedProject.geometry!.roofPitch, value: Number(patched.roofPitch) } } };
                  }
                  toast({
                    title: `${applied.length} Lern-Regel${applied.length > 1 ? 'n' : ''} angewandt`,
                    description: applied.map(r => `${r.field}: ${r.correct_value}`).join(', '),
                  });
                }
              }
            } catch (ruleErr) {
              console.debug('[AutoAnalysis] Lern-Regeln Fehler (ignored):', ruleErr);
            }

            // ── Schritt 3: Pipeline mit refreshed-Daten ──────────────────────
            setProgressStep(0);
            setProgressLabel(PIPELINE_STEPS[0]);

            let step = 0;
            const ticker = setInterval(() => {
              step = Math.min(step + 1, 4);
              setProgressStep(step);
              setProgressLabel(PIPELINE_STEPS[step]);
            }, 700);

            const pipelineResult = await runAutoPipeline({
              project: refreshedProject,
              sparrenSpacing: 0.8,
              useOptimizer: true,
            });

            clearInterval(ticker);
            setProgressStep(5);
            setProgressLabel(PIPELINE_STEPS[5]);

            await applyResult(pipelineResult);
            return;
          }
        }
      }

      // ── Fallback: Pipeline direkt auf aktuelles project (keine Pläne / kein projectId) ─
      setProgressStep(0);
      setProgressLabel(PIPELINE_STEPS[0]);

      let step = 0;
      const ticker = setInterval(() => {
        step = Math.min(step + 1, 4);
        setProgressStep(step);
        setProgressLabel(PIPELINE_STEPS[step]);
      }, 700);

      const pipelineResult = await runAutoPipeline({
        project,
        sparrenSpacing: 0.8,
        useOptimizer: true,
      });

      clearInterval(ticker);
      setProgressStep(5);
      setProgressLabel(PIPELINE_STEPS[5]);

      await applyResult(pipelineResult);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast({
        title: 'Fehler bei der Analyse',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  }

  const brutto =
    result?.costs?.withLabor?.gross ?? result?.costs?.materialOnly?.gross ?? 0;

  const status = result ? overallStatus(result) : null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* ── Header Card ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <CardTitle className="text-xl">Komplett-Auto-Analyse</CardTitle>
              <InfoTooltip title="Was macht die Komplett-Auto-Analyse?">
                <div className="space-y-2 text-sm">
                  <p>
                    Auf einen Klick werden alle Berechnungen mit sinnvollen
                    Standardwerten durchgeführt:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-foreground/80">
                    <li>Geometrie aus vorhandenen Daten ableiten</li>
                    <li>Sparren, Pfetten und Stützen automatisch generieren</li>
                    <li>Schnee- und Windlasten nach ÖNORM EN 1991 ermitteln</li>
                    <li>Alle Bauteile nach EC5 dimensionieren und optimieren</li>
                    <li>Massenauszug und Kostenschätzung erstellen</li>
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    Alle Annahmen werden transparent dokumentiert und können
                    anschließend in den einzelnen Tabs angepasst werden.
                  </p>
                </div>
              </InfoTooltip>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Vollautomatische Tragwerksanalyse mit einem Klick – alle Schritte
            werden mit sinnvollen Standardwerten durchgeführt.
          </p>
        </CardHeader>

        <CardContent>
          <Button
            size="lg"
            className="gap-2 text-base px-8"
            onClick={handleRun}
            disabled={running}
          >
            {running ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            Komplett-Auto-Analyse starten
          </Button>
        </CardContent>
      </Card>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      {running && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {/* KI-Phase: progressStep ist -1, zeige aktuellen Label prominent */}
              {progressStep < 0 && progressLabel && (
                <div className="flex items-center gap-2 text-sm text-primary font-medium">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  {progressLabel}
                </div>
              )}
              {/* Pipeline-Phase: Schritt-Liste */}
              {progressStep >= 0 && PIPELINE_STEPS.map((step, i) => (
                <div
                  key={step}
                  className={`flex items-center gap-2 text-sm transition-colors ${
                    i < progressStep
                      ? 'text-green-600'
                      : i === progressStep
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  {i < progressStep ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : i === progressStep ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />
                  )}
                  {step}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && (
        <Card className="border-red-300">
          <CardContent className="pt-6 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-700">Fehler bei der Analyse</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-4">
          {/* Gesamt-Status-Ampel */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                {status && <StatusDot status={status} />}
                <div>
                  <p className="font-semibold text-base">
                    {status === 'green'
                      ? 'Alle Bauteile standsicher'
                      : status === 'yellow'
                      ? 'Einige Bauteile an der Grenze'
                      : 'Überlastete Bauteile vorhanden'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">{result.summary}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-md bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Bauteile</p>
                  <p className="text-lg font-bold">{result.calculations.members.length}</p>
                </div>
                <div className="rounded-md bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">max. Ausnutzung η</p>
                  <p className="text-lg font-bold">
                    {result.calculations.members.length > 0
                      ? Math.max(...result.calculations.members.map((m) => m.maxUtilization)).toFixed(2)
                      : '–'}
                  </p>
                </div>
                <div className="rounded-md bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Bruttosumme</p>
                  <p className="text-lg font-bold">
                    {brutto.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
                <div className="rounded-md bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Konfidenz</p>
                  <p className="text-lg font-bold">{(result.confidenceScore * 100).toFixed(0)} %</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bauteile-Tabelle mit Varianten-Toggle */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <CardTitle className="text-base">Bauteile &amp; Querschnitte</CardTitle>
                <div className="flex items-center gap-1 rounded-lg border p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDimMode('wirtschaftlich');
                      if (onUpdate) onUpdate({ dimensioningMode: 'wirtschaftlich' });
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      dimMode === 'wirtschaftlich'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Wirtschaftlich
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDimMode('sicher');
                      if (onUpdate) onUpdate({ dimensioningMode: 'sicher' });
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      dimMode === 'sicher'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Sicher
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {dimMode === 'wirtschaftlich'
                  ? 'Kleinster Querschnitt, der alle Nachweise erfüllt (η ≤ 0,95)'
                  : 'Eine Profilgröße mehr Reserve (η ≤ 0,85) – empfohlen für Angebote'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Bauteil</th>
                      <th className="pb-2 text-left font-medium">Typ</th>
                      <th className="pb-2 text-center font-medium">
                        Wirtschaftlich <span className="font-normal">(η)</span>
                      </th>
                      <th className="pb-2 text-center font-medium">
                        Sicher <span className="font-normal">(η)</span>
                      </th>
                      <th className="pb-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.calculations.members.map((m, i) => {
                      const w = m.variants?.wirtschaftlich;
                      const s = m.variants?.sicher;
                      const activeStatus = (dimMode === 'sicher' ? s?.status : w?.status) ?? m.overallStatus;
                      const sameProfile = s && w && s.b === w.b && s.h === w.h;
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5 pr-4 font-medium">{m.member.name}</td>
                          <td className="py-1.5 pr-4 text-muted-foreground capitalize">{m.member.type}</td>
                          <td className="py-1.5 px-2 text-center">
                            <span className={`inline-flex items-center gap-1 font-mono text-xs ${dimMode === 'wirtschaftlich' ? 'font-semibold' : 'text-muted-foreground'}`}>
                              {w ? w.label : `${m.section.b}/${m.section.h}`}
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                η {(w ? w.eta : m.maxUtilization).toFixed(2)}
                              </Badge>
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {s && !sameProfile ? (
                              <span className={`inline-flex items-center gap-1 font-mono text-xs ${dimMode === 'sicher' ? 'font-semibold' : 'text-muted-foreground'}`}>
                                {s.label}
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                  η {s.eta.toFixed(2)}
                                </Badge>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">= wirtschaftlich</span>
                            )}
                          </td>
                          <td className="py-1.5 text-center">
                            <span className="inline-flex justify-center">
                              <StatusDot status={activeStatus} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {result.calculations.members.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-muted-foreground text-xs">
                          Keine Bauteile berechnet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Annahmen Collapsible */}
          {result.allAssumptions.length > 0 && (
            <Card>
              <CardHeader className="pb-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-base font-semibold hover:text-primary transition-colors"
                  onClick={() => setAssumptionsOpen((v) => !v)}
                >
                  <span>Annahmen ({result.allAssumptions.length})</span>
                  {assumptionsOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </CardHeader>

              {assumptionsOpen && (
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    {result.allAssumptions.map((a: AutoAssumption, i: number) => (
                      <div key={i} className="rounded-md border bg-muted/20 p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-primary font-medium">{a.field}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground uppercase tracking-wide">
                            {a.source}
                          </span>
                        </div>
                        <p className="mt-1 font-medium">
                          Wert:{' '}
                          <span className="font-normal">{String(a.value)}</span>
                        </p>
                        <p className="mt-0.5 text-muted-foreground">{a.reason}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
