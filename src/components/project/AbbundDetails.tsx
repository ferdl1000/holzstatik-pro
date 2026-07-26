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

export interface AbbundGeom {
  buildingWidth: number;
  overhang: number;
  hasMittelpfette?: boolean;
  /** Statischer Stützenabstand aus dem Tragwerk-Tab [m] — Feldweite der Pfetten */
  supportSpacing?: number;
  /** Steher unter EINER tragenden Pfette — aus der echten Bauteilliste abgeleitet */
  stuetzenProPfette?: number;
  /** Kopfbänder (type 'rahm') sind im gewählten Tragsystem wirklich vorhanden */
  hasKopfband?: boolean;
  /** Pultdach: der Sparren spannt über die VOLLE Gebäudebreite, nicht die halbe.
   *  Danach richtet sich, wo die Mittelpfetten-Kerve sitzt. */
  isPultdach?: boolean;
  /** Auflagerbreite der Pfette [mm] — bestimmt Länge und Tiefe der Kerve */
  pfettenBreite?: number;
}
export interface AbbundDetailsProps {
  member: TimberMember;
  roofPitchDeg: number;
  geom?: AbbundGeom;
}

const SVG_W = 800;
const SVG_H = 400;

// Bauteil-Erkennung über den Namen aus autoMembers (gleiche Regeln wie in
// autoCalculate.isMauerbank — die Zeichnung muss dasselbe Bauteil meinen wie die Statik).
const RE_MAUERBANK = /mauerbank|fußpfette|fusspfette/i;
const RE_LAENGSPFETTE = /l(ä|ae|a)ngspfette/i;
const RE_TRAGPFETTE = /first|mittelpfette|\bMP\d|\bFP\d/i;
/** Stoß-Segmente („… (Stoß 1/2)") auf ihr Ausgangsbauteil zurückführen. */
function baseName(name: string): string {
  return name.replace(/\s*\(Stoß\s*\d+\s*\/\s*\d+\)\s*$/i, '').trim();
}

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
function SparrenDetail({ member, roofPitchDeg, geom }: { member: TimberMember; roofPitchDeg: number; geom?: AbbundGeom }) {
  const b = member.width;     // mm
  const h = member.height;    // mm
  const lengthMM = (member.length || 4) * 1000; // mm
  const alpha = roofPitchDeg;
  const klaueTiefe = Math.min(30, h / 3);
  const klaueBreite = 120; // typische Fußpfetten-Breite
  // Überstand aus der ECHTEN Projektgeometrie (Plan/Default), entlang der Schräge gemessen
  const cosAReal = Math.max(Math.cos((alpha * Math.PI) / 180), 0.5);
  const ueberstand = Math.round(((geom?.overhang ?? 0.3) * 1000) / cosAReal); // mm entlang Schräge

  // Maßstab: lengthMM auf ca 600px
  const scale = 600 / lengthMM;
  const drawLen = lengthMM * scale;
  const drawH = h * scale * 3; // Höhe 3-fach übertrieben damit erkennbar
  const startX = 100;
  const startY = 200;

  // ZIMMERER-DARSTELLUNG (Sparren flach liegend, wie beim Anreißen):
  // Der Balken hat DURCHGEHEND die gleiche Höhe. First liegt RECHTS. Alle
  // lotrechten Anrisse (Firstschnitt, Zierschnitt, Kerven-Stoß) sind PARALLEL
  // und neigen sich oben BERGWÄRTS (nach rechts) — am First erreicht die
  // OBERKANTE den Firstpunkt, die Unterkante endet um h·tanα früher.
  const tanA = Math.max(Math.tan((alpha * Math.PI) / 180), 0.09);
  const slant = drawH * tanA;                    // Schmiegen-Versatz über die Balkenhöhe

  // ── KERVE: Tiefe folgt aus der Auflagerbreite der Pfette, nicht umgekehrt ──
  // Die Kervensohle ist waagrecht und genau so lang, wie die Pfette breit ist —
  // sie sitzt ja auf der Pfette. Daraus folgt die Tiefe: t = Auflagerbreite · tan α.
  // Vorher war es andersherum (t fix 40 mm, Sohle = t/tan α). Bei flachen Dächern
  // ergab das Unsinn: bei 5° lief die Sohle über 457 mm aus — bei einer 120 mm
  // breiten Pfette. Die beiden Kerven fraßen dadurch das linke Drittel des
  // Sparrens auf und er sah aus, als würde er auslaufen.
  const tanReal = Math.tan((alpha * Math.PI) / 180);
  const pfettenBreiteMM = geom?.pfettenBreite ?? 120;
  const kerveTiefeMM = Math.min(h / 4, 40, pfettenBreiteMM * tanReal);
  // Unter ~2° schneidet der Zimmerer keine Kerve mehr — der Sparren liegt flach
  // auf und wird nur verankert.
  const kerveNoetig = alpha >= 2 && kerveTiefeMM >= 5;
  const tPix = kerveTiefeMM * scale * 3;         // gleiche Überhöhung wie drawH
  const slantT = tPix * tanA;                    // Stoß-Versatz über die Kerventiefe
  const sohleLen = pfettenBreiteMM * scale;      // Sohle = Auflagerbreite der Pfette
  const yT = startY, yB = startY + drawH;

  // Kervenpositionen (Stoß-Fußpunkt) entlang der Unterkante aus der ECHTEN
  // Geometrie: Fußpfette nach dem Überstand; Mittelpfette auf halber
  // Sparren-Stützweite. Beim SATTELDACH spannt der Sparren über die halbe
  // Gebäudebreite (Mittelpfette also bei B/4), beim PULTDACH über die volle
  // (Mittelpfette bei B/2). Vorher wurde immer B/4 gerechnet — beim Pultdach
  // saß die Kerve dadurch bei 28 % statt bei 50 % der Sparrenlänge.
  const xFuss = startX + ueberstand * scale;
  const hatMittelpfette = geom?.hasMittelpfette ?? false;
  const spannweiteMM = (geom?.buildingWidth ?? 8) * 1000 * (geom?.isPultdach ? 1 : 0.5);
  const mitteSlopeMM = (spannweiteMM / 2) / cosAReal;
  const xMitte = Math.min(
    startX + (ueberstand + mitteSlopeMM) * scale,
    startX + drawLen - slant - slantT - sohleLen - 10,
  );
  // Kerve im Anriss (Traversal der Unterkante von rechts nach links, x fällt monoton):
  // Sohlen-Auslauf (bergwärts) → waagrechte Sohle auf Pfetten-OK → lotrechter
  // Stoß runter auf die Unterkante; der Lotstoß steht TALSEITIG an der
  // Pfettenflanke und nimmt den Hangabtrieb auf (wie Roof3D sparrenProfil).
  const kerbe = (xStoss: number) =>
    `${xStoss + slantT + sohleLen},${yB} ${xStoss + slantT},${yB - tPix} ${xStoss},${yB}`;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full border bg-white">
      <WoodPattern id="wood-sp" />
      <text x={SVG_W / 2} y={28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#1e293b">
        Sparren – {member.name} ({b}/{h} mm, L = {(lengthMM / 1000).toFixed(2)} m, α = {alpha}°)
      </text>

      {/* Sparrenkörper: konstante Höhe, parallele Schmiegen, Kerven unten */}
      <polygon
        points={
          `${startX + slant},${yT} ` +                           // oben links (Zierschnitt-Kopf)
          `${startX + drawLen},${yT} ` +                         // oben rechts = FIRSTPUNKT (Oberkante erreicht den First)
          `${startX + drawLen - slant},${yB} ` +                 // unten rechts (Firstschnitt-Fuß, um h·tanα zurück)
          (hatMittelpfette && kerveNoetig ? `${kerbe(xMitte)} ` : '') +  // Kerve Mittelpfette (nur wenn statisch vorhanden)
          (kerveNoetig ? `${kerbe(xFuss)} ` : '') +              // Kerve Fußpfette (Mauerbank)
          `${startX},${yB}`                                      // unten links (Zierschnitt-Fuß, Unterkante ragt talwärts vor)
        }
        fill="url(#wood-sp)"
        stroke="#333"
        strokeWidth={1.5}
      />

      {/* Schnitte beschriften (kollisionsfrei: oben links/rechts, Kerven unten) */}
      <text x={startX + drawLen} y={yT - 8} fontSize={11} fill="#dc2626" textAnchor="end">Firstschnitt (Schmiege α={alpha}°)</text>
      <text x={startX + slant + 4} y={yT - 8} fontSize={11} fill="#dc2626">Zierschnitt Traufe</text>
      {kerveNoetig ? (
        <text x={xFuss} y={yB + 18} fontSize={11} fill="#0891b2" textAnchor="middle">
          Kerve Fußpfette t = {Math.round(kerveTiefeMM)} mm (Sohle {pfettenBreiteMM} mm)
        </text>
      ) : (
        <text x={xFuss} y={yB + 18} fontSize={11} fill="#0891b2" textAnchor="middle">
          Auflager Fußpfette — bei {alpha}° keine Kerve, Sparren liegt flach auf und wird verankert
        </text>
      )}
      {hatMittelpfette && kerveNoetig && (
        <text x={xMitte} y={yB + 18} fontSize={11} fill="#0891b2" textAnchor="middle">
          Kerve Mittelpfette t = {Math.round(kerveTiefeMM)} mm
        </text>
      )}

      {/* Bemaßung: Gesamtlänge (Schräglänge) */}
      <Dim x1={startX} y1={startY - 50} x2={startX + drawLen} y2={startY - 50}
           label={`Schräglänge ${fmt(lengthMM)}`} side="top" />
      {/* Bemaßung: Sparrenhöhe rechts (unterhalb des Firstschnitt-Labels) */}
      <Dim x1={startX + drawLen + 35} y1={yT} x2={startX + drawLen + 35} y2={yB}
           label={`h = ${h} mm`} side="right" />
      {/* Bemaßung: Überstand bis zur Fußpfetten-Kerve */}
      <Dim x1={startX} y1={yB + 50} x2={xFuss}
           y2={yB + 50} label={`Überstand ${ueberstand} mm`} side="bottom" />

      {/* Querschnitt-Skizze rechts oben */}
      <g transform={`translate(${SVG_W - 120}, 42)`}>
        <text x={50} y={-5} fontSize={11} fontWeight="bold" textAnchor="middle">Querschnitt</text>
        <rect x={0} y={0} width={50} height={80} fill="url(#wood-sp)" stroke="#333" strokeWidth={1.2} />
        <text x={25} y={95} fontSize={10} textAnchor="middle">{b} mm</text>
        <text x={-10} y={45} fontSize={10} textAnchor="end">{h} mm</text>
      </g>
    </svg>
  );
}

