import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Edges, Text } from '@react-three/drei';
import { Suspense, useMemo, useState } from 'react';
import type { TimberMember } from '@/types/project';
import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/help/InfoTooltip';
import { Boxes, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Roof3DProps {
  length: number;        // m
  width: number;         // m
  ridgeHeight: number;   // m
  eavesHeight: number;   // m
  pitch: number;         // °
  roofForm: 'satteldach' | 'pultdach' | 'walmdach' | 'flachdach' | 'krueppelwalmdach' | 'mischform';
  members?: TimberMember[];
  utilizations?: Record<string, number>;  // memberId → η
}

function utilizationColor(eta: number | undefined): string {
  if (eta == null) return '#a89070';
  if (eta > 1) return '#ef4444';
  if (eta > 0.85) return '#eab308';
  return '#22c55e';
}

interface MemberMeshProps {
  pos: [number, number, number];
  rot: [number, number, number];
  dims: [number, number, number];    // x,y,z in m
  color: string;
  label?: string;
  onClick?: () => void;
  highlight?: boolean;
}

function MemberMesh({ pos, rot, dims, color, label, onClick, highlight }: MemberMeshProps) {
  return (
    <group position={pos} rotation={rot}>
      <mesh onClick={onClick}>
        <boxGeometry args={dims} />
        <meshStandardMaterial color={color} opacity={highlight ? 1 : 0.92} transparent />
        <Edges color={highlight ? '#000' : '#444'} threshold={15} />
      </mesh>
      {label && highlight && (
        <Text position={[0, dims[1] / 2 + 0.3, 0]} fontSize={0.3} color="#000" anchorX="center" anchorY="middle">
          {label}
        </Text>
      )}
    </group>
  );
}

function RoofGeometry({ length, width, ridgeHeight, eavesHeight, pitch, roofForm, members, utilizations, onSelect, selectedId }: Roof3DProps & { onSelect: (id: string | null) => void; selectedId: string | null }) {
  const wallHeight = eavesHeight;
  const ridgeY = ridgeHeight;

  // Generic timber members visualization
  const visualMembers = useMemo(() => {
    if (!members || members.length === 0) {
      // Default: synthesize sparren from geometry
      const sparrenCount = Math.max(6, Math.floor(length / 0.85));
      const sparren = [];
      const sparrenLength = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(ridgeY - wallHeight, 2));
      const angle = Math.atan2(ridgeY - wallHeight, width / 2);
      for (let i = 0; i < sparrenCount; i++) {
        const x = -length / 2 + (i + 0.5) * (length / sparrenCount);
        for (const side of [-1, 1]) {
          sparren.push({
            id: `sparren_${i}_${side}`,
            type: 'sparren' as const,
            pos: [x, (wallHeight + ridgeY) / 2, side * width / 4] as [number, number, number],
            rot: [side * angle, 0, 0] as [number, number, number],
            dims: [0.08, 0.16, sparrenLength] as [number, number, number],
            label: 'Sparren',
          });
        }
      }
      return sparren;
    }
    // From actual member list — vereinfachte Platzierung
    return members.map((m, idx) => {
      const isSparren = m.type === 'sparren';
      const isPfette = m.type === 'pfette';
      const sparrenLength = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(ridgeY - wallHeight, 2));
      const angle = Math.atan2(ridgeY - wallHeight, width / 2);
      return {
        id: m.id,
        type: m.type,
        pos: [
          isSparren ? -length / 2 + (idx + 1) * length / (members.length + 1) : 0,
          isPfette ? ridgeY : (wallHeight + ridgeY) / 2,
          isPfette ? 0 : (idx % 2 === 0 ? -1 : 1) * width / 4,
        ] as [number, number, number],
        rot: isSparren ? [(idx % 2 === 0 ? 1 : -1) * angle, 0, 0] as [number, number, number] : [0, 0, 0] as [number, number, number],
        dims: [m.width / 1000, m.height / 1000, isPfette ? length : sparrenLength] as [number, number, number],
        label: m.name,
      };
    });
  }, [members, length, width, ridgeY, wallHeight]);

  return (
    <>
      {/* Boden / Grundriss */}
      <Grid args={[Math.max(length, width) * 2, Math.max(length, width) * 2]} cellSize={1} cellThickness={0.5} sectionSize={5} sectionColor="#888" position={[0, 0, 0]} />

      {/* Wände */}
      <mesh position={[0, wallHeight / 2, -width / 2]}>
        <boxGeometry args={[length, wallHeight, 0.3]} />
        <meshStandardMaterial color="#e8d8c4" opacity={0.35} transparent />
      </mesh>
      <mesh position={[0, wallHeight / 2, width / 2]}>
        <boxGeometry args={[length, wallHeight, 0.3]} />
        <meshStandardMaterial color="#e8d8c4" opacity={0.35} transparent />
      </mesh>
      <mesh position={[-length / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[0.3, wallHeight, width]} />
        <meshStandardMaterial color="#e8d8c4" opacity={0.35} transparent />
      </mesh>
      <mesh position={[length / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[0.3, wallHeight, width]} />
        <meshStandardMaterial color="#e8d8c4" opacity={0.35} transparent />
      </mesh>

      {/* Firstpfette */}
      <MemberMesh
        pos={[0, ridgeY, 0]} rot={[0, 0, 0]}
        dims={[length, 0.12, 0.12]}
        color={utilizationColor(utilizations?.['firstpfette'])}
        label="Firstpfette"
        highlight={selectedId === 'firstpfette'}
        onClick={() => onSelect('firstpfette')}
      />

      {/* Bauteile */}
      {visualMembers.map((m) => (
        <MemberMesh
          key={m.id}
          pos={m.pos}
          rot={m.rot}
          dims={m.dims}
          color={utilizationColor(utilizations?.[m.id])}
          label={m.label}
          highlight={selectedId === m.id}
          onClick={() => onSelect(m.id === selectedId ? null : m.id)}
        />
      ))}

      {/* Dachfläche (transparent) */}
      {roofForm !== 'flachdach' && (
        <>
          {[-1, 1].map((side) => {
            const sparrenLength = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(ridgeY - wallHeight, 2));
            const angle = Math.atan2(ridgeY - wallHeight, width / 2);
            return (
              <mesh
                key={side}
                position={[0, (wallHeight + ridgeY) / 2, side * width / 4]}
                rotation={[side * angle, 0, 0]}
              >
                <planeGeometry args={[length, sparrenLength]} />
                <meshStandardMaterial color="#bd5b3a" opacity={0.25} transparent side={2} />
              </mesh>
            );
          })}
        </>
      )}
    </>
  );
}

