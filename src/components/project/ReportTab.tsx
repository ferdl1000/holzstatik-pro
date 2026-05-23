import { useState } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { Button } from '@/components/ui/button';
import { FileText, Download, ClipboardList, TreePine, Shield, History, Loader2, FileCheck2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { downloadReport } from '@/lib/report/generator';
import type { ReportExtras } from '@/lib/report/generator';
import { estimateCost, DEFAULT_FACTORS } from '@/lib/pricing';
import { computeTransportPlan } from '@/lib/auto/standards';
import { Switch } from '@/components/ui/switch';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { VARIANTE_LABELS, applyVarianteToCosts } from '@/lib/pricing/varianten';
import type { AngebotsVariante } from '@/lib/pricing/varianten';

interface ReportTabProps { project: Project; projectId?: string; }

export function ReportTab({ project, projectId }: ReportTabProps) {
  const { entries, loading: auditLoading } = useAuditTrail(projectId);
  const [generating, setGenerating] = useState<string | null>(null);
  const [laymanMode, setLaymanMode] = useState(false);
  const [includeCosts, setIncludeCosts] = useState(true);
  const [includeAudit, setIncludeAudit] = useState(true);
  const [angebotsVariante, setAngebotsVariante] = useState<AngebotsVariante>('standard');
  const { toast } = useToast();

  const handleLocalPdf = async () => {
    try {
      // Build calc results from project.calculations
      const calcResults = (project.calculations || []).map(c => ({
        input: { type: 'sparren' as const, span: 0, b: 0, h: 0, timberClass: 'C24', qPermanent: 0, qVariable: 0, variableDuration: 'shortTerm' as const, serviceClass: '1' as const },
        section: { b: 0, h: 0, A: 0, Iy: 0, Iz: 0, Wy: 0, Wz: 0, iy: 0, iz: 0 },
        material: {} as never,
        internalForces: { M_Ed: 0, V_Ed: 0, M_char: 0, w_inst: 0, w_fin: 0 },
        checks: c.checks.map(check => ({
          name: check.name, description: '', formula: check.formula || '',
          value: check.result, limit: check.limit, utilization: check.result / Math.max(check.limit, 0.001),
          status: check.status, explanation: check.details || '',
          values: {},
        })),
        overallStatus: c.overallStatus, maxUtilization: Math.max(...c.checks.map(ch => ch.result / Math.max(ch.limit, 0.001))),
        summary: `${c.memberName}: ${c.checks.length} Nachweise`,
      }));

      const baseCosts = includeCosts ? estimateCost({
        members: project.members || [],
        roofArea: project.geometry ? project.geometry.length.value * (project.geometry.width.value / Math.cos((project.geometry.roofPitch.value * Math.PI) / 180)) : 0,
        groundArea: project.geometry ? project.geometry.length.value * project.geometry.width.value : 0,
        coveringId: 'tile_clay', insulationId: 'ins_mw_200',
        membraneIds: ['mem_under', 'mem_vapor'],
        factors: DEFAULT_FACTORS,
      }) : undefined;
      const costs = baseCosts ? applyVarianteToCosts(baseCosts, angebotsVariante) : undefined;

      // Build extras: joints come from pipeline result stored in project.calculations
      // (if the pipeline wrote joints into the first calculation entry's custom field),
      // transport is computed on the fly from current members.
      const members = project.members ?? [];
      const transport = members.length > 0 ? computeTransportPlan(members) : undefined;

      // Joints: the auto-pipeline stores them on AutoMembersResult; here we look for
      // any joints that may have been persisted in a custom field on the project object.
      const pipelineResult = (project as any)._pipelineResult;
      const joints = pipelineResult?.joints ?? pipelineResult?.members?.joints ?? undefined;

      // Openings / special features / plan quality from extracted pipeline data
      const extracted = (project as any)._extracted;
      const extras: ReportExtras = {
        joints,
        transport,
        ceilings: project.ceilings,
        openings: extracted?.openings,
        specialFeatures: extracted?.specialFeatures,
        planQuality: extracted?.planQuality,
      };

      await downloadReport(project, calcResults as never, costs, {
        laymanMode, includeFormulas: !laymanMode, includeAuditTrail: includeAudit, includeCosts,
        angebotsVariante,
      }, extras);
      toast({ title: 'PDF erstellt', description: 'Bericht wurde heruntergeladen.' });
    } catch (e) {
      toast({ title: 'PDF-Fehler', description: e instanceof Error ? e.message : 'Unbekannt', variant: 'destructive' });
    }
  };

  const reports = [
    { key: 'statik', icon: FileText, title: 'Statik-Auszug', desc: 'Bemessungsergebnisse, Schnittgrößen und Nachweise', format: 'PDF' },
    { key: 'holzliste', icon: TreePine, title: 'Holzliste / Holzauszug', desc: 'Materialliste aller Holzbauteile mit Querschnitten und Mengen', format: 'PDF / CSV' },
    { key: 'pruefprotokoll', icon: Shield, title: 'Prüfprotokoll', desc: 'Alle Prüfschritte, Widersprüche und Freigabestatus', format: 'PDF' },
    { key: 'projektdoku', icon: ClipboardList, title: 'Projektdokumentation', desc: 'Vollständige Projektübersicht mit allen Eingabedaten', format: 'PDF' },
  ];

  const handleExport = async (reportType: string) => {
    if (!projectId) {
      toast({ title: 'Fehler', description: 'Kein Projekt-ID', variant: 'destructive' });
      return;
    }

    setGenerating(reportType);
    try {
      const { data, error } = await supabase.functions.invoke('generate-report', {
        body: { projectId, reportType },
      });

      if (error || data?.error) {
        toast({ title: 'Fehler', description: data?.error || error?.message, variant: 'destructive' });
      } else if (data?.html) {
        // Open report in new window for printing/PDF
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${data.title} – ${project.name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
    body { font-family: 'IBM Plex Sans', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a2e; }
    h1, h2, h3 { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 13px; }
    th { background: #f1f5f9; font-weight: 600; }
    code, .mono { font-family: 'IBM Plex Mono', monospace; }
    .auto { background: #fef3c7; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
    .confirmed { background: #d1fae5; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; font-size: 11px; color: #64748b; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #0f172a;">
    <div>
      <h1 style="margin:0;font-size:22px;">HolzStatik</h1>
      <p style="margin:4px 0 0;color:#64748b;font-size:13px;">${data.title}</p>
    </div>
    <div style="text-align:right;font-size:12px;color:#64748b;">
      <div>Projekt: ${project.name}</div>
      <div>Erstellt: ${new Date(data.generatedAt).toLocaleString('de-AT')}</div>
    </div>
  </div>
  ${data.html}
  <div class="footer">
    <p><strong>Wichtiger Hinweis:</strong> Diese Vorbemessung ersetzt keine rechtsverbindliche statische Berechnung durch eine qualifizierte Fachperson (Ziviltechniker, Statiker).</p>
    <p>Generiert am ${new Date(data.generatedAt).toLocaleString('de-AT')} • HolzStatik v1.0.0-beta</p>
  </div>
</body>
</html>`);
          win.document.close();
        }
        toast({ title: `${data.title} erstellt`, description: 'Bericht wurde in neuem Tab geöffnet.' });
      }
    } catch (e) {
      toast({ title: 'Fehler', description: 'Berichterstellung fehlgeschlagen', variant: 'destructive' });
    }
    setGenerating(null);
  };

  // Use DB audit entries if available, fallback to project mock data
  const displayEntries = entries.length > 0 ? entries : project.auditEntries;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold">Bericht-Agent</h2>
        <p className="text-sm text-muted-foreground">Export und Dokumentation</p>
      </div>

      {/* NEU: Komplett-PDF mit Berechnungen + Kosten */}
      <SectionCard title="Komplett-Vorbemessung als PDF" subtitle="Prüffähiger Bericht mit allen Nachweisen, Formeln, Massenauszug und Kosten">
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch id="laymanMode" checked={laymanMode} onCheckedChange={setLaymanMode} />
              <Label htmlFor="laymanMode" className="text-sm">Laien-Modus (einfache Sprache, weniger Formeln)</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="incCosts" checked={includeCosts} onCheckedChange={setIncludeCosts} />
              <Label htmlFor="incCosts" className="text-sm">Kostenschätzung einschließen</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="incAudit" checked={includeAudit} onCheckedChange={setIncludeAudit} />
              <Label htmlFor="incAudit" className="text-sm">Audit-Trail anhängen</Label>
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm shrink-0">Angebotsvariante</Label>
              <Select value={angebotsVariante} onValueChange={v => setAngebotsVariante(v as AngebotsVariante)}>
                <SelectTrigger className="w-64 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(VARIANTE_LABELS) as AngebotsVariante[]).map(k => (
                    <SelectItem key={k} value={k}>{VARIANTE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleLocalPdf} size="lg" className="gap-2">
            <FileCheck2 className="h-4 w-4" />
            PDF-Bericht erstellen
          </Button>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-4">
        {reports.map((r) => (
          <div key={r.key} className="rounded-lg border bg-card p-5 space-y-3 hover:shadow-md transition-all">
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
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => handleExport(r.key)}
                disabled={generating === r.key}
              >
                {generating === r.key ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generiere…</>
                ) : (
                  <><Download className="h-3.5 w-3.5" />Exportieren</>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Audit Trail from DB */}
      <SectionCard title="Audit Trail" subtitle="Protokoll aller automatischen und manuellen Änderungen" headerRight={<History className="h-4 w-4 text-muted-foreground" />}>
        {auditLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Audit-Protokoll laden…</div>
        ) : (
          <div className="space-y-0">
            {displayEntries.map((entry, i) => (
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
            {displayEntries.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">Noch keine Audit-Einträge vorhanden.</p>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
