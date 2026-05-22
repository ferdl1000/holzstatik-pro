/**
 * Abbund-Detailansichten als SVG.
 * Zeigt pro Bauteiltyp einen Detailplan mit Maßen + Winkeln + Kerbenschnitten,
 * wie ihn der Zimmerer für den Abbund braucht.
 */

import type { TimberMember } from '@/types/project';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { InfoTooltip } from '@/components/help/InfoTooltip';
import { Hammer } from 'lucide-react';

export interface AbbundDetailsProps {
  member: TimberMember;
  roofPitchDeg: number;
}

const SVG_W = 800;
const SVG_H = 400;

function fmt(n: number, unit: 'mm' | 'm' = 'mm'): string {
  if (unit === 'mm') return `${Math.round(n)} mm`;
  return `${n.toFixed(2)} m`;
}

// === Helper: Bemaßungs-Linie mit Pfeilen ===
function Dim({ x1, y1, x2, y2, label, side = 'top', color = '#666' }: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; side?: 'top' | 'bottom' | 'left' | 'right'; color?: string;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const labelOffset = 12;
  const lx = mx + nx * (side === 'bottom' || side === 'right' ? -labelOffset : labelOffset);
  const ly = my + ny * (side === 'bottom' || side === 'right' ? -labelOffset : labelOffset);
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} />
      {/* Pfeile */}
      <polygon points={`${x1},${y1} ${x1 + ux * 8 + nx * 3},${y1 + uy * 8 + ny * 3} ${x1 + ux * 8 - nx * 3},${y1 + uy * 8 - ny * 3}`} fill={color} />
      <polygon points={`${x2},${y2} ${x2 - ux * 8 + nx * 3},${y2 - uy * 8 + ny * 3} ${x2 - ux * 8 - nx * 3},${y2 - uy * 8 - ny * 3}`} fill={color} />
      {/* Maßlinien-Endstriche (kurz, senkrecht) */}
      <line x1={x1 + nx * 4} y1={y1 + ny * 4} x2={x1 - nx * 4} y2={y1 - ny * 4} stroke={color} strokeWidth={0.7} />
      <line x1={x2 + nx * 4} y1={y2 + ny * 4} x2={x2 - nx * 4} y2={y2 - ny * 4} stroke={color} strokeWidth={0.7} />
      <text x={lx} y={ly} fill="#222" fontSize={12} fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle">
        {label}
      </text>
    </>
  );
}

// === Helper: Holz-Schraffur als Pattern (definiert einmal pro SVG) ===
function WoodPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6">
        <rect width="6" height="6" fill="#f5e9d5" />
        <line x1="0" y1="6" x2="6" y2="0" stroke="#c9b48a" strokeWidth="0.6" />
      </pattern>
    </defs>
  );
}

