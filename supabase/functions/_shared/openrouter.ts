/**
 * OpenRouter-Vision — Zugang zu STÄRKEREN, ebenfalls KOSTENLOSEN Bildmodellen als
 * Gemini Flash (z.B. Qwen2.5-VL, Llama-3.2-Vision). OpenAI-kompatible Chat-API.
 *
 * Aktiv nur, wenn das Supabase-Secret OPENROUTER_API_KEY gesetzt ist. Sonst/Fehler →
 * der Aufrufer fällt automatisch auf Gemini zurück (kein Risiko für den Bestand).
 *
 * Free-Modelle (Stand 2026, ":free"-Tag = kostenlos):
 *   qwen/qwen2.5-vl-72b-instruct:free   (stark bei Plänen/Dokumenten — empfohlen)
 *   meta-llama/llama-3.2-90b-vision-instruct:free
 *   google/gemini-2.0-flash-exp:free
 */
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const OPENROUTER_FREE_MODELS = [
  'qwen/qwen2.5-vl-72b-instruct:free',
  'meta-llama/llama-3.2-90b-vision-instruct:free',
  'google/gemini-2.0-flash-exp:free',
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
export async function openRouterVision(req: OrVisionRequest): Promise<string> {
  const key = req.apiKey || Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY nicht gesetzt');

  const candidates = req.model ? [req.model, ...OPENROUTER_FREE_MODELS.filter(m => m !== req.model)] : OPENROUTER_FREE_MODELS;
  const content: any[] = [{ type: 'text', text: req.userPrompt }];
  for (const img of req.images) {
    content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
  }

  let lastError = '';
  for (const model of candidates) {
    try {
      const res = await fetch(OR_URL, {
        method: 'POST',
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
      lastError = e instanceof Error ? e.message : String(e);
      if (lastError.includes('Auth')) throw e;
    }
  }
  throw new Error(`OpenRouter: alle Modelle fehlgeschlagen: ${lastError}`);
}
