'use client';

import { useInterviewSelector } from './use-interview-session';

/** Latency metrics pushed by the server plus client-side transport counters. */
export function useDiagnostics() {
  const metrics = useInterviewSelector((state) => state.metrics);
  const serverAudio = useInterviewSelector((state) => state.serverAudio);
  const connection = useInterviewSelector((state) => state.connection);
  const audio = useInterviewSelector((state) => state.audio);
  return {
    metrics,
    serverAudio,
    rttMs: connection.rttMs,
    framesSent: audio.framesSent,
    framesDropped: audio.framesDropped,
  };
}
