'use client';

import { useMemo } from 'react';
import { isConfigurationLocked } from '@/mvc/models/interview.model';
import type { AudioSourceKind } from '@/types';
import { useInterviewApp } from './interview-app-context';
import { useInterviewSelector } from './use-interview-session';

/** Audio source/device selection, permission state and live input level. */
export function useAudioCapture() {
  const { controllers } = useInterviewApp();
  const audio = useInterviewSelector((state) => state.audio);
  const mode = useInterviewSelector((state) => state.mode);
  const status = useInterviewSelector((state) => state.session.status);

  const actions = useMemo(
    () => ({
      setSource: (source: AudioSourceKind) => controllers.interview.setAudioSource(source),
      setDevice: (deviceId: string) => controllers.interview.setDevice(deviceId),
      requestPermission: () => controllers.interview.requestMicrophone(),
      refreshDevices: () => controllers.interview.refreshDevices(),
    }),
    [controllers],
  );

  return {
    ...audio,
    usesMicrophone: audio.source === 'microphone' || audio.source === 'microphone+tab',
    simulatedAllowed: mode === 'demo',
    locked: isConfigurationLocked(status),
    ...actions,
  };
}