// ─── SPARREN-Detail ────────────────────────────────────────────────────────────
function SparrenDetail({ member, roofPitchDeg }: { member: TimberMember; roofPitchDeg: number }) {
  const b = member.width;     // mm
  const h = member.height;    // mm
  const lengthMM = (member.length || 4) * 1000; // mm
  const alpha = roofPitchDeg;
  const klaueTiefe = Math.min(30, h / 3);
  const klaueBreite = 120; // typische Fußpfetten-Breite
  const ueberstand = 300;  // mm Dachüberstand am Sparrenkopf

  // Maßstab: lengthMM auf ca 600px
  const scale = 600 / lengthMM;
  const drawLen = lengthMM * scale;
  const drawH = h * scale * 3; // Höhe 3-fach übertrieben damit erkennbar
  const startX = 100;
  const startY = 200;

  // Sparrenkopf (vorne, links) — schräger Schnitt im Winkel α
  const headCut = drawH / Math.tan((alpha * Math.PI) / 180);

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full border bg-white">
      <WoodPattern id="wood-sp" />
      <text x={SVG_W / 2} y={28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#1e293b">
        Sparren – {member.name} ({b}/{h} mm, L = {(lengthMM / 1000).toFixed(2)} m, α = {alpha}°)
      </text>

      {/* Sparrenkörper als schräges Rechteck (Seitenansicht horizontal vereinfacht) */}
      <polygon
        points={`${startX + headCut},${startY} ${startX + drawLen},${startY} ${startX + drawLen - klaueBreite * scale},${startY + drawH} ${startX + drawLen - klaueBreite * scale - klaueTiefe * scale * 3},${startY + drawH} ${startX + drawLen - klaueBreite * scale - klaueTiefe * scale * 3},${startY + drawH - klaueTiefe * scale * 3} ${startX},${startY + drawH - klaueTiefe * scale * 3} ${startX},${startY + drawH * 0.3} ${startX + headCut},${startY + drawH * 0.3}`}
        fill="url(#wood-sp)"
        stroke="#333"
        strokeWidth={1.5}
      />

      {/* Sparrenkopf-Schräge markieren */}
      <line x1={startX} y1={startY} x2={startX + headCut} y2={startY} stroke="#333" strokeWidth={1.5} />
      <text x={startX - 5} y={startY - 8} fontSize={11} fill="#dc2626" textAnchor="end">Sparrenkopf-Schmiege α={alpha}°</text>

      {/* Klaue an Fußpfette markieren */}
      <text x={startX + drawLen - klaueBreite * scale - klaueTiefe * scale * 3 - 5} y={startY + drawH + 18} fontSize={11} fill="#dc2626" textAnchor="end">
        Klaue (Fußpfette) t = {Math.round(klaueTiefe)} mm
      </text>

      {/* Ausklinkung an Mittelpfette in der Mitte */}
      <rect x={startX + drawLen * 0.45} y={startY + drawH - 15} width={70} height={15}
            fill="none" stroke="#0891b2" strokeWidth={1.5} strokeDasharray="4 2" />
      <text x={startX + drawLen * 0.45 + 35} y={startY + drawH + 30} fontSize={11} fill="#0891b2" textAnchor="middle">
        Ausklinkung Mittelpfette
      </text>

      {/* Bemaßung: Gesamtlänge (Schräglänge) */}
      <Dim x1={startX} y1={startY - 50} x2={startX + drawLen} y2={startY - 50}
           label={`Schräglänge ${fmt(lengthMM)}`} side="top" />
      {/* Bemaßung: Sparrenhöhe rechts */}
      <Dim x1={startX + drawLen + 30} y1={startY} x2={startX + drawLen + 30} y2={startY + drawH}
           label={`h = ${h} mm`} side="right" />
      {/* Bemaßung: Sparrenkopf-Überstand */}
      <Dim x1={startX + headCut} y1={startY + drawH + 50} x2={startX + headCut + ueberstand * scale}
           y2={startY + drawH + 50} label={`Überstand ${ueberstand} mm`} side="bottom" />

      {/* Querschnitt-Skizze rechts oben */}
      <g transform={`translate(${SVG_W - 130}, 60)`}>
        <text x={50} y={-5} fontSize={11} fontWeight="bold" textAnchor="middle">Querschnitt</text>
        <rect x={0} y={0} width={50} height={80} fill="url(#wood-sp)" stroke="#333" strokeWidth={1.2} />
        <text x={25} y={95} fontSize={10} textAnchor="middle">{b} mm</text>
        <text x={-10} y={45} fontSize={10} textAnchor="end">{h} mm</text>
      </g>
    </svg>
  );
}

