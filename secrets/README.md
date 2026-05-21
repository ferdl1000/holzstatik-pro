# Verschlüsselte Secrets

Diese Datei beschreibt wie du die verschlüsselten Zugangsdaten auf einem anderen PC entschlüsseln und nutzen kannst.

## Was ist verschlüsselt?

`secrets.env.enc` enthält AES-256-CBC verschlüsselt:
- `GEMINI_API_KEY` — Google AI Studio
- `SUPABASE_ACCESS_TOKEN` — Supabase CLI
- `VERCEL_TOKEN` — Vercel CLI
- `VITE_SUPABASE_PROJECT_ID` — Supabase Projekt-ID
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase Anon Key
- `VITE_SUPABASE_URL` — Supabase URL

## Entschlüsseln

Passwort kennst du.

```bash
# Mit OpenSSL entschlüsseln:
openssl aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
  -in secrets/secrets.env.enc -out .env \
  -k 'DEIN_PASSWORT'

# Dann normal arbeiten
npm install --legacy-peer-deps
npm run dev
```

Falls openssl nicht installiert: per Chocolatey `choco install openssl` (Windows)
oder Git for Windows bringt es mit.

## Neue Secrets verschlüsseln

```bash
openssl aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -in .env -out secrets/secrets.env.enc \
  -k 'DEIN_PASSWORT'
```

## Sicherheit

Selbst mit dem verschlüsselten File ist es ohne Passwort praktisch unmöglich, an die Klartext-Werte zu kommen (256-bit AES + 100k PBKDF2-Iterationen).
Sollte das Passwort jemals leaken: **alle Tokens rotieren** (neue erstellen, alte invalidieren).
