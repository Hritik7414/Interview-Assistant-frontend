'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createInterviewApp, type InterviewApp } from '@/composition/create-interview-app';
import { InterviewAppContext } from '@/hooks/interview-app-context';

interface InterviewProviderProps {
  children: ReactNode;
  /** Backend base URL (ignored when `app` is supplied). */
  serverUrl?: string;
  /** Pre-built app instance — used by tests to inject fake services. */
  app?: InterviewApp;
}

/** Creates the controller graph once per mount and makes it available to views. */
export function InterviewProvider({ children, serverUrl, app }: InterviewProviderProps) {
  const [instance] = useState(
    () => app ?? createInterviewApp({ serverUrl: serverUrl ?? 'http://localhost:4000' }),
  );

  useEffect(() => {
    void instance.init();
    return () => instance.dispose();
  }, [instance]);

  return <InterviewAppContext.Provider value={instance}>{children}</InterviewAppContext.Provider>;
}
