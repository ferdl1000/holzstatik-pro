import { useState } from 'react';
import type { Project, LoadCase } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, Save, Snowflake, Wind, Weight, ArrowDown, Check, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { calculateSnowLoad, calculateWindPressure } from '@/lib/calculations';

interface LoadsTabProps { project: Project; onUpdate?: (updates: Partial<Project>) => void; }

const LOAD_ICONS: Record<string, typeof Snowflake> = {
  snow: Snowflake, wind: Wind, permanent: ArrowDown, variable: Weight, maintenance: Weight,
};

const SNOW_ZONES = ['1', '2', '3', '4'];
const WIND_ZONES = ['1', '2', '3'];
const TERRAIN_CATEGORIES = ['I', 'II', 'III', 'IV'];

export function LoadsTab({ project, onUpdate }: LoadsTabProps) {
  const [editing, setEditing] = useState(false);
  const [editedLoads, setEditedLoads] = useState<Record<string, number>>({});
  const [snowZone, setSnowZone] = useState(
    (project.loadCases.find(l => l.type === 'snow')?.parameters.zone as string) || ''
  );
  const [windZone, setWindZone] = useState(
    (project.loadCases.find(l => l.type === 'wind')?.parameters.zone as string) || ''
  );
  const [terrainCat, setTerrainCat] = useState(project.address?.terrainCategory || '');
  const [altitude, setAltitude] = useState<string>(
    project.address?.elevation?.toString() || ''
  );
  const { toast } = useToast();

  const addressConfirmed = project.address?.source === 'user_confirmed' || project.address?.source === 'user_entered';
  const hasGeometry = project.geometry && project.geometry.roofPitch.value > 0 && project.geometry.eavesHeight.value > 0;

  // BLOCKER: Cannot calculate without address & geometry
  const blockers: string[] = [];
  if (!project.address) blockers.push('Keine Bauadresse vorhanden');
  else if (!addressConfirmed) blockers.push('Bauadresse noch nicht bestätigt');
  if (!hasGeometry) blockers.push('Gebäudegeometrie fehlt oder unvollständig');
  if (!snowZone) blockers.push('Schneelastzone nicht gewählt');
  if (!windZone) blockers.push('Windlastzone nicht gewählt');
  if (!terrainCat) blockers.push('Geländekategorie nicht gewählt');
  if (!altitude || parseFloat(altitude) <= 0) blockers.push('Seehöhe nicht eingegeben');

  const handleRecalculateLoads = () => {
    if (!onUpdate || blockers.length > 0) return;

    const alt = parseFloat(altitude) || 0;
    const roofPitch = project.geometry!.roofPitch.value;
    const eavesH = project.geometry!.eavesHeight.value;

    const snow = calculateSnowLoad(snowZone, alt, roofPitch);
    const wind = calculateWindPressure(windZone, terrainCat, eavesH);

    if (!snow) {
      toast({ title: 'Fehler', description: 'Schneelastberechnung fehlgeschlagen – Zone ungültig.', variant: 'destructive' });
      return;
    }
    if (!wind) {
      toast({ title: 'Fehler', description: 'Windlastberechnung fehlgeschlagen – Zone/Geländekat. ungültig.', variant: 'destructive' });
      return;
    }

    // Build load cases from scratch (no pre-seeded values)
    const newLoadCases: LoadCase[] = [
      {
        id: 'lc-eg', name: 'Eigengewicht Dachaufbau', type: 'permanent', value: 0.85, unit: 'kN/m²',
        source: 'Manuelle Eingabe erforderlich – Standardannahme Ziegeldeckung + Lattung',
        confidence: 0.50, isEditable: true, userModified: false, parameters: {},
      },
      {
        id: 'lc-snow', name: 'Schneelast', type: 'snow', value: snow.si, unit: 'kN/m²',
        source: `ÖNORM B 1991-1-3, Zone ${snowZone}, H=${alt}m, μ=${snow.mu}, sk=${snow.sk} kN/m²`,
        confidence: 0.85, isEditable: true, userModified: false,
        parameters: { zone: snowZone, altitude: alt, sk: snow.sk, mu: snow.mu },
      },
      {
        id: 'lc-wind', name: 'Windlast (Druck)', type: 'wind', value: wind.qp, unit: 'kN/m²',
        source: `ÖNORM B 1991-1-4, Zone ${windZone}, Geländekat. ${terrainCat}, vb0=${wind.vb0} m/s`,
        confidence: 0.80, isEditable: true, userModified: false,
        parameters: { zone: windZone, terrainCategory: terrainCat, vb0: wind.vb0 },
      },
      {
        id: 'lc-nutz', name: 'Nutzlast (nicht begehbar)', type: 'variable', value: 0.50, unit: 'kN/m²',
        source: 'ÖNORM B 1991-1-1, Kat. H', confidence: 0.95, isEditable: true, userModified: false, parameters: {},
      },
    ];

    onUpdate({ loadCases: newLoadCases });
    toast({ title: 'Lasten berechnet', description: `Schnee: ${snow.si} kN/m², Wind: ${wind.qp} kN/m²` });
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
      {/* Blockers banner */}
      {blockers.length > 0 && (
        <div className="rounded-lg border-2 border-[hsl(var(--status-red)/0.5)] bg-[hsl(var(--status-red-bg))] p-4">
          <p className="text-sm font-semibold text-[hsl(var(--status-red))] flex items-center gap-2 mb-2">
            <ShieldAlert className="h-4 w-4" />Lastermittlung blockiert
          </p>
          <ul className="text-xs text-foreground/80 space-y-1">
            {blockers.map((b, i) => <li key={i}>• {b}</li>)}
          </ul>
        </div>
      )}

      {/* Austrian load parameters */}
      <SectionCard title="Standortparameter Österreich" subtitle="Grundlagen für die Lastermittlung nach ÖNORM / Eurocode">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bauadresse</span>
              {project.address ? (
                <p className="text-sm font-medium mt-0.5">
                  {project.address.street} {project.address.houseNumber}, {project.address.postalCode} {project.address.city}
                  {!addressConfirmed && <span className="text-[hsl(var(--status-yellow))] text-xs ml-2">(unbestätigt)</span>}
                </p>
              ) : (
                <p className="text-sm text-[hsl(var(--status-red))] mt-0.5">Nicht erkannt – Manuelle Eingabe erforderlich</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Seehöhe (m ü.A.)</Label>
              <Input type="number" value={altitude} className="h-8 text-xs font-mono"
                onChange={(e) => setAltitude(e.target.value)} placeholder="z.B. 450" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Schneelastzone</Label>
                <Select value={snowZone} onValueChange={setSnowZone}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue placeholder="Wählen" /></SelectTrigger>
                  <SelectContent>{SNOW_ZONES.map(z => <SelectItem key={z} value={z}>Zone {z}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Windlastzone</Label>
                <Select value={windZone} onValueChange={setWindZone}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue placeholder="Wählen" /></SelectTrigger>
                  <SelectContent>{WIND_ZONES.map(z => <SelectItem key={z} value={z}>Zone {z}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Geländekategorie</Label>
                <Select value={terrainCat} onValueChange={setTerrainCat}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue placeholder="Wählen" /></SelectTrigger>
                  <SelectContent>{TERRAIN_CATEGORIES.map(c => <SelectItem key={c} value={c}>Kat. {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <Button size="sm" className="gap-1.5" onClick={handleRecalculateLoads}
              disabled={blockers.length > 0}>
              <RefreshCw className="h-3.5 w-3.5" />Lasten berechnen
            </Button>
          </div>

          <div className="space-y-3">
            <h4 className="section-header">Berechnungsgrundlagen</h4>
            <div className="space-y-2 text-xs">
              {project.loadCases.length > 0 ? (
                <>
                  <div className="flex justify-between rounded-md bg-muted/30 p-2">
                    <span className="text-muted-foreground">Schneelast</span>
                    <span className="font-mono font-medium">{project.loadCases.find(l => l.type === 'snow')?.value || '–'} kN/m²</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-muted/30 p-2">
                    <span className="text-muted-foreground">Windlast</span>
                    <span className="font-mono font-medium">{project.loadCases.find(l => l.type === 'wind')?.value || '–'} kN/m²</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-muted/30 p-2">
                    <span className="text-muted-foreground">Dachneigung</span>
                    <span className="font-mono font-medium">{project.geometry?.roofPitch?.value || '–'}°</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-muted/30 p-2">
                    <span className="text-muted-foreground">Gebäudehöhe (Traufe)</span>
                    <span className="font-mono font-medium">{project.geometry?.eavesHeight?.value || '–'} m</span>
                  </div>
                </>
              ) : (
                <div className="rounded-md bg-muted/20 p-4 text-center text-muted-foreground">
                  <p>Noch keine Lasten berechnet</p>
                  <p className="text-[10px] mt-1">Parameter oben ausfüllen und „Lasten berechnen" klicken.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {project.loadCases.length > 0 && (
        <SectionCard title="Lastfälle" subtitle="Alle angesetzten Lasten – editierbar">
          <table className="data-table">
            <thead>
              <tr><th>Lastfall</th><th>Typ</th><th>Wert</th><th>Quelle / Norm</th><th>Konfidenz</th><th>Status</th></tr>
            </thead>
            <tbody>
              {project.loadCases.map((lc) => {
                const Icon = LOAD_ICONS[lc.type] || Weight;
                return (
                  <tr key={lc.id}>
                    <td className="font-medium text-sm">
                      <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{lc.name}</div>
                    </td>
                    <td className="text-xs text-muted-foreground capitalize">{lc.type}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editing ? (editedLoads[lc.id] ?? lc.value) : lc.value}
                          className="input-technical w-20 h-7 text-xs" readOnly={!editing} type="number" step="0.01"
                          onChange={(e) => setEditedLoads({ ...editedLoads, [lc.id]: parseFloat(e.target.value) || 0 })}
                        />
                        <span className="text-xs text-muted-foreground">{lc.unit}</span>
                      </div>
                    </td>
                    <td className="text-xs text-muted-foreground max-w-[250px]"><span className="line-clamp-2">{lc.source}</span></td>
                    <td><ConfidenceBadge confidence={lc.confidence} /></td>
                    <td>{lc.userModified ? <SourceTag source="user" /> : <SourceTag source="calculated" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex gap-2 pt-4 mt-4 border-t">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => { setEditing(false); setEditedLoads({}); }}>Abbrechen</Button>
                <Button size="sm" className="gap-1.5" onClick={handleSave}><Save className="h-3.5 w-3.5" />Lasten speichern</Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
                  <Edit className="h-3.5 w-3.5" />Werte manuell bearbeiten
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => {
                  if (onUpdate) onUpdate({ loadCases: project.loadCases.map(lc => ({ ...lc, userModified: true })) });
                  toast({ title: 'Alle Lasten bestätigt' });
                }}>
                  <Check className="h-3.5 w-3.5" />Alle Lasten bestätigen
                </Button>
              </>
            )}
          </div>

          {/* Eigengewicht-Warnung */}
          {project.loadCases.some(lc => lc.type === 'permanent' && lc.confidence < 0.7) && (
            <div className="rounded-md border border-[hsl(var(--status-yellow)/0.3)] bg-[hsl(var(--status-yellow-bg))] p-3 mt-4 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--status-yellow))] shrink-0 mt-0.5" />
              <p className="text-xs">
                <strong>Eigengewicht:</strong> Der Standardwert 0,85 kN/m² basiert auf einer typischen Ziegeldeckung.
                Bitte prüfen und ggf. an den tatsächlichen Dachaufbau anpassen.
              </p>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