// ─── PFETTE-Detail ────────────────────────────────────────────────────────────
function PfetteDetail({ member }: { member: TimberMember; roofPitchDeg: number }) {
  const b = member.width;
  const h = member.height;
  const lengthMM = (member.length || 8) * 1000;
  const scale = 650 / lengthMM;
  const drawLen = lengthMM * scale;
  const drawH = h * scale * 3;
  const startX = 75;
  const startY = 180;

  // Annahme: Stützenabstand ~4m
  const stuetzAbst = 4000;
  const nStuetz = Math.max(2, Math.ceil(lengthMM / stuetzAbst) + 1);
  const realSpacing = lengthMM / (nStuetz - 1);

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full border bg-white">
      <WoodPattern id="wood-pf" />
      <text x={SVG_W / 2} y={28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#1e293b">
        {member.name} ({b}/{h} mm, L = {(lengthMM / 1000).toFixed(2)} m)
      </text>

      {/* Liegender Balken */}
      <rect x={startX} y={startY} width={drawLen} height={drawH} fill="url(#wood-pf)" stroke="#333" strokeWidth={1.5} />

      {/* Sparren oben angedeutet (alle 80cm) */}
      {Array.from({ length: Math.floor(lengthMM / 800) }).map((_, i) => (
        <line key={i}
          x1={startX + (i + 1) * 800 * scale} y1={startY - 20}
          x2={startX + (i + 1) * 800 * scale} y2={startY}
          stroke="#888" strokeWidth={1} />
      ))}
      <text x={startX + drawLen / 2} y={startY - 30} fontSize={10} fill="#888" textAnchor="middle">Sparren (oben aufgelagert)</text>

      {/* Stützen unten als Dreiecke */}
      {Array.from({ length: nStuetz }).map((_, i) => {
        const x = startX + i * realSpacing * scale;
        return (
          <g key={i}>
            <polygon points={`${x - 8},${startY + drawH + 25} ${x + 8},${startY + drawH + 25} ${x},${startY + drawH + 5}`}
                     fill="#666" />
            <text x={x} y={startY + drawH + 38} fontSize={10} fill="#666" textAnchor="middle">S{i + 1}</text>
          </g>
        );
      })}

      {/* Bemaßung: Stützenabstände */}
      {Array.from({ length: nStuetz - 1 }).map((_, i) => {
        const x1 = startX + i * realSpacing * scale;
        const x2 = startX + (i + 1) * realSpacing * scale;
        return (
          <Dim key={i} x1={x1} y1={startY + drawH + 70} x2={x2} y2={startY + drawH + 70}
               label={fmt(realSpacing)} side="bottom" />
        );
      })}

      {/* Bemaßung: Gesamtlänge */}
      <Dim x1={startX} y1={startY - 60} x2={startX + drawLen} y2={startY - 60}
           label={`Gesamt: ${fmt(lengthMM)}`} side="top" />

      {/* Bemaßung: Höhe */}
      <Dim x1={startX + drawLen + 25} y1={startY} x2={startX + drawLen + 25} y2={startY + drawH}
           label={`h = ${h} mm`} side="right" />

      {/* Hinweis Stoßstelle wenn länger als 6m */}
      {lengthMM > 6000 && (
        <text x={startX + drawLen / 2} y={startY + drawH / 2} fontSize={11} fill="#dc2626"
              textAnchor="middle" fontWeight="bold">
          ⚠ Stoß: Pfette über {lengthMM / 1000 > 6 ? '6 m' : ''} – Stoßstelle über Stütze vorsehen
        </text>
      )}

      {/* Querschnitt */}
      <g transform={`translate(${SVG_W - 130}, 60)`}>
        <text x={50} y={-5} fontSize={11} fontWeight="bold" textAnchor="middle">Querschnitt</text>
        <rect x={0} y={0} width={50} height={80} fill="url(#wood-pf)" stroke="#333" strokeWidth={1.2} />
        <text x={25} y={95} fontSize={10} textAnchor="middle">{b} mm</text>
        <text x={-10} y={45} fontSize={10} textAnchor="end">{h} mm</text>
      </g>
    </svg>
  );
}

