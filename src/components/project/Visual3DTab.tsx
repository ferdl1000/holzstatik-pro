import { Roof3D } from './Roof3D';
import type { Project } from '@/types/project';
import { legacyToRoofPart } from '@/types/roofParts';
import type { RoofPart } from '@/types/roofParts';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface Visual3DTabProps { project: Project; }

export function Visual3DTab({ project }: Visual3DTabProps) {
  const g = project.geometry;
  if (!g || g.length.value <= 0 || g.width.value <= 0) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center gap-3 text-muted-foreground">
          <AlertCircle className="h-5 w-5" />
          Geometrie muss eingegeben sein, damit das 3D-Modell aufgebaut werden kann.
        </CardContent>
      </Card>
    );
  }

  // Derive utilizations from calculations
  const utilizations: Record<string, number> = {};
  for (const calc of project.calculations || []) {
    const eta = Math.max(...calc.checks.map(c => c.result / c.limit));
    utilizations[calc.memberId] = eta;
  }

  // Resolve roofParts: use project.roofParts if available (multi-part buildings),
  // otherwise fall back to legacy single-roof model
  const projectWithParts = project as Project & { roofParts?: RoofPart[] };
  let roofParts: RoofPart[];

  if (projectWithParts.roofParts && projectWithParts.roofParts.length > 0) {
    roofParts = projectWithParts.roofParts;
  } else {
    const legacyPart = legacyToRoofPart(
      g,
      project.roofType?.form ?? 'satteldach',
      project.members ?? [],
    );
    roofParts = legacyPart ? [legacyPart] : [];
  }

  if (roofParts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center gap-3 text-muted-foreground">
          <AlertCircle className="h-5 w-5" />
          Keine Dachteile verfügbar. Bitte Geometrie und Bauteile vollständig erfassen.
        </CardContent>
      </Card>
    );
  }

  return (
    <Roof3D
      roofParts={roofParts}
      utilizations={utilizations}
    />
  );
}
