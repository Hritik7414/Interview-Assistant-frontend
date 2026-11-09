import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn(
        'flex flex-col rounded-xl border border-border/80 bg-card/95 text-card-foreground shadow-[0_8px_28px_-18px_rgb(15_23_42/0.22)] transition-shadow duration-200 hover:shadow-[0_12px_34px_-18px_rgb(15_23_42/0.28)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'flex min-h-12 items-center justify-between gap-3 border-b px-4 py-2.5',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn(
        'flex items-center gap-2 text-sm font-semibold tracking-tight [&_svg]:size-4 [&_svg]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
