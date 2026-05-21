import { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GLOSSARY } from '@/lib/help/glossary';

/**
 * Glossar-Sidebar mit Suche.
 * Wird im AppLayout als kleiner Button bereitgestellt.
 */
export function GlossaryPanel() {
  const [search, setSearch] = useState('');
  const entries = Object.entries(GLOSSARY).filter(
    ([, e]) =>
      !search ||
      e.term.toLowerCase().includes(search.toLowerCase()) ||
      e.short.toLowerCase().includes(search.toLowerCase()) ||
      e.long.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BookOpen className="h-4 w-4" />
          Glossar
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[480px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Glossar</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Begriff suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="space-y-3">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Kein Eintrag gefunden.</p>
            ) : (
              entries.map(([key, entry]) => (
                <div key={key} className="rounded-lg border bg-card p-3 space-y-2">
                  <h3 className="font-semibold text-sm">{entry.term}</h3>
                  <p className="text-sm text-foreground/80">{entry.short}</p>
                  {entry.layman && (
                    <div className="rounded bg-muted/40 p-2 text-xs">
                      <span className="font-medium text-primary">In einfachen Worten: </span>
                      {entry.layman}
                    </div>
                  )}
                  {entry.formula && (
                    <div className="text-xs font-mono bg-muted/30 px-2 py-1 rounded">{entry.formula}</div>
                  )}
                  <p className="text-xs text-muted-foreground">{entry.long}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
