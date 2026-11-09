'use client';

import { useMemo } from 'react';
import { groupUtterances, transcriptWordCount } from '@/mvc/models/transcript.model';
import { useInterviewSelector } from './use-interview-session';

export function useTranscript() {
  const transcript = useInterviewSelector((state) => state.transcript);
  const status = useInterviewSelector((state) => state.session.status);
  const providers = useInterviewSelector((state) => state.session.providers);
  const utterances = useMemo(() => groupUtterances(transcript), [transcript]);
  return {
    lines: transcript.lines,
    partial: transcript.partial,
    utterances,
    wordCount: transcriptWordCount(transcript),
    status,
    simulated: providers?.transcription.simulated ?? false,
  };
}
