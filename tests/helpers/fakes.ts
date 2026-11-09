import {
  createServerEvent,
  type CapabilitiesDTO,
  type ClientJsonEvent,
  type CreateInterviewRequest,
  type InterviewSummaryDTO,
  type ServerEvent,
  type SessionState,
} from '@shared';
import { vi } from 'vitest';
import { createInterviewApp } from '@/composition/create-interview-app';
import type { AudioCapture, AudioCaptureOptions } from '@/services/audio.service';
import type { InterviewApi } from '@/services/interview-api.service';
import type { ConnectionInfo, RealtimeSocket, SocketStats } from '@/services/websocket.service';
import type { AudioDevice, ConnectionStatus, MicPermission } from '@/types';

export const INTERVIEW_ID = '7f1c8e0a-6c1e-4b8a-9d55-2f3a0d9b1c11';
export const SESSION_ID = '0b9d3e4f-1a2b-4c5d-8e9f-a0b1c2d3e4f5';
export const QUESTION_ID = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
export const ANSWER_ID = '9f8e7d6c-5b4a-4c3d-9e2f-1a0b9c8d7e6f';

const SIMULATED = { name: 'mock', model: 'scripted-demo', simulated: true };

export const CAPABILITIES: CapabilitiesDTO = {
  protocolVersion: 1,
  modes: {
    demo: { available: true, reason: null, transcription: SIMULATED, llm: SIMULATED },
    live: {
      available: false,
      reason: 'Set DEEPGRAM_API_KEY on the server to enable Live Mode',
      transcription: { name: 'deepgram', model: 'nova-3', simulated: false },
      llm: SIMULATED,
    },
  },
  audio: { encoding: 'linear16', sampleRate: 16_000, channels: 1, frameDurationMs: 50 },
  detection: { silenceThresholdMs: 1_200 },
  limits: {
    resumeChars: 20_000,
    jobDescriptionChars: 12_000,
    instructionsChars: 2_000,
    maxMessageBytes: 262_144,
  },
};

export function summary(overrides: Partial<InterviewSummaryDTO> = {}): InterviewSummaryDTO {
  return {
    id: INTERVIEW_ID,
    mode: 'demo',
    status: 'idle',
    activeSessionId: null,
    sessionCount: 0,
    createdAt: 1,
    updatedAt: 1,
    context: { resumeChars: 0, jobDescriptionChars: 0, instructionsChars: 0 },
    stats: { transcriptSegments: 0, questions: 0, answers: 0 },
    ...overrides,
  };
}

/** Server event factories (session-scoped to SESSION_ID unless overridden). */
export const events = {
  ready: (sessionId = SESSION_ID) =>
    createServerEvent('session.ready', sessionId, {
      interviewId: INTERVIEW_ID,
      resumed: false,
      mode: 'demo',
      providers: { transcription: SIMULATED, llm: SIMULATED },
      audio: { encoding: 'linear16', sampleRate: 16_000, channels: 1, frameDurationMs: 50 },
      detection: { silenceThresholdMs: 1_200 },
      protocolVersion: 1,
    }),
  status: (state: SessionState, reason: string | null = null, sessionId = SESSION_ID) =>
    createServerEvent('session.status', sessionId, { state, reason }),
  segment: (
    type: 'transcript.partial' | 'transcript.final',
    text: string,
    id: string,
    startMs = 0,
    sessionId = SESSION_ID,
  ) =>
    createServerEvent(type, sessionId, {
      segment: {
        id,
        text,
        isFinal: type === 'transcript.final',
        startMs,
        endMs: startMs + 1_000,
        confidence: 0.9,
        speechFinal: false,
        receivedAt: 1,
      },
    }),
  question: (text: string, id = QUESTION_ID) =>
    createServerEvent('question.detected', SESSION_ID, {
      question: {
        id,
        text,
        confidence: 0.92,
        reasons: ['question-mark', 'trigger:silence'],
        status: 'detected',
        utteranceEndedAt: 1,
        detectedAt: 2,
      },
    }),
  answerStarted: (answerId = ANSWER_ID, questionId = QUESTION_ID) =>
    createServerEvent('answer.started', SESSION_ID, {
      answerId,
      questionId,
      provider: SIMULATED,
      startedAt: 10,
    }),
  delta: (delta: string, index: number, answerId = ANSWER_ID) =>
    createServerEvent('answer.delta', SESSION_ID, { answerId, delta, index }),
  answerCompleted: (
    text: string,
    status: 'completed' | 'cancelled' | 'failed' = 'completed',
    answerId = ANSWER_ID,
  ) =>
    createServerEvent('answer.completed', SESSION_ID, {
      answer: {
        id: answerId,
        questionId: QUESTION_ID,
        text,
        status,
        finishReason:
          status === 'completed' ? 'stop' : status === 'cancelled' ? 'cancelled' : 'error',
        provider: SIMULATED,
        startedAt: 10,
        firstTokenAt: 300,
        completedAt: 2_000,
        wordCount: text.split(/\s+/).length,
        errorMessage: status === 'failed' ? 'OpenAI rate limit or quota exceeded' : null,
      },
      latency: { firstTokenMs: 290, totalMs: 1_990 },
    }),
  error: (
    code: 'INTERVIEW_NOT_FOUND' | 'RATE_LIMITED' | 'TRANSCRIPTION_PROVIDER_ERROR',
    message = 'Server error',
    sessionId: string | null = null,
  ) => createServerEvent('session.error', sessionId, { code, message, recoverable: true }),
};

