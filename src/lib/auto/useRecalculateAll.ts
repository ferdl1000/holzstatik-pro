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
      onUpdate({
        geometry: result.geometry.geometry,
        roofType: result.roofType.roofType,
        structuralSystem: result.structuralSystem.structuralSystem,
        members: result.calculations.optimizedMembers,
        loadCases: result.loads.loadCases,
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
