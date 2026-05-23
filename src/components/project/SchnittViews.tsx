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
}

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

// ── Holzschraffur-Pattern ───────────────────────────────────────────────────
function WoodPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6">
        <rect width="6" height="6" fill="#f5e9d5" />
        <line x1="0" y1="6" x2="6" y2="0" stroke="#c9b48a" strokeWidth={0.6} />
      </pattern>
    </defs>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1) QUERSCHNITT
// ════════════════════════════════════════════════════════════════════════════
function Querschnitt({ geometry, members, coveringName, roofForm }: { geometry: BuildingGeometry; members: TimberMember[]; coveringName?: string; roofForm?: string }) {
  const W = 800, H = 500;
  const pad = { l: 80, r: 80, t: 60, b: 70 };

  const bldW = geometry.width.value;      // m
  const ridgeH = geometry.ridgeHeight.value;  // m
  const eavesH = geometry.eavesHeight.value;  // m
  const pitchDeg = geometry.roofPitch.value;  // °
  const pitchRad = (pitchDeg * Math.PI) / 180;

  const drawW = W - pad.l - pad.r;
  const drawH = H - pad.t - pad.b;

  // scale: building width -> drawW
  const scaleX = drawW / bldW;
  // scale: ridge height -> drawH
  const maxH = ridgeH * 1.15;
  const scaleY = drawH / maxH;

  // SVG koordinaten (y zeigt nach unten, 0 = Boden)
  const toSX = (mx: number) => pad.l + mx * scaleX;
  const toSY = (my: number) => pad.t + drawH - my * scaleY;

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

  // Bauteile aus members
  const sparren = members.find(m => m.type === 'sparren');
  const pfette = members.find(m => m.type === 'pfette');

  // Aufbau-Schichten: Dicke in m (symbolisch)
  const lattH = 0.04;
  const deckH = 0.06;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block' }}>
      <WoodPattern id="qs-wood" />

      {/* Boden */}
      <line x1={pad.l - 20} y1={toSY(yGround)} x2={W - pad.r + 20} y2={toSY(yGround)} stroke="#aaa" strokeWidth={1} strokeDasharray="4,3" />

      {/* Aussenwände */}
      <rect x={toSX(xL) - 12} y={toSY(yEaves)} width={12} height={toSY(yGround) - toSY(yEaves)} fill="url(#qs-wood)" stroke="#333" strokeWidth={1.2} />
      <rect x={toSX(xR)} y={toSY(yEaves)} width={12} height={toSY(yGround) - toSY(yEaves)} fill="url(#qs-wood)" stroke="#333" strokeWidth={1.2} />

      {/* Stützen unter Mittelpfetten (nur Satteldach) */}
      {!isPult && !isFlach && (
        <>
          <rect x={toSX(xMidL) - 6} y={toSY(yMid)} width={12} height={toSY(yGround) - toSY(yMid)} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />
          <rect x={toSX(xMidR) - 6} y={toSY(yMid)} width={12} height={toSY(yGround) - toSY(yMid)} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />
        </>
      )}

      {/* Fußpfetten */}
      <rect x={toSX(xL) - 12} y={toSY(yEaves) - 10} width={28} height={10} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />
      <rect x={toSX(xR) - 6} y={toSY(yEaves) - 10} width={28} height={10} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />

      {/* Mittelpfetten (nur Satteldach) */}
      {!isPult && !isFlach && (
        <>
          <rect x={toSX(xMidL) - 12} y={toSY(yMid) - 10} width={24} height={10} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />
          <rect x={toSX(xMidR) - 12} y={toSY(yMid) - 10} width={24} height={10} fill="url(#qs-wood)" stroke="#333" strokeWidth={1} />
        </>
      )}

      {isPult ? (
        /* Pultdach: ein Sparren von links-Traufe bis rechts-First */
        <line
          x1={toSX(xL)} y1={toSY(yEaves)}
          x2={toSX(xR)} y2={toSY(yRidge)}
          stroke="#333" strokeWidth={sparren ? Math.max(2, sparren.height / 40) : 3}
        />
      ) : isFlach ? (
        /* Flachdach: horizontale Linie */
        <line
          x1={toSX(xL)} y1={toSY(yEaves)}
          x2={toSX(xR)} y2={toSY(yEaves)}
          stroke="#333" strokeWidth={sparren ? Math.max(2, sparren.height / 40) : 3}
        />
      ) : (
        /* Satteldach: beide Seiten */
        <>
          <line
            x1={toSX(xL)} y1={toSY(yEaves)}
            x2={toSX(xM)} y2={toSY(yRidge)}
            stroke="#333" strokeWidth={sparren ? Math.max(2, sparren.height / 40) : 3}
          />
          <line
            x1={toSX(xR)} y1={toSY(yEaves)}
            x2={toSX(xM)} y2={toSY(yRidge)}
            stroke="#333" strokeWidth={sparren ? Math.max(2, sparren.height / 40) : 3}
          />
        </>
      )}

      {/* Firstpfette (nur Satteldach / Pfettendach) */}
      {!isPult && !isFlach && (
        <rect
          x={toSX(xM) - 14} y={toSY(yRidge) - 12}
          width={28} height={12}
          fill="url(#qs-wood)" stroke="#333" strokeWidth={1.2}
        />
      )}

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
                x1={toSX(lx) + nx2 * lattH * scaleY} y1={toSY(ly) - ny2 * lattH * scaleY}
                x2={toSX(lx) + nx2 * (lattH + deckH) * scaleY} y2={toSY(ly) - ny2 * (lattH + deckH) * scaleY}
                stroke="#666" strokeWidth={1.2}
              />
            </g>
          );
        });
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

      {/* Dachneigung-Bogen + Text */}
      {(() => {
        const cx = toSX(xL), cy = toSY(yEaves);
        const r = 36;
        const endAngle = -pitchDeg;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const ex = cx + r * Math.cos(toRad(endAngle));
        const ey = cy + r * Math.sin(toRad(endAngle));
        const largeArc = pitchDeg > 180 ? 1 : 0;
        return (
          <g>
            <path
              d={`M ${cx + r},${cy} A ${r},${r} 0 ${largeArc},0 ${ex},${ey}`}
              fill="none" stroke="#888" strokeWidth={0.9}
            />
            <text x={cx + r + 8} y={cy - 10} fill="#555" fontSize={11} fontFamily="sans-serif">{fmtDeg(pitchDeg)}</text>
          </g>
        );
      })()}

      {/* Labels */}
      {!isPult && !isFlach && (
        <>
          <text x={toSX(xM)} y={toSY(yRidge) - 18} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Firstpfette</text>
          <text x={toSX(xMidL)} y={toSY(yMid) + 22} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Mittelpfette</text>
        </>
      )}
      {isPult && (
        <text x={toSX(xM)} y={toSY((yEaves + yRidge) / 2) - 18} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Pultdach-Sparren</text>
      )}
      <text x={toSX(xL) - 6} y={toSY(yEaves) + 18} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="end">Fußpfette</text>
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
  const stuetzAbstand = 4; // m

  const drawW = W - pad.l - pad.r;
  const drawH = H - pad.t - pad.b;

  const scaleX = drawW / bldL;
  const maxH = ridgeH * 1.2;
  const scaleY = drawH / maxH;

  const toSX = (mx: number) => pad.l + mx * scaleX;
  const toSY = (my: number) => pad.t + drawH - my * scaleY;

  // Stützenpositionen
  const stuetzCount = Math.max(2, Math.floor(bldL / stuetzAbstand) + 1);
  const stuetzPositions: number[] = Array.from({ length: stuetzCount }, (_, i) =>
    (i / (stuetzCount - 1)) * bldL
  );

  const midH = (ridgeH + eavesH) / 2; // Mittelpfette Höhe (vereinfacht)
  const midH2 = eavesH + (ridgeH - eavesH) * 0.45;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block' }}>
      <WoodPattern id="ls-wood" />

      {/* Boden */}
      <line x1={pad.l - 20} y1={toSY(0)} x2={W - pad.r + 10} y2={toSY(0)} stroke="#aaa" strokeWidth={1} strokeDasharray="4,3" />

      {/* Giebelwände links + rechts */}
      <rect x={toSX(0) - 14} y={toSY(ridgeH)} width={14} height={toSY(0) - toSY(ridgeH)} fill="url(#ls-wood)" stroke="#333" strokeWidth={1.2} />
      <rect x={toSX(bldL)} y={toSY(ridgeH)} width={14} height={toSY(0) - toSY(ridgeH)} fill="url(#ls-wood)" stroke="#333" strokeWidth={1.2} />

      {/* Stützen */}
      {stuetzPositions.map((sx, i) => (
        <rect
          key={i}
          x={toSX(sx) - 5} y={toSY(midH2)}
          width={10} height={toSY(0) - toSY(midH2)}
          fill="url(#ls-wood)" stroke="#333" strokeWidth={1}
        />
      ))}

      {/* Firstpfette */}
      <rect x={toSX(0)} y={toSY(ridgeH) - 10} width={toSX(bldL) - toSX(0)} height={10} fill="url(#ls-wood)" stroke="#333" strokeWidth={1.2} />

      {/* Mittelpfetten (2 Stück) */}
      <rect x={toSX(0)} y={toSY(midH2) - 10} width={toSX(bldL) - toSX(0)} height={10} fill="url(#ls-wood)" stroke="#444" strokeWidth={1} />
      <rect x={toSX(0)} y={toSY(midH) - 10} width={toSX(bldL) - toSX(0)} height={10} fill="url(#ls-wood)" stroke="#444" strokeWidth={1} />

      {/* Fußpfetten (2 Stück, Traufseiten) */}
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

      {/* Stützenfeldweiten */}
      {stuetzPositions.slice(0, -1).map((sx, i) => (
        <Dim
          key={i}
          x1={toSX(sx)} y1={toSY(-0.25)}
          x2={toSX(stuetzPositions[i + 1])} y2={toSY(-0.25)}
          label={`L${i + 1}=${fmt(stuetzPositions[i + 1] - sx)}`}
          flip
        />
      ))}

      {/* Pfettenhöhen links */}
      <Dim x1={toSX(-1.2)} y1={toSY(0)} x2={toSX(-1.2)} y2={toSY(eavesH)} label={fmt(eavesH)} />
      <Dim x1={toSX(-1.8)} y1={toSY(0)} x2={toSX(-1.8)} y2={toSY(ridgeH)} label={fmt(ridgeH)} />

      {/* Labels */}
      <text x={toSX(bldL / 2)} y={toSY(ridgeH) - 16} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Firstpfette</text>
      <text x={toSX(bldL / 2)} y={toSY(midH2) + 20} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Mittelpfetten</text>
      <text x={toSX(bldL / 2)} y={toSY(eavesH) + 18} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Fußpfetten</text>

      <text x={W / 2} y={18} fill="#333" fontSize={14} fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">Längsschnitt</text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3) DETAIL TRAUFE
