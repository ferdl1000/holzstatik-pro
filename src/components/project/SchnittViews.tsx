/**
 * SVG-Schnittansichten für Zimmerer:
 *  1) Querschnitt (durch Sparren, senkrecht zum First)
 *  2) Längsschnitt (parallel zum First)
 *  3) Detail Traufe (Sparren-Fußpfette-Auflager)
 */

import type { BuildingGeometry, TimberMember } from '@/types/project';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Scissors } from 'lucide-react';

export interface SchnittViewsProps {
  geometry: BuildingGeometry;
  roofForm: string;
  members: TimberMember[];
  coveringName?: string;
  /**
   * Dachüberstand [m] — DERSELBE Wert, mit dem autoMembers die Sparrenlänge und
   * die Dachfläche vergrößert hat. Ohne Angabe gilt der Regelwert.
   */
  roofOverhang?: number;
}

/** Regelwert Dachüberstand [m] — identisch zu autoMembers.ts (`opts?.roofOverhang ?? 0.4`). */
const DEFAULT_ROOF_OVERHANG = 0.4;

// ── Formatting helpers ──────────────────────────────────────────────────────
function fmt(m: number): string {
  if (m < 1) return `${Math.round(m * 1000)} mm`;
  return `${m.toFixed(2)} m`;
}
function fmtDeg(deg: number): string {
  return `${Math.round(deg)}°`;
}

// ── Bemaßungs-Linie ─────────────────────────────────────────────────────────
function Dim({
  x1, y1, x2, y2, label, offset = 14, flip = false,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; offset?: number; flip?: boolean;
}) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const sign = flip ? -1 : 1;
  const lx = (x1 + x2) / 2 + nx * sign * offset;
  const ly = (y1 + y2) / 2 + ny * sign * offset;
  const ax1 = x1 + ux * 6, ay1 = y1 + uy * 6;
  const ax2 = x2 - ux * 6, ay2 = y2 - uy * 6;
  const color = '#888';
  return (
    <g>
      {/* Maßlinie */}
      <line x1={ax1} y1={ay1} x2={ax2} y2={ay2} stroke={color} strokeWidth={0.8} />
      {/* Pfeile */}
      <polygon
        points={`${x1},${y1} ${x1 + ux * 9 + nx * 3},${y1 + uy * 9 + ny * 3} ${x1 + ux * 9 - nx * 3},${y1 + uy * 9 - ny * 3}`}
        fill={color}
      />
      <polygon
        points={`${x2},${y2} ${x2 - ux * 9 + nx * 3},${y2 - uy * 9 + ny * 3} ${x2 - ux * 9 - nx * 3},${y2 - uy * 9 - ny * 3}`}
        fill={color}
      />
      {/* Endstriche */}
      <line x1={x1 + nx * 5} y1={y1 + ny * 5} x2={x1 - nx * 5} y2={y1 - ny * 5} stroke={color} strokeWidth={0.7} />
      <line x1={x2 + nx * 5} y1={y2 + ny * 5} x2={x2 - nx * 5} y2={y2 - ny * 5} stroke={color} strokeWidth={0.7} />
      {/* Label */}
      <text
        x={lx} y={ly}
        fill="#222" fontSize={11} fontFamily="sans-serif"
        textAnchor="middle" dominantBaseline="middle"
      >{label}</text>
    </g>
  );
}

// ── Schraffuren ─────────────────────────────────────────────────────────────
// Holz = warm/beige, BAUSEITS (Mauerwerk, Beton, Auflager, Innenwände) = GRAU.
// Der Zimmermeister muss auf einen Blick sehen, was er liefert und was der
// Baumeister vorher fertig haben muss.
export const BAUSEITS_FILL = '#d4d4d8';
export const BAUSEITS_STROKE = '#71717a';

function WoodPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6">
        <rect width="6" height="6" fill="#f5e9d5" />
        <line x1="0" y1="6" x2="6" y2="0" stroke="#c9b48a" strokeWidth={0.6} />
      </pattern>
      {/* Mauerwerk/bauseits: neutrale graue Kreuzschraffur, klar vom Holz unterscheidbar */}
      <pattern id={`${id}-bauseits`} patternUnits="userSpaceOnUse" width="7" height="7">
        <rect width="7" height="7" fill={BAUSEITS_FILL} />
        <line x1="0" y1="7" x2="7" y2="0" stroke={BAUSEITS_STROKE} strokeWidth={0.5} />
        <line x1="0" y1="0" x2="7" y2="7" stroke={BAUSEITS_STROKE} strokeWidth={0.5} />
      </pattern>
    </defs>
  );
}

