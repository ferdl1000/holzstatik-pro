import { useMemo } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { CheckCircle, AlertTriangle, XCircle, ArrowRight, ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runFullValidation, countBySeverity, projectHealthStatus } from '@/lib/validation';

interface ReviewTabProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

export function ReviewTab({ project, onUpdate }: ReviewTabProps) {
  const issues = useMemo(() => runFullValidation(project), [project]);
  const counts = countBySeverity(issues);
  const health = projectHealthStatus(issues);

  const handleRefresh = () => {
    if (onUpdate) {
      onUpdate({ validationIssues: issues });
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Prüf-Agent</h2>
          <p className="text-sm text-muted-foreground">Plausibilitätsprüfung und Freigabestatus – automatisch aus dem Projektmodell abgeleitet</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />Prüfung aktualisieren
        </Button>
      </div>

      {/* Health banner */}
      <div className={`rounded-lg border-2 p-4 flex items-center gap-4 ${
        health === 'red' ? 'border-[hsl(var(--status-red)/0.5)] bg-[hsl(var(--status-red-bg))]' :
        health === 'yellow' ? 'border-[hsl(var(--status-yellow)/0.5)] bg-[hsl(var(--status-yellow-bg))]' :
        'border-[hsl(var(--status-green)/0.5)] bg-[hsl(var(--status-green-bg))]'
      }`}>
        {health === 'red' ? <ShieldAlert className="h-6 w-6 text-[hsl(var(--status-red))]" /> :
         health === 'yellow' ? <AlertTriangle className="h-6 w-6 text-[hsl(var(--status-yellow))]" /> :
         <ShieldCheck className="h-6 w-6 text-[hsl(var(--status-green))]" />}
        <div>
          <p className="font-semibold text-sm">
            {health === 'red' && 'Nicht freigabefähig – kritische Blocker vorhanden'}
            {health === 'yellow' && 'Bedingt freigabefähig – offene Punkte prüfen'}
            {health === 'green' && 'Formal vollständig – alle Prüfungen bestanden'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {counts.red} Blocker · {counts.yellow} Hinweise · {counts.green} bestanden
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--status-red-bg))]">
            <XCircle className="h-5 w-5 text-[hsl(var(--status-red))]" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{counts.red}</p>
            <p className="text-xs text-muted-foreground">Nicht freigabefähig</p>
          </div>
        </div>
        <div className="rounded-lg border p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--status-yellow-bg))]">
            <AlertTriangle className="h-5 w-5 text-[hsl(var(--status-yellow))]" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{counts.yellow}</p>
            <p className="text-xs text-muted-foreground">Manuell prüfen</p>
          </div>
        </div>
        <div className="rounded-lg border p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--status-green-bg))]">
            <CheckCircle className="h-5 w-5 text-[hsl(var(--status-green))]" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{counts.green}</p>
            <p className="text-xs text-muted-foreground">Formal vollständig</p>
          </div>
        </div>
      </div>

      {/* Blocker section */}
      {counts.red > 0 && (
        <SectionCard title="Kritische Blocker" subtitle="Müssen vor Weiterarbeit behoben werden">
          <div className="space-y-2">
            {issues.filter(i => i.severity === 'red').map((issue) => (
              <div key={issue.id} className="flex items-start gap-3 rounded-md border border-[hsl(var(--status-red)/0.3)] bg-[hsl(var(--status-red-bg)/0.3)] p-4">
                <XCircle className="h-4 w-4 text-[hsl(var(--status-red))] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium text-muted-foreground">{issue.category}</span>
                  </div>
                  <p className="text-sm">{issue.message}</p>
                  {issue.suggestion && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />{issue.suggestion}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* All issues */}
      <SectionCard title="Vollständiges Prüfprotokoll" subtitle={`${issues.length} Prüfpunkte aus dem aktuellen Projektmodell`}>
        <div className="space-y-2">
          {issues.map((issue) => (
            <div key={issue.id} className="flex items-start gap-3 rounded-md border p-4">
              {issue.severity === 'red' && <XCircle className="h-4 w-4 text-[hsl(var(--status-red))] shrink-0 mt-0.5" />}
              {issue.severity === 'yellow' && <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-yellow))] shrink-0 mt-0.5" />}
              {issue.severity === 'green' && <CheckCircle className="h-4 w-4 text-[hsl(var(--status-green))] shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium text-muted-foreground">{issue.category}</span>
                  {issue.resolved && <span className="text-[10px] status-badge-green px-1.5 py-0.5 rounded">Erledigt</span>}
                </div>
                <p className="text-sm">{issue.message}</p>
                {issue.suggestion && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <ArrowRight className="h-3 w-3" />{issue.suggestion}
                  </p>
                )}
              </div>
              <StatusIndicator status={issue.severity} />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Disclaimer */}
      <div className="rounded-lg border-2 border-[hsl(var(--status-yellow)/0.4)] bg-[hsl(var(--status-yellow-bg))] p-4">
        <p className="text-xs leading-relaxed">
          <strong>Hinweis:</strong> Auch bei Status „Grün" handelt es sich um eine Vorbemessung.
          Die Ergebnisse ersetzen keine rechtsverbindliche Statik durch eine qualifizierte Fachperson.
          Alle automatisch angenommenen Werte sind gekennzeichnet und müssen vor der Endfreigabe geprüft werden.
        </p>
      </div>
    </div>
  );
}
