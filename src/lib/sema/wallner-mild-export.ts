/**
 * Statik-Austausch-CSV Export für Wallner-Mild / BTS Holzbau / Statik4U.
 *
 * Da das proprietäre Wallner-Mild-Format nicht öffentlich ist, exportieren wir
 * ein universelles Statik-CSV mit Sektions-Trennern (###), das alle gängigen
 * österr. Holzbau-Statik-Programme via Spalten-Mapping importieren können.
 *
 * Sektionen:
 *   ### PROJEKT ###    – Name, Adresse, Schneezone, Windzone, Seehöhe
 *   ### LASTEN ###     – Typ, Wert, Quelle, Konfidenz
 *   ### BAUTEILE ###   – Querschnitt, Material, Länge, Ausnutzung, …
 *   ### STOESSE ###    – Stoßstellen-Position pro Bauteil
 */

import type { Project, TimberMember, LoadCase } from '@/types/project';

// ─── Optionen ─────────────────────────────────────────────────────────────────

export interface StatikCSVOptions {
  separator?: ';' | ',';    // Wallner-Mild bevorzugt Semikolon
  decimal?:   ',' | '.';
  encoding?:  'utf-8' | 'iso-8859-1';
}

const DEFAULTS: Required<StatikCSVOptions> = {
  separator: ';',
  decimal:   ',',
  encoding:  'utf-8',
};

// ─── Helfer ───────────────────────────────────────────────────────────────────

function d(value: number, opts: Required<StatikCSVOptions>, digits = 2): string {
  const s = value.toFixed(digits);
  return opts.decimal === ',' ? s.replace('.', ',') : s;
}

