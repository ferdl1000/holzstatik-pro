/**
 * Analyse-Genauigkeit (Hochgenau-Modus).
 *
 * - 'standard'  → gemini-2.5-flash (kostenlos, schnell). Default.
 *                 Dachneigung kommt notfalls aus dem deterministischen Geometrie-Schiedsrichter.
 * - 'hochgenau' → gemini-2.5-pro für den Vision-Hauptcall (kostenpflichtig, höhere Lese-Genauigkeit
 *                 für kleine Beschriftungen wie "DN 10°"). Fällt bei Quota automatisch auf Flash zurück.
 *
 * Persistiert in localStorage, damit die Wahl Seiten-Reloads überlebt.
 * Wird im Admin-Bereich umgeschaltet und beim Auslösen der KI-Analyse mitgegeben.
 */
export type AnalysisQuality = 'standard' | 'hochgenau';

const STORAGE_KEY = 'hs_analysis_quality';

export function getAnalysisQuality(): AnalysisQuality {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hochgenau' ? 'hochgenau' : 'standard';
  } catch {
    return 'standard';
  }
}

export function setAnalysisQuality(q: AnalysisQuality): void {
  try {
    localStorage.setItem(STORAGE_KEY, q);
  } catch {
    /* localStorage nicht verfügbar — Default greift */
  }
}
