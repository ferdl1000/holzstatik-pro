import { useMemo } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { Button } from '@/components/ui/button';
import { Euro, Boxes, CheckCircle, AlertTriangle, XCircle, Home, ArrowRight, FileOutput, Weight, Ruler, TreePine } from 'lucide-react';
import { autoComputeCosts } from '@/lib/auto/autoCost';
import { roofAreaWithOverhang, DEFAULT_ROOF_OVERHANG } from '@/lib/calc/roofArea';
import { RecalculateAllButton } from './RecalculateAllButton';
import { Visual3DTab } from './Visual3DTab';

interface OverviewTabProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
  /** Wechselt zu einem Detail-Reiter (Geometrie, Lasten, …) zum Ändern einzelner Teile */
  onNavigate?: (tab: string) => void;
}

const ROOF_FORM_SHORT: Record<string, string> = {
  satteldach: 'Satteldach', pultdach: 'Pultdach', walmdach: 'Walmdach',
  krueppelwalmdach: 'Krüppelwalm', flachdach: 'Flachdach', mischform: 'Mischform',
};

/**
 * Ergebnis-Übersicht: EINE Seite mit allem, was nach Plan-Upload + Berechnung
 * zählt — Angebotssumme, Statik-Ampel, alle Dachteile, 3D-Modell und der
 * Rechenweg (Lasten + Annahmen), den ein Zimmermeister nachvollziehen kann.
 * Details ändern → Link in den jeweiligen Reiter → dort "Neu berechnen".
 */
