import { useState } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ruler, Check, Edit, TriangleAlert, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RoofVisualization } from './RoofVisualization';

interface GeometryTabProps { project: Project; onUpdate?: (updates: Partial<Project>) => void; }

export function GeometryTab({ project, onUpdate }: GeometryTabProps) {
  const geo = project.geometry;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, number>>({});
  const { toast } = useToast();

  if (!geo) return <div className="p-6 text-center text-muted-foreground">Keine Geometrie erkannt</div>;

  const fields = [
    { label: 'Gebäudelänge', key: 'length', data: geo.length },
    { label: 'Gebäudebreite', key: 'width', data: geo.width },
    { label: 'Traufhöhe', key: 'eavesHeight', data: geo.eavesHeight },
    { label: 'Firsthöhe', key: 'ridgeHeight', data: geo.ridgeHeight },
    { label: 'Dachneigung', key: 'roofPitch', data: geo.roofPitch },
  ];

  const handleConfirm = () => {
    if (onUpdate) {
      const updatedGeo = { ...geo, userConfirmed: true, confidence: 1.0 };
      if (editing) {
        Object.entries(values).forEach(([key, val]) => {
          if (key in updatedGeo) {
            (updatedGeo as any)[key] = { ...(updatedGeo as any)[key], value: val, source: 'user' };
          }
        });
      }
      onUpdate({ geometry: updatedGeo });
    }
    setEditing(false);
    toast({ title: 'Geometrie bestätigt' });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SectionCard
        title="Gebäudegeometrie"
        subtitle="Vom Geometrie-Agent erkannte und berechnete Maße"
        headerRight={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Gesamt:</span>
            <ConfidenceBadge confidence={geo.confidence} size="md" />
            {geo.userConfirmed ? (
              <span className="status-badge-green text-[10px] px-1.5 py-0.5 rounded font-medium">
                <Check className="inline h-2.5 w-2.5 mr-0.5" />Bestätigt
              </span>
            ) : (
              <span className="status-badge-yellow text-[10px] px-1.5 py-0.5 rounded font-medium">
                <TriangleAlert className="inline h-2.5 w-2.5 mr-0.5" />Unbestätigt
              </span>
            )}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {fields.map((f) => (
            <div key={f.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{f.label}</Label>
                <div className="flex items-center gap-1.5">
                  <SourceTag source={f.data.source} />
                  <ConfidenceBadge confidence={f.data.confidence} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={editing ? (values[f.key] ?? f.data.value) : f.data.value}
                  className="input-technical"
                  readOnly={!editing}
                  type="number"
                  step="0.01"
                  onChange={(e) => setValues({ ...values, [f.key]: parseFloat(e.target.value) || 0 })}
                />
                <span className="text-xs text-muted-foreground w-8">{f.data.unit}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4 mt-4 border-t">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setEditing(false); setValues({}); }}>Abbrechen</Button>
              <Button size="sm" className="gap-1.5" onClick={handleConfirm}>
                <Save className="h-3.5 w-3.5" />Speichern & Bestätigen
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
                <Edit className="h-3.5 w-3.5" />Werte bearbeiten
              </Button>
              {!geo.userConfirmed && (
                <Button size="sm" className="gap-1.5" onClick={handleConfirm}>
                  <Check className="h-3.5 w-3.5" />Geometrie bestätigen
                </Button>
              )}
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Spannweiten & Achsen" subtitle="Erkannte Tragachsen und Spannweiten">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bezeichnung</th>
              <th>Wert</th>
              <th>Richtung</th>
              <th>Konfidenz</th>
            </tr>
          </thead>
          <tbody>
            {geo.spans.map((s) => (
              <tr key={s.id}>
                <td className="font-medium text-sm">{s.label}</td>
                <td className="value-display">{s.length} m</td>
                <td className="text-muted-foreground">{s.direction.toUpperCase()}</td>
                <td><ConfidenceBadge confidence={s.confidence} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Schnittdarstellung" subtitle="Parametriertes 2D-Modell des Dachtragwerks">
        <div className="rounded-lg border bg-card/50 p-4">
          <RoofVisualization project={project} width={700} height={350} />
        </div>
      </SectionCard>
    </div>
  );
}
