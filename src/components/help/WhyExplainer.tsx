import { useState } from 'react';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WhyExplainerProps {
  /** Kurzer Titel */
  title: string;
  /** Lange Erklärung – kann Markdown-ähnlich sein */
  explanation: string;
  /** Optionale Formel anzeigen */
  formula?: string;
  /** Konkrete Werte / Tabelle */
  values?: Record<string, string | number>;
  /** Standardmäßig aufgeklappt? */
  defaultOpen?: boolean;
  /** Variante */
  variant?: 'inline' | 'card';
  className?: string;
}

/**
 * Aufklappbare "Warum?"-Box, die einen Berechnungsschritt erklärt.
 * Zeigt:
 *  - Erklärung in Klartext
 *  - Optional: Formel
 *  - Optional: Tabelle mit konkret eingesetzten Werten
 *
 * Verwendung an jedem Berechnungsergebnis um Transparenz zu schaffen.
 */
export function WhyExplainer({
  title,
  explanation,
  formula,
  values,
  defaultOpen = false,
  variant = 'inline',
  className = '',
}: WhyExplainerProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        'rounded-md border transition-colors',
        variant === 'card' ? 'bg-card' : 'bg-muted/30 border-muted',
        className,
      )}
    >
      <Button
        variant="ghost"
        onClick={() => setOpen(!open)}
        className="w-full justify-between h-auto px-3 py-2 font-normal hover:bg-muted/50"
      >
        <span className="flex items-center gap-2 text-xs">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-medium">{title}</span>
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 text-xs">
          <p className="text-foreground/90 leading-relaxed">{explanation}</p>
          {formula && (
            <div className="font-mono text-[11px] bg-background border rounded px-2 py-1.5">
              {formula}
            </div>
          )}
          {values && Object.keys(values).length > 0 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 font-mono text-[11px]">
              {Object.entries(values).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-muted/40 pb-0.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