export function OverviewTab({ project, onUpdate, onNavigate }: OverviewTabProps) {
  const overhang = project.roofOverhang ?? DEFAULT_ROOF_OVERHANG;
  const members = project.members || [];
  const roofParts = project.roofParts || [];
  const hasResult = members.length > 0;

  const totalRoofArea = useMemo(() => {
    if (roofParts.length > 0) {
      return roofParts.reduce((s, rp) => s + roofAreaWithOverhang(rp.geometry.length, rp.geometry.width, rp.geometry.pitch, overhang), 0);
    }
    if (!project.geometry) return 0;
    return roofAreaWithOverhang(project.geometry.length.value, project.geometry.width.value, project.geometry.roofPitch.value, overhang);
  }, [roofParts, project.geometry, overhang]);


  // WICHTIG: exakt dieselbe Kalkulation wie im Kosten-Reiter und im Angebot.
  // Vorher rechnete die Übersicht mit estimateCost() eine EIGENE Summe inklusive
  // Eindeckung, Dämmung und Folien — der Kosten-Reiter dagegen nur die
  // Zimmererleistung. Für dasselbe Projekt standen damit zwei verschiedene
  // Angebotssummen in der App.
  const estimate = useMemo(() => {
    if (!hasResult || !project.geometry) return null;
    // Gespeichertes Ergebnis des letzten Laufs hat Vorrang (überlebt Reload).
    if (project.autoRun?.kosten) {
      return { net: project.autoRun.kosten.net, gross: project.autoRun.kosten.gross };
    }
    const cost = autoComputeCosts(members, project.geometry, {
      roofForm: project.roofType?.form ?? 'satteldach',
      roofOverhang: overhang,
      ...(roofParts.length > 0 ? { roofParts } : {}),
      ...(project.coveringType ? { coveringType: project.coveringType } : {}),
    });
    return { net: cost.withLabor.net, gross: cost.withLabor.gross };
  }, [hasResult, members, project.geometry, project.roofType, project.coveringType, project.autoRun, overhang, roofParts]);

  const timberVolume = members.reduce((s, m) => s + (m.width / 1000) * (m.height / 1000) * m.length * m.quantity, 0);
  const statusCounts = {
    green: members.filter(m => m.calculationStatus === 'green').length,
    yellow: members.filter(m => m.calculationStatus === 'yellow').length,
    red: members.filter(m => m.calculationStatus === 'red').length,
  };
  const overallStatus = statusCounts.red > 0 ? 'red' : statusCounts.yellow > 0 ? 'yellow' : 'green';

  const loads = project.loadCases || [];
  const snow = loads.find(l => l.type === 'snow' && l.value >= 0);
  const wind = loads.filter(l => l.type === 'wind');
  const dead = loads.find(l => l.type === 'permanent');

  if (!hasResult) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-lg border-2 border-dashed p-12 text-center space-y-4">
          <Home className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <h2 className="text-lg font-bold">Noch kein Ergebnis</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Lade im Reiter „Plan" einen Einreichplan (PDF) hoch und starte die Analyse —
            danach erscheinen hier Angebot, Statik-Ampel und 3D-Modell auf einen Blick.
          </p>
          <Button onClick={() => onNavigate?.('plan')} className="gap-1.5">
            Plan hochladen<ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  const pruefung = project.autoRun?.gegenpruefung;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Gegenprüfung gegen den Einreichplan — steht GANZ OBEN, weil ein
          Widerspruch zwischen Plan, Berechnung und Zeichnung das ganze
          Ergebnis unbrauchbar macht. */}
      {pruefung && (
        <div className={`rounded-lg border-2 p-4 ${
          pruefung.bestanden
            ? 'border-[hsl(var(--status-green)/0.5)] bg-[hsl(var(--status-green-bg))]'
            : 'border-[hsl(var(--status-red)/0.6)] bg-[hsl(var(--status-red-bg))]'}`}>
          <div className="flex items-start gap-3">
            {pruefung.bestanden
              ? <CheckCircle className="h-5 w-5 mt-0.5 text-[hsl(var(--status-green))] shrink-0" />
              : <XCircle className="h-5 w-5 mt-0.5 text-[hsl(var(--status-red))] shrink-0" />}
            <div className="space-y-1.5 min-w-0">
              <p className="font-semibold text-sm">
                {pruefung.bestanden
                  ? 'Gegenprüfung bestanden — Plan, Berechnung und Zeichnung stimmen überein'
                  : 'Gegenprüfung NICHT bestanden — Plan, Berechnung und Zeichnung widersprechen sich'}
              </p>
              {pruefung.befunde.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Dachneigung, First- und Traufhöhe, Sparrenlänge und Sparrenanzahl passen zusammen.
                  Was gerechnet wurde, ist auch das, was gezeichnet ist.
                </p>
              )}
              {pruefung.befunde.map(b => (
                <div key={b.id} className="text-xs">
                  <span className={`font-medium ${b.schwere === 'blocker' ? 'text-[hsl(var(--status-red))]' : 'text-[hsl(var(--status-yellow))]'}`}>
                    {b.schwere === 'blocker' ? 'Widerspruch' : 'Hinweis'}: {b.titel}
                  </span>
                  <span className="text-muted-foreground"> — erwartet {b.erwartet}, gefunden {b.gefunden}. {b.bedeutung}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Kopfzeile: Summe + Ampel + Aktion */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-5 md:col-span-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <Euro className="h-3.5 w-3.5" />Angebotssumme (Richtwert, brutto)
          </div>
          <p className="text-3xl font-bold font-mono mt-1">
            {(estimate?.gross ?? 0).toLocaleString('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {members.length} Bauteiltypen · {timberVolume.toFixed(2)} m³ Holz · {totalRoofArea.toFixed(0)} m² Dachfläche (inkl. {(overhang * 100).toFixed(0)} cm Überstand)
          </p>
        </div>
        <div className={`rounded-lg border-2 p-5 ${
          overallStatus === 'red' ? 'border-[hsl(var(--status-red)/0.5)] bg-[hsl(var(--status-red-bg))]' :
          overallStatus === 'yellow' ? 'border-[hsl(var(--status-yellow)/0.5)] bg-[hsl(var(--status-yellow-bg))]' :
          'border-[hsl(var(--status-green)/0.5)] bg-[hsl(var(--status-green-bg))]'}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">Statik-Ampel</div>
          <div className="flex items-center gap-3 mt-2">
            {overallStatus === 'green' && <CheckCircle className="h-8 w-8 text-[hsl(var(--status-green))]" />}
            {overallStatus === 'yellow' && <AlertTriangle className="h-8 w-8 text-[hsl(var(--status-yellow))]" />}
            {overallStatus === 'red' && <XCircle className="h-8 w-8 text-[hsl(var(--status-red))]" />}
            <div className="text-sm">
              <p className="font-semibold">
                {overallStatus === 'green' ? 'Alle Nachweise erfüllt' : overallStatus === 'yellow' ? 'Knapp — prüfen' : 'Überlastet!'}
              </p>
              <p className="text-xs text-muted-foreground">{statusCounts.green} grün · {statusCounts.yellow} gelb · {statusCounts.red} rot</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-5 flex flex-col justify-between gap-2">
          <RecalculateAllButton project={project} onUpdate={onUpdate} label="Alles neu berechnen" variant="default" size="default" />
          <Button variant="outline" className="gap-1.5" onClick={() => onNavigate?.('report')}>
            <FileOutput className="h-4 w-4" />Angebot / Bericht als PDF
          </Button>
        </div>
      </div>

      {/* Dachteile — ALLE erkannten Dächer inkl. Vordächer/Carports */}
      <SectionCard
        title={`Dachteile (${Math.max(roofParts.length, 1)})`}
        subtitle="Alle am Plan erkannten Dächer — Hauptdach, Anbauten, Vordächer, Carports"
        headerRight={<Button variant="ghost" size="sm" className="gap-1" onClick={() => onNavigate?.('geometry')}>Ändern<ArrowRight className="h-3 w-3" /></Button>}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(roofParts.length > 0 ? roofParts : [null]).map((rp, i) => (
            <div key={rp?.id ?? i} className="rounded-md border p-3 text-sm">
              <p className="font-semibold flex items-center gap-1.5"><Home className="h-3.5 w-3.5 text-primary" />{rp?.label ?? 'Hauptdach'}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {ROOF_FORM_SHORT[rp?.form ?? project.roofType?.form ?? ''] ?? '—'} · {rp?.geometry.pitch ?? project.geometry?.roofPitch.value ?? '—'}° ·{' '}
                {rp
                  ? `${rp.geometry.length} × ${rp.geometry.width} m → ${roofAreaWithOverhang(rp.geometry.length, rp.geometry.width, rp.geometry.pitch, overhang).toFixed(0)} m²`
                  : `${project.geometry?.length.value ?? '—'} × ${project.geometry?.width.value ?? '—'} m`}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 3D-Modell */}
      <SectionCard title="3D-Modell" subtitle="So wurde gerechnet — direkt mit dem Plan vergleichbar">
        <div className="rounded-lg overflow-hidden border">
          <Visual3DTab project={project} />
        </div>
      </SectionCard>

      {/* Rechenweg — für den Zimmermeister nachvollziehbar */}
      <SectionCard
        title="Rechenweg (nachvollziehbar für die Meister-Prüfung)"
        subtitle="Lastansätze nach ÖNORM, verwendete Eingangswerte und alle Bauteile mit Ausnutzung"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
          <div className="rounded-md bg-muted/40 p-2.5">
            <span className="text-muted-foreground flex items-center gap-1"><Weight className="h-3 w-3" />Schneelast s</span>
            <p className="font-mono font-bold">{snow ? `${snow.value.toFixed(2)} kN/m²` : '—'}</p>
            <p className="text-[10px] text-muted-foreground line-clamp-2">{snow?.source}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2.5">
            <span className="text-muted-foreground flex items-center gap-1"><Weight className="h-3 w-3" />Wind (Druck/Sog)</span>
            <p className="font-mono font-bold">{wind.length ? wind.map(w => w.value.toFixed(2)).join(' / ') : '—'} kN/m²</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2.5">
            <span className="text-muted-foreground flex items-center gap-1"><Weight className="h-3 w-3" />Eigengewicht g</span>
            <p className="font-mono font-bold">{dead ? `${dead.value.toFixed(2)} kN/m²` : '—'}</p>
            <p className="text-[10px] text-muted-foreground line-clamp-2">{dead?.source}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2.5">
            <span className="text-muted-foreground flex items-center gap-1"><Ruler className="h-3 w-3" />Sparrenabstand / Überstand</span>
            <p className="font-mono font-bold">e = {((project.sparrenSpacing ?? 0.8) * 100).toFixed(0)} cm · ü = {(overhang * 100).toFixed(0)} cm</p>
            <p className="text-[10px] text-muted-foreground">{project.sparrenSpacing ? 'aus Plan gelesen' : 'Standardannahme'}</p>
          </div>
        </div>

        <table className="data-table">
          <thead><tr><th>Bauteil</th><th>Querschnitt</th><th>Länge</th><th>Anz.</th><th>Status</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="text-sm font-medium"><span className="flex items-center gap-1.5"><TreePine className="h-3 w-3 text-muted-foreground" />{m.name}</span></td>
                <td className="font-mono text-xs">{m.crossSection} cm · {m.material}</td>
                <td className="font-mono text-xs">{m.length} m</td>
                <td className="font-mono text-xs">{m.quantity}</td>
                <td>
                  {m.calculationStatus === 'green' && <CheckCircle className="h-4 w-4 text-[hsl(var(--status-green))]" />}
                  {m.calculationStatus === 'yellow' && <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-yellow))]" />}
                  {m.calculationStatus === 'red' && <XCircle className="h-4 w-4 text-[hsl(var(--status-red))]" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
          {[
            { tab: 'geometry', label: 'Geometrie ändern' },
            { tab: 'structure', label: 'Tragwerk / Stützen ändern' },
            { tab: 'loads', label: 'Lasten prüfen' },
            { tab: 'materials', label: 'Holzart ändern' },
            { tab: 'calculation', label: 'Nachweise im Detail' },
            { tab: 'costs', label: 'Kosten-Positionen' },
            { tab: 'review', label: 'Endkontrolle (KI-Gegenprüfung)' },
          ].map((l) => (
            <Button key={l.tab} variant="outline" size="sm" className="gap-1" onClick={() => onNavigate?.(l.tab)}>
              {l.label}<ArrowRight className="h-3 w-3" />
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Nach jeder Änderung in einem Detail-Reiter: dort „Neu berechnen" klicken — Angebot, Statik und 3D hier aktualisieren sich mit.
        </p>
      </SectionCard>
    </div>
  );
}
