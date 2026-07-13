import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Text, Line } from '@react-three/drei';
import type { TimberMember } from '@/types/project';
import type { RoofPart } from '@/types/roofParts';
import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/help/InfoTooltip';
import { Boxes, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Roof3DProps {
  roofParts: RoofPart[];
  utilizations?: Record<string, number>;
}

// ─── OrbitControls inline via dynamic import (vermeidet drei-Suspense-Issues) ──
function SimpleControls({ target }: { target: [number, number, number] }) {
  const { camera, gl, invalidate } = useThree();
  const controlsRef = useRef<any>();

  useEffect(() => {
    let mounted = true;
    import('three/examples/jsm/controls/OrbitControls.js').then((mod) => {
      if (!mounted) return;
      const ctrl = new mod.OrbitControls(camera, gl.domElement);
      ctrl.target.set(target[0], target[1], target[2]);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.08;
      camera.lookAt(target[0], target[1], target[2]);
      ctrl.update();
      controlsRef.current = ctrl;
      invalidate();
    });
    return () => {
      mounted = false;
      controlsRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function utilizationColor(eta: number | undefined): string {
  if (eta == null) return '#a0846a';
  if (eta > 1) return '#dc2626';
  if (eta > 0.85) return '#f59e0b';
  return '#16a34a';
}

const COLORS = {
  wall: '#e8dcc4',
  floor: '#d0d4cf',
  roof: '#b05035',
  ridge: '#8b3f2b',
  deck: '#b5651d',
  dim: '#2b3744',
  dimText: '#1e293b',
} as const;

// ─── Visual Building Block ─────────────────────────────────────────────────────
interface BoxData {
  key: string;
  memberId: string;
  memberName: string;
  pos: [number, number, number];
  rot: [number, number, number];
  dims: [number, number, number];
  color: string;
  opacity?: number;
  transparent?: boolean;
  /** Zimmerer-Profil (Schnittkontur in der Quer/Höhen-Ebene) statt Box:
   *  Punkte [zQuer, yHöhe], extrudiert um profileDepth entlang der Firstrichtung. */
  profile?: [number, number][];
  profileDepth?: number;
}

/**
 * Sparren-Längsprofil mit den echten Zimmerer-Schnitten (in Weltkoordinaten
 * der Schnittebene: x = horizontal quer, y = Höhe — dadurch sind Waagschnitte
 * einfach y=konstant und Lotschnitte x=konstant, exakt wie am Bauholz):
 *  - lotrechter Firstschnitt (gegen Gegensparren/Firstpfette)
 *  - Kerve (Waagschnitt-Sohle + talseitiger Lotschnitt-Stoß) an jeder Pfette
 *  - Traufende: lotrechter Abschnitt + Zierschnitt (Fase) an der unteren Ecke
 *
 * zRidge = Querposition First, zEave = Querposition Sparrenende (inkl. Überstand),
 * yTopRidge = Oberkante Sparren am First, tan = Steigung, hV = vertikale Sparrendicke.
 * kerven: talseitige Stoßkanten [zStoss] (zwischen zRidge und zEave).
 */
function sparrenProfil(
  zRidge: number, zEave: number, yTopRidge: number, tan: number, hV: number,
  kerven: number[],
): [number, number][] {
  const dir = Math.sign(zEave - zRidge) || 1; // Seite (+1 / −1)
  const zr = Math.abs(zEave - zRidge);
  const yo = (dz: number) => yTopRidge - dz * tan;      // Oberkante, dz = |z − zRidge|
  const yu = (dz: number) => yo(dz) - hV;               // Unterkante
  const pts: [number, number][] = [];
  const P = (dz: number, y: number) => pts.push([zRidge + dir * dz, y]);

  // Oberkante: First → Traufe
  P(0, yo(0));
  P(zr, yo(zr));
  // Traufende: lotrecht runter + Zierschnitt-Fase an der unteren Ecke
  const fase = Math.min(0.12, hV * 0.45);
  P(zr, yu(zr) + fase);
  P(zr - fase, yu(zr - fase));
  // Unterkante zurück Richtung First, mit Kerven (talseitige zuerst)
  const t = Math.max(0.02, Math.min(hV / 4, 0.35 * tan + 0.01)); // Kerventiefe ≤ h/4
  const sorted = kerven
    .map(z => Math.abs(z - zRidge))
    .filter(dz => dz > t / Math.max(tan, 0.08) + 0.05 && dz < zr - fase - 0.05)
    .sort((a, b) => b - a);
  for (const dzStoss of sorted) {
    const sohleY = yu(dzStoss) + t;                     // Sohle waagrecht auf Pfetten-OK
    const dzAuslauf = dzStoss - t / Math.max(tan, 0.08); // wo Sohle die Unterkante trifft
    P(dzStoss, yu(dzStoss));   // Unterkante bis zum Stoß
    P(dzStoss, sohleY);        // Lotschnitt (Stoß, hakt talseitig gegen die Pfette)
    P(Math.max(dzAuslauf, 0.05), sohleY); // Waagschnitt (Auflager-Sohle)
  }
  // lotrechter Firstschnitt
  P(0, yu(0));
  return pts;
}

/** Rendert ein Bauteil mit Zimmerer-Schnittprofil (Kerven, First-/Zierschnitt) als Extrusionskörper. */
function ProfileMesh({ b, isSelected, onClick }: { b: BoxData; isSelected: boolean; onClick: () => void }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    b.profile!.forEach(([px, py], i) => (i === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py)));
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: b.profileDepth ?? 0.08, bevelEnabled: false });
  }, [b.profile, b.profileDepth]);
  return (
    <mesh geometry={geometry} position={b.pos} rotation={b.rot}
      onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <meshStandardMaterial
        color={b.color}
        emissive={isSelected ? new THREE.Color('#fff200') : new THREE.Color('#000000')}
        emissiveIntensity={isSelected ? 0.35 : 0}
      />
    </mesh>
  );
}

