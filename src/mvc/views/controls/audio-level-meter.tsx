import { cn } from '@/lib/utils';

const BARS = 16;

/** Live input level so users can confirm audio is flowing. */
export function AudioLevelMeter({ level, active }: { level: number; active: boolean }) {
  const lit = active ? Math.round(Math.min(1, Math.max(0, level)) * BARS) : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        role="meter"
        aria-label="Input level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        className="flex h-4 flex-1 items-end gap-[3px]"
      >
        {Array.from({ length: BARS }, (_, index) => (
          <span
            key={index}
            className={cn(
              'flex-1 rounded-[2px] transition-[height,background-color] duration-75',
              index < lit ? (index >= BARS - 3 ? 'bg-warning' : 'bg-success') : 'bg-muted',
            )}
            style={{ height: `${35 + (index / BARS) * 65}%` }}
          />
        ))}
      </div>
      <span className="w-14 text-right text-[0.7rem] tabular-nums text-muted-foreground">
        {active ? (lit === 0 ? 'Silent' : 'Input') : 'Idle'}
      </span>
    </div>
  );
}
