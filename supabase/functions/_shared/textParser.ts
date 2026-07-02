/**
 * Deterministischer Text-Parser für Plan-Rohtext.
 *
 * KERN-IDEE: Statt die KI bitten, alles strukturiert zu liefern (nicht-deterministisch),
 * lassen wir die KI NUR den rohen Text extrahieren (einfache Aufgabe, zuverlässig)
 * und ziehen die harten Fakten (Dachneigung, Maße, Eindeckung, Adressen) per Regex
 * deterministisch heraus. Diese Werte sind IMMER gleich — egal wie gut die KI drauf ist.
 *
 * Quelle der Regeln: PLAN_ERKENNUNG.md
 */

export interface ParsedFacts {
  dnMarkers: { value: number; raw: string; source: 'DN' | 'Dachneigung' | 'Gefälle%' | 'Grad' }[];
  dimensions: { value: number; label: string; raw: string }[];
  coveringHints: { type: string; raw: string }[];
  ueberdachungCount: number;
  ueberdachungLabels: string[];
  ceilingHints: { area: number; raw: string; constructionType: 'holzbalkendecke' | 'stb_decke' | 'unbekannt' }[];
  aufbautenCodes: { code: string; line: string }[];
  postalCodes: string[];
  fireProtection: { gk?: string; reiClasses: string[] };
  wallHints: { type: string; thickness?: number; raw: string }[];
  structureHints: string[];
  /** Sparrenabstand in m, direkt aus dem Plan gelesen (z.B. "e = 80 cm") — null wenn nicht angegeben */
  sparrenSpacing: number | null;
  /** Im Plan beschriftete Holzquerschnitte je Bauteiltyp, z.B. "Sparren 8/16" → {member:'sparren', b:80, h:160} */
  memberSections: { member: 'sparren' | 'pfette' | 'stuetze' | 'kehlbalken'; b: number; h: number; raw: string }[];
}

