/**
 * DXF R12 (ASCII) 3D-Export für SEMA / AutoCAD / Allplan.
 *
 * Jeder TimberMember wird als 3D-Solid (6×3DFACE-Flächen) dargestellt.
 * Positionierung 1:1 aus buildPartBoxes (Roof3D.tsx) übernommen:
 *   Sparren gestaffelt mit Neigung, Pfetten liegend, Stützen vertikal, etc.
 * Layer-Namen und Farben sind SEMA-konform.
 *
 * DXF-Version bleibt R12 (AC1009) für universelle Kompatibilität.
 */

import type { Project, TimberMember } from '@/types/project';
import type { RoofPart } from '@/types/roofParts';

// ─── SEMA-konforme Layer-Definitionen ─────────────────────────────────────────

interface LayerDef { name: string; color: number; }

/** SEMA-konformes Layer-System mit AutoCAD-Standardfarben. */
const SEMA_LAYERS: Record<string, LayerDef> = {
  sparren:      { name: '100_SPARREN',         color: 1  },  // rot
  nebentraeger: { name: '101_NEBENTRAEGER',     color: 1  },  // rot
  pfette_first: { name: '200_PFETTEN_FIRST',    color: 3  },  // grün
  pfette_mittel:{ name: '201_PFETTEN_MITTEL',   color: 3  },  // grün
  pfette_fuss:  { name: '202_PFETTEN_FUSS',     color: 3  },  // grün
  pfette:       { name: '201_PFETTEN_MITTEL',   color: 3  },  // grün (fallback)
  stuetze:      { name: '300_STUETZEN',         color: 5  },  // blau
  zwischensteher:{ name: '310_ZWISCHENSTEHER',  color: 5  },  // blau
  kehlbalken:   { name: '400_KEHLBALKEN',       color: 4  },  // cyan
  zange:        { name: '410_ZANGE',            color: 4  },  // cyan
  leimbinder:   { name: '500_LEIMBINDER',       color: 6  },  // magenta
  rahm:         { name: '510_KOPFBAND',         color: 6  },  // magenta
  deckenbalken: { name: '600_DECKENBALKEN',     color: 2  },  // gelb
  wand:         { name: '900_WAENDE',           color: 7  },  // weiß
  boden:        { name: '910_BODEN',            color: 8  },  // grau
  auswechslung: { name: '101_NEBENTRAEGER',     color: 1  },
  bemassung:    { name: 'BEMASSUNG',            color: 2  },
};

function getLayerForType(type: TimberMember['type'], name?: string): LayerDef {
  if (type === 'pfette' && name) {
    const n = name.toLowerCase();
    if (/first/i.test(n))       return SEMA_LAYERS.pfette_first;
    if (/mittel/i.test(n))      return SEMA_LAYERS.pfette_mittel;
    if (/fuss|fuß/i.test(n))    return SEMA_LAYERS.pfette_fuss;
  }
  return SEMA_LAYERS[type] ?? { name: 'HOLZ', color: 7 };
}

function getAllUsedLayers(members: TimberMember[]): LayerDef[] {
  const seen = new Map<string, LayerDef>();
  for (const m of members) {
    const lyr = getLayerForType(m.type, m.name);
    if (!seen.has(lyr.name)) seen.set(lyr.name, lyr);
  }
  // Always include wall + floor + dimension layers
  for (const key of ['wand', 'boden', 'bemassung']) {
    const lyr = SEMA_LAYERS[key];
    if (!seen.has(lyr.name)) seen.set(lyr.name, lyr);
  }
  return [...seen.values()];
}

// ─── DXF-Helfer ───────────────────────────────────────────────────────────────

function g(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

/** 3DFACE entity (ein Dreieck oder Viereck). Für Quader: 6 Faces à 4 Punkte. */
function face3d(
  pts: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]],
  layer: string,
  color: number,
): string {
  return (
    g(0, '3DFACE') +
    g(8, layer) +
    g(62, color) +
    g(10, pts[0][0].toFixed(4)) + g(20, pts[0][1].toFixed(4)) + g(30, pts[0][2].toFixed(4)) +
    g(11, pts[1][0].toFixed(4)) + g(21, pts[1][1].toFixed(4)) + g(31, pts[1][2].toFixed(4)) +
    g(12, pts[2][0].toFixed(4)) + g(22, pts[2][1].toFixed(4)) + g(32, pts[2][2].toFixed(4)) +
    g(13, pts[3][0].toFixed(4)) + g(23, pts[3][1].toFixed(4)) + g(33, pts[3][2].toFixed(4))
  );
}

