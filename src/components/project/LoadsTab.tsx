import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit, Save, Snowflake, Wind, Weight, ArrowDown } from 'lucide-react';

interface LoadsTabProps { project: Project; }

const LOAD_ICONS: Record<string, typeof Snowflake> = {
  snow: Snowflake,
  wind: Wind,
  permanent: ArrowDown,
  variable: Weight,
  maintenance: Weight,
};

export function LoadsTab({ project }: LoadsTabProps) {
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
                      <Input value={lc.value} className="input-technical w-20 h-7 text-xs" readOnly />
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
          <Button variant="outline" size="sm" className="gap-1.5"><Edit className="h-3.5 w-3.5" />Lasten bearbeiten</Button>
          <Button size="sm" className="gap-1.5"><Save className="h-3.5 w-3.5" />Lasten bestätigen</Button>
        </div>
      </SectionCard>
    </div>
  );
}
