import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { Button } from '@/components/ui/button';
import { FileText, Download, ClipboardList, TreePine, Shield, History } from 'lucide-react';
import { StatusIndicator } from '@/components/shared/StatusIndicator';

interface ReportTabProps { project: Project; }

export function ReportTab({ project }: ReportTabProps) {
  const reports = [
    { icon: FileText, title: 'Statik-Auszug', desc: 'Bemessungsergebnisse, Schnittgrößen und Nachweise', format: 'PDF' },
    { icon: TreePine, title: 'Holzliste / Holzauszug', desc: 'Materialliste aller Holzbauteile mit Querschnitten und Mengen', format: 'PDF / CSV' },
    { icon: Shield, title: 'Prüfprotokoll', desc: 'Alle Prüfschritte, Widersprüche und Freigabestatus', format: 'PDF' },
    { icon: ClipboardList, title: 'Projektdokumentation', desc: 'Vollständige Projektübersicht mit allen Eingabedaten', format: 'PDF' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold">Bericht-Agent</h2>
        <p className="text-sm text-muted-foreground">Export und Dokumentation</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {reports.map((r, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 space-y-3 hover:shadow-md transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <r.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{r.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-[10px] text-muted-foreground">Format: {r.format}</span>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Exportieren
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Audit Trail */}
      <SectionCard title="Audit Trail" subtitle="Protokoll aller automatischen und manuellen Änderungen" headerRight={<History className="h-4 w-4 text-muted-foreground" />}>
        <div className="space-y-0">
          {project.auditEntries.map((entry, i) => (
            <div key={entry.id} className="flex items-start gap-3 py-3 border-b last:border-b-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium">{entry.agent}</span>
                  <span className="text-[10px] text-muted-foreground">•</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(entry.timestamp).toLocaleString('de-AT')}
                  </span>
                  {entry.userInitiated && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Benutzer</span>
                  )}
                </div>
                <p className="text-sm">{entry.action}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{entry.reason}</p>
                {entry.newValue && entry.newValue !== '-' && (
                  <p className="text-xs font-mono text-accent mt-0.5">→ {entry.newValue}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
