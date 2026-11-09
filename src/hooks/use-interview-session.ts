'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { InterviewMode } from '@shared';
import {
  canStart,
  canStop,
  deriveDisplayStatus,
  isConfigurationLocked,
  isModeAvailable,
  type ContextField,
} from '@/mvc/models/interview.model';
import type { InterviewStoreState } from '@/store/interview.store';
import { useInterviewApp } from './interview-app-context';

/** Subscribes to a slice of the store. Selectors must return existing references. */
export function useInterviewSelector<T>(selector: (state: InterviewStoreState) => T): T {
  const { store } = useInterviewApp();
  const read = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, read, read);
}

/** Session-level state and actions for views. */
export function useInterviewSession() {
  const { controllers } = useInterviewApp();
  const session = useInterviewSelector((state) => state.session);
  const connection = useInterviewSelector((state) => state.connection);
  const mode = useInterviewSelector((state) => state.mode);
  const capabilities = useInterviewSelector((state) => state.capabilities);
  const capabilitiesError = useInterviewSelector((state) => state.capabilitiesError);
  const error = useInterviewSelector((state) => state.error);

  const actions = useMemo(
    () => ({
      start: () => controllers.interview.start(),
      stop: () => controllers.interview.stop(),
      setMode: (next: InterviewMode) => controllers.interview.setMode(next),
      dismissError: () => controllers.interview.dismissError(),
    }),
    [controllers],
  );

  return {
    session,
    connection,
    mode,
    capabilities,
    capabilitiesError,
    error,
    displayStatus: deriveDisplayStatus(session.status, connection.status),
    canStart: canStart(session.status),
    canStop: canStop(session.status),
    locked: isConfigurationLocked(session.status),
    liveAvailable: isModeAvailable(capabilities, 'live'),
    ...actions,
  };
}

/** Candidate context fields and their sync state. */
export function useInterviewContext() {
  const { controllers } = useInterviewApp();
  const context = useInterviewSelector((state) => state.context);
  const contextSync = useInterviewSelector((state) => state.contextSync);
  const limits = useInterviewSelector((state) => state.capabilities?.limits ?? null);
  const updateContext = useMemo(
    () => (field: ContextField, value: string) => controllers.interview.updateContext(field, value),
    [controllers],
  );
  return { context, contextSync, limits, updateContext };
}
