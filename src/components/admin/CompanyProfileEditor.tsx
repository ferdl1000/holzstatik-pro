/**
 * CompanyProfileEditor – Formular für Firmen-Branding im PDF.
 * Eingebunden als Tab "Firma" in Admin.tsx.
 */

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/SectionCard';
import { Building2, Save, Upload, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { loadCompanyProfile, saveCompanyProfile, DEFAULT_PROFILE } from '@/lib/branding/companyProfile';
import type { CompanyProfile } from '@/lib/branding/companyProfile';

export function CompanyProfileEditor() {
  const [profile, setProfile] = useState<CompanyProfile>({ ...DEFAULT_PROFILE });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadCompanyProfile().then(p => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  const set = (key: keyof CompanyProfile, value: string) =>
    setProfile(prev => ({ ...prev, [key]: value }));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast({ title: 'Ungültiges Format', description: 'Nur PNG oder JPG erlaubt.', variant: 'destructive' });
      return;
    }
    if (file.size > 500 * 1024) {
      toast({ title: 'Datei zu groß', description: 'Maximale Größe: 500 KB.', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfile(prev => ({ ...prev, logoBase64: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCompanyProfile(profile);
      toast({ title: 'Firmen-Profil gespeichert', description: 'Wird ab dem nächsten PDF-Export verwendet.' });
    } catch (e) {
      toast({ title: 'Fehler', description: e instanceof Error ? e.message : 'Unbekannt', variant: 'destructive' });
    }
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Lade Firmen-Profil…</p>;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Firmen-Daten für PDF-Bericht"
        subtitle="Logo und Adresse erscheinen auf Deckblatt und Footer jedes generierten PDFs"
      >
        <div className="grid grid-cols-2 gap-4">
          {/* Firmenname */}
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Firmenname</Label>
            <Input
              value={profile.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Zimmerei Müller GmbH"
            />
          </div>

          {/* Straße */}
          <div className="space-y-1.5">
            <Label className="text-xs">Straße</Label>
            <Input
              value={profile.street}
              onChange={e => set('street', e.target.value)}
              placeholder="Musterstraße 1"
            />
          </div>

          {/* PLZ */}
          <div className="space-y-1.5">
            <Label className="text-xs">PLZ</Label>
            <Input
              value={profile.postalCode}
              onChange={e => set('postalCode', e.target.value)}
              placeholder="1010"
            />
          </div>

          {/* Ort */}
          <div className="space-y-1.5">
            <Label className="text-xs">Ort</Label>
            <Input
              value={profile.city}
              onChange={e => set('city', e.target.value)}
              placeholder="Wien"
            />
          </div>

          {/* Telefon */}
          <div className="space-y-1.5">
            <Label className="text-xs">Telefon</Label>
            <Input
              value={profile.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="+43 1 123 456"
            />
          </div>

          {/* E-Mail */}
          <div className="space-y-1.5">
            <Label className="text-xs">E-Mail</Label>
            <Input
              type="email"
              value={profile.email}
              onChange={e => set('email', e.target.value)}
              placeholder="office@zimmerei.at"
            />
          </div>

          {/* UID */}
          <div className="space-y-1.5">
            <Label className="text-xs">UID-Nummer (Österreich)</Label>
            <Input
              value={profile.uid}
              onChange={e => set('uid', e.target.value)}
              placeholder="ATU12345678"
            />
          </div>

          {/* IBAN */}
          <div className="space-y-1.5">
            <Label className="text-xs">IBAN (optional)</Label>
            <Input
              value={profile.iban ?? ''}
              onChange={e => set('iban', e.target.value)}
              placeholder="AT60 1234 5678 9012 3456"
            />
          </div>

          {/* BIC */}
          <div className="space-y-1.5">
            <Label className="text-xs">BIC (optional)</Label>
            <Input
              value={profile.bic ?? ''}
              onChange={e => set('bic', e.target.value)}
              placeholder="BKAUATWW"
            />
          </div>

          {/* Ansprechpartner */}
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Standard-Ansprechpartner / Unterzeichner</Label>
            <Input
              value={profile.defaultSigningPerson ?? ''}
              onChange={e => set('defaultSigningPerson', e.target.value)}
              placeholder="Dipl.-Ing. Max Müller"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Firmenlogo"
        subtitle="PNG oder JPG, max. 500 KB. Wird links oben auf dem Deckblatt angezeigt."
      >
        <div className="space-y-4">
          {/* Logo preview */}
          {profile.logoBase64 && (
            <div className="flex items-start gap-4">
              <img
                src={profile.logoBase64}
                alt="Firmenlogo"
                className="h-20 w-auto border rounded object-contain bg-white"
              />
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive"
                onClick={() => setProfile(prev => ({ ...prev, logoBase64: undefined }))}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Logo entfernen
              </Button>
            </div>
          )}

          {/* Upload button */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {profile.logoBase64 ? 'Logo ersetzen' : 'Logo hochladen'}
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">PNG oder JPG, max. 500 KB. Empfohlen: weißer Hintergrund, mind. 300 × 100 px.</p>
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Speichern…' : 'Firmen-Profil speichern'}
        </Button>
      </div>
    </div>
  );
}
