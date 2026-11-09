import { LoaderCircle, Sparkles } from 'lucide-react';
import type { DisplayStatus } from '@/mvc/models/interview.model';
import { cn } from '@/lib/utils';

const STATUS_PRESENTATION: Record<
  DisplayStatus,
  { label: string; tone: string; dot: string; pulse?: boolean; spin?: boolean; sparkle?: boolean }
> = {
  ready: { label: 'Ready', tone: 'text-muted-foreground bg-muted', dot: 'bg-muted-foreground/60' },
  starting: { label: 'Starting…', tone: 'text-info bg-info/10', dot: 'bg-info', spin: true },
  listening: {
    label: 'Listening',
    tone: 'text-success bg-success/10',
    dot: 'bg-success',
    pulse: true,
  },
  thinking: {
    label: 'Thinking…',
    tone: 'text-warning bg-warning/12',
    dot: 'bg-warning',
    sparkle: true,
  },
  answering: {
    label: 'Answering',
    tone: 'text-primary bg-primary/10',
    dot: 'bg-primary',
    pulse: true,
  },
  reconnecting: {
    label: 'Reconnecting…',
    tone: 'text-warning bg-warning/12',
    dot: 'bg-warning',
    spin: true,
  },
  stopping: {
    label: 'Stopping…',
    tone: 'text-muted-foreground bg-muted',
    dot: 'bg-muted-foreground',
    spin: true,
  },
  disconnected: {
    label: 'Disconnected',
    tone: 'text-destructive bg-destructive/10',
    dot: 'bg-destructive',
  },
  error: { label: 'Error', tone: 'text-destructive bg-destructive/10', dot: 'bg-destructive' },
};

export function statusLabel(status: DisplayStatus): string {
  return STATUS_PRESENTATION[status].label;
}

/** Pill showing the combined session/connection status. */
export function StatusIndicator({
  status,
  className,
}: {
  status: DisplayStatus;
  className?: string;
}) {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <span
      role="status"
      aria-live="polite"
      data-status={status}
      className={cn(
        'inline-flex h-7 items-center gap-2 rounded-full px-3 text-xs font-medium',
        presentation.tone,
        className,
      )}
    >
      {presentation.spin ? (
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      ) : presentation.sparkle ? (
        <Sparkles aria-hidden className="size-3.5 animate-pulse" />
      ) : (
        <span aria-hidden className="relative flex size-2">
          {presentation.pulse && (
            <span
              className={cn(
                'absolute inline-flex size-full rounded-full animate-pulse-ring',
                presentation.dot,
              )}
            />
          )}
          <span className={cn('relative inline-flex size-2 rounded-full', presentation.dot)} />
        </span>
      )}
      {presentation.label}
    </span>
  );
}
