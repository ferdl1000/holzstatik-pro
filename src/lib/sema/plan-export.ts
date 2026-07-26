/**
 * plan-export.ts — Die Zeichnungen, die am Bildschirm stehen, als Dateien.
 *
 * Bisher enthielt das Projekt-ZIP nur das 3D-Modell (IFC/DXF). Die Schnitte und
 * Abbundpläne, mit denen der Zimmerer tatsächlich arbeitet, fehlten. Genau die
 * braucht es aber, damit sich ein fertiges Projekt in SEMA übernehmen und auf
 * der Baustelle ausdrucken lässt.
 *
 * Erzeugt wird für jede Zeichnung eine eigenständige SVG-Datei (maßstäblich,
 * druckbar, in jedem Browser und CAD als Referenz zu öffnen).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BuildingGeometry, TimberMember } from '@/types/project';
import { Querschnitt, Laengsschnitt, DetailTraufe } from '@/components/project/SchnittViews';
import { AbbundDetails } from '@/components/project/AbbundDetails';

export interface PlanExportInput {
  geometry: BuildingGeometry;
  roofForm: string;
  members: TimberMember[];
  coveringName?: string;
  roofOverhang?: number;
}

export interface ExportierteZeichnung {
  /** Dateiname inkl. Endung, z.B. "schnitt_quer.svg" */
  name: string;
  /** Vollständiges SVG-Dokument */
  svg: string;
  /** Klartext für die README */
  beschreibung: string;
}

/** Hüllt das gerenderte SVG in ein eigenständiges Dokument mit XML-Kopf. */
function alsDokument(markup: string): string {
  const mitNamespace = markup.includes('xmlns=')
    ? markup
    : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${mitNamespace}\n`;
}

/** Dateinamen-tauglicher Bauteilname ("Sparren S1-S32" → "sparren_s1-s32"). */
function dateiName(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Rendert alle Zeichnungen des Projekts als SVG-Dateien:
 * Querschnitt, Längsschnitt, Detail Traufe und je einen Abbundplan pro
 * Bauteiltyp (Sparren, Pfette, Mauerbank, Steher, Kehlbalken, Leimbinder).
 */
export function exportPlanZeichnungen(input: PlanExportInput): ExportierteZeichnung[] {
  const { geometry, roofForm, members, coveringName, roofOverhang } = input;
  const out: ExportierteZeichnung[] = [];
  const pitch = geometry.roofPitch?.value ?? 30;

  const schnitte: [string, unknown, string][] = [
    ['schnitt_quer.svg',
      createElement(Querschnitt, { geometry, members, coveringName, roofForm, roofOverhang }),
      'Querschnitt A-A durch das Gespärre, senkrecht zum First. Mit Dachaufbau, Bemaßung und Dachüberstand.'],
    ['schnitt_laengs.svg',
      createElement(Laengsschnitt, { geometry, members }),
      'Längsschnitt B-B parallel zum First. Zeigt Pfetten, Auflager und — falls vorhanden — die Steher.'],
    ['detail_traufe.svg',
      createElement(DetailTraufe, { geometry, members, roofOverhang }),
      'Traufdetail im Maßstab: Mauerkrone (bauseits, grau), Mauerbank, Sparren mit Kerve, Kaltdach-Aufbau und Überstand.'],
  ];

  for (const [name, element, beschreibung] of schnitte) {
    try {
      out.push({ name, svg: alsDokument(renderToStaticMarkup(element as never)), beschreibung });
    } catch {
      // Eine Zeichnung, die nicht gerendert werden kann, darf den ganzen
      // Export nicht verhindern — die übrigen Dateien sind trotzdem brauchbar.
    }
  }

  // Abbundpläne: einer je Bauteiltyp, nicht je Einzelstück
  const gesehen = new Set<string>();
  for (const m of members) {
    if (gesehen.has(m.type)) continue;
    gesehen.add(m.type);
    try {
      const svg = renderToStaticMarkup(
        createElement(AbbundDetails, {
          member: m,
          roofPitchDeg: pitch,
          geom: {
            buildingWidth: geometry.width?.value ?? 8,
            overhang: roofOverhang ?? 0.4,
            hasMittelpfette: members.some(x => x.type === 'pfette' && /mittel/i.test(x.name)),
          },
        }) as never,
      );
      out.push({
        name: `abbund_${dateiName(m.name)}.svg`,
        svg: alsDokument(svg),
        beschreibung: `Abbundplan ${m.name} (${m.crossSection ?? `${m.width}/${m.height}`}) — Schnitte, Kerven und Maße für den Zuschnitt.`,
      });
    } catch {
      /* einzelner Abbundplan nicht darstellbar → überspringen */
    }
  }

  return out;
}