/** Wandelt "10", "10,5", "10.5" → number */
function num(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

/**
 * Findet alle Dachneigungs-Angaben im Text.
 * Reihenfolge nach Spezifität: "DN 10°", "Dachneigung 5°", "DN = 22°", "X% Gefälle".
 */
export function parseDachneigung(text: string): ParsedFacts['dnMarkers'] {
  const markers: ParsedFacts['dnMarkers'] = [];
  const seen = new Set<string>();

  // "DN 10°", "DN=22°", "DN = 10 °", "DN10°"
  const dnRe = /DN\s*=?\s*(\d{1,2}(?:[.,]\d+)?)\s*°/gi;
  let m: RegExpExecArray | null;
  while ((m = dnRe.exec(text)) !== null) {
    const v = num(m[1]);
    if (v >= 0 && v <= 75) {
      const key = `DN-${v}`;
      if (!seen.has(key)) { seen.add(key); markers.push({ value: v, raw: m[0], source: 'DN' }); }
    }
  }

  // "Dachneigung 5°", "Dachneigung: 35°", "Dachneigung von 22 Grad"
  // °-Variante zuerst (bevorzugt). ° darf auch OCR-mangled sein (º, ∘, o, Grad).
  const dnWordRe = /Dachneigung\s*:?\s*(?:von\s*)?(\d{1,2}(?:[.,]\d+)?)\s*(?:°|º|∘|Grad)/gi;
  while ((m = dnWordRe.exec(text)) !== null) {
    const v = num(m[1]);
    if (v >= 0 && v <= 75) {
      const key = `DN-${v}`;
      if (!seen.has(key)) { seen.add(key); markers.push({ value: v, raw: m[0], source: 'Dachneigung' }); }
    }
  }

  // Fallback OHNE Gradsymbol: "Dachneigung 5" / "DN 10" — auf gescannten/OCR-Plänen
  // geht das °-Zeichen oft verloren. Das Wort "Dachneigung"/"DN" macht die Gradzahl
  // eindeutig. Konservativ: 1–60°. Ausschluss NUR bei direkt anschließender Ziffer
  // (z.B. "DN 1058" → nicht "10") ODER direkt folgender Einheit (cm/mm/m/% = Nennweite).
  // Leerzeichen-getrennter Folgetext (z.B. "DN 10  STALL" oder "DN 10 DN 15") ist erlaubt
  // — wichtig für verrauschten OCR-Text.
  const dnNoDegRe = /(?:Dachneigung|DN)\s*[:=]?\s*(?:von\s*)?(\d{1,2}(?:[.,]\d+)?)(?![.,]?\d|\s*(?:cm|mm|m\b|%|°|º|∘|Grad))/gi;
  while ((m = dnNoDegRe.exec(text)) !== null) {
    const v = num(m[1]);
    if (v >= 1 && v <= 60) {
      const key = `DN-${v}`;
      if (!seen.has(key)) { seen.add(key); markers.push({ value: v, raw: m[0].trim(), source: 'Dachneigung' }); }
    }
  }

  // "X% Gefälle" → Grad: arctan(%/100)
  const gefaelleRe = /(\d{1,2}(?:[.,]\d+)?)\s*%\s*Gefälle/gi;
  while ((m = gefaelleRe.exec(text)) !== null) {
    const pct = num(m[1]);
    const grad = Math.round(Math.atan(pct / 100) * 180 / Math.PI * 10) / 10;
    const key = `G-${grad}`;
    if (!seen.has(key)) { seen.add(key); markers.push({ value: grad, raw: m[0], source: 'Gefälle%' }); }
  }

  return markers;
}

/**
 * Findet Gebäude-Hauptmaße. Sucht nach beschrifteten Maßen.
 */
export function parseDimensions(text: string): ParsedFacts['dimensions'] {
  const dims: ParsedFacts['dimensions'] = [];

  const patterns: { label: string; re: RegExp }[] = [
    { label: 'Gebäudelänge', re: /(?:Gebäudelänge|Länge|Geb\.?-?länge)\s*:?\s*(\d{1,3}(?:[.,]\d+)?)\s*m\b/gi },
    { label: 'Gebäudebreite', re: /(?:Gebäudebreite|Breite|Geb\.?-?breite)\s*:?\s*(\d{1,3}(?:[.,]\d+)?)\s*m\b/gi },
    { label: 'Firsthöhe', re: /(?:Firsthöhe|First|FH)\s*:?\s*\+?(\d{1,2}(?:[.,]\d+)?)\s*m?\b/gi },
    { label: 'Traufhöhe', re: /(?:Traufhöhe|Traufe|TH)\s*:?\s*\+?(\d{1,2}(?:[.,]\d+)?)\s*m?\b/gi },
    { label: 'Spannweite', re: /(?:Spannweite|lichte\s+Weite|Stützweite)\s*:?\s*(\d{1,2}(?:[.,]\d+)?)\s*m\b/gi },
  ];

  for (const { label, re } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const v = num(m[1]);
      if (v > 0 && v < 200) dims.push({ value: v, label, raw: m[0] });
    }
  }

  // FALLBACK für Scan-/OCR-Pläne: dort stehen Maße OHNE Beschriftung verstreut
  // ("8,00m", "23,0 m", "3,50m"). Diese als unbeschriftete Gebäude-Maße sammeln,
  // damit die Geometrie-Ableitung etwas hat. Nur plausible Bau-Maße mit Dezimalstelle
  // (vermeidet z.B. Rohr-Nennweiten "DN150" oder ganze Stückzahlen).
  const bareRe = /(?<![\d.,])(\d{1,2}[.,]\d{1,3})\s*m\b/g;
  let bm: RegExpExecArray | null;
  const seenBare = new Set<number>(dims.map(d => Math.round(d.value * 100) / 100)); // bereits beschriftet erfasste überspringen
  while ((bm = bareRe.exec(text)) !== null) {
    const v = num(bm[1]);
    // Gebäude-Maße: 1–60 m. Kleinkram (<1 m, Bauteilstärken) und Unsinn raus.
    if (v >= 1 && v <= 60) {
      const rounded = Math.round(v * 100) / 100;
      if (!seenBare.has(rounded)) { seenBare.add(rounded); dims.push({ value: rounded, label: 'Maß', raw: bm[0].trim() }); }
    }
  }

  return dims;
}

