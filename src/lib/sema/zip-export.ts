/**
 * ZIP-Export: Packt alle Projektdateien (IFC, DXF, BTL, CSV, PDFs) in ein ZIP.
 */

import JSZip from 'jszip';
import type { Project, TimberMember } from '@/types/project';
import { exportToIFC4, exportToIFC2x3 } from './ifc-export';
import { exportToDXF } from './dxf-export';
import { exportStatikCSV } from './wallner-mild-export';

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface ZipInput {
  project: Project;
  members: TimberMember[];
  pdfBlobs?: { name: string; blob: Blob }[];  // Bestehende PDF-Pläne aus Storage
  reportPdf?: Blob;                             // Generierter Vorbemessungs-Bericht
  csvBill?: string;                             // Bestellliste CSV
  btl?: string;                                 // BTL/BTLX-Export
}

// ─── README ───────────────────────────────────────────────────────────────────

function buildReadme(project: Project, input: ZipInput): string {
  const lines: string[] = [
    `Projekt: ${project.name}`,
    `Erstellt: ${new Date().toLocaleString('de-AT')}`,
    `Dachplan-Assistent v1.0`,
    '',
    '════════════════════════════════════════',
    'INHALT DIESES ZIP-ARCHIVS',
    '════════════════════════════════════════',
    '',
    'model_ifc4.ifc',
    '  BIM-Modell (IFC4) für SEMA 19+, Allplan, Revit.',
    '  Außenwände importierbar als IfcWallStandardCase (4 Wände, Material Mauerwerk).',
    '  Import in SEMA: Datei → Import → IFC-Datei wählen.',
    '  Import in Allplan/Revit: Datei → Öffnen → IFC.',
    '',
    'model_ifc2x3.ifc',
    '  BIM-Modell (IFC2x3) für SEMA 12-18, AutoCAD Architecture, ArchiCAD.',
    '  Außenwände importierbar als IfcWallStandardCase (4 Wände, Material Mauerwerk).',
    '  Import in SEMA 12+: Datei → Import → IFC-Datei wählen.',
    '',
    'statik_wallner_mild.csv',
    '  Statik-Austausch-CSV für Wallner-Mild, BTS Holzbau, Statik4U.',
    '  In Excel öffnen: Datei → Öffnen → CSV (Semikolon-getrennt).',
    '',
    'model.dxf',
    '  3D-Geometrie (DXF R12 ASCII) mit SEMA-konformen Layern und 3DFACE-Solids.',
    '  Außenwände als 3DFACE auf Layer 900_WAENDE.',
    '  Schnittlinien A-A (Querschnitt) und B-B (Längsschnitt) als eigene Layer.',
    '  Import in AutoCAD / SEMA / Allplan: Datei → Öffnen → DXF.',
    '',
  ];

  if (input.btl) {
    lines.push('machine.btlx');
    lines.push('  CNC-Abbunddaten (BTLX 2.2) für Hundegger Cambium / PrIO.');
    lines.push('  Import in Cambium: Datei → Öffnen → BTLX-Datei.');
    lines.push('');
  }

  if (input.csvBill) {
    lines.push('bestellliste.csv');
    lines.push('  Materialliste als CSV (Excel-kompatibel, Semikolon-getrennt).');
    lines.push('');
  }

  if (input.reportPdf) {
    lines.push('vorbemessung.pdf');
    lines.push('  Statische Vorbemessung und Tragwerks-Analyse.');
    lines.push('');
  }

  if (input.pdfBlobs && input.pdfBlobs.length > 0) {
    lines.push(`plaene/ (${input.pdfBlobs.length} Datei(en))`);
    lines.push('  Originale Baupläne und Dokumente aus dem Projekt.');
    for (const p of input.pdfBlobs) {
      lines.push(`  - ${p.name}`);
    }
    lines.push('');
  }

  lines.push('════════════════════════════════════════');
  lines.push('SEMA IMPORT-ANLEITUNG');
  lines.push('════════════════════════════════════════');
  lines.push('');
  lines.push('1. IFC-Import SEMA 19+ (IFC4):');
  lines.push('   SEMA öffnen → Datei → Import → IFC-Datei auswählen → model_ifc4.ifc');
  lines.push('');
  lines.push('2. IFC-Import SEMA 12-18 (IFC2x3):');
  lines.push('   SEMA öffnen → Datei → Import → IFC-Datei auswählen → model_ifc2x3.ifc');
  lines.push('');
  lines.push('3. DXF-Import (3D-Referenz, universell):');
  lines.push('   SEMA / AutoCAD → Datei → Import → DXF/DWG → model.dxf');
  lines.push('');
  lines.push('4. Statik-Import (Wallner-Mild / BTS Holzbau):');
  lines.push('   Statik-Software → Import → CSV → statik_wallner_mild.csv');
  lines.push('   (Spalten-Mapping je nach Software erforderlich)');
  lines.push('');
  lines.push('5. CNC-Export (Hundegger):');
  lines.push('   Hundegger Cambium → Datei → Öffnen → machine.btlx');

  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Baut ein vollständiges Projekt-ZIP und gibt es als Blob zurück.
 */
export async function buildProjectZip(input: ZipInput): Promise<Blob> {
  const { project, members } = input;
  const zip = new JSZip();

  // README
  zip.file('README.txt', buildReadme(project, input));

  // IFC (beide Versionen) + DXF + Statik-CSV (immer vorhanden)
  zip.file('model_ifc4.ifc', exportToIFC4(project, members));
  zip.file('model_ifc2x3.ifc', exportToIFC2x3(project, members));
  zip.file('model.dxf', exportToDXF(project, members));
  zip.file('statik_wallner_mild.csv', exportStatikCSV(project, members, project.loadCases ?? []));

  // CNC-Abbund
  if (input.btl) {
    zip.file('machine.btlx', input.btl);
  }

  // Bestellliste
  if (input.csvBill) {
    zip.file('bestellliste.csv', input.csvBill);
  }

  // Vorbemessungs-PDF
  if (input.reportPdf) {
    zip.file('vorbemessung.pdf', input.reportPdf);
  }

  // Original-Pläne
  if (input.pdfBlobs && input.pdfBlobs.length > 0) {
    const planFolder = zip.folder('plaene');
    for (const pdf of input.pdfBlobs) {
      planFolder?.file(pdf.name, pdf.blob);
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/**
 * Startet Browser-Download eines ZIP-Blobs.
 */
export function downloadZip(blob: Blob, projectName: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = `${projectName.replace(/[^a-zA-Z0-9-]/g, '_')}_komplett.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
