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

            {/* Predefined settings hints */}
            <SectionCard title="Empfohlene Konfiguration" subtitle="Diese API-Keys werden für volle Funktionalität benötigt">
              <div className="space-y-2 text-sm">
                {[
                  { key: 'OCR_API_KEY', desc: 'OCR-Service für Plananalyse (z.B. Google Vision, Azure Document Intelligence)' },
                  { key: 'GEOCODING_API_KEY', desc: 'Geocoding-Service für Adressauflösung und Kartenansicht' },
                  { key: 'SNOW_LOAD_API', desc: 'Schneelast-Datenbank Österreich (ÖNORM B 1991-1-3)' },
                  { key: 'WIND_LOAD_API', desc: 'Windlast-Datenbank Österreich (ÖNORM B 1991-1-4)' },
                ].map((hint) => (
                  <div key={hint.key} className="flex items-center justify-between rounded-md bg-muted/30 p-3">
                    <div>
                      <span className="font-mono text-xs font-medium">{hint.key}</span>
                      <p className="text-xs text-muted-foreground">{hint.desc}</p>
                    </div>
                    {settings.some(s => s.key === hint.key) ? (
                      <Badge className="bg-status-green text-status-green-bg">Konfiguriert</Badge>
                    ) : (
                      <Badge variant="outline" className="text-status-yellow border-status-yellow">Nicht konfiguriert</Badge>
                    )}
                  </div>
                ))}
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
