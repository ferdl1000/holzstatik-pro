import type { Project } from '@/types/project';

interface RoofVisualizationProps {
  project: Project;
  width?: number;
  height?: number;
}

export function RoofVisualization({ project, width = 700, height = 350 }: RoofVisualizationProps) {
  const geo = project.geometry;
  const sys = project.structuralSystem;
  if (!geo) return null;

  const buildingWidth = geo.width.value || 8;
  const eavesH = geo.eavesHeight.value || 6;
  const ridgeH = geo.ridgeHeight.value || 9;
  const pitch = geo.roofPitch.value || 35;
  const roofH = ridgeH - eavesH;

  // SVG coordinate system
  const padding = 50;
  const svgW = width;
  const svgH = height;
  const drawW = svgW - 2 * padding;
  const drawH = svgH - 2 * padding;

  // Scale factor
  const totalH = ridgeH;
  const scaleX = drawW / (buildingWidth + 2);
  const scaleY = drawH / (totalH + 1);
  const scale = Math.min(scaleX, scaleY);

  // Origin bottom-left of building
  const ox = padding + (drawW - buildingWidth * scale) / 2;
  const oy = svgH - padding;

  const px = (x: number) => ox + x * scale;
  const py = (y: number) => oy - y * scale;

  // Key points
  const wallLeft = { x: 0, y: 0 };
  const wallRight = { x: buildingWidth, y: 0 };
  const eavesLeft = { x: 0, y: eavesH };
  const eavesRight = { x: buildingWidth, y: eavesH };
  const ridge = { x: buildingWidth / 2, y: ridgeH };

  // Members
  const isSymmetric = geo.isSymmetric;
  const hasMittelpfette = sys?.type === 'pfettendach_mittelpfette';
  const sparrenAbstand = 0.8;
  const numSparren = Math.floor(buildingWidth / 2 / sparrenAbstand);

  // Pfetten positions
  const pfetteY = eavesH + roofH * 0.5;
  const pfetteXLeft = buildingWidth / 2 * 0.5;
  const pfetteXRight = buildingWidth - pfetteXLeft;

  const memberColor = 'hsl(var(--primary))';
  const dimensionColor = 'hsl(var(--muted-foreground))';
  const fillColor = 'hsl(var(--primary) / 0.08)';
  const supportColor = 'hsl(var(--accent))';

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full h-full"
      style={{ maxHeight: height }}
    >
      {/* Background */}
      <rect width={svgW} height={svgH} fill="transparent" />

      {/* Ground line */}
      <line
        x1={px(-0.5)} y1={py(0)} x2={px(buildingWidth + 0.5)} y2={py(0)}
        stroke={dimensionColor} strokeWidth={1} strokeDasharray="4 2"
      />

      {/* Walls */}
      <line x1={px(wallLeft.x)} y1={py(wallLeft.y)} x2={px(eavesLeft.x)} y2={py(eavesLeft.y)}
        stroke={memberColor} strokeWidth={2.5} />
      <line x1={px(wallRight.x)} y1={py(wallRight.y)} x2={px(eavesRight.x)} y2={py(eavesRight.y)}
        stroke={memberColor} strokeWidth={2.5} />

      {/* Roof fill */}
      <polygon
        points={`${px(eavesLeft.x)},${py(eavesLeft.y)} ${px(ridge.x)},${py(ridge.y)} ${px(eavesRight.x)},${py(eavesRight.y)}`}
        fill={fillColor}
        stroke="none"
      />

      {/* Roof outline (Sparren outer) */}
      <line x1={px(eavesLeft.x)} y1={py(eavesLeft.y)} x2={px(ridge.x)} y2={py(ridge.y)}
        stroke={memberColor} strokeWidth={2.5} />
      <line x1={px(ridge.x)} y1={py(ridge.y)} x2={px(eavesRight.x)} y2={py(eavesRight.y)}
        stroke={memberColor} strokeWidth={2.5} />

      {/* Individual Sparren (left side) */}
      {Array.from({ length: numSparren }).map((_, i) => {
        const t = (i + 1) / (numSparren + 1);
        const sx = t * buildingWidth / 2;
        const sy = eavesH + t * roofH;
        return (
          <line key={`sl-${i}`}
            x1={px(sx)} y1={py(eavesH)} x2={px(sx)} y2={py(sy)}
            stroke={memberColor} strokeWidth={1} opacity={0.4}
          />
        );
      })}

      {/* Individual Sparren (right side) */}
      {Array.from({ length: numSparren }).map((_, i) => {
        const t = (i + 1) / (numSparren + 1);
        const sx = buildingWidth - t * buildingWidth / 2;
        const sy = eavesH + t * roofH;
        return (
          <line key={`sr-${i}`}
            x1={px(sx)} y1={py(eavesH)} x2={px(sx)} y2={py(sy)}
            stroke={memberColor} strokeWidth={1} opacity={0.4}
          />
        );
      })}

      {/* Firstpfette */}
      <circle cx={px(ridge.x)} cy={py(ridge.y)} r={5} fill={supportColor} />
      <text x={px(ridge.x)} y={py(ridge.y) - 10} textAnchor="middle"
        className="text-[9px] fill-muted-foreground font-mono">Firstpfette</text>

      {/* Fußpfetten */}
      <circle cx={px(eavesLeft.x)} cy={py(eavesLeft.y)} r={5} fill={supportColor} />
      <circle cx={px(eavesRight.x)} cy={py(eavesRight.y)} r={5} fill={supportColor} />
      <text x={px(eavesLeft.x) - 5} y={py(eavesLeft.y) + 15} textAnchor="end"
        className="text-[9px] fill-muted-foreground font-mono">Fußpfette</text>

      {/* Mittelpfetten */}
      {hasMittelpfette && (
        <>
          <circle cx={px(pfetteXLeft)} cy={py(pfetteY)} r={5} fill="hsl(var(--accent))" />
          <circle cx={px(pfetteXRight)} cy={py(pfetteY)} r={5} fill="hsl(var(--accent))" />
          <text x={px(pfetteXLeft)} y={py(pfetteY) - 10} textAnchor="middle"
            className="text-[9px] fill-muted-foreground font-mono">Mittelpfette</text>

          {/* Stützen unter Mittelpfetten */}
          <line x1={px(pfetteXLeft)} y1={py(0)} x2={px(pfetteXLeft)} y2={py(pfetteY)}
            stroke={memberColor} strokeWidth={2} strokeDasharray="6 3" />
          <line x1={px(pfetteXRight)} y1={py(0)} x2={px(pfetteXRight)} y2={py(pfetteY)}
            stroke={memberColor} strokeWidth={2} strokeDasharray="6 3" />
        </>
      )}

      {/* Stütze unter First */}
      {(sys?.type === 'pfettendach' || sys?.type === 'pfettendach_mittelpfette') && (
        <line x1={px(ridge.x)} y1={py(0)} x2={px(ridge.x)} y2={py(ridge.y)}
          stroke={memberColor} strokeWidth={2} strokeDasharray="6 3" />
      )}

      {/* Kehlbalken */}
      {sys?.type === 'kehlbalkendach' && (
        <line x1={px(buildingWidth * 0.2)} y1={py(eavesH + roofH * 0.4)}
          x2={px(buildingWidth * 0.8)} y2={py(eavesH + roofH * 0.4)}
          stroke={memberColor} strokeWidth={2} />
      )}

      {/* Supports (Auflager-Dreiecke) */}
      {[wallLeft, wallRight].map((pt, i) => (
        <polygon key={`sup-${i}`}
          points={`${px(pt.x)},${py(pt.y)} ${px(pt.x) - 8},${py(pt.y) + 12} ${px(pt.x) + 8},${py(pt.y) + 12}`}
          fill="none" stroke={memberColor} strokeWidth={1.5}
        />
      ))}

      {/* Dimension lines */}
      {/* Width */}
      <line x1={px(0)} y1={py(-0.5)} x2={px(buildingWidth)} y2={py(-0.5)}
        stroke={dimensionColor} strokeWidth={0.5} markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <text x={px(buildingWidth / 2)} y={py(-0.5) + 15} textAnchor="middle"
        className="text-[10px] fill-muted-foreground font-mono">{buildingWidth.toFixed(2)} m</text>

      {/* Eaves height */}
      <line x1={px(-0.5)} y1={py(0)} x2={px(-0.5)} y2={py(eavesH)}
        stroke={dimensionColor} strokeWidth={0.5} />
      <text x={px(-0.5) - 5} y={py(eavesH / 2)} textAnchor="end"
        className="text-[10px] fill-muted-foreground font-mono" transform={`rotate(-90 ${px(-0.5) - 5} ${py(eavesH / 2)})`}>
        TH {eavesH.toFixed(2)} m
      </text>

      {/* Ridge height */}
      <line x1={px(buildingWidth + 0.5)} y1={py(0)} x2={px(buildingWidth + 0.5)} y2={py(ridgeH)}
        stroke={dimensionColor} strokeWidth={0.5} />
      <text x={px(buildingWidth + 0.5) + 5} y={py(ridgeH / 2)} textAnchor="start"
        className="text-[10px] fill-muted-foreground font-mono" transform={`rotate(-90 ${px(buildingWidth + 0.5) + 5} ${py(ridgeH / 2)})`}>
        FH {ridgeH.toFixed(2)} m
      </text>

      {/* Roof pitch angle */}
      <text x={px(buildingWidth * 0.25)} y={py(eavesH + roofH * 0.3)}
        textAnchor="middle"
        className="text-[11px] fill-primary font-mono font-bold">
        {pitch}°
      </text>

      {/* Arrow marker */}
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={dimensionColor} strokeWidth={0.8} />
        </marker>
      </defs>
    </svg>
  );
}