// ─── STÜTZE-Detail ────────────────────────────────────────────────────────────
function StuetzeDetail({ member }: { member: TimberMember; roofPitchDeg: number }) {
  const b = member.width;
  const h = member.height;
  const stHmm = (member.length || 3) * 1000;
  const scale = 300 / stHmm;
  const drawH = stHmm * scale;
  const drawB = b * scale * 3;
  const cx = 250;
  const cy = 80;
  const zapfen = 50; // 50mm Zapfen oben

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full border bg-white">
      <WoodPattern id="wood-st" />
      <text x={SVG_W / 2} y={28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#1e293b">
        Stütze – {member.name} ({b}/{h} mm, H = {(stHmm / 1000).toFixed(2)} m)
      </text>

      {/* Vertikaler Balken */}
      <rect x={cx} y={cy + zapfen * scale * 3} width={drawB} height={drawH - zapfen * scale * 3}
            fill="url(#wood-st)" stroke="#333" strokeWidth={1.5} />

      {/* Zapfen oben */}
      <rect x={cx + drawB * 0.25} y={cy} width={drawB * 0.5} height={zapfen * scale * 3}
            fill="url(#wood-st)" stroke="#333" strokeWidth={1.5} />
      <text x={cx + drawB / 2} y={cy - 8} fontSize={11} fill="#dc2626" textAnchor="middle">
        Zapfen für Pfette: {Math.round(b * 0.5)}×{zapfen} mm
      </text>

      {/* Fußplatte unten */}
      <rect x={cx - 15} y={cy + drawH} width={drawB + 30} height={10} fill="#888" stroke="#333" />
      <text x={cx + drawB / 2} y={cy + drawH + 30} fontSize={11} fill="#0891b2" textAnchor="middle">
        Fußplatte / Schwelle + Anker
      </text>

      {/* Kopfband angedeutet (45° schräg) */}
      <line x1={cx + drawB} y1={cy + drawH * 0.3} x2={cx + drawB + 80} y2={cy + drawH * 0.3 - 80}
            stroke="#16a34a" strokeWidth={2} strokeDasharray="4 2" />
      <text x={cx + drawB + 90} y={cy + drawH * 0.3 - 80} fontSize={11} fill="#16a34a">Kopfband 45°</text>
      <line x1={cx} y1={cy + drawH * 0.3} x2={cx - 80} y2={cy + drawH * 0.3 - 80}
            stroke="#16a34a" strokeWidth={2} strokeDasharray="4 2" />
      <text x={cx - 90} y={cy + drawH * 0.3 - 80} fontSize={11} fill="#16a34a" textAnchor="end">Kopfband 45°</text>

      {/* Bemaßung: Höhe */}
      <Dim x1={cx - 50} y1={cy} x2={cx - 50} y2={cy + drawH}
           label={`H = ${(stHmm / 1000).toFixed(2)} m`} side="left" />
      {/* Bemaßung: Breite */}
      <Dim x1={cx} y1={cy + drawH + 60} x2={cx + drawB} y2={cy + drawH + 60}
           label={`b = ${b} mm`} side="bottom" />

      {/* Querschnitt */}
      <g transform={`translate(${SVG_W - 130}, 60)`}>
        <text x={50} y={-5} fontSize={11} fontWeight="bold" textAnchor="middle">Querschnitt</text>
        <rect x={0} y={0} width={50} height={50} fill="url(#wood-st)" stroke="#333" strokeWidth={1.2} />
        <text x={25} y={65} fontSize={10} textAnchor="middle">{b} mm</text>
        <text x={-10} y={28} fontSize={10} textAnchor="end">{h} mm</text>
      </g>
    </svg>
  );
}

// ─── KEHLBALKEN-Detail ────────────────────────────────────────────────────────
function KehlbalkenDetail({ member }: { member: TimberMember; roofPitchDeg: number }) {
  const b = member.width;
  const h = member.height;
  const lengthMM = (member.length || 4) * 1000;
  const scale = 550 / lengthMM;
  const drawLen = lengthMM * scale;
  const drawH = h * scale * 3;
  const startX = 100;
  const startY = 200;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full border bg-white">
      <WoodPattern id="wood-kb" />
      <text x={SVG_W / 2} y={28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#1e293b">
        Kehlbalken – {member.name} ({b}/{h} mm, L = {(lengthMM / 1000).toFixed(2)} m)
      </text>

      {/* Sparren links + rechts (schräg) angedeutet */}
      <line x1={startX - 40} y1={startY + drawH + 60} x2={startX + 20} y2={startY - 30} stroke="#666" strokeWidth={4} />
      <line x1={startX + drawLen + 40} y1={startY + drawH + 60} x2={startX + drawLen - 20} y2={startY - 30} stroke="#666" strokeWidth={4} />
      <text x={startX - 30} y={startY + drawH + 80} fontSize={10} fill="#666">Sparren links</text>
      <text x={startX + drawLen + 30} y={startY + drawH + 80} fontSize={10} fill="#666">Sparren rechts</text>

      {/* Kehlbalken liegend */}
      <rect x={startX} y={startY} width={drawLen} height={drawH} fill="url(#wood-kb)" stroke="#333" strokeWidth={1.5} />

      {/* Schraubverbindung an Enden */}
      <circle cx={startX + 15} cy={startY + drawH / 2} r={5} fill="#444" />
      <circle cx={startX + drawLen - 15} cy={startY + drawH / 2} r={5} fill="#444" />
      <text x={startX + 15} y={startY - 8} fontSize={10} fill="#dc2626" textAnchor="middle">2 × Bolzen M12</text>
      <text x={startX + drawLen - 15} y={startY - 8} fontSize={10} fill="#dc2626" textAnchor="middle">2 × Bolzen M12</text>

      {/* Bemaßung Länge */}
      <Dim x1={startX} y1={startY - 50} x2={startX + drawLen} y2={startY - 50}
           label={`L = ${fmt(lengthMM)}`} side="top" />
      {/* Höhe */}
      <Dim x1={startX + drawLen + 25} y1={startY} x2={startX + drawLen + 25} y2={startY + drawH}
           label={`h = ${h} mm`} side="right" />

      {/* Querschnitt */}
      <g transform={`translate(${SVG_W - 130}, 60)`}>
        <text x={50} y={-5} fontSize={11} fontWeight="bold" textAnchor="middle">Querschnitt</text>
        <rect x={0} y={0} width={50} height={70} fill="url(#wood-kb)" stroke="#333" strokeWidth={1.2} />
        <text x={25} y={85} fontSize={10} textAnchor="middle">{b} mm</text>
        <text x={-10} y={40} fontSize={10} textAnchor="end">{h} mm</text>
      </g>
    </svg>
  );
}

