/**
 * OpenRouter-Vision — Zugang zu kostenlosen Bildmodellen als Alternative/Ergänzung
 * zu Gemini Flash. OpenAI-kompatible Chat-API.
 *
 * Aktiv nur, wenn ein OPENROUTER_API_KEY vorliegt (Admin-Einstellung oder Supabase-
 * Secret). Sonst/Fehler → der Aufrufer fällt automatisch auf Gemini zurück (kein
 * Risiko für den Bestand).
 *
 * WICHTIG: OpenRouters Free-Tier-Modelle wechseln häufig (alte Slugs verschwinden
 * ersatzlos, z.B. wurde qwen2.5-vl:free Mitte 2026 entfernt). Diese Liste wurde am
 * 2026-06-30 live gegen GET /api/v1/models verifiziert (image-Modalität + :free-Tag).
 * Bei erneutem Totalausfall: Liste mit demselben Filter neu abgleichen.
 */
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const OPENROUTER_FREE_MODELS = [
  'nvidia/nemotron-nano-12b-v2-vl:free',          // live getestet: Vision + JSON-Modus OK
  'google/gemma-4-31b-it:free',                    // stärker, aber öfter ausgelastet (429)
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
];

export function openRouterAvailable(): boolean {
  return !!Deno.env.get('OPENROUTER_API_KEY');
}

export interface OrVisionRequest {
  systemPrompt: string;
  userPrompt: string;
  images: { base64: string; mimeType: string }[];
  model?: string;
  maxTokens?: number;
  jsonMode?: boolean;
  /** Key aus Admin (system_settings) — Vorrang vor dem Env-Secret. */
  apiKey?: string;
}

/**
 * Ein Vision-Call über OpenRouter mit mehreren Bildern (Kacheln). Wirft bei Fehler —
 * der Aufrufer fängt das ab und nutzt Gemini.
 */
/** Zeitbudget je Modell-Versuch. Freie Modelle können bei Überlastung lange hängen —
 *  ohne Limit würde ein einziger zäher Versuch das ganze 150s-Edge-Fenster sprengen. */
const PER_MODEL_TIMEOUT_MS = 25_000;
/** Gesamtbudget für ALLE Kandidaten zusammen — Rest der Zeit bleibt für den
 *  Gemini-Fallback + restliche Pipeline (Edge-Limit ist 150s). */
const TOTAL_BUDGET_MS = 70_000;

export async function openRouterVision(req: OrVisionRequest): Promise<string> {
  const key = req.apiKey || Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY nicht gesetzt');

  const candidates = req.model ? [req.model, ...OPENROUTER_FREE_MODELS.filter(m => m !== req.model)] : OPENROUTER_FREE_MODELS;
  const content: any[] = [{ type: 'text', text: req.userPrompt }];
  for (const img of req.images) {
    content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
  }

  const overallStart = Date.now();
  let lastError = '';
  for (const model of candidates) {
    if (Date.now() - overallStart > TOTAL_BUDGET_MS) {
      lastError = `Zeitbudget erschöpft (${TOTAL_BUDGET_MS}ms) — übrige Kandidaten übersprungen`;
      break;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_MODEL_TIMEOUT_MS);
    try {
      const res = await fetch(OR_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://dachplan-assistent.vercel.app',
          'X-Title': 'HolzStatik Dachplan-Assistent',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content },
          ],
          max_tokens: req.maxTokens ?? 24000,
          temperature: 0.1,
          ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text as string;
        lastError = `Leere Antwort von ${model}`;
        continue;
      }
      lastError = `${model} ${res.status}: ${(await res.text()).slice(0, 160)}`;
      if (res.status === 401) throw new Error(`OpenRouter Auth: ${lastError}`);
    } catch (e) {
      lastError = (e instanceof Error && e.name === 'AbortError')
        ? `${model}: Zeitlimit (${PER_MODEL_TIMEOUT_MS}ms) überschritten`
        : (e instanceof Error ? e.message : String(e));
      if (lastError.includes('Auth')) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`OpenRouter: alle Modelle fehlgeschlagen: ${lastError}`);
}
