/**
 * Render-Verifikation ALLER Projekt-Reiter mit echten (auto-abgeleiteten) Daten.
 * Stellt sicher, dass kein Reiter beim Rendern crasht und echte Inhalte zeigt —
 * deckt genau die vom Nutzer gemeldete "Katastrophe ab Bauphysik" ab.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router-dom';
import { runAutoPipeline } from '@/lib/auto/autoPipeline';
import { EMPTY_PROJECT } from '@/data/mockProject';
import type { Project, BuildingGeometry } from '@/types/project';

// ── Mocks für Browser-/Backend-Abhängigkeiten ───────────────────────────────
vi.mock('@/integrations/supabase/client', () => {
  const chain: any = {
    select: () => chain, eq: () => chain, neq: () => chain, order: () => chain, limit: () => chain,
    range: () => chain, in: () => chain, is: () => chain, gte: () => chain, lte: () => chain, ilike: () => chain,
    single: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: null, error: null }),
    insert: () => chain, update: () => chain, upsert: () => chain, delete: () => chain,
    then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
  };
  return {
    supabase: {
      from: () => chain,
      storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ data: null }) }) },
      functions: { invoke: async () => ({ data: null, error: null }) },
      auth: { getUser: async () => ({ data: { user: null } }) },
    },
  };
});
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { display_name: 'Test' } }),
}));
// three.js / R3F brauchen WebGL (in jsdom nicht vorhanden) → durch leichte Stubs ersetzen.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: any) => <div data-testid="r3f-canvas">{children}</div>,
  useFrame: () => {}, useThree: () => ({ camera: {}, gl: { domElement: {} }, invalidate: () => {} }),
}));
vi.mock('@react-three/drei', () => ({
  Text: ({ children }: any) => <span>{children}</span>, Line: () => null, OrbitControls: () => null,
  Html: ({ children }: any) => <div>{children}</div>, Box: () => null, Grid: () => null,
}));

beforeAll(() => {
  // jsdom-Polyfills
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  (HTMLCanvasElement.prototype as any).getContext = () => null;
});

function nwc(value: number, unit = 'm') {
  return { value, unit, confidence: 0.9, source: 'extracted' as const };
}
const geometry: BuildingGeometry = {
  length: nwc(21.8), width: nwc(8), ridgeHeight: nwc(6.26), eavesHeight: nwc(4.65),
  roofPitch: { value: 10, unit: '°', confidence: 0.9, source: 'extracted' },
  spans: [], axes: [], isSymmetric: true, confidence: 0.9, userConfirmed: false,
};

async function buildProject(): Promise<Project> {
  const base: Project = {
    ...EMPTY_PROJECT, id: 'p1', name: 'Lechner-Test', geometry, members: [], loadCases: [],
    address: { plz: '8230', city: 'Hartberg', state: 'Steiermark' } as any,
    roofType: { form: 'pultdach', confidence: 0.9, alternatives: [], userConfirmed: false } as any,
    ceilings: [{ id: 'c1', level: 'EG', area: 120, span: 5, nutzung: 'Wohnen', confidence: 0.8 }] as any,
    fireProtection: { gk: 'GK2', reiClass: 'REI60' } as any,
    coveringType: { type: 'trapezblech', confidence: 0.9 } as any,
  };
  const r = await runAutoPipeline({ project: base, sparrenSpacing: 0.8, useOptimizer: true });
  return {
    ...base,
    geometry: r.geometry.geometry,
    structuralSystem: r.structuralSystem.structuralSystem,
    members: r.calculations.optimizedMembers,
    loadCases: r.loads.loadCases,
    ...(r.roofParts ? { roofParts: r.roofParts } as any : {}),
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('Alle Projekt-Reiter rendern mit echten Daten', () => {
  let project: Project;
  beforeAll(async () => { project = await buildProject(); });

  const noop = () => {};

  // Lazy-Import erst NACH den Mocks
  async function tab(name: string) {
    const mod = await import('@/components/project/' + name);
    return (mod as any)[name];
  }

  const dataTabs = [
    // alle 16 Reiter aus ProjectView
    'PlanTab', 'AutoAnalysisTab', 'BillOfMaterialsTab', 'ExtractionTab', 'AddressTab',
    'GeometryTab', 'StructureTab', 'BauphysikTab', 'LoadsTab', 'MaterialsTab',
    'CalculationTab', 'Visual3DTab', 'CostsTab', 'WerkstattTab', 'ReviewTab', 'ReportTab',
  ];

  for (const name of dataTabs) {
    it(`${name} rendert ohne Crash + zeigt Inhalt`, async () => {
      const Comp = await tab(name);
      const { container, unmount } = render(
        <Wrapper><Comp project={project} onUpdate={noop} projectId="p1" onAnalysisComplete={noop} /></Wrapper>,
      );
      // Render erfolgreich + nicht leer
      expect(container.textContent && container.textContent.length).toBeGreaterThan(20);
      unmount();
      cleanup();
    });
  }

  it('Bauphysik zeigt echte Brandschutz/U-Wert-Zahlen', async () => {
    const Comp = await tab('BauphysikTab');
    const { container, unmount } = render(<Wrapper><Comp project={project} /></Wrapper>);
    expect(container.textContent).toMatch(/REI\s?\d{2,3}/);   // Brandschutzklasse
    expect(container.textContent).toMatch(/W\/m²K|W\/m2K/);    // U-Wert-Einheit
    unmount();
  });

  it('Berechnung zeigt Bauteile mit Ausnutzung', async () => {
    const Comp = await tab('CalculationTab');
    const { container, unmount } = render(<Wrapper><Comp project={project} onUpdate={noop} /></Wrapper>);
    expect(project.members.length).toBeGreaterThan(0);
    expect(container.textContent && container.textContent.length).toBeGreaterThan(50);
    unmount();
  });
});
