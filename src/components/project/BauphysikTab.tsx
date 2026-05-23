import { useState, useMemo } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { AlertCircle, Flame, Thermometer, Volume2, Info } from 'lucide-react';
import {
  type BauKlasse,
  getBrandschutzInfo,
  mindestQuerschnitt,
  BAUKLASSE_BESCHREIBUNG,
} from '@/lib/bauphysik/brandschutz';
import {
  DACH_AUFBAUTEN,
  DACH_AUFBAUTEN_LABELS,
  bewerteUWert,
} from '@/lib/bauphysik/uwert';
import {
  bewerteSchallschutz,
  type DeckeAufbau,
} from '@/lib/bauphysik/schallschutz';

interface BauphysikTabProps {
  project: Project;
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-64 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md">
          {text}
        </span>
      )}
    </span>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
      {label}
    </span>
  );
}

const BEWERTUNG_COLOR: Record<string, string> = {
  sehr_gut: 'text-green-600 dark:text-green-400',
  gut: 'text-blue-600 dark:text-blue-400',
  ausreichend: 'text-yellow-600 dark:text-yellow-400',
  mangelhaft: 'text-red-600 dark:text-red-400',
};

const BEWERTUNG_LABEL: Record<string, string> = {
  sehr_gut: 'Sehr gut',
  gut: 'Gut',
  ausreichend: 'Ausreichend',
  mangelhaft: 'Mangelhaft',
};

