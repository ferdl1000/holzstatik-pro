import type { Project } from '@/types/project';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useRecalculateAll } from '@/lib/auto/useRecalculateAll';

interface RecalculateAllButtonProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
  /** Optional: Label anpassen, falls der Tab einen spezifischeren Text will. */
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'secondary';
}

/**
 * EIN Button, überall verfügbar: rechnet die komplette Kette (Geometrie → Bauteile
 * → Lasten → Bemessung) mit dem aktuellen Projektstand neu — egal in welchem Reiter
 * zuletzt etwas geändert wurde. Bereits vom Nutzer bestätigte Lasten (siehe
 * autoComputeLoads) werden dabei NICHT stillschweigend überschrieben.
 *
 * Aktualisiert nur geometry/roofType/structuralSystem/members/loadCases/roofParts —
 * Berechnung (CalculationTab), Materialliste, Kosten und 3D-Modell lesen diese Felder
 * bereits live/reaktiv, brauchen also keinen eigenen Zwischenspeicher.
 */
export function RecalculateAllButton({
  project, onUpdate, label = 'Alles neu berechnen', size = 'sm', variant = 'outline',
}: RecalculateAllButtonProps) {
  const { recalculate, running } = useRecalculateAll(project, onUpdate);

  return (
    <Button size={size} variant={variant} className="gap-1.5" onClick={() => recalculate()} disabled={running || !onUpdate}>
      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {running ? 'Berechnet…' : label}
    </Button>
  );
}
