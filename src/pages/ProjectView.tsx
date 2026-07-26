import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  FileText, Scan, MapPin, Ruler, Building2, Weight,
  TreePine, Calculator, CheckCircle, FileOutput, ShieldAlert,
  Boxes, Euro, Sparkles, ShoppingCart, Flame, Wrench,
} from 'lucide-react';
import { PlanTab } from '@/components/project/PlanTab';
import { OverviewTab } from '@/components/project/OverviewTab';
import { ExtractionTab } from '@/components/project/ExtractionTab';
import { AddressTab } from '@/components/project/AddressTab';
import { GeometryTab } from '@/components/project/GeometryTab';
import { StructureTab } from '@/components/project/StructureTab';
import { LoadsTab } from '@/components/project/LoadsTab';
import { MaterialsTab } from '@/components/project/MaterialsTab';
import { CalculationTab } from '@/components/project/CalculationTab';
import { ReviewTab } from '@/components/project/ReviewTab';
import { ReportTab } from '@/components/project/ReportTab';
import { Visual3DTab } from '@/components/project/Visual3DTab';
import { CostsTab } from '@/components/project/CostsTab';
import { AutoAnalysisTab } from '@/components/project/AutoAnalysisTab';
import { BillOfMaterialsTab } from '@/components/project/BillOfMaterialsTab';
import { BauphysikTab } from '@/components/project/BauphysikTab';
import { WerkstattTab } from '@/components/project/WerkstattTab';
import { SaegewerkTab } from '@/components/project/SaegewerkTab';
import { supabase } from '@/integrations/supabase/client';
import { EMPTY_PROJECT } from '@/data/mockProject';
import type { Project } from '@/types/project';
import { runFullValidation, countBySeverity } from '@/lib/validation';
import { runAutoPipeline } from '@/lib/auto/autoPipeline';

const TAB_CONFIG = [
  { key: 'ergebnis', label: 'Ergebnis', icon: Sparkles },
  { key: 'plan', label: 'Plan', icon: FileText },
  { key: 'autoanalysis', label: 'Komplett-Analyse', icon: Sparkles },
  { key: 'bom', label: 'Bestellliste', icon: ShoppingCart },
  { key: 'extraction', label: 'Extraktion', icon: Scan },
  { key: 'address', label: 'Adresse', icon: MapPin },
  { key: 'geometry', label: 'Geometrie', icon: Ruler },
  { key: 'structure', label: 'Tragwerk', icon: Building2 },
  { key: 'bauphysik', label: 'Bauphysik', icon: Flame },
  { key: 'loads', label: 'Lasten', icon: Weight },
  { key: 'materials', label: 'Materialien', icon: TreePine },
  { key: 'calculation', label: 'Berechnung', icon: Calculator },
  { key: 'visual3d', label: '3D-Modell', icon: Boxes },
  { key: 'costs', label: 'Kosten', icon: Euro },
  { key: 'werkstatt', label: 'Werkstatt', icon: Wrench },
  { key: 'saegewerk', label: 'Sägewerk', icon: TreePine },
  { key: 'review', label: 'PrÃ¼fung', icon: CheckCircle },
  { key: 'report', label: 'Bericht', icon: FileOutput },
];

