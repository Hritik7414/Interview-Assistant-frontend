'use client';

import { createContext, useContext } from 'react';
import type { InterviewApp } from '@/composition/create-interview-app';

export const InterviewAppContext = createContext<InterviewApp | null>(null);

export function useInterviewApp(): InterviewApp {
  const app = useContext(InterviewAppContext);
  if (!app) throw new Error('useInterviewApp must be used inside <InterviewProvider>');
  return app;
}
