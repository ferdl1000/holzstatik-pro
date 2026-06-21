-- Selbst-lernende Erkennungs-Regeln: Manuelle Korrekturen werden als Regeln gespeichert
-- und bei ähnlichen Plänen automatisch angewandt.

CREATE TABLE public.erkennungs_regeln (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Was wurde falsch erkannt?
  field TEXT NOT NULL,              -- 'roofPitch', 'coveringType', 'roofForm', etc.
  -- Erkennungs-Muster (wann gilt die Regel?)
  trigger_pattern TEXT,             -- z.B. Planer-Name, PLZ, Schlüsselwort
  trigger_context TEXT,             -- z.B. 'Planer: Lutterschmied'
  -- Die Korrektur
  wrong_value TEXT,
  correct_value TEXT NOT NULL,
  reason TEXT,
  -- Häufigkeit (wie oft bestätigt)
  applied_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.erkennungs_regeln ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own rules" ON public.erkennungs_regeln
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins see all rules" ON public.erkennungs_regeln
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ));
