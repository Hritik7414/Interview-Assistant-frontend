import type {
  AudioStats,
  CapabilitiesDTO,
  InterviewContextDTO,
  InterviewMode,
  LatencySnapshot,
  ProviderDescriptor,
} from '@shared';
import { initialAnswerState, type AnswerState } from '@/mvc/models/answer.model';
import { emptyContext } from '@/mvc/models/interview.model';
import { initialQuestionState, type QuestionState } from '@/mvc/models/question.model';
import { initialTranscriptState, type TranscriptState } from '@/mvc/models/transcript.model';
import type {
  AudioDevice,
  AudioSourceKind,
  ClientSessionStatus,
  ConnectionStatus,
  MicPermission,
  UiError,
} from '@/types';

export interface SessionSlice {
  status: ClientSessionStatus;
  sessionId: string | null;
  interviewId: string | null;
  providers: { transcription: ProviderDescriptor; llm: ProviderDescriptor } | null;
  startedAt: number | null;
}

export interface AudioSlice {
  source: AudioSourceKind;
  deviceId: string | null;
  devices: AudioDevice[];
  permission: MicPermission;
  tabAudioSupported: boolean;
  capturing: boolean;
  level: number;
  framesSent: number;
  framesDropped: number;
}

export interface InterviewStoreState {
  capabilities: CapabilitiesDTO | null;
  capabilitiesError: string | null;
  mode: InterviewMode;
  context: InterviewContextDTO;
  contextSync: 'idle' | 'saving' | 'saved' | 'error';
  connection: { status: ConnectionStatus; attempt: number; rttMs: number | null };
  session: SessionSlice;
  audio: AudioSlice;
  transcript: TranscriptState;
  questions: QuestionState;
  answers: AnswerState;
  metrics: LatencySnapshot | null;
  serverAudio: AudioStats | null;
  error: UiError | null;
}

export type StateUpdate =
  Partial<InterviewStoreState> | ((state: InterviewStoreState) => Partial<InterviewStoreState>);

export interface InterviewStore {
  getState(): InterviewStoreState;
  setState(update: StateUpdate): void;
  subscribe(listener: () => void): () => void;
}

export function createInitialState(
  overrides: Partial<InterviewStoreState> = {},
): InterviewStoreState {
  return {
    capabilities: null,
    capabilitiesError: null,
    mode: 'demo',
    context: { ...emptyContext },
    contextSync: 'idle',
    connection: { status: 'idle', attempt: 0, rttMs: null },
    session: {
      status: 'idle',
      sessionId: null,
      interviewId: null,
      providers: null,
      startedAt: null,
    },
    audio: {
      source: 'microphone',
      deviceId: null,
      devices: [],
      permission: 'unknown',
      tabAudioSupported: false,
      capturing: false,
      level: 0,
      framesSent: 0,
      framesDropped: 0,
    },
    transcript: initialTranscriptState,
    questions: initialQuestionState,
    answers: initialAnswerState,
    metrics: null,
    serverAudio: null,
    error: null,
    ...overrides,
  };
}

/**
 * Minimal framework-agnostic external store (shallow top-level merge).
 * Controllers write to it; React reads it through `useSyncExternalStore`.
 */
export function createInterviewStore(initial: Partial<InterviewStoreState> = {}): InterviewStore {
  let state = createInitialState(initial);
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState(update) {
      const patch = typeof update === 'function' ? update(state) : update;
      const keys = Object.keys(patch) as Array<keyof InterviewStoreState>;
      if (keys.every((key) => Object.is(patch[key], state[key]))) return;
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
