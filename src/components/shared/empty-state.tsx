import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center',
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {children && (
        <div className="max-w-xs text-xs leading-relaxed text-muted-foreground">{children}</div>
      )}
    </div>
  );
}
