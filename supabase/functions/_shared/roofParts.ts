/**
 * Deterministische Dachteil-Rekonstruktion.
 *
 * Die KI (Gemini) liefert pro Lauf unterschiedlich gute/viele Dachteile — mal mit
 * Müll-Labels aus Textfragmenten, mal zu wenige, mal Duplikate. Diese reine Funktion
 * macht daraus ein STABILES, sauberes, vollständiges Ergebnis:
 *   1. Müll-Labels erkennen + säubern
 *   2. Garantie: genau ein Hauptdach
 *   3. Garantie: Vordächer aus deterministischem Text-Hinweis (konservativ gekappt)
 *   4. Geometrie-Schiedsrichter für die Neigung (DN-Marker vs. Geometrie)
 *   5. Vordach/Carport-Neigung plausibilisieren (≤15°)
 *   6. Toleranz-Dedup (gleiche Grundfläche = ein Dach), genau ein Hauptdach
 *
 * Reine Logik ⇒ vollständig unit-testbar OHNE KI-API.
 */

export interface RawPart {
  id?: string; kind?: string; label?: string; form?: string;
  positionX?: number; positionY?: number;
  length?: number; width?: number; ridgeHeight?: number; eavesHeight?: number;
  pitch?: number; ridgeDirection?: string; confidence?: number;
  geometry?: { length?: number; width?: number; ridgeHeight?: number; eavesHeight?: number; pitch?: number; ridgeDirection?: string };
  notes?: string;
}

export interface ReconcileInput {
  kiParts: RawPart[];
  dnMarkers: number[];
  ueberdachungCount: number;
  base: { length: number; width: number; ridgeHeight: number; eavesHeight: number };
}

export interface ReconciledPart {
  id: string; kind: string; label: string; form: string;
  positionX: number; positionY: number;
  length: number; width: number; ridgeHeight: number; eavesHeight: number;
  pitch: number; ridgeDirection: string; confidence: number;
  _pitchSource?: string; notes?: string;
}

export function isGarbageLabel(raw: unknown): boolean {
  const r = String(raw ?? '').trim();
  if (!r || r === 'undefined') return true;
  if (r.length > 38) return true;
  if (/einreichplan|maßstab|massstab|grundriss|ansicht\b|schnitt\b/i.test(r)) return true;
  if ((r.match(/,/g) || []).length >= 2) return true;
  if ((r.match(/\d/g) || []).length >= 4) return true;
  if (/\d{2,}[.,]\d/.test(r)) return true;
  return false;
}

export function cleanRoofLabel(raw: unknown, kind: string, idx: number): string {
  if (!isGarbageLabel(raw)) return String(raw).trim();
  if (kind === 'main') return 'Hauptdach';
  if (kind === 'vordach' || kind === 'carport') return `Vordach ${idx}`;
  if (kind === 'anbau' || kind === 'nebengebaeude') return `Anbau ${idx}`;
  return `Dachteil ${idx}`;
}

const W = (p: RawPart) => p.width ?? p.geometry?.width ?? 0;
const L = (p: RawPart) => p.length ?? p.geometry?.length ?? 0;
const RH = (p: RawPart) => p.ridgeHeight ?? p.geometry?.ridgeHeight ?? 0;
const EH = (p: RawPart) => p.eavesHeight ?? p.geometry?.eavesHeight ?? 0;
const PI = (p: RawPart) => p.pitch ?? p.geometry?.pitch ?? 0;

/** Neigung deterministisch bestimmen: DN-Marker nur wenn geometrie-bestätigt, sonst Geometrie. */
export function arbitratePitch(part: RawPart, dnMarkers: number[]): { pitch: number; form: string; source: string; uncertain: boolean } {
  const wid = W(part), rise = RH(part) - EH(part);
  const form0 = part.form || '';
  let geomPult = 0, geomSattel = 0;
  if (wid > 0 && rise > 0.05) {
    geomPult = Math.round(Math.atan2(rise, wid) * 180 / Math.PI * 10) / 10;
    geomSattel = Math.round(Math.atan2(rise, wid / 2) * 180 / Math.PI * 10) / 10;
  }
  const kiDn = dnMarkers.length === 1 ? dnMarkers[0] : (part.kind === 'main' ? (dnMarkers[0] ?? null) : null);

  if (rise <= 0.05 && wid > 0) return { pitch: 2, form: 'flachdach', source: 'flach (First≈Traufe)', uncertain: false };
  if (kiDn != null && (Math.abs(kiDn - geomPult) <= 5 || Math.abs(kiDn - geomSattel) <= 5)) {
    const form = (Math.abs(kiDn - geomPult) <= Math.abs(kiDn - geomSattel)) ? (form0 === 'satteldach' ? 'pultdach' : (form0 || 'pultdach')) : (form0 || 'satteldach');
    return { pitch: kiDn, form, source: `DN ${kiDn}° (geometrie-bestätigt)`, uncertain: false };
  }
  if (geomPult > 0) {
    const flatness = rise / wid;
    const kiSaysSattel = form0 === 'satteldach' || form0 === 'walmdach' || form0 === 'krueppelwalmdach';
    if (flatness < 0.27 && !kiSaysSattel) return { pitch: geomPult, form: 'pultdach', source: `Geometrie-Pultdach ${geomPult}°`, uncertain: true };
    if (form0 === 'pultdach') return { pitch: geomPult, form: 'pultdach', source: `Geometrie-Pultdach ${geomPult}° (KI-Form)`, uncertain: true };
    return { pitch: geomSattel, form: (!form0 || form0 === 'flachdach') ? 'satteldach' : form0, source: `Geometrie-Satteldach ${geomSattel}°`, uncertain: true };
  }
  return { pitch: kiDn ?? PI(part) ?? 30, form: form0 || 'satteldach', source: kiDn != null ? `DN ${kiDn}° (ungeprüft)` : 'Default 30°', uncertain: true };
}

