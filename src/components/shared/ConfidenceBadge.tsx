import { cn } from '@/lib/utils';

interface ConfidenceBadgeProps {
  confidence: number;
  showPercent?: boolean;
  size?: 'sm' | 'md';
}

export function ConfidenceBadge({ confidence, showPercent = true, size = 'sm' }: ConfidenceBadgeProps) {
  const percent = Math.round(confidence * 100);
  const level = percent >= 85 ? 'high' : percent >= 60 ? 'medium' : 'low';

  return (
    <div className={cn('inline-flex items-center gap-1.5', size === 'sm' ? 'text-xs' : 'text-sm')}>
      <div className={cn(
        'rounded-full',
        size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
        level === 'high' && 'bg-status-green',
        level === 'medium' && 'bg-status-yellow',
        level === 'low' && 'bg-status-red',
      )} />
      {showPercent && <span className="font-mono tabular-nums text-muted-foreground">{percent}%</span>}
    </div>
  );
}
