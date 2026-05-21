import { Info, BookOpen } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { GLOSSARY, lookup } from '@/lib/help/glossary';
import type { ReactNode } from 'react';

interface InfoTooltipProps {
  /** Schlüssel aus dem Glossar, z.B. "schneelast" */
  term?: string;
  /** Eigener Titel falls kein Glossar-Eintrag */
  title?: string;
  /** Eigener Inhalt – wenn nicht angegeben, kommt es aus dem Glossar */
  children?: ReactNode;
  /** Größe des Icons */
  size?: 'sm' | 'md';
  /** Variant: i=einfaches Icon, why="Warum?"-Button mit Text */
  variant?: 'icon' | 'why';
}

/**
 * Info-Icon mit Klartext-Erklärung im Popup.
 *
 * Verwendung:
 *   <InfoTooltip term="schneelast" />
 *   <InfoTooltip title="Eigener Titel"><p>Eigener Text</p></InfoTooltip>
 *   <InfoTooltip term="knicken" variant="why" />
 */
export function InfoTooltip({ term, title, children, size = 'sm', variant = 'icon' }: InfoTooltipProps) {
  const entry = term ? lookup(term) : undefined;
  const displayTitle = title || entry?.term || 'Info';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <Popover>
      <PopoverTrigger asChild>
        {variant === 'why' ? (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1">
            <Info className={iconSize} /> Warum?
          </Button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            aria-label={`Info: ${displayTitle}`}
          >
            <Info className={iconSize} />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-4 w-4 text-primary" />
            {displayTitle}
          </div>
          {entry ? (
            <div className="space-y-2">
              <p className="text-foreground/90">{entry.short}</p>
              {entry.layman && (
                <div className="rounded-md bg-muted/50 p-2 text-xs">
                  <span className="font-medium text-primary">In einfachen Worten: </span>
                  {entry.layman}
                </div>
              )}
              {entry.formula && (
                <div className="text-xs font-mono bg-muted/30 p-1.5 rounded">{entry.formula}</div>
              )}
              <p className="text-xs text-muted-foreground">{entry.long}</p>
            </div>
          ) : (
            children
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
