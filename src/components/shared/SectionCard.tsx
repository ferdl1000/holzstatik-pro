import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}

export function SectionCard({ title, subtitle, children, className, headerRight }: SectionCardProps) {
  return (
    <div className={cn('rounded-lg border bg-card shadow-sm', className)}>
      <div className="flex items-start justify-between border-b px-5 py-3.5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {headerRight}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