/** In-memory RealtimeSocket. Auto-acknowledges session.start/stop like the real server. */
export class FakeSocket implements RealtimeSocket {
  status: ConnectionStatus = 'idle';
  clockOffsetMs = 0;
  autoReady = true;
  readonly sent: ClientJsonEvent[] = [];
  readonly audioFrames: ArrayBuffer[] = [];
  private readonly eventListeners = new Set<(event: ServerEvent) => void>();
  private readonly statusListeners = new Set<
    (status: ConnectionStatus, info: ConnectionInfo) => void
  >();

  connect = vi.fn(async () => this.setStatus('open'));
  disconnect = vi.fn(() => this.setStatus('closed'));

  send(event: ClientJsonEvent): boolean {
    if (this.status !== 'open') return false;
    this.sent.push(event);
    if (event.type === 'session.start' && this.autoReady) {
      queueMicrotask(() => {
        this.emit({
          ...events.ready(),
          payload: { ...events.ready().payload, resumed: Boolean(event.payload.resumeSessionId) },
        });
        this.emit(events.status('listening', 'started'));
      });
    }
    if (event.type === 'session.stop')
      queueMicrotask(() => this.emit(events.status('stopped', 'client_requested')));
    return true;
  }

  sendAudio(frame: ArrayBuffer): boolean {
    this.audioFrames.push(frame);
    return true;
  }

  onEvent(listener: (event: ServerEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onStatus(listener: (status: ConnectionStatus, info: ConnectionInfo) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  stats(): SocketStats {
    return { framesSent: this.audioFrames.length, framesDropped: 0, rttMs: 5 };
  }

  emit(event: ServerEvent): void {
    this.eventListeners.forEach((listener) => listener(event));
  }

  setStatus(status: ConnectionStatus, info: Partial<ConnectionInfo> = {}): void {
    this.status = status;
    this.statusListeners.forEach((listener) =>
      listener(status, { attempt: 0, reconnected: false, rttMs: 5, ...info }),
    );
  }

  sentOfType<T extends ClientJsonEvent['type']>(type: T): Extract<ClientJsonEvent, { type: T }>[] {
    return this.sent.filter(
      (event): event is Extract<ClientJsonEvent, { type: T }> => event.type === type,
    );
  }
}

export class FakeApi implements InterviewApi {
  getCapabilities = vi.fn(async () => CAPABILITIES);
  createInterview = vi.fn(async (request: CreateInterviewRequest) =>
    summary({ mode: request.mode ?? 'demo' }),
  );
  updateContext = vi.fn(async () => summary());
  deleteInterview = vi.fn(async () => undefined);
}

export class FakeAudio implements AudioCapture {
  active = false;
  options: AudioCaptureOptions | null = null;
  permission: MicPermission = 'granted';
  devices: AudioDevice[] = [{ deviceId: 'mic-1', label: 'Studio Mic' }];

  isSupported = () => true;
  isTabAudioSupported = () => true;
  queryPermission = vi.fn(async () => this.permission);
  requestPermission = vi.fn(async () => this.permission);
  listInputDevices = vi.fn(async () => this.devices);
  onDevicesChanged = () => () => undefined;
  start = vi.fn(async (options: AudioCaptureOptions) => {
    this.options = options;
    this.active = true;
  });
  stop = vi.fn(async () => {
    this.active = false;
  });

  emitFrame(capturedAt = 1_000): void {
    this.options?.onFrame(new Int16Array(800), capturedAt);
  }
}

export function createTestApp() {
  const socket = new FakeSocket();
  const api = new FakeApi();
  const audio = new FakeAudio();
  const app = createInterviewApp({
    serverUrl: 'http://localhost:4000',
    services: { socket, api, audio },
  });
  return { app, socket, api, audio, store: app.store, controller: app.controllers.interview };
}

/** Lets queued microtasks and promise chains settle. */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}