/** Toleranz-Dedup: gleicher Typ + Grundfläche je ≤1,2 m = ein Dach; größeres Teil gewinnt. */
export function dedupeParts(parts: ReconciledPart[]): ReconciledPart[] {
  const out: ReconciledPart[] = [];
  for (const rp of parts) {
    const idx = out.findIndex((k) => (k.kind || 'main') === (rp.kind || 'main')
      && Math.abs(k.width - rp.width) <= 1.2 && Math.abs(k.length - rp.length) <= 1.2);
    if (idx < 0) out.push(rp);
    else if (rp.width * rp.length > out[idx].width * out[idx].length) out[idx] = rp;
  }
  // genau EIN Hauptdach (größtes), Rest → Anbau
  const mains = out.filter((r) => r.kind === 'main');
  if (mains.length > 1) {
    mains.sort((a, b) => (b.width * b.length) - (a.width * a.length));
    mains.slice(1).forEach((r, i) => { r.kind = 'anbau'; if (/^Hauptdach/.test(r.label)) r.label = `Anbau ${i + 1}`; });
  }
  return out;
}

/** Vollständige Rekonstruktion. Reine Funktion, deterministisch für gleiche Eingabe. */
export function reconcileRoofParts(input: ReconcileInput): { parts: ReconciledPart[]; uncertain: string[]; log: string[] } {
  const { kiParts, dnMarkers, ueberdachungCount, base } = input;
  const log: string[] = [];
  const uncertain: string[] = [];

  // 1. säubern: nur Teile mit Maßen, Labels bereinigen
  let vCount = 0;
  let parts: RawPart[] = (kiParts || [])
    .filter((rp) => (L(rp) > 0 || W(rp) > 0))
    .map((rp) => {
      const isV = rp.kind === 'vordach' || rp.kind === 'carport';
      if (isV) vCount++;
      return { ...rp, label: cleanRoofLabel(rp.label, rp.kind || 'main', isV ? vCount : 1) };
    });

  // 2. Garantie Hauptdach
  if (parts.length === 0) {
    const p = dnMarkers[0] ?? 30;
    parts = [{ id: 'main', kind: 'main', label: 'Hauptdach',
      form: p <= 5 ? 'flachdach' : (p < 12 ? 'pultdach' : 'satteldach'),
      positionX: 0, positionY: 0, length: base.length, width: base.width,
      ridgeHeight: base.ridgeHeight, eavesHeight: base.eavesHeight, pitch: p, ridgeDirection: 'x', confidence: 0.5,
      notes: 'Synthetisch (KI lieferte kein Dachteil)' }];
    log.push('Hauptdach synthetisch erzeugt');
  }

  // 3. Garantie Vordächer (konservativ: max 2)
  const kiVordach = parts.filter((p) => p.kind === 'vordach' || p.kind === 'carport').length;
  const target = Math.min(ueberdachungCount, 2);
  for (let i = kiVordach; i < target; i++) {
    const n = i + 1;
    parts.push({ id: `vordach_${n}`, kind: 'vordach', label: `Vordach ${n}`, form: 'flachdach',
      positionX: 0, positionY: (i % 2 === 0 ? 1 : -1) * (base.width / 2 + 2),
      length: base.length, width: 3, ridgeHeight: base.eavesHeight, eavesHeight: Math.max(2.5, base.eavesHeight - 0.5),
      pitch: 0, ridgeDirection: 'x', confidence: 0.5, notes: 'Aus Plan-Hinweis ergänzt' });
  }
  if (target > kiVordach) log.push(`${target - kiVordach} Vordach/Vordächer ergänzt`);

  // 4+5. Neigung + Vordach-Kappung → ReconciledPart
  const reconciled: ReconciledPart[] = parts.map((rp, idx) => {
    const a = arbitratePitch(rp, dnMarkers);
    let pitch = a.pitch, form = a.form, source = a.source;
    if (pitch <= 5 && form !== 'flachdach') form = 'flachdach';
    const isCanopy = rp.kind === 'vordach' || rp.kind === 'carport';
    if (isCanopy && pitch > 15) { pitch = 5; form = 'flachdach'; source = `Vordach flach gekappt (war ${a.pitch}°)`; a.uncertain = true; }
    const label = rp.label || `Dachteil ${idx + 1}`;
    if (a.uncertain) uncertain.push(label);
    return {
      id: rp.id || `part_${idx}`, kind: rp.kind || 'main', label, form,
      positionX: rp.positionX ?? 0, positionY: rp.positionY ?? 0,
      length: L(rp), width: W(rp), ridgeHeight: RH(rp), eavesHeight: EH(rp),
      pitch, ridgeDirection: rp.ridgeDirection ?? rp.geometry?.ridgeDirection ?? 'x',
      confidence: rp.confidence ?? 0.5, _pitchSource: source, notes: rp.notes,
    };
  });

  // 6. Dedup + genau ein Hauptdach
  const final = dedupeParts(reconciled);
  log.push(`${reconciled.length} → ${final.length} Dachteil(e) nach Dedup`);
  return { parts: final, uncertain, log };
}
