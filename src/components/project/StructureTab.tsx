import { useState } from 'react';
import type { Project, RoofFormType, StructuralSystemType } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { ROOF_FORM_LABELS, STRUCTURAL_SYSTEM_LABELS } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Check, Building2, ArrowRight, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { RoofVisualization } from './RoofVisualization';

interface StructureTabProps { project: Project; onUpdate?: (updates: Partial<Project>) => void; }

export function StructureTab({ project, onUpdate }: StructureTabProps) {
  const roof = project.roofType;
  const sys = project.structuralSystem;
  const { toast } = useToast();

  if (!roof || !sys) return <div className="p-6 text-center text-muted-foreground">Tragwerksanalyse nicht verfügbar</div>;

  const selectRoofForm = (form: RoofFormType) => {
    if (onUpdate) {
      onUpdate({ roofType: { ...roof, form, userConfirmed: true, confidence: 1.0 } });
      toast({ title: `Dachform geändert: ${ROOF_FORM_LABELS[form]}` });
    }
  };

  const selectSystem = (type: StructuralSystemType) => {
    if (onUpdate) {
      onUpdate({ structuralSystem: { ...sys, type, userConfirmed: true, confidence: 1.0 } });
      toast({ title: `Tragwerk geändert: ${STRUCTURAL_SYSTEM_LABELS[type]}` });
    }
  };

  const confirmRoof = () => {
    if (onUpdate) {
      onUpdate({ roofType: { ...roof, userConfirmed: true } });
      toast({ title: 'Dachform bestätigt' });
    }
  };

  const confirmSystem = () => {
    if (onUpdate) {
      onUpdate({ structuralSystem: { ...sys, userConfirmed: true } });
      toast({ title: 'Tragwerk bestätigt' });
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SectionCard title="Dachform" subtitle="Erkannte Dachgeometrie">
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(ROOF_FORM_LABELS).map(([key, label]) => (
            <div
              key={key}
              onClick={() => selectRoofForm(key as RoofFormType)}
              className={cn(
                'rounded-lg border-2 p-4 text-center cursor-pointer transition-all',
                key === roof.form
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent bg-muted/30 hover:bg-muted/50'
              )}
            >
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
            <Button size="sm" className="gap-1.5" onClick={confirmRoof}><Check className="h-3.5 w-3.5" />Bestätigen</Button>
          </div>
        )}
      </SectionCard>

      {/* SVG Visualization */}
      <SectionCard title="Tragwerksschema" subtitle="2D-Schnittdarstellung des Dachtragwerks">
        <div className="rounded-lg border bg-card/50 p-4">
          <RoofVisualization project={project} width={700} height={350} />
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-primary rounded" />
            <span>Tragstruktur</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span>Pfetten / Auflager</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 border-t border-dashed border-primary" />
            <span>Stützen</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Tragwerkssystem" subtitle="Vorgeschlagene Dachkonstruktion">
        <div className="space-y-4">
          <div className={cn(
            'rounded-lg border-2 p-5',
            sys.userConfirmed ? 'border-status-green bg-status-green-bg/30' : 'border-primary bg-primary/5'
          )}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold">{STRUCTURAL_SYSTEM_LABELS[sys.type]}</h4>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {sys.userConfirmed ? '✓ Bestätigt' : 'Empfohlen'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{sys.reasoning}</p>
              </div>
              <ConfidenceBadge confidence={sys.confidence} size="md" />
            </div>
          </div>

          <h4 className="section-header">Alternativen</h4>
          <div className="space-y-2">
            {sys.alternatives.map((alt, i) => (
              <div
                key={i}
                onClick={() => selectSystem(alt.type)}
                className="rounded-lg border p-4 hover:bg-muted/20 cursor-pointer transition-all"
              >
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
              <Button size="sm" className="gap-1.5" onClick={confirmSystem}><Check className="h-3.5 w-3.5" />Tragwerk bestätigen</Button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Members overview */}
      <SectionCard title="Bauteile" subtitle="Erkannte und vorgeschlagene Tragwerksbauteile">
        <table className="data-table">
          <thead>
            <tr><th>Bauteil</th><th>Typ</th><th>Querschnitt</th><th>Länge</th><th>Anzahl</th></tr>
          </thead>
          <tbody>
            {project.members.map(m => (
              <tr key={m.id}>
                <td className="font-medium text-sm">{m.name}</td>
                <td className="text-xs text-muted-foreground capitalize">{m.type}</td>
                <td className="value-display">{m.crossSection} mm</td>
                <td className="value-display">{m.length} m</td>
                <td className="value-display">{m.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
