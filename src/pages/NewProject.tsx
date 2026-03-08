import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, ArrowRight, FileText, X, Loader2 } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const NewProject = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { createProject } = useProjects();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf' && f.size <= 20 * 1024 * 1024) {
      setFile(f);
    } else {
      toast({ title: 'Ungültige Datei', description: 'Bitte eine PDF-Datei (max. 20 MB) wählen.', variant: 'destructive' });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') {
      setFile(f);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Name erforderlich', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const projectId = await createProject(name.trim(), description.trim());
    if (projectId && file && user) {
      const path = `${user.id}/${projectId}/${file.name}`;
      const { error: uploadError } = await supabase.storage.from('plan-documents').upload(path, file);
      if (!uploadError) {
        await supabase.from('documents').insert({
          project_id: projectId,
          user_id: user.id,
          file_name: file.name,
          file_path: path,
          file_type: file.type,
          file_size: file.size,
          status: 'uploaded',
        });
      }
    }
    if (projectId) {
      toast({ title: 'Projekt angelegt' });
      navigate(`/project/${projectId}?tab=plan`);
    } else {
      toast({ title: 'Fehler beim Anlegen', variant: 'destructive' });
    }
    setCreating(false);
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Neues Projekt</h1>
          <p className="text-sm text-muted-foreground mt-1">Dachtragwerk-Vorbemessung aus Einreichplan</p>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-5">
          <div className="space-y-2">
            <Label>Projektname *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. EFH Sonnberg - Dachstuhl" />
          </div>

          <div className="space-y-2">
            <Label>Bauvorhaben / Beschreibung</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kurzbeschreibung des Bauvorhabens" rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Einreichplan (PDF)</Label>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/30">
                <FileText className="h-8 w-8 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg bg-muted/20 hover:bg-muted/30 cursor-pointer transition-colors"
              >
                <Upload className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium">PDF-Datei hierher ziehen</p>
                <p className="text-xs text-muted-foreground mt-1">oder klicken zum Auswählen</p>
                <p className="text-[10px] text-muted-foreground/60 mt-2">Grundriss, Schnitt, Ansicht – max. 20 MB</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate('/')}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Projekt anlegen & Analyse starten
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default NewProject;
