import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface ApiKeyFieldProps {
  /** system_settings.key — z.B. 'GOOGLE_AI_API_KEY' */
  settingKey: string;
  label: string;
  required: boolean;
  description: string;
  helpUrl: string;
  helpUrlLabel: string;
  steps: string[];
  /** Aktueller Wert aus der DB (leer wenn noch nicht gesetzt) */
  currentValue: string;
  /** Nach erfolgreichem Speichern — lädt die Einstellungen neu */
  onSaved: () => void;
}

/**
 * Ein Eingabefeld pro API-Key: Key einfügen, "Speichern" klicken — fertig.
 * Legt die system_settings-Zeile automatisch an (upsert on key), keine
 * Schlüssel-Namen oder Secret-Toggles mehr nötig — das ist hier alles fix
 * vorkonfiguriert, damit garantiert nichts falsch eingetragen werden kann.
 */
export function ApiKeyField({
  settingKey, label, required, description, helpUrl, helpUrlLabel, steps, currentValue, onSaved,
}: ApiKeyFieldProps) {
  const [value, setValue] = useState(currentValue);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => { setValue(currentValue); }, [currentValue]);

  const configured = currentValue.trim().length > 20;
  const dirty = value.trim() !== currentValue.trim();

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from('system_settings').upsert(
      { key: settingKey, value: value.trim(), description, is_secret: true, updated_by: user?.id },
      { onConflict: 'key' },
    );
    setSaving(false);
    if (error) {
      toast({ title: 'Fehler beim Speichern', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${label} gespeichert`, description: 'Wird ab sofort automatisch verwendet.' });
      onSaved();
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{label}</p>
            {required
              ? <Badge className="text-[10px]">Erforderlich</Badge>
              : <Badge variant="outline" className="text-[10px]">Optional — empfohlen</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-2xl">{description}</p>
        </div>
        {configured
          ? <Badge className="bg-status-green text-status-green-bg shrink-0 gap-1"><CheckCircle2 className="h-3 w-3" />Aktiv</Badge>
          : <Badge variant="outline" className="text-status-yellow border-status-yellow shrink-0">Noch nicht gesetzt</Badge>}
      </div>

      <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-0.5">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary underline underline-offset-2 hover:text-primary/80">
        ↗ {helpUrlLabel}
      </a>

      <div className="flex items-center gap-2 pt-1">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Key hier einfügen…"
          className="font-mono text-xs h-9"
        />
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setVisible(v => !v)}>
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={handleSave} disabled={saving || !dirty || !value.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Speichern
        </Button>
      </div>
    </div>
  );
}
