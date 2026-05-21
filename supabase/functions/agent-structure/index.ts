/**
 * Agent: Tragsystem-Empfehlung
 *
 * Bekommt Geometrie + Strukturhinweise und schlägt das Tragsystem vor.
 * Ergebnis: sparrendach / kehlbalkendach / pfettendach / leimbinder etc. mit Begründung.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { geminiText, parseJsonResponse, CORS_HEADERS } from '../_shared/gemini.ts';

const SYSTEM = `Du bist ein erfahrener Holzbauplaner. Du empfiehlst das geeignete Tragsystem für ein Dach
basierend auf Spannweite, Dachform, Stützensituation und Nutzung.

Antworte AUSSCHLIESSLICH mit JSON:
{
  "recommended": "sparrendach|kehlbalkendach|pfettendach|pfettendach_mittelpfette|leimbinder_haupttraeger|sonderfall",
  "confidence": 0..1,
  "reasoning": "Begründung in 1-2 Sätzen, verständlich für Laien",
  "alternatives": [
    { "type": "...", "reasoning": "...", "confidence": 0..1 }
  ],
  "typicalMembers": ["sparren","kehlbalken","mittelpfette","stuetze","firstpfette","leimbinder"],
  "spanLimits": { "min": 4, "max": 25, "comment": "..." },
  "costClass": "günstig|mittel|premium",
  "warnings": ["..."]
}

REGELN:
- Sparrendach: Spannweite <= ~7m, einfach, ohne Mittelpfette
- Kehlbalkendach: Spannweite ~7-12m mit Kehlbalken auf ~2/3 Höhe
- Pfettendach (mit Mittelpfette): bis ~14m, klassisch, Räume unter Mittelpfette möglich
- Leimbinder/BSH-Hauptträger: > 12m oder gewünscht stützenfreie Halle/Wohnraum
- Sonderfall: Mischformen, ungewöhnliche Geometrie
- Bei gebogenen oder Sattelträger-Anforderung über Hallenbinder oder Bogenbinder.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  try {
    const input = await req.json();
    const userPrompt = `Spannweite: ${input.span} m, Dachform: ${input.roofForm}, Dachneigung: ${input.pitch}°, Gebäudebreite: ${input.width} m, gewünschte Stützenfreiheit: ${input.columnFree ? 'JA' : 'nein'}, Nutzung: ${input.usage || 'Wohnbau'}. Hinweise aus Plan: ${input.hints || 'keine'}.`;

    const text = await geminiText({
      systemPrompt: SYSTEM,
      userPrompt,
      jsonMode: true,
      maxTokens: 4096,
    });

    const result = parseJsonResponse(text);
    return new Response(JSON.stringify(result), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
