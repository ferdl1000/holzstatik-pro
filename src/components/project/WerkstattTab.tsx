/**
 * WerkstattTab – CNC-Export, SEMA-Export, Schnittliste, Montage-Reihenfolge
 *
 * Sektionen:
 *  0. SEMA-Export         – IFC, DXF, Komplett-ZIP für Zimmerei-CAD
 *  1. BTL/BTLX-Export    – Hundegger CNC-Maschinen
 *  2. Schnittliste        – FFD-optimiert, pro Material+Querschnitt
 *  3. Montage-Reihenfolge – Schritt-Liste mit Dauer und Kran-Hinweis
 */

import { useMemo, useState } from 'react';
import type { Project } from '@/types/project';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wrench, Download, Clock, AlertTriangle, CheckCircle2, Layers, ChevronsRight, PackageOpen, FileCode2, Box } from 'lucide-react';
import { downloadBTL, exportToBTL } from '@/lib/cnc/btl-export';
import { optimizeCutting } from '@/lib/cnc/schnittliste';
import { montageReihenfolge, gesamtdauer } from '@/lib/cnc/montagereihenfolge';
import { downloadIFC, downloadIFC2x3 } from '@/lib/sema/ifc-export';
import { downloadDXF } from '@/lib/sema/dxf-export';
import { buildProjectZip, downloadZip } from '@/lib/sema/zip-export';
import { downloadStatikCSV } from '@/lib/sema/wallner-mild-export';
import { supabase } from '@/integrations/supabase/client';

