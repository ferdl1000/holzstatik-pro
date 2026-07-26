import type { Project, TimberMember, RoofFormType } from '@/types/project';
import { DEFAULT_ROOF_OVERHANG } from '@/lib/calc/roofArea';

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

// ─── Reine Schnitt-Geometrie (ohne SVG) ───────────────────────────────────────
// Alles, was im Schnitt eine echte Koordinate hat, wird HIER gerechnet — damit es
// numerisch prüfbar ist (siehe __tests__/ansichtGeometrie.test.ts). Die SVG-Ebene
// darunter macht nur noch Maßstab und Farbe.

/** Ein Sparren im Schnitt: Ober- und Unterkante vom First bis zum Traufende. */
export interface AnsichtSparren {
  /** Oberkante am First [m] (x quer zum First, y Höhe über Boden) */
  okFirst: [number, number];
  /** Oberkante am Sparrenende (inkl. Dachüberstand) */
  okTraufe: [number, number];
  ukFirst: [number, number];
  ukTraufe: [number, number];
  /** aus den Endpunkten der Oberkante zurückgerechnete Neigung [°] */
  neigungGrad: number;
  /** Länge der Oberkante = Sparrenlänge inkl. Überstand [m] */
  laenge: number;
}

export interface AnsichtGeometrie {
  form: RoofFormType;
  buildingWidth: number;
  eavesH: number;
  ridgeH: number;
  /** höchster Punkt der Dachfläche (Firstpunkt) */
  firstPunkt: [number, number];
  /** Neigung der gezeichneten Dachfläche [°] — muss die Plan-Neigung sein */
  neigungGrad: number;
  /** lotrechte Sparrendicke [m] */
  hVSparren: number;
  sparren: AnsichtSparren[];
  /** Oberkante Firstpfette = Unterkante Sparren an der Firstlinie [m] */
  firstpfetteOkY: number;
  /** Mittelpfetten: Querlage + Oberkante (= Unterkante Sparren an dieser Stelle) */
  mittelpfetten: { x: number; okY: number }[];
}

/**
 * Rechnet den Querschnitt (Schnitt senkrecht zum First) in Metern.
 *
 * Bezugslinie ist die SPARREN-OBERKANTE: sie läuft durch den Firstpunkt
 * (Firsthöhe) und den Traufpunkt (Traufhöhe) — genau die Linie, aus der auch
 * ridgeHeight = eavesHeight + tan(α)·Lauf stammt. Der Sparren reicht deshalb
 * immer bis zum First; die Firstpfette liegt um die lotrechte Sparrendicke
 * darunter, sodass der Sparren AUF ihr aufliegt.
 */
