import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  FileText, Scan, MapPin, Ruler, Building2, Weight,
  TreePine, Calculator, CheckCircle, FileOutput, ShieldAlert
} from 'lucide-react';
import { PlanTab } from '@/components/project/PlanTab';
import { ExtractionTab } from '@/components/project/ExtractionTab';
import { AddressTab } from '@/components/project/AddressTab';
import { GeometryTab } from '@/components/project/GeometryTab';
import { StructureTab } from '@/components/project/StructureTab';
import { LoadsTab } from '@/components/project/LoadsTab';
import { MaterialsTab } from '@/components/project/MaterialsTab';
import { CalculationTab } from '@/components/project/CalculationTab';
import { ReviewTab } from '@/components/project/ReviewTab';
import { ReportTab } from '@/components/project/ReportTab';
import { supabase } from '@/integrations/supabase/client';
import { EMPTY_PROJECT } from '@/data/mockProject';
import type { Project } from '@/types/project';
import { runFullValidation, countBySeverity } from '@/lib/validation';

const TAB_CONFIG = [
  { key: 'plan', label: 'Plan', icon: FileText },
  { key: 'extraction', label: 'Extraktion', icon: Scan },
  { key: 'address', label: 'Adresse', icon: MapPin },
  { key: 'geometry', label: 'Geometrie', icon: Ruler },
  { key: 'structure', label: 'Tragwerk', icon: Building2 },
  { key: 'loads', label: 'Lasten', icon: Weight },
  { key: 'materials', label: 'Materialien', icon: TreePine },
  { key: 'calculation', label: 'Berechnung', icon: Calculator },
  { key: 'review', label: 'Prüfung', icon: CheckCircle },
  { key: 'report', label: 'Bericht', icon: FileOutput },
];

const ProjectView = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const activeTab = searchParams.get('tab') || 'plan';
  const [project, setProject] = useState<Project>(EMPTY_PROJECT);
  const [dbProject, setDbProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadProject();
  }, [id]);

  async function loadProject() {
    setLoading(true);
    const { data } = await supabase.from('projects').select('*').eq('id', id).single();
    if (data) {
      setDbProject(data);
      const pd = data.project_data as any;
      if (pd && pd.name) {
        setProject({ ...EMPTY_PROJECT, ...pd, id: data.id, name: data.name, description: data.description || '' });
      } else {
        setProject({ ...EMPTY_PROJECT, id: data.id, name: data.name, description: data.description || '' });
      }
    }
    setLoading(false);
  }

  const updateProject = useCallback(async (updates: Partial<Project>) => {
    const updated = { ...project, ...updates };
    setProject(updated);
    if (dbProject) {
      await supabase.from('projects').update({
        project_data: updated as any,
        status: updated.status,
        current_step: updated.currentStep,
      }).eq('id', dbProject.id);
    }
  }, [project, dbProject]);

  // Live validation counts for blocker banner
  const blockerCount = useMemo(() => {
    const issues = runFullValidation(project);
    return countBySeverity(issues);
  }, [project]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Projekt laden…</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-2.75rem)]">
        {/* Header */}
        <div className="border-b bg-card px-6 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Projekte</Link>
              <span className="text-muted-foreground">/</span>
              <h2 className="font-semibold text-sm">{project.name}</h2>
              <StatusIndicator status={project.status} size="sm" />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {blockerCount.red > 0 && (
                <span className="flex items-center gap-1 text-[hsl(var(--status-red))] font-medium">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {blockerCount.red} Blocker
                </span>
              )}
              <span className="font-mono">Schritt {project.currentStep}/10</span>
            </div>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setSearchParams({ tab: v })}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="border-b bg-card/50 px-4 shrink-0 overflow-x-auto scrollbar-thin">
            <TabsList className="bg-transparent h-10 gap-0">
              {TAB_CONFIG.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-b-none px-3"
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="plan" className="m-0 h-full">
              <PlanTab project={project} projectId={dbProject?.id} onAnalysisComplete={loadProject} />
            </TabsContent>
            <TabsContent value="extraction" className="m-0 h-full"><ExtractionTab project={project} projectId={dbProject?.id} /></TabsContent>
            <TabsContent value="address" className="m-0 h-full"><AddressTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="geometry" className="m-0 h-full"><GeometryTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="structure" className="m-0 h-full"><StructureTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="loads" className="m-0 h-full"><LoadsTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="materials" className="m-0 h-full"><MaterialsTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="calculation" className="m-0 h-full"><CalculationTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="review" className="m-0 h-full"><ReviewTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="report" className="m-0 h-full"><ReportTab project={project} projectId={dbProject?.id} /></TabsContent>
          </div>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default ProjectView;
