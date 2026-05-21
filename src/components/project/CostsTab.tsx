import { useState, useMemo } from 'react';
import type { Project } from '@/types/project';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Euro, Download, Save, FileSpreadsheet } from 'lucide-react';
import { estimateCost, exportEstimateAsCSV, DEFAULT_PRICES, DEFAULT_FACTORS, type PricingFactors, type CostPosition, type PositionPriceOverride } from '@/lib/pricing';
import { InfoTooltip } from '@/components/help/InfoTooltip';
import { useToast } from '@/hooks/use-toast';

interface CostsTabProps { project: Project; }

export function CostsTab({ project }: CostsTabProps) {
  const [factors, setFactors] = useState<PricingFactors>(DEFAULT_FACTORS);
  const [coveringId, setCoveringId] = useState('tile_clay');
  const [insulationId, setInsulationId] = useState('ins_mw_200');
  const [overrides, setOverrides] = useState<PositionPriceOverride[]>([]);
  const { toast } = useToast();

  const roofArea = useMemo(() => {
    if (!project.geometry) return 0;
    const L = project.geometry.length.value;
    const W = project.geometry.width.value;
    const pitch = project.geometry.roofPitch.value;
    return Math.round(L * (W / Math.cos((pitch * Math.PI) / 180)) * 10) / 10;
  }, [project.geometry]);

  const groundArea = useMemo(() => {
    if (!project.geometry) return 0;
    return project.geometry.length.value * project.geometry.width.value;
  }, [project.geometry]);

  const hasGlulam = (project.members || []).some(m => (m.material || '').toLowerCase().includes('gl'));

  const estimate = useMemo(() => estimateCost({
    members: project.members || [],
    roofArea, groundArea, coveringId, insulationId,
    membraneIds: ['mem_under', 'mem_vapor'],
    hasGlulam,
    factors, overrides,
  }), [project.members, roofArea, groundArea, coveringId, insulationId, hasGlulam, factors, overrides]);

  const updateFactor = (k: keyof PricingFactors, v: number) => {
    setFactors(f => ({ ...f, [k]: v }));
  };

  const overridePrice = (position: CostPosition, newPrice: number) => {
    setOverrides(o => {
      const filtered = o.filter(x => x.priceItemId !== position.id);
      return [...filtered, { priceItemId: position.id, price: newPrice, reason: 'Benutzer-Override' }];
    });
  };

  const downloadCSV = () => {
    const csv = exportEstimateAsCSV(estimate);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kostenschätzung_${project.name.replace(/[^\w-]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exportiert' });
  };

  const coverings = DEFAULT_PRICES.filter(p => p.category === 'covering');
  const insulations = DEFAULT_PRICES.filter(p => p.category === 'insulation');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Euro className="h-5 w-5 text-primary" />
            Kostenschätzung
            <InfoTooltip title="Kostenschätzung">
              <p>Automatische Schätzung basierend auf Holzvolumen, Dach-/Grundfläche und Standardpreisen. Pro Position kannst du Preise überschreiben (Spalte "EP"). Faktoren wie Verschnitt oder Lohnaufschlag rechts justierbar.</p>
            </InfoTooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="rounded border bg-muted/30 p-2">
              <div className="text-muted-foreground">Dachfläche</div>
              <div className="font-mono text-base">{roofArea} m²</div>
            </div>
            <div className="rounded border bg-muted/30 p-2">
              <div className="text-muted-foreground">Grundfläche</div>
              <div className="font-mono text-base">{groundArea} m²</div>
            </div>
            <div className="rounded border bg-muted/30 p-2">
              <div className="text-muted-foreground">Bauteile</div>
              <div className="font-mono text-base">{(project.members || []).length}</div>
            </div>
            <div className="rounded border bg-muted/30 p-2">
              <div className="text-muted-foreground">Holz gesamt</div>
              <div className="font-mono text-base">
                {((project.members || []).reduce((s, m) => s + (m.width/1000)*(m.height/1000)*m.length*m.quantity, 0)).toFixed(2)} m³
              </div>
            </div>
          </div>

          <Tabs defaultValue="positions">
            <TabsList>
              <TabsTrigger value="positions">Positionen</TabsTrigger>
              <TabsTrigger value="config">Konfiguration</TabsTrigger>
              <TabsTrigger value="summary">Zusammenfassung</TabsTrigger>
            </TabsList>

            <TabsContent value="positions" className="space-y-3">
              <div className="overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Kategorie</th>
                      <th className="text-left p-2">Beschreibung</th>
                      <th className="text-right p-2">Menge</th>
                      <th className="text-left p-2">Einheit</th>
                      <th className="text-right p-2">EP (€)</th>
                      <th className="text-right p-2">GP (€)</th>
                      <th className="p-2">Quelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.positions.map(p => (
                      <tr key={p.id} className="border-t hover:bg-muted/30">
                        <td className="p-2">{p.category}</td>
                        <td className="p-2">{p.description}</td>
                        <td className="p-2 text-right font-mono">{p.quantity.toLocaleString('de-AT', { maximumFractionDigits: 2 })}</td>
                        <td className="p-2">{p.unit}</td>
                        <td className="p-2 text-right">
                          <Input
                            type="number" step="0.01"
                            defaultValue={p.unitPrice.toFixed(2)}
                            onBlur={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v) && v !== p.unitPrice) overridePrice(p, v);
                            }}
                            className="h-7 text-right font-mono w-24 ml-auto"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-medium">{p.total.toLocaleString('de-AT', { maximumFractionDigits: 2 })}</td>
                        <td className="p-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                            p.source === 'override' ? 'bg-amber-100 text-amber-800' : p.source === 'custom' ? 'bg-blue-100 text-blue-800' : 'bg-muted text-muted-foreground'
                          }`}>{p.source}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button onClick={downloadCSV} size="sm" variant="outline" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" /> CSV-Export
              </Button>
            </TabsContent>

            <TabsContent value="config" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Dacheindeckung</Label>
                  <Select value={coveringId} onValueChange={setCoveringId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {coverings.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.price} €/m²)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Dämmung</Label>
                  <Select value={insulationId} onValueChange={setInsulationId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {insulations.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.price} €/m²)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {([
                  { key: 'wasteTimber', label: 'Verschnitt Holz (%)', tip: 'Typisch 8-15 %' },
                  { key: 'laborMarkup', label: 'Lohnaufschlag (%)', tip: 'Material zu Lohn-Verhältnis' },
                  { key: 'overhead', label: 'Gemeinkosten (%)', tip: 'Büro, Versicherung, Werkzeug' },
                  { key: 'profit', label: 'Gewinn (%)', tip: 'Unternehmergewinn' },
                  { key: 'vat', label: 'MwSt (%)', tip: 'Österreich: 20%' },
                ] as Array<{ key: keyof PricingFactors; label: string; tip: string }>).map(({ key, label, tip }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      {label}
                      <InfoTooltip title={label}><p>{tip}</p></InfoTooltip>
                    </Label>
                    <Input
                      type="number" step="0.1" value={factors[key]}
                      onChange={(e) => updateFactor(key, parseFloat(e.target.value) || 0)}
                      className="font-mono"
                    />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="summary" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Material (Holz)', value: estimate.subtotals.material },
                  { label: 'Eindeckung', value: estimate.subtotals.covering },
                  { label: 'Dämmung + Folien', value: estimate.subtotals.insulation },
                  { label: 'Verbinder', value: estimate.subtotals.fasteners },
                  { label: 'Lohn', value: estimate.subtotals.labor },
                  { label: 'Sonstiges', value: estimate.subtotals.other },
                ].map(s => (
                  <div key={s.label} className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="text-lg font-mono font-medium">{s.value.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €</div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-1">
                {estimate.appliedSurcharges.map(s => (
                  <div key={s.name} className="flex justify-between text-sm">
                    <span>{s.name}</span>
                    <span className="font-mono">{s.amount.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between text-base font-bold">
                  <span>GESAMT brutto</span>
                  <span className="font-mono">{estimate.gross.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €</span>
                </div>
                <div className="text-xs text-muted-foreground">Netto: {estimate.net.toLocaleString('de-AT', { maximumFractionDigits: 0 })} € + MwSt {estimate.vat.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €</div>
              </div>
              <p className="text-xs text-muted-foreground">{estimate.explanation}</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
