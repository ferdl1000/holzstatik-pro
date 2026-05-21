# Deployment-Anleitung

## Status

✅ **Bereits deployed unter https://dachplan-assistent.vercel.app**

- Frontend: Vercel (Team `sepp-s-projects`)
- Backend: Supabase Projekt `tcwrbkmjhxaemiapedfw` (Region West EU, Paris)
- KI: Gemini 2.0 Flash via Google AI Studio

## Architektur

```
Browser (User)
   ↓
Vercel: dachplan-assistent.vercel.app (Vite/React-Frontend)
   ↓
Supabase tcwrbkmjhxaemiapedfw:
   - Postgres (Projekte, Audit, System-Einstellungen, Profile, Rollen)
   - Storage Bucket "plan-documents" (PDF-Uploads)
   - Auth (E-Mail + Password)
   - Edge Functions:
       agent-document        → Gemini Vision (PDF → strukturierte Daten)
       agent-address         → Nominatim/Open-Elevation (Geocoding + Zonen)
       agent-structure       → Gemini Text (Tragsystem-Empfehlung)
       agent-orchestrator    → koordiniert alle Agenten
       analyze-plan          → Legacy-Endpoint (kompatibel)
       generate-report       → HTML-Bericht
```

## Erforderliche Accounts

1. **Google AI Studio** — https://aistudio.google.com/apikey (kostenloses Free-Tier)
2. **Supabase** — https://supabase.com
3. **Vercel** — https://vercel.com

## Erstmaliges Setup (von Null)

### 1. Supabase

```bash
# CLI installieren
npm i -g supabase

# Access Token aus Dashboard → Account → Tokens
export SUPABASE_ACCESS_TOKEN=sbp_XXXX

# Projekt erstellen (oder bestehendes nehmen)
supabase projects create my-dachplan --org-id <org> --db-password <pw> --region eu-central-1

# Linken
supabase link --project-ref <project-ref>

# Migrationen
supabase db push

# Gemini-Key als Server-Secret
supabase secrets set GEMINI_API_KEY=AIzaXXXX

# Edge Functions deployen
supabase functions deploy agent-document --no-verify-jwt
supabase functions deploy agent-address --no-verify-jwt
supabase functions deploy agent-structure --no-verify-jwt
supabase functions deploy agent-orchestrator --no-verify-jwt
supabase functions deploy analyze-plan --no-verify-jwt
supabase functions deploy generate-report --no-verify-jwt
```

### 2. Vercel

```bash
npm i -g vercel
export VERCEL_TOKEN=vcp_XXXX

# Env-Variablen setzen (3× wiederholen, einmal pro Variable)
echo "<project-ref>" | vercel env add VITE_SUPABASE_PROJECT_ID production --token $VERCEL_TOKEN
echo "<anon-key>" | vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production --token $VERCEL_TOKEN
echo "https://<ref>.supabase.co" | vercel env add VITE_SUPABASE_URL production --token $VERCEL_TOKEN

# Deploy
vercel --prod --yes --token $VERCEL_TOKEN
```

## Update-Deployment

Nach Code-Änderungen:

```bash
# Frontend
vercel --prod --yes --scope sepp-s-projects --token $VERCEL_TOKEN --force

# Edge Functions (nur die geänderten)
supabase functions deploy agent-document --no-verify-jwt

# DB-Änderungen
supabase db push
```

## Troubleshooting

- **Frontend zeigt Auth-Fehler**: Env-Variablen prüfen — die drei `VITE_SUPABASE_*` müssen in Vercel gesetzt sein und mit denen im Supabase-Dashboard übereinstimmen.
- **Edge Function liefert 500**: `supabase functions logs <name>` schauen.
- **KI antwortet nicht**: `supabase secrets list` checken ob `GEMINI_API_KEY` gesetzt ist.
- **Geocoding leer**: Nominatim hat Rate-Limit (1 req/s). Bei Massenanfragen LocationIQ-Account anlegen.

## Kosten

- **Vercel**: Free-Tier reicht (100 GB Bandbreite, Hobby-Plan)
- **Supabase**: Free-Tier reicht (500 MB DB, 1 GB Storage, 2 Mio Edge-Function-Aufrufe/Monat)
- **Gemini 2.0 Flash**: Free-Tier 15 Req/Min, 1500/Tag, 1 Mio Tokens/Min — reicht locker für KMU-Nutzung
- **Domain (optional)**: bei Vercel ab ~12 €/Jahr

**→ Komplettbetrieb kostet aktuell 0 €.**
