import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useState, useRef, useEffect } from 'react';
import * as THREE from 'three';

// Inline simple orbit controls using Three's built-in OrbitControls without drei
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
      // Reposition camera to look at target after controls init
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
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return null;
}
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

function utilizationColor(eta: number | undefined): string {
  if (eta == null) return '#a0846a';
  if (eta > 1) return '#dc2626';
  if (eta > 0.85) return '#f59e0b';
  return '#16a34a';
}

interface BoxData {
  key: string;
  memberId: string;
  memberName: string;
  pos: [number, number, number];
  rot: [number, number, number];
  dims: [number, number, number];
  color: string;
}

function buildPartBoxes(
  part: RoofPart,
  offsetX: number,
  offsetZ: number,
  utilizations: Record<string, number>,
): BoxData[] {
  const out: BoxData[] = [];
  const { geometry, members, form, id: partId } = part;
  const length = geometry.length || 10;
  const width = geometry.width || 8;
  const ridgeHeight = geometry.ridgeHeight || 6;
  const eavesHeight = geometry.eavesHeight || 4;
  const rise = Math.max(0.1, ridgeHeight - eavesHeight);
  const halfWidth = width / 2;
  const sparrenLen = Math.sqrt(halfWidth * halfWidth + rise * rise);
  const angle = Math.atan2(rise, halfWidth);
  const isPultdach = form === 'pultdach';

  function add(b: BoxData) {
    out.push({ ...b, pos: [b.pos[0] + offsetX, b.pos[1], b.pos[2] + offsetZ] });
  }

  // === Wände ===
  const wallColor = '#e8dcc4';
  add({ key: `${partId}-wall-front`, memberId: '', memberName: 'Wand', color: wallColor,
        pos: [0, eavesHeight / 2, -width / 2], rot: [0, 0, 0], dims: [length, eavesHeight, 0.2] });
  add({ key: `${partId}-wall-back`, memberId: '', memberName: 'Wand', color: wallColor,
        pos: [0, eavesHeight / 2, width / 2], rot: [0, 0, 0], dims: [length, eavesHeight, 0.2] });
  add({ key: `${partId}-wall-left`, memberId: '', memberName: 'Wand', color: wallColor,
        pos: [-length / 2, eavesHeight / 2, 0], rot: [0, 0, 0], dims: [0.2, eavesHeight, width] });
  add({ key: `${partId}-wall-right`, memberId: '', memberName: 'Wand', color: wallColor,
        pos: [length / 2, eavesHeight / 2, 0], rot: [0, 0, 0], dims: [0.2, eavesHeight, width] });

  if (!members || members.length === 0) {
    // Fallback: skizziere generisch
    return out;
  }

  // === Group members ===
  const sparrenList = members.filter(m => m.type === 'sparren' || m.type === 'nebentraeger');
  const firstPfetten = members.filter(m => m.type === 'pfette' && /first/i.test(m.name));
  const mittelPfetten = members.filter(m => m.type === 'pfette' && /mittel/i.test(m.name));
  const fussPfetten = members.filter(m => m.type === 'pfette' && /fuss|fuß/i.test(m.name));
  const otherPfetten = members.filter(m => m.type === 'pfette' &&
    !firstPfetten.includes(m) && !mittelPfetten.includes(m) && !fussPfetten.includes(m));
  const stuetzenList = members.filter(m => m.type === 'stuetze');
  const kehlbalkenList = members.filter(m => m.type === 'kehlbalken');
  const leimbinderList = members.filter(m => m.type === 'leimbinder');

  // === Sparren ===
  for (const sm of sparrenList) {
    const qty = Math.max(1, sm.quantity);
    const b = sm.width / 1000;
    const h = sm.height / 1000;
    const sLen = sm.length || sparrenLen;
    const color = utilizationColor(utilizations[sm.id]);
    if (isPultdach) {
      const spacing = length / qty;
      const pultAngle = Math.atan2(rise, width);
      const midY = eavesHeight + rise / 2;
      for (let i = 0; i < qty; i++) {
        const x = -length / 2 + (i + 0.5) * spacing;
        add({ key: `${partId}-spr-${sm.id}-${i}`, memberId: sm.id, memberName: sm.name,
              pos: [x, midY, 0], rot: [pultAngle, 0, 0], dims: [b, h, sLen], color });
      }
    } else {
      const perSide = Math.ceil(qty / 2);
      const spacing = length / perSide;
      const midY = (eavesHeight + ridgeHeight) / 2;
      for (let i = 0; i < perSide; i++) {
        const x = -length / 2 + (i + 0.5) * spacing;
        for (const side of [-1, 1] as const) {
          add({ key: `${partId}-spr-${sm.id}-${i}-${side}`, memberId: sm.id, memberName: sm.name,
                pos: [x, midY, side * halfWidth / 2], rot: [side * angle, 0, 0],
                dims: [b, h, sLen || sparrenLen], color });
        }
      }
    }
  }

  // === Firstpfetten ===
  for (const fp of firstPfetten) {
    add({ key: `${partId}-fp-${fp.id}`, memberId: fp.id, memberName: fp.name,
          pos: [0, ridgeHeight, 0], rot: [0, 0, 0],
          dims: [length, fp.height / 1000, fp.width / 1000],
          color: utilizationColor(utilizations[fp.id]) });
  }

  // === Mittelpfetten ===
  const midPfetten = mittelPfetten.length > 0 ? mittelPfetten : otherPfetten;
  const midY = (eavesHeight + ridgeHeight) / 2;
  midPfetten.forEach((mp, idx) => {
    const side = idx % 2 === 0 ? -1 : 1;
    add({ key: `${partId}-mp-${mp.id}`, memberId: mp.id, memberName: mp.name,
          pos: [0, midY, (side * halfWidth) / 2], rot: [0, 0, 0],
          dims: [length, mp.height / 1000, mp.width / 1000],
          color: utilizationColor(utilizations[mp.id]) });
  });

  // === Fußpfetten ===
  fussPfetten.forEach((fp, idx) => {
    const side = idx % 2 === 0 ? -1 : 1;
    add({ key: `${partId}-fusp-${fp.id}`, memberId: fp.id, memberName: fp.name,
          pos: [0, eavesHeight, side * halfWidth], rot: [0, 0, 0],
          dims: [length, fp.height / 1000, fp.width / 1000],
          color: utilizationColor(utilizations[fp.id]) });
  });

  // === Stützen ===
  for (const st of stuetzenList) {
    const qty = Math.max(1, st.quantity);
    const stH = st.length || (ridgeHeight - 0.5);
    const spacing = length / qty;
    const color = utilizationColor(utilizations[st.id]);
    for (let i = 0; i < qty; i++) {
      const x = -length / 2 + (i + 0.5) * spacing;
      const side = i % 2 === 0 ? -1 : 1;
      add({ key: `${partId}-st-${st.id}-${i}`, memberId: st.id, memberName: st.name,
            pos: [x, stH / 2, (side * halfWidth) / 2], rot: [0, 0, 0],
            dims: [st.width / 1000, stH, st.height / 1000], color });
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

  // === Leimbinder (transverse Hauptträger) ===
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

  return out;
}

interface SceneProps {
  roofParts: RoofPart[];
  utilizations: Record<string, number>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function Scene({ roofParts, utilizations, selectedId, onSelect }: SceneProps) {
  const boxes = useMemo(() => {
    return roofParts.flatMap(p => buildPartBoxes(p, p.positionX || 0, p.positionY || 0, utilizations));
  }, [roofParts, utilizations]);

  // DEBUG: log mount
  console.log('[Roof3D Scene] mount with', boxes.length, 'boxes', boxes.slice(0,3));

  return (
    <>
      {/* DEBUG test cube - sollte IMMER sichtbar sein */}
      <mesh position={[0, 5, 0]}>
        <boxGeometry args={[4, 4, 4]} />
        <meshStandardMaterial color="red" />
      </mesh>
      <ambientLight intensity={0.8} />
      <directionalLight position={[20, 30, 20]} intensity={0.8} />
      <hemisphereLight args={[0xffffff, 0x444444, 0.4]} />
      {/* Boden */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#d0d4cf" />
      </mesh>
      {/* Bauteile */}
      {boxes.map(b => {
        const isWall = !b.memberId;
        const isSelected = b.memberId && b.memberId === selectedId;
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
              transparent={isWall}
              opacity={isWall ? 0.25 : 1}
              emissive={isSelected ? new THREE.Color('#fff200') : new THREE.Color('#000000')}
              emissiveIntensity={isSelected ? 0.3 : 0}
            />
          </mesh>
        );
      })}
    </>
  );
}

function Sidebar({ roofParts, selectedId, utilizations }: { roofParts: RoofPart[]; selectedId: string | null; utilizations: Record<string, number> }) {
  const allMembers = roofParts.flatMap(p => p.members);
  const selectedMember: TimberMember | undefined = selectedId
    ? allMembers.find(m => m.id === selectedId)
    : undefined;
  const selectedEta = selectedId ? utilizations[selectedId] : undefined;

  if (selectedMember) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Ausgewähltes Bauteil</div>
        <div className="font-semibold text-sm">{selectedMember.name}</div>
        <div className="text-xs space-y-0.5 font-mono">
          <div>Typ: {selectedMember.type}</div>
          <div>Material: {selectedMember.material}</div>
          <div>Querschnitt: {selectedMember.width}/{selectedMember.height} mm</div>
          <div>Länge: {selectedMember.length} m × {selectedMember.quantity} Stk</div>
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
            <div className="font-mono">First {p.geometry.ridgeHeight}m / Traufe {p.geometry.eavesHeight}m</div>
            <div className="font-mono">{p.members.length} Bauteiltypen</div>
          </div>
        ))}
        <div className="pt-1 text-muted-foreground">Insgesamt: {allMembers.length} Bauteilgruppen, {allMembers.reduce((s, m) => s + (m.quantity || 1), 0)} Einzelteile</div>
      </div>
    </div>
  );
}

