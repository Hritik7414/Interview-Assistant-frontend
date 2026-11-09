import {
  AUDIO_CHANNELS,
  AUDIO_ENCODING,
  AUDIO_SAMPLE_RATE,
  encodeAudioFrame,
  type InterviewContextPatch,
  type InterviewMode,
  type ServerEvent,
  type ServerEventOf,
} from '@shared';
import {
  AUDIO_LEVEL_UPDATE_MS,
  AUDIO_STATS_UPDATE_MS,
  CONTEXT_SAVE_DEBOUNCE_MS,
  SESSION_TIMEOUTS,
} from '@/lib/constants';
import {
  canStart,
  canStop,
  isConfigurationLocked,
  isModeAvailable,
  isSessionLive,
  mapServerState,
  validateContext,
  type ContextField,
} from '@/mvc/models/interview.model';
import { AudioCaptureError, type AudioCapture } from '@/services/audio.service';
import { ApiError, type InterviewApi } from '@/services/interview-api.service';
import type { ConnectionInfo, RealtimeSocket, SocketStats } from '@/services/websocket.service';
import type { AudioSlice, InterviewStore, SessionSlice } from '@/store/interview.store';
import type {
  AudioSourceKind,
  ClientSessionStatus,
  ConnectionStatus,
  UiError,
  UiErrorCode,
} from '@/types';
import type { AnswerController } from './answer.controller';
import type { QuestionController } from './question.controller';
import type { TranscriptController } from './transcript.controller';

export interface InterviewControllerDeps {
  store: InterviewStore;
  api: InterviewApi;
  socket: RealtimeSocket;
  audio: AudioCapture;
  transcript: TranscriptController;
  question: QuestionController;
  answer: AnswerController;
  now?: () => number;
  timeouts?: { startMs: number; stopMs: number };
  contextSaveDebounceMs?: number;
}

export class ControllerError extends Error {
  constructor(
    readonly code: UiErrorCode,
    message: string,
    readonly recoverable = true,
  ) {
    super(message);
    this.name = 'ControllerError';
  }
}

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => undefined); // Rejections are observed by awaiting callers only.
  return { promise, resolve, reject };
}

const STOP_REASON_MESSAGES: Record<string, string> = {
  transcription_failed: 'Transcription stopped unexpectedly. Start a new session to continue.',
  resume_timeout: 'The session expired while the connection was lost.',
  server_shutdown: 'The server restarted. Start a new session to continue.',
  interview_deleted: 'This interview was deleted.',
};

/**
 * Orchestrates the interview session from the UI's point of view:
 * REST interview creation → WebSocket session → audio capture → event routing.
 * Framework-free: views call its methods, it writes to the store.
 */
export class InterviewController {
  private subscriptions: Array<() => void> = [];
  private pendingReady: Deferred | null = null;
  private pendingStop: Deferred | null = null;
  private attemptId = 0;
  private seq = 0;
  private statsBaseline: SocketStats = { framesSent: 0, framesDropped: 0, rttMs: null };
  private lastLevelAt = 0;
  private lastStatsAt = 0;
  private contextTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPatch: InterviewContextPatch = {};
  private readonly now: () => number;
  private readonly timeouts: { startMs: number; stopMs: number };

  constructor(private readonly deps: InterviewControllerDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.timeouts = deps.timeouts ?? SESSION_TIMEOUTS;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    this.unsubscribeAll();
    const { socket, audio } = this.deps;
    this.subscriptions.push(
      socket.onEvent((event) => this.handleServerEvent(event)),
      socket.onStatus((status, info) => this.handleConnectionStatus(status, info)),
      audio.onDevicesChanged(() => void this.refreshDevices()),
    );
    this.setAudio({
      tabAudioSupported: audio.isTabAudioSupported(),
      ...(audio.isSupported() ? {} : { permission: 'unsupported' as const }),
    });
    await Promise.all([this.loadCapabilities(), this.refreshPermission()]);
  }

  dispose(): void {
    this.unsubscribeAll();
    this.attemptId += 1;
    if (this.contextTimer) clearTimeout(this.contextTimer);
    this.pendingReady?.reject(new ControllerError('DISCONNECTED', 'Disposed'));
    this.pendingStop?.resolve();
    void this.deps.audio.stop();
    this.deps.socket.disconnect();
  }

  // ── Configuration actions ─────────────────────────────────────────────────

  setMode(mode: InterviewMode): void {
    const state = this.deps.store.getState();
    if (isConfigurationLocked(state.session.status) || !isModeAvailable(state.capabilities, mode))
      return;
    this.deps.store.setState({ mode });
    if (mode === 'live' && state.audio.source === 'simulated')
      this.setAudio({ source: 'microphone' });
  }