function q(s: string, sep: string): string {
  // Quote wenn Komma/Semikolon/Newline enthalten
  if (s.includes(sep) || s.includes('\n') || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cols: string[], sep: string): string {
  return cols.map(c => q(c, sep)).join(sep);
}

/** Materialklasse nach EN 1995 Festigkeitsklasse */
function materialClass(material: string): string {
  const m = material.toLowerCase();
  if (m.includes('gl28'))         return 'GL28h';
  if (m.includes('gl24') || m.includes('bsh') || m.includes('glulam')) return 'GL24h';
  if (m.includes('c30'))          return 'C30';
  if (m.includes('c16'))          return 'C16';
  if (m.includes('c20'))          return 'C20';
  return 'C24';
}

/** Nutzungsklasse 1 (innen/trocken), 2 (außen/überdacht), 3 (feucht) */
function nutzungsklasse(type: TimberMember['type']): string {
  switch (type) {
    case 'sparren': return 'NK2';
    case 'pfette':  return 'NK2';
    default:        return 'NK1';
  }
}

/** Schnittgrößen-Schätzung aus Bauteilgeometrie + Lasten (vereinfacht) */
function estimateInternalForces(
  m: TimberMember,
  qk: number,  // kN/m² Schnee
  gk: number,  // kN/m² Eigengewicht
): { M_kNm: number; V_kN: number; R_kN: number } {
  const L = m.length;         // m
  const b = m.width  / 1000;  // m
  const spacing = m.type === 'sparren' ? 0.9 : 1.2; // Sparrenabstand schätzweise

  // Linienlast q = (gk + qk) × Einzugsbreite
  const q = (gk + qk) * spacing;  // kN/m
  const M_kNm = (q * L * L) / 8;
  const V_kN  = q * L / 2;
  const R_kN  = V_kN;  // Auflagerkraft = Querkraft am Auflager

  return { M_kNm, V_kN, R_kN };
}

/** Grobe Ausnutzungsschätzung auf Biegung (η = M / Wres×fm) */
function estimateUtilization(
  m: TimberMember,
  M_kNm: number,
  matCls: string,
): number {
  const b = m.width  / 1000;
  const h = m.height / 1000;
  const W = (b * h * h) / 6;   // m³

  // Charakteristische Biegefestigkeit (MPa = kN/m²×1000)
  const fm_map: Record<string, number> = {
    'C16': 16000, 'C20': 20000, 'C24': 24000, 'C30': 30000,
    'GL24h': 24000, 'GL28h': 28000,
  };
  const fm = fm_map[matCls] ?? 24000;  // kN/m²
  const kmod = 0.8;                    // NKL2, mittelfristig
  const gamma_m = 1.3;

  const fd = fm * kmod / gamma_m;      // kN/m²
  const sigma = M_kNm / W;             // kN/m²
  return Math.min(sigma / fd, 9.99);
}

// ─── Sektions-Builder ─────────────────────────────────────────────────────────

function buildProjektSection(project: Project, opts: Required<StatikCSVOptions>): string {
  const s = opts.separator;
  const geo = project.geometry;
  const addr = project.address;
  const loads = project.loadCases ?? [];
  const snowLoad = loads.find(l => l.type === 'snow');
  const windLoad = loads.find(l => l.type === 'wind');

  const lines: string[] = [
    '### PROJEKT ###',
    row(['Feld', 'Wert'], s),
    row(['Projektname', project.name], s),
    row(['Adresse', addr ? `${addr.street} ${addr.houseNumber}, ${addr.postalCode} ${addr.city}` : ''], s),
    row(['Bundesland', addr?.state ?? ''], s),
    row(['Seehöhe_m', addr?.elevation != null ? d(addr.elevation, opts, 0) : ''], s),
    row(['Geländekategorie', addr?.terrainCategory ?? ''], s),
    row(['Schneezone', snowLoad?.parameters?.zone?.toString() ?? ''], s),
    row(['Schneelast_sk_kN_m2', snowLoad ? d(snowLoad.value, opts) : ''], s),
    row(['Windzone', windLoad?.parameters?.zone?.toString() ?? ''], s),
    row(['Windlast_qp_kN_m2', windLoad ? d(windLoad.value, opts) : ''], s),
    row(['Dachform', project.roofType?.form ?? ''], s),
    row(['Dachlänge_m', geo ? d(geo.length.value, opts) : ''], s),
    row(['Dachbreite_m', geo ? d(geo.width.value, opts) : ''], s),
    row(['Firsthöhe_m', geo ? d(geo.ridgeHeight.value, opts) : ''], s),
    row(['Traufhöhe_m', geo ? d(geo.eavesHeight.value, opts) : ''], s),
    row(['Dachneigung_Grad', geo ? d(geo.roofPitch.value, opts, 1) : ''], s),
    '',
  ];
  return lines.join('\n');
}

function buildLastenSection(loadCases: LoadCase[], opts: Required<StatikCSVOptions>): string {
  const s = opts.separator;
  const lines: string[] = [
    '### LASTEN ###',
    row(['ID', 'Bezeichnung', 'Typ', 'Wert_kN_m2', 'Einheit', 'Quelle', 'Konfidenz_pct', 'Bemerkung'], s),
  ];
  for (const lc of loadCases) {
    lines.push(row([
      lc.id,
      lc.name,
      lc.type,
      d(lc.value, opts),
      lc.unit,
      lc.source,
      d(lc.confidence * 100, opts, 0),
      lc.userModified ? 'Manuell angepasst' : '',
    ], s));
  }
  lines.push('');
  return lines.join('\n');
}

function buildBauteileSection(
  members: TimberMember[],
  loadCases: LoadCase[],
  opts: Required<StatikCSVOptions>,
): string {
  const s = opts.separator;

  const snowLoad = loadCases.find(l => l.type === 'snow')?.value ?? 1.5;
  const gk       = loadCases.find(l => l.type === 'permanent')?.value ?? 0.5;

  const lines: string[] = [
    '### BAUTEILE ###',
    row([
      'ID', 'Bezeichnung', 'Typ', 'Nutzungsklasse', 'Materialklasse',
      'b_mm', 'h_mm', 'L_m', 'Querschnitt', 'Anzahl',
      'Vol_m3_gesamt',
      'M_kNm', 'V_kN', 'R_Auflager_kN',
      'Ausnutzung_eta', 'Status',
      'Hinweise',
    ], s),
  ];

  for (const m of members) {
    const matCls = materialClass(m.material);
    const nkl    = nutzungsklasse(m.type);
    const vol    = (m.width / 1000) * (m.height / 1000) * m.length * m.quantity;

    const { M_kNm, V_kN, R_kN } = estimateInternalForces(m, snowLoad, gk);
    const eta = estimateUtilization(m, M_kNm, matCls);

    const status = eta > 1.0 ? 'ÜBERLASTET' : eta > 0.85 ? 'KNAPP' : 'OK';
    const hint   = m.calculationStatus === 'red'
      ? 'Querschnitt zu klein – vergrößern!'
      : eta > 0.85 ? 'Nachweis kritisch – prüfen'
      : '';

    lines.push(row([
      m.id,
      m.name,
      m.type,
      nkl,
      matCls,
      m.width.toFixed(0),
      m.height.toFixed(0),
      d(m.length, opts),
      m.crossSection || `${m.width}/${m.height}`,
      m.quantity.toFixed(0),
      d(vol, opts, 3),
      d(M_kNm, opts),
      d(V_kN, opts),
      d(R_kN, opts),
      d(eta, opts, 2),
      status,
      hint,
    ], s));
  }
  lines.push('');
  return lines.join('\n');
}

function buildStoesseSection(members: TimberMember[], opts: Required<StatikCSVOptions>): string {
  const s = opts.separator;
  const lines: string[] = [
    '### STOESSE ###',
    row(['Bauteil_ID', 'Bezeichnung', 'Position_m', 'Typ', 'Hinweis'], s),
  ];

  const MAX_KVH = 13.0;
  const MAX_BSH = 18.0;

  for (const m of members) {
    const matCls = materialClass(m.material);
    const isBSH  = matCls.startsWith('GL');
    const maxLen = isBSH ? MAX_BSH : MAX_KVH;

    if (m.length > maxLen) {
      const nJoints = Math.ceil(m.length / maxLen) - 1;
      const interval = m.length / (nJoints + 1);
      for (let i = 1; i <= nJoints; i++) {
        lines.push(row([
          m.id,
          m.name,
          d(i * interval, opts),
          isBSH ? 'Keilzinkstoß BSH' : 'Keilzinkstoß KVH',
          `Länge ${d(m.length, opts)} m > max ${d(maxLen, opts)} m — Stoß erforderlich`,
        ], s));
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Erzeugt Statik-Austausch-CSV für Wallner-Mild, BTS Holzbau, Statik4U.
 *
 * Sektionen mit "###"-Trennern, damit der Empfänger gezielt parsen kann.
 * Excel kann die Datei direkt öffnen (Semikolon-getrennt, UTF-8 mit BOM).
 */
export function exportStatikCSV(
  project: Project,
  members: TimberMember[],
  loadCases: LoadCase[],
  opts?: StatikCSVOptions,
): string {
  const o: Required<StatikCSVOptions> = { ...DEFAULTS, ...opts };

  const head = [
    `# Statik-Austausch-CSV`,
    `# Erstellt: ${new Date().toLocaleString('de-AT')}`,
    `# Software: Dachplan-Assistent v1.0`,
    `# Format: Sektionen mit ### ... ### Trennern, Felder ${o.separator}-getrennt`,
    `# Kompatibel: Wallner-Mild, BTS Holzbau, Statik4U (Spalten-Mapping nötig)`,
    '',
  ].join('\n');

  const body = [
    buildProjektSection(project, o),
    buildLastenSection(loadCases, o),
    buildBauteileSection(members, loadCases, o),
    buildStoesseSection(members, o),
  ].join('\n');

  // UTF-8 BOM für Excel-Direktöffnung
  const bom = o.encoding === 'utf-8' ? '﻿' : '';
  return bom + head + body;
}

/**
 * Startet Browser-Download der Statik-CSV.
 */
export function downloadStatikCSV(
  project: Project,
  members: TimberMember[],
  loadCases: LoadCase[],
  opts?: StatikCSVOptions,
): void {
  const content = exportStatikCSV(project, members, loadCases, opts);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${project.name.replace(/[^a-zA-Z0-9-]/g, '_')}_statik_wallner_mild.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