export function BauphysikTab({ project }: BauphysikTabProps) {
  // Brandschutz
  const [bauklasse, setBauklasse] = useState<BauKlasse>('GK2');
  const [sparrenB, setSparrenB] = useState(60);
  const [sparrenH, setSparrenH] = useState(200);

  // U-Wert
  const [dachAufbauKey, setDachAufbauKey] = useState<keyof typeof DACH_AUFBAUTEN>('standard_zwischensparren');

  // Schallschutz
  const [holzdicke, setHolzdicke] = useState(200);
  const [estrich, setEstrich] = useState(60);
  const [dämmungMm, setDämmungMm] = useState(30);
  const [deckenverkleidung, setDeckenverkleidung] = useState(12.5);

  const brandschutzInfo = useMemo(() => getBrandschutzInfo(bauklasse), [bauklasse]);
  const abbrandTragwerk = useMemo(
    () => mindestQuerschnitt(brandschutzInfo.rei_tragwerk, sparrenB, sparrenH),
    [brandschutzInfo, sparrenB, sparrenH],
  );

  const uwertErgebnis = useMemo(
    () => bewerteUWert(DACH_AUFBAUTEN[dachAufbauKey]),
    [dachAufbauKey],
  );

  const deckeAufbau: DeckeAufbau = {
    holzdicke,
    estrich,
    dämmung: dämmungMm,
    deckenverkleidung,
  };
  const schallErgebnis = useMemo(() => bewerteSchallschutz(deckeAufbau), [holzdicke, estrich, dämmungMm, deckenverkleidung]);

  const hasCeilings = project.ceilings && project.ceilings.length > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Hinweis-Banner */}
      <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/50 dark:bg-yellow-900/20">
        <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-800 dark:text-yellow-300">
          Diese Werte sind <strong>Vorbemessung</strong>. Finale Nachweise (Brandschutzkonzept, Wärmeschutz- und Schallschutznachweis) müssen durch einen Bauphysiker geprüft werden.
        </p>
      </div>

      {/* Brandschutz */}
      <SectionCard
        title="Brandschutz"
        subtitle="REI-Anforderungen nach OIB-Richtlinie 2"
        headerRight={<Flame className="h-4 w-4 text-orange-500" />}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center">
                Bauklasse (Gebäudeklasse)
                <InfoTooltip text="Bauklasse nach OIB RL2: GK1–GK2 = max. 3 Geschosse, GK3 = max. 5, GK4 = bis 7 Geschosse, GK5 = Hochhaus." />
              </Label>
              <Select value={bauklasse} onValueChange={(v) => setBauklasse(v as BauKlasse)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['GK1', 'GK2', 'GK3', 'GK4', 'GK5'] as BauKlasse[]).map((gk) => (
                    <SelectItem key={gk} value={gk} className="text-xs">
                      {gk} — {BAUKLASSE_BESCHREIBUNG[gk]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-lg bg-muted/50 p-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Tragwerk</span>
                <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">{brandschutzInfo.rei_tragwerk}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Decke / Dach</span>
                <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">{brandschutzInfo.rei_decke}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Holzbau zulässig</span>
                <StatusBadge ok={brandschutzInfo.holzbauZulaessig} label={brandschutzInfo.holzbauZulaessig ? 'Ja' : 'Nein (Sondernachweis)'} />
              </div>
            </div>
          </div>

          {/* Querschnittsbemessung */}
          <div>
            <p className="text-xs font-medium mb-2 flex items-center">
              Mindestquerschnitt Sparren/Balken (Abbrandbemessung)
              <InfoTooltip text="KVH-Abbrandrate 0.65 mm/min, 3-seitig beaufschlagt. Der Nennquerschnitt muss um die Abbrandtiefe vergrößert werden." />
            </p>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Basis b (mm)</Label>
                <Input
                  type="number"
                  value={sparrenB}
                  onChange={(e) => setSparrenB(Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Basis h (mm)</Label>
                <Input
                  type="number"
                  value={sparrenH}
                  onChange={(e) => setSparrenH(Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Min. b mit Abbrand</Label>
                <div className="h-8 flex items-center rounded-md border bg-muted/50 px-3 font-mono text-xs font-semibold">
                  {abbrandTragwerk.b} mm
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Min. h mit Abbrand</Label>
                <div className="h-8 flex items-center rounded-md border bg-muted/50 px-3 font-mono text-xs font-semibold">
                  {abbrandTragwerk.h} mm
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{abbrandTragwerk.bemerkung}</p>
          </div>

          {/* Betroffene Bauteile */}
          <div className="rounded-md border p-3 space-y-1.5">
            <p className="text-xs font-medium">Betroffene Bauteile</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
              {project.members.slice(0, 6).map((m) => (
                <li key={m.id}>{m.name} ({m.crossSection}) — Anforderung: {brandschutzInfo.rei_tragwerk}</li>
              ))}
              {project.members.length === 0 && <li>Keine Bauteile im Projekt vorhanden</li>}
              {project.members.length > 6 && <li>… und {project.members.length - 6} weitere</li>}
            </ul>
          </div>
        </div>
      </SectionCard>

      {/* U-Wert Dachaufbau */}
      <SectionCard
        title="U-Wert Dachaufbau"
        subtitle="Wärmedurchgangskoeffizient nach EN ISO 6946 / OIB RL 6"
        headerRight={<Thermometer className="h-4 w-4 text-blue-500" />}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center">
                Dachaufbau-Variante
                <InfoTooltip text="Vorberechnete typische Aufbauten für EFH. Alle Schichten von innen nach außen. OIB RL6 Anforderung Dach: U ≤ 0.20 W/m²K." />
              </Label>
              <Select value={dachAufbauKey} onValueChange={(v) => setDachAufbauKey(v as keyof typeof DACH_AUFBAUTEN)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(DACH_AUFBAUTEN).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {DACH_AUFBAUTEN_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-lg bg-muted/50 p-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">U-Wert</span>
                <span className={`font-mono font-bold text-base ${BEWERTUNG_COLOR[uwertErgebnis.bewertung]}`}>
                  {uwertErgebnis.uwert.toFixed(3)} W/m²K
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">OIB-Anforderung (≤)</span>
                <span className="font-mono">{uwertErgebnis.anforderungEnev.toFixed(2)} W/m²K</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Bewertung</span>
                <span className={`font-medium ${BEWERTUNG_COLOR[uwertErgebnis.bewertung]}`}>
                  {BEWERTUNG_LABEL[uwertErgebnis.bewertung]}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">OIB RL6 erfüllt</span>
                <StatusBadge ok={uwertErgebnis.erfuellt} label={uwertErgebnis.erfuellt ? 'Ja' : 'Nein'} />
              </div>
            </div>
          </div>

          {/* Schichtenaufbau */}
          <div>
            <p className="text-xs font-medium mb-2">Schichtenaufbau (innen → außen)</p>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Schicht</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">d (mm)</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">λ (W/mK)</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">R (m²K/W)</th>
                  </tr>
                </thead>
                <tbody>
                  {uwertErgebnis.schichten.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-1.5">{s.name}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{s.dicke_mm}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{s.lambda.toFixed(3)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{s.R.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Schallschutz Decke */}
      <SectionCard
        title="Schallschutz Holzbalkendecke"
        subtitle="Luftschall R'w nach DIN 4109 / OIB RL 5 (Vorbemessung)"
        headerRight={<Volume2 className="h-4 w-4 text-purple-500" />}
      >
        {!hasCeilings && (
          <p className="text-xs text-muted-foreground mb-4">
            Keine Decken im Projekt erkannt — manuelle Eingabe der Deckenparameter:
          </p>
        )}
        {hasCeilings && (
          <p className="text-xs text-muted-foreground mb-4">
            {project.ceilings!.length} Decke(n) erkannt. Parameter für Schallschutz-Vorbemessung:
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center">
                  Balkenhöhe (mm)
                  <InfoTooltip text="Statische Höhe des Holzbalkens. Größere Querschnitte erhöhen die Masse und verbessern den Schallschutz geringfügig." />
                </Label>
                <Input
                  type="number"
                  value={holzdicke}
                  onChange={(e) => setHolzdicke(Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center">
                  Estrich (mm)
                  <InfoTooltip text="Schwimmender Zementestrich auf Trittschalldämmung. Mindest 40 mm empfohlen, 60 mm für guten Schallschutz." />
                </Label>
                <Input
                  type="number"
                  value={estrich}
                  onChange={(e) => setEstrich(Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center">
                  Trittschalldämmung (mm)
                  <InfoTooltip text="Elastische Dämmschicht unter dem Estrich (z.B. Mineralwolle-Trittschalldämmplatte). Mindest 20 mm empfohlen." />
                </Label>
                <Input
                  type="number"
                  value={dämmungMm}
                  onChange={(e) => setDämmungMm(Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center">
                  GK-Deckenverkleidung (mm)
                  <InfoTooltip text="Abgehängte Gipskarton-Decke auf elastischen Abhängern. Verbessert Luftschallschutz um ca. 5 dB." />
                </Label>
                <Input
                  type="number"
                  value={deckenverkleidung}
                  onChange={(e) => setDeckenverkleidung(Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">R'w Luftschall</span>
              <span className={`font-mono font-bold text-base ${BEWERTUNG_COLOR[schallErgebnis.bewertung]}`}>
                {schallErgebnis.rw} dB
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">R'w + Ctr</span>
              <span className="font-mono">{schallErgebnis.rw_bewerted} dB</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">L'n,w Trittschall (geschätzt)</span>
              <span className="font-mono">{schallErgebnis.trittschall_l} dB</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Anforderung Wohnen (≥)</span>
              <span className="font-mono">{schallErgebnis.anforderung_wohnen} dB</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Bewertung</span>
              <span className={`font-medium ${BEWERTUNG_COLOR[schallErgebnis.bewertung]}`}>
                {BEWERTUNG_LABEL[schallErgebnis.bewertung]}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">OIB RL5 erfüllt</span>
              <StatusBadge ok={schallErgebnis.erfuellt} label={schallErgebnis.erfuellt ? 'Ja' : 'Nein'} />
            </div>
          </div>
        </div>

        {hasCeilings && (
          <div className="mt-4 rounded-md border p-3">
            <p className="text-xs font-medium mb-2">Erkannte Decken im Projekt</p>
            <div className="space-y-1">
              {project.ceilings!.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.level} — {c.nutzung}</span>
                  <span className="font-mono">{c.area} m² / Spannweite {c.span} m</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
