import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AuditEntry } from '@/types/project';

export function useAuditTrail(projectId?: string) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const loadEntries = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (data) {
      setEntries(data.map(d => ({
        id: d.id,
        timestamp: d.created_at,
        agent: d.agent,
        action: d.action,
        field: d.field || '',
        oldValue: d.old_value || undefined,
        newValue: d.new_value || undefined,
        reason: d.reason || '',
        userInitiated: d.user_initiated || false,
      })));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const addEntry = useCallback(async (entry: {
    agent: string;
    action: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
    reason?: string;
    userInitiated?: boolean;
  }) => {
    if (!projectId || !user) return;
    const { error } = await supabase.from('audit_log').insert({
      project_id: projectId,
      user_id: user.id,
      agent: entry.agent,
      action: entry.action,
      field: entry.field || '',
      old_value: entry.oldValue || null,
      new_value: entry.newValue || null,
      reason: entry.reason || '',
      user_initiated: entry.userInitiated ?? true,
    });
    if (!error) {
      await loadEntries();
    }
    return error;
  }, [projectId, user, loadEntries]);

  return { entries, loading, addEntry, reload: loadEntries };
}