/**
 * Eindeckung aus Text — sucht nach Material-Schlagwörtern.
 * Quelle: PLAN_ERKENNUNG.md Abschnitt 3.
 */
export function parseCovering(text: string): ParsedFacts['coveringHints'] {
  const hints: ParsedFacts['coveringHints'] = [];
  const t = text.toLowerCase();
  const map: { type: string; words: string[] }[] = [
    { type: 'trapezblech', words: ['trapezblech', 'trapez blech'] },
    { type: 'sandwich_paneel', words: ['dachpaneel', 'sandwichpaneel', 'sandwich-paneel', 'sandwich paneel'] },
    { type: 'metal_falz', words: ['stehfalz', 'doppelstehfalz', 'falzblech'] },
    { type: 'tile_clay', words: ['tondachziegel', 'dachziegel', 'falzziegel', 'scharren', 'tonziegel'] },
    { type: 'tile_concrete', words: ['betondachstein', 'betonstein', 'frankfurter pfanne'] },
    { type: 'schiefer', words: ['naturschiefer', 'schiefer'] },
    { type: 'bitumen', words: ['bitumen', 'schweißbahn', 'schweissbahn'] },
    { type: 'gruendach_ext', words: ['gründach extensiv', 'gruendach extensiv'] },
    { type: 'gruendach_int', words: ['gründach intensiv', 'gruendach intensiv'] },
  ];
  for (const { type, words } of map) {
    for (const w of words) {
      const idx = t.indexOf(w);
      if (idx >= 0) {
        // Kontext: 20 Zeichen drumrum als raw
        hints.push({ type, raw: text.slice(Math.max(0, idx - 5), idx + w.length + 10).trim() });
        break;
      }
    }
  }
  return hints;
}

/** Zählt ÜBERDACHUNG / VORDACHKANTE / Vordach / Carport. */
export function parseUeberdachung(text: string): { count: number; labels: string[] } {
  const labels: string[] = [];
  const patterns = [
    /ÜBERDACHUNG[^\n]{0,30}/gi,
    /VORDACHKANTE[- ]?(?:SATTELDACH|FLACHDACH|PULTDACH)?/gi,
    /\bVordach\b[^\n]{0,20}/gi,
    /\bTordach\b/gi,
    /\bCarport\b/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      labels.push(m[0].trim());
    }
  }
  // Dedup ähnlicher Labels (ÜBERDACHUNG kann mehrfach für gleiche stehen)
  const unique = [...new Set(labels.map(l => l.replace(/\s+/g, ' ').trim()))];
  return { count: unique.length, labels: unique };
}

/** Holzbalkendecke vs STB-Decke. */
export function parseCeilings(text: string): ParsedFacts['ceilingHints'] {
  const hints: ParsedFacts['ceilingHints'] = [];

  // "180,50 m² Holzboden" / "Holzbalkendecke" / "Holzdecke"
  const holzRe = /(\d{1,4}(?:[.,]\d+)?)\s*m²?\s*(?:Holzboden|Holzbalkendecke|Holzdecke)/gi;
  let m: RegExpExecArray | null;
  while ((m = holzRe.exec(text)) !== null) {
    hints.push({ area: num(m[1]), raw: m[0], constructionType: 'holzbalkendecke' });
  }
  // generisch "Holzboden X" auch ohne m²
  if (hints.length === 0 && /Holzboden|Holzbalkendecke/i.test(text)) {
    hints.push({ area: 0, raw: 'Holzboden (Fläche unklar)', constructionType: 'holzbalkendecke' });
  }
  // STB-Decke erkennen (nur als Hinweis, nicht im Holzauszug)
  if (/STB[- ]?Decke|Stahlbetondecke|Massivdecke|Filigrandecke/i.test(text)) {
    hints.push({ area: 0, raw: 'STB-Decke (nicht im Holzauszug)', constructionType: 'stb_decke' });
  }
  return hints;
}

