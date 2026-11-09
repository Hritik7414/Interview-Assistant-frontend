'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

/** Accessible radio group rendered as a segmented control (arrow keys move the selection). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const enabled = options.filter((option) => !option.disabled);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || disabled)
      return;
    event.preventDefault();
    const index = enabled.findIndex((option) => option.value === value);
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = enabled[(index + step + enabled.length) % enabled.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      onKeyDown={onKeyDown}
      className={cn('inline-flex h-9 w-full items-center rounded-lg bg-muted p-[3px]', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.5',
              selected && 'bg-card text-foreground shadow-sm',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