function buildPartBoxes(
  part: RoofPart,
  offsetX: number,
  offsetZ: number,
  utilizations: Record<string, number>,
): BoxData[] {
  const out: BoxData[] = [];
  const { geometry, members, form, id: partId } = part;
  const length = Math.max(1, geometry.length || 10);
  const width = Math.max(1, geometry.width || 8);
  const ridgeHeight = Math.max(1, geometry.ridgeHeight || 6);
  const eavesHeight = Math.max(0.5, geometry.eavesHeight || 4);
  const rise = Math.max(0.1, ridgeHeight - eavesHeight);
  const halfWidth = width / 2;
  const sparrenLen = Math.sqrt(halfWidth * halfWidth + rise * rise);
  const angle = Math.atan2(rise, halfWidth);
  const isPultdach = form === 'pultdach';
  const isFlachdach = form === 'flachdach';
  const isWalm = form === 'walmdach' || form === 'krueppelwalmdach';
  const isVordach = part.kind === 'vordach';
  const wallOpacity = isVordach ? 0.12 : 0.25;
  const wallColor = isVordach ? '#d0c4b0' : COLORS.wall;

  function add(b: BoxData) {
    out.push({ ...b, pos: [b.pos[0] + offsetX, b.pos[1], b.pos[2] + offsetZ] });
  }

  // === Wände (transparent) ===
  add({ key: `${partId}-wall-front`, memberId: '', memberName: 'Wand', color: wallColor,
        pos: [0, eavesHeight / 2, -width / 2], rot: [0, 0, 0],
        dims: [length, eavesHeight, 0.2], opacity: wallOpacity, transparent: true });
  add({ key: `${partId}-wall-back`, memberId: '', memberName: 'Wand', color: wallColor,
        pos: [0, eavesHeight / 2, width / 2], rot: [0, 0, 0],
        dims: [length, eavesHeight, 0.2], opacity: wallOpacity, transparent: true });
  add({ key: `${partId}-wall-left`, memberId: '', memberName: 'Wand', color: wallColor,
        pos: [-length / 2, eavesHeight / 2, 0], rot: [0, 0, 0],
        dims: [0.2, eavesHeight, width], opacity: wallOpacity, transparent: true });
  add({ key: `${partId}-wall-right`, memberId: '', memberName: 'Wand', color: wallColor,
        pos: [length / 2, eavesHeight / 2, 0], rot: [0, 0, 0],
        dims: [0.2, eavesHeight, width], opacity: wallOpacity, transparent: true });

  if (!members || members.length === 0) return out;

  // === Member-Gruppierung ===
  const sparrenList = members.filter(m => m.type === 'sparren' || m.type === 'nebentraeger');
  const firstPfetten = members.filter(m => m.type === 'pfette' && /first/i.test(m.name));
  const mittelPfetten = members.filter(m => m.type === 'pfette' && /mittel/i.test(m.name));
  const fussPfetten = members.filter(m => m.type === 'pfette' && /fuss|fuß/i.test(m.name));
  const otherPfetten = members.filter(m => m.type === 'pfette' &&
    !firstPfetten.includes(m) && !mittelPfetten.includes(m) && !fussPfetten.includes(m));
  const stuetzenList = members.filter(m => m.type === 'stuetze');
  const kehlbalkenList = members.filter(m => m.type === 'kehlbalken');
  const zangenList = members.filter(m => m.type === 'zange');
  const leimbinderList = members.filter(m => m.type === 'leimbinder');
  const kopfbandList = members.filter(m => m.type === 'rahm');

  // === Sparren - dachformabhängig ===
  for (const sm of sparrenList) {
    const qty = Math.max(1, sm.quantity);
    const b = sm.width / 1000;
    const h = sm.height / 1000;
    const sLen = sm.length || sparrenLen;
    const color = utilizationColor(utilizations[sm.id]);

    if (isPultdach) {
      // Pultdach: durchgehender Sparren mit Kerven auf beiden Mauerbänken +
      // ggf. Mittelpfette, Zierschnitt am tiefen Traufende.
      const spacing = length / qty;
      const pultTan = rise / width;
      const hV = h / Math.max(Math.cos(Math.atan2(rise, width)), 0.5);
      const kervenZ: number[] = [];
      if (fussPfetten.length > 0) { kervenZ.push(-(halfWidth - 0.09)); kervenZ.push(halfWidth - 0.09); }
      const midListPult = mittelPfetten.length > 0 ? mittelPfetten : otherPfetten;
      if (midListPult.length > 0) kervenZ.push(0.05);
      const profile = sparrenProfil(-halfWidth, halfWidth + 0.4, ridgeHeight, pultTan, hV, kervenZ);
      for (let i = 0; i < qty; i++) {
        const x = -length / 2 + (i + 0.5) * spacing;
        add({ key: `${partId}-spr-${sm.id}-${i}`, memberId: sm.id, memberName: sm.name,
              pos: [x + b / 2, 0, 0], rot: [0, -Math.PI / 2, 0],
              dims: [b, h, sLen], color, profile, profileDepth: b });
      }
    } else if (isFlachdach) {
      // Flachdach: durchgehender Sparren mit leichtem Gefälle, Kerven auf beiden
      // Mauerbänken, lotrechte Enden mit Zierschnitt.
      const spacing = length / qty;
      const flatTan = 0.03;
      const hVFlat = h;
      const kervenFlat: number[] = fussPfetten.length > 0 ? [-(halfWidth - 0.09), halfWidth - 0.09] : [];
      const profileFlat = sparrenProfil(-halfWidth - 0.3, halfWidth + 0.3, eavesHeight + hVFlat, flatTan, hVFlat, kervenFlat);
      for (let i = 0; i < qty; i++) {
        const x = -length / 2 + (i + 0.5) * spacing;
        add({ key: `${partId}-spr-${sm.id}-${i}`, memberId: sm.id, memberName: sm.name,
              pos: [x + b / 2, 0, 0], rot: [0, -Math.PI / 2, 0],
              dims: [b, h, width], color, profile: profileFlat, profileDepth: b });
      }
    } else if (isWalm) {
      // Walm: Längsseiten mit echtem Zimmerer-Profil (wie Satteldach), an den
      // Enden vereinfachte Schifter (Detail-Schifterschnitte: siehe Abbundliste).
      const perLongSide = Math.ceil(qty * 0.7 / 2);  // 70% auf Längsseiten
      const longSpacing = length / perLongSide;
      const midY = (eavesHeight + ridgeHeight) / 2;
      const hVW = h / Math.max(Math.cos(angle), 0.5);
      const kervenW: number[] = [];
      if (fussPfetten.length > 0) kervenW.push(halfWidth - 0.09);
      const midListW = mittelPfetten.length > 0 ? mittelPfetten : otherPfetten;
      if (midListW.length > 0) kervenW.push(halfWidth / 2 + ((midListW[0]?.width ?? 100) / 2000));
      for (let i = 0; i < perLongSide; i++) {
        const x = -length / 2 + (i + 0.5) * longSpacing;
        for (const side of [-1, 1] as const) {
          const profileW = sparrenProfil(0, side * (halfWidth + 0.25), ridgeHeight, rise / halfWidth, hVW, kervenW.map(z => side * z));
          add({ key: `${partId}-spr-${sm.id}-long-${i}-${side}`, memberId: sm.id, memberName: sm.name,
                pos: [x + b / 2, 0, 0], rot: [0, -Math.PI / 2, 0],
                dims: [b, h, sparrenLen], color, profile: profileW, profileDepth: b });
        }
      }
      // Walm-Schifter an den Giebelseiten: laufen quer (entlang X) von der
      // Giebel-Mauerbank zum Firstende — als echtes Profil mit Kerve + Zierschnitt.
      // Das Profil liegt hier in der (x,y)-Ebene, Extrusion entlang Z (rot = 0).
      const ridgeLen = form === 'krueppelwalmdach' ? length * 0.7 : Math.max(0.1, length - width);
      const walmDepth = Math.max(0.5, (length - ridgeLen) / 2);
      const tanWalm = rise / walmDepth;
      for (const endSide of [-1, 1] as const) {
        const xRidgeEnd = endSide * (ridgeLen / 2);
        const xEaveEnd = endSide * (length / 2 + 0.25);
        const kervenWalm = fussPfetten.length > 0 ? [endSide * (length / 2 - 0.09)] : [];
        const profileWalm = sparrenProfil(xRidgeEnd, xEaveEnd, ridgeHeight, tanWalm, hVW, kervenWalm);
        for (let i = 0; i < 3; i++) {
          const zk = ((i - 1) * width) / 5;
          add({ key: `${partId}-spr-${sm.id}-walm-${endSide}-${i}`,
                memberId: sm.id, memberName: sm.name,
                pos: [0, 0, zk - b / 2], rot: [0, 0, 0],
                dims: [b, h, sparrenLen * 0.7], color, profile: profileWalm, profileDepth: b });
        }
      }
    } else {
      // Satteldach: beide Seiten — echtes Zimmerer-Profil: lotrechter Firstschnitt,
      // Kerve auf Mauerbank + Mittelpfette, Zierschnitt am Sparrenende.
      const perSide = Math.ceil(qty / 2);
      const spacing = length / perSide;
      const hV = h / Math.max(Math.cos(angle), 0.5);
      const overhangH = Math.max(0.25, ((sLen || sparrenLen) - sparrenLen) * Math.cos(angle));
      const kervenZ: number[] = [];
      if (fussPfetten.length > 0) kervenZ.push(halfWidth - 0.09);
      const midListS = mittelPfetten.length > 0 ? mittelPfetten : otherPfetten;
      if (midListS.length > 0) kervenZ.push(halfWidth / 2 + ((midListS[0]?.width ?? 100) / 2000));
      for (let i = 0; i < perSide; i++) {
        const x = -length / 2 + (i + 0.5) * spacing;
        for (const side of [-1, 1] as const) {
          const profile = sparrenProfil(0, side * (halfWidth + overhangH), ridgeHeight, rise / halfWidth, hV, kervenZ.map(z => side * z));
          add({ key: `${partId}-spr-${sm.id}-${i}-${side}`, memberId: sm.id, memberName: sm.name,
                pos: [x + b / 2, 0, 0], rot: [0, -Math.PI / 2, 0],
                dims: [b, h, sLen || sparrenLen], color, profile, profileDepth: b });
        }
      }
    }
  }

  // ZIMMERER-GEOMETRIE: Pfetten liegen UNTER der Sparrenlage (Sparren ruhen auf
  // ihnen), niemals außen auf den Sparren. Abstand Sparrenachse → Unterkante
  // entlang der Vertikalen: (h_Sparren/2) / cos(α).
  const sparH = (sparrenList[0]?.height ?? 160) / 1000;
  const cosA = Math.max(Math.cos(angle), 0.5);
  const underRafter = (sparH / 2) / cosA;
  const midY = (eavesHeight + ridgeHeight) / 2;

  // === Firstpfette — stehend, direkt unter dem First (Sparren lagern auf ihr) ===
  let firstPfettenY: number | null = null;
  for (const fp of firstPfetten) {
    if (isPultdach || isFlachdach) continue; // keine Firstpfette
    const ridgeLen = isWalm
      ? (form === 'krueppelwalmdach' ? length * 0.7 : Math.max(0.1, length - width))
      : length;
    const fpH = fp.height / 1000;
    const y = ridgeHeight - underRafter - fpH / 2;
    firstPfettenY = y;
    add({ key: `${partId}-fp-${fp.id}`, memberId: fp.id, memberName: fp.name,
          pos: [0, y, 0], rot: [0, 0, 0],
          dims: [ridgeLen, fpH, fp.width / 1000],
          color: utilizationColor(utilizations[fp.id]) });
  }

  // === Mittelpfetten — unter der Sparrenlage auf halber Dachhöhe ===
  const midPfetten = mittelPfetten.length > 0 ? mittelPfetten : otherPfetten;
  let midPfettenY: number | null = null;
  midPfetten.forEach((mp, idx) => {
    const mpH = mp.height / 1000;
    const side = idx % 2 === 0 ? -1 : 1;
    // Pultdach/Flachdach: Pfette mittig unter dem durchgehenden Sparren
    const z = (isPultdach || isFlachdach) ? 0 : (side * halfWidth) / 2;
    const yAxis = isFlachdach ? eavesHeight : (isPultdach ? eavesHeight + rise / 2 : midY);
    const y = yAxis - underRafter - mpH / 2;
    midPfettenY = y;
    add({ key: `${partId}-mp-${mp.id}`, memberId: mp.id, memberName: mp.name,
          pos: [0, y, z], rot: [0, 0, 0],
          dims: [length, mpH, mp.width / 1000],
          color: utilizationColor(utilizations[mp.id]) });
  });

  // === Fußpfetten / Mauerbank — AUF der Mauerkrone (innenbündig), nicht in der Wand ===
  fussPfetten.forEach((fp, idx) => {
    const side = idx % 2 === 0 ? -1 : 1;
    const fpH = fp.height / 1000;
    add({ key: `${partId}-fusp-${fp.id}`, memberId: fp.id, memberName: fp.name,
          pos: [0, eavesHeight + fpH / 2, side * (halfWidth - 0.15)], rot: [0, 0, 0],
          dims: [length, fpH, fp.width / 1000],
          color: utilizationColor(utilizations[fp.id]) });
  });

  // === Stützen (Steher) — direkt UNTER der zugehörigen Pfette, Kopf an deren Unterkante ===
  for (const st of stuetzenList) {
    const qty = Math.max(1, st.quantity);
    const stH = st.length || (ridgeHeight - 0.5);
    const spacing = length / (qty + 1);
    const color = utilizationColor(utilizations[st.id]);
    const isFirstSteher = /first/i.test(st.name) || midPfetten.length === 0;
    for (let i = 0; i < qty; i++) {
      const x = -length / 2 + (i + 1) * spacing;
      const pfettenY = isFirstSteher ? firstPfettenY : midPfettenY;
      const pfettenZ = isFirstSteher ? 0 : ((i % 2 === 0 ? -1 : 1) * halfWidth) / 2;
      const pfH = ((isFirstSteher ? firstPfetten[0] : midPfetten[0])?.height ?? 220) / 1000;
      const topY = (pfettenY ?? (ridgeHeight - underRafter)) - pfH / 2;
      add({ key: `${partId}-st-${st.id}-${i}`, memberId: st.id, memberName: st.name,
            pos: [x, topY - stH / 2, pfettenZ], rot: [0, 0, 0],
            dims: [st.width / 1000, stH, st.height / 1000], color });
    }
  }

  // === Kaltdach-Aufbau über den Sparren: Vollschalung + Abdichtung + Konterlattung + Lattung ===
  // Als halbtransparente Schicht dargestellt, damit die Tragkonstruktion sichtbar bleibt.
  if (sparrenList.length > 0 && !isWalm) {
    const deckName = 'Dachaufbau (Kaltdach): Vollschalung 2,4 cm + Abdichtung + Konterlattung 5/8 + Lattung 3/5';
    const deckThick = 0.11; // 2,4 Schalung + 5 Konterlatte + 3 Lattung ≈ 11 cm
    const liftUp = (sparH / 2 + deckThick / 2) / cosA;
    if (isPultdach) {
      add({ key: `${partId}-deck`, memberId: '', memberName: deckName, color: COLORS.deck ?? '#b5651d',
            pos: [0, eavesHeight + rise / 2 + liftUp, 0], rot: [Math.atan2(rise, width), 0, 0],
            dims: [length, deckThick, Math.sqrt(width * width + rise * rise)], opacity: 0.45, transparent: true });
    } else if (isFlachdach) {
      add({ key: `${partId}-deck`, memberId: '', memberName: deckName, color: COLORS.deck ?? '#b5651d',
            pos: [0, eavesHeight + sparH / 2 + deckThick / 2, 0], rot: [0.03, 0, 0],
            dims: [length, deckThick, width], opacity: 0.45, transparent: true });
    } else {
      for (const side of [-1, 1] as const) {
        add({ key: `${partId}-deck-${side}`, memberId: '', memberName: deckName, color: COLORS.deck ?? '#b5651d',
              pos: [0, midY + liftUp, side * halfWidth / 2], rot: [side * angle, 0, 0],
              dims: [length, deckThick, sparrenLen], opacity: 0.45, transparent: true });
      }
    }
  }

  // === Zangen: paarweise beidseitig der Sparren, waagrecht ===
  // Sparrendach: auf Deckenniveau (knapp über der Traufe). Pfettendach mit
  // Mittelpfette: auf Mittelpfettenhöhe — sie klemmen Sparren + Pfette.
  for (const zg of zangenList) {
    const paare = Math.max(1, Math.floor(zg.quantity / 2));
    const zgSpacing = length / paare;
    const zgY = midPfetten.length > 0
      ? (midPfettenY ?? midY) + 0.02
      : eavesHeight + 0.15;
    const zgB = zg.width / 1000, zgH = zg.height / 1000;
    const sparB = (sparrenList[0]?.width ?? 80) / 1000;
    const color = utilizationColor(utilizations[zg.id]);
    for (let i = 0; i < paare; i++) {
      const x = -length / 2 + (i + 0.5) * zgSpacing;
      for (const zside of [-1, 1] as const) {
        add({ key: `${partId}-zg-${zg.id}-${i}-${zside}`, memberId: zg.id, memberName: zg.name,
              pos: [x + zside * (sparB / 2 + zgB / 2 + 0.005), zgY, 0], rot: [0, 0, 0],
              dims: [zgB, zgH, zg.length || width * 0.55], color });
      }
    }
  }

  // === Kehlbalken ===
  for (const kb of kehlbalkenList) {
    const qty = Math.max(1, kb.quantity);
    const spacing = length / qty;
    const y = eavesHeight + rise * 0.6;
    const color = utilizationColor(utilizations[kb.id]);
    for (let i = 0; i < qty; i++) {
      const x = -length / 2 + (i + 0.5) * spacing;
      add({ key: `${partId}-kb-${kb.id}-${i}`, memberId: kb.id, memberName: kb.name,
            pos: [x, y, 0], rot: [0, 0, 0],
            dims: [kb.width / 1000, kb.height / 1000, width * 0.6], color });
    }
  }

  // === Leimbinder (BSH-Hauptträger quer zur Längsachse) ===
  for (const lb of leimbinderList) {
    const qty = Math.max(1, lb.quantity);
    const spacing = length / (qty + 1);
    const y = eavesHeight + rise / 2;
    const color = utilizationColor(utilizations[lb.id]);
    for (let i = 0; i < qty; i++) {
      const x = -length / 2 + (i + 1) * spacing;
      add({ key: `${partId}-lb-${lb.id}-${i}`, memberId: lb.id, memberName: lb.name,
            pos: [x, y, 0], rot: [0, 0, 0],
            dims: [lb.width / 1000, lb.height / 1000, width], color });
    }
  }

  // === Kopfband (Knaggen, 45° zwischen Stütze und Träger) ===
  for (const kb of kopfbandList) {
    const qty = Math.max(1, kb.quantity);
    const color = utilizationColor(utilizations[kb.id]);
    const stuetzenInRoof = stuetzenList.reduce((s, x) => s + x.quantity, 0) || 4;
    const spacing = length / Math.max(1, stuetzenInRoof);
    for (let i = 0; i < qty; i++) {
      const stIdx = Math.floor(i / 2);
      const sideX = i % 2 === 0 ? 1 : -1;
      const x = -length / 2 + (stIdx + 0.5) * spacing;
      const y = ridgeHeight - 0.7;
      add({ key: `${partId}-kfb-${kb.id}-${i}`, memberId: kb.id, memberName: kb.name,
            pos: [x + sideX * 0.5, y, 0], rot: [0, 0, sideX * Math.PI / 4],
            dims: [kb.width / 1000, kb.height / 1000, kb.length || 1.5], color });
    }
  }

  return out;
}

