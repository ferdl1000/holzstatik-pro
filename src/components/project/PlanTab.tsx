import { useState, useRef, useEffect } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { Upload, FileText, Eye, AlertTriangle, Loader2, CheckCircle, Scan, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface PlanTabProps { project: Project; projectId?: string; onAnalysisComplete?: () => void; }

export function PlanTab({ project, projectId, onAnalysisComplete }: PlanTabProps) {
  const doc = project.documents[0];
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; docId?: string } | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Load existing document's PDF URL
  useEffect(() => {
    if (doc?.status === 'analyzed' && projectId && user) {
      loadPdfUrl();
    }
  }, [doc, projectId, user]);

  async function loadPdfUrl() {
    if (!projectId || !user) return;
    const { data: docs } = await supabase
      .from('documents')
      .select('file_path')
      .eq('project_id', projectId)
      .limit(1);
    if (docs?.[0]) {
      const { data } = await supabase.storage
        .from('plan-documents')
        .createSignedUrl(docs[0].file_path, 3600);
      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    }
  }

  const handleUpload = async (file: File) => {
    if (!user || !projectId) return;
    setUploading(true);
    const path = `${user.id}/${projectId}/${file.name}`;
    const { error } = await supabase.storage.from('plan-documents').upload(path, file, { upsert: true });
    if (error) {
      toast({ title: 'Upload fehlgeschlagen', description: error.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: docData } = await supabase.from('documents').insert({
      project_id: projectId,
      user_id: user.id,
      file_name: file.name,
      file_path: path,
      file_type: file.type,
      file_size: file.size,
      status: 'uploaded',
    }).select('id').single();

    setUploadedFile({ name: file.name, size: file.size, docId: docData?.id });
    setUploading(false);
    toast({ title: 'Plan hochgeladen', description: 'Bereit für die KI-Analyse.' });

    // Load the PDF URL for preview
    const { data: urlData } = await supabase.storage
      .from('plan-documents')
      .createSignedUrl(path, 3600);
    if (urlData?.signedUrl) setPdfUrl(urlData.signedUrl);
  };

  const handleAnalyze = async () => {
    const docId = uploadedFile?.docId;
    if (!docId || !projectId) return;

    setAnalyzing(true);
    setAnalyzeProgress(10);

    const progressInterval = setInterval(() => {
      setAnalyzeProgress(p => Math.min(p + 8, 85));
    }, 1500);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-plan', {
        body: { documentId: docId, projectId },
      });

      clearInterval(progressInterval);

      if (error) {
        toast({ title: 'Analyse fehlgeschlagen', description: error.message, variant: 'destructive' });
      } else if (data?.error) {
        toast({ title: 'Analysefehler', description: data.error, variant: 'destructive' });
      } else {
        setAnalyzeProgress(100);
        toast({ title: 'Analyse abgeschlossen', description: 'Extrahierte Daten sind verfügbar.' });
        onAnalysisComplete?.();
      }
    } catch (e) {
      clearInterval(progressInterval);
      toast({ title: 'Fehler', description: 'Verbindung zur Analyse fehlgeschlagen', variant: 'destructive' });
    }
    setAnalyzing(false);
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
      <SectionCard title="PDF-Einreichplan" subtitle="Hochgeladene Plandokumente und KI-Analyse">
        {(doc?.status === 'analyzed' || (uploadedFile && !analyzing)) ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{doc?.fileName || uploadedFile?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc?.pages ? `${doc.pages} Seiten • ` : ''}
                    {uploadedFile ? `${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {doc?.status === 'analyzed' ? (
                  <span className="status-badge-green text-xs px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />Analysiert
                  </span>
                ) : (
                  <Button onClick={handleAnalyze} disabled={analyzing} className="gap-1.5">
                    <Bot className="h-3.5 w-3.5" />
                    KI-Analyse starten
                  </Button>
                )}
              </div>
            </div>

            {/* PDF Viewer */}
            {pdfUrl ? (
              <div className="aspect-[4/3] rounded-lg border overflow-hidden bg-muted/10">
                <iframe
                  src={`${pdfUrl}#toolbar=1&navpanes=0`}
                  className="w-full h-full"
                  title="Plan-Vorschau"
                />
              </div>
            ) : (
              <div className="aspect-[4/3] rounded-lg border-2 border-dashed bg-muted/20 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">Plan-Vorschau wird geladen…</p>
                </div>
              </div>
            )}
          </div>
        ) : analyzing ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-6">
            <div className="relative">
              <Scan className="h-16 w-16 text-primary animate-pulse" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-medium">KI-Plananalyse läuft…</p>
              <p className="text-sm text-muted-foreground">
                OCR • Texterkennung • Adresserkennung • Maßerkennung • Dacherkennung
              </p>
            </div>
            <div className="w-80">
              <Progress value={analyzeProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center mt-1">{analyzeProgress}%</p>
            </div>
          </div>
        ) : (
          <div>
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
          </div>
        )}
      </SectionCard>

      <div className="rounded-lg border border-status-yellow/30 bg-status-yellow-bg p-3 flex items-start gap-2.5">
        <AlertTriangle className="h-3.5 w-3.5 text-status-yellow shrink-0 mt-0.5" />
        <p className="text-xs text-foreground/80 leading-relaxed">
          Die automatische Plananalyse erkennt Texte, Maße, Adressen und Dachhinweise mittels KI.
          Alle erkannten Werte müssen im weiteren Workflow bestätigt werden.
        </p>
      </div>
    </div>
  );
}
