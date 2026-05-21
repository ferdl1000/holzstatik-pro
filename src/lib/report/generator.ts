/**
 * PDF-Bericht-Generator.
 *
 * Erzeugt einen prüffähigen statischen Vorbemessungs-Bericht.
 * Inhalt:
 *  - Deckblatt mit Projektdaten
 *  - Inhaltsverzeichnis
 *  - Tragwerksbeschreibung
 *  - Lastannahmen (Schnee, Wind, Eigengewicht) mit Quellen + Erklärung
 *  - Materialkennwerte
 *  - Bauteil-Nachweise (jeder mit Formel, Eingangswerten, Ergebnis, Erklärung)
 *  - Auflagerreaktionen
 *  - Massenauszug + Kostenschätzung
 *  - Annahmen, Restrisiken, Audit-Trail
 *
 * Optionaler "Laien-Modus": Bericht in einfacher Sprache, weniger Formeln.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Project } from '@/types/project';
import type { CostEstimate } from '@/lib/pricing';
import type { BeamResult } from '@/lib/calc';

export interface ReportOptions {
  laymanMode?: boolean;
  includeFormulas?: boolean;
  includeAuditTrail?: boolean;
  includeCosts?: boolean;
  signingPerson?: string;
}

export function generateReport(
  project: Project,
  calcResults: BeamResult[] = [],
  costs?: CostEstimate,
  options: ReportOptions = {},
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const layman = options.laymanMode ?? false;
  const includeFormulas = options.includeFormulas ?? !layman;
  let y = 20;
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  // === Helpers ===
  const heading = (text: string, level: 1 | 2 | 3 = 1) => {
    checkPage(15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(level === 1 ? 18 : level === 2 ? 14 : 11);
    doc.text(text, margin, y);
    y += level === 1 ? 10 : level === 2 ? 8 : 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
  };
  const para = (text: string, fontSize = 10) => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, contentWidth);
    checkPage(lines.length * fontSize * 0.5);
    doc.text(lines, margin, y);
    y += lines.length * fontSize * 0.5 + 2;
  };
  const checkPage = (need: number) => {
    if (y + need > doc.internal.pageSize.height - 20) {
      doc.addPage();
      y = 20;
    }
  };
  const hr = () => {
    checkPage(5);
    doc.setDrawColor(180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  };
  const footer = () => {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Seite ${i} von ${total}`, pageWidth - margin, doc.internal.pageSize.height - 8, { align: 'right' });
      doc.text(`${project.name} — Vorbemessung`, margin, doc.internal.pageSize.height - 8);
      doc.setTextColor(0);
    }
  };

  // === Deckblatt ===
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('Statische Vorbemessung', margin, 50);
  doc.text('Dachtragwerk', margin, 62);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(project.name, margin, 78);
  doc.setFontSize(10);
  doc.text(project.description || '', margin, 86);

  if (project.address) {
    doc.text(`Bauadresse: ${project.address.street} ${project.address.houseNumber}, ${project.address.postalCode} ${project.address.city}`, margin, 102);
    if (project.address.coordinates) {
      doc.text(`Koordinaten: ${project.address.coordinates.lat.toFixed(5)}, ${project.address.coordinates.lng.toFixed(5)}`, margin, 108);
    }
    if (project.address.elevation) {
      doc.text(`Seehöhe: ${project.address.elevation} m`, margin, 114);
    }
  }
  doc.text(`Erstellt: ${new Date().toLocaleDateString('de-AT')}`, margin, 130);
  doc.text(`Bearbeiter: ${options.signingPerson || '—'}`, margin, 136);

  doc.setFillColor(255, 240, 200);
  doc.rect(margin, 200, contentWidth, 40, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('WICHTIGER HINWEIS', margin + 3, 208);
  doc.setFont('helvetica', 'normal');
  const disclaimer = doc.splitTextToSize(
    'Diese Berechnung ist eine Vorbemessung zur Klärung von Tragwerksgrößen und Querschnitten. ' +
    'Sie ersetzt keine prüffähige statische Berechnung durch eine qualifizierte Fachperson (Ziviltechniker, Statiker). ' +
    'Alle automatisch ermittelten Werte sind vor der Ausführung zu prüfen und zu bestätigen. ' +
    'Der Anwender trägt die volle Verantwortung für die Verwendung der Ergebnisse.',
    contentWidth - 6,
  );
  doc.text(disclaimer, margin + 3, 214);

  doc.addPage();
  y = 20;

  // === Inhaltsverzeichnis ===
  heading('Inhalt', 1);
  const sections = [
    '1. Tragwerksbeschreibung', '2. Standort und Zonen',
    '3. Lastannahmen', '4. Materialdaten',
    '5. Bauteil-Nachweise', '6. Massenauszug',
    ...(options.includeCosts ? ['7. Kostenschätzung'] : []),
    '8. Annahmen und Restrisiken',
    ...(options.includeAuditTrail ? ['9. Audit-Trail'] : []),
  ];
  doc.setFontSize(10);
  sections.forEach(s => { doc.text(s, margin + 5, y); y += 6; });
  doc.addPage();
  y = 20;

  // === 1. Tragwerksbeschreibung ===
  heading('1. Tragwerksbeschreibung');
  if (project.geometry) {
    para(
      `Gebäudegrundriss: ${project.geometry.length.value} × ${project.geometry.width.value} m. ` +
      `Firsthöhe ${project.geometry.ridgeHeight.value} m, Traufhöhe ${project.geometry.eavesHeight.value} m. ` +
      `Dachneigung ${project.geometry.roofPitch.value}°.`
    );
  }
  if (project.roofType) para(`Dachform: ${project.roofType.form}.`);
  if (project.structuralSystem) {
    para(`Tragsystem: ${project.structuralSystem.type}.`);
    para(`Begründung: ${project.structuralSystem.reasoning}`);
  }

  // === 2. Standort + Zonen ===
  heading('2. Standort und Klimazonen');
  if (project.address) {
    para(`Standort: ${project.address.city}, ${project.address.state}, Österreich.`);
    if (project.address.elevation) para(`Seehöhe: ${project.address.elevation} m.`);
    if (project.address.terrainCategory) para(`Geländekategorie: ${project.address.terrainCategory} (nach ÖNORM B 1991-1-4).`);
  }

  // === 3. Lastannahmen ===
  heading('3. Lastannahmen');
  if (project.loadCases && project.loadCases.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Lastfall', 'Wert', 'Einheit', 'Quelle', 'Konfidenz']],
      body: project.loadCases.map(l => [
        l.name, l.value.toString(), l.unit, l.source, `${(l.confidence * 100).toFixed(0)} %`,
      ]),
      styles: { fontSize: 9 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    if (!layman) {
      para('Lastkombinationen erfolgen nach EN 1990 / ÖNORM B 1990 mit γ_G = 1,35 (ständig), γ_Q = 1,50 (veränderlich) und ψ-Beiwerten gemäß Tabelle NA-Österreich.');
    } else {
      para('Wir rechnen mit Sicherheits-Aufschlägen: Eigengewicht wird mit Faktor 1,35 angesetzt, veränderliche Lasten wie Schnee oder Wind mit Faktor 1,50. So bleibt ein Sicherheitspuffer von ~35-50 % zwischen tatsächlicher Last und rechnerischer Festigkeit.');
    }
  }

  // === 4. Materialdaten ===
  heading('4. Materialdaten');
  if (project.materials && project.materials.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Material', 'Klasse', 'f_mk', 'f_c0k', 'f_vk', 'E₀', 'Dichte']],
      body: project.materials.map(m => [
        m.name, m.strengthClass,
        `${m.bendingStrength} N/mm²`, `${m.compressionStrength} N/mm²`,
        `${m.shearStrength} N/mm²`, `${m.elasticModulus} N/mm²`,
        `${m.density} kg/m³`,
      ]),
      styles: { fontSize: 9 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === 5. Bauteil-Nachweise ===
  heading('5. Bauteil-Nachweise');
  for (const r of calcResults) {
    checkPage(40);
    heading(`${r.input.type}: ${r.material.name} ${r.input.b}/${r.input.h} mm, L = ${r.input.span} m`, 2);
    para(r.summary, 10);

    autoTable(doc, {
      startY: y,
      head: [['Nachweis', 'Wert', 'Grenze', 'η', 'Status']],
      body: r.checks.map(c => [
        c.name,
        `${c.value.toFixed(2)}`,
        `${c.limit.toFixed(2)}`,
        `${(c.utilization * 100).toFixed(0)} %`,
        c.status === 'green' ? 'OK' : c.status === 'yellow' ? 'knapp' : 'nicht OK',
      ]),
      styles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 4;

    if (includeFormulas) {
      for (const c of r.checks) {
        checkPage(15);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${c.name} (η = ${(c.utilization * 100).toFixed(0)} %)`, margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`Formel: ${c.formula}`, margin + 3, y); y += 4;
        const expLines = doc.splitTextToSize(c.explanation, contentWidth - 6);
        doc.text(expLines, margin + 3, y);
        y += expLines.length * 4 + 2;
      }
    }
    hr();
  }

  // === 6. Massenauszug ===
  if (project.members && project.members.length > 0) {
    heading('6. Massenauszug');
    autoTable(doc, {
      startY: y,
      head: [['Bauteil', 'Typ', 'Material', 'b/h [mm]', 'L [m]', 'Stk', 'Volumen [m³]']],
      body: project.members.map(m => [
        m.name, m.type, m.material,
        `${m.width}/${m.height}`,
        m.length.toString(),
        m.quantity.toString(),
        ((m.width / 1000) * (m.height / 1000) * m.length * m.quantity).toFixed(3),
      ]),
      styles: { fontSize: 9 },
      margin: { left: margin, right: margin },
      foot: [['Σ', '', '', '', '', '',
        project.members.reduce((s, m) => s + (m.width / 1000) * (m.height / 1000) * m.length * m.quantity, 0).toFixed(3),
      ]],
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === 7. Kostenschätzung ===
  if (costs && options.includeCosts) {
    doc.addPage(); y = 20;
    heading('7. Kostenschätzung');
    para(costs.explanation);
    autoTable(doc, {
      startY: y,
      head: [['Kategorie', 'Beschreibung', 'Menge', 'Einheit', 'EP [€]', 'GP [€]']],
      body: costs.positions.map(p => [
        p.category, p.description, p.quantity.toLocaleString('de-AT'), p.unit,
        p.unitPrice.toFixed(2), p.total.toFixed(2),
      ]),
      styles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
    autoTable(doc, {
      startY: y,
      body: [
        ...costs.appliedSurcharges.map(s => [s.name, `${s.amount.toFixed(2)} €`]),
        ['Gesamt netto', `${costs.net.toFixed(2)} €`],
        ['MwSt 20 %', `${costs.vat.toFixed(2)} €`],
        ['Gesamt brutto', `${costs.gross.toFixed(2)} €`],
      ],
      styles: { fontSize: 9, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === 8. Annahmen und Restrisiken ===
  heading('8. Annahmen und Restrisiken');
  para(layman ?
    'Die Berechnung beruht auf den Werten, die im Programm eingegeben oder aus dem Plan automatisch erkannt wurden. Wenn diese ungenau sind, sind auch die Ergebnisse ungenau. Vor dem Bauen ist eine geprüfte Statik nötig.' :
    'Die Berechnung basiert auf den eingegebenen bzw. KI-extrahierten Werten. ' +
    'Folgende Aspekte sind nicht abgedeckt und müssen separat geprüft werden: ' +
    'Anschlüsse (Verbindungsmittel, Stabdübel), Auflager-Bewehrung im Mauerwerk, ' +
    'Aussteifung gegen Horizontallasten, dynamische Effekte (Schwingung), Brandschutz.'
  );

  if (project.validationIssues && project.validationIssues.length > 0) {
    heading('Validierungs-Hinweise', 3);
    for (const v of project.validationIssues) {
      para(`• [${v.severity.toUpperCase()}] ${v.category}: ${v.message}`, 9);
    }
  }

  // === 9. Audit ===
  if (options.includeAuditTrail && project.auditEntries) {
    doc.addPage(); y = 20;
    heading('9. Audit-Trail');
    para('Alle Datenherkünfte und Änderungen während der Bearbeitung:');
    autoTable(doc, {
      startY: y,
      head: [['Zeit', 'Agent', 'Aktion', 'Feld', 'Wert']],
      body: project.auditEntries.map(a => [
        new Date(a.timestamp).toLocaleString('de-AT'),
        a.agent, a.action, a.field, a.newValue || '',
      ]),
      styles: { fontSize: 7 },
      margin: { left: margin, right: margin },
    });
  }

  footer();
  return doc;
}

export function downloadReport(
  project: Project,
  calcResults: BeamResult[] = [],
  costs?: CostEstimate,
  options?: ReportOptions,
) {
  const doc = generateReport(project, calcResults, costs, options);
  const fileName = `Vorbemessung_${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
