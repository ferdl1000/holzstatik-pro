/**
 * Selbst-Lern-Kreislauf (serverseitig).
 *
 * Kernidee: Korrekturen des Nutzers werden NICHT pro Projekt-Name gespeichert,
 * sondern pro PLANVERFASSER (Architekt / ZT-Büro). Einreichpläne desselben
 * Planungsbüros nutzen dieselben Symbole, Legenden und Konventionen — eine einmal
 * bestätigte Korrektur transferiert dadurch auf den NÄCHSTEN Plan desselben Planers,
 * egal wie das Projekt heißt.
 *
 * Der Orchestrator:
 *   1. lädt die Regeln des Projekt-Eigentümers (planer-skopiert + globale),
 *   2. injiziert sie als „GELERNTE KORREKTUREN" in den KI-Prompt (wahrnehmen+verstehen),
 *   3. wendet sie nach der Extraktion deterministisch + sicher an (Post-Processing).
 */

export interface LearnedRule {
  id: string;
  field: string;
  trigger_pattern: string | null;   // normalisierter Planer-Key, z.B. "zt-mustermann"
  trigger_context: string | null;   // menschenlesbar, z.B. "Planer: ZT Mustermann GmbH"
  wrong_value: string | null;
  correct_value: string;
  reason: string | null;
  applied_count: number;
}

/**
 * Normalisiert einen Planer-/Bürotext zu einem stabilen Schlüssel.
 * "ZT Mustermann GmbH, 8230 Hartberg" → "zt-mustermann-gmbh"
 */
export function normalizePlanerKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Nur den Namensteil vor der ersten Zahl/PLZ/Adresse nehmen
  const namePart = raw.split(/\d{4,}|,|\n/)[0] || raw;
  const key = namePart
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  // Generische Floskeln entfernen, damit "ZT Müller Planungs GmbH" und
  // "ZT Müller GmbH" auf denselben Key fallen.
  const cleaned = key
    .split('-')
    .filter((t) => t && !['gmbh', 'kg', 'og', 'planung', 'planungs', 'ziviltechniker', 'buero', 'gesmbh', 'co'].includes(t))
    .join('-');
  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * Slugt eine ganze Planer-Adresse (inkl. PLZ/Ort) zu einem stabilen Schlüssel.
 * Ein Planungsbüro hat über Projekte hinweg dieselbe Büro-Adresse → stabile Identität.
 * "Bahnhofstraße 14c, 8350 Fehring" → "bahnhofstrasse-14c-8350-fehring"
 */