  setAudioSource(source: AudioSourceKind): void {
    const state = this.deps.store.getState();
    if (isConfigurationLocked(state.session.status)) return;
    if (source === 'simulated' && state.mode !== 'demo') return;
    this.setAudio({ source });
  }

  setDevice(deviceId: string): void {
    if (isConfigurationLocked(this.deps.store.getState().session.status)) return;
    this.setAudio({ deviceId });
  }

  async requestMicrophone(): Promise<void> {
    const permission = await this.deps.audio.requestPermission();
    this.setAudio({ permission });
    if (permission === 'granted') await this.refreshDevices();
    if (permission === 'denied') {
      this.setError(
        new ControllerError(
          'AUDIO_PERMISSION_DENIED',
          'Microphone access was denied. Allow it in your browser’s site settings.',
        ),
      );
    }
  }

  async refreshDevices(): Promise<void> {
    const devices = await this.deps.audio.listInputDevices().catch(() => []);
    this.deps.store.setState((state) => ({
      audio: {
        ...state.audio,
        devices,
        deviceId:
          state.audio.deviceId && devices.some((device) => device.deviceId === state.audio.deviceId)
            ? state.audio.deviceId
            : (devices[0]?.deviceId ?? null),
      },
    }));
  }

  updateContext(field: ContextField, value: string): void {
    this.deps.store.setState((state) => ({ context: { ...state.context, [field]: value } }));
    const { session } = this.deps.store.getState();
    if (!session.interviewId || !isSessionLive(session.status)) return;
    this.pendingPatch = { ...this.pendingPatch, [field]: value };
    this.deps.store.setState({ contextSync: 'saving' });
    if (this.contextTimer) clearTimeout(this.contextTimer);
    this.contextTimer = setTimeout(
      () => void this.flushContextPatch(),
      this.deps.contextSaveDebounceMs ?? CONTEXT_SAVE_DEBOUNCE_MS,
    );
  }

  dismissError(): void {
    this.deps.store.setState({ error: null });
  }

  // ── Session actions ───────────────────────────────────────────────────────

  async start(): Promise<void> {
    const { store, api, socket, audio } = this.deps;
    const state = store.getState();
    if (!canStart(state.session.status)) return;

    const validation = validateContext(state.context);
    if (!validation.valid) {
      this.setError(
        new ControllerError(
          'VALIDATION_ERROR',
          Object.values(validation.errors)[0] ?? 'Invalid context',
        ),
      );
      return;
    }
    if (!isModeAvailable(state.capabilities, state.mode)) {
      this.setError(
        new ControllerError(
          'LIVE_MODE_UNAVAILABLE',
          state.capabilities?.modes.live.reason ?? 'Live Mode is unavailable',
        ),
      );
      return;
    }

    const attempt = ++this.attemptId;
    const current = () => attempt === this.attemptId;
    this.resetSessionData();
    this.setSession({
      status: 'preparing',
      sessionId: null,
      interviewId: null,
      providers: null,
      startedAt: null,
    });

    try {
      const interview = await api.createInterview({ mode: state.mode, context: state.context });
      if (!current()) return;
      this.setSession({ status: 'connecting', interviewId: interview.id });

      await socket.connect();
      if (!current()) return;
      await this.requestSession(interview.id);
      if (!current()) return;

      this.seq = 0;
      this.statsBaseline = socket.stats();
      await audio.start({
        source: state.audio.source,
        deviceId: state.audio.deviceId,
        onFrame: (pcm, capturedAt) => this.handleFrame(pcm, capturedAt),
        onLevel: (level) => this.handleLevel(level),
        onEnded: (info) => this.handleAudioEnded(info),
      });
      if (!current()) {
        await audio.stop();
        return;
      }
      this.setAudio({ capturing: true, framesSent: 0, framesDropped: 0 });
      if (
        state.audio.permission !== 'granted' &&
        state.audio.source !== 'simulated' &&
        state.audio.source !== 'tab'
      ) {
        this.setAudio({ permission: 'granted' });
        void this.refreshDevices();
      }
    } catch (error) {
      if (!current()) return;
      await this.teardownTransport();
      this.setSession({ status: 'error', sessionId: null });
      this.setError(error);
    }
  }

  async stop(): Promise<void> {
    const { store, socket, audio } = this.deps;
    const { session } = store.getState();
    if (!canStop(session.status)) return;
    this.attemptId += 1; // invalidates any start still in flight
    this.setSession({ status: 'stopping' });

    await audio.stop();
    this.setAudio({ capturing: false, level: 0 });
    if (session.sessionId && socket.status === 'open') {
      this.pendingStop = deferred();
      socket.send({ type: 'session.stop', payload: { sessionId: session.sessionId } });
      await Promise.race([
        this.pendingStop.promise,
        new Promise((resolve) => setTimeout(resolve, this.timeouts.stopMs)),
      ]);
      this.pendingStop = null;
    }
    this.pendingReady?.reject(new ControllerError('DISCONNECTED', 'Session stopped'));
    socket.disconnect();
    this.setSession({ status: 'stopped', sessionId: null });
  }

