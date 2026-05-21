/**
 * BillOfMaterialsTab – Bestellliste + Material-Kostenschätzung + Voll-Kalkulation
 *
 * Drei interne Tabs:
 *  1. Bestellliste   – gruppiert nach Lieferant, editierbare Preise, CSV/PDF-Download
 *  2. Nur Material   – CostEstimate ohne Lohn/Aufschläge
 *  3. Voll-Kalkulation – vollständige CostEstimate mit Lohn + DEFAULT_FACTORS
 */

import { useState, useMemo } from 'react';
import type { Project } from '@/types/project';
import type { OrderListItem } from '@/lib/auto/contracts';
import type { CostPosition } from '@/lib/pricing';
import { autoComputeCosts } from '@/lib/auto/autoCost';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { InfoTooltip } from '@/components/help/InfoTooltip';
import { ShoppingCart, Download, FileText, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BillOfMaterialsTabProps {
  project: Project;
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

function exportOrderListCSV(items: OrderListItem[]): string {
  const lines = ['Lieferant;Beschreibung;Abmessung;Menge;Einheit;EP;GP'];
  for (const it of items) {
    lines.push([
      it.supplier,
      it.description.replace(/;/g, ','),
      it.dimensions || '',
      it.quantity,
      it.unit,
      it.unitPrice.toFixed(2),
      it.total.toFixed(2),
    ].join(';'));
  }
  return lines.join('\n');
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Supplier grouping ─────────────────────────────────────────────────────────

const SUPPLIER_ORDER: OrderListItem['supplier'][] = [
  'Sägewerk', 'Eindeckung', 'Dämmung', 'Folien', 'Verbinder', 'Sonstiges',
];

function groupBySupplier(items: OrderListItem[]): Map<OrderListItem['supplier'], OrderListItem[]> {
  const map = new Map<OrderListItem['supplier'], OrderListItem[]>();
  for (const sup of SUPPLIER_ORDER) map.set(sup, []);
  for (const item of items) {
    map.get(item.supplier)?.push(item);
  }
  // Remove empty groups
  for (const [k, v] of map) { if (v.length === 0) map.delete(k); }
  return map;
}

// ── Cost table (reused for material-only and full calc) ───────────────────────

interface CostTableProps {
  positions: CostPosition[];
  onPriceChange: (id: string, price: number) => void;
  net: number;
  vat: number;
  gross: number;
  surcharges: { name: string; amount: number }[];
}

function CostTable({ positions, onPriceChange, net, vat, gross, surcharges }: CostTableProps) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="grid grid-cols-[2fr_1fr_80px_80px_90px_90px] gap-2 px-3 py-2 bg-muted/50 rounded-md text-xs font-semibold text-muted-foreground">
        <span>Beschreibung</span>
        <span>Kategorie</span>
        <span className="text-right">Menge</span>
        <span>Einheit</span>
        <span className="text-right">EP [€]</span>
        <span className="text-right">GP [€]</span>
      </div>

      {positions.map(p => (
        <div
          key={p.id}
          className="grid grid-cols-[2fr_1fr_80px_80px_90px_90px] gap-2 px-3 py-1.5 rounded-md hover:bg-muted/30 transition-colors text-sm items-center"
        >
          <span className="text-foreground/90">{p.description}</span>
          <span className="text-xs text-muted-foreground">{p.category}</span>
          <span className="text-right tabular-nums">{p.quantity.toLocaleString('de-AT', { maximumFractionDigits: 2 })}</span>
          <span className="text-xs text-muted-foreground">{p.unit}</span>
          <div className="flex justify-end">
            <Input
              type="number"
              value={p.unitPrice}
              step={0.01}
              min={0}
              className="h-7 w-20 text-right text-xs"
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onPriceChange(p.id, v);
              }}
            />
          </div>
          <span className="text-right tabular-nums font-medium">
            {p.total.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}

      {/* Aufschläge + Summen */}
      <div className="mt-2 border-t pt-3 space-y-1.5 text-sm">
        {surcharges.map(s => (
          <div key={s.name} className="flex justify-between text-muted-foreground px-3">
            <span>{s.name}</span>
            <span className="tabular-nums">{s.amount.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
          </div>
        ))}
        <div className="flex justify-between px-3 font-medium">
          <span>Netto</span>
          <span className="tabular-nums">{net.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
        </div>
        <div className="flex justify-between px-3 text-muted-foreground text-xs">
          <span>MwSt</span>
          <span className="tabular-nums">{vat.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
        </div>
        <div className="flex justify-between px-3 py-2 bg-primary/10 rounded-md font-bold text-base">
          <span>Gesamt brutto</span>
          <span className="tabular-nums text-primary">{gross.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BillOfMaterialsTab({ project }: BillOfMaterialsTabProps) {
  const { toast } = useToast();

  // Per-position price overrides (id → unitPrice) for both estimate variants
  const [materialOverrides, setMaterialOverrides] = useState<Record<string, number>>({});
  const [laborOverrides, setLaborOverrides] = useState<Record<string, number>>({});

  // Base computation (memoised)
  const base = useMemo(() => {
    if (!project.geometry) return null;
    return autoComputeCosts(project.members || [], project.geometry);
  }, [project.members, project.geometry]);

  // Apply per-position overrides to CostPosition arrays
  const materialPositions: CostPosition[] = useMemo(() => {
    if (!base) return [];
    return base.materialOnly.positions.map(p => ({
      ...p,
      unitPrice: materialOverrides[p.id] ?? p.unitPrice,
      total: (materialOverrides[p.id] ?? p.unitPrice) * p.quantity,
    }));
  }, [base, materialOverrides]);

  const laborPositions: CostPosition[] = useMemo(() => {
    if (!base) return [];
    return base.withLabor.positions.map(p => ({
      ...p,
      unitPrice: laborOverrides[p.id] ?? p.unitPrice,
      total: (laborOverrides[p.id] ?? p.unitPrice) * p.quantity,
    }));
  }, [base, laborOverrides]);

  // Recalculate totals after overrides
  const materialTotals = useMemo(() => {
    const baseSum = materialPositions.reduce((s, p) => s + p.total, 0);
    const vatRate = base?.materialOnly.factors.vat ?? 20;
    const vat = baseSum * vatRate / 100;
    return { net: baseSum, vat, gross: baseSum + vat };
  }, [materialPositions, base]);

  const laborTotals = useMemo(() => {
    if (!base) return { net: 0, vat: 0, gross: 0 };
    const f = base.withLabor.factors;
    const baseSum = laborPositions.reduce((s, p) => s + p.total, 0);
    const overhead = baseSum * f.overhead / 100;
    const profit = (baseSum + overhead) * f.profit / 100;
    const net = baseSum + overhead + profit;
    const vat = net * f.vat / 100;
    return { net, vat, gross: net + vat, overhead, profit, f };
  }, [laborPositions, base]);

  // Order list with price overrides applied
  const orderList: OrderListItem[] = useMemo(() => {
    if (!base) return [];
    return base.orderList.map(item => {
      // Match by description to find override (positions use same descriptions)
      const matchPos = materialPositions.find(p => p.description === item.description);
      if (matchPos) {
        return { ...item, unitPrice: matchPos.unitPrice, total: matchPos.unitPrice * item.quantity };
      }
      return item;
    });
  }, [base, materialPositions]);

  const grouped = useMemo(() => groupBySupplier(orderList), [orderList]);

  if (!project.geometry) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">Geometrie noch nicht verfügbar. Bitte zuerst Geometrie bestätigen.</p>
        </CardContent>
      </Card>
    );
  }

  if (!base) return null;

  // ── CSV download ──
  const handleCSVDownload = () => {
    const csv = exportOrderListCSV(orderList);
    downloadBlob(csv, `Bestellliste_${project.name.replace(/[^\w-]/g, '_')}.csv`, 'text/csv');
    toast({ title: 'CSV exportiert', description: 'Bestellliste wurde heruntergeladen.' });
  };

  // ── PDF download ──
  const handlePDFDownload = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`Bestellliste – ${project.name}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Erstellt: ${new Date().toLocaleDateString('de-AT')}`, 14, 21);

    let y = 28;
    for (const [supplier, items] of grouped) {
      if (items.length === 0) continue;
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 180);
      doc.text(supplier, 14, y);
      doc.setTextColor(0);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [['Beschreibung', 'Abmessung', 'Menge', 'Einheit', 'EP [€]', 'GP [€]']],
        body: items.map(it => [
          it.description,
          it.dimensions || '',
          it.quantity.toLocaleString('de-AT', { maximumFractionDigits: 2 }),
          it.unit,
          it.unitPrice.toFixed(2),
          it.total.toFixed(2),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 22 },
          2: { cellWidth: 18, halign: 'right' },
          3: { cellWidth: 14 },
          4: { cellWidth: 20, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' },
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      if (y > 260) { doc.addPage(); y = 15; }
    }

    // Summary row
    const total = orderList.reduce((s, i) => s + i.total, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Gesamtsumme Material netto: ${total.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, 14, y + 4);

    doc.save(`Bestellliste_${project.name.replace(/[^\w-]/g, '_')}.pdf`);
    toast({ title: 'PDF exportiert', description: 'Bestellliste wurde als PDF heruntergeladen.' });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Bestellliste &amp; Kalkulation
            <InfoTooltip title="Bestellliste & Kalkulation">
              <p>Automatisch generierter Massenauszug aus den optimierten Bauteilen. Die Preise können pro Position angepasst werden. Die Bestellliste ist nach Lieferant gruppiert und als CSV oder PDF exportierbar.</p>
            </InfoTooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="orderlist">
            <TabsList className="mb-4">
              <TabsTrigger value="orderlist" className="gap-2">
                <Package className="h-4 w-4" />
                Bestellliste
              </TabsTrigger>
              <TabsTrigger value="material" className="gap-2">
                <ShoppingCart className="h-4 w-4" />
                Nur Material
              </TabsTrigger>
              <TabsTrigger value="full" className="gap-2">
                <FileText className="h-4 w-4" />
                Voll-Kalkulation
              </TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Bestellliste ─────────────────────────────────────── */}
            <TabsContent value="orderlist" className="space-y-4">
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleCSVDownload} className="gap-2">
                  <Download className="h-4 w-4" />
                  CSV herunterladen
                </Button>
                <Button variant="outline" size="sm" onClick={handlePDFDownload} className="gap-2">
                  <FileText className="h-4 w-4" />
                  PDF herunterladen
                </Button>
              </div>

              {Array.from(grouped.entries()).map(([supplier, items]) => {
                if (items.length === 0) return null;
                const supplierTotal = items.reduce((s, i) => s + i.total, 0);
                return (
                  <Card key={supplier} className="border-muted">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          {supplier}
                        </span>
                        <span className="text-sm font-medium tabular-nums text-muted-foreground">
                          {supplierTotal.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € netto
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {/* Header row */}
                      <div className="grid grid-cols-[3fr_80px_25px_70px_70px_70px] gap-2 px-2 py-1.5 bg-muted/50 rounded text-xs font-semibold text-muted-foreground mb-1">
                        <span>Beschreibung</span>
                        <span className="text-right">Menge</span>
                        <span>Einh.</span>
                        <span className="text-right">EP [€]</span>
                        <span className="text-right">GP [€]</span>
                        <span />
                      </div>
                      {items.map((item, idx) => {
                        // Find matching materialPosition for live override
                        const matchPos = materialPositions.find(p => p.description === item.description);
                        const overrideKey = matchPos?.id ?? `order_${supplier}_${idx}`;
                        return (
                          <div
                            key={overrideKey}
                            className="grid grid-cols-[3fr_80px_25px_70px_70px_70px] gap-2 px-2 py-1.5 hover:bg-muted/20 rounded text-sm items-center"
                          >
                            <span className="text-foreground/90 text-xs">{item.description}</span>
                            <span className="text-right tabular-nums text-xs">
                              {item.quantity.toLocaleString('de-AT', { maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-xs text-muted-foreground">{item.unit}</span>
                            <div className="flex justify-end">
                              <Input
                                type="number"
                                value={item.unitPrice}
                                step={0.01}
                                min={0}
                                className="h-7 w-[68px] text-right text-xs"
                                onChange={e => {
                                  const v = parseFloat(e.target.value);
                                  if (!isNaN(v) && matchPos) {
                                    setMaterialOverrides(o => ({ ...o, [matchPos.id]: v }));
                                  }
                                }}
                              />
                            </div>
                            <span className="text-right tabular-nums text-xs font-medium">
                              {item.total.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span />
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Grand total */}
              <div className="flex justify-between items-center px-4 py-3 bg-primary/10 rounded-lg font-bold text-base">
                <span>Gesamtsumme Material netto</span>
                <span className="tabular-nums text-primary">
                  {orderList.reduce((s, i) => s + i.total, 0).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
            </TabsContent>

            {/* ── Tab 2: Nur Material ─────────────────────────────────────── */}
            <TabsContent value="material" className="space-y-3">
              <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                <InfoTooltip title="Nur Material">
                  <p>Enthält ausschliesslich Holz, Eindeckung, Dämmung, Folien und Verbinder. Kein Lohn, keine Gemeinkosten- oder Gewinnaufschläge – nur MwSt 20 %. Für reine Einkaufskalkulation geeignet.</p>
                </InfoTooltip>
                <span>Material ohne Lohn/Aufschläge (nur MwSt 20 %)</span>
              </div>
              <CostTable
                positions={materialPositions}
                onPriceChange={(id, price) => setMaterialOverrides(o => ({ ...o, [id]: price }))}
                net={materialTotals.net}
                vat={materialTotals.vat}
                gross={materialTotals.gross}
                surcharges={[
                  { name: `Umsatzsteuer (${base.materialOnly.factors.vat} %)`, amount: materialTotals.vat },
                ]}
              />
            </TabsContent>

            {/* ── Tab 3: Voll-Kalkulation ─────────────────────────────────── */}
            <TabsContent value="full" className="space-y-3">
              <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                <InfoTooltip title="Voll-Kalkulation">
                  <p>Enthält alle Positionen inkl. Zimmermann-Lohn, Gemeinkosten- ({base.withLabor.factors.overhead} %) und Gewinnaufschlag ({base.withLabor.factors.profit} %), sowie MwSt 20 %. Entspricht einem realistischen Angebotspreis.</p>
                </InfoTooltip>
                <span>Material + Lohn + Aufschläge (Angebotspreisbasis)</span>
              </div>
              <CostTable
                positions={laborPositions}
                onPriceChange={(id, price) => setLaborOverrides(o => ({ ...o, [id]: price }))}
                net={laborTotals.net}
                vat={laborTotals.vat}
                gross={laborTotals.gross}
                surcharges={[
                  { name: `Gemeinkosten (${base.withLabor.factors.overhead} %)`, amount: laborTotals.overhead ?? 0 },
                  { name: `Unternehmergewinn (${base.withLabor.factors.profit} %)`, amount: laborTotals.profit ?? 0 },
                  { name: `Umsatzsteuer (${base.withLabor.factors.vat} %)`, amount: laborTotals.vat },
                ]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
