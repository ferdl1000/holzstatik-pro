import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { SectionCard } from '@/components/shared/SectionCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Key, Users, Shield, Save, Plus, Trash2, Eye, EyeOff, Database, Activity, Building2, Brain } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CompanyProfileEditor } from '@/components/admin/CompanyProfileEditor';
import { ApiKeyField } from '@/components/admin/ApiKeyField';
import { getAnalysisQuality, setAnalysisQuality, type AnalysisQuality } from '@/lib/settings/analysisQuality';

interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description: string;
  is_secret: boolean;
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
}

interface ErkennungsRegel {
  id: string;
  field: string;
  wrong_value: string | null;
  correct_value: string;
  trigger_context: string | null;
  reason: string | null;
  applied_count: number;
  created_at: string;
}

const Admin = () => {
  const [activeSection, setActiveSection] = useState<'settings' | 'users' | 'system' | 'firma' | 'lernregeln'>('settings');
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [lernRegeln, setLernRegeln] = useState<ErkennungsRegel[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newIsSecret, setNewIsSecret] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [analysisQuality, setAnalysisQualityState] = useState<AnalysisQuality>(getAnalysisQuality());
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [activeSection]);

  async function loadData() {
    setLoading(true);
    if (activeSection === 'settings') {
      const { data } = await supabase.from('system_settings').select('*').order('key');
      setSettings((data as SystemSetting[]) || []);
    } else if (activeSection === 'users') {
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, email');
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');
      if (profiles) {
        setUsers(profiles.map(p => ({
          ...p,
          roles: roles?.filter(r => r.user_id === p.user_id).map(r => r.role) || [],
        })));
      }
    } else if (activeSection === 'lernregeln') {
      const { data } = await supabase.from('erkennungs_regeln').select('*').order('created_at', { ascending: false });
      setLernRegeln((data as ErkennungsRegel[]) || []);
    }
    setLoading(false);
  }

  async function deleteLernRegel(id: string) {
    await supabase.from('erkennungs_regeln').delete().eq('id', id);
    setLernRegeln(prev => prev.filter(r => r.id !== id));
    toast({ title: 'Lern-Regel gelöscht' });
  }

  async function addSetting() {
    if (!newKey.trim()) return;
    const { error } = await supabase.from('system_settings').insert({
      key: newKey.trim(),
      value: newValue,
      description: newDesc,
      is_secret: newIsSecret,
      updated_by: user?.id,
    });
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Einstellung gespeichert' });
      setNewKey('');
      setNewValue('');
      setNewDesc('');
      setNewIsSecret(false);
      loadData();
    }
  }

  async function updateSetting(id: string, value: string) {
    const { error } = await supabase.from('system_settings').update({ value, updated_by: user?.id }).eq('id', id);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Aktualisiert' });
      loadData();
    }
  }

  async function deleteSetting(id: string) {
    await supabase.from('system_settings').delete().eq('id', id);
    loadData();
  }

  async function updateUserRole(userId: string, newRole: string) {
    // Remove existing roles, add new one
    await supabase.from('user_roles').delete().eq('user_id', userId);
    const { error } = await supabase.from('user_roles').insert([{ user_id: userId, role: newRole as any }]);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Rolle aktualisiert' });
      loadData();
    }
  }

  const toggleSecret = (id: string) => {
    setVisibleSecrets(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const sections = [
    { key: 'settings' as const, label: 'API-Keys & Einstellungen', icon: Key },
    { key: 'users' as const, label: 'Benutzerverwaltung', icon: Users },
    { key: 'firma' as const, label: 'Firma', icon: Building2 },
    { key: 'lernregeln' as const, label: 'Lern-Regeln', icon: Brain },
    { key: 'system' as const, label: 'Systemstatus', icon: Activity },
  ];

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Administration</h1>
            <p className="text-sm text-muted-foreground">Systemeinstellungen, API-Keys und Benutzerverwaltung</p>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 border-b pb-3">
          {sections.map((s) => (
            <Button
              key={s.key}
              variant={activeSection === s.key ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveSection(s.key)}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </Button>
          ))}
        </div>

        {/* API Keys & Settings */}
        {activeSection === 'settings' && (
          <div className="space-y-6">
            <SectionCard
              title="Kern-Konfiguration — nur diese 2 Keys nötig"
              subtitle='Key einfügen, „Speichern" klicken — alles andere (Modelle, Endpunkte, Fallbacks) ist bereits fix vorkonfiguriert. Beide Keys sind im kostenlosen Free-Tier erhältlich, keine Kreditkarte nötig.'
            >
              <div className="space-y-4">
                <ApiKeyField
                  settingKey="GOOGLE_AI_API_KEY"
                  label="Google Gemini API-Key (kostenlos)"
                  required
                  description="Treibt die gesamte Plananalyse, Statik-Vorbemessung und alle KI-Berichte an (inkl. der Endkontrolle). Ohne eigenen Key läuft ein geteiltes Gratis-Kontingent mit, das bei mehreren Analysen am Tag ein Limit erreichen kann — mit eigenem Key gehört das Kontingent nur dir."
                  helpUrl="https://aistudio.google.com/app/apikey"
                  helpUrlLabel="Kostenlosen Key holen: aistudio.google.com/app/apikey"
                  steps={[
                    'aistudio.google.com öffnen → mit Google-Konto anmelden (kostenlos, keine Kreditkarte nötig).',
                    '„Get API key" → „Create API key" klicken.',
                    'Den angezeigten Key kopieren und unten einfügen.',
                  ]}
                  currentValue={settings.find(s => s.key === 'GOOGLE_AI_API_KEY')?.value ?? ''}
                  onSaved={loadData}
                />
                <ApiKeyField
                  settingKey="OPENROUTER_API_KEY"
                  label="OpenRouter API-Key (kostenlos)"
                  required={false}
                  description="Zweites, unabhängiges KI-Modell (kostenloses Free-Tier) als Ausweich- und Gegenprüf-Modell — springt ein wenn Gemini ausgelastet ist, und macht die Endkontrolle (3-fach-Gegenprüfung) aussagekräftiger, weil dann ein wirklich anderes Modell mitprüft statt nur Gemini zweimal."
                  helpUrl="https://openrouter.ai/settings/keys"
                  helpUrlLabel="Kostenlosen Key holen: openrouter.ai/settings/keys"
                  steps={[
                    'openrouter.ai öffnen → „Sign Up" (am schnellsten mit Google-Konto, kostenlos).',
                    'Avatar oben rechts → „Keys" → „Create Key".',
                    'Den angezeigten Key (beginnt mit sk-or-v1-…) kopieren und unten einfügen — wird nur einmal angezeigt.',
                  ]}
                  currentValue={settings.find(s => s.key === 'OPENROUTER_API_KEY')?.value ?? ''}
                  onSaved={loadData}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Alle Einstellungen (erweitert)"
              subtitle="Für den Normalbetrieb nicht nötig — nur relevant für zusätzliche, selten gebrauchte Parameter"
            >
              {settings.length === 0 && !loading ? (
                <p className="text-sm text-muted-foreground py-4">Keine weiteren Einstellungen vorhanden.</p>
              ) : (
                <div className="space-y-3">
                  {settings.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-md border p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium font-mono">{s.key}</span>
                          {s.is_secret && <Badge variant="outline" className="text-[10px]">Secret</Badge>}
                        </div>
                        {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type={s.is_secret && !visibleSecrets.has(s.id) ? 'password' : 'text'}
                          value={s.value}
                          onChange={(e) => {
                            setSettings(prev => prev.map(p => p.id === s.id ? { ...p, value: e.target.value } : p));
                          }}
                          className="w-64 font-mono text-xs h-8"
                        />
                        {s.is_secret && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleSecret(s.id)}>
                            {visibleSecrets.has(s.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateSetting(s.id, s.value)}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteSetting(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Analyse-Genauigkeit"
              subtitle="Standard nutzt Gemini Flash (kostenlos) + Geometrie-Schiedsrichter für die Dachneigung. Hochgenau nutzt Gemini Pro für maximale Lese-Genauigkeit bei wichtigen Plänen."
            >
              <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
                <p className="font-medium text-primary">💡 Empfehlung für den Produktivbetrieb (Endkunden)</p>
                <p className="text-muted-foreground leading-relaxed">
                  Trage oben unter <span className="font-mono">GOOGLE_AI_API_KEY</span> deinen{' '}
                  <strong>eigenen Google-AI-Key</strong> ein (aistudio.google.com → „Get API key" — kostenlos, keine Kreditkarte nötig).
                  Sobald er hinterlegt ist, nutzt die App <strong>automatisch</strong> den stabilen{' '}
                  <span className="font-mono">gemini-2.5-pro</span> und dein eigenes (hohes) Kontingent —
                  ohne Schalter. Das löst sowohl das Tageslimit (429-Abbrüche) als auch die schwankende
                  Erkennung. {settings.some(s => s.key === 'GOOGLE_AI_API_KEY' && s.value?.length > 20)
                    ? <span className="text-status-green font-medium">✓ Eigener Key erkannt — Pro-Modus aktiv.</span>
                    : <span className="text-status-yellow font-medium">Noch kein eigener Key — App nutzt das geteilte Gratis-Kontingent (Flash).</span>}
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md border p-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Hochgenau-Modus (verbraucht mehr Kontingent)</span>
                    <Badge variant={analysisQuality === 'hochgenau' ? 'default' : 'outline'} className="text-[10px]">
                      {analysisQuality === 'hochgenau' ? 'Gemini Pro aktiv' : 'Gemini Flash (Standard)'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Aktiviert <span className="font-mono">gemini-2.5-pro</span> für die Plananalyse — liest kleine Beschriftungen
                    wie „DN&nbsp;10°" zuverlässiger. Läuft auch mit dem kostenlosen Gemini-Kontingent, das Tageslimit für
                    Pro ist dort aber niedriger als für Flash. Bei erschöpftem Pro-Kontingent fällt die Analyse automatisch
                    auf Flash zurück. Im Standard-Modus werden fehlende Neigungen deterministisch aus First-/Trauf­höhe und
                    Breite berechnet.
                  </p>
                </div>
                <Switch
                  checked={analysisQuality === 'hochgenau'}
                  onCheckedChange={(on) => {
                    const next: AnalysisQuality = on ? 'hochgenau' : 'standard';
                    setAnalysisQuality(next);
                    setAnalysisQualityState(next);
                    toast({
                      title: on ? 'Hochgenau-Modus aktiviert' : 'Standard-Modus aktiv',
                      description: on
                        ? 'Neue Analysen nutzen Gemini Pro (niedrigeres Tageslimit im Gratis-Tarif).'
                        : 'Neue Analysen nutzen Gemini Flash (kostenlos) + Geometrie-Schiedsrichter.',
                    });
                  }}
                />
              </div>
            </SectionCard>

            <SectionCard title="Neue Einstellung hinzufügen" subtitle="API-Key oder Konfigurationsparameter erstellen">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Schlüssel</Label>
                  <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="z.B. OCR_API_KEY" className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Wert</Label>
                  <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="API-Key oder Wert" className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Beschreibung</Label>
                  <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Wofür wird dieser Key verwendet?" />
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={newIsSecret} onCheckedChange={setNewIsSecret} />
                    <Label className="text-xs">Secret (maskiert anzeigen)</Label>
                  </div>
                  <Button onClick={addSetting} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />Hinzufügen
                  </Button>
                </div>
              </div>
            </SectionCard>

          </div>
        )}

        {/* Firma */}
        {activeSection === 'firma' && <CompanyProfileEditor />}

        {/* User Management */}
        {activeSection === 'users' && (
          <SectionCard title="Benutzer" subtitle="Registrierte Benutzer und Rollenzuweisung">
            {users.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground py-4">Keine Benutzer gefunden.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>E-Mail</th>
                    <th>Rolle</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id}>
                      <td className="font-medium text-sm">{u.display_name || '-'}</td>
                      <td className="text-xs text-muted-foreground">{u.email}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          {u.roles.map(r => (
                            <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                              {r === 'admin' ? 'Admin' : r === 'moderator' ? 'Prüfer' : 'Benutzer'}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        <Select
                          value={u.roles[0] || 'user'}
                          onValueChange={(val) => updateUserRole(u.user_id, val)}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="moderator">Prüfer</SelectItem>
                            <SelectItem value="user">Benutzer</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        )}

        {/* Lern-Regeln */}
        {activeSection === 'lernregeln' && (
          <SectionCard
            title="Lern-Regeln"
            subtitle="Automatisch gespeicherte Korrekturen — werden bei ähnlichen Plänen angewandt"
          >
            {lernRegeln.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground py-4">
                Noch keine Lern-Regeln vorhanden. Korrekturen im Geometrie- oder Struktur-Tab werden automatisch hier gespeichert.
              </p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Feld</th>
                    <th>Falsch erkannt</th>
                    <th>Korrekt</th>
                    <th>Kontext</th>
                    <th>Angewandt</th>
                    <th>Erstellt</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lernRegeln.map((r) => (
                    <tr key={r.id}>
                      <td><Badge variant="outline" className="font-mono text-[10px]">{r.field}</Badge></td>
                      <td className="text-xs text-muted-foreground">{r.wrong_value ?? '—'}</td>
                      <td className="text-xs font-medium text-status-green">{r.correct_value}</td>
                      <td className="text-xs text-muted-foreground">{r.trigger_context ?? '—'}</td>
                      <td className="text-xs font-mono text-center">{r.applied_count}</td>
                      <td className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('de-AT')}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteLernRegel(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        )}

        {/* System Status */}
        {activeSection === 'system' && (
          <div className="space-y-6">
            <SectionCard title="Systemstatus" subtitle="Übersicht der Backend-Dienste">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Datenbank', status: 'online', icon: Database },
                  { label: 'Authentifizierung', status: 'online', icon: Shield },
                  { label: 'Dateispeicher', status: 'online', icon: Key },
                  { label: 'KI-Agenten', status: 'bereit', icon: Activity },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border p-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-status-green-bg">
                      <item.icon className="h-4 w-4 text-status-green" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-status-green capitalize">{item.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Versionsinformation" subtitle="Aktuelle Anwendungsversion">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Version</span>
                  <p className="font-mono font-medium">1.0.0-beta</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Build</span>
                  <p className="font-mono font-medium">{new Date().toISOString().slice(0, 10)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Normbasis</span>
                  <p className="font-mono font-medium">Eurocode + ÖNORM</p>
                </div>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Admin;