  cancelAnswer(): boolean {
    return this.deps.answer.cancelActive();
  }

  // ── Server events ─────────────────────────────────────────────────────────

  private handleServerEvent(event: ServerEvent): void {
    switch (event.type) {
      case 'session.ready':
        return this.handleReady(event);
      case 'session.status':
        return this.handleStatus(event);
      case 'session.error':
        return this.handleServerError(event);
      case 'transcript.partial':
        return this.isCurrent(event) ? this.deps.transcript.handlePartial(event) : undefined;
      case 'transcript.final':
        return this.isCurrent(event) ? this.deps.transcript.handleFinal(event) : undefined;
      case 'question.detected':
        return this.isCurrent(event) ? this.deps.question.handleDetected(event) : undefined;
      case 'answer.started':
        return this.isCurrent(event) ? this.deps.answer.handleStarted(event) : undefined;
      case 'answer.delta':
        return this.isCurrent(event) ? this.deps.answer.handleDelta(event) : undefined;
      case 'answer.completed':
        return this.isCurrent(event) ? this.deps.answer.handleCompleted(event) : undefined;
    }
  }

  private isCurrent(event: ServerEvent): boolean {
    const { sessionId } = this.deps.store.getState().session;
    return sessionId !== null && event.sessionId === sessionId;
  }

  private handleReady(event: ServerEventOf<'session.ready'>): void {
    const { session } = this.deps.store.getState();
    this.setSession({
      status: 'listening',
      sessionId: event.sessionId,
      interviewId: event.payload.interviewId,
      providers: event.payload.providers,
      startedAt: session.startedAt ?? this.now(),
    });
    this.pendingReady?.resolve();
  }

  private handleStatus(event: ServerEventOf<'session.status'>): void {
    if (!this.isCurrent(event)) return;
    const { metrics, audio, state, reason } = event.payload;
    if (metrics || audio) {
      this.deps.store.setState({
        ...(metrics ? { metrics } : {}),
        ...(audio ? { serverAudio: audio } : {}),
      });
    }
    const status = this.deps.store.getState().session.status;
    if (state === 'stopped') {
      this.pendingStop?.resolve();
      if (status !== 'stopping') void this.endSessionFromServer(reason ?? 'unknown');
      return;
    }
    const mapped = mapServerState(state);
    if (isSessionLive(mapped) && (isSessionLive(status) || status === 'connecting')) {
      this.setSession({ status: mapped });
    }
  }

  private handleServerError(event: ServerEventOf<'session.error'>): void {
    const error = new ControllerError(
      event.payload.code,
      event.payload.message,
      event.payload.recoverable,
    );
    if (this.pendingReady) {
      this.pendingReady.reject(error);
      return;
    }
    this.setError(error);
  }

  private async endSessionFromServer(reason: string): Promise<void> {
    // Settle state first: the intentional disconnect below must not read as a connection loss.
    this.setSession({ status: 'stopped', sessionId: null });
    await this.teardownTransport();
    this.setError(
      new ControllerError(
        'DISCONNECTED',
        STOP_REASON_MESSAGES[reason] ?? `The session ended (${reason}).`,
        false,
      ),
    );
  }

  // ── Connection ────────────────────────────────────────────────────────────

  private handleConnectionStatus(status: ConnectionStatus, info: ConnectionInfo): void {
    this.deps.store.setState({ connection: { status, attempt: info.attempt, rttMs: info.rttMs } });
    const { session } = this.deps.store.getState();
    if (status === 'reconnecting' && isSessionLive(session.status)) {
      this.setSession({ status: 'reconnecting' });
    } else if (
      status === 'open' &&
      info.reconnected &&
      session.status === 'reconnecting' &&
      session.sessionId &&
      session.interviewId
    ) {
      void this.resume(session.interviewId, session.sessionId);
    } else if (status === 'closed' && isSessionLive(session.status)) {
      void this.failSession(
        new ControllerError(
          'DISCONNECTED',
          'Lost connection to the server. The session has ended.',
          false,
        ),
      );
    }
  }

  private async resume(interviewId: string, sessionId: string): Promise<void> {
    try {
      await this.requestSession(interviewId, sessionId);
    } catch (error) {
      await this.failSession(error);
    }
  }

