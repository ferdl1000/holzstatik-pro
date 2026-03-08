import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Calculator, Play, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalculationTabProps { project: Project; }

export function CalculationTab({ project }: CalculationTabProps) {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Bemessungs-Agent</h2>
          <p className="text-sm text-muted-foreground">Vorbemessung und Nachweisführung Holz-Dachtragwerk</p>
        </div>
        <Button className="gap-1.5">
          <Play className="h-4 w-4" />
          Berechnung starten
        </Button>
      </div>

      {project.calculations.map((calc) => (
        <SectionCard
          key={calc.id}
          title={calc.memberName}
          headerRight={<StatusIndicator status={calc.overallStatus} size="md" />}
        >
          <div className="space-y-4">
            {/* Checks */}
            <div className="space-y-2">
              {calc.checks.map((check, i) => {
                const utilization = check.type === 'support_reactions' ? null : Math.round((check.result / check.limit) * 100);
                return (
                  <div key={i} className="flex items-center gap-4 rounded-md border p-3">
                    <div className="flex items-center gap-2 w-48">
                      {check.status === 'green' && <CheckCircle className="h-4 w-4 text-status-green" />}
                      {check.status === 'yellow' && <AlertTriangle className="h-4 w-4 text-status-yellow" />}
                      {check.status === 'red' && <XCircle className="h-4 w-4 text-status-red" />}
                      <span className="text-sm font-medium">{check.name}</span>
                    </div>

                    {utilization !== null ? (
                      <div className="flex-1 flex items-center gap-3">
                        <div className="flex-1">
                          <Progress
                            value={Math.min(utilization, 100)}
                            className={cn(
                              'h-2',
                              utilization > 100 && '[&>div]:bg-status-red',
                              utilization > 80 && utilization <= 100 && '[&>div]:bg-status-yellow',
                              utilization <= 80 && '[&>div]:bg-status-green'
                            )}
                          />
                        </div>
                        <span className={cn(
                          'font-mono text-sm font-semibold w-14 text-right',
                          utilization > 100 && 'text-status-red',
                          utilization > 80 && utilization <= 100 && 'text-status-yellow',
                          utilization <= 80 && 'text-status-green'
                        )}>
                          {utilization}%
                        </span>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <span className="value-display">{check.result} {check.unit}</span>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground w-40 text-right">
                      {check.formula && <span className="font-mono">{check.formula}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Missing inputs */}
            {calc.missingInputs.length > 0 && (
              <div className="rounded-md bg-status-yellow-bg border border-status-yellow/20 p-3">
                <p className="text-xs font-medium text-status-yellow mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  Offene Punkte
                </p>
                <ul className="text-xs text-foreground/70 space-y-0.5">
                  {calc.missingInputs.map((mi, i) => (
                    <li key={i}>• {mi}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
