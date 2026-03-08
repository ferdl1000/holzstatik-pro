/**
 * Zentraler Validierungs-Agent – erzeugt ValidationIssues aus dem Projektmodell.
 * REAL-DATA-ONLY: Prüft auf Vollständigkeit, Konsistenz und fehlende Bestätigungen.
 */
import type { Project, ValidationIssue, StatusLevel } from '@/types/project';

let issueCounter = 0;
function makeIssue(
  severity: StatusLevel, category: string, message: string,
  affectedField: string, suggestion?: string, resolved = false
): ValidationIssue {
  issueCounter++;
  return { id: `vi-auto-${issueCounter}`, severity, category, message, affectedField, suggestion, resolved };
}

export function runFullValidation(project: Project): ValidationIssue[] {
  issueCounter = 0;
  const issues: ValidationIssue[] = [];

  // ─── 1. Dokumente ───
  if (project.documents.length === 0) {
    issues.push(makeIssue('red', 'Dokument', 'Kein Plan hochgeladen – Analyse kann nicht beginnen.', 'documents', 'Plan im Tab „Plan" hochladen.'));
  } else if (!project.documents.some(d => d.status === 'analyzed')) {
    issues.push(makeIssue('red', 'Dokument', 'Plan ist hochgeladen, aber noch nicht analysiert.', 'documents', 'KI-Analyse im Tab „Plan" starten.'));
  } else {
    issues.push(makeIssue('green', 'Dokument', 'Plan analysiert.', 'documents', undefined, true));
  }

  // ─── 2. Adresse ───
  if (!project.address) {
    issues.push(makeIssue('red', 'Adresse', 'Keine Bauadresse vorhanden – standortbezogene Lasten blockiert.', 'address', 'Adresse manuell im Tab „Adresse" eingeben.'));
  } else {
    if (project.address.source === 'auto_extracted') {
      issues.push(makeIssue('yellow', 'Adresse', 'Bauadresse automatisch erkannt – Bestätigung erforderlich.', 'address', 'Im Tab „Adresse" prüfen und bestätigen.'));
    }
    if (!project.address.postalCode || !project.address.city) {
      issues.push(makeIssue('yellow', 'Adresse', 'PLZ oder Ort fehlt – Schneelastzone nicht sicher zuordenbar.', 'address'));
    }
    if (project.address.source === 'user_confirmed' || project.address.source === 'user_entered') {
      issues.push(makeIssue('green', 'Adresse', 'Bauadresse vom Benutzer bestätigt.', 'address', undefined, true));
    }
  }

  // ─── 3. Geometrie ───
  if (!project.geometry) {
    issues.push(makeIssue('red', 'Geometrie', 'Keine Gebäudemaße vorhanden.', 'geometry', 'KI-Analyse starten oder Geometrie manuell eingeben.'));
  } else {
    const geo = project.geometry;
    if (!geo.userConfirmed) {
      issues.push(makeIssue('yellow', 'Geometrie', 'Geometrie nicht bestätigt – Berechnung basiert auf ungeprüften Werten.', 'geometry', 'Geometrie im Tab „Geometrie" bestätigen.'));
    } else {
      issues.push(makeIssue('green', 'Geometrie', 'Geometrie vom Benutzer bestätigt.', 'geometry', undefined, true));
    }
    if (geo.ridgeHeight.source === 'calculated') {
      issues.push(makeIssue('yellow', 'Geometrie', 'Firsthöhe wurde berechnet, nicht direkt abgelesen.', 'geometry.ridgeHeight'));
    }
    if (geo.width.value <= 0 || geo.length.value <= 0) {
      issues.push(makeIssue('red', 'Geometrie', 'Gebäudebreite oder -länge ist 0 – Berechnung nicht möglich.', 'geometry'));
    }
    if (geo.roofPitch.value <= 0) {
      issues.push(makeIssue('red', 'Geometrie', 'Dachneigung ist 0 – Schneeformbeiwert nicht berechenbar.', 'geometry.roofPitch'));
    }
  }

  // ─── 4. Dachform ───
  if (!project.roofType) {
    issues.push(makeIssue('yellow', 'Dachform', 'Dachform nicht erkannt – muss manuell gewählt werden.', 'roofType'));
  } else if (!project.roofType.userConfirmed) {
    issues.push(makeIssue('yellow', 'Dachform', `Dachform „${project.roofType.form}" vorgeschlagen (${(project.roofType.confidence * 100).toFixed(0)}%) – Bestätigung nötig.`, 'roofType'));
  } else {
    issues.push(makeIssue('green', 'Dachform', 'Dachform bestätigt.', 'roofType', undefined, true));
  }

  // ─── 5. Tragwerk ───
  if (!project.structuralSystem) {
    issues.push(makeIssue('yellow', 'Tragwerk', 'Tragwerkssystem nicht festgelegt.', 'structuralSystem'));
  } else if (!project.structuralSystem.userConfirmed) {
    issues.push(makeIssue('yellow', 'Tragwerk', `Tragwerk „${project.structuralSystem.type}" vorgeschlagen – Bestätigung nötig.`, 'structuralSystem'));
  } else {
    issues.push(makeIssue('green', 'Tragwerk', 'Tragwerkssystem bestätigt.', 'structuralSystem', undefined, true));
  }

  // ─── 6. Lasten ───
  if (project.loadCases.length === 0) {
    issues.push(makeIssue('red', 'Lasten', 'Keine Lastfälle definiert – Lastermittlung im Tab „Lasten" durchführen.', 'loadCases', 'Schneelastzone und Standortdaten eingeben, dann „Lasten berechnen" klicken.'));
  } else {
    const snowCase = project.loadCases.find(l => l.type === 'snow');
    const windCase = project.loadCases.find(l => l.type === 'wind');
    if (!snowCase || snowCase.value <= 0) {
      issues.push(makeIssue('red', 'Lasten', 'Schneelast nicht berechnet oder 0 kN/m².', 'loadCases', 'Schneelastzone und Seehöhe im Tab „Lasten" eingeben.'));
    } else if (snowCase.confidence < 0.7 && !snowCase.userModified) {
      issues.push(makeIssue('yellow', 'Lasten', 'Schneelast hat geringe Konfidenz – manuelle Prüfung empfohlen.', 'loadCases'));
    }
    if (!windCase || windCase.value <= 0) {
      issues.push(makeIssue('yellow', 'Lasten', 'Windlast nicht berechnet oder 0 kN/m².', 'loadCases'));
    }
    const unconfirmed = project.loadCases.filter(l => !l.userModified && l.confidence < 0.8);
    if (unconfirmed.length > 0) {
      issues.push(makeIssue('yellow', 'Lasten', `${unconfirmed.length} Lastfall/fälle mit niedriger Konfidenz – Bestätigung empfohlen.`, 'loadCases'));
    }
  }

  // ─── 7. Bauteile ───
  if (project.members.length === 0) {
    issues.push(makeIssue('red', 'Bauteile', 'Keine Bauteile definiert – Bemessung nicht möglich.', 'members', 'Bauteile im Tab „Tragwerk" oder „Materialien" anlegen.'));
  } else {
    const withoutMaterial = project.members.filter(m => !project.materials.find(mat => mat.id === m.material));
    if (withoutMaterial.length > 0) {
      issues.push(makeIssue('red', 'Bauteile', `${withoutMaterial.length} Bauteil(e) ohne gültiges Material.`, 'members'));
    }
  }

  // ─── 8. Berechnung ───
  if (project.calculations.length === 0 && project.members.length > 0) {
    issues.push(makeIssue('yellow', 'Bemessung', 'Noch keine Berechnung durchgeführt.', 'calculations', '„Berechnung starten" im Tab „Berechnung" klicken.'));
  }
  const failedCalcs = project.calculations.filter(c => c.overallStatus === 'red');
  for (const calc of failedCalcs) {
    for (const ch of calc.checks.filter(ch => ch.status === 'red')) {
      issues.push(makeIssue('red', 'Bemessung', `${calc.memberName}: ${ch.name} überschritten (${ch.formula || ''})`,
        `members.${calc.memberId}`, ch.type === 'stress' ? 'Querschnitt vergrößern oder Material ändern' : 'Spannweite oder Auflager prüfen'));
    }
  }

  // ─── 9. Konsistenz Modell/Berechnung ───
  if (project.members.length > 0 && project.calculations.length > 0) {
    const calculatedIds = new Set(project.calculations.map(c => c.memberId));
    const uncalculated = project.members.filter(m => !calculatedIds.has(m.id));
    if (uncalculated.length > 0) {
      issues.push(makeIssue('yellow', 'Konsistenz', `${uncalculated.length} Bauteil(e) ohne zugehörige Berechnung.`, 'calculations'));
    }
  }

  // ─── 10. Adresse → Lasten Abhängigkeit ───
  const addressConfirmed = project.address?.source === 'user_confirmed' || project.address?.source === 'user_entered';
  const hasLoads = project.loadCases.length > 0;
  if (hasLoads && !addressConfirmed) {
    issues.push(makeIssue('yellow', 'Konsistenz', 'Lasten berechnet, aber Adresse noch nicht bestätigt – Standortabhängigkeit prüfen.', 'address'));
  }

  return issues;
}

export function countBySeverity(issues: ValidationIssue[]) {
  return {
    red: issues.filter(i => i.severity === 'red').length,
    yellow: issues.filter(i => i.severity === 'yellow').length,
    green: issues.filter(i => i.severity === 'green').length,
  };
}

export function projectHealthStatus(issues: ValidationIssue[]): StatusLevel {
  if (issues.some(i => i.severity === 'red' && !i.resolved)) return 'red';
  if (issues.some(i => i.severity === 'yellow' && !i.resolved)) return 'yellow';
  return 'green';
}
