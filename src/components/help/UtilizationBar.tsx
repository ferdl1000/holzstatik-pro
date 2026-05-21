import { cn } from '@/lib/utils';
import { formatUtilization } from '@/lib/units';
import { InfoTooltip } from './InfoTooltip';

interface UtilizationBarProps {
  /** Ausnutzung 0..>1 */
  eta: number;
  /** Label links */
  label?: string;
  /** Höhe in px */
  height?: number;
  /** Mit Tooltip-Erklärung */
  withInfo?: boolean;
  className?: string;
}

/**
 * Ausnutzungsbalken mit Ampel-Farbe + Prozentanzeige.
 * Erklärt was Ausnutzung bedeutet via Tooltip.
 */
export function UtilizationBar({ eta, label, height = 8, withInfo = true, className }: UtilizationBarProps) {
  const u = formatUtilization(eta);
  const width = Math.min(100, eta * 100);

  const barColor =
    u.status === 'red' ? 'bg-status-red'
    : u.status === 'yellow' ? 'bg-status-yellow'
    : 'bg-status-green';

  return (
    <div className={cn('space-y-1', className)}>
      {(label || withInfo) && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {label && <span className="text-muted-foreground">{label}</span>}
            {withInfo && <InfoTooltip term="eta" />}
          </div>
          <span className={cn(
            'font-mono font-medium',
            u.status === 'red' && 'text-status-red',
            u.status === 'yellow' && 'text-status-yellow',
            u.status === 'green' && 'text-status-green',
          )}>{u.percent}</span>
        </div>
      )}
      <div className="relative w-full bg-muted rounded-full overflow-hidden" style={{ height }}>
        <div
          className={cn('h-full transition-all duration-300', barColor)}
          style={{ width: `${width}%` }}
        />
        {/* 100%-Markierung */}
        {eta > 1 && (
          <div className="absolute top-0 bottom-0 border-l-2 border-foreground/40" style={{ left: `${(1 / eta) * 100 * (100 / width)}%` }} />
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">{u.label}</div>
    </div>
  );
}
