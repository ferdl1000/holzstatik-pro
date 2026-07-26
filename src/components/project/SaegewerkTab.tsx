import { useMemo, useState } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { TreePine, Info } from 'lucide-react';
import { roofAreaWithOverhang, DEFAULT_ROOF_OVERHANG } from '@/lib/calc/roofArea';
import {
  rundholzBedarf, einschnittPlan, empfohlenesZopfmass, festmeter,
  type Schnittware, type SchnittGruppe,
} from '@/lib/saege/einschnitt';

interface Props {
  project: Project;
}

const GRUPPEN: { key: SchnittGruppe; label: string; hinweis: string }[] = [
  { key: 'bauholz',  label: 'Bauholz (Sparren, Pfetten, Mauerbank, Steher)', hinweis: 'Achtung: selbst geschnittenes Bauholz ist KEIN KVH — nicht technisch getrocknet, nicht keilgezinkt, nicht gehobelt. Für die Statik zählt die Festigkeitsklasse (Sortierung nach ÖNORM DIN 4074 nötig).' },
  { key: 'schalung', label: 'Rauhschalung 24 mm', hinweis: 'Klassische Eigenleistung — Bretter fallen beim Blockeinschnitt ohnehin an.' },
  { key: 'latten',   label: 'Dachlatten 3/5 und Konterlattung 5/8', hinweis: 'Latten gehen aus den Seitenbrettern heraus. Für die Eindeckung ist Lattung nach ÖNORM B 3419 gefordert.' },
];