// ─── PFETTE-Detail ────────────────────────────────────────────────────────────
// Es wird NUR gezeichnet, was das gewählte Tragsystem wirklich hat:
// • Mauerbank (Fußpfette): liegt durchgehend auf der Mauerkrone → KEINE Stützen,
//   sondern Sturmanker-Verankerung in die Mauer (Stoß als Blattstoß auf der Krone).
// • Längspfette (Hallen-Modus): spannt von BSH-Hauptträger zu BSH-Hauptträger →
//   genau 2 Endauflager, kein 4-m-Raster.
// • First-/Mittelpfette: Giebel-/Innenwand als Endauflager + die Steher, die in
//   der Bauteilliste tatsächlich erzeugt (und nachgewiesen) wurden.
function PfetteDetail({ member, geom }: { member: TimberMember; roofPitchDeg: number; geom?: AbbundGeom }) {
  const b = member.width;
  const h = member.height;
  const lengthMM = (member.length || 8) * 1000;
  const scale = 650 / lengthMM;
  const drawLen = lengthMM * scale;
  const drawH = h * scale * 3;
  const startX = 75;
  const startY = 180;
  const yBot = startY + drawH;

  const istMauerbank = RE_MAUERBANK.test(member.name);
  const istLaengspfette = RE_LAENGSPFETTE.test(member.name);
  // Stoß-Segmente teilen sich die Steher der Ausgangspfette.
  const nSegmente = Number(member.name.match(/\(Stoß\s*\d+\s*\/\s*(\d+)\)/i)?.[1] ?? 1);
  const istSegment = nSegmente > 1;

  // Auflager aus der ECHTEN Bauteilliste: 2 Endauflager + die generierten Steher.
  // Nur wenn keine Steher-Information vorliegt, wird auf den statischen
  // Stützenabstand zurückgegriffen (derselbe Wert wie in resolveSpan).
  const spacingMM = (geom?.supportSpacing ?? 4) * 1000;
  const nSteher = istLaengspfette
    ? 0
    : geom?.stuetzenProPfette != null
      ? Math.max(0, Math.round(geom.stuetzenProPfette / nSegmente))
      : Math.max(0, Math.ceil(lengthMM / spacingMM) - 1);
  const nAuflager = nSteher + 2;
  const feldweite = lengthMM / (nAuflager - 1);

  // Mauerbank: Sturmanker ca. alle 1,5 m (= Verankerungsabstand, mit dem die
  // Mauerbank in resolveSpan auch gerechnet wird) bzw. an jedem 2. Sparren.
  const ankerAbst = 1500;
  const nAnker = Math.max(2, Math.round(lengthMM / ankerAbst) + 1);
  const ankerSpacing = lengthMM / (nAnker - 1);

  const endauflagerText = istLaengspfette
    ? 'Endauflager: BSH-Hauptträger'
    : istSegment
      ? 'Auflager / Stoßstelle'
      : 'Endauflager: Giebel-/tragende Innenwand';

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full border bg-white">
      <WoodPattern id="wood-pf" />
      <defs>
        <pattern id="mauer-pf" patternUnits="userSpaceOnUse" width="14" height="8">
          <rect width="14" height="8" fill="#e7e5e4" />
          <line x1="0" y1="0" x2="14" y2="0" stroke="#a8a29e" strokeWidth="0.8" />
          <line x1="0" y1="4" x2="0" y2="8" stroke="#a8a29e" strokeWidth="0.8" />
          <line x1="7" y1="0" x2="7" y2="4" stroke="#a8a29e" strokeWidth="0.8" />
          <line x1="0" y1="4" x2="14" y2="4" stroke="#a8a29e" strokeWidth="0.8" />
        </pattern>
      </defs>
      <text x={SVG_W / 2} y={28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#1e293b">
        {member.name} ({b}/{h} mm, L = {(lengthMM / 1000).toFixed(2)} m)
      </text>

      {/* Mauerkrone: die Mauerbank liegt VOLLFLÄCHIG auf, keine freie Stützweite */}
      {istMauerbank && (
        <>
          <rect x={startX - 12} y={yBot} width={drawLen + 24} height={26} fill="url(#mauer-pf)" stroke="#78716c" strokeWidth={1} />
          <text x={startX + drawLen / 2} y={yBot + 46} fontSize={11} fill="#78716c" textAnchor="middle">
            Mauerkrone – Mauerbank liegt durchgehend auf (kein freies Feld, keine Stützen)
          </text>
        </>
      )}

      {/* Liegender Balken */}
      <rect x={startX} y={startY} width={drawLen} height={drawH} fill="url(#wood-pf)" stroke="#333" strokeWidth={1.5} />

      {/* Sparren oben angedeutet (alle 80cm) */}
      {Array.from({ length: Math.floor(lengthMM / 800) }).map((_, i) => (
        <line key={i}
          x1={startX + (i + 1) * 800 * scale} y1={startY - 20}
          x2={startX + (i + 1) * 800 * scale} y2={startY}
          stroke="#888" strokeWidth={1} />
      ))}
      <text x={startX + drawLen / 2} y={startY - 30} fontSize={10} fill="#888" textAnchor="middle">
        {istMauerbank ? 'Sparren (mit Kerve aufgelagert)' : 'Sparren (oben aufgelagert)'}
      </text>

      {/* Mauerbank: Sturmanker statt Stützen */}
      {istMauerbank && Array.from({ length: nAnker }).map((_, i) => {
        const x = startX + i * ankerSpacing * scale;
        return (
          <g key={i}>
            <line x1={x} y1={startY - 2} x2={x} y2={yBot + 22} stroke="#b91c1c" strokeWidth={1.6} />
            <path d={`M ${x} ${yBot + 22} L ${x + 5} ${yBot + 22}`} stroke="#b91c1c" strokeWidth={1.6} fill="none" />
          </g>
        );
      })}
      {istMauerbank && (
        <>
          <text x={startX + drawLen / 2} y={yBot + 64} fontSize={11} fill="#b91c1c" textAnchor="middle">
            Sturmanker / Mauerbankanker – {nAnker} Stück, Abstand ≈ {fmt(ankerSpacing)} (jeder 2. Sparren)
          </text>
          <Dim x1={startX} y1={yBot + 84} x2={startX + ankerSpacing * scale} y2={yBot + 84}
               label={`Ankerabstand ${fmt(ankerSpacing)}`} side="bottom" />
        </>
      )}

      {/* Tragende Pfette: Endauflager (Wand/Hauptträger) + wirklich vorhandene Steher */}
      {!istMauerbank && Array.from({ length: nAuflager }).map((_, i) => {
        const x = startX + i * feldweite * scale;
        const istEnde = i === 0 || i === nAuflager - 1;
        return (
          <g key={i}>
            {istEnde ? (
              <rect x={x - 9} y={yBot} width={18} height={26} fill="url(#mauer-pf)" stroke="#78716c" strokeWidth={1} />
            ) : (
              <rect x={x - 5} y={yBot} width={10} height={34} fill="url(#wood-pf)" stroke="#333" strokeWidth={1} />
            )}
            <text x={x} y={yBot + 46} fontSize={10} fill="#666" textAnchor="middle">
              {istEnde ? 'A' : `ST${i}`}
            </text>
          </g>
        );
      })}
      {!istMauerbank && (
        <text x={startX + drawLen / 2} y={yBot + 62} fontSize={10} fill="#666" textAnchor="middle">
          {endauflagerText}
          {nSteher > 0 ? ` · ${nSteher} Steher lt. Bauteilliste` : ' · keine Steher in der Bauteilliste'}
        </text>
      )}

      {/* Bemaßung: Feldweiten — nur wenn es überhaupt mehrere Felder gibt */}
      {!istMauerbank && nAuflager > 2 && Array.from({ length: nAuflager - 1 }).map((_, i) => {
        const x1 = startX + i * feldweite * scale;
        const x2 = startX + (i + 1) * feldweite * scale;
        return (
          <Dim key={i} x1={x1} y1={yBot + 84} x2={x2} y2={yBot + 84}
               label={fmt(feldweite)} side="bottom" />
        );
      })}

      {/* Bemaßung: Gesamtlänge */}
      <Dim x1={startX} y1={startY - 60} x2={startX + drawLen} y2={startY - 60}
           label={`Gesamt: ${fmt(lengthMM)}`} side="top" />

      {/* Bemaßung: Höhe */}
      <Dim x1={startX + drawLen + 25} y1={startY} x2={startX + drawLen + 25} y2={yBot}
           label={`h = ${h} mm`} side="right" />

      {/* Hinweis Stoßstelle wenn länger als 6m */}
      {lengthMM > 6000 && (
        <text x={startX + drawLen / 2} y={startY + drawH / 2 + 4} fontSize={11} fill="#dc2626"
              textAnchor="middle" fontWeight="bold">
          {istMauerbank
            ? '⚠ Stoß: als Blattstoß / schräger Stoß auf der Mauerkrone ausführen'
            : istLaengspfette
              ? '⚠ Stoß: Stoßstelle über BSH-Hauptträger vorsehen'
              : '⚠ Stoß: Pfette über 6 m – Stoßstelle über Auflager/Steher vorsehen'}
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
// Kopfbänder und Zapfen werden NUR dargestellt, wenn sie im gewählten Tragsystem
// auch wirklich als Bauteil/Verbindung erzeugt, nachgewiesen und kalkuliert sind.
function StuetzeDetail({ member, geom }: { member: TimberMember; roofPitchDeg: number; geom?: AbbundGeom }) {
  const b = member.width;
  const h = member.height;
  const stHmm = (member.length || 3) * 1000;
  const scale = 300 / stHmm;
  const drawH = stHmm * scale;
  const drawB = b * scale * 3;
  const cx = 250;
  const cy = 80;
  const hatKopfband = geom?.hasKopfband ?? false;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full border bg-white">
      <WoodPattern id="wood-st" />
      <text x={SVG_W / 2} y={28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#1e293b">
        Stütze – {member.name} ({b}/{h} mm, H = {(stHmm / 1000).toFixed(2)} m)
      </text>

      {/* Vertikaler Balken (durchgehend — kein Zapfen, siehe Kopfanschluss) */}
      <rect x={cx} y={cy} width={drawB} height={drawH}
            fill="url(#wood-st)" stroke="#333" strokeWidth={1.5} />

      {/* Stützenkopf: Pfette liegt auf, Anschluss mit Stahl-Winkelverbinder.
          Ein Zapfenstoß wird nur gezeichnet, wenn er auch nachgewiesen ist —
          computeJoints erzeugt derzeit ausschließlich Längsstöße. */}
      <path d={`M ${cx} ${cy + 18} L ${cx} ${cy} L ${cx - 14} ${cy}`}
            stroke="#6b7280" strokeWidth={3} fill="none" />
      <path d={`M ${cx + drawB} ${cy + 18} L ${cx + drawB} ${cy} L ${cx + drawB + 14} ${cy}`}
            stroke="#6b7280" strokeWidth={3} fill="none" />
      <text x={cx + drawB / 2} y={cy - 10} fontSize={11} fill="#dc2626" textAnchor="middle">
        Stützenkopf: Pfette aufgelegt – Winkelverbinder / Stabdübel
      </text>

      {/* Fußplatte unten */}
      <rect x={cx - 15} y={cy + drawH} width={drawB + 30} height={10} fill="#888" stroke="#333" />
      <text x={cx + drawB / 2} y={cy + drawH + 30} fontSize={11} fill="#0891b2" textAnchor="middle">
        Fußplatte / Schwelle + Anker
      </text>

      {/* Kopfband: nur wenn die Bauteilliste Kopfbänder (type 'rahm') enthält */}
      {hatKopfband ? (
        <>
          <line x1={cx + drawB} y1={cy + drawH * 0.3} x2={cx + drawB + 80} y2={cy + drawH * 0.3 - 80}
                stroke="#16a34a" strokeWidth={2} strokeDasharray="4 2" />
          <text x={cx + drawB + 90} y={cy + drawH * 0.3 - 80} fontSize={11} fill="#16a34a">Kopfband 45°</text>
          <line x1={cx} y1={cy + drawH * 0.3} x2={cx - 80} y2={cy + drawH * 0.3 - 80}
                stroke="#16a34a" strokeWidth={2} strokeDasharray="4 2" />
          <text x={cx - 90} y={cy + drawH * 0.3 - 80} fontSize={11} fill="#16a34a" textAnchor="end">Kopfband 45°</text>
        </>
      ) : (
        <text x={SVG_W / 2} y={SVG_H - 12} fontSize={10} fill="#b45309" textAnchor="middle">
          Kein Kopfband in der Bauteilliste – Längsaussteifung des Stuhls gesondert nachweisen und einpreisen.
        </text>
      )}

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
export function AbbundDetails({ member, roofPitchDeg, geom }: AbbundDetailsProps) {
  const typeFn: Record<string, (p: { member: TimberMember; roofPitchDeg: number; geom?: AbbundGeom }) => JSX.Element> = {
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
  return <Fn member={member} roofPitchDeg={roofPitchDeg} geom={geom} />;
}

// ─── Übersicht: AbbundOverview (alle Bauteiltypen aus Project.members) ────────
export interface AbbundOverviewProps {
  members: TimberMember[];
  roofPitchDeg: number;
  geom?: AbbundGeom;
}

export function AbbundOverview({ members, roofPitchDeg, geom }: AbbundOverviewProps) {
  if (!members || members.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Noch keine Bauteile generiert. Bitte erst die Komplett-Analyse durchführen.
        </CardContent>
      </Card>
    );
  }

  // Repräsentanten aus der ECHTEN Bauteilliste wählen — nicht blind das erste
  // Element je Typ: Mauerbank und tragende Pfette sind verschiedene Bauteile mit
  // verschiedenen Auflagern und brauchen daher je einen eigenen Detailplan.
  const pfetten = members.filter(m => m.type === 'pfette');
  const mauerbank = pfetten.find(m => RE_MAUERBANK.test(m.name));
  const tragpfette =
    pfetten.find(m => RE_TRAGPFETTE.test(m.name)) ??
    pfetten.find(m => RE_LAENGSPFETTE.test(m.name)) ??
    pfetten.find(m => !RE_MAUERBANK.test(m.name));

  // Stoß-Segmente zählen nur einmal (sie tragen die Menge des Ausgangsbauteils).
  const uniqueByBase = (list: TimberMember[]): TimberMember[] => {
    const seen = new Set<string>();
    return list.filter(m => {
      const key = baseName(m.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const stuetzenQty = uniqueByBase(members.filter(m => m.type === 'stuetze'))
    .reduce((sum, m) => sum + (m.quantity || 0), 0);
  const nTragpfetten = uniqueByBase(pfetten.filter(m => !RE_MAUERBANK.test(m.name))).length;

  // Geometrie/Bauteil-Fakten für die Detailzeichnungen: übergebene Werte haben
  // Vorrang, alles andere wird aus der Bauteilliste abgeleitet.
  const geomEff: AbbundGeom = {
    buildingWidth: geom?.buildingWidth ?? 8,
    overhang: geom?.overhang ?? 0.4,
    hasMittelpfette: geom?.hasMittelpfette ?? pfetten.some(m => /mittel/i.test(m.name)),
    supportSpacing: geom?.supportSpacing,
    stuetzenProPfette: geom?.stuetzenProPfette
      ?? (nTragpfetten > 0 ? Math.round(stuetzenQty / nTragpfetten) : 0),
    hasKopfband: geom?.hasKopfband ?? members.some(m => m.type === 'rahm'),
    // Diese beiden MÜSSEN durchgereicht werden: die Dachform entscheidet, ob der
    // Sparren über die halbe oder die volle Gebäudebreite spannt (und damit, wo
    // die Mittelpfetten-Kerve sitzt), und die Pfettenbreite bestimmt Länge und
    // Tiefe der Kerve. Wurden sie hier vergessen, zeichnete der Abbundplan das
    // Pultdach wie ein Satteldach.
    isPultdach: geom?.isPultdach ?? false,
    pfettenBreite: geom?.pfettenBreite
      ?? (tragpfette?.width ?? mauerbank?.width ?? 120),
  };

  const grouped: { key: string; label: string; member: TimberMember }[] = [];
  const add = (key: string, label: string, m?: TimberMember) => {
    if (m) grouped.push({ key, label, member: m });
  };
  add('sparren', 'Sparren', members.find(m => m.type === 'sparren'));
  add('pfette', 'Pfette', tragpfette);
  add('mauerbank', 'Mauerbank', mauerbank);
  add('stuetze', 'Stütze', members.find(m => m.type === 'stuetze'));
  add('kehlbalken', 'Kehlbalken', members.find(m => m.type === 'kehlbalken'));
  add('leimbinder', 'BSH-Träger', members.find(m => m.type === 'leimbinder'));
  add('rahm', 'Kopfband', members.find(m => m.type === 'rahm'));

  if (grouped.length === 0) return null;

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
        <Tabs defaultValue={grouped[0].key}>
          <TabsList>
            {grouped.map(g => (
              <TabsTrigger key={g.key} value={g.key}>{g.label}</TabsTrigger>
            ))}
          </TabsList>
          {grouped.map(g => (
            <TabsContent key={g.key} value={g.key} className="mt-3">
              <AbbundDetails member={g.member} roofPitchDeg={roofPitchDeg} geom={geomEff} />
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