const ProjectView = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const requestedTab = searchParams.get('tab');
  const [project, setProject] = useState<Project>(EMPTY_PROJECT);
  const [dbProject, setDbProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deriving, setDeriving] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadProject();
  }, [id]);

  const [notFound, setNotFound] = useState(false);

  async function loadProject() {
    setLoading(true);
    const { data } = await supabase.from('projects').select('*').eq('id', id).single();
    if (!data) setNotFound(true);
    if (data) {
      setDbProject(data);
      const pd = (data.project_data as any) || {};
      // Die hochgeladenen Pläne stehen in einer eigenen Tabelle, nicht in
      // project_data. Die Prüfliste sucht sie aber unter project.documents und
      // meldete deshalb "Kein Plan hochgeladen", obwohl ein analysierter Plan
      // im Projekt lag. Hier werden sie zusammengeführt.
      const { data: docs } = await supabase
        .from('documents')
        .select('id, file_name, status, created_at, extracted_data')
        .eq('project_id', id!)
        .order('created_at', { ascending: false });
      const dokumente = (docs ?? []).map((d: any) => ({
        id: d.id,
        fileName: d.file_name,
        fileType: 'application/pdf',
        uploadedAt: d.created_at,
        status: (d.status ?? 'uploaded') as 'uploaded' | 'processing' | 'analyzed' | 'error',
        pages: 1,
        ...(d.extracted_data ? { extractedData: d.extracted_data } : {}),
      }));
      const loaded: Project = {
        ...EMPTY_PROJECT, ...pd, id: data.id, name: data.name,
        description: data.description || '',
        ...(dokumente.length > 0 ? { documents: dokumente } : {}),
      };
      setProject(loaded);
      // Statik-Modell automatisch ableiten, wenn Basis-Daten da sind aber Bauteile/Lasten fehlen.
      // So zeigen ALLE Reiter (Tragwerk, Lasten, Berechnung, Kosten, Bauphysik, Werkstatt …)
      // echte Ergebnisse, ohne dass der Nutzer erst die Komplett-Analyse klicken muss.
      void ensureModel(loaded, data);
    }
    setLoading(false);
  }

  /** Erzeugt Bauteile + Lasten + Bemessung aus Geometrie/Dachteilen, falls noch nicht vorhanden. */
  async function ensureModel(loaded: Project, dbRow: any) {
    const hasMembers = Array.isArray(loaded.members) && loaded.members.length > 0;
    const hasRoofParts = Array.isArray((loaded as any).roofParts) && (loaded as any).roofParts.length > 0;
    const hasGeometry = (loaded.geometry?.width?.value ?? 0) > 0 || (loaded.geometry?.length?.value ?? 0) > 0;
    if (hasMembers || (!hasRoofParts && !hasGeometry)) return; // schon vollständig oder zu wenig Basis
    try {
      setDeriving(true);
      const result = await runAutoPipeline({ project: loaded, sparrenSpacing: 0.8, useOptimizer: true });
      const merged: Project = {
        ...loaded,
        geometry: result.geometry.geometry,
        roofType: result.roofType.roofType,
        structuralSystem: result.structuralSystem.structuralSystem,
        members: result.calculations.optimizedMembers,
        loadCases: result.loads.loadCases,
        ...(result.roofParts ? { roofParts: result.roofParts } as Partial<Project> : {}),
      };
      setProject(merged);
      await supabase.from('projects').update({ project_data: merged as any }).eq('id', dbRow.id);
    } catch (e) {
      console.warn('[ProjectView] Auto-Modell-Ableitung fehlgeschlagen:', e);
    } finally {
      setDeriving(false);
    }
  }

  const updateProject = useCallback(async (updates: Partial<Project>) => {
    const updated = { ...project, ...updates };
    setProject(updated);
    if (!dbProject) return;

    // WICHTIG: Zwischen dem Laden dieser Seite und diesem Schreibvorgang können
    // die Edge Functions (Orchestrator, Plan-Analyse) Felder in project_data
    // geschrieben haben, die der lokale Stand noch gar nicht kennt — etwa den
    // Plankopf oder die aus dem Plan gelesene Bauadresse. Würde der Client
    // stur seinen eigenen Stand zurückschreiben, wären diese Felder wieder weg
    // (genau das ist passiert: die Bauadresse aus dem Schriftfeld verschwand
    // beim nächsten Speichern). Deshalb wird der Serverstand frisch gelesen und
    // NUR mit den tatsächlich gesetzten lokalen Werten überschrieben.
    const { data: aktuell } = await supabase
      .from('projects').select('project_data').eq('id', dbProject.id).single();
    const serverStand = (aktuell?.project_data as Record<string, unknown>) ?? {};

    const lokalGesetzt: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updated as Record<string, unknown>)) {
      if (v !== undefined) lokalGesetzt[k] = v;
    }
    const merged = { ...serverStand, ...lokalGesetzt } as Project;
    setProject(merged);

    await supabase.from('projects').update({
      project_data: merged as any,
      status: merged.status,
      current_step: merged.currentStep,
    }).eq('id', dbProject.id);
  }, [project, dbProject]);

  // Standard-Ansicht: Ergebnis-Übersicht sobald ein Rechenergebnis existiert,
  // sonst der Plan-Upload (neues/leeres Projekt).
  // Ein unbekannter ?tab=-Wert (vertippt, alter Link, Lesezeichen aus einer
  // früheren Version) darf NICHT zu einer weißen Seite führen — dann steht der
  // Nutzer vor einem leeren Fenster und kommt nicht weiter. In dem Fall wird
  // der Standardreiter gezeigt.
  const standardTab = (project.members?.length ?? 0) > 0 ? 'ergebnis' : 'plan';
  const activeTab = requestedTab && TAB_CONFIG.some(t => t.key === requestedTab)
    ? requestedTab
    : standardTab;

  // Live validation counts for blocker banner
  const blockerCount = useMemo(() => {
    const issues = runFullValidation(project);
    return countBySeverity(issues);
  }, [project]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Projekt ladenâ€¦</div>
        </div>
      </AppLayout>
    );
  }

  // Projekt existiert nicht (mehr) — z.B. gelöscht, während der Tab offen war.
  // Vorher blieb die Seite hier in einer endlosen "Dokumente werden geladen…"-
  // Anzeige hängen, ohne dem Nutzer zu sagen, was los ist.
  if (notFound) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <ShieldAlert className="h-10 w-10 text-[hsl(var(--status-yellow))]" />
          <div className="text-center">
            <p className="font-semibold">Projekt nicht gefunden</p>
            <p className="text-sm text-muted-foreground mt-1">
              Dieses Projekt existiert nicht mehr — vermutlich wurde es gelöscht.
            </p>
          </div>
          <Link to="/" className="text-sm text-primary underline underline-offset-2">
            Zurück zur Projektübersicht
          </Link>
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
              <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">â† Projekte</Link>
              <span className="text-muted-foreground">/</span>
              <h2 className="font-semibold text-sm">{project.name}</h2>
              <StatusIndicator status={project.status} size="sm" />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {deriving && (
                <span className="flex items-center gap-1 text-primary font-medium animate-pulse">
                  Statik wird berechnet…
                </span>
              )}
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
            <TabsContent value="ergebnis" className="m-0 h-full">
              <OverviewTab project={project} onUpdate={updateProject} onNavigate={(t) => setSearchParams({ tab: t })} />
            </TabsContent>
            <TabsContent value="plan" className="m-0 h-full">
              <PlanTab project={project} projectId={dbProject?.id} onAnalysisComplete={loadProject} />
            </TabsContent>
            <TabsContent value="autoanalysis" className="m-0 h-full p-4"><AutoAnalysisTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="bom" className="m-0 h-full p-4"><BillOfMaterialsTab project={project} /></TabsContent>
            <TabsContent value="extraction" className="m-0 h-full"><ExtractionTab project={project} projectId={dbProject?.id} /></TabsContent>
            <TabsContent value="address" className="m-0 h-full"><AddressTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="geometry" className="m-0 h-full"><GeometryTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="structure" className="m-0 h-full"><StructureTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="bauphysik" className="m-0 h-full"><BauphysikTab project={project} /></TabsContent>
            <TabsContent value="loads" className="m-0 h-full"><LoadsTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="materials" className="m-0 h-full"><MaterialsTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="calculation" className="m-0 h-full"><CalculationTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="visual3d" className="m-0 h-full p-4"><Visual3DTab project={project} /></TabsContent>
            <TabsContent value="costs" className="m-0 h-full p-4"><CostsTab project={project} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="werkstatt" className="m-0 h-full p-4"><WerkstattTab project={project} /></TabsContent>
            <TabsContent value="saegewerk" className="m-0 h-full overflow-auto"><SaegewerkTab project={project} /></TabsContent>
            <TabsContent value="review" className="m-0 h-full"><ReviewTab project={project} projectId={dbProject?.id} onUpdate={updateProject} /></TabsContent>
            <TabsContent value="report" className="m-0 h-full"><ReportTab project={project} projectId={dbProject?.id} /></TabsContent>
          </div>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default ProjectView;

