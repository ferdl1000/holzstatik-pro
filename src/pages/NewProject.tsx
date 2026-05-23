import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, ArrowRight, FileText, X, Loader2, Plus } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function formatSize(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

const NewProject = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { createProject } = useProjects();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const validateAndAddFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const valid: File[] = [];
    for (const f of arr) {
      if (f.type !== 'application/pdf') {
        toast({ title: 'Ungültiger Dateityp', description: `"${f.name}" ist keine PDF-Datei.`, variant: 'destructive' });
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: 'Datei zu groß', description: `"${f.name}" überschreitet 50 MB.`, variant: 'destructive' });
        continue;
      }
      // deduplicate by name+size
      if (files.some(x => x.name === f.name && x.size === f.size)) continue;
      valid.push(f);
    }
    if (valid.length > 0) setFiles(prev => [...prev, ...valid]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) validateAndAddFiles(e.target.files);
    // reset input so same file can be re-selected after removal
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    validateAndAddFiles(e.dataTransfer.files);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Name erforderlich', variant: 'destructive' });
      return;
    }
    setCreating(true);

    const projectId = await createProject(name.trim(), description.trim());
    if (!projectId) {
      toast({ title: 'Fehler beim Anlegen des Projekts', variant: 'destructive' });
      setCreating(false);
      return;
    }

    if (files.length === 0) {
      toast({ title: 'Projekt angelegt' });
      navigate(`/project/${projectId}?tab=plan`);
      setCreating(false);
      return;
    }

    // Upload all PDFs
    let successCount = 0;
    for (const file of files) {
      if (!user) break;
      const path = `${user.id}/${projectId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('plan-documents')
        .upload(path, file, { upsert: true });

      if (uploadError) {
        toast({
          title: `Upload fehlgeschlagen: ${file.name}`,
          description: uploadError.message,
          variant: 'destructive',
        });
        continue;
      }

      const { error: dbError } = await supabase.from('documents').insert({
        project_id: projectId,
        user_id: user!.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
        status: 'uploaded',
      });

      if (dbError) {
        toast({
          title: `DB-Fehler: ${file.name}`,
          description: dbError.message,
          variant: 'destructive',
        });
        continue;
      }

      successCount++;
      toast({ title: `Hochgeladen: ${file.name}` });
    }

    toast({
      title: 'Projekt angelegt. KI-Analyse startet automatisch.',
      description: `${successCount} von ${files.length} Datei(en) erfolgreich hochgeladen.`,
    });
    navigate(`/project/${projectId}?tab=autoanalysis&autoAnalyze=true`);
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
          {/* Project name */}
          <div className="space-y-2">
            <Label>Projektname *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. EFH Sonnberg - Dachstuhl"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Bauvorhaben / Beschreibung</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kurzbeschreibung des Bauvorhabens"
              rows={3}
            />
          </div>

          {/* PDF Upload */}
          <div className="space-y-2">
            <Label>Einreichpläne (PDF) – optional</Label>

            {/* Hidden multi-file input */}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Drop zone (always visible when no files, or as add-more area) */}
            {files.length === 0 && (
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  isDragOver
                    ? 'border-primary bg-primary/5'
                    : 'bg-muted/20 hover:bg-muted/30'
                }`}
              >
                <Upload className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium">PDF hier ablegen oder klicken zum Auswählen</p>
                <p className="text-xs text-muted-foreground mt-1">Grundriss, Schnitt, Ansicht – max. 50 MB pro Datei</p>
              </div>
            )}

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, idx) => (
                  <div key={`${f.name}-${f.size}`} className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
                    <FileText className="h-7 w-7 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{formatSize(f.size)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={() => removeFile(idx)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {/* Add more button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 w-full"
                  onClick={() => fileRef.current?.click()}
                >
                  <Plus className="h-4 w-4" />
                  Weiteres PDF hinzufügen
                </Button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate('/')}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {files.length > 0 ? 'Projekt anlegen + Analyse starten' : 'Projekt anlegen'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default NewProject;
