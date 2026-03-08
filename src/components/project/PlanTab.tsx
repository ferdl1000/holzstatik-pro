import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { Upload, FileText, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlanTabProps { project: Project; }

export function PlanTab({ project }: PlanTabProps) {
  const doc = project.documents[0];

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

            {/* Plan viewer placeholder */}
            <div className="aspect-[4/3] rounded-lg border-2 border-dashed bg-muted/20 flex items-center justify-center">
              <div className="text-center space-y-2">
                <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">Plan-Vorschau</p>
                <p className="text-xs text-muted-foreground/60">PDF-Viewer mit Hervorhebung erkannter Bereiche</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
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
