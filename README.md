# Dachplan-Assistent

**Statische Vorbemessung für Dachtragwerke aus österreichischen Einreichplänen.**

Lade einen PDF-Einreichplan hoch — die App liest mit KI Bauadresse, Geometrie und Tragsystem aus, ermittelt automatisch Schnee- und Windlasten nach ÖNORM, dimensioniert Holzbauteile nach Eurocode 5, erzeugt einen prüffähigen PDF-Bericht und eine Kostenschätzung.

🌐 **Live: https://dachplan-assistent.vercel.app**

---

## Was die App kann

### 🤖 KI-Multi-Agent-Pipeline (Gemini 2.0 Flash)
- `agent-document` — PDF-Extraktion: Texte, Maße, Adressen, Dachhinweise
- `agent-address` — Bauadresse identifizieren, geocoden (Nominatim/OSM), Seehöhe (Open-Elevation)
- `agent-structure` — Tragsystem empfehlen (Sparrendach, Kehlbalken, Pfettendach, BSH-Hauptträger)
- `agent-orchestrator` — koordiniert alle Agenten parallel

### 🧮 Berechnungs-Engine (`src/lib/calc/`)
- **Schneelast ÖNORM B 1991-1-3** mit Zonen 1-4 + Seehöhen-Formel + Formbeiwert + einseitige Lastfälle
- **Windlast ÖNORM B 1991-1-4** mit Zonen, Expositionsbeiwerten, Druck/Sog für Satteldach
- **Eigengewichts-Bibliothek** (Ziegel, Blech, Schiefer, Gründach, PV, Dämmungen, Innenausbau)
- **EC5-Holzbemessung**: Biegung, Schub, Auflagerpressung, Durchbiegung (sofort + Kriechen), Kippstabilität
- **Stützen mit Knicknachweis** um beide Achsen + Druck-Biegung-Interaktion
- **Leimbinder/BSH** inkl. **gebogene Träger mit Querzug-Nachweis** für 25 m+ stützenfrei
- **Querschnittsoptimierer**: findet kleinsten Standard-Querschnitt der passt

### 📍 Geocoding + Zonen-Lookup
- Adresse → Koordinaten + Seehöhe
- PLZ → Bundesland → Schnee-/Windzone mit Sonderfällen (Hochgebirge)

### 💰 Preis-/Kostenmodul
- Default-Preisliste (KVH, BSH, Eindeckung, Dämmung, Verbinder, Lohn)
- Pro Position überschreibbar
- Aufschläge konfigurierbar (Verschnitt, Gemeinkosten, Gewinn, MwSt)
- CSV-Export + PDF-Integration

### 📄 PDF-Bericht
- Prüffähiger Vorbemessungs-Bericht mit allen Nachweisen, Formeln, Eingangswerten
- Optionaler **Laien-Modus** in einfacher Sprache
- Audit-Trail anhängen

### 🏠 3D-Visualisierung
- Three.js / React-Three-Fiber
- Klick auf Bauteil → Details
- Farbcodierung nach Ausnutzungsgrad (🟢 / 🟡 / 🔴)

### 📚 Hilfesystem
- Info-Tooltips an jedem Fachbegriff
- **Doppel-Einheiten** überall: kN **und** kg
- "Warum?"-Buttons mit Klartext-Erklärungen
- Glossar mit ~20 Begriffen, je inkl. "Erklärt's deiner Oma"

---

## Tech-Stack

- **Frontend:** Vite + React 18 + TypeScript, shadcn/ui, Tailwind, React Router, TanStack Query, React-Three-Fiber, jsPDF
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions)
- **KI:** Gemini 2.0 Flash via Google AI Studio (kostenfreies Free-Tier)
- **Deployment:** Vercel (Frontend) + Supabase (Backend)

---

## Lokales Setup (auch von anderem PC mit Claude Code)

```bash
# 1. Klonen
git clone https://github.com/ferdl1000/holzstatik-pro.git
cd holzstatik-pro

# 2. Dependencies
npm install --legacy-peer-deps

# 3. .env anlegen
cp .env.example .env

# 4. .env mit deinen Werten füllen (siehe unten)

# 5. Dev-Server starten
npm run dev   # http://localhost:5173

# 6. Tests
npm test      # 33 Tests

# 7. Live-Deployment (Vercel + Supabase) – siehe DEPLOYMENT.md
```

### Mit Claude Code auf einem anderen PC weiterarbeiten

1. `git clone https://github.com/ferdl1000/holzstatik-pro.git`
2. In Claude Code öffnen — der ganze Code, alle Tests und Edge Functions sind da
3. Folgendes brauchst du selbst (nicht im Repo aus Sicherheitsgründen):
   - **Gemini API Key** ➜ https://aistudio.google.com/apikey (kostenlos)
   - **Supabase Project** ➜ https://supabase.com (Free Tier reicht) → Project Ref + Anon Key + Access Token
   - **Vercel Account** ➜ https://vercel.com → Token aus Account → Tokens
4. Werte in `.env` eintragen
5. Deployen mit `vercel --prod` und `supabase functions deploy ...`
   (siehe [DEPLOYMENT.md](./DEPLOYMENT.md))

Das aktuell deployte Beispiel läuft unter https://dachplan-assistent.vercel.app

`.env`-Variablen (siehe `.env.example`):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` — vom Supabase-Projekt
- `GEMINI_API_KEY` — von https://aistudio.google.com/apikey
- `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN` — nur für Deployment

## Tests

```bash
npm test       # alle Tests einmalig
npm run test:watch
```

## Build

```bash
npm run build  # → dist/
```

## Deployment

### Frontend (Vercel)

```bash
vercel --prod --scope <your-scope>
```

Env-Variablen müssen auf Vercel gesetzt sein (Dashboard → Settings → Environment Variables) – die drei `VITE_SUPABASE_*`.

### Backend (Supabase)

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...
supabase link --project-ref <ref>
supabase db push                        # Migrationen
supabase secrets set GEMINI_API_KEY=... # Server-Secret
supabase functions deploy agent-document --no-verify-jwt
supabase functions deploy agent-address --no-verify-jwt
supabase functions deploy agent-structure --no-verify-jwt
supabase functions deploy agent-orchestrator --no-verify-jwt
supabase functions deploy analyze-plan --no-verify-jwt
supabase functions deploy generate-report --no-verify-jwt
```

Siehe [DEPLOYMENT.md](./DEPLOYMENT.md) für vollständige Anleitung.

---

## Wichtiger Hinweis

Diese App erstellt **Vorbemessungen**. Sie ersetzt **keine** prüffähige statische Berechnung durch einen Ziviltechniker / Statiker. Alle Werte sind vor Ausführung zu prüfen und durch eine Fachperson zu bestätigen. Der Anwender trägt die volle Verantwortung.
