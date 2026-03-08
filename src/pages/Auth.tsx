import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, LogIn, UserPlus, ArrowLeft, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Auth = () => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === 'forgot') {
      const { error } = await resetPassword(email);
      if (error) {
        toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'E-Mail gesendet', description: 'Prüfen Sie Ihren Posteingang für den Passwort-Reset-Link.' });
        setMode('login');
      }
      setLoading(false);
      return;
    }

    if (mode === 'signup') {
      const { error } = await signUp(email, password, displayName);
      if (error) {
        toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Konto erstellt', description: 'Sie sind jetzt eingeloggt.' });
        navigate('/');
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: 'Anmeldung fehlgeschlagen', description: error.message, variant: 'destructive' });
      } else {
        navigate('/');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-lg">
              <Building2 className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">HolzStatik</h1>
          <p className="text-sm text-muted-foreground mt-1">Dachtragwerk-Vorbemessung Österreich</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Eurocode 5 / ÖNORM B 1995-1-1</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            {mode === 'login' && 'Anmelden'}
            {mode === 'signup' && 'Konto erstellen'}
            {mode === 'forgot' && 'Passwort zurücksetzen'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="DI Max Mustermann" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.at" required />
            </div>
            {mode !== 'forgot' && (
              <div className="space-y-1.5">
                <Label>Passwort</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading ? (
                <span className="animate-pulse">Laden…</span>
              ) : (
                <>
                  {mode === 'login' && <><LogIn className="h-4 w-4" />Anmelden</>}
                  {mode === 'signup' && <><UserPlus className="h-4 w-4" />Registrieren</>}
                  {mode === 'forgot' && 'Reset-Link senden'}
                </>
              )}
            </Button>
          </form>

          <div className="mt-4 space-y-2 text-center text-sm">
            {mode === 'login' && (
              <>
                <button onClick={() => setMode('forgot')} className="text-muted-foreground hover:text-foreground">
                  Passwort vergessen?
                </button>
                <p className="text-muted-foreground">
                  Kein Konto?{' '}
                  <button onClick={() => setMode('signup')} className="text-primary hover:underline font-medium">
                    Jetzt registrieren
                  </button>
                </p>
              </>
            )}
            {(mode === 'signup' || mode === 'forgot') && (
              <button onClick={() => setMode('login')} className="text-primary hover:underline font-medium flex items-center gap-1 mx-auto">
                <ArrowLeft className="h-3 w-3" />Zurück zur Anmeldung
              </button>
            )}
          </div>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'PDF-Analyse', desc: 'Automatische Planerkennung' },
            { label: 'Holzbemessung', desc: 'EC5 / ÖNORM Nachweise' },
            { label: 'Prüfprotokoll', desc: 'Transparenter Audit Trail' },
          ].map(f => (
            <div key={f.label} className="rounded-lg border bg-card/50 p-3 text-center">
              <p className="text-xs font-medium">{f.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 mx-auto max-w-xs">
          <Shield className="h-3.5 w-3.5 text-status-yellow shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Vorbemessung – keine rechtsverbindliche Statik. Endfreigabe durch qualifizierte Fachperson (Ziviltechniker, Statiker) erforderlich.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
