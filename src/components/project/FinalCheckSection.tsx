import { useState } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getAnalysisQuality } from '@/lib/settings/analysisQuality';
import {
  runFinalVerification, findLatestDocumentId,
  type FinalVerificationResponse,
} from '@/lib/verification/runFinalVerification';

interface FinalCheckSectionProps {
  project: Project;
  projectId?: string;
  onUpdate?: (updates: Partial<Project>) => void;
}

const METRIC_LABELS: Record<string, string> = {
  roofAreaM2: 'Dachfläche (m²)',
  roofPartCount: 'Anzahl Dachteile',
  timberVolumeM3: 'Holzmenge (m³)',
  offerTotalEur: 'Angebotssumme (€)',
};

export function FinalCheckSection({ project, projectId, onUpdate }: FinalCheckSectionProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FinalVerificationResponse | null>((project as any).finalVerification ?? null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function start() {
    if (!projectId) {
      toast({ title: 'Projekt nicht gespeichert', description: 'Bitte zuerst speichern.', variant: 'destructive' });
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const documentId = await findLatestDocumentId(projectId);
      if (!documentId) throw new Error('Kein hochgeladener Plan gefunden — Endkontrolle braucht den Original-Plan.');
      const res = await runFinalVerification(projectId, documentId, project, getAnalysisQuality());
      setResult(res);
      onUpdate?.({ finalVerification: res } as any);
      toast({
        title: res.status === 'consensus' ? 'Konsens erreicht' : res.status === 'refined_accepted' ? 'Konsens nach Fallback erreicht' : 'Kein Konsens',
        description: res.status === 'refined_failed' ? 'Bitte manuell gegen den Plan prüfen.' : undefined,
        variant: res.status === 'refined_failed' ? 'destructive' : 'default',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast({ title: 'Endkontrolle fehlgeschlagen', description: msg, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  }

  const statusMeta = !result ? null : {
    consensus: {
      icon: ShieldCheck,
      banner: 'border-[hsl(var(--status-green)/0.5)] bg-[hsl(var(--status-green-bg))]',
      iconClass: 'text-[hsl(var(--status-green))]',
      label: 'Konsens erreicht — 3 unabhängige Prüfläufe stimmen überein (≤5% Abweichung)',
    },
    refined_accepted: {
      icon: ShieldCheck,
      banner: 'border-[hsl(var(--status-green)/0.5)] bg-[hsl(var(--status-green-bg))]',
      iconClass: 'text-[hsl(var(--status-green))]',
      label: 'Konsens erst nach verfeinertem Fallback-Verfahren erreicht',
    },
    refined_failed: {
      icon: ShieldAlert,
      banner: 'border-[hsl(var(--status-red)/0.5)] bg-[hsl(var(--status-red-bg))]',
      iconClass: 'text-[hsl(var(--status-red))]',
      label: 'KEIN Konsens — auch das Fallback-Verfahren konvergiert nicht. Manuelle Prüfung gegen den Plan nötig.',
    },
  }[result.status];

  return (
    <SectionCard
      title="Endkontrolle — mehrstufige KI-Gegenprüfung"
      subtitle="3 unabhängige Prüfverfahren gegen den Original-Plan (nach der Berechnung), analog zur Zweitprüfung durch einen Meister/Bauleiter vor Angebotsabgabe"
      headerRight={
        <Button size="sm" onClick={start} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldQuestion className="h-3.5 w-3.5" />}
          {running ? 'Prüft…' : result ? 'Erneut prüfen' : 'Endkontrolle starten'}
        </Button>
      }
    >
      {!result && !running && (
        <p className="text-sm text-muted-foreground">
          Noch nicht geprüft. Startet 3 unabhängige KI-Prüfläufe (unterschiedliche Prompts/Modelle) gegen den
          hochgeladenen Plan und vergleicht Dachfläche, Anzahl Dachteile, Holzmenge und Angebotssumme.
          Weichen sie um mehr als 5% voneinander ab, läuft automatisch ein verfeinertes 3-stufiges
          Nachanalyse-Verfahren.
        </p>
      )}
      {error && <p className="text-sm text-status-red">{error}</p>}
      {result && statusMeta && (
        <div className="space-y-4">
          <div className={`rounded-lg border-2 p-4 flex items-center gap-3 ${statusMeta.banner}`}>
            <statusMeta.icon className={`h-5 w-5 shrink-0 ${statusMeta.iconClass}`} />
            <p className="text-sm font-medium">{statusMeta.label}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Die 3 unabhängigen Prüfläufe</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {result.passes.map((p) => (
                <div key={p.passId} className="rounded-md border p-3 text-xs space-y-1">
                  <p className="font-medium">{p.strategy}</p>
                  <p className="text-muted-foreground">Modell: {p.model}</p>
                  <p>Dachfläche: {p.roofAreaM2 != null ? `${p.roofAreaM2.toFixed(0)} m²` : '—'}</p>
                  <p>Dachteile: {p.roofPartCount ?? '—'}</p>
                  {p.timberVolumeM3 != null && <p>Holzmenge: {p.timberVolumeM3.toFixed(2)} m³</p>}
                  {p.offerTotalEur != null && <p>Angebot: {p.offerTotalEur.toFixed(0)} €</p>}
                  <p>
                    Plausibel:{' '}
                    {p.plausible === true ? '✓ ja' : p.plausible === false ? '✗ nein' : '– keine Aussage'}
                  </p>
                  {p.issues.length > 0 && (
                    <ul className="text-status-yellow list-disc list-inside">
                      {p.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Kennzahlen-Vergleich (Toleranz {(result.consensus.toleranceRatio * 100).toFixed(0)}%)
            </p>
            <div className="space-y-1">
              {result.consensus.metricComparisons.map((m) => (
                <div key={m.metric} className="flex items-center justify-between text-xs rounded border px-3 py-1.5">
                  <span>{METRIC_LABELS[m.metric] ?? m.metric}</span>
                  <span className={m.withinTolerance ? 'text-status-green' : 'text-status-red font-medium'}>
                    max. Abweichung {m.maxDeviationPercent}% {m.withinTolerance ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {result.refinedValues && (
            <div className="rounded-md border p-3 text-xs bg-muted/30">
              <p className="font-semibold mb-1">Werte nach verfeinertem Fallback-Verfahren:</p>
              <p>Dachfläche {result.refinedValues.roofAreaM2.toFixed(0)} m² · {result.refinedValues.roofPartCount} Dachteile ·
                {' '}{result.refinedValues.timberVolumeM3.toFixed(2)} m³ Holz · {result.refinedValues.offerTotalEur.toFixed(0)} € Angebot</p>
            </div>
          )}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Vollständiges Prüfprotokoll</summary>
            <ul className="mt-2 space-y-0.5 font-mono">
              {result.log.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </details>
        </div>
      )}
    </SectionCard>
  );
}
