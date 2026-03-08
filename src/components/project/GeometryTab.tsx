import { useState } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ruler, Check, Edit, TriangleAlert, Save, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RoofVisualization } from './RoofVisualization';
import type { BuildingGeometry, NumberWithConfidence } from '@/types/project';

interface GeometryTabProps { project: Project; onUpdate?: (updates: Partial<Project>) => void; }

const EMPTY_NWC: NumberWithConfidence = { value: 0, unit: 'm', confidence: 0, source: 'user' };

export function GeometryTab({ project, onUpdate }: GeometryTabProps) {
  const geo = project.geometry;
  const [editing, setEditing] = useState(!geo); // start in edit mode if no geometry
  const [values, setValues] = useState<Record<string, number>>({});
  const { toast } = useToast();

  // If no geometry, show manual entry form
  const displayGeo: BuildingGeometry = geo || {
    length: { ...EMPTY_NWC }, width: { ...EMPTY_NWC },
    eavesHeight: { ...EMPTY_NWC }, ridgeHeight: { ...EMPTY_NWC },
    roofPitch: { ...EMPTY_NWC, unit: '°' },
    spans: [], axes: [], isSymmetric: true, confidence: 0, userConfirmed: false,
  };

  const fields = [
    { label: 'Gebäudelänge', key: 'length', data: displayGeo.length },
    { label: 'Gebäudebreite', key: 'width', data: displayGeo.width },
    { label: 'Traufhöhe', key: 'eavesHeight', data: displayGeo.eavesHeight },
    { label: 'Firsthöhe', key: 'ridgeHeight', data: displayGeo.ridgeHeight },
    { label: 'Dachneigung', key: 'roofPitch', data: displayGeo.roofPitch },
  ];

  const handleConfirm = () => {
    if (!onUpdate) return;
    const updatedGeo: BuildingGeometry = { ...displayGeo, userConfirmed: true, confidence: 1.0 };
    // Apply edited values
    for (const [key, val] of Object.entries(values)) {
      if (key in updatedGeo && typeof (updatedGeo as any)[key] === 'object') {
        (updatedGeo as any)[key] = { ...(updatedGeo as any)[key], value: val, source: 'user' as const };
      }
    }
    onUpdate({ geometry: updatedGeo });
    setEditing(false);
    setValues({});
    toast({ title: 'Geometrie gespeichert und bestätigt' });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {!geo && (
        <div className="rounded-lg border-2 border-[hsl(var(--status-yellow)/0.5)] bg-[hsl(var(--status-yellow-bg))] p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-yellow))] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--status-yellow))]">Keine Geometrie erkannt</p>
            <p className="text-xs text-foreground/70 mt-0.5">
              Bitte Maße aus dem Plan manuell eingeben oder KI-Analyse im Tab „Plan" starten.
            </p>
          </div>
        </div>
      )}

      <SectionCard
        title="Gebäudegeometrie"
        subtitle={geo ? 'Vom Geometrie-Agent erkannte Maße' : 'Manuelle Eingabe erforderlich'}
        headerRight={geo ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Gesamt:</span>
            <ConfidenceBadge confidence={displayGeo.confidence} size="md" />
            {displayGeo.userConfirmed ? (
              <span className="status-badge-green text-[10px] px-1.5 py-0.5 rounded font-medium">
                <Check className="inline h-2.5 w-2.5 mr-0.5" />Bestätigt
              </span>
            ) : (
              <span className="status-badge-yellow text-[10px] px-1.5 py-0.5 rounded font-medium">
                <TriangleAlert className="inline h-2.5 w-2.5 mr-0.5" />Unbestätigt
              </span>
            )}
          </div>
        ) : undefined}
      >
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {fields.map((f) => (
            <div key={f.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{f.label}</Label>
                {f.data.value > 0 && (
                  <div className="flex items-center gap-1.5">
                    <SourceTag source={f.data.source} />
                    <ConfidenceBadge confidence={f.data.confidence} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={editing ? (values[f.key] ?? f.data.value) : f.data.value}
                  className="input-technical"
                  readOnly={!editing}
                  type="number" step="0.01"
                  placeholder={f.data.value === 0 ? 'Nicht erkannt' : ''}
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
              {geo && <Button variant="outline" size="sm" onClick={() => { setEditing(false); setValues({}); }}>Abbrechen</Button>}
              <Button size="sm" className="gap-1.5" onClick={handleConfirm}>
                <Save className="h-3.5 w-3.5" />Speichern & Bestätigen
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
                <Edit className="h-3.5 w-3.5" />Werte bearbeiten
              </Button>
              {!displayGeo.userConfirmed && (
                <Button size="sm" className="gap-1.5" onClick={handleConfirm}>
                  <Check className="h-3.5 w-3.5" />Geometrie bestätigen
                </Button>
              )}
            </>
          )}
        </div>
      </SectionCard>

      {displayGeo.spans.length > 0 && (
        <SectionCard title="Spannweiten & Achsen" subtitle="Erkannte Tragachsen und Spannweiten">
          <table className="data-table">
            <thead><tr><th>Bezeichnung</th><th>Wert</th><th>Richtung</th><th>Konfidenz</th></tr></thead>
            <tbody>
              {displayGeo.spans.map((s) => (
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
      )}

      {geo && geo.width.value > 0 && (
        <SectionCard title="Schnittdarstellung" subtitle="Parametriertes 2D-Modell aus aktueller Geometrie">
          <div className="rounded-lg border bg-card/50 p-4">
            <RoofVisualization project={project} width={700} height={350} />
          </div>
        </SectionCard>
      )}
    </div>
  );
}
