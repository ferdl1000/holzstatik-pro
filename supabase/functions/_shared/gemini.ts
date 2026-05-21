/**
 * Gemini API Wrapper - gemeinsamer Helper für alle KI-Agenten.
 *
 * Nutzt Google AI Studio Gemini API (kostenfreies Free-Tier).
 * - gemini-2.0-flash für schnelle Text-Aufgaben
 * - gemini-2.0-flash für PDF/Vision (multimodal)
 */

export interface GeminiTextRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: 'gemini-2.0-flash' | 'gemini-2.0-flash-exp' | 'gemini-2.5-flash' | 'gemini-2.5-pro';
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface GeminiVisionRequest extends GeminiTextRequest {
  /** PDF/Image als Base64 */
  fileBase64: string;
  mimeType: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getKey(): string {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY nicht konfiguriert in Supabase Secrets');
  return key;
}

export async function geminiText(req: GeminiTextRequest): Promise<string> {
  const modelCandidates = req.model
    ? [req.model]
    : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite'];
  const body = {
    contents: [{ parts: [{ text: req.userPrompt }] }],
    systemInstruction: { parts: [{ text: req.systemPrompt }] },
    generationConfig: {
      temperature: req.temperature ?? 0.1,
      maxOutputTokens: req.maxTokens ?? 4096,
      ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };
  let lastError = '';
  for (const model of modelCandidates) {
    const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${getKey()}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      lastError = `Leere Antwort von ${model}`;
      continue;
    }
    const errText = await res.text();
    lastError = `${model} ${res.status}: ${errText.slice(0, 200)}`;
    // Bei 401/403 (Auth) sofort abbrechen, sonst weiterprobieren
    if (res.status === 401 || res.status === 403) throw new Error(`Gemini ${lastError}`);
    console.warn(`Fallback Gemini-Modell wegen Fehler auf ${model}:`, lastError);
  }
  throw new Error(`Gemini: alle Modelle exhausted: ${lastError}`);
}

export async function geminiVision(req: GeminiVisionRequest): Promise<string> {
  // Modell-Fallback-Kaskade gegen Quota-Limits
  // gemini-2.0-flash-exp hat höhere Free-Tier-Limits als gemini-2.0-flash
  const modelCandidates = req.model
    ? [req.model]
    : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite'];

  const body = {
    contents: [{
      parts: [
        { text: req.userPrompt },
        { inline_data: { mime_type: req.mimeType, data: req.fileBase64 } },
      ],
    }],
    systemInstruction: { parts: [{ text: req.systemPrompt }] },
    generationConfig: {
      temperature: req.temperature ?? 0.1,
      maxOutputTokens: req.maxTokens ?? 8192,
      ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  let lastError = '';
  for (const model of modelCandidates) {
    const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${getKey()}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      lastError = `Empty response from ${model}`;
      continue;
    }
    const errText = await res.text();
    lastError = `${model} ${res.status}: ${errText.slice(0, 200)}`;
    // Bei 401/403 (Auth) sofort abbrechen, sonst weiterprobieren
    if (res.status === 401 || res.status === 403) throw new Error(`Gemini Vision ${lastError}`);
    console.warn(`Fallback Vision-Modell wegen Fehler auf ${model}:`, lastError);
  }
  throw new Error(`Gemini Vision: alle Modelle exhausted. Letzter Fehler: ${lastError}`);
}

/**
 * Toleranter JSON-Parser für AI-Antworten.
 * Behandelt:
 *   - Markdown-Fences (```json ... ```)
 *   - Truncated JSON (schneidet abgebrochene Strings/Arrays sauber ab)
 *   - Trailing commas
 *   - Text vor/nach JSON
 */
export function parseJsonResponse<T = unknown>(text: string): T {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let candidate = (jsonMatch ? jsonMatch[1] : text).trim();

  // Erstes { suchen
  const firstBrace = candidate.indexOf('{');
  if (firstBrace > 0) candidate = candidate.slice(firstBrace);

  // Versuch 1: direkt parsen
  try { return JSON.parse(candidate) as T; } catch {}

  // Versuch 2: alles bis zum letzten } nehmen
  const lastBrace = candidate.lastIndexOf('}');
  if (lastBrace > 0) {
    try { return JSON.parse(candidate.slice(0, lastBrace + 1)) as T; } catch {}
  }

  // Versuch 3: Truncation-Recovery – schneide unvollständigen Teil ab
  // und schließe offene Strukturen
  try {
    const recovered = recoverTruncatedJson(candidate);
    return JSON.parse(recovered) as T;
  } catch (e) {
    throw new Error('JSON aus KI-Antwort nicht parsbar (recovery failed): ' + (e instanceof Error ? e.message : '') + ' :: ' + candidate.slice(0, 200));
  }
}

function recoverTruncatedJson(s: string): string {
  // Schließe offene Strings, Arrays, Objekte
  let depth = 0;
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  let lastSafePos = 0;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; if (!inString) lastSafePos = i + 1; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') { stack.push(c); depth++; }
    else if (c === '}' || c === ']') { stack.pop(); depth--; if (depth === 0) lastSafePos = i + 1; }
    else if (c === ',' && depth > 0) { lastSafePos = i; }
  }

  // Cut off at last safe position and close open structures
  let result = s.slice(0, lastSafePos);
  // Remove trailing comma
  result = result.replace(/,\s*$/, '');
  // Close open structures from stack
  while (stack.length > 0) {
    const open = stack.pop();
    result += open === '{' ? '}' : ']';
  }
  return result;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