/** Aufbauten-Codes (B1, D1, 06, 09, ...). */
export function parseAufbautenCodes(text: string): ParsedFacts['aufbautenCodes'] {
  const codes: ParsedFacts['aufbautenCodes'] = [];
  // Zeilen-basiert: Code am Zeilenanfang
  const lines = text.split(/[\n\r]+/);
  for (const line of lines) {
    const t = line.trim();
    // "D1 - Dachaufbau" / "06 Dachkonstruktion" / "B2 Bodenaufbau"
    const m = t.match(/^([BDWKF]\d{1,2}|0\d|1[0-9])\s*[-–.:)]?\s*(\S.{2,})/);
    if (m && /aufbau|konstruktion|dach|wand|boden|decke|fundament|terrasse|eindeckung/i.test(t)) {
      codes.push({ code: m[1], line: t });
    }
  }
  return codes;
}

/** Österreichische PLZ (4-stellig). */
export function parsePostalCodes(text: string): string[] {
  const re = /\b([1-9]\d{3})\b/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const plz = m[1];
    // AT-PLZ: 1000-9999, plausibel
    if (parseInt(plz) >= 1000 && parseInt(plz) <= 9999) found.add(plz);
  }
  return [...found];
}

/** GK + REI Brandschutz. */
export function parseFireProtection(text: string): ParsedFacts['fireProtection'] {
  const gkMatch = text.match(/\bGK\s*([1-5])\b|Gebäudeklasse\s*([1-5])/i);
  const gk = gkMatch ? `GK${gkMatch[1] || gkMatch[2]}` : undefined;
  const reiClasses: string[] = [];
  const reiRe = /\b(REI?\s*\d{2,3}(?:-[CMS]+)?|R\s*\d{2,3}|EI\s*\d{2,3}(?:-C)?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reiRe.exec(text)) !== null) {
    reiClasses.push(m[1].replace(/\s+/g, ' ').trim());
  }
  return { gk, reiClasses: [...new Set(reiClasses)] };
}

/** Wand-Konstruktion. */
export function parseWalls(text: string): ParsedFacts['wallHints'] {
  const hints: ParsedFacts['wallHints'] = [];
  const t = text;
  // "25 cm STB" / "25cm Stahlbeton"
  let m = t.match(/(\d{2})\s*cm\s*STB|(\d{2})\s*cm\s*Stahlbeton/i);
  if (m) hints.push({ type: 'stb', thickness: parseInt(m[1] || m[2]) * 10, raw: m[0] });
  // "38er Ziegel"
  m = t.match(/(\d{2})er\s*Ziegel|Ziegelmauerwerk\s*(\d{2})/i);
  if (m) hints.push({ type: 'ziegel', thickness: parseInt(m[1] || m[2]) * 10, raw: m[0] });
  // Holzständer / BSH-KVH-Wand
  if (/BSH\/KVH\s*Wand|Holzständerwand|Holzständer/i.test(t)) {
    hints.push({ type: 'holzstaender', thickness: 200, raw: 'BSH/KVH Wandkonstruktion' });
  }
  return hints;
}

/** Tragwerks-Hinweise (BSH, KVH, Sparren, etc.). */
export function parseStructure(text: string): string[] {
  const hints: string[] = [];
  const checks: { re: RegExp; label: string }[] = [
    { re: /BSH\s*Tragkonstruktion|BSH\/KVH\s*Tragkonstruktion/i, label: 'BSH-Tragkonstruktion' },
    { re: /Leimbinder|Brettschichtholz/i, label: 'Leimbinder/BSH' },
    { re: /Sparren\s*\d+\/\d+/i, label: 'Sparren-Bemaßung vorhanden' },
    { re: /Pfette/i, label: 'Pfetten erwähnt' },
    { re: /lt\.?\s*Statik|laut\s*Statik/i, label: 'Verweis auf Statik' },
    { re: /Stahlträger|IPE\s*\d+|HEA\s*\d+|HEB\s*\d+/i, label: 'Stahlträger' },
  ];
  for (const { re, label } of checks) {
    if (re.test(text)) hints.push(label);
  }
  return hints;
}

/**
 * Haupt-Parser: zieht ALLE harten Fakten aus dem Roh-Text.
 */