// ─── Roof-Plane Components ────────────────────────────────────────────────────
function RoofPlanes({ part, offsetX, offsetZ }: { part: RoofPart; offsetX: number; offsetZ: number }) {
  const { geometry, form } = part;
  const length = Math.max(1, geometry.length || 10);
  const width = Math.max(1, geometry.width || 8);
  const ridgeHeight = Math.max(1, geometry.ridgeHeight || 6);
  const eavesHeight = Math.max(0.5, geometry.eavesHeight || 4);
  const rise = Math.max(0.1, ridgeHeight - eavesHeight);
  const halfWidth = width / 2;
  const sparrenLen = Math.sqrt(halfWidth * halfWidth + rise * rise);
  const angle = Math.atan2(rise, halfWidth);

  const planeProps = {
    color: COLORS.roof,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
  };

  if (form === 'flachdach') {
    // Vordach / Flachdach: horizontal, auf Traufhöhe
    const flatY = eavesHeight; // für flachdach gilt eavesHeight = ridgeHeight
    const isVordach = part.kind === 'vordach';
    return (
      <mesh position={[offsetX, flatY, offsetZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length, width]} />
        <meshStandardMaterial
          color={isVordach ? '#c09070' : COLORS.roof}
          transparent
          opacity={isVordach ? 0.30 : 0.22}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }

  if (form === 'pultdach') {
    // Pultdach: eine schräge Fläche, von eaves (Z=+width/2) zu ridge (Z=-width/2)
    // Plane-Mittelpunkt: Y = eavesHeight + rise/2, Z = 0 (Mitte der Breite)
    const pultAngle = Math.atan2(rise, width);
    const hyp = Math.sqrt(width * width + rise * rise);
    return (
      <mesh
        position={[offsetX, eavesHeight + rise / 2, offsetZ]}
        rotation={[pultAngle, 0, 0]}
      >
        <planeGeometry args={[length, hyp]} />
        <meshStandardMaterial {...planeProps} />
      </mesh>
    );
  }

  if (form === 'walmdach' || form === 'krueppelwalmdach') {
    const ridgeLen = form === 'krueppelwalmdach' ? length * 0.7 : Math.max(0.1, length - width);
    const walmRun = (length - ridgeLen) / 2;
    return (
      <group position={[offsetX, 0, offsetZ]}>
        {/* 2 große Trapeze (Längsseiten) */}
        {([-1, 1] as const).map(side => (
          <mesh
            key={side}
            position={[0, (eavesHeight + ridgeHeight) / 2, side * halfWidth / 2]}
            rotation={[side * angle, 0, 0]}
          >
            <planeGeometry args={[length, sparrenLen]} />
            <meshStandardMaterial {...planeProps} />
          </mesh>
        ))}
        {/* 2 Walmflächen an Giebelenden */}
        {([-1, 1] as const).map(end => (
          <mesh
            key={`walm-${end}`}
            position={[end * (length / 2 - walmRun / 2), (eavesHeight + ridgeHeight) / 2, 0]}
            rotation={[0, end * Math.PI / 2, Math.atan2(rise, halfWidth)]}
          >
            <planeGeometry args={[width, walmRun * 1.4]} />
            <meshStandardMaterial {...planeProps} opacity={0.18} />
          </mesh>
        ))}
      </group>
    );
  }

  // satteldach (default)
  return (
    <group position={[offsetX, 0, offsetZ]}>
      {([-1, 1] as const).map(side => (
        <mesh
          key={side}
          position={[0, (eavesHeight + ridgeHeight) / 2, side * halfWidth / 2]}
          rotation={[side * angle, 0, 0]}
        >
          <planeGeometry args={[length, sparrenLen]} />
          <meshStandardMaterial {...planeProps} />
        </mesh>
      ))}
    </group>
  );
}

// ─── 3D-Bemaßung (Linie + Pfeile + Text) ──────────────────────────────────────
function Dimension({ from, to, label, offsetY = 0, color = COLORS.dim }: {
  from: [number, number, number];
  to: [number, number, number];
  label: string;
  offsetY?: number;
  color?: string;
}) {
  const midX = (from[0] + to[0]) / 2;
  const midY = (from[1] + to[1]) / 2 + offsetY;
  const midZ = (from[2] + to[2]) / 2;

  return (
    <group>
      <Line points={[from, to]} color={color} lineWidth={1.5} />
      {/* Pfeil-Enden als kleine Kugeln */}
      <mesh position={from}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={to}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Text
        position={[midX, midY + 0.4, midZ]}
        fontSize={0.5}
        color={COLORS.dimText}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#ffffff"
      >
        {label}
      </Text>
    </group>
  );
}

function BuildingDimensions({ part, offsetX, offsetZ }: { part: RoofPart; offsetX: number; offsetZ: number }) {
  const length = part.geometry.length || 10;
  const width = part.geometry.width || 8;
  const ridgeHeight = part.geometry.ridgeHeight || 6;
  const eavesHeight = part.geometry.eavesHeight || 4;
  const pitch = part.geometry.pitch || 30;

  const dimOffset = 1.5; // wie weit die Bemaßung außerhalb des Gebäudes
  return (
    <group position={[offsetX, 0, offsetZ]}>
      {/* Gebäudelänge (entlang X, vor dem Gebäude) */}
      <Dimension
        from={[-length / 2, -0.05, -width / 2 - dimOffset]}
        to={[length / 2, -0.05, -width / 2 - dimOffset]}
        label={`${length.toFixed(2)} m`}
      />
      {/* Gebäudebreite (entlang Z, links vom Gebäude) */}
      <Dimension
        from={[-length / 2 - dimOffset, -0.05, -width / 2]}
        to={[-length / 2 - dimOffset, -0.05, width / 2]}
        label={`${width.toFixed(2)} m`}
      />
      {/* Firsthöhe (vertikal, rechts vorne) */}
      <Dimension
        from={[length / 2 + dimOffset, 0, -width / 2]}
        to={[length / 2 + dimOffset, ridgeHeight, -width / 2]}
        label={`First ${ridgeHeight.toFixed(2)} m`}
      />
      {/* Traufhöhe (vertikal, links vorne) */}
      <Dimension
        from={[-length / 2 - dimOffset, 0, -width / 2]}
        to={[-length / 2 - dimOffset, eavesHeight, -width / 2]}
        label={`Traufe ${eavesHeight.toFixed(2)} m`}
      />
      {/* Neigungswinkel Text */}
      <Text
        position={[length / 2 + 0.5, (eavesHeight + ridgeHeight) / 2, width / 4]}
        fontSize={0.5}
        color={COLORS.dimText}
        anchorX="left"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#ffffff"
      >
        {`α = ${pitch.toFixed(0)}°`}
      </Text>
      {/* Label der Bauwerks-Bezeichnung über dem Dach */}
      <Text
        position={[0, ridgeHeight + 0.8, 0]}
        fontSize={0.6}
        color="#0f172a"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.06}
        outlineColor="#ffffff"
      >
        {part.label}
      </Text>
    </group>
  );
}