function slugAddress(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ermittelt den Planer-Key aus den extrahierten Adress-Kandidaten.
 * Erkennt das Planer-Adressfeld über mehrere Schemata:
 *   - { context: "Planverfasser", fullAddress, isBuildingAddress: false }
 *   - { type: "planer"|"architekt", raw|text|value }
 *   - String mit Planer-Stichwort
 * Schlüssel = Büro-NAME falls vorhanden, sonst die ganze Büro-Adresse (stabil pro Büro).
 */
export function derivePlanerKey(addresses: unknown): { key: string | null; label: string | null } {
  if (!Array.isArray(addresses)) return { key: null, label: null };
  const PLANER_HINT = /\b(zt|ziviltechniker|architekt|arch\.|baumeister|bmstr|ing\.|ingenieur|planung|dipl|planverfasser|verfasser)/i;

  for (const a of addresses) {
    const obj = (a && typeof a === 'object') ? (a as Record<string, unknown>) : null;
    const raw = typeof a === 'string'
      ? a
      : String(obj?.fullAddress ?? obj?.raw ?? obj?.text ?? obj?.value ?? '');
    const context = String(obj?.context ?? obj?.type ?? '');
    const isBuilding = obj?.isBuildingAddress;

    const looksLikePlaner =
      /planer|architekt|zt|verfasser/i.test(context)
      || isBuilding === false
      || PLANER_HINT.test(raw);
    if (!looksLikePlaner || !raw.trim()) continue;

    // Bevorzugt: Büro-Name (Text vor erster Zahl), wenn es einer ist (kein reiner Straßenname).
    const nameKey = normalizePlanerKey(raw);
    const namePart = raw.split(/\d{4,}|,|\n/)[0] || '';
    const isStreetOnly = /(straße|strasse|str\.|gasse|weg|platz|allee)/i.test(namePart);
    if (nameKey && !isStreetOnly) {
      return { key: nameKey, label: raw.split(/\n/)[0].slice(0, 80) };
    }
    // Sonst: ganze Adresse als stabiler Büro-Schlüssel (PLZ/Ort disambiguiert).
    const addrKey = slugAddress(raw);
    if (addrKey.length >= 4) return { key: addrKey, label: raw.split(/\n/)[0].slice(0, 80) };
  }
  return { key: null, label: null };
}

/**
 * Lädt die für diesen Plan relevanten Regeln:
 * - Regeln OHNE trigger_pattern (global, vom Nutzer überall gewollt) UND
 * - Regeln deren trigger_pattern zum Planer-Key passt.
 * Supabase = service-role Client. userId = Projekt-Eigentümer.
 */
export async function loadRulesForProject(
  supabase: { from: (t: string) => any },
  userId: string,
  planerKey: string | null,
): Promise<LearnedRule[]> {
  try {
    const { data } = await supabase
      .from('erkennungs_regeln')
      .select('*')
      .eq('user_id', userId);
    if (!Array.isArray(data)) return [];
    return (data as LearnedRule[]).filter((r) => {
      if (!r.trigger_pattern) return true;                 // global
      if (!planerKey) return false;                        // planer-spezifisch, aber kein Planer erkannt
      return r.trigger_pattern === planerKey
        || planerKey.includes(r.trigger_pattern)
        || r.trigger_pattern.includes(planerKey);
    });
  } catch {
    return [];
  }
}

/**
 * Baut den Prompt-Block, der dem KI-Agenten die bestätigten Korrekturen mitgibt.
 * Leer, wenn keine Regeln — dann wird nichts injiziert.
 */
export function buildRulesPromptBlock(rules: LearnedRule[]): string {
  if (!rules.length) return '';
  const lines = rules.slice(0, 40).map((r) => {
    const from = r.wrong_value ? `statt "${r.wrong_value}" ` : '';
    const ctx = r.trigger_context ? ` (${r.trigger_context})` : '';
    const why = r.reason ? ` — Grund: ${r.reason}` : '';
    return `- ${r.field}: korrekt ist "${r.correct_value}" ${from}${ctx}${why} [${r.applied_count}× bestätigt]`;
  });
  return `

=== GELERNTE KORREKTUREN (vom Nutzer bestätigt — UNBEDINGT beachten) ===
Bei früheren Plänen (oft vom selben Planer) wurden diese Werte falsch erkannt und vom
Fachmann korrigiert. Wende dieses Wissen an, sofern der Plan nicht eindeutig etwas
anderes zeigt. Bei Konflikt zwischen deiner Lesung und einer mehrfach bestätigten Regel:
markiere das Feld als unsicher statt die Regel zu ignorieren.
${lines.join('\n')}`;
}

/** Felder die deterministisch sicher überschrieben werden dürfen (Post-Processing). */
const APPLICABLE_FIELDS = new Set([
  'roofForm', 'coveringType', 'structuralSystemType', 'roofPitch',
  'wandConstruction', 'deckenConstruction', 'fireClass', 'gk',
]);

/**
 * Wendet Regeln deterministisch auf das extrahierte Ergebnis an.
 * Sicher: überschreibt nur, wenn das Feld leer/unsicher ist ODER der aktuelle
 * Wert exakt dem gelernten Fehlwert (wrong_value) entspricht.
 */
export function applyLearnedRules(
  extracted: Record<string, any>,
  rules: LearnedRule[],
): { applied: Array<{ field: string; from: string; to: string }> } {
  const applied: Array<{ field: string; from: string; to: string }> = [];
  const lowConf = typeof extracted.overallConfidence === 'number' && extracted.overallConfidence < 0.85;

  for (const rule of rules) {
    if (!APPLICABLE_FIELDS.has(rule.field)) continue;
    const cur = extracted[rule.field];
    const curStr = cur == null ? '' : String(cur);
    const matchesWrong = rule.wrong_value != null && curStr === String(rule.wrong_value);
    const isEmpty = curStr === '' || curStr === '0' || curStr === 'null' || curStr === 'undefined';
    // Nur überschreiben wenn: Fehlwert exakt getroffen, ODER Feld leer,
    // ODER (mehrfach bestätigte Regel UND Gesamt-Konfidenz niedrig).
    if (matchesWrong || isEmpty || (rule.applied_count >= 2 && lowConf)) {
      if (curStr !== String(rule.correct_value)) {
        extracted[rule.field] = rule.correct_value;
        applied.push({ field: rule.field, from: curStr || '(leer)', to: String(rule.correct_value) });
      }
    }
  }
  return { applied };
}