/**
 * Sparrenabstand aus dem Plan lesen. Übliche Schreibweisen österreichischer Pläne:
 *   "e = 80 cm", "e=90", "a = 0,80 m", "Sparrenabstand 80 cm", "Achsabstand 62,5 cm",
 *   "Sparren ... e=80cm". Plausibles Band 30–150 cm — alles außerhalb wird verworfen
 *   (sonst fängt man Bemaßungsketten oder Pfettenabstände ein).
 */
export function parseSparrenabstand(text: string): number | null {
  const candidates: number[] = [];
  const push = (v: number, unit: string | undefined) => {
    // Einheit erkennen: explizit m → ×100; explizit cm → direkt; ohne Einheit: <3 heißt m, sonst cm
    let cm = v;
    if (unit && /m\b/i.test(unit) && !/cm/i.test(unit)) cm = v * 100;
    else if (!unit && v < 3) cm = v * 100;
    if (cm >= 30 && cm <= 150) candidates.push(Math.round(cm * 10) / 10);
  };
  // "Sparrenabstand 80 cm" / "Achsabstand 62,5cm"
  const wordRe = /(?:sparren|achs)abstand\s*[:=]?\s*(\d{1,3}(?:[.,]\d+)?)\s*(cm|m)?/gi;
  // "e = 80 cm" / "a=0,80m" — nur mit Sparren-Kontext in der Nähe (±40 Zeichen), sonst zu viele Treffer
  const shortRe = /\b[ea]\s*=\s*(\d{1,3}(?:[.,]\d+)?)\s*(cm|m)?/gi;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) push(num(m[1]), m[2]);
  while ((m = shortRe.exec(text)) !== null) {
    const ctx = text.slice(Math.max(0, m.index - 40), m.index + 40);
    if (/sparren|spärren|rafter|lattung|konter/i.test(ctx)) push(num(m[1]), m[2]);
  }
  if (candidates.length === 0) return null;
  // Häufigster Wert gewinnt (Pläne wiederholen den Abstand oft mehrfach)
  const counts = new Map<number, number>();
  candidates.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return Math.round((best / 100) * 1000) / 1000; // → m
}

/**
 * Beschriftete Holzquerschnitte je Bauteiltyp: "Sparren 8/16", "Pfette 10/22 cm",
 * "Stütze 12/12", "Kehlbalken 8/16". cm-Angaben (Werte ≤ 40) → mm; mm-Angaben direkt.
 * Plausibles Band 60–400 mm je Seite.
 */
export function parseMemberSections(text: string): ParsedFacts['memberSections'] {
  const out: ParsedFacts['memberSections'] = [];
  const seen = new Set<string>();
  const re = /(sparren|pfette(?:n)?|stütze(?:n)?|steher|kehlbalken)\D{0,20}?(\d{1,3})\s*\/\s*(\d{1,3})\s*(cm|mm)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[1].toLowerCase();
    const member = word.startsWith('sparren') ? 'sparren'
      : word.startsWith('pfette') ? 'pfette'
      : word.startsWith('kehl') ? 'kehlbalken'
      : 'stuetze';
    let b = num(m[2]);
    let h = num(m[3]);
    const unit = m[4]?.toLowerCase();
    if (unit === 'cm' || (!unit && b <= 40 && h <= 40)) { b *= 10; h *= 10; }
    if (b < 60 || b > 400 || h < 60 || h > 400) continue;
    const key = `${member}:${b}/${h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ member, b, h, raw: m[0].trim() });
  }
  return out;
}

export function parseAllFacts(text: string): ParsedFacts {
  const ueber = parseUeberdachung(text);
  return {
    dnMarkers: parseDachneigung(text),
    dimensions: parseDimensions(text),
    coveringHints: parseCovering(text),
    ueberdachungCount: ueber.count,
    ueberdachungLabels: ueber.labels,
    ceilingHints: parseCeilings(text),
    aufbautenCodes: parseAufbautenCodes(text),
    postalCodes: parsePostalCodes(text),
    fireProtection: parseFireProtection(text),
    wallHints: parseWalls(text),
    structureHints: parseStructure(text),
    sparrenSpacing: parseSparrenabstand(text),
    memberSections: parseMemberSections(text),
  };
}