// ─── Scene ───────────────────────────────────────────────────────────────────
interface SceneProps {
  roofParts: RoofPart[];
  utilizations: Record<string, number>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showDimensions: boolean;
}

/**
 * Auto-Layout: wenn alle Dachteile auf derselben Position liegen (KI liefert oft
 * positionX/Y = 0), würden sie sich im 3D überlappen. Dann ordnen wir sie als
 * zusammenhängende Reihe entlang der Z-Achse an (Hauptdach mittig, Anbauten/Vordächer
 * seitlich angesetzt) — so ist die GESAMTE Konstruktion sichtbar und nichts überdeckt.
 */
function layoutRoofParts(parts: RoofPart[]): RoofPart[] {
  if (!parts || parts.length <= 1) return parts;
  const first = parts[0];
  const allSamePos = parts.every(
    p => (p.positionX || 0) === (first.positionX || 0) && (p.positionY || 0) === (first.positionY || 0),
  );
  if (!allSamePos) return parts; // KI/Heuristik hat echte Positionen → respektieren

  const sorted = [...parts].sort((a, b) => (a.kind === 'main' ? -1 : 0) - (b.kind === 'main' ? -1 : 0));
  const out: RoofPart[] = [];
  let edge = 0; // aktueller Rand entlang +Z
  sorted.forEach((p, i) => {
    const w = p.geometry.width || 8;
    if (i === 0) { out.push({ ...p, positionX: 0, positionY: 0 }); edge = w / 2; }
    else { out.push({ ...p, positionX: 0, positionY: edge + w / 2 }); edge += w; }
  });
  return out;
}

