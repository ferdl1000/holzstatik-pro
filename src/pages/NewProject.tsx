import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, ArrowRight, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

const NewProject = () => {
  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Neues Projekt</h1>
          <p className="text-sm text-muted-foreground mt-1">Dachtragwerk-Vorbemessung aus Einreichplan</p>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-5">
          <div className="space-y-2">
            <Label>Projektname</Label>
            <Input placeholder="z.B. EFH Sonnberg - Dachstuhl" />
          </div>

          <div className="space-y-2">
            <Label>Bauvorhaben / Beschreibung</Label>
            <Textarea placeholder="Kurzbeschreibung des Bauvorhabens" rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Einreichplan (PDF)</Label>
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg bg-muted/20 hover:bg-muted/30 cursor-pointer transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">PDF-Datei hierher ziehen</p>
              <p className="text-xs text-muted-foreground mt-1">oder klicken zum Auswählen</p>
              <p className="text-[10px] text-muted-foreground/60 mt-2">Grundriss, Schnitt, Ansicht – max. 20 MB</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Link to="/">
              <Button variant="outline">Abbrechen</Button>
            </Link>
            <Link to="/project/demo?tab=plan">
              <Button className="gap-1.5">
                <ArrowRight className="h-4 w-4" />
                Projekt anlegen & Analyse starten
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default NewProject;
