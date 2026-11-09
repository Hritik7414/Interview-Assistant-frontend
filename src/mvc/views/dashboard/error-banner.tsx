'use client';

import { CircleAlert, ServerOff, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { UiError } from '@/types';

const TITLES: Partial<Record<UiError['code'], string>> = {
  AUDIO_PERMISSION_DENIED: 'Microphone blocked',
  AUDIO_DEVICE_NOT_FOUND: 'Microphone not found',
  AUDIO_DEVICE_BUSY: 'Microphone busy',
  NO_TAB_AUDIO: 'No tab audio',
  AUDIO_ENDED: 'Audio source ended',
  NETWORK_ERROR: 'Server unreachable',
  DISCONNECTED: 'Session ended',
  VALIDATION_ERROR: 'Check your context',
  LIVE_MODE_UNAVAILABLE: 'Live Mode unavailable',
  TRANSCRIPTION_PROVIDER_ERROR: 'Transcription problem',
  LLM_PROVIDER_ERROR: 'Answer generation problem',
  RATE_LIMITED: 'Slow down',
  START_TIMEOUT: 'Start timed out',
};

export function ErrorBanner({
  error,
  capabilitiesError,
  onDismiss,
}: {
  error: UiError | null;
  capabilitiesError: string | null;
  onDismiss: () => void;
}) {
  if (!error && !capabilitiesError) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-4">
      {capabilitiesError && !error && (
        <Alert variant="warning">
          <ServerOff aria-hidden />
          <AlertTitle>Backend not reachable</AlertTitle>
          <AlertDescription>
            {capabilitiesError}. Start the backend (`npm run dev` in the backend folder) and reload.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant={error.recoverable ? 'warning' : 'destructive'} className="pr-12">
          <CircleAlert aria-hidden />
          <AlertTitle>{TITLES[error.code] ?? 'Something went wrong'}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="absolute top-2.5 right-2.5"
          >
            <X aria-hidden />
          </Button>
        </Alert>
      )}
    </div>
  );
}
