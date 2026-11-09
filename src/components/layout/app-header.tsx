import type { InterviewMode } from '@shared';
import { AudioLines, FlaskConical, Radio, Wifi, WifiOff } from 'lucide-react';
import { StatusIndicator } from '@/components/shared/status-indicator';
import { Badge } from '@/components/ui/badge';
import type { DisplayStatus } from '@/mvc/models/interview.model';
import { cn, formatMs } from '@/lib/utils';
import type { ConnectionStatus } from '@/types';

export interface AppHeaderProps {
  status: DisplayStatus;
  mode: InterviewMode;
  connection: { status: ConnectionStatus; rttMs: number | null; attempt: number };
  serverReachable: boolean | null;
}

function connectionLabel({
  connection,
  serverReachable,
}: Pick<AppHeaderProps, 'connection' | 'serverReachable'>) {
  switch (connection.status) {
    case 'open':
      return {
        text: connection.rttMs === null ? 'Connected' : `Connected · ${formatMs(connection.rttMs)}`,
        ok: true,
      };
    case 'connecting':
      return { text: 'Connecting…', ok: true };
    case 'reconnecting':
      return {
        text: `Reconnecting${connection.attempt > 0 ? ` (${connection.attempt})` : ''}…`,
        ok: false,
      };
    default:
      if (serverReachable === false) return { text: 'Server unreachable', ok: false };
      return { text: serverReachable ? 'Server online' : 'Checking server…', ok: true };
  }
}

/** Product header: brand, mode, session status and realtime connection health. */
export function AppHeader({ status, mode, connection, serverReachable }: AppHeaderProps) {
  const label = connectionLabel({ connection, serverReachable });
  return (
    <header className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/75 px-3 backdrop-blur-xl sm:gap-4 sm:px-5 lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
          <AudioLines aria-hidden className="size-4.5" />
        </span>
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="text-[0.95rem] font-semibold tracking-tight">Cue</h1>
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">
            Real-time interview assistant
          </span>
        </div>
        {mode === 'demo' ? (
          <Badge variant="warning" className="ml-1">
            <FlaskConical aria-hidden />
            Demo Mode
          </Badge>
        ) : (
          <Badge variant="info" className="ml-1">
            <Radio aria-hidden />
            Live Mode
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'hidden items-center gap-1.5 text-xs text-muted-foreground md:inline-flex',
            !label.ok && 'text-destructive',
          )}
          aria-label={`Connection: ${label.text}`}
        >
          {label.ok ? (
            <Wifi aria-hidden className="size-3.5" />
          ) : (
            <WifiOff aria-hidden className="size-3.5" />
          )}
          {label.text}
        </span>
        <StatusIndicator status={status} />
      </div>
    </header>
  );
}
