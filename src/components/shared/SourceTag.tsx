import { cn } from '@/lib/utils';
import { Bot, User, Calculator, HelpCircle } from 'lucide-react';

interface SourceTagProps {
  source: 'extracted' | 'calculated' | 'assumed' | 'user' | 'auto_extracted' | 'user_confirmed' | 'user_entered';
}

const SOURCE_CONFIG = {
  extracted: { icon: Bot, label: 'Automatisch erkannt', className: 'bg-accent/10 text-accent border-accent/20' },
  auto_extracted: { icon: Bot, label: 'Automatisch erkannt', className: 'bg-accent/10 text-accent border-accent/20' },
  calculated: { icon: Calculator, label: 'Berechnet', className: 'bg-primary/10 text-primary border-primary/20' },
  assumed: { icon: HelpCircle, label: 'Angenommen', className: 'bg-status-yellow/10 text-status-yellow border-status-yellow/20' },
  user: { icon: User, label: 'Manuell eingegeben', className: 'bg-status-green/10 text-status-green border-status-green/20' },
  user_confirmed: { icon: User, label: 'Bestätigt', className: 'bg-status-green/10 text-status-green border-status-green/20' },
  user_entered: { icon: User, label: 'Manuell eingegeben', className: 'bg-status-green/10 text-status-green border-status-green/20' },
};

export function SourceTag({ source }: SourceTagProps) {
  const config = SOURCE_CONFIG[source];
  const Icon = config.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium', config.className)}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}
