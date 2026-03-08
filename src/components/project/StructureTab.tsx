import { useState } from 'react';
import type { Project, RoofFormType, StructuralSystemType, TimberMember } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { ROOF_FORM_LABELS, STRUCTURAL_SYSTEM_LABELS } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Check, Building2, ArrowRight, TriangleAlert, Plus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { RoofVisualization } from './RoofVisualization';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface StructureTabProps { project: Project; onUpdate?: (updates: Partial<Project>) => void; }

const MEMBER_TYPE_LABELS: Record<string, string> = {
  sparren: 'Sparren', pfette: 'Pfette', stuetze: 'Stütze', zange: 'Zange',
  kehlbalken: 'Kehlbalken', leimbinder: 'Leimbinder', rahm: 'Rähm',
  auswechslung: 'Auswechslung', nebentraeger: 'Nebenträger',
};

export function StructureTab({ project, onUpdate }: StructureTabProps) {
  const roof = project.roofType;
  const sys = project.structuralSystem;
  const { toast } = useToast();
  const [showAddMember, setShowAddMember] = useState(false);
  const [showSetRoof, setShowSetRoof] = useState(false);
  const [showSetSystem, setShowSetSystem] = useState(false);
  const [newMember, setNewMember] = useState<Partial<TimberMember>>({
    name: '', type: 'sparren', material: project.materials[0]?.id || '',
    width: 80, height: 200, length: 5, quantity: 1, crossSection: '80/200',
  });

  const hasGeometry = project.geometry && project.geometry.width.value > 0;

  // Allow manual setup when no roof/sys is detected
  const selectRoofForm = (form: RoofFormType) => {
    if (!onUpdate) return;
    onUpdate({
      roofType: {
        form, confidence: roof?.confidence ?? 1.0,
        alternatives: roof?.alternatives || [],
        userConfirmed: true,
      },
    });
    toast({ title: `Dachform gewählt: ${ROOF_FORM_LABELS[form]}` });
    setShowSetRoof(false);
  };

  const selectSystem = (type: StructuralSystemType) => {
    if (!onUpdate) return;
    onUpdate({
      structuralSystem: {
        type, confidence: sys?.confidence ?? 1.0,
        reasoning: sys?.reasoning || 'Manuell vom Benutzer gewählt',
        alternatives: sys?.alternatives || [],
        userConfirmed: true,
      },
    });
    toast({ title: `Tragwerk gewählt: ${STRUCTURAL_SYSTEM_LABELS[type]}` });
    setShowSetSystem(false);
  };

  const confirmRoof = () => {
    if (onUpdate && roof) { onUpdate({ roofType: { ...roof, userConfirmed: true } }); toast({ title: 'Dachform bestätigt' }); }
  };

  const confirmSystem = () => {
    if (onUpdate && sys) { onUpdate({ structuralSystem: { ...sys, userConfirmed: true } }); toast({ title: 'Tragwerk bestätigt' }); }
  };

  const handleAddMember = () => {
    if (!onUpdate || !newMember.name) return;
    const m: TimberMember = {
      ...(newMember as TimberMember),
      id: `mem-${Date.now()}`,
      crossSection: `${newMember.width}/${newMember.height}`,
      calculationStatus: 'yellow',
    };
    onUpdate({ members: [...project.members, m] });
    setShowAddMember(false);
    setNewMember({ name: '', type: 'sparren', material: project.materials[0]?.id || '', width: 80, height: 200, length: 5, quantity: 1, crossSection: '80/200' });
    toast({ title: `Bauteil „${m.name}" hinzugefügt` });
  };

  const handleDeleteMember = (id: string) => {
    if (!onUpdate) return;
    onUpdate({ members: project.members.filter(m => m.id !== id) });
    toast({ title: 'Bauteil entfernt' });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* No geometry warning */}
      {!hasGeometry && (
        <div className="rounded-lg border-2 border-[hsl(var(--status-red)/0.5)] bg-[hsl(var(--status-red-bg))] p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-red))] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--status-red))]">Keine Geometrie vorhanden</p>
            <p className="text-xs text-foreground/70 mt-0.5">Zuerst Geometrie im Plan erkennen oder manuell im Tab „Geometrie" eingeben.</p>
          </div>
        </div>
      )}

      {/* Dachform */}
      <SectionCard title="Dachform" subtitle={roof ? 'Erkannte oder gewählte Dachgeometrie' : 'Nicht erkannt – manuelle Auswahl erforderlich'}
        headerRight={!roof ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSetRoof(true)}>
            <Plus className="h-3.5 w-3.5" />Dachform wählen
          </Button>
        ) : undefined}
      >
        {roof ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(ROOF_FORM_LABELS).map(([key, label]) => (
                <div key={key} onClick={() => selectRoofForm(key as RoofFormType)}
                  className={cn('rounded-lg border-2 p-4 text-center cursor-pointer transition-all',
                    key === roof.form ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/30 hover:bg-muted/50')}>
                  <Building2 className={cn('h-8 w-8 mx-auto mb-2', key === roof.form ? 'text-primary' : 'text-muted-foreground/40')} />
                  <p className={cn('text-sm font-medium', key === roof.form ? 'text-primary' : 'text-muted-foreground')}>{label}</p>
                  {key === roof.form && <ConfidenceBadge confidence={roof.confidence} size="md" />}
                </div>
              ))}
            </div>
            {!roof.userConfirmed && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-3.5 w-3.5 text-[hsl(var(--status-yellow))]" />
                  <span className="text-xs text-muted-foreground">Dachform muss bestätigt werden</span>
                </div>
                <Button size="sm" className="gap-1.5" onClick={confirmRoof}><Check className="h-3.5 w-3.5" />Bestätigen</Button>
              </div>
            )}
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Keine Dachform erkannt. Bitte manuell wählen.
          </div>
        )}
      </SectionCard>

      {/* SVG Visualization – only when geometry exists */}
      {hasGeometry && (
        <SectionCard title="Tragwerksschema" subtitle="2D-Schnittdarstellung aus dem aktuellen Modell">
          <div className="rounded-lg border bg-card/50 p-4">
            <RoofVisualization project={project} width={700} height={380} showPositions />
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-primary rounded" /><span>Tragstruktur</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-accent" /><span>Pfetten / Auflager</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 border-t border-dashed border-primary" /><span>Stützen</span></div>
          </div>
        </SectionCard>
      )}

      {/* Tragwerkssystem */}
      <SectionCard title="Tragwerkssystem" subtitle={sys ? 'Vorgeschlagene oder gewählte Dachkonstruktion' : 'Nicht festgelegt – manuelle Auswahl erforderlich'}
        headerRight={!sys ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSetSystem(true)}>
            <Plus className="h-3.5 w-3.5" />Tragwerk wählen
          </Button>
        ) : undefined}
      >
        {sys ? (
          <div className="space-y-4">
            <div className={cn('rounded-lg border-2 p-5',
              sys.userConfirmed ? 'border-[hsl(var(--status-green))] bg-[hsl(var(--status-green-bg)/0.3)]' : 'border-primary bg-primary/5')}>
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

            {sys.alternatives.length > 0 && (
              <>
                <h4 className="section-header">Alternativen</h4>
                <div className="space-y-2">
                  {sys.alternatives.map((alt, i) => (
                    <div key={i} onClick={() => selectSystem(alt.type)}
                      className="rounded-lg border p-4 hover:bg-muted/20 cursor-pointer transition-all">
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
              </>
            )}

            {!sys.userConfirmed && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" className="gap-1.5" onClick={confirmSystem}><Check className="h-3.5 w-3.5" />Tragwerk bestätigen</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Kein Tragwerkssystem festgelegt. Bitte manuell wählen.
          </div>
        )}
      </SectionCard>

      {/* Members with volume */}
      <SectionCard title="Bauteile" subtitle="Tragwerksbauteile mit Mengenansatz"
        headerRight={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddMember(true)}>
            <Plus className="h-3.5 w-3.5" />Bauteil hinzufügen
          </Button>
        }>
        {project.members.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Keine Bauteile definiert. Fügen Sie Sparren, Pfetten und Stützen hinzu.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Pos.</th><th>Bauteil</th><th>Typ</th><th>Querschnitt</th><th>Länge</th><th>Anz.</th><th>Volumen</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {project.members.map((m, idx) => {
                const prefix = { sparren: 'SP', pfette: 'PF', stuetze: 'ST', zange: 'ZA', kehlbalken: 'KB', leimbinder: 'LB', rahm: 'RH', auswechslung: 'AW', nebentraeger: 'NT' }[m.type] || 'XX';
                const vol = (m.width / 1000) * (m.height / 1000) * m.length * m.quantity;
                return (
                  <tr key={m.id}>
                    <td className="font-mono text-xs font-bold text-primary">{prefix}-{String(idx + 1).padStart(2, '0')}</td>
                    <td className="font-medium text-sm">{m.name}</td>
                    <td className="text-xs text-muted-foreground">{MEMBER_TYPE_LABELS[m.type] || m.type}</td>
                    <td className="value-display">{m.crossSection} mm</td>
                    <td className="value-display">{m.length} m</td>
                    <td className="value-display">{m.quantity}</td>
                    <td className="value-display">{vol.toFixed(3)} m³</td>
                    <td><StatusIndicator status={m.calculationStatus} /></td>
                    <td>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteMember(m.id)}>
                        <span className="text-xs">✕</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30">
                <td colSpan={6} className="text-right text-xs font-semibold text-muted-foreground">Gesamtvolumen (Holz)</td>
                <td className="value-display font-bold">
                  {project.members.reduce((s, m) => s + (m.width / 1000) * (m.height / 1000) * m.length * m.quantity, 0).toFixed(3)} m³
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Add member dialog */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neues Bauteil anlegen</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Bezeichnung</Label>
                <Input value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} placeholder="z.B. Sparren" className="mt-1" /></div>
              <div><Label className="text-xs">Typ</Label>
                <Select value={newMember.type} onValueChange={(v) => setNewMember({ ...newMember, type: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MEMBER_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><Label className="text-xs">Breite (mm)</Label>
                <Input type="number" value={newMember.width} className="mt-1 font-mono"
                  onChange={(e) => setNewMember({ ...newMember, width: parseInt(e.target.value) || 0 })} /></div>
              <div><Label className="text-xs">Höhe (mm)</Label>
                <Input type="number" value={newMember.height} className="mt-1 font-mono"
                  onChange={(e) => setNewMember({ ...newMember, height: parseInt(e.target.value) || 0 })} /></div>
              <div><Label className="text-xs">Länge (m)</Label>
                <Input type="number" step="0.01" value={newMember.length} className="mt-1 font-mono"
                  onChange={(e) => setNewMember({ ...newMember, length: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label className="text-xs">Anzahl</Label>
                <Input type="number" value={newMember.quantity} className="mt-1 font-mono"
                  onChange={(e) => setNewMember({ ...newMember, quantity: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div><Label className="text-xs">Material</Label>
              <Select value={newMember.material} onValueChange={(v) => setNewMember({ ...newMember, material: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {project.materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMember(false)}>Abbrechen</Button>
            <Button onClick={handleAddMember} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set roof form dialog */}
      <Dialog open={showSetRoof} onOpenChange={setShowSetRoof}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dachform wählen</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(ROOF_FORM_LABELS).map(([key, label]) => (
              <Button key={key} variant="outline" className="h-auto py-4 flex-col gap-2"
                onClick={() => selectRoofForm(key as RoofFormType)}>
                <Building2 className="h-6 w-6" />
                <span>{label}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Set system dialog */}
      <Dialog open={showSetSystem} onOpenChange={setShowSetSystem}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tragwerkssystem wählen</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {Object.entries(STRUCTURAL_SYSTEM_LABELS).map(([key, label]) => (
              <Button key={key} variant="outline" className="w-full justify-start"
                onClick={() => selectSystem(key as StructuralSystemType)}>
                {label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
