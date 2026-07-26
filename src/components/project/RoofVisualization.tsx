import type { Project, TimberMember } from '@/types/project';

interface RoofVisualizationProps {
  project: Project;
  width?: number;
  height?: number;
  showPositions?: boolean;
}

const POS_PREFIX: Record<string, string> = {
  sparren: 'SP', pfette: 'PF', stuetze: 'ST', zange: 'ZA',
  kehlbalken: 'KB', leimbinder: 'LB', rahm: 'RH', auswechslung: 'AW', nebentraeger: 'NT',
};

export function RoofVisualization({ project, width = 700, height = 400, showPositions = true }: RoofVisualizationProps) {
  const geo = project.geometry;

  if (!geo || geo.width.value <= 0 || geo.eavesHeight.value <= 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
        Keine Geometrie – Schnitt kann nicht dargestellt werden.
      </div>
    );
  }

  const buildingWidth = geo.width.value;
  const eavesH = geo.eavesHeight.value;
  const ridgeH = geo.ridgeHeight.value > eavesH ? geo.ridgeHeight.value : eavesH + 2;
  const pitch = geo.roofPitch.value;
  const roofH = ridgeH - eavesH;

  const padding = 60;
  const svgW = width;
  const svgH = height;
  const drawW = svgW - 2 * padding;
  const drawH = svgH - 2 * padding;

  const scaleX = drawW / (buildingWidth + 2);
  const scaleY = drawH / (ridgeH + 1);
  const scale = Math.min(scaleX, scaleY);

  const ox = padding + (drawW - buildingWidth * scale) / 2;
  const oy = svgH - padding;

  const px = (x: number) => ox + x * scale;
  const py = (y: number) => oy - y * scale;

  // Was gezeichnet wird, entscheidet die ECHTE Bauteilliste — nicht der Tragsystem-Typ.
  // So kann nie eine Mittelpfette/ein Steher im Schnitt stehen, den es in members nicht gibt.
  const members: TimberMember[] = project.members ?? [];
  const pfetten = members.filter((m) => m.type === 'pfette');
  const hasFirstpfette = pfetten.some((m) => /first/i.test(m.name));
  const hasMittelpfette = pfetten.some((m) => /mittel/i.test(m.name));
  const hasFusspfette = pfetten.some((m) => /fuss|fuß|mauerbank/i.test(m.name));
  const hasStuetzen = members.some((m) => m.type === 'stuetze');
  const hasCentralPost = hasFirstpfette && hasStuetzen;
  const hasKehlbalken = members.some((m) => m.type === 'kehlbalken');

  // Sparrenabstand aus dem Plan, sonst Zimmerer-Default 0,80 m — nicht hartcodieren.
  const sparrenAbstand = project.sparrenSpacing && project.sparrenSpacing > 0 ? project.sparrenSpacing : 0.8;
  const numSparren = Math.max(1, Math.floor(buildingWidth / 2 / sparrenAbstand));

  const pfetteY = eavesH + roofH * 0.5;
  const pfetteXLeft = buildingWidth / 2 * 0.5;
  const pfetteXRight = buildingWidth - pfetteXLeft;

  const memberColor = 'hsl(var(--primary))';
  const dimensionColor = 'hsl(var(--muted-foreground))';
  const fillColor = 'hsl(var(--primary) / 0.06)';
  const supportColor = 'hsl(var(--accent))';
  const labelBg = 'hsl(var(--card))';

  const PosLabel = ({ x, y, text, anchor = 'middle' }: { x: number; y: number; text: string; anchor?: string }) => {
    if (!showPositions || !text) return null;
    // Breite aus der echten Textlänge — Positionsnummern werden mit der Bauteilzahl länger.
    const boxW = Math.max(44, text.length * 5.4 + 10);
    return (
      <g>
        <rect x={x - (anchor === 'middle' ? boxW / 2 : anchor === 'end' ? boxW : 0)} y={y - 8} width={boxW} height={14} rx={2}
          fill={labelBg} stroke={memberColor} strokeWidth={0.5} opacity={0.9} />
        <text x={x} y={y + 3} textAnchor={anchor}
          className="text-[8px] fill-primary font-mono font-bold">{text}</text>
      </g>
    );
  };

  // Build position counters from project.members
  const posMap: Record<string, string> = {};
  const typeCount: Record<string, number> = {};
  for (const m of members) {
    const prefix = POS_PREFIX[m.type] || 'XX';
    typeCount[prefix] = (typeCount[prefix] || 0) + 1;
    posMap[m.type + '-' + m.id] = `${prefix}-${String(typeCount[prefix]).padStart(2, '0')}`;
  }
  const posOf = (type: string) => {
    const entry = Object.entries(posMap).find(([k]) => k.startsWith(type + '-'));
    return entry ? entry[1] : '';
  };
  /** Positionsnummer des tatsächlich gemeinten Bauteils (nicht nur des ersten seines Typs). */
  const posOfMember = (pred: (m: TimberMember) => boolean) => {
    const m = members.find(pred);
    return m ? posMap[m.type + '-' + m.id] || '' : '';
  };
  const posFirstpfette = posOfMember((m) => m.type === 'pfette' && /first/i.test(m.name));
  const posMittelpfette = posOfMember((m) => m.type === 'pfette' && /mittel/i.test(m.name));
  const posFusspfette = posOfMember((m) => m.type === 'pfette' && /fuss|fuß|mauerbank/i.test(m.name));

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full" style={{ maxHeight: height }}>
      <rect width={svgW} height={svgH} fill="transparent" />

      {/* Ground */}
      <line x1={px(-0.5)} y1={py(0)} x2={px(buildingWidth + 0.5)} y2={py(0)} stroke={dimensionColor} strokeWidth={1} strokeDasharray="4 2" />

      {/* Walls */}
      <line x1={px(0)} y1={py(0)} x2={px(0)} y2={py(eavesH)} stroke={memberColor} strokeWidth={2.5} />
      <line x1={px(buildingWidth)} y1={py(0)} x2={px(buildingWidth)} y2={py(eavesH)} stroke={memberColor} strokeWidth={2.5} />

      {/* Roof fill */}
      <polygon points={`${px(0)},${py(eavesH)} ${px(buildingWidth / 2)},${py(ridgeH)} ${px(buildingWidth)},${py(eavesH)}`}
        fill={fillColor} stroke="none" />

      {/* Roof outline */}
      <line x1={px(0)} y1={py(eavesH)} x2={px(buildingWidth / 2)} y2={py(ridgeH)} stroke={memberColor} strokeWidth={2.5} />
      <line x1={px(buildingWidth / 2)} y1={py(ridgeH)} x2={px(buildingWidth)} y2={py(eavesH)} stroke={memberColor} strokeWidth={2.5} />

      {/* Sparren */}
      {Array.from({ length: numSparren }).map((_, i) => {
        const t = (i + 1) / (numSparren + 1);
        const sx = t * buildingWidth / 2;
        const sy = eavesH + t * roofH;
        return <line key={`sl-${i}`} x1={px(sx)} y1={py(eavesH)} x2={px(sx)} y2={py(sy)} stroke={memberColor} strokeWidth={1} opacity={0.35} />;
      })}
      {Array.from({ length: numSparren }).map((_, i) => {
        const t = (i + 1) / (numSparren + 1);
        const sx = buildingWidth - t * buildingWidth / 2;
        const sy = eavesH + t * roofH;
        return <line key={`sr-${i}`} x1={px(sx)} y1={py(eavesH)} x2={px(sx)} y2={py(sy)} stroke={memberColor} strokeWidth={1} opacity={0.35} />;
      })}
      {posOf('sparren') && <PosLabel x={px(buildingWidth * 0.18)} y={py(eavesH + roofH * 0.15)} text={posOf('sparren')} />}

      {/* Firstpfette — nur wenn sie in der Bauteilliste steht (Sparren-/Kehlbalkendach hat keine) */}
      {hasFirstpfette && (
        <>
          <circle cx={px(buildingWidth / 2)} cy={py(ridgeH)} r={5} fill={supportColor} />
          <PosLabel x={px(buildingWidth / 2)} y={py(ridgeH) - 14} text={posFirstpfette} />
        </>
      )}

      {/* Fußpfetten (Mauerbank) — liegen auf der Mauerkrone */}
      {hasFusspfette && (
        <>
          <circle cx={px(0)} cy={py(eavesH)} r={5} fill={supportColor} />
          <circle cx={px(buildingWidth)} cy={py(eavesH)} r={5} fill={supportColor} />
          <PosLabel x={px(buildingWidth) - 8} y={py(eavesH) - 12} text={posFusspfette} anchor="end" />
        </>
      )}

      {/* Mittelpfetten */}
      {hasMittelpfette && (
        <>
          <circle cx={px(pfetteXLeft)} cy={py(pfetteY)} r={5} fill={supportColor} />
          <circle cx={px(pfetteXRight)} cy={py(pfetteY)} r={5} fill={supportColor} />
          <PosLabel x={px(pfetteXLeft)} y={py(pfetteY) - 12} text={posMittelpfette} />
        </>
      )}

      {/* Steher unter den Mittelpfetten — nur wenn Stützen in der Bauteilliste stehen */}
      {hasMittelpfette && hasStuetzen && (
        <>
          <line x1={px(pfetteXLeft)} y1={py(0)} x2={px(pfetteXLeft)} y2={py(pfetteY)} stroke={memberColor} strokeWidth={2} strokeDasharray="6 3" />
          <line x1={px(pfetteXRight)} y1={py(0)} x2={px(pfetteXRight)} y2={py(pfetteY)} stroke={memberColor} strokeWidth={2} strokeDasharray="6 3" />
          <PosLabel x={px(pfetteXLeft) + 24} y={py(pfetteY * 0.3)} text={posOf('stuetze')} anchor="start" />
        </>
      )}

      {/* Firststütze — nur bei Firstpfette MIT Stehern */}
      {hasCentralPost && (
        <line x1={px(buildingWidth / 2)} y1={py(0)} x2={px(buildingWidth / 2)} y2={py(ridgeH)} stroke={memberColor} strokeWidth={2} strokeDasharray="6 3" />
      )}

      {/* Kehlbalken */}
      {hasKehlbalken && (
        <>
          <line x1={px(buildingWidth * 0.2)} y1={py(eavesH + roofH * 0.4)}
            x2={px(buildingWidth * 0.8)} y2={py(eavesH + roofH * 0.4)} stroke={memberColor} strokeWidth={2} />
          <PosLabel x={px(buildingWidth * 0.5)} y={py(eavesH + roofH * 0.4) - 8} text={posOf('kehlbalken')} />
        </>
      )}

      {/* Auflager */}
      {[0, buildingWidth].map((x, i) => (
        <polygon key={`sup-${i}`}
          points={`${px(x)},${py(0)} ${px(x) - 8},${py(0) + 12} ${px(x) + 8},${py(0) + 12}`}
          fill="none" stroke={memberColor} strokeWidth={1.5} />
      ))}

      {/* Dimensions */}
      <line x1={px(0)} y1={py(-0.6)} x2={px(buildingWidth)} y2={py(-0.6)} stroke={dimensionColor} strokeWidth={0.5} />
      <text x={px(buildingWidth / 2)} y={py(-0.6) + 15} textAnchor="middle"
        className="text-[10px] fill-muted-foreground font-mono">{buildingWidth.toFixed(2)} m</text>

      <line x1={px(-0.6)} y1={py(0)} x2={px(-0.6)} y2={py(eavesH)} stroke={dimensionColor} strokeWidth={0.5} />
      <text x={px(-0.6) - 5} y={py(eavesH / 2)} textAnchor="end"
        className="text-[10px] fill-muted-foreground font-mono"
        transform={`rotate(-90 ${px(-0.6) - 5} ${py(eavesH / 2)})`}>TH {eavesH.toFixed(2)} m</text>

      <line x1={px(buildingWidth + 0.6)} y1={py(0)} x2={px(buildingWidth + 0.6)} y2={py(ridgeH)} stroke={dimensionColor} strokeWidth={0.5} />
      <text x={px(buildingWidth + 0.6) + 5} y={py(ridgeH / 2)} textAnchor="start"
        className="text-[10px] fill-muted-foreground font-mono"
        transform={`rotate(-90 ${px(buildingWidth + 0.6) + 5} ${py(ridgeH / 2)})`}>FH {ridgeH.toFixed(2)} m</text>

      {pitch > 0 && (
        <text x={px(buildingWidth * 0.25)} y={py(eavesH + roofH * 0.25)}
          textAnchor="middle" className="text-[11px] fill-primary font-mono font-bold">{pitch}°</text>
      )}
    </svg>
  );
}