type Pt3 = [number, number, number];

/**
 * 6 3DFACE-Entities für einen Quader.
 * Mittelpunkt `cx,cy,cz` + halbe Achsausdehnungen `hx,hy,hz`.
 * Rotation `rx,ry,rz` in Radiant (Euler XYZ — nur rz und rx genutzt wie in Roof3D).
 */
function boxFaces(
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  rx: number, ry: number, rz: number,
  layer: string,
  color: number,
): string {
  // 8 Eckpunkte im lokalen Raum (ohne Rotation)
  const local: Pt3[] = [
    [-sx, -sy, -sz], [+sx, -sy, -sz], [+sx, +sy, -sz], [-sx, +sy, -sz],
    [-sx, -sy, +sz], [+sx, -sy, +sz], [+sx, +sy, +sz], [-sx, +sy, +sz],
  ];

  // Rotation: zuerst X dann Z (wie THREE.js Euler 'XYZ' mit rz letzter)
  function rotate(p: Pt3): Pt3 {
    let [x, y, z] = p;
    // Rotate around X (rx)
    if (rx !== 0) {
      const cr = Math.cos(rx), sr = Math.sin(rx);
      const y2 = y * cr - z * sr;
      const z2 = y * sr + z * cr;
      y = y2; z = z2;
    }
    // Rotate around Z (rz)
    if (rz !== 0) {
      const cr = Math.cos(rz), sr = Math.sin(rz);
      const x2 = x * cr - y * sr;
      const y2 = x * sr + y * cr;
      x = x2; y = y2;
    }
    return [cx + x, cy + y, cz + z];
  }

  const w = local.map(rotate) as Pt3[];

  const faces: Array<[Pt3, Pt3, Pt3, Pt3]> = [
    [w[0], w[1], w[2], w[3]],  // bottom
    [w[4], w[5], w[6], w[7]],  // top
    [w[0], w[1], w[5], w[4]],  // front
    [w[2], w[3], w[7], w[6]],  // back
    [w[0], w[3], w[7], w[4]],  // left
    [w[1], w[2], w[6], w[5]],  // right
  ];

  return faces.map(f => face3d(f, layer, color)).join('');
}

// ─── Bemaßungslinie ───────────────────────────────────────────────────────────

function dimLine(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
): string {
  const lyr = SEMA_LAYERS.bemassung;
  // Linie
  let out = g(0, 'LINE') + g(8, lyr.name) + g(62, lyr.color) +
    g(10, x0.toFixed(4)) + g(20, y0.toFixed(4)) + g(30, z0.toFixed(4)) +
    g(11, x1.toFixed(4)) + g(21, y1.toFixed(4)) + g(31, z1.toFixed(4));
  return out;
}

// ─── Position-Computation (1:1 aus Roof3D.tsx buildPartBoxes) ─────────────────

interface BoxSpec {
  cx: number; cy: number; cz: number;
  sx: number; sy: number; sz: number;
  rx: number; ry: number; rz: number;
  layer: LayerDef;
}

