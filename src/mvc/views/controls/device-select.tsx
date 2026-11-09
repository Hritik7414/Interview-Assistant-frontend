'use client';

import { MicOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AudioDevice, MicPermission } from '@/types';

export function DeviceSelect({
  devices,
  deviceId,
  permission,
  onChange,
  onRequestPermission,
  disabled,
}: {
  devices: AudioDevice[];
  deviceId: string | null;
  permission: MicPermission;
  onChange: (deviceId: string) => void;
  onRequestPermission: () => void;
  disabled: boolean;
}) {
  if (permission === 'unsupported') {
    return (
      <p className="text-xs text-destructive">This browser cannot capture microphone audio.</p>
    );
  }
  if (permission === 'denied') {
    return (
      <p className="flex items-start gap-2 rounded-md bg-destructive/8 p-2 text-xs text-destructive">
        <MicOff aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Microphone access is blocked. Enable it in your browser’s site settings, then reload.
      </p>
    );
  }
  if (permission !== 'granted' || devices.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Microphone</Label>
        <Button variant="outline" size="sm" onClick={onRequestPermission} disabled={disabled}>
          <ShieldCheck aria-hidden />
          Allow microphone access
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="audio-device">Microphone</Label>
      <Select value={deviceId ?? undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="audio-device" aria-label="Microphone device">
          <SelectValue placeholder="Default microphone" />
        </SelectTrigger>
        <SelectContent>
          {devices.map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {device.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
