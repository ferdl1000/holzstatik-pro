import { useState } from 'react';
import type { Project } from '@/types/project';
import { useToast } from '@/hooks/use-toast';
import { runAutoPipeline } from '@/lib/auto/autoPipeline';

/**
 * Zentrale "Alles neu berechnen"-Logik: Geometrie → Bauteile → Lasten → Bemessung
 * mit dem aktuellen Projektstand neu durchlaufen. Von RecalculateAllButton (manueller
 * Klick in jedem Reiter) UND von AddressTab (automatisch nach Adress-Bestätigung)
 * gemeinsam genutzt, damit beide Wege exakt dasselbe tun.
 */
export function useRecalculateAll(project: Project, onUpdate?: (updates: Partial<Project>) => void) {
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  async function recalculate(opts?: { silentSuccessTitle?: string; projectOverride?: Project }) {
    if (!onUpdate) return;
    setRunning(true);
    try {
      const result = await runAutoPipeline({ project: opts?.projectOverride ?? project, sparrenSpacing: 0.8, useOptimizer: true });
      // Angebot, Annahmen und Stoßstellen mitspeichern — sonst sind sie nach
      // einem Reload weg und der Meister sieht nur noch die Bauteilliste.
      const angebot = result.costs?.withLabor;
      const autoRun: Project['autoRun'] = {
        ranAt: new Date().toISOString(),
        summary: result.summary,
        assumptions: (result.allAssumptions ?? []).map(a => ({
          field: a.field, value: a.value, reason: a.reason, source: a.source,
        })),
        ...(angebot ? {
          kosten: {
            net: angebot.net,
            gross: angebot.gross,
            positions: angebot.positions.map(p => ({
              category: p.category, description: p.description, quantity: p.quantity,
              unit: p.unit, unitPrice: p.unitPrice, total: p.total, notes: p.notes,
            })),
            surcharges: angebot.appliedSurcharges.map(s => ({ name: s.name, percent: s.percent, amount: s.amount })),
          },
        } : {}),
        ...(result.joints ? {
          joints: result.joints.map(j => ({ type: j.type, position: j.position, notes: j.notes, extraCost: j.extraCost })),
        } : {}),
        ...(result.gegenpruefung ? {
          gegenpruefung: {
            bestanden: result.gegenpruefung.bestanden,
            befunde: result.gegenpruefung.befunde.map(b => ({
              id: b.id, schwere: b.schwere, titel: b.titel,
              erwartet: b.erwartet, gefunden: b.gefunden, bedeutung: b.bedeutung,
            })),
          },
        } : {}),
      };
      onUpdate({
        geometry: result.geometry.geometry,
        roofType: result.roofType.roofType,
        structuralSystem: result.structuralSystem.structuralSystem,
        members: result.calculations.optimizedMembers,
        loadCases: result.loads.loadCases,
        autoRun,
        ...(result.roofParts ? { roofParts: result.roofParts } : {}),
      });
      toast({ title: opts?.silentSuccessTitle ?? 'Neu berechnet', description: result.summary });
      return result;
    } catch (e) {
      toast({
        title: 'Neuberechnung fehlgeschlagen',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
      return null;
    } finally {
      setRunning(false);
    }
  }

  return { recalculate, running };
}
