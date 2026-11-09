'use client';

import { LoaderCircle, Mic, Settings2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAudioCapture } from '@/hooks/use-audio-capture';
import { useInterviewSession } from '@/hooks/use-interview-session';
import { AudioLevelMeter } from './audio-level-meter';
import { AudioSourceSelect } from './audio-source-select';
import { DeviceSelect } from './device-select';
import { ModeToggle } from './mode-toggle';

export function ControlsPanel() {
  const session = useInterviewSession();
  const audio = useAudioCapture();
  const busy = session.session.status === 'preparing' || session.session.status === 'connecting';
  const stopping = session.session.status === 'stopping';

  return (
    <Card aria-label="Session controls">
      <CardHeader>
        <CardTitle>
          <Settings2 aria-hidden />
          Session
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ModeToggle
          mode={session.mode}
          onChange={session.setMode}
          liveAvailable={session.liveAvailable}
          liveReason={session.capabilities?.modes.live.reason ?? null}
          disabled={session.locked}
        />
        <AudioSourceSelect
          value={audio.source}
          onChange={audio.setSource}
          tabSupported={audio.tabAudioSupported}
          simulatedAllowed={audio.simulatedAllowed}
          disabled={audio.locked}
        />
        {audio.usesMicrophone && (
          <DeviceSelect
            devices={audio.devices}
            deviceId={audio.deviceId}
            permission={audio.permission}
            onChange={audio.setDevice}
            onRequestPermission={() => void audio.requestPermission()}
            disabled={audio.locked}
          />
        )}
        <AudioLevelMeter level={audio.level} active={audio.capturing} />

        {session.canStop ? (
          <Button
            size="lg"
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/8 hover:text-destructive"
            onClick={() => void session.stop()}
            disabled={stopping}
          >
            {busy ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <Square aria-hidden className="fill-current" />
            )}
            {busy ? 'Starting… (cancel)' : 'Stop listening'}
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full"
            onClick={() => void session.start()}
            disabled={!session.canStart || stopping}
          >
            {stopping ? <LoaderCircle aria-hidden className="animate-spin" /> : <Mic aria-hidden />}
            {stopping ? 'Stopping…' : 'Start listening'}
          </Button>
        )}

        <p className="text-[0.72rem] leading-relaxed text-muted-foreground">
          {session.mode === 'demo'
            ? 'Demo Mode plays a scripted interview, paced by your audio stream. No API keys required — all transcripts and answers are simulated.'
            : 'Tip: wear headphones so the interviewer’s voice is not captured twice when using tab audio.'}
        </p>
      </CardContent>
    </Card>
  );
}
