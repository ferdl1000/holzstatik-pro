import { useState } from 'react';
import type { Project, MaterialProfile, TimberMember } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { TreePine, Edit, Plus, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MaterialsTabProps { project: Project; onUpdate?: (updates: Partial<Project>) => void; }

export function MaterialsTab({ project, onUpdate }: MaterialsTabProps) {
  const [editingMember, setEditingMember] = useState<TimberMember | null>(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [newMat, setNewMat] = useState<Partial<MaterialProfile>>({
    name: '', type: 'kvh', strengthClass: 'C24', density: 420,
    bendingStrength: 24, tensionStrength: 14, compressionStrength: 21,
    shearStrength: 4.0, elasticModulus: 11000,
  });
  const { toast } = useToast();

  const handleSaveMember = () => {
    if (!editingMember || !onUpdate) return;
    const updated = project.members.map(m => m.id === editingMember.id ? editingMember : m);
    onUpdate({ members: updated });
    setEditingMember(null);
    toast({ title: 'Bauteil aktualisiert' });
  };

  const handleAddMaterial = () => {
    if (!onUpdate || !newMat.name) return;
    const mat: MaterialProfile = {
      ...newMat as MaterialProfile,
      id: `mat-${Date.now()}`,
    };
    onUpdate({ materials: [...project.materials, mat] });
    setShowAddMaterial(false);
    toast({ title: 'Material hinzugefügt' });
  };

  const handleDeleteMaterial = (id: string) => {
    if (!onUpdate) return;
    onUpdate({ materials: project.materials.filter(m => m.id !== id) });
    toast({ title: 'Material entfernt' });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SectionCard title="Materialien" subtitle="Material-Agent – Holz- und Materialparameter">
        <div className="grid grid-cols-3 gap-4">
          {project.materials.map((mat) => (
            <div key={mat.id} className="rounded-lg border p-4 space-y-3 group relative">
              <button
                onClick={() => handleDeleteMaterial(mat.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
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
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddMaterial(true)}>
            <Plus className="h-3.5 w-3.5" />Material hinzufügen
          </Button>
        </div>
      </SectionCard>

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
              <th></th>
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
                  <td>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingMember({ ...mem })}>
                      <Edit className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      {/* Edit member dialog */}
      <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bauteil bearbeiten: {editingMember?.name}</DialogTitle>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Breite (mm)</Label>
                  <Input type="number" value={editingMember.width} className="input-technical mt-1"
                    onChange={(e) => setEditingMember({ ...editingMember, width: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs">Höhe (mm)</Label>
                  <Input type="number" value={editingMember.height} className="input-technical mt-1"
                    onChange={(e) => setEditingMember({ ...editingMember, height: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Länge (m)</Label>
                  <Input type="number" step="0.01" value={editingMember.length} className="input-technical mt-1"
                    onChange={(e) => setEditingMember({ ...editingMember, length: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs">Anzahl</Label>
                  <Input type="number" value={editingMember.quantity} className="input-technical mt-1"
                    onChange={(e) => setEditingMember({ ...editingMember, quantity: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Material</Label>
                <Select value={editingMember.material} onValueChange={(v) => setEditingMember({ ...editingMember, material: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {project.materials.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>Abbrechen</Button>
            <Button onClick={handleSaveMember} className="gap-1.5"><Save className="h-3.5 w-3.5" />Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add material dialog */}
      <Dialog open={showAddMaterial} onOpenChange={setShowAddMaterial}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={newMat.name} onChange={(e) => setNewMat({ ...newMat, name: e.target.value })} placeholder="z.B. BSH GL28c" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Typ</Label>
              <Select value={newMat.type} onValueChange={(v) => setNewMat({ ...newMat, type: v as any })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kvh">KVH</SelectItem>
                  <SelectItem value="schnittholz">Schnittholz</SelectItem>
                  <SelectItem value="brettschichtholz">Brettschichtholz</SelectItem>
                  <SelectItem value="other">Andere</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Festigkeitsklasse</Label>
                <Input value={newMat.strengthClass} onChange={(e) => setNewMat({ ...newMat, strengthClass: e.target.value })} className="mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs">E-Modul (N/mm²)</Label>
                <Input type="number" value={newMat.elasticModulus} onChange={(e) => setNewMat({ ...newMat, elasticModulus: parseInt(e.target.value) || 0 })} className="mt-1 font-mono" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMaterial(false)}>Abbrechen</Button>
            <Button onClick={handleAddMaterial} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
