import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { ROOF_FORM_LABELS, STRUCTURAL_SYSTEM_LABELS } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Check, Building2, ArrowRight, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StructureTabProps { project: Project; }

export function StructureTab({ project }: StructureTabProps) {
  const roof = project.roofType;
  const sys = project.structuralSystem;

  if (!roof || !sys) return <div className="p-6 text-center text-muted-foreground">Tragwerksanalyse nicht verfügbar</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Roof Form */}
      <SectionCard title="Dachform" subtitle="Erkannte Dachgeometrie">
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(ROOF_FORM_LABELS).map(([key, label]) => (
            <div key={key} className={cn(
              'rounded-lg border-2 p-4 text-center cursor-pointer transition-all',
              key === roof.form
                ? 'border-primary bg-primary/5'
                : 'border-transparent bg-muted/30 hover:bg-muted/50'
            )}>
              <Building2 className={cn('h-8 w-8 mx-auto mb-2', key === roof.form ? 'text-primary' : 'text-muted-foreground/40')} />
              <p className={cn('text-sm font-medium', key === roof.form ? 'text-primary' : 'text-muted-foreground')}>{label}</p>
              {key === roof.form && <ConfidenceBadge confidence={roof.confidence} size="md" />}
            </div>
          ))}
        </div>
        {!roof.userConfirmed && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-3.5 w-3.5 text-status-yellow" />
              <span className="text-xs text-muted-foreground">Dachform muss bestätigt werden</span>
            </div>
            <Button size="sm" className="gap-1.5"><Check className="h-3.5 w-3.5" />Bestätigen</Button>
          </div>
        )}
      </SectionCard>

      {/* Structural System */}
      <SectionCard title="Tragwerkssystem" subtitle="Vorgeschlagene Dachkonstruktion">
        <div className="space-y-4">
          {/* Primary suggestion */}
          <div className="rounded-lg border-2 border-primary bg-primary/5 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold">{STRUCTURAL_SYSTEM_LABELS[sys.type]}</h4>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Empfohlen</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{sys.reasoning}</p>
              </div>
              <ConfidenceBadge confidence={sys.confidence} size="md" />
            </div>
          </div>

          {/* Alternatives */}
          <h4 className="section-header">Alternativen</h4>
          <div className="space-y-2">
            {sys.alternatives.map((alt, i) => (
              <div key={i} className="rounded-lg border p-4 hover:bg-muted/20 cursor-pointer transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="text-sm font-medium">{STRUCTURAL_SYSTEM_LABELS[alt.type]}</h5>
                    <p className="text-xs text-muted-foreground mt-0.5">{alt.reasoning}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ConfidenceBadge confidence={alt.confidence} />
                    <Button variant="ghost" size="sm"><ArrowRight className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!sys.userConfirmed && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" className="gap-1.5"><Check className="h-3.5 w-3.5" />Tragwerk bestätigen</Button>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