// ════════════════════════════════════════════════════════════════════════════
function DetailTraufe({ geometry, members }: { geometry: BuildingGeometry; members: TimberMember[] }) {
  const W = 600, H = 400;

  const pitchDeg = geometry.roofPitch.value;
  const pitchRad = (pitchDeg * Math.PI) / 180;

  const sparren = members.find(m => m.type === 'sparren');
  const sparB = sparren ? sparren.width / 1000 : 0.08;   // m
  const sparH = sparren ? sparren.height / 1000 : 0.16;  // m

  const klaueTiefe = Math.min(0.04, sparH / 3);         // m
  const klaueBreite = 0.12;                              // m
  const ueberstand = 0.5;                                // m Dachüberstand
  const pfetteB = 0.14, pfetteH = 0.16;                 // m Fußpfette
  const mauerH = 0.24, mauerB = 0.3;                    // m Mauerkrone

  // Ursprung: Außenkante Mauer unten links = (120, 320)
  const ox = 120, oy = 320;
  const scale = 400; // 1m = 400px ... nein, zu groß. Passen wir an.
  const sc = 200; // 1m = 200px

  // Mauer-Außenkante x
  const mxL = ox;
  // Fußpfette sitzt auf Mauer
  const pfY = oy - mauerH * sc;
  const pfX = mxL - pfetteB * sc * 0.3;

  // Sparren-Fußpunkt (Außenkante Fußpfette, schräg links oben)
  const spFootX = pfX;
  const spFootY = pfY;

  // Sparren Richtungsvektor
  const svx = Math.cos(pitchRad), svy = -Math.sin(pitchRad);

  // Sparren-Länge in der Zeichnung
  const spLen = 2.2 * sc;

  // Sparren Eckpunkte (Rechteck)
  const nx = svy, ny = -svx; // normal nach oben-links
  const hw = sparB * sc / 2;

  const spTipX = spFootX + svx * spLen;
  const spTipY = spFootY + svy * spLen;

  // Klaue (Kerbe) am Sparren
  const klaueX = spFootX + svx * klaueBreite * sc;
  const klaueY = spFootY + svy * klaueBreite * sc;

  // Hilfsfunktion: Punkt auf Sparren-Unterkante
  const spBot = (t: number) => ({ x: spFootX + svx * t - nx * hw, y: spFootY + svy * t - ny * hw });
  const spTop = (t: number) => ({ x: spFootX + svx * t + nx * hw, y: spFootY + svy * t + ny * hw });

  const sp0 = spBot(0);
  const sp1 = spTop(0);
  const spE = spBot(spLen);
  const spE2 = spTop(spLen);

  // Kerb: 3-seitig ausschneiden
  const klaueD = klaueTiefe * sc;
  const k0 = spBot(0);
  const k1 = { x: k0.x + nx * klaueD, y: k0.y + ny * klaueD };
  const k2 = { x: spBot(klaueBreite * sc).x + nx * klaueD, y: spBot(klaueBreite * sc).y + ny * klaueD };
  const k3 = spBot(klaueBreite * sc);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block' }}>
      <WoodPattern id="dt-wood" />

      {/* Mauerkrone */}
      <rect
        x={ox - mauerB * sc * 0.6} y={oy - mauerH * sc}
        width={mauerB * sc} height={mauerH * sc}
        fill="url(#dt-wood)" stroke="#333" strokeWidth={1.5}
      />
      <text x={ox - mauerB * sc * 0.6 + 4} y={oy - mauerH * sc / 2} fill="#555" fontSize={10} fontFamily="sans-serif" dominantBaseline="middle">Mauerkrone</text>

      {/* Fußpfette */}
      <rect
        x={pfX} y={pfY - pfetteH * sc}
        width={pfetteB * sc} height={pfetteH * sc}
        fill="url(#dt-wood)" stroke="#333" strokeWidth={1.5}
      />
      <text x={pfX + pfetteB * sc / 2} y={pfY - pfetteH * sc - 8} fill="#555" fontSize={10} fontFamily="sans-serif" textAnchor="middle">Fußpfette</text>

      {/* Sparren (Umriss) */}
      <polygon
        points={`${sp0.x},${sp0.y} ${sp1.x},${sp1.y} ${spE2.x},${spE2.y} ${spE.x},${spE.y}`}
        fill="url(#dt-wood)" stroke="#333" strokeWidth={1.5}
      />

      {/* Klaue (Kerbe) – zeichne als weißes/leeres Polygon über Sparren */}
      <polygon
        points={`${k0.x},${k0.y} ${k1.x},${k1.y} ${k2.x},${k2.y} ${k3.x},${k3.y}`}
        fill="#fff" stroke="#333" strokeWidth={1}
      />
      <text
        x={(k0.x + k2.x) / 2 + 20} y={(k0.y + k2.y) / 2 + 10}
        fill="#555" fontSize={10} fontFamily="sans-serif"
      >Klaue</text>

      {/* Sturmanker-Symbol */}
      {(() => {
        const ax = pfX + pfetteB * sc * 0.7;
        const ay = pfY - pfetteH * sc / 2;
        return (
          <g>
            <line x1={ax} y1={ay} x2={ax + 20} y2={ay} stroke="#555" strokeWidth={1.5} />
            <line x1={ax + 20} y1={ay} x2={ax + 20} y2={ay - 14} stroke="#555" strokeWidth={1.5} />
            <line x1={ax + 14} y1={ay - 14} x2={ax + 26} y2={ay - 14} stroke="#555" strokeWidth={1.5} />
            <text x={ax + 30} y={ay - 10} fill="#555" fontSize={9} fontFamily="sans-serif">Sturmanker</text>
          </g>
        );
      })()}

      {/* Bemaßungen */}
      {/* Sparrenbreite – senkrecht zur Sparrenachse */}
      <Dim
        x1={sp0.x} y1={sp0.y}
        x2={sp1.x} y2={sp1.y}
        label={`b=${sparren ? sparren.width + ' mm' : fmt(sparB)}`}
        offset={12}
      />
      {/* Sparrenhöhe (entlang Sparren) */}
      <Dim
        x1={spTop(0.3 * sc).x} y1={spTop(0.3 * sc).y}
        x2={spTop(0.3 * sc + sparH * sc).x} y2={spTop(0.3 * sc + sparH * sc).y}
        label={`h=${sparren ? sparren.height + ' mm' : fmt(sparH)}`}
        offset={14} flip
      />
      {/* Klauentiefe */}
      <Dim
        x1={k0.x} y1={k0.y}
        x2={k1.x} y2={k1.y}
        label={`${Math.round(klaueTiefe * 1000)} mm`}
        offset={10}
      />
      {/* Dachüberstand (ab Mauerkante) */}
      <Dim
        x1={ox} y1={oy + 20}
        x2={spE.x} y2={oy + 20}
        label={`Üst. ${fmt(ueberstand)}`}
        flip
      />

      <text x={W / 2} y={18} fill="#333" fontSize={14} fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">Detail Traufe</text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORT: SchnittViews
// ════════════════════════════════════════════════════════════════════════════
export function SchnittViews({ geometry, roofForm: _roofForm, members, coveringName }: SchnittViewsProps) {
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
              <Querschnitt geometry={geometry} members={members} coveringName={coveringName} roofForm={_roofForm} />
            </div>
          </TabsContent>
          <TabsContent value="laengsschnitt">
            <div className="overflow-x-auto">
              <Laengsschnitt geometry={geometry} members={members} />
            </div>
          </TabsContent>
          <TabsContent value="traufe">
            <div className="overflow-x-auto">
              <DetailTraufe geometry={geometry} members={members} />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