// ─── LEIMBINDER-Detail (BSH) ──────────────────────────────────────────────────
function LeimbinderDetail({ member, roofPitchDeg }: { member: TimberMember; roofPitchDeg: number }) {
  const b = member.width;
  const h = member.height;
  const spanMM = (member.length || 15) * 1000;
  const isSatteltraeger = roofPitchDeg > 5;
  const scale = 600 / spanMM;
  const drawLen = spanMM * scale;
  const drawH = h * scale * 1.8;
  const rise = isSatteltraeger ? drawLen * 0.10 : 0;
  const startX = 100;
  const startY = 220;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full border bg-white">
      <WoodPattern id="wood-lb" />
      <text x={SVG_W / 2} y={28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#1e293b">
        BSH-{isSatteltraeger ? 'Sattel' : ''}Träger – {member.name} ({b}/{h} mm, Spannweite {(spanMM / 1000).toFixed(2)} m)
      </text>

      {/* BSH-Träger - bei Sattelträger oben gewölbt */}
      {isSatteltraeger ? (
        <polygon
          points={`${startX},${startY} ${startX + drawLen / 2},${startY - rise} ${startX + drawLen},${startY} ${startX + drawLen},${startY + drawH} ${startX},${startY + drawH}`}
          fill="url(#wood-lb)"
          stroke="#333"
          strokeWidth={1.5}
        />
      ) : (
        <rect x={startX} y={startY} width={drawLen} height={drawH} fill="url(#wood-lb)" stroke="#333" strokeWidth={1.5} />
      )}

      {/* Auflagerschuhe an beiden Enden */}
      <g>
        <rect x={startX - 30} y={startY + drawH} width={50} height={15} fill="#9ca3af" stroke="#333" />
        <rect x={startX + drawLen - 20} y={startY + drawH} width={50} height={15} fill="#9ca3af" stroke="#333" />
        <text x={startX - 5} y={startY + drawH + 40} fontSize={10} fill="#0891b2" textAnchor="middle">Auflagerschuh Stahl verzinkt</text>
        <text x={startX + drawLen + 5} y={startY + drawH + 40} fontSize={10} fill="#0891b2" textAnchor="middle">Auflagerschuh Stahl verzinkt</text>
      </g>

      {/* Stützen unten symbolisch */}
      <rect x={startX - 25} y={startY + drawH + 15} width={40} height={60} fill="#cbd5e1" stroke="#333" />
      <rect x={startX + drawLen - 15} y={startY + drawH + 15} width={40} height={60} fill="#cbd5e1" stroke="#333" />

      {/* Bemaßung: Spannweite */}
      <Dim x1={startX} y1={startY - 60} x2={startX + drawLen} y2={startY - 60}
           label={`Spannweite ${fmt(spanMM)}`} side="top" />
      {/* Bemaßung: Höhe */}
      <Dim x1={startX + drawLen + 35} y1={startY} x2={startX + drawLen + 35} y2={startY + drawH}
           label={`h = ${h} mm`} side="right" />
      {/* Bemaßung: Stich/Pfeil bei Sattel */}
      {isSatteltraeger && (
        <Dim x1={startX + drawLen / 2 - 30} y1={startY} x2={startX + drawLen / 2 - 30} y2={startY - rise}
             label={`Stich ${Math.round(rise / scale)} mm`} side="left" />
      )}

      {/* Hinweis: Material */}
      <text x={startX + drawLen / 2} y={startY + drawH / 2} fontSize={12} fill="#1e293b"
            textAnchor="middle" fontWeight="bold">
        {(member.material || 'GL24h').toUpperCase()}
      </text>

      {/* Querschnitt */}
      <g transform={`translate(${SVG_W - 130}, 60)`}>
        <text x={50} y={-5} fontSize={11} fontWeight="bold" textAnchor="middle">Querschnitt</text>
        <rect x={0} y={0} width={50} height={100} fill="url(#wood-lb)" stroke="#333" strokeWidth={1.2} />
        <text x={25} y={115} fontSize={10} textAnchor="middle">{b} mm</text>
        <text x={-10} y={55} fontSize={10} textAnchor="end">{h} mm</text>
      </g>
    </svg>
  );
}

