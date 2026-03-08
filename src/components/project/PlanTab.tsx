import { useState, useRef } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { Upload, FileText, Eye, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface PlanTabProps { project: Project; projectId?: string; }

export function PlanTab({ project, projectId }: PlanTabProps) {
  const doc = project.documents[0];
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleUpload = async (file: File) => {
    if (!user || !projectId) return;
    setUploading(true);
    const path = `${user.id}/${projectId}/${file.name}`;
    const { error } = await supabase.storage.from('plan-documents').upload(path, file, { upsert: true });
    if (error) {
      toast({ title: 'Upload fehlgeschlagen', description: error.message, variant: 'destructive' });
    } else {
      await supabase.from('documents').insert({
        project_id: projectId,
        user_id: user.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
        status: 'uploaded',
      });
      setUploadedFile({ name: file.name, size: file.size });
      toast({ title: 'Plan hochgeladen', description: 'Die Analyse wird vorbereitet.' });
    }
    setUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') handleUpload(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') handleUpload(f);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SectionCard title="PDF-Einreichplan" subtitle="Hochgeladene Plandokumente">
        {doc ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{doc.fileName}</p>
                  <p className="text-xs text-muted-foreground">{doc.pages} Seiten • Hochgeladen am {new Date(doc.uploadedAt).toLocaleDateString('de-AT')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="status-badge-green text-xs px-2 py-0.5 rounded-md font-medium">
                  Analysiert
                </span>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Ansehen
                </Button>
              </div>
            </div>

            <div className="aspect-[4/3] rounded-lg border-2 border-dashed bg-muted/20 flex items-center justify-center">
              <div className="text-center space-y-2">
                <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">Plan-Vorschau</p>
                <p className="text-xs text-muted-foreground/60">PDF-Viewer mit Hervorhebung erkannter Bereiche</p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {uploadedFile ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <CheckCircle className="h-12 w-12 text-status-green" />
                <p className="font-medium">{uploadedFile.name}</p>
                <p className="text-sm text-muted-foreground">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB – Upload erfolgreich</p>
              </div>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                <div
                  onClick={() => !uploading && fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="flex flex-col items-center justify-center py-16 space-y-4 cursor-pointer"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground">Plan wird hochgeladen…</p>
                    </>
                  ) : (
                    <>
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium">Einreichplan hochladen</p>
                        <p className="text-sm text-muted-foreground mt-1">PDF-Datei mit Grundriss, Schnitt und/oder Ansicht</p>
                      </div>
                      <Button className="gap-2">
                        <Upload className="h-4 w-4" />
                        PDF auswählen
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </SectionCard>

      <div className="rounded-lg border border-status-yellow/30 bg-status-yellow-bg p-3 flex items-start gap-2.5">
        <AlertTriangle className="h-3.5 w-3.5 text-status-yellow shrink-0 mt-0.5" />
        <p className="text-xs text-foreground/80 leading-relaxed">
          Die automatische Plananalyse erkennt Texte, Maße, Adressen und Dachhinweise.
          Alle erkannten Werte müssen im weiteren Workflow bestätigt werden.
        </p>
      </div>
    </div>
  );
}
