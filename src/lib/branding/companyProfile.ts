/**
 * Firmen-Profil – laden und speichern via system_settings (Supabase).
 */

import { supabase } from '@/integrations/supabase/client';

export interface CompanyProfile {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  uid: string;            // UID-Nr Österreich, z.B. ATU12345678
  logoBase64?: string;    // PNG/JPG als data-URL base64
  iban?: string;
  bic?: string;
  defaultSigningPerson?: string;
}

export const DEFAULT_PROFILE: CompanyProfile = {
  name: 'Zimmerei Muster GmbH',
  street: 'Musterstraße 1',
  postalCode: '1010',
  city: 'Wien',
  phone: '+43 1 123 456',
  email: 'office@zimmerei-muster.at',
  uid: 'ATU00000000',
  iban: '',
  bic: '',
  defaultSigningPerson: '',
};

const SETTINGS_KEY = 'company_profile';

export async function loadCompanyProfile(): Promise<CompanyProfile> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    if (error || !data?.value) return { ...DEFAULT_PROFILE };

    return JSON.parse(data.value) as CompanyProfile;
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveCompanyProfile(profile: CompanyProfile): Promise<void> {
  const value = JSON.stringify(profile);

  const { data: existing } = await supabase
    .from('system_settings')
    .select('id')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('system_settings')
      .update({ value, description: 'Firmen-Profil für PDF-Branding' })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('system_settings')
      .insert({
        key: SETTINGS_KEY,
        value,
        description: 'Firmen-Profil für PDF-Branding',
        is_secret: false,
      });
  }
}