export function Roof3D({ roofParts, utilizations = {} }: Roof3DProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Initial camera position based on largest roof part
  const maxL = roofParts.reduce((a, p) => Math.max(a, p.geometry.length || 10), 10);
  const maxW = roofParts.reduce((a, p) => Math.max(a, p.geometry.width || 8), 8);
  const maxH = roofParts.reduce((a, p) => Math.max(a, p.geometry.ridgeHeight || 6), 6);
  const dist = Math.max(maxL, maxW) * 1.5;
  const camTarget: [number, number, number] = [0, maxH / 2, 0];
  const camPos: [number, number, number] = [dist, Math.max(maxH * 1.8, dist * 0.5), dist * 0.8];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Boxes className="h-4 w-4 text-primary" />
          3D-Tragwerk
          <InfoTooltip title="3D-Tragwerk">
            <p>Maus: <b>links</b> drehen, <b>rechts</b> verschieben, <b>Scroll</b> zoomen. Klick auf Bauteil zeigt Details.</p>
          </InfoTooltip>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="h-7 gap-1">
          <RotateCcw className="h-3 w-3" /> Auswahl zurücksetzen
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]" style={{ height: 600 }}>
        {/* Canvas wrapper must have explicit width+height so R3F ResizeObserver gets non-zero dimensions */}
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#e8f0f5', overflow: 'hidden' }}>
          <Canvas
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            frameloop="always"
            camera={{ fov: 45, near: 0.1, far: dist * 10, position: camPos }}
            gl={{ antialias: true, alpha: false }}
            onCreated={({ gl }) => {
              gl.setClearColor('#e8f0f5');
              // Note: do NOT call camera.lookAt here — SimpleControls handles it after OrbitControls init
            }}
          >
            <Scene
              roofParts={roofParts}
              utilizations={utilizations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <SimpleControls target={camTarget} />
          </Canvas>
        </div>
        <div className="border-l p-3 bg-card overflow-y-auto" style={{ height: '100%', maxHeight: 600 }}>
          <Sidebar roofParts={roofParts} selectedId={selectedId} utilizations={utilizations} />
        </div>
      </div>
    </Card>
  );
}