function buildBoxSpecs(members: TimberMember[], geometry?: {
  length?: number; width?: number; ridgeHeight?: number; eavesHeight?: number;
  form?: string;
}): BoxSpec[] {
  const specs: BoxSpec[] = [];

  const length = Math.max(1, geometry?.length ?? 10);
  const width  = Math.max(1, geometry?.width ?? 8);
  const ridgeHeight = Math.max(1, geometry?.ridgeHeight ?? 6);
  const eavesHeight = Math.max(0.5, geometry?.eavesHeight ?? 4);
  const rise = Math.max(0.1, ridgeHeight - eavesHeight);
  const halfWidth = width / 2;
  const sparrenLen = Math.sqrt(halfWidth * halfWidth + rise * rise);
  const angle = Math.atan2(rise, halfWidth);
  const form = geometry?.form ?? 'satteldach';
  const isPultdach = form === 'pultdach';
  const isFlachdach = form === 'flachdach';
  const isWalm = form === 'walmdach' || form === 'krueppelwalmdach';

  const sparrenList   = members.filter(m => m.type === 'sparren' || m.type === 'nebentraeger');
  const firstPfetten  = members.filter(m => m.type === 'pfette' && /first/i.test(m.name));
  const mittelPfetten = members.filter(m => m.type === 'pfette' && /mittel/i.test(m.name));
  const fussPfetten   = members.filter(m => m.type === 'pfette' && /fuss|fuß/i.test(m.name));
  const otherPfetten  = members.filter(m => m.type === 'pfette' &&
    !firstPfetten.includes(m) && !mittelPfetten.includes(m) && !fussPfetten.includes(m));
  const stuetzenList  = members.filter(m => m.type === 'stuetze');
  const kehlbalkenList= members.filter(m => m.type === 'kehlbalken');
  const leimbinderList= members.filter(m => m.type === 'leimbinder');
  const kopfbandList  = members.filter(m => m.type === 'rahm');

  function push(m: TimberMember, cx: number, cy: number, cz: number,
                 sx: number, sy: number, sz: number,
                 rx = 0, ry = 0, rz = 0) {
    specs.push({ cx, cy, cz, sx, sy, sz, rx, ry, rz, layer: getLayerForType(m.type, m.name) });
  }

  // === Sparren ===
  for (const sm of sparrenList) {
    const qty = Math.max(1, sm.quantity);
    const b   = sm.width  / 1000 / 2;
    const h   = sm.height / 1000 / 2;
    const sLen = (sm.length || sparrenLen) / 2;
    if (isPultdach) {
      const spacing = length / qty;
      const pultAngle = Math.atan2(rise, width);
      const midY = eavesHeight + rise / 2;
      for (let i = 0; i < qty; i++) {
        const x = -length / 2 + (i + 0.5) * spacing;
        push(sm, x, midY, 0, b, h, Math.sqrt(width*width + rise*rise)/2, pultAngle, 0, 0);
      }
    } else if (isFlachdach) {
      const spacing = length / qty;
      for (let i = 0; i < qty; i++) {
        const x = -length / 2 + (i + 0.5) * spacing;
        push(sm, x, ridgeHeight, 0, b, h, width/2, 0.03, 0, 0);
      }
    } else if (isWalm) {
      const perLongSide = Math.ceil(qty * 0.7 / 2);
      const longSpacing = length / perLongSide;
      const midY = (eavesHeight + ridgeHeight) / 2;
      for (let i = 0; i < perLongSide; i++) {
        const x = -length / 2 + (i + 0.5) * longSpacing;
        for (const side of [-1, 1] as const) {
          push(sm, x, midY, side * halfWidth / 2, b, h, sLen, side * angle, 0, 0);
        }
      }
    } else {
      // Satteldach
      const perSide = Math.ceil(qty / 2);
      const spacing = length / perSide;
      const midY = (eavesHeight + ridgeHeight) / 2;
      for (let i = 0; i < perSide; i++) {
        const x = -length / 2 + (i + 0.5) * spacing;
        for (const side of [-1, 1] as const) {
          push(sm, x, midY, side * halfWidth / 2, b, h, sLen, side * angle, 0, 0);
        }
      }
    }
  }

  // === Firstpfette ===
  for (const fp of firstPfetten) {
    if (isPultdach || isFlachdach) continue;
    const ridgeLen = isWalm
      ? (form === 'krueppelwalmdach' ? length * 0.7 : Math.max(0.1, length - width))
      : length;
    push(fp, 0, ridgeHeight, 0, ridgeLen/2, fp.height/1000/2, fp.width/1000/2);
  }

  // === Mittelpfetten ===
  const midPfettenAll = mittelPfetten.length > 0 ? mittelPfetten : otherPfetten;
  const midY = (eavesHeight + ridgeHeight) / 2;
  midPfettenAll.forEach((mp, idx) => {
    const side = idx % 2 === 0 ? -1 : 1;
    push(mp, 0, midY, (side * halfWidth) / 2, length/2, mp.height/1000/2, mp.width/1000/2);
  });

  // === Fußpfetten ===
  fussPfetten.forEach((fp, idx) => {
    const side = idx % 2 === 0 ? -1 : 1;
    push(fp, 0, eavesHeight, side * halfWidth, length/2, fp.height/1000/2, fp.width/1000/2);
  });

  // === Stützen ===
  for (const st of stuetzenList) {
    const qty = Math.max(1, st.quantity);
    const stH = (st.length || (ridgeHeight - 0.5));
    const spacing = length / qty;
    for (let i = 0; i < qty; i++) {
      const x = -length / 2 + (i + 0.5) * spacing;
      const side = i % 2 === 0 ? -1 : 1;
      push(st, x, stH / 2, (side * halfWidth) / 2, st.width/1000/2, stH/2, st.height/1000/2);
    }
  }

  // === Kehlbalken ===
  for (const kb of kehlbalkenList) {
    const qty = Math.max(1, kb.quantity);
    const spacing = length / qty;
    const y = eavesHeight + rise * 0.6;
    for (let i = 0; i < qty; i++) {
      const x = -length / 2 + (i + 0.5) * spacing;
      push(kb, x, y, 0, kb.width/1000/2, kb.height/1000/2, width*0.6/2);
    }
  }

  // === Leimbinder ===
  for (const lb of leimbinderList) {
    const qty = Math.max(1, lb.quantity);
    const spacing = length / (qty + 1);
    const y = eavesHeight + rise / 2;
    for (let i = 0; i < qty; i++) {
      const x = -length / 2 + (i + 1) * spacing;
      push(lb, x, y, 0, lb.width/1000/2, lb.height/1000/2, width/2);
    }
  }

  // === Kopfband / rahm (45°) ===
  for (const kb of kopfbandList) {
    const qty = Math.max(1, kb.quantity);
    const stuetzenInRoof = stuetzenList.reduce((s, x) => s + x.quantity, 0) || 4;
    const spacing = length / Math.max(1, stuetzenInRoof);
    for (let i = 0; i < qty; i++) {
      const stIdx = Math.floor(i / 2);
      const sideX = i % 2 === 0 ? 1 : -1;
      const x = -length / 2 + (stIdx + 0.5) * spacing + sideX * 0.5;
      const y = ridgeHeight - 0.7;
      push(kb, x, y, 0, kb.width/1000/2, kb.height/1000/2, (kb.length || 1.5)/2, 0, 0, sideX * Math.PI / 4);
    }
  }

  return specs;
}