// ─── Hauptkomponente: AbbundDetails (1 Bauteil) ───────────────────────────────
export function AbbundDetails({ member, roofPitchDeg }: AbbundDetailsProps) {
  const typeFn: Record<string, (p: { member: TimberMember; roofPitchDeg: number }) => JSX.Element> = {
    sparren: SparrenDetail,
    nebentraeger: SparrenDetail,
    pfette: PfetteDetail,
    stuetze: StuetzeDetail,
    kehlbalken: KehlbalkenDetail,
    zange: KehlbalkenDetail,
    leimbinder: LeimbinderDetail,
    rahm: KehlbalkenDetail,
    auswechslung: PfetteDetail,
  };
  const Fn = typeFn[member.type] || PfetteDetail;
  return <Fn member={member} roofPitchDeg={roofPitchDeg} />;
}

// ─── Übersicht: AbbundOverview (alle Bauteiltypen aus Project.members) ────────
export interface AbbundOverviewProps {
  members: TimberMember[];
  roofPitchDeg: number;
}

export function AbbundOverview({ members, roofPitchDeg }: AbbundOverviewProps) {
  if (!members || members.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Noch keine Bauteile generiert. Bitte erst die Komplett-Analyse durchführen.
        </CardContent>
      </Card>
    );
  }

  // Pro Typ ein Repräsentant (das erste Element)
  const types = ['sparren', 'pfette', 'stuetze', 'kehlbalken', 'leimbinder', 'rahm'] as const;
  const grouped = types
    .map(t => ({ type: t, member: members.find(m => m.type === t) }))
    .filter(g => g.member);

  if (grouped.length === 0) return null;

  const labels: Record<string, string> = {
    sparren: 'Sparren', pfette: 'Pfette', stuetze: 'Stütze',
    kehlbalken: 'Kehlbalken', leimbinder: 'BSH-Träger', rahm: 'Kopfband',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hammer className="h-4 w-4 text-primary" />
          Abbund-Detailpläne
          <InfoTooltip title="Abbund-Details">
            <p>Detailansichten pro Bauteiltyp mit Maßen, Winkeln, Kerbenschnitten, Klauen, Zapfen — für den Abbund in der Halle.</p>
          </InfoTooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={grouped[0].type}>
          <TabsList>
            {grouped.map(g => (
              <TabsTrigger key={g.type} value={g.type}>{labels[g.type]}</TabsTrigger>
            ))}
          </TabsList>
          {grouped.map(g => (
            <TabsContent key={g.type} value={g.type} className="mt-3">
              <AbbundDetails member={g.member!} roofPitchDeg={roofPitchDeg} />
              <div className="mt-2 text-xs text-muted-foreground">
                Vereinfachte Detailansicht für Klassische Holzverbindungen. Konkrete Maße/Verbinder vom Statiker prüfen lassen.
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default AbbundOverview;
