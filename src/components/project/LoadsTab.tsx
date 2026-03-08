import { useState } from 'react';
import type { Project, LoadCase } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, Save, Snowflake, Wind, Weight, ArrowDown, Check, Calculator, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { calculateSnowLoad, calculateWindPressure } from '@/lib/calculations';

interface LoadsTabProps { project: Project; onUpdate?: (updates: Partial<Project>) => void; }

const LOAD_ICONS: Record<string, typeof Snowflake> = {
  snow: Snowflake,
  wind: Wind,
  permanent: ArrowDown,
  variable: Weight,
  maintenance: Weight,
};

const SNOW_ZONES = ['1', '2', '3', '4'];
const WIND_ZONES = ['1', '2', '3'];
const TERRAIN_CATEGORIES = ['I', 'II', 'III', 'IV'];

export function LoadsTab({ project, onUpdate }: LoadsTabProps) {
  const [editing, setEditing] = useState(false);
  const [editedLoads, setEditedLoads] = useState<Record<string, number>>({});
  const [snowZone, setSnowZone] = useState(
    (project.loadCases.find(l => l.type === 'snow')?.parameters.zone as string) || '2'
  );
  const [windZone, setWindZone] = useState(
    (project.loadCases.find(l => l.type === 'wind')?.parameters.zone as string) || '2'
  );
  const [terrainCat, setTerrainCat] = useState(project.address?.terrainCategory || 'III');
  const { toast } = useToast();

  const handleRecalculateLoads = () => {
    if (!onUpdate) return;
    const altitude = project.address?.elevation || 400;
    const roofPitch = project.geometry?.roofPitch?.value || 35;
    const eavesH = project.geometry?.eavesHeight?.value || 6;

    const snow = calculateSnowLoad(snowZone, altitude, roofPitch);
    const wind = calculateWindPressure(windZone, terrainCat, eavesH);

    const updated = project.loadCases.map(lc => {
      if (lc.type === 'snow') {
        return {
          ...lc,
          value: snow.si,
          source: `ÖNORM B 1991-1-3, Zone ${snowZone}, H=${altitude}m, μ=${snow.mu}, sk=${snow.sk} kN/m²`,
          confidence: 0.85,
          parameters: { ...lc.parameters, zone: snowZone, altitude, sk: snow.sk, mu: snow.mu },
        };
      }
      if (lc.type === 'wind') {
        return {
          ...lc,
          value: wind.qp,
          source: `ÖNORM B 1991-1-4, Zone ${windZone}, Geländekat. ${terrainCat}, vb0=${wind.vb0} m/s`,
          confidence: 0.80,
          parameters: { ...lc.parameters, zone: windZone, terrainCategory: terrainCat, vb0: wind.vb0 },
        };
      }
      return lc;
    });

    onUpdate({ loadCases: updated });
    toast({ title: 'Lasten neu berechnet', description: `Schnee: ${snow.si} kN/m², Wind: ${wind.qp} kN/m²` });
  };

  const handleSave = () => {
    if (onUpdate) {
      const updated = project.loadCases.map(lc => ({
        ...lc,
        value: editedLoads[lc.id] ?? lc.value,
        userModified: editedLoads[lc.id] !== undefined ? true : lc.userModified,
      }));
      onUpdate({ loadCases: updated });
    }
    setEditing(false);
    setEditedLoads({});
    toast({ title: 'Lasten gespeichert' });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Austrian load parameters */}
      <SectionCard title="Standortparameter Österreich" subtitle="Grundlagen für die Lastermittlung nach ÖNORM / Eurocode">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-muted/50 p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Adresse</span>
                <p className="text-sm font-medium mt-0.5">
                  {project.address?.street} {project.address?.houseNumber}, {project.address?.postalCode} {project.address?.city}
                </p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Seehöhe</span>
                <p className="text-sm font-mono font-medium mt-0.5">{project.address?.elevation || '-'} m ü.A.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Schneelastzone</Label>
                <Select value={snowZone} onValueChange={setSnowZone}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SNOW_ZONES.map(z => (
                      <SelectItem key={z} value={z}>Zone {z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Windlastzone</Label>
                <Select value={windZone} onValueChange={setWindZone}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WIND_ZONES.map(z => (
                      <SelectItem key={z} value={z}>Zone {z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Geländekategorie</Label>
                <Select value={terrainCat} onValueChange={setTerrainCat}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TERRAIN_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>Kat. {c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRecalculateLoads}>
              <RefreshCw className="h-3.5 w-3.5" />Lasten neu berechnen
            </Button>
          </div>

          <div className="space-y-3">
            <h4 className="section-header">Berechnungsgrundlagen</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between rounded-md bg-muted/30 p-2">
                <span className="text-muted-foreground">Schneelast (ÖNORM B 1991-1-3)</span>
                <span className="font-mono font-medium">
                  {project.loadCases.find(l => l.type === 'snow')?.value || '-'} kN/m²
                </span>
              </div>
              <div className="flex justify-between rounded-md bg-muted/30 p-2">
                <span className="text-muted-foreground">Windlast (ÖNORM B 1991-1-4)</span>
                <span className="font-mono font-medium">
                  {project.loadCases.find(l => l.type === 'wind')?.value || '-'} kN/m²
                </span>
              </div>
              <div className="flex justify-between rounded-md bg-muted/30 p-2">
                <span className="text-muted-foreground">Dachneigung</span>
                <span className="font-mono font-medium">
                  {project.geometry?.roofPitch?.value || '-'}°
                </span>
              </div>
              <div className="flex justify-between rounded-md bg-muted/30 p-2">
                <span className="text-muted-foreground">Gebäudehöhe (Traufe)</span>
                <span className="font-mono font-medium">
                  {project.geometry?.eavesHeight?.value || '-'} m
                </span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Lastfälle" subtitle="Alle angesetzten Lasten – editierbar">
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
                  <td className="text-xs text-muted-foreground max-w-[250px]">
                    <span className="line-clamp-2">{lc.source}</span>
                  </td>
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
                <Edit className="h-3.5 w-3.5" />Werte manuell bearbeiten
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => {
                if (onUpdate) {
                  onUpdate({ loadCases: project.loadCases.map(lc => ({ ...lc, userModified: true })) });
                }
                toast({ title: 'Alle Lasten bestätigt' });
              }}>
                <Check className="h-3.5 w-3.5" />Alle Lasten bestätigen
              </Button>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
