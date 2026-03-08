import { useState } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Calculator, Play, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateAllMembers } from '@/lib/calculations';
import { useToast } from '@/hooks/use-toast';

interface CalculationTabProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

export function CalculationTab({ project, onUpdate }: CalculationTabProps) {
  const [calculating, setCalculating] = useState(false);
  const { toast } = useToast();

  const handleCalculate = () => {
    // Check prerequisites
    const missingPrereqs: string[] = [];
    if (!project.geometry?.userConfirmed) missingPrereqs.push('Geometrie nicht bestätigt');
    if (!project.structuralSystem?.userConfirmed) missingPrereqs.push('Tragwerk nicht bestätigt');
    if (project.loadCases.length === 0) missingPrereqs.push('Keine Lastfälle definiert');
    if (project.members.length === 0) missingPrereqs.push('Keine Bauteile definiert');

    if (missingPrereqs.length > 0) {
      toast({
        title: 'Berechnung nicht möglich',
        description: missingPrereqs.join(', '),
        variant: 'destructive',
      });
      return;
    }

    setCalculating(true);

    // Run calculation (synchronous but with visual delay)
    setTimeout(() => {
      const roofPitch = project.geometry?.roofPitch?.value || 35;
      const mainSpan = project.geometry?.width?.value || 8;

      const results = calculateAllMembers(
        project.members,
        project.materials,
        project.loadCases,
        roofPitch,
        mainSpan
      );

      // Update validation issues based on results
      const newIssues = results
        .filter(r => r.overallStatus === 'red')
        .flatMap(r =>
          r.checks
            .filter(c => c.status === 'red')
            .map(c => ({
              id: `vi-calc-${r.memberId}-${c.name}`,
              severity: 'red' as const,
              category: 'Bemessung',
              message: `${r.memberName}: ${c.name} überschritten (${c.formula})`,
              affectedField: `members.${r.memberId}`,
              suggestion: c.type === 'stress' ? 'Querschnitt vergrößern oder Material ändern' : 'Spannweite oder Auflager prüfen',
              resolved: false,
            }))
        );

      if (onUpdate) {
        onUpdate({
          calculations: results,
          validationIssues: [
            ...project.validationIssues.filter(v => !v.id.startsWith('vi-calc-')),
            ...newIssues,
          ],
          currentStep: Math.max(project.currentStep, 8),
        });
      }

      setCalculating(false);
      const passed = results.filter(r => r.overallStatus === 'green').length;
      const total = results.length;
      toast({
        title: 'Berechnung abgeschlossen',
        description: `${passed}/${total} Bauteile bestanden. ${newIssues.length} neue Probleme.`,
      });
    }, 1500);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Bemessungs-Agent</h2>
          <p className="text-sm text-muted-foreground">
            Vorbemessung und Nachweisführung Holz-Dachtragwerk nach EC5 / ÖNORM B 1995-1-1
          </p>
        </div>
        <Button className="gap-1.5" onClick={handleCalculate} disabled={calculating}>
          {calculating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Berechne…</>
          ) : (
            <><Play className="h-4 w-4" />Berechnung starten</>
          )}
        </Button>
      </div>

      {/* Calculation parameters info */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'γ_M (Holz)', value: '1.30' },
          { label: 'γ_G (ständig)', value: '1.35' },
          { label: 'γ_Q (veränd.)', value: '1.50' },
          { label: 'k_mod', value: '0.90' },
        ].map(p => (
          <div key={p.label} className="rounded-md bg-muted/50 p-2.5 text-center">
            <span className="text-[10px] text-muted-foreground">{p.label}</span>
            <p className="font-mono font-bold text-sm">{p.value}</p>
          </div>
        ))}
      </div>

      {project.calculations.length === 0 && !calculating ? (
        <div className="text-center py-16 space-y-4">
          <Calculator className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground">Noch keine Berechnung durchgeführt</p>
          <p className="text-xs text-muted-foreground">
            Bestätigen Sie zuerst Geometrie, Tragwerk, Lasten und Materialien.
          </p>
        </div>
      ) : null}

      {project.calculations.map((calc) => (
        <SectionCard
          key={calc.id}
          title={calc.memberName}
          headerRight={<StatusIndicator status={calc.overallStatus} size="md" />}
        >
          <div className="space-y-4">
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

                    <div className="text-xs text-muted-foreground w-56 text-right">
                      {check.formula && <span className="font-mono">{check.formula}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Details */}
            {calc.checks.some(c => c.details) && (
              <div className="rounded-md bg-muted/20 p-3 space-y-1">
                {calc.checks.filter(c => c.details).map((check, i) => (
                  <p key={i} className="text-xs font-mono text-muted-foreground">
                    {check.name}: {check.details}
                  </p>
                ))}
              </div>
            )}

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
