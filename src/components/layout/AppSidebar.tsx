import { useLocation, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  FileText, Scan, MapPin, Ruler, Building2, Weight, TreePine,
  Calculator, CheckCircle, FileOutput, LayoutDashboard, Plus,
  ChevronRight, Shield
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const WORKFLOW_ICONS = {
  plan: FileText,
  extraction: Scan,
  address: MapPin,
  geometry: Ruler,
  structure: Building2,
  loads: Weight,
  materials: TreePine,
  calculation: Calculator,
  review: CheckCircle,
  report: FileOutput,
};

const WORKFLOW_STEPS = [
  { key: 'plan', label: 'Plan', step: 1 },
  { key: 'extraction', label: 'Extraktion', step: 2 },
  { key: 'address', label: 'Adresse', step: 3 },
  { key: 'geometry', label: 'Geometrie', step: 4 },
  { key: 'structure', label: 'Tragwerk', step: 5 },
  { key: 'loads', label: 'Lasten', step: 6 },
  { key: 'materials', label: 'Materialien', step: 7 },
  { key: 'calculation', label: 'Berechnung', step: 8 },
  { key: 'review', label: 'Prüfung', step: 9 },
  { key: 'report', label: 'Bericht', step: 10 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const isProjectView = location.pathname.startsWith('/project/');

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary">
            <Building2 className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-sidebar-foreground">HolzStatik</span>
              <span className="text-[10px] text-sidebar-foreground/60">Dachtragwerk-Vorbemessung</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/" className={cn(
                    'flex items-center gap-2',
                    location.pathname === '/' && 'bg-sidebar-accent text-sidebar-primary'
                  )}>
                    <LayoutDashboard className="h-4 w-4" />
                    {!collapsed && <span>Dashboard</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/new" className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    {!collapsed && <span>Neues Projekt</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isProjectView && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50">Workflow-Schritte</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {WORKFLOW_STEPS.map((step) => {
                  const Icon = WORKFLOW_ICONS[step.key as keyof typeof WORKFLOW_ICONS];
                  const isActive = location.search.includes(`tab=${step.key}`);
                  return (
                    <SidebarMenuItem key={step.key}>
                      <SidebarMenuButton asChild>
                        <Link
                          to={`/project/demo?tab=${step.key}`}
                          className={cn(
                            'flex items-center gap-2',
                            isActive && 'bg-sidebar-accent text-sidebar-primary'
                          )}
                        >
                          <span className={cn(
                            'flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold',
                            isActive
                              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                              : 'bg-sidebar-accent/50 text-sidebar-foreground/60'
                          )}>
                            {step.step}
                          </span>
                          {!collapsed && (
                            <>
                              <Icon className="h-3.5 w-3.5" />
                              <span className="text-xs">{step.label}</span>
                              {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
                            </>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="flex items-start gap-2 rounded-md bg-sidebar-accent/30 p-2.5">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-yellow" />
            <p className="text-[10px] leading-relaxed text-sidebar-foreground/70">
              Vorbemessung – keine rechtsverbindliche Statik. Freigabe durch qualifizierte Fachperson erforderlich.
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