/** Kleine Legende, die Holz und bauseitige Leistung auseinanderhält. */
function BauseitsLegende({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={12} height={9} fill="#f5e9d5" stroke="#c9b48a" strokeWidth={0.8} />
      <text x={x + 16} y={y + 8} fontSize={8} fill="#475569">Holz (Zimmerei)</text>
      <rect x={x + 100} y={y} width={12} height={9} fill={BAUSEITS_FILL} stroke={BAUSEITS_STROKE} strokeWidth={0.8} />
      <text x={x + 116} y={y + 8} fontSize={8} fill="#475569">bauseits (Mauerwerk/Beton)</text>
    </g>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1) QUERSCHNITT
// ════════════════════════════════════════════════════════════════════════════
function Querschnitt({ geometry, members, coveringName, roofForm, roofOverhang }: { geometry: BuildingGeometry; members: TimberMember[]; coveringName?: string; roofForm?: string; roofOverhang?: number }) {
  const W = 800, H = 500;
  const pad = { l: 80, r: 80, t: 60, b: 70 };

  const bldW = geometry.width.value;      // m
  const ridgeH = geometry.ridgeHeight.value;  // m
  const eavesH = geometry.eavesHeight.value;  // m
  const pitchDeg = geometry.roofPitch.value;  // °
  const pitchRad = (pitchDeg * Math.PI) / 180;

  const drawW = W - pad.l - pad.r;
  const drawH = H - pad.t - pad.b;

  // EIN Maßstab für ALLES — Gebäudemaße wie Holzquerschnitte. Nur so stimmt die
  // gezeichnete Dachneigung mit der bemaßten überein und ein 10/22-Pfettenholz
  // ist im Bild auch 10/22.
  const s = Math.min(drawW / Math.max(bldW, 0.1), drawH / Math.max(ridgeH * 1.15, 0.1));
  const xOff = (drawW - bldW * s) / 2;   // waagrecht zentriert

  // SVG koordinaten (y zeigt nach unten, 0 = Boden)
  const toSX = (mx: number) => pad.l + xOff + mx * s;
  const toSY = (my: number) => pad.t + drawH - my * s;
  /** Querschnittsmaß [mm] → px, im selben Maßstab (2 px nur als Sichtbarkeits-Untergrenze) */
  const px = (mm: number) => Math.max(2, (mm / 1000) * s);

  const isPult = roofForm === 'pultdach';
  const isFlach = roofForm === 'flachdach';

  // Geometrie-Punkte
  const xL = 0, xR = bldW, xM = bldW / 2;
  const yGround = 0;
  const yEaves = eavesH;
  const yRidge = ridgeH;
  const heightRise = ridgeH - eavesH;

  // Sparren: Länge am Schräg
  const halfSpan = bldW / 2;
  const sparrenLenSattel = Math.sqrt(halfSpan * halfSpan + heightRise * heightRise);
  const sparrenLenPult = Math.sqrt(bldW * bldW + heightRise * heightRise);
  const sparrenLen = isPult ? sparrenLenPult : sparrenLenSattel;

  // Mittelpfetten auf halber Sparrenlänge (nur für Satteldach sinnvoll)
  const midFrac = 0.5;
  const yMid = eavesH + heightRise * midFrac;
  const xMidL = xM - halfSpan * midFrac;
  const xMidR = xM + halfSpan * midFrac;

  // Bauteile aus members — JEDE Pfette mit IHREM eigenen Querschnitt, nicht alle
  // mit den Maßen der zuerst gefundenen (das ist die liegende Mauerbank 14/10).
  const sparren = members.find(m => m.type === 'sparren');
  const mauerbank = members.find(m => m.type === 'pfette' && /(mauerbank|fußpfette|fusspfette)/i.test(m.name))
    ?? members.find(m => m.type === 'pfette' && !/(first|mittel)/i.test(m.name));
  const firstPf = members.find(m => m.type === 'pfette' && /first/i.test(m.name));
  const mittelPf = members.find(m => m.type === 'pfette' && /mittel/i.test(m.name));

  // Dachüberstand aus dem Projekt (gleicher Wert wie in der Mengenermittlung)
  const ueberstand = roofOverhang ?? DEFAULT_ROOF_OVERHANG;
  const wandDicke = 0.30; // m — Mauerkrone/Außenwand im Schnitt

  // Neigung, die sich aus Trauf-/Firsthöhe und Spannweite tatsächlich ergibt —
  // das ist die Linie, die gezeichnet wird (und die der Bogen bemaßen muss).
  const tanRoof = (yRidge - yEaves) / Math.max(isPult ? bldW : halfSpan, 0.1);
  const pitchDrawn = isFlach ? 0 : (Math.atan(tanRoof) * 180) / Math.PI;

  // Aufbau-Schichten: Dicke in m (symbolisch)
  const lattH = 0.04;
  const deckH = 0.06;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block' }}>
      <WoodPattern id="qs-wood" />
      <BauseitsLegende x={pad.l} y={H - 16} />

      {/* Boden */}
      <line x1={pad.l - 20} y1={toSY(yGround)} x2={W - pad.r + 20} y2={toSY(yGround)} stroke="#aaa" strokeWidth={1} strokeDasharray="4,3" />

      {/* Aussenwände — BAUSEITS (Mauerwerk), deshalb grau und nicht wie Holz.
          Die Mauerkrone inkl. Auflager für die Mauerbank muss der Baumeister
          fertig herstellen, bevor die Zimmerei kommt. */}
      <rect x={toSX(xL) - px(wandDicke * 1000)} y={toSY(yEaves)} width={px(wandDicke * 1000)} height={toSY(yGround) - toSY(yEaves)} fill="url(#qs-wood-bauseits)" stroke={BAUSEITS_STROKE} strokeWidth={1.2} />
      <rect x={toSX(xR)} y={toSY(yEaves)} width={px(wandDicke * 1000)} height={toSY(yGround) - toSY(yEaves)} fill="url(#qs-wood-bauseits)" stroke={BAUSEITS_STROKE} strokeWidth={1.2} />

      {/* Tragende Innenwände/Auflager unter den Mittelpfetten — NUR wenn die
          Statik Mittelpfetten vorsieht (beim Sparren-/Kehlbalkendach entfällt beides) */}
      {!isPult && !isFlach && mittelPf && (
        <>
          <rect x={toSX(xMidL) - px(wandDicke * 1000) / 2} y={toSY(yMid)} width={px(wandDicke * 1000)} height={toSY(yGround) - toSY(yMid)} fill="url(#qs-wood-bauseits)" stroke={BAUSEITS_STROKE} strokeWidth={1} />
          <rect x={toSX(xMidR) - px(wandDicke * 1000) / 2} y={toSY(yMid)} width={px(wandDicke * 1000)} height={toSY(yGround) - toSY(yMid)} fill="url(#qs-wood-bauseits)" stroke={BAUSEITS_STROKE} strokeWidth={1} />
        </>
      )}

      {/* ZIMMERER-LAGE: Pfetten STEHEND (b < h, hochkant) und UNTER der
          Sparrenlinie — die Sparren ruhen auf ihnen. Mauerbank AUF der
          Mauerkrone, innenbündig. Größen aus dem echten Pfetten-Querschnitt. */}
      {(() => {
        // Jede Pfette mit IHREM Querschnitt aus der Bauteilliste, maßstäblich.
        // autoMembers legt die Mauerbank liegend (140/100) und First-/Mittelpfette
        // hochkant (100/220) an → width = waagrecht, height = lotrecht.
        const mbB = px(mauerbank?.width ?? 140), mbH = px(mauerbank?.height ?? 100);
        const fpB = px(firstPf?.width ?? 100), fpH = px(firstPf?.height ?? 220);
        const mpB = px(mittelPf?.width ?? 100), mpH = px(mittelPf?.height ?? 220);
        const ov = ueberstand; // Dachüberstand im Schnitt [m] — aus dem Projekt
        const tanP = isFlach ? 0.03 : tanRoof;
        const sw = sparren ? px(sparren.height) : 3; // Sparrenlinie = echte Sparrenhöhe
        // NUR zeichnen, was die Statik wirklich vorsieht — beim Sparrendach gibt
        // es KEINE First-/Mittelpfetten (die Zeichnung folgt der Bauteilliste).
        const hasFirst = !!firstPf;
        const hasMittel = !!mittelPf;
        const zange = members.find(m => m.type === 'zange');
        const kehl = members.find(m => m.type === 'kehlbalken');
        return (
          <g>
            {/* Mauerbänke: liegen AUF der Mauerkrone, UNTER dem Sparren (Kerve) */}
            <rect x={toSX(xL) + 2} y={toSY(yEaves) - mbH} width={mbB} height={mbH} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />
            <rect x={toSX(xR) - 2 - mbB} y={toSY(yEaves) - mbH} width={mbB} height={mbH} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />

            {/* Mittelpfetten: nur wenn statisch vorhanden, stehend unter der Sparrenlage */}
            {hasMittel && !isPult && !isFlach && (
              <>
                <rect x={toSX(xMidL) - mpB / 2} y={toSY(yMid) + sw / 2} width={mpB} height={mpH} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />
                <rect x={toSX(xMidR) - mpB / 2} y={toSY(yMid) + sw / 2} width={mpB} height={mpH} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />
              </>
            )}

            {/* Firstpfette: nur wenn statisch vorhanden */}
            {hasFirst && !isPult && !isFlach && (
              <rect x={toSX(xM) - fpB / 2} y={toSY(yRidge) + sw / 2} width={fpB} height={fpH}
                    fill="url(#qs-wood)" stroke="#333" strokeWidth={1.2} />
            )}

            {/* Zange/Kehlbalken: waagrechtes Holz, hält das Gespärre zusammen */}
            {(zange || kehl) && !isPult && !isFlach && (() => {
              const zy = kehl ? yEaves + (yRidge - yEaves) * 0.6 : (hasMittel ? yMid : yEaves + 0.3);
              const zHalf = (yRidge - zy) / Math.max(tanP, 0.1); // wo die Zange die Sparren trifft
              return (
                <g>
                  <line x1={toSX(xM - zHalf)} y1={toSY(zy)} x2={toSX(xM + zHalf)} y2={toSY(zy)}
                        stroke="#8a5a2b" strokeWidth={3} />
                  <text x={toSX(xM)} y={toSY(zy) - 5} fontSize={8} fill="#8a5a2b" textAnchor="middle">
                    {kehl ? 'Kehlbalken' : 'Zange (paarweise)'}
                  </text>
                </g>
              );
            })()}

            {/* Sparrenlinien MIT Dachüberstand über die Traufe hinaus */}
            {isPult ? (
              <line x1={toSX(xL - ov)} y1={toSY(yEaves - ov * tanP)} x2={toSX(xR + ov)} y2={toSY(yRidge + ov * tanP)}
                    stroke="#333" strokeWidth={sw} />
            ) : isFlach ? (
              <line x1={toSX(xL - ov)} y1={toSY(yEaves)} x2={toSX(xR + ov)} y2={toSY(yEaves)}
                    stroke="#333" strokeWidth={sw} />
            ) : (
              <>
                <line x1={toSX(xL - ov)} y1={toSY(yEaves - ov * tanP)} x2={toSX(xM)} y2={toSY(yRidge)}
                      stroke="#333" strokeWidth={sw} />
                <line x1={toSX(xR + ov)} y1={toSY(yEaves - ov * tanP)} x2={toSX(xM)} y2={toSY(yRidge)}
                      stroke="#333" strokeWidth={sw} />
              </>
            )}
            {/* Überstand beschriften — mit dem Wert, mit dem auch gerechnet wurde */}
            <text x={toSX(xL - ov)} y={toSY(yEaves - ov * tanP) + 14} fontSize={8} fill="#64748b">Überstand {fmt(ov)}</text>
          </g>
        );
      })()}

      {/* Aufbau: Lattung + Eindeckung */}
      {!isFlach && (() => {
        const fracs = isPult ? [0.2, 0.4, 0.6, 0.8] : [0.2, 0.4, 0.6, 0.8];
        const startX = isPult ? xL : xL;
        const endX = isPult ? xR : xM;
        const startY = isPult ? yEaves : yEaves;
        const endY = isPult ? yRidge : yRidge;
        return fracs.map(f => {
          const lx = startX + (endX - startX) * f;
          const ly = startY + (endY - startY) * f;
          const nx2 = -Math.sin(pitchRad), ny2 = Math.cos(pitchRad);
          return (
            <g key={f}>
              <line
                x1={toSX(lx) + nx2 * lattH * s} y1={toSY(ly) - ny2 * lattH * s}
                x2={toSX(lx) + nx2 * (lattH + deckH) * s} y2={toSY(ly) - ny2 * (lattH + deckH) * s}
                stroke="#666" strokeWidth={1.2}
              />
            </g>
          );
        });
      })()}

      {/* Kaltdach-Schichtaufbau: nummerierte Parallel-Lagen über der Sparrenlinie + Legende */}
      {(() => {
        const layers = [
          { off: 4, label: '1', color: '#8a5a2b', name: 'Vollschalung 24 mm' },
          { off: 8, label: '2', color: '#334155', name: 'Abdichtung / Unterdach' },
          { off: 12, label: '3', color: '#8a5a2b', name: 'Konterlattung 5/8' },
          { off: 16, label: '4', color: '#8a5a2b', name: 'Lattung 3/5 + Eindeckung' },
        ];
        const nx2 = isFlach ? 0 : -Math.sin(pitchRad);
        const ny2 = isFlach ? 1 : Math.cos(pitchRad);
        const sX = toSX(xL), sY = toSY(yEaves);
        const eX = toSX(isPult || isFlach ? xR : xM), eY = toSY(isFlach ? yEaves : yRidge);
        return (
          <g>
            {layers.map((l) => (
              <line key={l.label}
                x1={sX + nx2 * l.off} y1={sY - ny2 * l.off}
                x2={eX + nx2 * l.off} y2={eY - ny2 * l.off}
                stroke={l.color} strokeWidth={1.4}
                strokeDasharray={l.label === '2' ? '4 3' : undefined} />
            ))}
            {layers.map((l) => (
              <text key={`t-${l.label}`}
                x={sX + nx2 * l.off - 10} y={sY - ny2 * l.off + 3}
                fontSize={7} fill={l.color} fontFamily="monospace">{l.label}</text>
            ))}
            <g fontSize={8} fontFamily="monospace" fill="#334155">
              <text x={pad.l} y={12} fontWeight="bold">Dachaufbau (Kaltdach), auf Sparren:</text>
              {layers.map((l, i) => (
                <text key={`leg-${l.label}`} x={pad.l} y={22 + i * 10}>{l.label}  {l.name}</text>
              ))}
            </g>
          </g>
        );
      })()}

      {/* Bemaßungen */}
      {/* Gebäudebreite unten */}
      <Dim x1={toSX(xL)} y1={toSY(-0.4)} x2={toSX(xR)} y2={toSY(-0.4)} label={fmt(bldW)} />

      {/* Firsthöhe links vertikal */}
      <Dim x1={toSX(-0.8)} y1={toSY(yGround)} x2={toSX(-0.8)} y2={toSY(yRidge)} label={fmt(ridgeH)} />

      {/* Traufhöhe rechts vertikal */}
      <Dim x1={toSX(bldW + 0.8)} y1={toSY(yGround)} x2={toSX(bldW + 0.8)} y2={toSY(yEaves)} label={fmt(eavesH)} flip />

      {/* Sparrenlänge entlang Sparren */}
      {!isFlach && (
        <Dim
          x1={toSX(isPult ? xL : xL)} y1={toSY(isPult ? yEaves : yEaves)}
          x2={toSX(isPult ? xR : xM)} y2={toSY(isPult ? yRidge : yRidge)}
          label={fmt(sparrenLen)} offset={16}
        />
      )}

      {/* Stützenabstand (Mitte zu Aussenkante, nur Satteldach) */}
      {!isPult && !isFlach && (
        <Dim
          x1={toSX(xL)} y1={toSY(yEaves - 0.15)}
          x2={toSX(xMidL)} y2={toSY(yEaves - 0.15)}
          label={fmt(xMidL - xL)} flip
        />
      )}

      {/* Dachneigung-Bogen + Text — der Bogen zeigt die TATSÄCHLICH gezeichnete
          Neigung (aus Trauf-/Firsthöhe und Spannweite). Weicht sie vom Plan-Wert
          ab, wird dieser zusätzlich ausgewiesen statt stillschweigend ersetzt. */}
      {(() => {
        const cx = toSX(xL), cy = toSY(yEaves);
        const r = 36;
        const endAngle = -pitchDrawn;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const ex = cx + r * Math.cos(toRad(endAngle));
        const ey = cy + r * Math.sin(toRad(endAngle));
        const largeArc = pitchDrawn > 180 ? 1 : 0;
        return (
          <g>
            <path
              d={`M ${cx + r},${cy} A ${r},${r} 0 ${largeArc},0 ${ex},${ey}`}
              fill="none" stroke="#888" strokeWidth={0.9}
            />
            <text x={cx + r + 8} y={cy - 10} fill="#555" fontSize={11} fontFamily="sans-serif">
              {fmtDeg(pitchDrawn)}{Math.abs(pitchDrawn - pitchDeg) > 1 ? ` (Plan ${fmtDeg(pitchDeg)})` : ''}
            </text>
          </g>
        );
      })()}

      {/* Labels — nur für Bauteile, die es laut Statik wirklich gibt */}
      {!isPult && !isFlach && firstPf && (
        <text x={toSX(xM)} y={toSY(yRidge) - 18} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">
          Firstpfette {firstPf.crossSection ?? `${firstPf.width}/${firstPf.height}`}
        </text>
      )}
      {!isPult && !isFlach && mittelPf && (
        <text x={toSX(xMidL)} y={toSY(yMid) + 22} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">
          Mittelpfette {mittelPf.crossSection ?? `${mittelPf.width}/${mittelPf.height}`}
        </text>
      )}
      {isPult && (
        <text x={toSX(xM)} y={toSY((yEaves + yRidge) / 2) - 18} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Pultdach-Sparren</text>
      )}
      <text x={toSX(xL) - 6} y={toSY(yEaves) + 18} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="end">
        Mauerbank {mauerbank ? (mauerbank.crossSection ?? `${mauerbank.width}/${mauerbank.height}`) : ''}
      </text>
      {coveringName && !isFlach && (
        <text x={toSX(isPult ? xM : xM) - 60} y={toSY((yRidge + yEaves) / 2) - 10} fill="#555" fontSize={10} fontFamily="sans-serif" transform={`rotate(${-pitchDeg},${toSX(isPult ? xM : xM) - 60},${toSY((yRidge + yEaves) / 2) - 10})`}>{coveringName}</text>
      )}

      {/* Titel */}
      <text x={W / 2} y={18} fill="#333" fontSize={14} fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">
        {isPult ? 'Querschnitt (Pultdach)' : isFlach ? 'Querschnitt (Flachdach)' : 'Querschnitt'}
      </text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2) LÄNGSSCHNITT
// ════════════════════════════════════════════════════════════════════════════
function Laengsschnitt({ geometry, members }: { geometry: BuildingGeometry; members: TimberMember[] }) {
  const W = 800, H = 400;
  const pad = { l: 90, r: 40, t: 50, b: 60 };

  const bldL = geometry.length.value;
  const ridgeH = geometry.ridgeHeight.value;
  const eavesH = geometry.eavesHeight.value;

  const drawW = W - pad.l - pad.r;
  const drawH = H - pad.t - pad.b;

  const scaleX = drawW / bldL;
  const maxH = ridgeH * 1.2;
  const scaleY = drawH / maxH;

  const toSX = (mx: number) => pad.l + mx * scaleX;
  const toSY = (my: number) => pad.t + drawH - my * scaleY;

  // Die Zeichnung folgt der BAUTEILLISTE — was die Statik nicht vorsieht,
  // wird auch nicht gezeichnet (z.B. keine Pfetten beim Sparren-/Kehlbalkendach).
  const hasFirst = members.some(m => m.type === 'pfette' && /first/i.test(m.name));
  const hasMittel = members.some(m => m.type === 'pfette' && /mittel/i.test(m.name));
  const zange = members.find(m => m.type === 'zange');
  const kehl = members.find(m => m.type === 'kehlbalken');

  // ── Steher: die Zeichnung zeigt, was die Statik gerechnet hat ──────────────
  // member.length ist die KNICKLÄNGE aus dem Nachweis — die Stütze reicht also
  // NICHT vom Fußboden bis zur Pfette, sondern steht auf der Deckenebene.
  const stList = members.filter(m => m.type === 'stuetze');
  const stH = stList[0]?.length ?? 0;                                   // m
  const stQtyTotal = stList.reduce((s, m) => s + Math.max(1, m.quantity), 0);
  // autoMembers verteilt die Steher auf 3 Pfettenreihen (First + 2 Mittelpfetten)
  // bzw. auf 1 (nur Firstpfette). Im Längsschnitt liegen die beiden Mittelpfetten-
  // Reihen HINTEREINANDER → ein Steher-Band unter dem First, eines unter der Mitte.
  const pfettenReihen = hasMittel ? 3 : 1;
  const stuetzenProReihe = stQtyTotal > 0
    ? Math.max(1, Math.round(stQtyTotal / pfettenReihen))
    : 0;
  // gleichmäßig verteilt (0 Stützen = Pfetten lagern nur auf den Giebelwänden)
  const stuetzPositions: number[] = Array.from({ length: stuetzenProReihe }, (_, i) =>
    ((i + 1) / (stuetzenProReihe + 1)) * bldL
  );
  const stHpx = Math.max(3, stH * scaleY);

  // Mittelpfetten-Höhe exakt wie autoMembers: Traufe + halbe Dachhöhe
  const midH2 = eavesH + (ridgeH - eavesH) * 0.5;
  const zangenH = kehl ? eavesH + (ridgeH - eavesH) * 0.6 : (hasMittel ? midH2 : eavesH + 0.3);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block' }}>
      <WoodPattern id="ls-wood" />
      <BauseitsLegende x={pad.l} y={H - 16} />

      {/* Boden */}
      <line x1={pad.l - 20} y1={toSY(0)} x2={W - pad.r + 10} y2={toSY(0)} stroke="#aaa" strokeWidth={1} strokeDasharray="4,3" />

      {/* Giebelwände links + rechts — BAUSEITS (Mauerwerk), grau */}
      <rect x={toSX(0) - 14} y={toSY(ridgeH)} width={14} height={toSY(0) - toSY(ridgeH)} fill="url(#ls-wood-bauseits)" stroke={BAUSEITS_STROKE} strokeWidth={1.2} />
      <rect x={toSX(bldL)} y={toSY(ridgeH)} width={14} height={toSY(0) - toSY(ridgeH)} fill="url(#ls-wood-bauseits)" stroke={BAUSEITS_STROKE} strokeWidth={1.2} />

      {/* Steher unter der FIRSTPFETTE — Kopf an der Pfetten-Unterkante,
          Länge = member.length (die gerechnete Knicklänge), Fuß auf Deckenebene */}
      {hasFirst && stH > 0 && stuetzPositions.map((sx, i) => (
        <rect
          key={`st-first-${i}`}
          x={toSX(sx) - 5} y={toSY(ridgeH)}
          width={10} height={stHpx}
          fill="url(#ls-wood)" stroke="#333" strokeWidth={1}
        />
      ))}

      {/* Steher unter den MITTELPFETTEN (beide Reihen liegen im Längsschnitt
          hintereinander → ein Band) */}
      {hasMittel && stH > 0 && stuetzPositions.map((sx, i) => (
        <rect
          key={`st-mitte-${i}`}
          x={toSX(sx) - 5} y={toSY(midH2)}
          width={10} height={stHpx}
          fill="url(#ls-wood)" stroke="#444" strokeWidth={1}
        />
      ))}

      {/* Firstpfette: nur wenn statisch vorhanden */}
      {hasFirst && (
        <rect x={toSX(0)} y={toSY(ridgeH) - 10} width={toSX(bldL) - toSX(0)} height={10} fill="url(#ls-wood)" stroke="#333" strokeWidth={1.2} />
      )}

      {/* Mittelpfetten: nur wenn statisch vorhanden (beide auf gleicher Höhe → ein Band) */}
      {hasMittel && (
        <rect x={toSX(0)} y={toSY(midH2) - 10} width={toSX(bldL) - toSX(0)} height={10} fill="url(#ls-wood)" stroke="#444" strokeWidth={1} />
      )}

      {/* Zangen/Kehlbalken: liegen quer, im Längsschnitt als Querschnitte an jedem 2. Gespärre */}
      {(zange || kehl) && Array.from({ length: Math.floor(bldL / 1.6) + 1 }, (_, i) => {
        const sx = i * 1.6;
        if (sx > bldL) return null;
        return (
          <rect key={`zg-${i}`} x={toSX(sx) - 3} y={toSY(zangenH) - 8} width={6} height={8}
                fill="url(#ls-wood)" stroke="#8a5a2b" strokeWidth={1} />
        );
      })}

      {/* Fußpfetten / Mauerbank (beidseitig, hintereinander → ein Band) */}
      <rect x={toSX(0)} y={toSY(eavesH) - 8} width={toSX(bldL) - toSX(0)} height={8} fill="url(#ls-wood)" stroke="#555" strokeWidth={1} />

      {/* Sparren-Andeutungen (kurze Striche oben) */}
      {Array.from({ length: Math.floor(bldL / 0.8) + 1 }, (_, i) => {
        const sx = i * 0.8;
        if (sx > bldL) return null;
        return (
          <line key={i} x1={toSX(sx)} y1={toSY(ridgeH)} x2={toSX(sx)} y2={toSY(ridgeH) - 8} stroke="#999" strokeWidth={0.7} />
        );
      })}

      {/* Bemaßungen */}
      {/* Gebäudelänge */}
      <Dim x1={toSX(0)} y1={toSY(-0.5)} x2={toSX(bldL)} y2={toSY(-0.5)} label={fmt(bldL)} />

      {/* Stützenfeldweiten (nur wenn es Stützen gibt) */}
      {stuetzPositions.length > 0 && [0, ...stuetzPositions].map((sx, i, arr) => {
        const next = arr[i + 1] ?? bldL;
        return (
          <Dim
            key={i}
            x1={toSX(sx)} y1={toSY(-0.25)}
            x2={toSX(next)} y2={toSY(-0.25)}
            label={`L${i + 1}=${fmt(next - sx)}`}
            flip
          />
        );
      })}

      {/* Pfettenhöhen links */}
      <Dim x1={toSX(-1.2)} y1={toSY(0)} x2={toSX(-1.2)} y2={toSY(eavesH)} label={fmt(eavesH)} />
      <Dim x1={toSX(-1.8)} y1={toSY(0)} x2={toSX(-1.8)} y2={toSY(ridgeH)} label={fmt(ridgeH)} />

      {/* Labels — nur für tatsächlich gezeichnete Bauteile */}
      {hasFirst && (
        <text x={toSX(bldL / 2)} y={toSY(ridgeH) - 16} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Firstpfette</text>
      )}
      {hasMittel && (
        <text x={toSX(bldL / 2)} y={toSY(midH2) + 20} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Mittelpfetten</text>
      )}
      {(zange || kehl) && (
        <text x={toSX(bldL / 4)} y={toSY(zangenH) - 12} fill="#8a5a2b" fontSize={10} fontFamily="sans-serif" textAnchor="middle">{kehl ? 'Kehlbalken' : 'Zangen'}</text>
      )}

      {/* Steher: gezeichnete Länge = gerechnete Länge (Nachweis) */}
      {stH > 0 && stuetzPositions.length > 0 && (
        <>
          <Dim
            x1={toSX(stuetzPositions[0]) - 14} y1={toSY(hasMittel ? midH2 : ridgeH)}
            x2={toSX(stuetzPositions[0]) - 14} y2={toSY(hasMittel ? midH2 : ridgeH) + stHpx}
            label={fmt(stH)} offset={12}
          />
          <text
            x={toSX(stuetzPositions[Math.floor(stuetzPositions.length / 2)])}
            y={toSY(hasMittel ? midH2 : ridgeH) + stHpx + 13}
            fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle"
          >
            {stQtyTotal} × Steher L = {fmt(stH)} (Fuß auf Deckenebene)
          </text>
        </>
      )}
      <text x={toSX(bldL / 2)} y={toSY(eavesH) + 18} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Fußpfetten (Mauerbank)</text>

      <text x={W / 2} y={18} fill="#333" fontSize={14} fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">Längsschnitt</text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3) DETAIL TRAUFE
// ════════════════════════════════════════════════════════════════════════════
function DetailTraufe({ geometry, members, roofOverhang }: { geometry: BuildingGeometry; members: TimberMember[]; roofOverhang?: number }) {
  const W = 600, H = 400;

  const pitchDeg = geometry.roofPitch.value;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  // Flach-/Pultdach mit 0° würde sonst durch 0 dividieren; alle Winkelfunktionen
  // konsistent aus DEMSELBEN tanA, damit Unterkante, Kervensohle und die
  // Querbemaßung exakt zusammenpassen.
  const tanA = Math.max(Math.tan(pitchRad), 0.08);
  const cosA = 1 / Math.sqrt(1 + tanA * tanA);
  const sinA = tanA * cosA;

  const sparren = members.find(m => m.type === 'sparren');
  const sparB = sparren ? sparren.width / 1000 : 0.08;   // m — Breite: im Traufschnitt NICHT sichtbar
  const sparH = sparren ? sparren.height / 1000 : 0.16;  // m — Höhe: die sichtbare Tiefe im Schnitt

  // Mauerbank (Fußpfette) aus der Bauteilliste — liegend: width waagrecht, height lotrecht
  const mauerbank = members.find(m => m.type === 'pfette' && /(mauerbank|fußpfette|fusspfette)/i.test(m.name))
    ?? members.find(m => m.type === 'pfette' && !/(first|mittel)/i.test(m.name));
  const pfetteB = mauerbank ? mauerbank.width / 1000 : 0.14;   // m
  const pfetteH = mauerbank ? mauerbank.height / 1000 : 0.10;  // m

  const ueberstand = roofOverhang ?? DEFAULT_ROOF_OVERHANG;    // m — wie in der Mengenermittlung
  const mauerH = 0.24, mauerB = 0.30;                          // m Mauerkrone (dargestellter Ausschnitt)

  // Kerventiefe: höchstens h/4, nur so tief, dass die waagrechte Sohle
  // (Länge = t / tan α) die Mauerbank nicht überläuft, und nie tiefer als die
  // Mauerbank hoch ist (sonst säße der Sparren auf der Mauerkrone auf).
  const klaueTiefe = Math.min(0.04, sparH / 4, pfetteB * tanA, pfetteH * 0.8);

  // ── Maßstab: waagrecht UND lotrecht muss alles ins Bild passen ────────────
  const innenM = 0.9;                                  // m sichtbarer Sparren Richtung First
  const leftM = 150, rightM = 115, topM = 40, botM = 55; // Freiräume für Legende/Nebenriss/Maße
  // maßstabsfreie Ausdehnungen, gemessen ab OK Mauerbank [m]
  const extAbove = (mauerB + innenM - 0.02) * tanA + sparH / cosA - klaueTiefe;
  const extBelow = Math.max(klaueTiefe + (ueberstand + 0.02) * tanA, pfetteH + mauerH);
  const scH = (W - leftM - rightM) / Math.max(ueberstand + mauerB + innenM, 0.6);
  const scV = (H - topM - botM) / Math.max(extAbove + extBelow, 0.4);
  const sc = Math.min(300, scH, scV);

  // ── Bezugsgrößen (x = waagrecht, y = SVG nach unten) ──────────────────────
  const totalX = (ueberstand + mauerB + innenM) * sc;
  const xOut = leftM + ((W - leftM - rightM) - totalX) / 2;  // Sparren-Traufende (lotrechter Abschnitt)
  const mxOuter = xOut + ueberstand * sc;  // Mauer-AUSSENKANTE — Bezugspunkt des Überstandsmaßes
  const pfX = mxOuter + 0.02 * sc;         // Mauerbank liegt AUF der Krone (2 cm eingerückt)
  const pfOK = topM + extAbove * sc;       // OK Mauerbank == Höhe der KERVENSOHLE
  const yMauerOK = pfOK + pfetteH * sc;    // OK Mauerkrone
  const oy = yMauerOK + mauerH * sc;       // UK des dargestellten Mauerausschnitts

  const klaueD = klaueTiefe * sc;          // Kerventiefe [px]
  const xStoss = pfX;                      // talseitige (äußere) Flanke der Mauerbank
  const sohleLen = klaueD / tanA;          // waagrechte Auflagersohle [px]

  // Sparren-Unterkante läuft durch (xStoss, pfOK + klaueD): der ungekerbte
  // Sparren taucht traufseitig um t unter OK Mauerbank ab, die KERVENSOHLE
  // liegt exakt auf pfOK. Der Sparren dringt weder in die Mauerbank noch in
  // die Mauerkrone ein.
  const ukRefX = xStoss, ukRefY = pfOK + klaueD;
  const hV = (sparH * sc) / cosA;                        // lotrechte Sparrendicke [px]
  const ukY = (x: number) => ukRefY - (x - ukRefX) * tanA;
  const okY = (x: number) => ukY(x) - hV;

  // Bildkante Richtung First (lotrechter Schnitt)
  const xInn = mxOuter + (mauerB + innenM) * sc;
  // Zierschnitt am Sparrenende — nie so groß, dass er in die Kerve läuft
  const fase = Math.min(0.10 * sc, sparH * sc * 0.45, Math.max(1, (xStoss - xOut) * 0.6));

  // Kerve = waagrechte Sohle + TALSEITIGER lotrechter Stoß (Dreieck im Anriss)
  const kStossFuss = { x: xStoss, y: ukY(xStoss) };      // Stoßfuß, auf der Unterkante
  const kStossKopf = { x: xStoss, y: pfOK };             // lotrecht hoch, Tiefe t
  const kSohleAus = { x: xStoss + sohleLen, y: pfOK };   // Sohlen-Auslauf, wieder auf der Unterkante

  // Sparren-Umriss MIT ausgeschnittener Kerve (kein aufgelegtes Rechteck)
  const sparrenPts: Array<[number, number]> = [
    [xOut, okY(xOut)],                       // OK Traufende
    [xInn, okY(xInn)],                       // OK Richtung First
    [xInn, ukY(xInn)],                       // Schnittkante (Bildgrenze)
    [kSohleAus.x, kSohleAus.y],              // UK bis Sohlen-Auslauf
    [kStossKopf.x, kStossKopf.y],            // waagrechte Kervensohle
    [kStossFuss.x, kStossFuss.y],            // lotrechter Stoß, talseitig
    [xOut + fase, ukY(xOut + fase)],         // UK bis zum Zierschnitt
    [xOut, ukY(xOut) - fase],                // Zierschnitt (Fase) am Sparrenende
  ];

  // Querbemaßung h: senkrecht zur Sparrenachse (nicht entlang!)
  const xMess = Math.min(kSohleAus.x + 0.28 * sc, xInn - 0.15 * sc);
  const hUnten = { x: xMess, y: ukY(xMess) };
  const hOben = { x: xMess - sparH * sc * sinA, y: ukY(xMess) - sparH * sc * cosA };

  // Kaltdach-Aufbau über dem Sparren (parallel versetzt zur Oberkante)
  const aufbau = [
    { d: 4, c: '#8a5a2b', n: 'Vollschalung 24 mm' },
    { d: 8, c: '#334155', n: 'Abdichtung / Unterdach' },
    { d: 12, c: '#8a5a2b', n: 'Konterlattung 5/8' },
    { d: 16, c: '#8a5a2b', n: 'Lattung 3/5 + Eindeckung' },
  ];

  // Überstands-Maßlinie unter allem, was in diesem Bereich gezeichnet wird
  const yUeberDim = Math.min(Math.max(oy, ukY(xOut)) + 26, H - 12);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block' }}>
      <WoodPattern id="dt-wood" />
      <BauseitsLegende x={16} y={H - 16} />

      {/* Mauerkrone — BAUSEITS. Grau, nicht wie Holz: das Auflager für die
          Mauerbank muss der Baumeister waagrecht und höhengerecht herstellen,
          bevor die Zimmerei aufschlägt. */}
      <rect
        x={mxOuter} y={yMauerOK}
        width={mauerB * sc} height={mauerH * sc}
        fill="url(#dt-wood-bauseits)" stroke={BAUSEITS_STROKE} strokeWidth={1.5}
      />
      <text x={mxOuter + 4} y={yMauerOK + mauerH * sc * 0.72} fill="#52525b" fontSize={10} fontFamily="sans-serif">Mauerkrone (bauseits)</text>
      <text x={mxOuter + 4} y={yMauerOK + mauerH * sc * 0.72 + 12} fill="#71717a" fontSize={8} fontFamily="sans-serif">Auflager waagrecht + höhengerecht</text>

      {/* Mauerbank (Fußpfette) — liegt AUF der Mauerkrone */}
      <rect
        x={pfX} y={pfOK}
        width={pfetteB * sc} height={pfetteH * sc}
        fill="url(#dt-wood)" stroke="#333" strokeWidth={1.5}
      />
      <line x1={pfX + pfetteB * sc} y1={pfOK + pfetteH * sc * 0.5}
            x2={mxOuter + mauerB * sc + 10} y2={pfOK + pfetteH * sc * 0.5 + 14}
            stroke="#888" strokeWidth={0.7} />
      <text x={mxOuter + mauerB * sc + 12} y={pfOK + pfetteH * sc * 0.5 + 17} fill="#555" fontSize={10} fontFamily="sans-serif">
        Mauerbank (Fußpfette) {mauerbank ? (mauerbank.crossSection ?? `${mauerbank.width}/${mauerbank.height}`) : `${Math.round(pfetteB * 100)}/${Math.round(pfetteH * 100)}`}
      </text>

      {/* Kaltdach-Aufbau auf dem Sparren */}
      {aufbau.map(l => (
        <line key={l.n}
          x1={xOut - l.d * sinA} y1={okY(xOut) - l.d * cosA}
          x2={xInn - l.d * sinA} y2={okY(xInn) - l.d * cosA}
          stroke={l.c} strokeWidth={1.2} strokeDasharray={l.n.startsWith('Abdichtung') ? '4 3' : undefined} />
      ))}

      {/* Sparren mit Kerve — EIN Umriss, die Kerve ist ausgeschnitten */}
      <polygon
        points={sparrenPts.map(p => `${p[0]},${p[1]}`).join(' ')}
        fill="url(#dt-wood)" stroke="#333" strokeWidth={1.5}
      />
      {(() => {
        const lx = (kSohleAus.x + xInn) / 2, ly = okY((kSohleAus.x + xInn) / 2) - 24;
        return (
          <text x={lx} y={ly} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle"
                transform={`rotate(${-pitchDeg},${lx},${ly})`}>
            Sparren {sparren ? (sparren.crossSection ?? `${sparren.width}/${sparren.height}`) : ''}
          </text>
        );
      })()}

      {/* Kerve beschriften — Hinweislinie von der Sohle in den freien Keil
          über dem Dachüberstand */}
      {(() => {
        const ty = Math.max(topM + 14, okY(xStoss) - 34);
        return (
          <g>
            <line x1={xStoss + sohleLen / 2} y1={pfOK} x2={xStoss + 8} y2={ty + 2} stroke="#888" strokeWidth={0.7} />
            <text x={xStoss + 6} y={ty} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="end">
              Kerve: Sohle waagrecht auf OK Mauerbank,
            </text>
            <text x={xStoss + 6} y={ty + 12} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="end">
              Stoß lotrecht talseitig, t = {Math.round(klaueTiefe * 1000)} mm
            </text>
          </g>
        );
      })()}

      {/* Sturmanker: verankert die Mauerbank in der Mauerkrone */}
      {(() => {
        const ax = pfX + pfetteB * sc * 0.55;
        const ayTop = pfOK + 3;
        const ayBot = yMauerOK + mauerH * sc * 0.75;
        return (
          <g>
            <line x1={ax} y1={ayTop} x2={ax} y2={ayBot} stroke="#555" strokeWidth={1.5} />
            <line x1={ax - 7} y1={ayBot} x2={ax + 7} y2={ayBot} stroke="#555" strokeWidth={1.5} />
            <line x1={ax} y1={ayBot} x2={ax + 26} y2={ayBot + 12} stroke="#888" strokeWidth={0.7} />
            <text x={ax + 28} y={ayBot + 15} fill="#555" fontSize={9} fontFamily="sans-serif">Sturmanker</text>
          </g>
        );
      })()}

      {/* ── Bemaßungen ─────────────────────────────────────────────────────── */}
      {/* Sparrenhöhe h — QUER zur Sparrenachse (im Traufschnitt die sichtbare Tiefe) */}
      <Dim
        x1={hUnten.x} y1={hUnten.y}
        x2={hOben.x} y2={hOben.y}
        label={`h=${sparren ? sparren.height + ' mm' : fmt(sparH)}`}
        offset={14}
      />

      {/* Kerventiefe t — lotrecht am Stoß */}
      {klaueD >= 5 && (
        <Dim
          x1={kStossFuss.x} y1={kStossFuss.y}
          x2={kStossKopf.x} y2={kStossKopf.y}
          label={`t=${Math.round(klaueTiefe * 1000)} mm`}
          offset={26} flip
        />
      )}
      {klaueD < 5 && (
        <text x={xStoss - 6} y={pfOK - 6} fill="#555" fontSize={9} fontFamily="sans-serif" textAnchor="end">
          t={Math.round(klaueTiefe * 1000)} mm
        </text>
      )}

      {/* Dachüberstand — gemessen ab Mauer-AUSSENKANTE bis Sparrenende,
          gezeichnete Strecke = Zahlenwert (Bezugslinien strichliert) */}
      <line x1={mxOuter} y1={yMauerOK} x2={mxOuter} y2={yUeberDim + 8} stroke="#aaa" strokeWidth={0.7} strokeDasharray="3,3" />
      <line x1={xOut} y1={ukY(xOut)} x2={xOut} y2={yUeberDim + 8} stroke="#aaa" strokeWidth={0.7} strokeDasharray="3,3" />
      <Dim
        x1={mxOuter} y1={yUeberDim}
        x2={xOut} y2={yUeberDim}
        label={`Üst. ${fmt(ueberstand)}`}
      />

      {/* Nebenriss: Sparren-Querschnitt b × h — die BREITE b ist in diesem
          Schnitt (senkrecht zur Traufe) nicht sichtbar, deshalb als Nebenriss. */}
      {(() => {
        const nsc = 70 / Math.max(sparH, sparB, 0.05);
        const nb = sparB * nsc, nh = sparH * nsc;
        const nx0 = W - 34 - nb, ny0 = 62;
        return (
          <g>
            <text x={nx0 + nb / 2} y={ny0 - 10} fill="#333" fontSize={10} fontFamily="sans-serif" textAnchor="middle" fontWeight="bold">Querschnitt</text>
            <rect x={nx0} y={ny0} width={nb} height={nh} fill="url(#dt-wood)" stroke="#333" strokeWidth={1.2} />
            <text x={nx0 + nb / 2} y={ny0 + nh + 13} fill="#555" fontSize={9} fontFamily="sans-serif" textAnchor="middle">
              b={sparren ? sparren.width : Math.round(sparB * 1000)} mm
            </text>
            <text x={nx0 + nb / 2} y={ny0 + nh + 24} fill="#555" fontSize={9} fontFamily="sans-serif" textAnchor="middle">
              h={sparren ? sparren.height : Math.round(sparH * 1000)} mm
            </text>
          </g>
        );
      })()}

      {/* Legende Dachaufbau — unten links, dort bleibt in jeder Neigung Platz */}
      <g fontSize={8} fontFamily="monospace" fill="#334155">
        <text x={12} y={H - 52} fontWeight="bold">Dachaufbau (Kaltdach):</text>
        {aufbau.map((l, i) => (
          <text key={`dt-leg-${l.n}`} x={12} y={H - 42 + i * 10}>{i + 1}  {l.n}</text>
        ))}
      </g>

      <text x={W / 2} y={18} fill="#333" fontSize={14} fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">Detail Traufe</text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORT: SchnittViews
// ════════════════════════════════════════════════════════════════════════════
export function SchnittViews({ geometry, roofForm: _roofForm, members, coveringName, roofOverhang }: SchnittViewsProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scissors className="h-4 w-4" />
          Schnittansichten
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="querschnitt">
          <TabsList className="mb-3">
            <TabsTrigger value="querschnitt">Querschnitt</TabsTrigger>
            <TabsTrigger value="laengsschnitt">Längsschnitt</TabsTrigger>
            <TabsTrigger value="traufe">Detail Traufe</TabsTrigger>
          </TabsList>
          <TabsContent value="querschnitt">
            <div className="overflow-x-auto">
              <Querschnitt geometry={geometry} members={members} coveringName={coveringName} roofForm={_roofForm} roofOverhang={roofOverhang} />
            </div>
          </TabsContent>
          <TabsContent value="laengsschnitt">
            <div className="overflow-x-auto">
              <Laengsschnitt geometry={geometry} members={members} />
            </div>
          </TabsContent>
          <TabsContent value="traufe">
            <div className="overflow-x-auto">
              <DetailTraufe geometry={geometry} members={members} roofOverhang={roofOverhang} />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