function buildWallSpecs(
  geometry?: { length?: number; width?: number; eavesHeight?: number },
): BoxSpec[] {
  const length = Math.max(1, geometry?.length ?? 10);
  const width  = Math.max(1, geometry?.width ?? 8);
  const eavesHeight = Math.max(0.5, geometry?.eavesHeight ?? 4);
  const wt = 0.25 / 2; // Wandstärke 25cm
  const wLyr = SEMA_LAYERS.wand;
  const bLyr = SEMA_LAYERS.boden;

  return [
    { cx: 0, cy: eavesHeight/2, cz: -width/2, sx: length/2, sy: eavesHeight/2, sz: wt, rx:0,ry:0,rz:0, layer: wLyr },
    { cx: 0, cy: eavesHeight/2, cz:  width/2, sx: length/2, sy: eavesHeight/2, sz: wt, rx:0,ry:0,rz:0, layer: wLyr },
    { cx: -length/2, cy: eavesHeight/2, cz: 0, sx: wt, sy: eavesHeight/2, sz: width/2, rx:0,ry:0,rz:0, layer: wLyr },
    { cx:  length/2, cy: eavesHeight/2, cz: 0, sx: wt, sy: eavesHeight/2, sz: width/2, rx:0,ry:0,rz:0, layer: wLyr },
    // Bodenplatte
    { cx: 0, cy: -0.05, cz: 0, sx: length/2, sy: 0.05, sz: width/2, rx:0,ry:0,rz:0, layer: bLyr },
  ];
}

// ─── TABLES-Sektion ───────────────────────────────────────────────────────────

function buildTablesSection(layers: LayerDef[]): string {
  const layerEntries = layers.map(lyr =>
    g(0, 'LAYER') +
    g(2, lyr.name) +
    g(70, 0) +
    g(62, lyr.color) +
    g(6, 'CONTINUOUS')
  ).join('');

  return (
    g(0, 'SECTION') +
    g(2, 'TABLES') +
    g(0, 'TABLE') +
    g(2, 'LAYER') +
    g(70, layers.length) +
    layerEntries +
    g(0, 'ENDTAB') +
    g(0, 'ENDSEC')
  );
}