export function ansichtGeometrie(input: {
  buildingWidth: number;
  eavesH: number;
  ridgeH: number;
  form?: RoofFormType;
  /** Sparrenhöhe [m] aus der Bauteilliste */
  sparrenHoehe?: number;
  /** Sparrenlänge [m] aus der Bauteilliste — daraus kommt der gezeichnete Überstand */
  sparrenLaenge?: number;
  /** Dachüberstand [m] — Ersatzwert, falls keine Sparrenlänge vorliegt */
  ueberstand?: number;
}): AnsichtGeometrie {
  const B = Math.max(0.1, input.buildingWidth);
  const eavesH = input.eavesH;
  const form: RoofFormType = input.form ?? 'satteldach';
  const isPult = form === 'pultdach';
  const isFlach = form === 'flachdach';
  const ridgeH = isFlach ? eavesH : Math.max(input.ridgeH, eavesH);
  const rise = ridgeH - eavesH;

  // Waagrechte Sparrenprojektion: Pultdach volle Breite, sonst halbe Breite.
  const lauf = isPult ? B : B / 2;
  const tan = isFlach ? 0 : rise / lauf;
  const angle = Math.atan(tan);
  const cos = Math.max(Math.cos(angle), 1e-3);
  const hV = (input.sparrenHoehe ?? 0.16) / Math.max(Math.cos(angle), 0.5);

  // Dachflächenlänge eines Sparrens (ohne Überstand)
  const flaechenLen = Math.sqrt(lauf * lauf + rise * rise);
  // Der gezeichnete Überstand kommt aus der BEMESSENEN Sparrenlänge — nur dann
  // zeigt der Schnitt dieselbe Länge, die bestellt und gerechnet wurde.
  // BEWUSSTE FESTLEGUNG: der gesamte Überstand wird an der TRAUFE angetragen.
  // Wie er sich beim Pultdach auf Trauf- und Firstseite aufteilt, steht weder in
  // `members` noch in `geometry`; so bleibt der Hochpunkt exakt auf Firsthöhe.
  const ovSchraege = input.sparrenLaenge && input.sparrenLaenge > flaechenLen
    ? input.sparrenLaenge - flaechenLen
    : Math.max(0, input.ueberstand ?? DEFAULT_ROOF_OVERHANG) / cos;
  const ov = ovSchraege * cos; // waagrechte Projektion des Überstands

  const firstX = isPult ? 0 : B / 2;
  const firstPunkt: [number, number] = [firstX, ridgeH];

  // Traufseiten: Satteldach links + rechts, Pult-/Flachdach nur die Tiefseite.
  const seiten: number[] = isPult || isFlach ? [1] : [-1, 1];
  const sparren: AnsichtSparren[] = seiten.map((side) => {
    const traufeX = side < 0 ? -ov : B + ov;
    const traufeY = eavesH - ov * tan;
    const okFirst: [number, number] = [firstX, ridgeH];
    const okTraufe: [number, number] = [traufeX, traufeY];
    const dx = Math.abs(okTraufe[0] - okFirst[0]);
    const dy = Math.abs(okFirst[1] - okTraufe[1]);
    return {
      okFirst,
      okTraufe,
      ukFirst: [okFirst[0], okFirst[1] - hV],
      ukTraufe: [okTraufe[0], okTraufe[1] - hV],
      neigungGrad: (Math.atan2(dy, dx) * 180) / Math.PI,
      laenge: Math.sqrt(dx * dx + dy * dy),
    };
  });

  /** Oberkante Sparren über der Querlage x */
  const okSparren = (x: number) => ridgeH - Math.abs(x - firstX) * tan;

  const mittelX = isPult || isFlach ? [B / 2] : [B / 4, (3 * B) / 4];

  return {
    form,
    buildingWidth: B,
    eavesH,
    ridgeH,
    firstPunkt,
    neigungGrad: (angle * 180) / Math.PI,
    hVSparren: hV,
    sparren,
    firstpfetteOkY: ridgeH - hV,
    mittelpfetten: mittelX.map((x) => ({ x, okY: okSparren(x) - hV })),
  };
}

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
  const roofH = ridgeH - eavesH;

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

  const sparrenMember = members.find((m) => m.type === 'sparren' || m.type === 'nebentraeger');
  const form: RoofFormType = project.roofType?.form ?? 'satteldach';
  const ansicht = ansichtGeometrie({
    buildingWidth,
    eavesH,
    ridgeH,
    form,
    sparrenHoehe: sparrenMember ? sparrenMember.height / 1000 : undefined,
    sparrenLaenge: sparrenMember?.length,
    ueberstand: project.roofOverhang ?? DEFAULT_ROOF_OVERHANG,
  });
  const isPult = ansicht.form === 'pultdach' || ansicht.form === 'flachdach';
  const [firstX, firstY] = ansicht.firstPunkt;
  // Die bemaßte Neigung ist die GEZEICHNETE — beides kommt aus derselben Rechnung.
  const pitch = ansicht.neigungGrad;

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
  const pt = ([x, y]: [number, number]) => `${px(x)},${py(y)}`;

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

      {/* Walls — beim Pultdach reicht die Hochseite bis zum First */}
      <line x1={px(0)} y1={py(0)} x2={px(0)} y2={py(isPult ? firstY : eavesH)} stroke={memberColor} strokeWidth={2.5} />
      <line x1={px(buildingWidth)} y1={py(0)} x2={px(buildingWidth)} y2={py(eavesH)} stroke={memberColor} strokeWidth={2.5} />

      {/* Roof fill (Dachraum unter der Dachfläche) */}
      <polygon
        points={`${pt([0, eavesH])} ${pt([firstX, firstY])} ${pt([buildingWidth, eavesH])}`}
        fill={fillColor} stroke="none" />

      {/* Dachfläche = Sparren-Oberkante (dieselben Punkte wie die Sparren unten) */}
      {ansicht.sparren.map((s, i) => (
        <line key={`ok-${i}`} x1={px(s.okFirst[0])} y1={py(s.okFirst[1])} x2={px(s.okTraufe[0])} y2={py(s.okTraufe[1])}
          stroke={memberColor} strokeWidth={2.5} />
      ))}

      {/* Sparren — als echter Holzquerschnitt vom Traufende BIS ZUM FIRST.
          (Früher standen hier senkrechte Striche, die kurz vor dem First endeten:
          genau die Reklamation „der Sparren geht nicht bis oben zur Firstpfette".) */}
      {ansicht.sparren.map((s, i) => (
        <polygon key={`spr-${i}`}
          points={`${pt(s.okFirst)} ${pt(s.okTraufe)} ${pt(s.ukTraufe)} ${pt(s.ukFirst)}`}
          fill={fillColor} stroke={memberColor} strokeWidth={1.2} />
      ))}
      {posOf('sparren') && (
        <PosLabel
          x={px((ansicht.sparren[0].okFirst[0] + ansicht.sparren[0].okTraufe[0]) / 2)}
          y={py((ansicht.sparren[0].okFirst[1] + ansicht.sparren[0].okTraufe[1]) / 2) - 10}
          text={posOf('sparren')} />
      )}

      {/* Firstpfette — nur wenn sie in der Bauteilliste steht (Sparren-/Kehlbalkendach hat keine).
          Sie liegt UNTER dem Sparren: Oberkante Pfette = Unterkante Sparren am First. */}
      {hasFirstpfette && !isPult && (
        <>
          <circle cx={px(firstX)} cy={py(ansicht.firstpfetteOkY)} r={5} fill={supportColor} />
          <PosLabel x={px(firstX)} y={py(ansicht.firstpfetteOkY) + 20} text={posFirstpfette} />
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

      {/* Mittelpfetten — Oberkante an der Sparren-Unterkante */}
      {hasMittelpfette && ansicht.mittelpfetten.map((mp, i) => (
        <circle key={`mp-${i}`} cx={px(mp.x)} cy={py(mp.okY)} r={5} fill={supportColor} />
      ))}
      {hasMittelpfette && (
        <PosLabel x={px(ansicht.mittelpfetten[0].x)} y={py(ansicht.mittelpfetten[0].okY) + 20} text={posMittelpfette} />
      )}

      {/* Steher unter den Mittelpfetten — nur wenn Stützen in der Bauteilliste stehen */}
      {hasMittelpfette && hasStuetzen && ansicht.mittelpfetten.map((mp, i) => (
        <line key={`st-${i}`} x1={px(mp.x)} y1={py(0)} x2={px(mp.x)} y2={py(mp.okY)}
          stroke={memberColor} strokeWidth={2} strokeDasharray="6 3" />
      ))}
      {hasMittelpfette && hasStuetzen && (
        <PosLabel x={px(ansicht.mittelpfetten[0].x) + 24} y={py(ansicht.mittelpfetten[0].okY * 0.3)} text={posOf('stuetze')} anchor="start" />
      )}

      {/* Firststütze — nur bei Firstpfette MIT Stehern */}
      {hasCentralPost && !isPult && (
        <line x1={px(firstX)} y1={py(0)} x2={px(firstX)} y2={py(ansicht.firstpfetteOkY)} stroke={memberColor} strokeWidth={2} strokeDasharray="6 3" />
      )}

      {/* Kehlbalken */}
      {hasKehlbalken && !isPult && (
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
          textAnchor="middle" className="text-[11px] fill-primary font-mono font-bold">{pitch.toFixed(1)}°</text>
      )}
    </svg>
  );
}
