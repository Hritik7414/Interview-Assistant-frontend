import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'scrollbar-thin flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground/80 focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}