interface WerkstattTabProps {
  project: Project;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function mmToM(mm: number): string {
  return (mm / 1000).toFixed(2) + ' m';
}

function wasteColor(pct: number): string {
  if (pct <= 8)  return 'text-green-600 dark:text-green-400';
  if (pct <= 15) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

// ─── Schnittlisten-Balken-Visualisierung ──────────────────────────────────────

function CutBarViz({ bar, stockLen }: { bar: { cuts: { memberName: string; length: number }[]; usedLength: number; wasteLength: number }; stockLen: number }) {
  const BLADE = 3;
  const colors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316'];
  let offset = 0;
  const segments: { x: number; w: number; color: string; label: string }[] = [];

  bar.cuts.forEach((cut, i) => {
    const w = ((cut.length + BLADE) / stockLen) * 100;
    segments.push({ x: offset, w, color: colors[i % colors.length], label: `${cut.memberName} (${mmToM(cut.length)})` });
    offset += w;
  });
  // Verschnitt
  if (bar.wasteLength > 0) {
    segments.push({ x: offset, w: (bar.wasteLength / stockLen) * 100, color: '#e5e7eb', label: `Verschnitt (${mmToM(bar.wasteLength)})` });
  }

  return (
    <div className="relative h-6 rounded overflow-hidden flex" title={segments.map(s => s.label).join(' | ')}>
      {segments.map((s, i) => (
        <div
          key={i}
          style={{ width: `${s.w}%`, backgroundColor: s.color }}
          className="h-full flex-shrink-0"
          title={s.label}
        />
      ))}
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function WerkstattTab({ project }: WerkstattTabProps) {
  const members = project.members ?? [];
  const [zipLoading, setZipLoading] = useState(false);

  const cuttingStocks = useMemo(() => optimizeCutting(members), [members]);
  const montageSchritte = useMemo(() => montageReihenfolge(members), [members]);
  const totalDauer = useMemo(() => gesamtdauer(montageSchritte), [montageSchritte]);

  // ── Komplett-ZIP ──────────────────────────────────────────────────────────
  async function handleZipDownload() {
    setZipLoading(true);
    try {
      // Pläne aus Supabase Storage laden
      const pdfBlobs: { name: string; blob: Blob }[] = [];
      const { data: docs } = await supabase
        .from('documents')
        .select('file_name, file_path')
        .eq('project_id', project.id);

      if (docs) {
        for (const doc of docs) {
          const { data } = await supabase.storage
            .from('plan-documents')
            .download(doc.file_path);
          if (data) {
            pdfBlobs.push({ name: doc.file_name, blob: data });
          }
        }
      }

      // BTL erzeugen
      const btl = exportToBTL(members, project.name);

      const blob = await buildProjectZip({
        project,
        members,
        pdfBlobs,
        btl,
      });

      downloadZip(blob, project.name);
    } catch (err) {
      console.error('ZIP-Export Fehler:', err);
    } finally {
      setZipLoading(false);
    }
  }

  if (members.length === 0) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
        <Wrench className="h-4 w-4" />
        Keine Bauteile vorhanden. Bitte zuerst Tragwerk analysieren.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">

      {/* ── 0. SEMA-Export ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Box className="h-4 w-4 text-purple-500" />
            SEMA-Export (CAD-Import)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Exportiert alle {members.length} Bauteile als BIM/CAD-Datei.
            Direkt importierbar in <strong>SEMA</strong>, <strong>Allplan</strong>, <strong>AutoCAD</strong> und <strong>Revit</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadIFC(project, members)}
              className="gap-2"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              IFC4 herunterladen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadIFC2x3(project, members)}
              className="gap-2"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              IFC2x3 für SEMA 12+
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadDXF(project, members)}
              className="gap-2"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              DXF 3D herunterladen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadStatikCSV(project, members, project.loadCases ?? [])}
              className="gap-2"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Statik-Export (Wallner-Mild)
            </Button>
            <Button
              size="sm"
              onClick={handleZipDownload}
              disabled={zipLoading}
              className="gap-2"
            >
              <PackageOpen className="h-3.5 w-3.5" />
              {zipLoading ? 'Wird erstellt…' : 'Komplett-ZIP'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            <Badge variant="outline" className="text-xs">IFC4</Badge>
            <Badge variant="outline" className="text-xs">IFC2x3</Badge>
            <Badge variant="outline" className="text-xs">DXF R12</Badge>
            <Badge variant="outline" className="text-xs">SEMA 12+</Badge>
            <Badge variant="outline" className="text-xs">Allplan</Badge>
            <Badge variant="outline" className="text-xs">Wallner-Mild</Badge>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p><strong>IFC4:</strong> SEMA 19+, Allplan, Revit</p>
            <p><strong>IFC2x3:</strong> SEMA 12–18, AutoCAD Architecture, ArchiCAD</p>
            <p><strong>DXF:</strong> Universell (jede CAD-Software, auch SEMA importiert es als 3D-Solids)</p>
            <p><strong>Statik-CSV:</strong> Wallner-Mild, BTS Holzbau, Statik4U (Spalten-Mapping nötig)</p>
            <p><strong>Komplett-ZIP</strong> enthält IFC4, IFC2x3, DXF, Statik-CSV, BTL (Hundegger) und alle Original-Pläne.</p>
          </div>
        </CardContent>
      </Card>

      {/* ── 1. BTL/BTLX-Export ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-blue-500" />
            BTLX-Export für Hundegger CNC
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Exportiert alle {members.length} Bauteile im BTLX 2.2-Format (XML).
            Importierbar in <strong>Hundegger Cambium</strong>, <strong>PrIO</strong> sowie
            <strong> Schmidt-Kunz Manager</strong>.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              size="sm"
              onClick={() => downloadBTL(members, project.name)}
              className="gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              BTLX herunterladen
            </Button>
            <Badge variant="outline" className="text-xs">BTLX 2.2</Badge>
            <Badge variant="outline" className="text-xs">Hundegger kompatibel</Badge>
          </div>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            <li>Alle Querschnitte, Längen und Materialklassen enthalten</li>
            <li>Sparren: First- und Traufschnitt-Kerven vorberechnet</li>
            <li>Bauteil-Rolle (Sparren, Pfette, BSH…) als BTL-Role exportiert</li>
            <li>Stückzahlen pro Bauteiltyp im Quantity-Attribut</li>
          </ul>
        </CardContent>
      </Card>

      {/* ── 2. Schnittliste ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-green-500" />
            Optimierte Schnittliste
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            First-Fit-Decreasing (FFD) Algorithmus — minimiert Verschnitt auf Standard-Stablängen.
          </p>

          {cuttingStocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine auswertbaren Bauteile.</p>
          ) : (
            cuttingStocks.map((stock, si) => (
              <div key={si} className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{stock.material} — {stock.crossSection}</span>
                  <Badge variant="secondary" className="text-xs">{stock.totalBars} Stäbe à {mmToM(stock.stockLength)}</Badge>
                  <span className={`text-xs font-semibold ${wasteColor(stock.wastePercent)}`}>
                    Verschnitt: {stock.wastePercent} %
                  </span>
                </div>

                <div className="space-y-1">
                  {stock.bars.map((bar, bi) => (
                    <div key={bi} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-10 shrink-0">#{bi + 1}</span>
                      <div className="flex-1">
                        <CutBarViz bar={bar} stockLen={stock.stockLength} />
                      </div>
                      <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">
                        {bar.cuts.length} Schnitte
                      </span>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-muted-foreground">
                  Nutzholz: {mmToM(stock.totalUsed_mm)} · Verschnitt: {mmToM(stock.totalWaste_mm)}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── 3. Montage-Reihenfolge ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ChevronsRight className="h-4 w-4 text-orange-500" />
            Montage-Reihenfolge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Gesamtdauer: <strong className="text-foreground ml-1">{totalDauer} h</strong>
              <span className="ml-1">(2-Mann-Trupp, Richtwert)</span>
            </span>
          </div>

          <ol className="space-y-3">
            {montageSchritte.map((schritt) => (
              <li key={schritt.reihenfolge} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {schritt.reihenfolge}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{schritt.label}</span>
                    <Badge variant="outline" className="text-xs gap-1">
                      <Clock className="h-3 w-3" />{schritt.dauer_h} h
                    </Badge>
                    {schritt.kran_noetig ? (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />Kran erforderlich
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <CheckCircle2 className="h-3 w-3" />kein Kran
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {schritt.bauteile.length} Bauteiltypen,&nbsp;
                      {schritt.bauteile.reduce((s, m) => s + m.quantity, 0)} Stk.
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{schritt.hinweis}</p>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {schritt.bauteile.map(m => (
                      <Badge key={m.id} variant="outline" className="text-xs">
                        {m.name} ({m.quantity}×)
                      </Badge>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

    </div>
  );
}
