import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ApiKeyField } from '../ApiKeyField';

const upsertMock = vi.fn(async () => ({ error: null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ upsert: upsertMock }) },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1' } }),
}));

const baseProps = {
  settingKey: 'GOOGLE_AI_API_KEY',
  label: 'Google Gemini API-Key (kostenlos)',
  required: true,
  description: 'Treibt die Plananalyse an.',
  helpUrl: 'https://aistudio.google.com/app/apikey',
  helpUrlLabel: 'Key holen',
  steps: ['Schritt 1', 'Schritt 2'],
  onSaved: vi.fn(),
};

describe('ApiKeyField', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    cleanup();
  });

  it('zeigt "Noch nicht gesetzt" wenn kein Key vorhanden ist und Speichern ist deaktiviert', () => {
    render(<ApiKeyField {...baseProps} currentValue="" />);
    expect(screen.getByText('Noch nicht gesetzt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
  });

  it('zeigt "Aktiv" wenn bereits ein Key gesetzt ist', () => {
    render(<ApiKeyField {...baseProps} currentValue={'x'.repeat(40)} />);
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
  });

  it('aktiviert Speichern erst wenn der Nutzer den Wert ändert (dirty-check)', () => {
    render(<ApiKeyField {...baseProps} currentValue="" />);
    const input = screen.getByPlaceholderText('Key hier einfügen…');
    const saveBtn = screen.getByRole('button', { name: /speichern/i });
    expect(saveBtn).toBeDisabled();
    fireEvent.change(input, { target: { value: 'sk-or-v1-testkey-1234567890' } });
    expect(saveBtn).not.toBeDisabled();
  });

  it('speichert per upsert mit dem korrekten settingKey — kein Rätselraten nötig für den Nutzer', async () => {
    render(<ApiKeyField {...baseProps} currentValue="" />);
    const input = screen.getByPlaceholderText('Key hier einfügen…');
    fireEvent.change(input, { target: { value: 'AIzaSyTestKeyValue1234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /speichern/i }));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    const [payload, opts] = upsertMock.mock.calls[0];
    expect(payload).toMatchObject({
      key: 'GOOGLE_AI_API_KEY',
      value: 'AIzaSyTestKeyValue1234567890',
      is_secret: true,
      updated_by: 'admin-1',
    });
    expect(opts).toEqual({ onConflict: 'key' });
    expect(baseProps.onSaved).toHaveBeenCalled();
  });

  it('maskiert den Key standardmäßig (type=password) und zeigt ihn erst nach Klick auf Augen-Icon', () => {
    render(<ApiKeyField {...baseProps} currentValue="already-set-key-value-123456" />);
    const input = screen.getByPlaceholderText('Key hier einfügen…') as HTMLInputElement;
    expect(input.type).toBe('password');
    // Das Augen-Icon-Toggle ist der zweite Button in der Karte (nach Save/Steps)
    const toggle = screen.getAllByRole('button').find(b => !/speichern/i.test(b.textContent || ''));
    fireEvent.click(toggle!);
    expect(input.type).toBe('text');
  });
});
