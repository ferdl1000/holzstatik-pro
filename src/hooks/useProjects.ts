import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Project } from '@/types/project';
import { MOCK_PROJECT } from '@/data/mockProject';

export function useProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    loadProjects();
  }, [user]);

  async function loadProjects() {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  }

  async function createProject(name: string, description: string): Promise<string | null> {
    if (!user) return null;
    const mockData = { ...MOCK_PROJECT, name, description, id: undefined };
    const { data, error } = await supabase.from('projects').insert({
      user_id: user.id,
      name,
      description,
      status: 'yellow',
      current_step: 1,
      project_data: mockData as any,
    }).select('id').single();
    if (error || !data) return null;
    await loadProjects();
    return data.id;
  }

  async function updateProjectData(projectId: string, projectData: any) {
    await supabase.from('projects').update({
      project_data: projectData,
      status: projectData.status || 'yellow',
      current_step: projectData.currentStep || 1,
    }).eq('id', projectId);
    await loadProjects();
  }

  async function deleteProject(projectId: string) {
    await supabase.from('projects').delete().eq('id', projectId);
    await loadProjects();
  }

  return { projects, loading, createProject, updateProjectData, deleteProject, reload: loadProjects };
}