/**
 * 3D-Visualisierung Dachstuhl mit Drehen/Zoomen, Klick auf Bauteil, Farbcodierung Ausnutzung.
 */
export function Roof3D(props: Roof3DProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMember = props.members?.find(m => m.id === selectedId);
  const selectedEta = selectedId ? props.utilizations?.[selectedId] : undefined;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Boxes className="h-4 w-4 text-primary" />
          3D-Tragwerk
          <InfoTooltip title="3D-Tragwerk">
            <p>Maus: <b>Linke Taste</b> drehen, <b>Rechte Taste</b> verschieben, <b>Scroll</b> zoomen.<br/>Klick auf Bauteil zeigt Details. Farben: 🟢 ok, 🟡 wenig Reserve, 🔴 versagt.</p>
          </InfoTooltip>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="h-7 gap-1">
          <RotateCcw className="h-3 w-3" /> Zurücksetzen
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] min-h-[500px]">
        <div className="bg-gradient-to-b from-sky-50 to-stone-50" style={{ minHeight: 500 }}>
          <Canvas
            camera={{ position: [props.length * 1.2, props.length * 0.8, props.width * 1.5], fov: 50 }}
            shadows
          >
            <Suspense fallback={null}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[10, 20, 10]} intensity={0.9} castShadow />
              <RoofGeometry {...props} onSelect={setSelectedId} selectedId={selectedId} />
              <OrbitControls makeDefault target={[0, props.ridgeHeight / 2, 0]} />
            </Suspense>
          </Canvas>
        </div>
        <div className="border-l p-3 space-y-3 text-sm bg-card">
          {selectedId ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Ausgewähltes Bauteil</div>
              <div className="font-semibold">{selectedMember?.name || selectedId}</div>
              {selectedMember && (
                <>
                  <div className="text-xs space-y-0.5">
                    <div>Typ: <span className="font-mono">{selectedMember.type}</span></div>
                    <div>Material: <span className="font-mono">{selectedMember.material}</span></div>
                    <div>Querschnitt: <span className="font-mono">{selectedMember.width}/{selectedMember.height} mm</span></div>
                    <div>Länge: <span className="font-mono">{selectedMember.length} m × {selectedMember.quantity}</span></div>
                  </div>
                </>
              )}
              {selectedEta !== undefined && (
                <div className="rounded border p-2 text-xs">
                  <div className="font-medium mb-1">Ausnutzung η = {(selectedEta * 100).toFixed(0)} %</div>
                  <div className={selectedEta > 1 ? 'text-red-600' : selectedEta > 0.85 ? 'text-amber-600' : 'text-emerald-600'}>
                    {selectedEta > 1 ? '🔴 Versagt — Querschnitt zu klein' : selectedEta > 0.85 ? '🟡 Knapp' : '🟢 OK mit Reserve'}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground space-y-2">
              <p>Klicke auf ein Bauteil im 3D-Modell, um Details zu sehen.</p>
              <div className="space-y-1 pt-2">
                <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-emerald-500" /> η ≤ 85 % – OK</div>
                <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-amber-500" /> 85–100 % – Reserve gering</div>
                <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-red-500" /> &gt; 100 % – Versagt</div>
              </div>
              <div className="pt-3 space-y-1 text-[11px]">
                <div className="font-medium">Bauwerk</div>
                <div>Länge: {props.length} m × Breite: {props.width} m</div>
                <div>Firsthöhe: {props.ridgeHeight} m / Traufe: {props.eavesHeight} m</div>
                <div>Neigung: {props.pitch}°</div>
                <div>Form: {props.roofForm}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
