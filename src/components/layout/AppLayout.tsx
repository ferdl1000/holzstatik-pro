import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { GlossaryPanel } from '@/components/help/GlossaryPanel';
import type { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-11 flex items-center justify-between border-b bg-card/80 backdrop-blur-sm px-3 shrink-0">
            <div className="flex items-center">
              <SidebarTrigger className="mr-3" />
              <span className="text-xs text-muted-foreground">Holzbau-Vorbemessung Österreich</span>
            </div>
            <GlossaryPanel />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