  private async requestSession(interviewId: string, resumeSessionId?: string): Promise<void> {
    const ready = deferred();
    this.pendingReady = ready;
    const timer = setTimeout(
      () =>
        ready.reject(
          new ControllerError('START_TIMEOUT', 'The server did not start the session in time.'),
        ),
      this.timeouts.startMs,
    );
    const sent = this.deps.socket.send({
      type: 'session.start',
      payload: {
        interviewId,
        audio: {
          encoding: AUDIO_ENCODING,
          sampleRate: AUDIO_SAMPLE_RATE,
          channels: AUDIO_CHANNELS,
        },
        ...(resumeSessionId ? { resumeSessionId } : {}),
      },
    });
    if (!sent) ready.reject(new ControllerError('DISCONNECTED', 'Not connected to the server.'));
    try {
      await ready.promise;
    } finally {
      clearTimeout(timer);
      if (this.pendingReady === ready) this.pendingReady = null;
    }
  }

  private async failSession(error: unknown): Promise<void> {
    this.attemptId += 1;
    this.setSession({ status: 'error', sessionId: null });
    this.setError(error);
    await this.teardownTransport();
  }

  private async teardownTransport(): Promise<void> {
    await this.deps.audio.stop();
    this.setAudio({ capturing: false, level: 0 });
    this.deps.socket.disconnect();
  }

  // ── Audio ─────────────────────────────────────────────────────────────────

  private handleFrame(pcm: Int16Array, capturedAt: number): void {
    const { socket } = this.deps;
    // Timestamps are shifted into the server's clock so ingestion latency is meaningful.
    socket.sendAudio(
      encodeAudioFrame({ seq: this.seq++, capturedAt: capturedAt + socket.clockOffsetMs, pcm }),
    );
    const now = this.now();
    if (now - this.lastStatsAt < AUDIO_STATS_UPDATE_MS) return;
    this.lastStatsAt = now;
    const stats = socket.stats();
    this.setAudio({
      framesSent: stats.framesSent - this.statsBaseline.framesSent,
      framesDropped: stats.framesDropped - this.statsBaseline.framesDropped,
    });
  }

  private handleLevel(level: number): void {
    const now = this.now();
    if (now - this.lastLevelAt < AUDIO_LEVEL_UPDATE_MS) return;
    this.lastLevelAt = now;
    this.setAudio({ level });
  }

  private handleAudioEnded(info: { reason: string; fatal: boolean }): void {
    this.setError(
      new ControllerError(
        'AUDIO_ENDED',
        info.fatal ? `${info.reason}. The session was stopped.` : info.reason,
        !info.fatal,
      ),
    );
    if (info.fatal) void this.stop();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async loadCapabilities(): Promise<void> {
    try {
      const capabilities = await this.deps.api.getCapabilities();
      this.deps.store.setState({ capabilities, capabilitiesError: null });
    } catch (error) {
      this.deps.store.setState({
        capabilitiesError: error instanceof Error ? error.message : 'Server unavailable',
      });
    }
  }

  private async refreshPermission(): Promise<void> {
    const permission = await this.deps.audio.queryPermission();
    this.setAudio({ permission });
    if (permission === 'granted') await this.refreshDevices();
  }

  private async flushContextPatch(): Promise<void> {
    const patch = this.pendingPatch;
    this.pendingPatch = {};
    const { session, context } = this.deps.store.getState();
    if (!session.interviewId || Object.keys(patch).length === 0) return;
    if (!validateContext(context).valid) {
      this.deps.store.setState({ contextSync: 'error' });
      return;
    }
    try {
      await this.deps.api.updateContext(session.interviewId, patch);
      this.deps.store.setState({ contextSync: 'saved' });
    } catch {
      this.deps.store.setState({ contextSync: 'error' });
    }
  }

  private resetSessionData(): void {
    this.deps.transcript.reset();
    this.deps.question.reset();
    this.deps.answer.reset();
    this.deps.store.setState({
      metrics: null,
      serverAudio: null,
      error: null,
      contextSync: 'idle',
    });
  }

  private setSession(patch: Partial<SessionSlice> & { status?: ClientSessionStatus }): void {
    this.deps.store.setState((state) => ({ session: { ...state.session, ...patch } }));
  }

  private setAudio(patch: Partial<AudioSlice>): void {
    this.deps.store.setState((state) => ({ audio: { ...state.audio, ...patch } }));
  }

  private setError(error: unknown): void {
    this.deps.store.setState({ error: toUiError(error, this.now()) });
  }

  private unsubscribeAll(): void {
    this.subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
  }
}

export function toUiError(error: unknown, at: number): UiError {
  if (error instanceof ControllerError)
    return { code: error.code, message: error.message, recoverable: error.recoverable, at };
  if (error instanceof ApiError)
    return { code: error.code as UiErrorCode, message: error.message, recoverable: true, at };
  if (error instanceof AudioCaptureError)
    return { code: error.code, message: error.message, recoverable: true, at };
  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Something went wrong',
    recoverable: true,
    at,
  };
}
