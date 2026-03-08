import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ruler, Check, Edit, TriangleAlert } from 'lucide-react';

interface GeometryTabProps { project: Project; }

export function GeometryTab({ project }: GeometryTabProps) {
  const geo = project.geometry;
  if (!geo) return <div className="p-6 text-center text-muted-foreground">Keine Geometrie erkannt</div>;

  const fields = [
    { label: 'Gebäudelänge', data: geo.length },
    { label: 'Gebäudebreite', data: geo.width },
    { label: 'Traufhöhe', data: geo.eavesHeight },
    { label: 'Firsthöhe', data: geo.ridgeHeight },
    { label: 'Dachneigung', data: geo.roofPitch },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SectionCard
        title="Gebäudegeometrie"
        subtitle="Vom Geometrie-Agent erkannte und berechnete Maße"
        headerRight={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Gesamt:</span>
            <ConfidenceBadge confidence={geo.confidence} size="md" />
            {!geo.userConfirmed && (
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
                <Input value={f.data.value} className="input-technical" readOnly />
                <span className="text-xs text-muted-foreground w-8">{f.data.unit}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4 mt-4 border-t">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Edit className="h-3.5 w-3.5" />
            Werte bearbeiten
          </Button>
          <Button size="sm" className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Geometrie bestätigen
          </Button>
        </div>
      </SectionCard>

      {/* Spans */}
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

      {/* 2D Model Placeholder */}
      <SectionCard title="Geometriemodell" subtitle="Parametriertes 2D-Modell des Gebäudes">
        <div className="aspect-[2/1] rounded-lg border-2 border-dashed bg-muted/10 flex items-center justify-center">
          <div className="text-center space-y-1.5">
            <Ruler className="h-10 w-10 text-muted-foreground/30 mx-auto" />
            <p className="text-xs text-muted-foreground">2D-Schnittdarstellung mit Maßketten</p>
            <p className="text-[10px] text-muted-foreground/60">{geo.isSymmetric ? 'Symmetrisch' : 'Asymmetrisch'}</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
