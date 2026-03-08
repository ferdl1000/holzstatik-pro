import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { CheckCircle, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReviewTabProps { project: Project; }

export function ReviewTab({ project }: ReviewTabProps) {
  const issues = project.validationIssues;
  const reds = issues.filter(i => i.severity === 'red');
  const yellows = issues.filter(i => i.severity === 'yellow');
  const greens = issues.filter(i => i.severity === 'green');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold">Prüf-Agent</h2>
        <p className="text-sm text-muted-foreground">Plausibilitätsprüfung und Freigabestatus</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-red-bg">
            <XCircle className="h-5 w-5 text-status-red" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{reds.length}</p>
            <p className="text-xs text-muted-foreground">Nicht freigabefähig</p>
          </div>
        </div>
        <div className="rounded-lg border p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-yellow-bg">
            <AlertTriangle className="h-5 w-5 text-status-yellow" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{yellows.length}</p>
            <p className="text-xs text-muted-foreground">Manuell prüfen</p>
          </div>
        </div>
        <div className="rounded-lg border p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-green-bg">
            <CheckCircle className="h-5 w-5 text-status-green" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{greens.length}</p>
            <p className="text-xs text-muted-foreground">Formal vollständig</p>
          </div>
        </div>
      </div>

      {/* Issues list */}
      <SectionCard title="Prüfprotokoll" subtitle="Alle erkannten Widersprüche und Hinweise">
        <div className="space-y-2">
          {issues.map((issue) => (
            <div key={issue.id} className="flex items-start gap-3 rounded-md border p-4">
              {issue.severity === 'red' && <XCircle className="h-4 w-4 text-status-red shrink-0 mt-0.5" />}
              {issue.severity === 'yellow' && <AlertTriangle className="h-4 w-4 text-status-yellow shrink-0 mt-0.5" />}
              {issue.severity === 'green' && <CheckCircle className="h-4 w-4 text-status-green shrink-0 mt-0.5" />}
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
      <div className="rounded-lg border-2 border-status-yellow/40 bg-status-yellow-bg p-4">
        <p className="text-xs leading-relaxed">
          <strong>Hinweis:</strong> Auch bei Status „Grün" handelt es sich um eine Vorbemessung.
          Die Ergebnisse ersetzen keine rechtsverbindliche Statik durch eine qualifizierte Fachperson.
          Alle automatisch angenommenen Werte sind gekennzeichnet und müssen vor der Endfreigabe geprüft werden.
        </p>
      </div>
    </div>
  );
}
