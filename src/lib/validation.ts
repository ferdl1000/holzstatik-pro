/**
 * Zentraler Validierungsagent – erzeugt ValidationIssues aus dem Projektmodell.
 * Keine erfundene Gewissheit: jeder Check beschreibt genau, was fehlt oder unsicher ist.
 */
import type { Project, ValidationIssue, StatusLevel } from '@/types/project';

let issueCounter = 0;
function makeIssue(
  severity: StatusLevel,
  category: string,
  message: string,
  affectedField: string,
  suggestion?: string,
  resolved = false
): ValidationIssue {
  issueCounter++;
  return { id: `vi-auto-${issueCounter}`, severity, category, message, affectedField, suggestion, resolved };
}

export function runFullValidation(project: Project): ValidationIssue[] {
  issueCounter = 0;
  const issues: ValidationIssue[] = [];

  // ─── Dokumente ───
  if (project.documents.length === 0) {
    issues.push(makeIssue('red', 'Dokument', 'Kein Plan hochgeladen – Analyse kann nicht beginnen.', 'documents', 'Plan im Tab „Plan" hochladen.'));
  } else if (!project.documents.some(d => d.status === 'analyzed')) {
    issues.push(makeIssue('red', 'Dokument', 'Plan ist hochgeladen, aber noch nicht analysiert.', 'documents', 'KI-Analyse im Tab „Plan" starten.'));
  }

  // ─── Adresse ───
  if (!project.address) {
    issues.push(makeIssue('red', 'Adresse', 'Keine Bauadresse vorhanden – standortbezogene Lasten können nicht ermittelt werden.', 'address', 'Adresse manuell im Tab „Adresse" eingeben.'));
  } else {
    if (project.address.source === 'auto_extracted') {
      issues.push(makeIssue('yellow', 'Adresse', 'Bauadresse automatisch erkannt – Bestätigung durch Benutzer empfohlen.', 'address', 'Im Tab „Adresse" prüfen und bestätigen.'));
    }
    if (!project.address.postalCode || !project.address.city) {
      issues.push(makeIssue('yellow', 'Adresse', 'PLZ oder Ort fehlt – Schneelastzone kann nicht sicher zugeordnet werden.', 'address'));
    }
    if (project.address.source === 'user_confirmed') {
      issues.push(makeIssue('green', 'Adresse', 'Bauadresse vom Benutzer bestätigt.', 'address', undefined, true));
    }
  }

  // ─── Geometrie ───
  if (!project.geometry) {
    issues.push(makeIssue('red', 'Geometrie', 'Keine Gebäudemaße vorhanden.', 'geometry', 'KI-Analyse starten oder Geometrie manuell eingeben.'));
  } else {
    const geo = project.geometry;
    if (!geo.userConfirmed) {
      issues.push(makeIssue('yellow', 'Geometrie', 'Geometrie nicht bestätigt – Berechnung basiert auf ungeprüften Werten.', 'geometry', 'Geometrie im entsprechenden Tab bestätigen.'));
    } else {
      issues.push(makeIssue('green', 'Geometrie', 'Geometrie vom Benutzer bestätigt.', 'geometry', undefined, true));
    }
    if (geo.ridgeHeight.source === 'calculated') {
      issues.push(makeIssue('yellow', 'Geometrie', 'Firsthöhe wurde berechnet, nicht direkt abgelesen – bitte verifizieren.', 'geometry.ridgeHeight'));
    }
    if (geo.width.value <= 0 || geo.length.value <= 0) {
      issues.push(makeIssue('red', 'Geometrie', 'Gebäudebreite oder -länge ist 0 – Berechnung nicht möglich.', 'geometry'));
    }
  }

  // ─── Dachform ───
  if (!project.roofType) {
    issues.push(makeIssue('yellow', 'Dachform', 'Dachform nicht erkannt – muss manuell gewählt werden.', 'roofType'));
  } else if (!project.roofType.userConfirmed) {
    issues.push(makeIssue('yellow', 'Dachform', `Dachform „${project.roofType.form}" vorgeschlagen (${(project.roofType.confidence * 100).toFixed(0)}%) – Bestätigung nötig.`, 'roofType'));
  } else {
    issues.push(makeIssue('green', 'Dachform', 'Dachform bestätigt.', 'roofType', undefined, true));
  }

  // ─── Tragwerk ───
  if (!project.structuralSystem) {
    issues.push(makeIssue('yellow', 'Tragwerk', 'Tragwerkssystem nicht festgelegt.', 'structuralSystem'));
  } else if (!project.structuralSystem.userConfirmed) {
    issues.push(makeIssue('yellow', 'Tragwerk', `Tragwerk „${project.structuralSystem.type}" vorgeschlagen – Bestätigung nötig.`, 'structuralSystem'));
  } else {
    issues.push(makeIssue('green', 'Tragwerk', 'Tragwerkssystem bestätigt.', 'structuralSystem', undefined, true));
  }

  // ─── Lasten ───
  const snowCase = project.loadCases.find(l => l.type === 'snow');
  const windCase = project.loadCases.find(l => l.type === 'wind');
  if (!snowCase || snowCase.value <= 0) {
    issues.push(makeIssue('red', 'Lasten', 'Schneelast nicht berechnet oder 0 kN/m² – standortbezogene Eingaben prüfen.', 'loadCases', 'Schneelastzone und Seehöhe im Tab „Lasten" eingeben und „Lasten neu berechnen" klicken.'));
  } else if (snowCase.confidence < 0.7 && !snowCase.userModified) {
    issues.push(makeIssue('yellow', 'Lasten', 'Schneelast hat geringe Konfidenz – manuelle Prüfung empfohlen.', 'loadCases'));
  }
  if (!windCase || windCase.value <= 0) {
    issues.push(makeIssue('yellow', 'Lasten', 'Windlast nicht berechnet oder 0 kN/m².', 'loadCases'));
  }
  const unconfirmedLoads = project.loadCases.filter(l => !l.userModified && l.confidence < 0.8);
  if (unconfirmedLoads.length > 0) {
    issues.push(makeIssue('yellow', 'Lasten', `${unconfirmedLoads.length} Lastfall/fälle mit niedriger Konfidenz – manuelle Bestätigung empfohlen.`, 'loadCases'));
  }

  // ─── Bauteile ───
  if (project.members.length === 0) {
    issues.push(makeIssue('red', 'Bauteile', 'Keine Bauteile definiert – Bemessung nicht möglich.', 'members', 'Bauteile im Tab „Materialien" anlegen.'));
  } else {
    const withoutMaterial = project.members.filter(m => !project.materials.find(mat => mat.id === m.material));
    if (withoutMaterial.length > 0) {
      issues.push(makeIssue('red', 'Bauteile', `${withoutMaterial.length} Bauteil(e) ohne gültiges Material zugewiesen.`, 'members'));
    }
  }

  // ─── Berechnung ───
  if (project.calculations.length === 0 && project.members.length > 0) {
    issues.push(makeIssue('yellow', 'Bemessung', 'Noch keine Berechnung durchgeführt.', 'calculations', '„Berechnung starten" im Tab „Berechnung" klicken.'));
  }
  const failedCalcs = project.calculations.filter(c => c.overallStatus === 'red');
  if (failedCalcs.length > 0) {
    for (const calc of failedCalcs) {
      const failedChecks = calc.checks.filter(ch => ch.status === 'red');
      for (const ch of failedChecks) {
        issues.push(makeIssue('red', 'Bemessung', `${calc.memberName}: ${ch.name} überschritten (${ch.formula || ''})`, `members.${calc.memberId}`, ch.type === 'stress' ? 'Querschnitt vergrößern oder Material ändern' : 'Spannweite oder Auflager prüfen'));
      }
    }
  }

  // ─── Konsistenz Modell / Mengen ───
  if (project.members.length > 0 && project.calculations.length > 0) {
    const calculatedIds = new Set(project.calculations.map(c => c.memberId));
    const uncalculated = project.members.filter(m => !calculatedIds.has(m.id));
    if (uncalculated.length > 0) {
      issues.push(makeIssue('yellow', 'Konsistenz', `${uncalculated.length} Bauteil(e) ohne zugehörige Berechnung.`, 'calculations'));
    }
  }

  return issues;
}

/** Counts by severity for quick display */
export function countBySeverity(issues: ValidationIssue[]) {
  return {
    red: issues.filter(i => i.severity === 'red').length,
    yellow: issues.filter(i => i.severity === 'yellow').length,
    green: issues.filter(i => i.severity === 'green').length,
  };
}

/** Returns overall project health status */
export function projectHealthStatus(issues: ValidationIssue[]): StatusLevel {
  if (issues.some(i => i.severity === 'red' && !i.resolved)) return 'red';
  if (issues.some(i => i.severity === 'yellow' && !i.resolved)) return 'yellow';
  return 'green';
}
