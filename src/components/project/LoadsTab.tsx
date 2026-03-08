import { useState } from 'react';
import type { Project, LoadCase } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit, Save, Snowflake, Wind, Weight, ArrowDown, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LoadsTabProps { project: Project; onUpdate?: (updates: Partial<Project>) => void; }

const LOAD_ICONS: Record<string, typeof Snowflake> = {
  snow: Snowflake,
  wind: Wind,
  permanent: ArrowDown,
  variable: Weight,
  maintenance: Weight,
};

export function LoadsTab({ project, onUpdate }: LoadsTabProps) {
  const [editing, setEditing] = useState(false);
  const [editedLoads, setEditedLoads] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const handleSave = () => {
    if (onUpdate) {
      const updated = project.loadCases.map(lc => ({
        ...lc,
        value: editedLoads[lc.id] ?? lc.value,
        userModified: editedLoads[lc.id] !== undefined,
      }));
      onUpdate({ loadCases: updated });
    }
    setEditing(false);
    toast({ title: 'Lasten gespeichert' });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SectionCard title="Standortbezogene Lastannahmen" subtitle="Lasten-Agent Österreich – basierend auf ÖNORM / Eurocode">
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="rounded-md bg-muted/50 p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Adresse</span>
            <p className="text-sm font-medium mt-0.5">{project.address?.city || '-'}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Seehöhe</span>
            <p className="text-sm font-mono font-medium mt-0.5">{project.address?.elevation || '-'} m</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Geländekat.</span>
            <p className="text-sm font-mono font-medium mt-0.5">{project.address?.terrainCategory || '-'}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Schneelastzone</span>
            <p className="text-sm font-mono font-medium mt-0.5">{(project.loadCases.find(l => l.type === 'snow')?.parameters.zone as string) || '-'}</p>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Lastfall</th>
              <th>Typ</th>
              <th>Wert</th>
              <th>Quelle / Norm</th>
              <th>Konfidenz</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {project.loadCases.map((lc) => {
              const Icon = LOAD_ICONS[lc.type] || Weight;
              return (
                <tr key={lc.id}>
                  <td className="font-medium text-sm">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {lc.name}
                    </div>
                  </td>
                  <td className="text-xs text-muted-foreground capitalize">{lc.type}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={editing ? (editedLoads[lc.id] ?? lc.value) : lc.value}
                        className="input-technical w-20 h-7 text-xs"
                        readOnly={!editing}
                        type="number"
                        step="0.01"
                        onChange={(e) => setEditedLoads({ ...editedLoads, [lc.id]: parseFloat(e.target.value) || 0 })}
                      />
                      <span className="text-xs text-muted-foreground">{lc.unit}</span>
                    </div>
                  </td>
                  <td className="text-xs text-muted-foreground max-w-[200px] truncate">{lc.source}</td>
                  <td><ConfidenceBadge confidence={lc.confidence} /></td>
                  <td>
                    {lc.userModified ? (
                      <SourceTag source="user" />
                    ) : (
                      <SourceTag source="extracted" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex gap-2 pt-4 mt-4 border-t">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setEditing(false); setEditedLoads({}); }}>Abbrechen</Button>
              <Button size="sm" className="gap-1.5" onClick={handleSave}>
                <Save className="h-3.5 w-3.5" />Lasten speichern
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
                <Edit className="h-3.5 w-3.5" />Lasten bearbeiten
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => toast({ title: 'Lasten bestätigt' })}>
                <Check className="h-3.5 w-3.5" />Lasten bestätigen
              </Button>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
