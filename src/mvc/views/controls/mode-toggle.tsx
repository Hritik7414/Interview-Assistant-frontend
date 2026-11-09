'use client';

import type { InterviewMode } from '@shared';
import { FlaskConical, Radio } from 'lucide-react';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { Label } from '@/components/ui/label';

export function ModeToggle({
  mode,
  onChange,
  liveAvailable,
  liveReason,
  disabled,
}: {
  mode: InterviewMode;
  onChange: (mode: InterviewMode) => void;
  liveAvailable: boolean;
  liveReason: string | null;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label id="mode-label">Mode</Label>
      <SegmentedControl<InterviewMode>
        label="Mode"
        value={mode}
        onChange={onChange}
        disabled={disabled}
        options={[
          {
            value: 'demo',
            label: (
              <>
                <FlaskConical aria-hidden />
                Demo
              </>
            ),
          },
          {
            value: 'live',
            label: (
              <>
                <Radio aria-hidden />
                Live
              </>
            ),
            disabled: !liveAvailable,
            ...(liveAvailable
              ? {}
              : { title: liveReason ?? 'Live Mode is not configured on the server' }),
          },
        ]}
      />
      {!liveAvailable && liveReason && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">Live: {liveReason}</p>
      )}
    </div>
  );
}
