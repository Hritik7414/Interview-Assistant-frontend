'use client';

import { useInterviewSelector } from './use-interview-session';

/** Realtime connection health (status, reconnect attempt, round-trip time). */
export function useConnection() {
  return useInterviewSelector((state) => state.connection);
}