// ─── HEADER-Sektion ───────────────────────────────────────────────────────────

function buildHeaderSection(projectName: string, length: number, width: number, ridgeH: number): string {
  return (
    g(0, 'SECTION') +
    g(2, 'HEADER') +
    g(9, '$ACADVER') +
    g(1, 'AC1009') +        // R12
    g(9, '$INSUNITS') +
    g(70, 6) +              // 6 = Meter
    g(9, '$EXTMIN') +
    g(10, (-length/2 - 1).toFixed(2)) +
    g(20, '-1.0') +
    g(30, (-width/2 - 1).toFixed(2)) +
    g(9, '$EXTMAX') +
    g(10, (length/2 + 1).toFixed(2)) +
    g(20, (ridgeH + 1).toFixed(2)) +
    g(30, (width/2 + 1).toFixed(2)) +
    g(9, '$PROJECTNAME') +
    g(1, projectName) +
    g(0, 'ENDSEC')
  );
}

// ─── Bemaßungslinien ──────────────────────────────────────────────────────────

function buildDimLines(
  length: number, width: number, ridgeHeight: number, eavesHeight: number,
): string {
  const offset = 1.0;
  let out = '';
  // Gebäudelänge (X-Richtung an Vorderkante)
  out += dimLine(-length/2, 0, -width/2 - offset, length/2, 0, -width/2 - offset);
  // Gebäudebreite (Z-Richtung)
  out += dimLine(length/2 + offset, 0, -width/2, length/2 + offset, 0, width/2);
  // Traufhöhe
  out += dimLine(-length/2 - offset, 0, -width/2, -length/2 - offset, eavesHeight, -width/2);
  // Firsthöhe
  out += dimLine(-length/2 - offset*2, 0, 0, -length/2 - offset*2, ridgeHeight, 0);
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Erzeugt DXF R12 ASCII-String mit 3D-Solid (3DFACE) Geometrie.
 * Wenn roofParts vorhanden, wird buildPartBoxes-Logik pro Part angewendet;
 * andernfalls einfache Positionierung aus project.geometry.
 */
export function exportToDXF(project: Project, members: TimberMember[]): string {
  const geo = project.geometry;
  const length = geo?.length?.value ?? 10;
  const width  = geo?.width?.value ?? 8;
  const ridgeHeight = geo?.ridgeHeight?.value ?? 6;
  const eavesHeight = geo?.eavesHeight?.value ?? 4;
  const roofForm = project.roofType?.form ?? 'satteldach';

  // Layer sammeln
  const usedLayers = getAllUsedLayers(members);
  const header  = buildHeaderSection(project.name, length, width, ridgeHeight);
  const tables  = buildTablesSection(usedLayers);

  // Member-Boxes via buildPartBoxes-Logik
  const geoOpts = { length, width, ridgeHeight, eavesHeight, form: roofForm };
  const memberSpecs = buildBoxSpecs(members, geoOpts);
  const wallSpecs   = buildWallSpecs({ length, width, eavesHeight });

  let entities = '';

  for (const s of [...wallSpecs, ...memberSpecs]) {
    entities += boxFaces(s.cx, s.cy, s.cz, s.sx, s.sy, s.sz, s.rx, s.ry, s.rz, s.layer.name, s.layer.color);
  }

  // Bemaßungslinien
  entities += buildDimLines(length, width, ridgeHeight, eavesHeight);

  const entitiesSection =
    g(0, 'SECTION') +
    g(2, 'ENTITIES') +
    entities +
    g(0, 'ENDSEC');

  return header + tables + entitiesSection + g(0, 'EOF');
}

/**
 * Startet Browser-Download der DXF-Datei.
 */
export function downloadDXF(project: Project, members: TimberMember[]): void {
  const content = exportToDXF(project, members);
  const blob = new Blob([content], { type: 'application/dxf;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${project.name.replace(/[^a-zA-Z0-9-]/g, '_')}_3D.dxf`;
  a.click();
  URL.revokeObjectURL(url);
}
