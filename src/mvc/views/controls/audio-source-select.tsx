'use client';

import { Laptop, Mic, MonitorSpeaker, Waves, type LucideIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AudioSourceKind } from '@/types';

const SOURCES: ReadonlyArray<{
  value: AudioSourceKind;
  label: string;
  icon: LucideIcon;
  needsTab?: boolean;
  demoOnly?: boolean;
}> = [
  { value: 'microphone', label: 'Microphone', icon: Mic },
  { value: 'microphone+tab', label: 'Microphone + tab audio', icon: Laptop, needsTab: true },
  { value: 'tab', label: 'Tab audio only', icon: MonitorSpeaker, needsTab: true },
  { value: 'simulated', label: 'Simulated input (no mic)', icon: Waves, demoOnly: true },
];

export function AudioSourceSelect({
  value,
  onChange,
  tabSupported,
  simulatedAllowed,
  disabled,
}: {
  value: AudioSourceKind;
  onChange: (value: AudioSourceKind) => void;
  tabSupported: boolean;
  simulatedAllowed: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="audio-source">Audio source</Label>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as AudioSourceKind)}
        disabled={disabled}
      >
        <SelectTrigger id="audio-source" aria-label="Audio source">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SOURCES.filter((source) => simulatedAllowed || !source.demoOnly).map(
            ({ value: option, label, icon: Icon, needsTab }) => (
              <SelectItem key={option} value={option} disabled={needsTab && !tabSupported}>
                <Icon aria-hidden />
                {label}
                {needsTab && !tabSupported ? ' (unsupported)' : ''}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
