import { cn } from '@/lib/utils';
import type { StatusLevel } from '@/types/project';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface StatusIndicatorProps {
  status: StatusLevel;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const STATUS_CONFIG = {
  green: { icon: CheckCircle, label: 'Bestanden', className: 'status-badge-green' },
  yellow: { icon: AlertTriangle, label: 'Prüfung nötig', className: 'status-badge-yellow' },
  red: { icon: XCircle, label: 'Unvollständig', className: 'status-badge-red' },
};

export function StatusIndicator({ status, label, size = 'sm' }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const displayLabel = label || config.label;

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium',
      config.className,
      size === 'sm' && 'text-xs',
      size === 'md' && 'text-sm',
      size === 'lg' && 'text-base',
    )}>
      <Icon className={cn(size === 'sm' ? 'h-3 w-3' : size === 'md' ? 'h-4 w-4' : 'h-5 w-5')} />
      {displayLabel}
    </span>
  );
}
