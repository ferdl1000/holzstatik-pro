import { supabase } from '@/integrations/supabase/client';

export interface CorrectionInput {
  field: string;           // 'roofPitch', 'coveringType', 'roofForm', etc.
  wrongValue: string;
  correctValue: string;
  triggerPattern?: string; // normalisierter Planer-Key — macht die Regel auf NEUE Pläne desselben Planers übertragbar
  triggerContext?: string; // menschenlesbar, z.B. 'Planer: ZT Mustermann'
  reason?: string;
}

/**
 * Speichert eine manuelle Korrektur als Lern-Regel.
 * Silent fail — blockiert nie den Haupt-Flow.
 */
export async function captureCorrection(input: CorrectionInput): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Prüfen ob ähnliche Regel existiert → applied_count erhöhen.
    // Gleicher Planer (trigger_pattern) + Feld + korrekter Wert = dieselbe Regel.
    let query = supabase
      .from('erkennungs_regeln')
      .select('id, applied_count')
      .eq('user_id', user.id)
      .eq('field', input.field)
      .eq('correct_value', input.correctValue);
    query = input.triggerPattern
      ? query.eq('trigger_pattern', input.triggerPattern)
      : query.is('trigger_pattern', null);
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      await supabase
        .from('erkennungs_regeln')
        .update({ applied_count: (existing.applied_count ?? 0) + 1 })
        .eq('id', existing.id);
    } else {
      await supabase.from('erkennungs_regeln').insert({
        user_id: user.id,
        field: input.field,
        wrong_value: input.wrongValue,
        correct_value: input.correctValue,
        trigger_pattern: input.triggerPattern,
        trigger_context: input.triggerContext,
        reason: input.reason,
      });
    }
  } catch (err) {
    // Intentionally silent — nie den Haupt-Flow blockieren
    console.debug('[captureCorrection] Fehler (ignored):', err);
  }
}

export interface ErkennungsRegel {
  id: string;
  field: string;
  wrong_value: string | null;
  correct_value: string;
  trigger_context: string | null;
  reason: string | null;
  applied_count: number;
  created_at: string;
}

/**
 * Lädt anwendbare Regeln für ein Projekt (z.B. nach Planer/PLZ).
 * Gibt leeres Array zurück bei Fehler — silent fail.
 */
export async function loadApplicableRules(triggerContext?: string): Promise<ErkennungsRegel[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('erkennungs_regeln')
      .select('*')
      .eq('user_id', user.id);

    if (!data) return [];

    // Globale Regeln (ohne trigger_pattern) gelten immer; planer-spezifische
    // nur wenn der Planer-Key passt. So transferieren Korrekturen auf neue Pläne
    // desselben Planers, ohne fremde Pläne zu verfälschen.
    if (triggerContext) {
      return (data as ErkennungsRegel[]).filter((r) => {
        const pat = (r as ErkennungsRegel & { trigger_pattern?: string | null }).trigger_pattern;
        if (!pat && !r.trigger_context) return true; // global
        if (pat) return triggerContext.includes(pat) || pat.includes(triggerContext);
        return !r.trigger_context
          || triggerContext.includes(r.trigger_context)
          || r.trigger_context.includes(triggerContext);
      });
    }

    return data as ErkennungsRegel[];
  } catch (err) {
    console.debug('[loadApplicableRules] Fehler (ignored):', err);
    return [];
  }
}

/**
 * Wendet geladene Regeln auf ein extrahiertes Ergebnis-Objekt an.
 * Gibt ein neues Objekt mit überschriebenen Feldern zurück.
 */
export function applyRules<T extends Record<string, unknown>>(
  extracted: T,
  rules: ErkennungsRegel[],
): { result: T; applied: ErkennungsRegel[] } {
  const result = { ...extracted };
  const applied: ErkennungsRegel[] = [];

  for (const rule of rules) {
    if (rule.field in result) {
      const currentVal = String(result[rule.field] ?? '');
      // Regel anwenden wenn wrong_value passt ODER keine wrong_value gesetzt
      if (!rule.wrong_value || currentVal === rule.wrong_value) {
        (result as Record<string, unknown>)[rule.field] = rule.correct_value;
        applied.push(rule);
      }
    }
  }

  return { result, applied };
}
