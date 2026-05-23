import { useState, useRef, useEffect } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import {
  Upload, FileText, Eye, AlertTriangle, Loader2, CheckCircle,
  Scan, Bot, Trash2, RefreshCw, CheckCircle2, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface PlanTabProps { project: Project; projectId?: string; onAnalysisComplete?: () => void; }

interface DocRow {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  status: 'uploaded' | 'processing' | 'analyzed' | 'error';
  created_at: string;
}

function formatBytes(bytes: number) {
  if (!bytes) return '—';
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function StatusBadge({ status }: { status: DocRow['status'] }) {
  const map: Record<DocRow['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    uploaded:   { label: 'Hochgeladen',  variant: 'secondary' },
    processing: { label: 'Verarbeitung', variant: 'outline' },
    analyzed:   { label: 'Analysiert',   variant: 'default' },
    error:      { label: 'Fehler',       variant: 'destructive' },
  };
  const { label, variant } = map[status] ?? map.uploaded;
  return (
    <Badge variant={variant} className="text-xs flex items-center gap-1">
      {status === 'analyzed' && <CheckCircle2 className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

export function PlanTab({ project, projectId, onAnalysisComplete }: PlanTabProps) {
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [currentDocName, setCurrentDocName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Bug A fix: load existing documents on mount
  useEffect(() => {
    if (!projectId) return;
    loadDocuments();
  }, [projectId]);

  async function loadDocuments() {
    setLoadingDocs(true);
    const { data } = await supabase
      .from('documents')
      .select('id, file_name, file_path, file_size, status, created_at')
      .eq('project_id', projectId!)
      .order('created_at', { ascending: false });
    setDocuments((data as DocRow[]) || []);
    setLoadingDocs(false);
  }

  async function openPreview(doc: DocRow) {
    const { data } = await supabase.storage
      .from('plan-documents')
      .createSignedUrl(doc.file_path, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    } else {
      toast({ title: 'Vorschau nicht verfügbar', variant: 'destructive' });
    }
  }

  async function deleteDoc(doc: DocRow) {
    if (!confirm(`"${doc.file_name}" wirklich löschen?`)) return;
    await supabase.storage.from('plan-documents').remove([doc.file_path]);
    await supabase.from('documents').delete().eq('id', doc.id);
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
    toast({ title: 'Dokument gelöscht' });
  }

  async function analyzeDoc(docId: string, docName: string) {
    if (!projectId) return;
    setAnalyzing(true);
    setAnalyzeProgress(10);
    setCurrentDocName(docName);

    const progressInterval = setInterval(() => {
      setAnalyzeProgress(p => Math.min(p + 8, 85));
    }, 1500);

    try {
      const { data, error } = await supabase.functions.invoke('agent-orchestrator', {
        body: { documentId: docId, projectId },
      });
      clearInterval(progressInterval);

      const msg = error?.message || data?.error || '';
      const isQuota = msg.includes('429') || msg.toLowerCase().includes('quota');
      if (error || data?.error) {
        toast({
          title: isQuota ? 'KI-Tageslimit erreicht' : 'Analyse fehlgeschlagen',
          description: isQuota
            ? 'Gemini Free-Tier vorübergehend ausgeschöpft. Du kannst manuell weiter: gehe zu "Adresse", "Geometrie" usw.'
            : msg,
          variant: 'destructive',
        });
        if (isQuota) onAnalysisComplete?.();
      } else {
        setAnalyzeProgress(100);
        const errs = (data?.errors as string[] | undefined) || [];
        if (errs.length > 0) {
          toast({ title: 'Analyse teilweise erfolgreich', description: `${errs.length} Agent-Warnung(en). Daten bitte prüfen.` });
        } else {
          toast({ title: 'Analyse abgeschlossen', description: `"${docName}" erfolgreich analysiert.` });
        }
        onAnalysisComplete?.();
        await loadDocuments();
      }
    } catch {
      clearInterval(progressInterval);
      toast({ title: 'Fehler', description: 'Verbindung zur Analyse fehlgeschlagen', variant: 'destructive' });
    }
    setAnalyzing(false);
    setAnalyzeProgress(0);
    setCurrentDocName('');
  }

  async function analyzeAll() {
    const pending = documents.filter(d => d.status !== 'analyzed');
    for (const doc of pending) {
      await analyzeDoc(doc.id, doc.file_name);
    }
  }

  // Bug B fix: upload multiple files
  async function uploadFile(file: File) {
    if (!user || !projectId) return;
    const path = `${user.id}/${projectId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('plan-documents').upload(path, file, { upsert: true });
    if (error) {
      toast({ title: `Upload fehlgeschlagen: ${file.name}`, description: error.message, variant: 'destructive' });
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

    toast({ title: `"${file.name}" hochgeladen`, description: docData?.id ? 'Bereit für die KI-Analyse.' : '' });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
    if (pdfs.length === 0) {
      toast({ title: 'Nur PDF-Dateien erlaubt', variant: 'destructive' });
      return;
    }
    setUploading(true);
    for (const file of pdfs) {
      await uploadFile(file);
    }
    await loadDocuments();
    setUploading(false);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  const hasDocs = documents.length > 0;
  const pendingCount = documents.filter(d => d.status !== 'analyzed').length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SectionCard title="PDF-Einreichplan" subtitle="Hochgeladene Plandokumente und KI-Analyse">

        {/* Analyzing overlay */}
        {analyzing ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-6">
            <Scan className="h-16 w-16 text-primary animate-pulse" />
            <div className="text-center space-y-2">
              <p className="font-medium">KI-Plananalyse läuft…</p>
              {currentDocName && (
                <p className="text-sm text-muted-foreground">Dokument: <span className="font-medium">{currentDocName}</span></p>
              )}
              <p className="text-xs text-muted-foreground">
                OCR • Texterkennung • Adresserkennung • Maßerkennung • Dacherkennung
              </p>
            </div>
            <div className="w-80">
              <Progress value={analyzeProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center mt-1">{analyzeProgress}%</p>
            </div>
          </div>
        ) : loadingDocs ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Dokumente werden geladen…</span>
          </div>
        ) : hasDocs ? (
          <div className="space-y-4">
            {/* Document list */}
            <div className="space-y-2">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between rounded-md border bg-muted/30 p-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(doc.file_size)} • {formatDate(doc.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={doc.status} />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Vorschau öffnen"
                      onClick={() => openPreview(doc)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {doc.status !== 'analyzed' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Analysieren"
                        onClick={() => analyzeDoc(doc.id, doc.file_name)}
                      >
                        <Bot className="h-4 w-4" />
                      </Button>
                    )}
                    {doc.status === 'analyzed' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        title="Neu analysieren"
                        onClick={() => analyzeDoc(doc.id, doc.file_name)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Löschen"
                      onClick={() => deleteDoc(doc)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Analyze all + add more */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {pendingCount > 0 && (
                <Button onClick={analyzeAll} className="gap-1.5">
                  <Bot className="h-4 w-4" />
                  Alle analysieren ({pendingCount})
                </Button>
              )}
              <input ref={fileRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileChange} />
              <Button
                variant="outline"
                onClick={() => !uploading && fileRef.current?.click()}
                disabled={uploading}
                className="gap-1.5"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {uploading ? 'Wird hochgeladen…' : 'Weiteres PDF hochladen'}
              </Button>
            </div>
          </div>
        ) : (
          /* Empty state: big upload zone */
          <div>
            <input ref={fileRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileChange} />
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex flex-col items-center justify-center py-16 space-y-4 cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/40 transition-colors"
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
                    <p className="text-sm text-muted-foreground mt-1">
                      PDF-Dateien mit Grundriss, Schnitt und/oder Ansicht (mehrere möglich)
                    </p>
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
