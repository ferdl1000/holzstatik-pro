import { Roof3D } from './Roof3D';
import type { Project } from '@/types/project';
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

  const utilizations: Record<string, number> = {};
  for (const calc of project.calculations || []) {
    const eta = Math.max(...calc.checks.map(c => c.result / c.limit));
    utilizations[calc.memberId] = eta;
  }

  return (
    <Roof3D
      length={g.length.value || 10}
      width={g.width.value || 8}
      ridgeHeight={g.ridgeHeight.value || 7}
      eavesHeight={g.eavesHeight.value || 4}
      pitch={g.roofPitch.value || 30}
      roofForm={project.roofType?.form || 'satteldach'}
      members={project.members}
      utilizations={utilizations}
    />
  );
}
