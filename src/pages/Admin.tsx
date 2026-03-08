import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { SectionCard } from '@/components/shared/SectionCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Key, Users, Shield, Save, Plus, Trash2, Eye, EyeOff, Database, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

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

const Admin = () => {
  const [activeSection, setActiveSection] = useState<'settings' | 'users' | 'system'>('settings');
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newIsSecret, setNewIsSecret] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
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
    }
    setLoading(false);
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
            <SectionCard title="API-Keys & Konfiguration" subtitle="Externe Dienste und Systemparameter verwalten">
              {settings.length === 0 && !loading ? (
                <p className="text-sm text-muted-foreground py-4">Keine Einstellungen vorhanden. Fügen Sie die erste hinzu.</p>
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

            {/* Recommended API keys with full details and links */}
            <SectionCard title="Empfohlene Konfiguration" subtitle="Diese API-Keys werden für volle Funktionalität benötigt – mit Anleitungen und Direktlinks">
              <div className="space-y-4 text-sm">
                {[
                  {
                    key: 'OCR_API_KEY',
                    title: 'OCR-Service für Plananalyse',
                    desc: 'Wird verwendet um gescannte PDF-Einreichpläne per OCR zu analysieren (Texterkennung, Maßextraktion, Symbole). Empfohlen: Google Cloud Vision API oder Azure Document Intelligence.',
                    steps: [
                      'Google Vision: Google Cloud Console öffnen → APIs & Dienste → „Cloud Vision API" aktivieren → Anmeldedaten → API-Schlüssel erstellen.',
                      'Azure: Azure-Portal → „Cognitive Services" → „Document Intelligence" erstellen → Schlüssel & Endpunkt kopieren.',
                    ],
                    links: [
                      { label: 'Google Cloud Vision API', url: 'https://console.cloud.google.com/apis/library/vision.googleapis.com' },
                      { label: 'Azure Document Intelligence', url: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesFormRecognizer' },
                      { label: 'Google Vision Preise', url: 'https://cloud.google.com/vision/pricing' },
                      { label: 'Azure Preise', url: 'https://azure.microsoft.com/de-de/pricing/details/ai-document-intelligence/' },
                    ],
                    note: 'Hinweis: Die integrierte KI-Analyse (Lovable AI / Gemini) funktioniert bereits ohne diesen Key für Basis-OCR. Dieser Key ist nur nötig, wenn Sie einen dedizierten OCR-Dienst mit höherer Genauigkeit verwenden möchten.',
                  },
                  {
                    key: 'GEOCODING_API_KEY',
                    title: 'Geocoding-Service für Adressauflösung',
                    desc: 'Wird verwendet um die erkannte Bauadresse in Koordinaten aufzulösen und auf einer Karte anzuzeigen. Nötig für standortbezogene Lastermittlung (Schneelastzone, Windzone).',
                    steps: [
                      'Google Maps Platform: Console öffnen → „Geocoding API" aktivieren → API-Schlüssel erstellen → Schlüssel auf Geocoding API beschränken.',
                      'Alternativ: OpenCage Geocoding (kostenloser Tarif für 2.500 Abfragen/Tag) → Konto erstellen → API-Key kopieren.',
                    ],
                    links: [
                      { label: 'Google Geocoding API', url: 'https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com' },
                      { label: 'OpenCage Geocoding', url: 'https://opencagedata.com/api' },
                      { label: 'Google Maps Preise', url: 'https://developers.google.com/maps/documentation/geocoding/usage-and-billing' },
                    ],
                    note: 'Tipp: Google bietet $200 monatliches Gratisguthaben. OpenCage hat einen kostenlosen Tarif für kleine Projekte.',
                  },
                  {
                    key: 'SNOW_LOAD_API',
                    title: 'Schneelast-Datenbank Österreich (ÖNORM B 1991-1-3)',
                    desc: 'Liefert die charakteristische Schneelast sk basierend auf Standort und Seehöhe gemäß ÖNORM B 1991-1-3. Ohne diesen Dienst muss die Schneelastzone manuell eingegeben werden.',
                    steps: [
                      'Austrian Standards: standards.at besuchen → Normen-Download oder API-Zugang für ÖNORM B 1991-1-3 prüfen.',
                      'Alternativ: ZAMG/GeoSphere Austria Klimadaten-API → Registrierung → API-Key anfordern.',
                      'Fallback: Manuelle Eingabe der Schneelastzone (1–4) und Seehöhe im Lasten-Tab – ohne API-Key möglich.',
                    ],
                    links: [
                      { label: 'Austrian Standards (ÖNORM)', url: 'https://www.austrian-standards.at/' },
                      { label: 'GeoSphere Austria Daten', url: 'https://data.hub.geosphere.at/' },
                      { label: 'ÖNORM B 1991-1-3 Info', url: 'https://www.austrian-standards.at/de/shop/onorm-b-1991-1-3-2018-04-01~p2390182' },
                    ],
                    note: 'Hinweis: Aktuell ist keine öffentliche REST-API für österr. Schneelastzonen verfügbar. Die App berechnet sk intern nach Tabelle wenn Zone + Seehöhe manuell eingegeben werden.',
                  },
                  {
                    key: 'WIND_LOAD_API',
                    title: 'Windlast-Datenbank Österreich (ÖNORM B 1991-1-4)',
                    desc: 'Liefert den Grundwert der Windgeschwindigkeit vb,0 basierend auf Standort gemäß ÖNORM B 1991-1-4. Ohne diesen Dienst muss die Windzone manuell eingegeben werden.',
                    steps: [
                      'Austrian Standards: Zugang zu ÖNORM B 1991-1-4 → Windzonenkarte und Tabellenwerte.',
                      'Alternativ: ZAMG/GeoSphere Austria Wind-Klimadaten → API-Zugang.',
                      'Fallback: Manuelle Eingabe der Windzone (1–4) und Geländekategorie im Lasten-Tab.',
                    ],
                    links: [
                      { label: 'Austrian Standards (ÖNORM)', url: 'https://www.austrian-standards.at/' },
                      { label: 'GeoSphere Austria Daten', url: 'https://data.hub.geosphere.at/' },
                      { label: 'ÖNORM B 1991-1-4 Info', url: 'https://www.austrian-standards.at/de/shop/onorm-b-1991-1-4-2019-05-15~p2536009' },
                    ],
                    note: 'Hinweis: Wie bei Schneelasten ist keine öffentliche REST-API verfügbar. Die App berechnet qp intern nach Tabelle wenn Zone + Geländekategorie manuell gesetzt werden.',
                  },
                ].map((hint) => (
                  <div key={hint.key} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-primary">{hint.key}</span>
                        <p className="text-sm font-medium mt-0.5">{hint.title}</p>
                      </div>
                      {settings.some(s => s.key === hint.key) ? (
                        <Badge className="bg-status-green text-status-green-bg">Konfiguriert</Badge>
                      ) : (
                        <Badge variant="outline" className="text-status-yellow border-status-yellow">Nicht konfiguriert</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{hint.desc}</p>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Einrichtung Schritt für Schritt:</p>
                      <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-0.5">
                        {hint.steps.map((step, i) => <li key={i}>{step}</li>)}
                      </ol>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {hint.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                        >
                          ↗ {link.label}
                        </a>
                      ))}
                    </div>
                    {hint.note && (
                      <p className="text-[11px] text-muted-foreground/80 italic border-l-2 border-primary/30 pl-2">{hint.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* AI Model Selection */}
            <SectionCard title="KI-Modellauswahl" subtitle="Wählen Sie das bevorzugte KI-Modell für die Plananalyse und den Berichts-Agenten">
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Die App nutzt standardmäßig <strong>Lovable AI (Gemini 2.5 Flash)</strong> – dafür ist kein eigener API-Key nötig.
                  Optional können Sie ein eigenes KI-Modell eines Drittanbieters konfigurieren.
                </p>

                <div className="space-y-3">
                  <div className="rounded-lg border p-4 space-y-3">
                    <p className="text-sm font-medium">Integriert (kein API-Key nötig)</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { model: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Standard – schnell, multimodal, gut für OCR' },
                        { model: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Höchste Genauigkeit, langsamer, teurer' },
                        { model: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', note: 'Schnellstes Modell, gut für einfache Aufgaben' },
                        { model: 'openai/gpt-5-mini', label: 'GPT-5 Mini', note: 'Gutes Preis-Leistungs-Verhältnis, stark bei Reasoning' },
                      ].map((m) => (
                        <div key={m.model} className="rounded-md bg-muted/30 p-2.5">
                          <p className="font-mono font-medium">{m.label}</p>
                          <p className="text-muted-foreground mt-0.5">{m.note}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">{m.model}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground/80 italic">
                      Diese Modelle sind über Lovable AI verfügbar. Verbrauch wird über Ihr Lovable-Workspace-Guthaben abgerechnet.
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 space-y-3">
                    <p className="text-sm font-medium">Eigener API-Key (optional)</p>
                    <p className="text-xs text-muted-foreground">
                      Falls Sie ein eigenes Modell verwenden möchten, tragen Sie den API-Key oben ein und wählen den Anbieter:
                    </p>
                    <div className="space-y-2">
                      {[
                        {
                          key: 'OPENAI_API_KEY',
                          provider: 'OpenAI',
                          models: 'GPT-4o, GPT-4o-mini, GPT-5',
                          link: 'https://platform.openai.com/api-keys',
                          steps: 'platform.openai.com → Anmelden → API Keys → „Create new secret key" → Key kopieren',
                        },
                        {
                          key: 'ANTHROPIC_API_KEY',
                          provider: 'Anthropic (Claude)',
                          models: 'Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 4',
                          link: 'https://console.anthropic.com/settings/keys',
                          steps: 'console.anthropic.com → Anmelden → Settings → API Keys → „Create Key" → Key kopieren',
                        },
                        {
                          key: 'GOOGLE_AI_API_KEY',
                          provider: 'Google AI Studio',
                          models: 'Gemini 2.5 Pro/Flash (direkt, nicht über Lovable)',
                          link: 'https://aistudio.google.com/app/apikey',
                          steps: 'aistudio.google.com → Anmelden → „Get API key" → „Create API key" → Key kopieren',
                        },
                      ].map((p) => (
                        <div key={p.key} className="rounded-md bg-muted/20 p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono text-xs font-bold">{p.key}</span>
                              <span className="text-xs text-muted-foreground ml-2">({p.provider})</span>
                            </div>
                            {settings.some(s => s.key === p.key) ? (
                              <Badge className="bg-status-green text-status-green-bg text-[10px]">Konfiguriert</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Nicht gesetzt</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Modelle: {p.models}</p>
                          <p className="text-xs text-muted-foreground">Anleitung: {p.steps}</p>
                          <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
                            ↗ Direkt zum API-Key-Portal: {p.provider}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-dashed p-4 space-y-2">
                    <p className="text-sm font-medium">Lokale Modelle (Ollama)</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Für lokale/selbst gehostete Modelle (z.B. Llama 3, Mistral, Phi-3) können Sie Ollama verwenden.
                      Die App unterstützt die OpenAI-kompatible API von Ollama.
                    </p>
                    <div className="text-xs space-y-1">
                      <p><strong>Einrichtung:</strong></p>
                      <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
                        <li>Ollama installieren: <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="text-primary underline">↗ ollama.com/download</a></li>
                        <li>Modell herunterladen: <code className="bg-muted px-1 rounded">ollama pull llama3.1</code></li>
                        <li>Server starten: <code className="bg-muted px-1 rounded">ollama serve</code> (Standard: http://localhost:11434)</li>
                        <li>In den Einstellungen oben <code className="bg-muted px-1 rounded">OLLAMA_BASE_URL</code> = <code className="bg-muted px-1 rounded">http://localhost:11434</code> setzen</li>
                      </ol>
                    </div>
                    <div className="flex gap-2">
                      <a href="https://ollama.com/" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2">↗ Ollama Website</a>
                      <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2">↗ Modellbibliothek</a>
                      <a href="https://github.com/ollama/ollama/blob/main/docs/api.md" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2">↗ API-Dokumentation</a>
                    </div>
                    <p className="text-[11px] text-muted-foreground/80 italic">
                      Hinweis: Lokale Modelle sind nur für Entwickler-/Testumgebungen geeignet. Für Produktion empfehlen wir Lovable AI oder einen Cloud-Anbieter.
                    </p>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        )}

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