function Scene({ roofParts: rawParts, utilizations, selectedId, onSelect, showDimensions }: SceneProps) {
  const roofParts = useMemo(() => layoutRoofParts(rawParts), [rawParts]);
  const boxes = useMemo(
    () => roofParts.flatMap(p => buildPartBoxes(p, p.positionX || 0, p.positionY || 0, utilizations)),
    [roofParts, utilizations],
  );

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[20, 30, 20]} intensity={0.7} />
      <directionalLight position={[-20, 15, -10]} intensity={0.3} />
      <hemisphereLight args={[0xffffff, 0x664433, 0.4]} />

      {/* Boden */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color={COLORS.floor} />
      </mesh>

      {/* Dachflächen pro RoofPart */}
      {roofParts.map(part => (
        <RoofPlanes
          key={`planes-${part.id}`}
          part={part}
          offsetX={part.positionX || 0}
          offsetZ={part.positionY || 0}
        />
      ))}

      {/* Bauteile */}
      {boxes.map(b => {
        const isWall = !b.memberId;
        const isSelected = b.memberId && b.memberId === selectedId;
        if (b.profile) {
          return (
            <ProfileMesh key={b.key} b={b} isSelected={!!isSelected}
              onClick={() => { if (b.memberId) onSelect(selectedId === b.memberId ? null : b.memberId); }} />
          );
        }
        return (
          <mesh
            key={b.key}
            position={b.pos}
            rotation={b.rot}
            onClick={(e) => {
              e.stopPropagation();
              if (b.memberId) onSelect(selectedId === b.memberId ? null : b.memberId);
            }}
          >
            <boxGeometry args={b.dims} />
            <meshStandardMaterial
              color={b.color}
              transparent={b.transparent ?? isWall}
              opacity={b.opacity ?? (isWall ? 0.25 : 1)}
              emissive={isSelected ? new THREE.Color('#fff200') : new THREE.Color('#000000')}
              emissiveIntensity={isSelected ? 0.35 : 0}
            />
          </mesh>
        );
      })}

      {/* Bemaßungen pro RoofPart */}
      {showDimensions && roofParts.map(part => (
        <BuildingDimensions
          key={`dim-${part.id}`}
          part={part}
          offsetX={part.positionX || 0}
          offsetZ={part.positionY || 0}
        />
      ))}
    </>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ roofParts, selectedId, utilizations }: {
  roofParts: RoofPart[]; selectedId: string | null; utilizations: Record<string, number>;
}) {
  const allMembers = roofParts.flatMap(p => p.members);
  const selectedMember: TimberMember | undefined = selectedId
    ? allMembers.find(m => m.id === selectedId)
    : undefined;
  const selectedEta = selectedId ? utilizations[selectedId] : undefined;

  if (selectedMember) {
    const partOfMember = roofParts.find(p => p.members.some(m => m.id === selectedMember.id));
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Ausgewähltes Bauteil</div>
        <div className="font-semibold text-sm">{selectedMember.name}</div>
        {partOfMember && (
          <div className="text-[11px] text-muted-foreground">aus: {partOfMember.label}</div>
        )}
        <div className="text-xs space-y-0.5 font-mono">
          <div>Typ: {selectedMember.type}</div>
          <div>Material: {selectedMember.material}</div>
          <div>b/h: {selectedMember.width}/{selectedMember.height} mm</div>
          <div>Länge: {selectedMember.length} m</div>
          <div>Stückzahl: {selectedMember.quantity}</div>
          <div>Vol.: {((selectedMember.width/1000)*(selectedMember.height/1000)*selectedMember.length*selectedMember.quantity).toFixed(3)} m³</div>
        </div>
        {selectedEta !== undefined && (
          <div className="rounded border p-2 text-xs">
            <div className="font-medium mb-1">Ausnutzung η = {(selectedEta * 100).toFixed(0)} %</div>
            <div className={selectedEta > 1 ? 'text-red-600' : selectedEta > 0.85 ? 'text-amber-600' : 'text-emerald-600'}>
              {selectedEta > 1 ? '🔴 Versagt' : selectedEta > 0.85 ? '🟡 Knapp' : '🟢 OK'}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground space-y-3">
      <p>Klicke auf ein Bauteil, um Details zu sehen.</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-emerald-600" /> η ≤ 85 % – OK</div>
        <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-amber-500" /> 85–100 % – knapp</div>
        <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-red-600" /> &gt; 100 % – versagt</div>
      </div>
      <div className="pt-2 space-y-2 text-[11px]">
        <div className="font-semibold">Bauwerk</div>
        {roofParts.map(p => (
          <div key={p.id} className="pl-2 border-l-2 border-muted">
            <div className="font-medium">{p.label}</div>
            <div className="font-mono">{p.geometry.length}m × {p.geometry.width}m, {p.form}</div>
            <div className="font-mono">First {p.geometry.ridgeHeight}m / Traufe {p.geometry.eavesHeight}m, α={p.geometry.pitch}°</div>
            <div className="font-mono">{p.members.length} Bauteiltypen, {p.members.reduce((s, m) => s + (m.quantity || 1), 0)} Einzelteile</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Roof3D({ roofParts: rawRoofParts, utilizations = {} }: Roof3DProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDimensions, setShowDimensions] = useState(true);

  // GESAMTE Konstruktion: Dachteile nicht-überlappend anordnen (siehe layoutRoofParts).
  const roofParts = useMemo(() => layoutRoofParts(rawRoofParts), [rawRoofParts]);

  // Camera: compute bounding box across all parts for correct framing
  const allMinX = Math.min(...roofParts.map(p => (p.positionX || 0) - (p.geometry.length || 10) / 2));
  const allMaxX = Math.max(...roofParts.map(p => (p.positionX || 0) + (p.geometry.length || 10) / 2));
  const allMinZ = Math.min(...roofParts.map(p => (p.positionY || 0) - (p.geometry.width || 8) / 2));
  const allMaxZ = Math.max(...roofParts.map(p => (p.positionY || 0) + (p.geometry.width || 8) / 2));
  const totalSpanX = Math.max(1, allMaxX - allMinX);
  const totalSpanZ = Math.max(1, allMaxZ - allMinZ);
  const centerX = (allMinX + allMaxX) / 2;
  const centerZ = (allMinZ + allMaxZ) / 2;
  const maxH = roofParts.reduce((a, p) => Math.max(a, p.geometry.ridgeHeight || 6), 6);
  const dist = Math.max(totalSpanX, totalSpanZ) * 1.8;
  const camTarget: [number, number, number] = [centerX, maxH / 2, centerZ];
  const camPos: [number, number, number] = [centerX + dist, Math.max(maxH * 1.6, dist * 0.6), centerZ + dist * 0.85];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Boxes className="h-4 w-4 text-primary" />
          3D-Tragwerk
          <InfoTooltip title="3D-Tragwerk">
            <p>Maus: <b>links</b> drehen, <b>rechts</b> verschieben, <b>Scroll</b> zoomen. Klick auf Bauteil zeigt Details. Vereinfachte Darstellung ohne Abbund-Details.</p>
          </InfoTooltip>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowDimensions(s => !s)} className="h-7 text-xs">
            Bemaßung {showDimensions ? 'aus' : 'an'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="h-7 gap-1">
            <RotateCcw className="h-3 w-3" /> Auswahl zurücksetzen
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]" style={{ height: 620 }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#e8f0f5' }}>
          <Canvas
            frameloop="always"
            camera={{ fov: 45, near: 0.1, far: dist * 10, position: camPos }}
            gl={{ antialias: true, alpha: false }}
            onCreated={({ gl }) => { gl.setClearColor('#e8f0f5'); }}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          >
            <Scene
              roofParts={roofParts}
              utilizations={utilizations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              showDimensions={showDimensions}
            />
            <SimpleControls target={camTarget} />
          </Canvas>
        </div>
        <div className="border-l p-3 bg-card overflow-y-auto" style={{ maxHeight: 620 }}>
          <Sidebar roofParts={roofParts} selectedId={selectedId} utilizations={utilizations} />
        </div>
      </div>
    </Card>
  );
}

export default Roof3D;
