import { useState } from 'react';
import type { Project } from '@/types/project';
import type { AutoPipelineResult, AutoAssumption } from '@/lib/auto/contracts';
import { runAutoPipeline } from '@/lib/auto/autoPipeline';
import { InfoTooltip } from '@/components/help/InfoTooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Sparkles, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';

interface AutoAnalysisTabProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

const PROGRESS_STEPS = [
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
  const [running, setRunning] = useState(false);
  const [progressStep, setProgressStep] = useState<number>(-1);
  const [result, setResult] = useState<AutoPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgressStep(0);

    try {
      // Simulate step progress while the pipeline runs.
      // We advance every 600 ms up to step 4; step 5 (Fertig) is set after await.
      let step = 0;
      const ticker = setInterval(() => {
        step = Math.min(step + 1, 4);
        setProgressStep(step);
      }, 700);

      const pipelineResult = await runAutoPipeline({
        project,
        sparrenSpacing: 0.8,
        useOptimizer: true,
      });

      clearInterval(ticker);
      setProgressStep(5);

      setResult(pipelineResult);

      // Persist back into Project
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
              {PROGRESS_STEPS.map((step, i) => (
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

          {/* Bauteile-Tabelle */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bauteile &amp; Querschnitte</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Bauteil</th>
                      <th className="pb-2 text-left font-medium">Typ</th>
                      <th className="pb-2 text-right font-medium">b/h</th>
                      <th className="pb-2 text-right font-medium">η max</th>
                      <th className="pb-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.calculations.members.map((m, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 pr-4 font-medium">{m.member.name}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground capitalize">{m.member.type}</td>
                        <td className="py-1.5 pr-4 text-right font-mono text-xs">
                          {m.section.b}/{m.section.h} cm
                        </td>
                        <td className="py-1.5 pr-4 text-right font-mono">
                          {m.maxUtilization.toFixed(2)}
                        </td>
                        <td className="py-1.5 text-center">
                          <span className="inline-flex justify-center">
                            <StatusDot status={m.overallStatus} />
                          </span>
                        </td>
                      </tr>
                    ))}
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
