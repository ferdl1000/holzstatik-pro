import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TreePine, Edit, Plus } from 'lucide-react';

interface MaterialsTabProps { project: Project; }

export function MaterialsTab({ project }: MaterialsTabProps) {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Material profiles */}
      <SectionCard title="Materialien" subtitle="Material-Agent – Holz- und Materialparameter">
        <div className="grid grid-cols-3 gap-4">
          {project.materials.map((mat) => (
            <div key={mat.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TreePine className="h-4 w-4 text-agent-material" />
                  <h4 className="text-sm font-semibold">{mat.name}</h4>
                </div>
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{mat.type}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">FK:</span> <span className="font-mono font-medium">{mat.strengthClass}</span></div>
                <div><span className="text-muted-foreground">ρ:</span> <span className="font-mono font-medium">{mat.density} kg/m³</span></div>
                <div><span className="text-muted-foreground">f<sub>m,k</sub>:</span> <span className="font-mono font-medium">{mat.bendingStrength} N/mm²</span></div>
                <div><span className="text-muted-foreground">E:</span> <span className="font-mono font-medium">{mat.elasticModulus} N/mm²</span></div>
                <div><span className="text-muted-foreground">f<sub>v,k</sub>:</span> <span className="font-mono font-medium">{mat.shearStrength} N/mm²</span></div>
                <div><span className="text-muted-foreground">f<sub>c,k</sub>:</span> <span className="font-mono font-medium">{mat.compressionStrength} N/mm²</span></div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-4 mt-4 border-t">
          <Button variant="outline" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Material hinzufügen</Button>
        </div>
      </SectionCard>

      {/* Members with materials */}
      <SectionCard title="Bauteile & Querschnitte" subtitle="Zuordnung von Material und Querschnitt je Bauteil">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bauteil</th>
              <th>Typ</th>
              <th>Material</th>
              <th>Querschnitt b/h</th>
              <th>Länge</th>
              <th>Anzahl</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {project.members.map((mem) => {
              const mat = project.materials.find(m => m.id === mem.material);
              return (
                <tr key={mem.id}>
                  <td className="font-medium text-sm">{mem.name}</td>
                  <td className="text-xs text-muted-foreground capitalize">{mem.type}</td>
                  <td className="text-xs">{mat?.name || '-'}</td>
                  <td className="value-display">{mem.crossSection} mm</td>
                  <td className="value-display">{mem.length} m</td>
                  <td className="value-display">{mem.quantity}</td>
                  <td><StatusIndicator status={mem.calculationStatus} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
