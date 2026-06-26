-- Kachel-Analyse: Speicherpfade der hochauflösenden Plan-Teilabschnitte.
-- Der Client zerlegt große Pläne in überlappende Kacheln; agent-document liest
-- alle Kacheln in EINEM Gemini-Call (multi-image) für maximale Lese-Genauigkeit.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS tile_paths jsonb;