export function SaegewerkTab({ project }: Props) {
  const [selbst, setSelbst] = useState<SchnittGruppe[]>(['schalung', 'latten']);
  const [eigenerZopf, setEigenerZopf] = useState<string>('300');
  const [eigeneLaenge, setEigeneLaenge] = useState<string>('5.0');

  const members = project.members ?? [];
  const overhang = project.roofOverhang ?? DEFAULT_ROOF_OVERHANG;

  const dachflaeche = useMemo(() => {
    if (!project.geometry) return 0;
    return roofAreaWithOverhang(
      project.geometry.length.value, project.geometry.width.value,
      project.geometry.roofPitch.value, overhang,
    );
  }, [project.geometry, overhang]);

  /** Bauteilliste + Aufbau in Schnittware übersetzen. */
  const ware: Schnittware[] = useMemo(() => {
    const out: Schnittware[] = members
      .filter(m => m.width > 0 && m.height > 0 && m.length > 0)
      .map(m => ({
        bezeichnung: `${m.name} ${m.crossSection ?? `${m.width}/${m.height}`}`,
        b: m.width, h: m.height, stueck: m.quantity, laenge: m.length,
        gruppe: 'bauholz' as SchnittGruppe,
      }));

    if (dachflaeche > 0) {
      // Rauhschalung: m² Dachfläche → Bretter 24 × 150 mm, 4 m lang
      const brettFlaeche = 0.15 * 4;
      out.push({
        bezeichnung: 'Rauhschalung 24 mm',
        b: 150, h: 24,
        stueck: Math.ceil((dachflaeche * 1.1) / brettFlaeche),
        laenge: 4, gruppe: 'schalung',
      });
      // Lattung: ca. 4 lfm/m² Dachlatte + 1,4 lfm/m² Konterlatte
      out.push({
        bezeichnung: 'Dachlatte 3/5',
        b: 50, h: 30,
        stueck: Math.ceil((dachflaeche * 4 * 1.1) / 4),
        laenge: 4, gruppe: 'latten',
      });
      out.push({
        bezeichnung: 'Konterlatte 5/8',
        b: 80, h: 50,
        stueck: Math.ceil((dachflaeche * 1.4 * 1.1) / 4),
        laenge: 4, gruppe: 'latten',
      });
    }
    return out;
  }, [members, dachflaeche]);

  const bedarf = useMemo(() => rundholzBedarf(ware, selbst), [ware, selbst]);

  /** Was geht aus dem Stamm heraus, den der Zimmerer schon hat? */
  const eigenerPlan = useMemo(() => {
    const zopf = parseFloat(eigenerZopf);
    const len = parseFloat(eigeneLaenge);
    if (!Number.isFinite(zopf) || zopf < 80 || !Number.isFinite(len) || len <= 0) return null;
    // Stärkstes selbst zu schneidendes Stück als Hauptware
    const kandidaten = ware.filter(w => selbst.includes(w.gruppe));
    const haupt = kandidaten.length > 0
      ? kandidaten.reduce((a, b) => (a.b * a.h >= b.b * b.h ? a : b))
      : null;
    return einschnittPlan(zopf, len, haupt ? { bezeichnung: haupt.bezeichnung, b: haupt.b, h: haupt.h } : null, 24);
  }, [eigenerZopf, eigeneLaenge, ware, selbst]);

  const toggle = (g: SchnittGruppe) =>
    setSelbst(prev => (prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]));

  if (members.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg border-2 border-dashed p-10 text-center space-y-2">
          <TreePine className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">
            Noch keine Bauteile berechnet — lade zuerst einen Plan hoch und lass rechnen.
            Danach steht hier, was du an Rundholz brauchst und was aus jedem Stamm herausgeht.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SectionCard
        title="Was schneide ich selber?"
        subtitle="Auswählen, was auf der eigenen Blockbandsäge entsteht — der Rest wird zugekauft"
      >
        <div className="space-y-3">
          {GRUPPEN.map(g => {
            const aktiv = selbst.includes(g.key);
            const stk = ware.filter(w => w.gruppe === g.key).reduce((s, w) => s + w.stueck, 0);
            return (
              <div key={g.key} className={`rounded-lg border p-3 ${aktiv ? 'border-primary/50 bg-primary/5' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{g.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stk} Stück laut Berechnung</p>
                    <p className="text-xs text-muted-foreground mt-1">{g.hinweis}</p>
                  </div>
                  <Button variant={aktiv ? 'default' : 'outline'} size="sm" onClick={() => toggle(g.key)}>
                    {aktiv ? 'schneide ich selbst' : 'kaufe ich zu'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Rundholz, das du dafür brauchst"
        subtitle="Zopfmaß, Länge und Festmeter — so bestellst du beim Waldbauern"
      >
        {bedarf.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aktuell wird alles zugekauft — kein Rundholz nötig.
          </p>
        ) : (
          <div className="space-y-3">
            {bedarf.map(b => (
              <div key={b.gruppe} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-semibold text-sm capitalize">{b.gruppe}</span>
                  <span className="font-mono text-sm">Zopf {b.zopfMm} mm</span>
                  <span className="font-mono text-sm">{b.laengeM.toFixed(2)} m lang</span>
                  <span className="font-mono text-sm font-semibold">{b.staemme} Stämme</span>
                  <span className="font-mono text-sm">{b.festmeter.toFixed(2)} fm</span>
                </div>
                <p className="text-xs text-muted-foreground">{b.hinweis}</p>
                <ul className="text-xs text-muted-foreground list-disc pl-4">
                  {b.positionen.map(p => <li key={p}>{p}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Ich habe schon Holz — was geht da raus?"
        subtitle="Zopfmaß am liegenden Stamm messen und eintragen"
      >
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div className="space-y-1">
            <Label className="text-xs">Zopfmaß [mm]</Label>
            <Input className="w-32 font-mono" value={eigenerZopf} onChange={e => setEigenerZopf(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stammlänge [m]</Label>
            <Input className="w-32 font-mono" value={eigeneLaenge} onChange={e => setEigeneLaenge(e.target.value)} />
          </div>
        </div>

        {eigenerPlan && (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-sm">{eigenerPlan.beschreibung}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-muted-foreground text-xs block">Festmeter</span><span className="font-mono">{eigenerPlan.festmeter.toFixed(3)} fm</span></div>
              <div><span className="text-muted-foreground text-xs block">Schnittware</span><span className="font-mono">{eigenerPlan.ausbeuteM3.toFixed(3)} m³</span></div>
              <div><span className="text-muted-foreground text-xs block">Ausbeute</span><span className="font-mono">{eigenerPlan.ausbeuteProzent.toFixed(0)} %</span></div>
              <div><span className="text-muted-foreground text-xs block">Stücke</span><span className="font-mono">{eigenerPlan.stuecke.length}</span></div>
            </div>
            {eigenerPlan.stuecke.length > 0 && (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-1.5">Stück</th>
                    <th className="text-left">Einschnittmaß nass</th>
                    <th className="text-left">Lage im Stamm</th>
                  </tr>
                </thead>
                <tbody>
                  {eigenerPlan.stuecke.map((s, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1.5">{s.bezeichnung}</td>
                      <td className="font-mono">{s.bNass} × {s.hNass} mm</td>
                      <td className="text-muted-foreground">{s.lage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-4 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Gerechnet wird mit 3 mm Sägefuge (Blockbandsäge) und 3 % Schwundzuschlag —
            nass eingeschnittenes Holz schwindet beim Trocknen, deshalb sind die Einschnittmaße
            größer als die Endmaße in der Stückliste. Die angegebene Breite der Seitenbretter ist
            die vollkantige Breite an der Außenkante; ein Stamm mit Krümmung oder starker
            Abholzigkeit gibt weniger her.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Was der Stamm hergeben muss" subtitle="Mindest-Zopfmaß je Querschnitt aus deiner Berechnung">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="text-left py-1.5">Bauteil</th>
              <th className="text-left">Querschnitt</th>
              <th className="text-left">Einschnitt nass</th>
              <th className="text-left">Mindest-Zopf</th>
              <th className="text-left">fm je Stamm</th>
            </tr>
          </thead>
          <tbody>
            {ware.map((w, i) => {
              const zopf = empfohlenesZopfmass(w.b, w.h);
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5">{w.bezeichnung}</td>
                  <td className="font-mono">{w.b}/{w.h} mm</td>
                  <td className="font-mono">{Math.ceil(w.b * 1.03)}/{Math.ceil(w.h * 1.03)} mm</td>
                  <td className="font-mono font-semibold">{zopf} mm</td>
                  <td className="font-mono">{festmeter(zopf, w.laenge).toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
