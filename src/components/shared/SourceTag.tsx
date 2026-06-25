import { cn } from '@/lib/utils';
import { Bot, User, Calculator, HelpCircle } from 'lucide-react';

interface SourceTagProps {
  source: string;
}

const SOURCE_CONFIG: Record<string, { icon: typeof Bot; label: string; className: string }> = {
  extracted: { icon: Bot, label: 'Automatisch erkannt', className: 'bg-accent/10 text-accent border-accent/20' },
  auto_extracted: { icon: Bot, label: 'Automatisch erkannt', className: 'bg-accent/10 text-accent border-accent/20' },
  calculated: { icon: Calculator, label: 'Berechnet', className: 'bg-primary/10 text-primary border-primary/20' },
  derived: { icon: Calculator, label: 'Abgeleitet', className: 'bg-primary/10 text-primary border-primary/20' },
  standard: { icon: Calculator, label: 'Norm-Standard', className: 'bg-primary/10 text-primary border-primary/20' },
  assumed: { icon: HelpCircle, label: 'Angenommen', className: 'bg-status-yellow/10 text-status-yellow border-status-yellow/20' },
  default: { icon: HelpCircle, label: 'Standardwert', className: 'bg-status-yellow/10 text-status-yellow border-status-yellow/20' },
  fallback: { icon: HelpCircle, label: 'Rückfallwert', className: 'bg-status-yellow/10 text-status-yellow border-status-yellow/20' },
  user: { icon: User, label: 'Manuell eingegeben', className: 'bg-status-green/10 text-status-green border-status-green/20' },
  user_confirmed: { icon: User, label: 'Bestätigt', className: 'bg-status-green/10 text-status-green border-status-green/20' },
  user_entered: { icon: User, label: 'Manuell eingegeben', className: 'bg-status-green/10 text-status-green border-status-green/20' },
};

const DEFAULT_SOURCE = { icon: HelpCircle, label: 'Unbekannt', className: 'bg-muted text-muted-foreground border-border' };

export function SourceTag({ source }: SourceTagProps) {
  const config = SOURCE_CONFIG[source] ?? DEFAULT_SOURCE;
  const Icon = config.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium', config.className)}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}
