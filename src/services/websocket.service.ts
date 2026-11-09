import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  ServerEventSchema,
  type ClientJsonEvent,
  type ServerEvent,
} from '@shared';
import { MAX_SOCKET_BUFFERED_BYTES, RECONNECT_POLICY } from '@/lib/constants';
import type { ConnectionStatus } from '@/types';

/** The subset of the browser WebSocket API this service relies on (fakeable in tests). */
export interface WebSocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType: BinaryType;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  send(data: string | ArrayBufferLike | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

export interface ConnectionInfo {
  attempt: number;
  reconnected: boolean;
  rttMs: number | null;
}

export interface SocketStats {
  framesSent: number;
  framesDropped: number;
  rttMs: number | null;
}

/** Realtime transport used by the controllers. */
export interface RealtimeSocket {
  readonly status: ConnectionStatus;
  /** Estimated server clock − client clock (ms). */
  readonly clockOffsetMs: number;
  connect(): Promise<void>;
  /** Intentional close; never triggers a reconnect. */
  disconnect(): void;
  send(event: ClientJsonEvent): boolean;
  sendAudio(frame: ArrayBuffer): boolean;
  onEvent(listener: (event: ServerEvent) => void): () => void;
  onStatus(listener: (status: ConnectionStatus, info: ConnectionInfo) => void): () => void;
  stats(): SocketStats;
}

export interface WebSocketServiceOptions {
  url: string;
  createSocket?: (url: string) => WebSocketLike;
  reconnect?: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxBufferedBytes?: number;
  now?: () => number;
  random?: () => number;
}

const OPEN = 1;

/**
 * Typed WebSocket client: schema-validated events, heartbeat with RTT/clock-offset
 * estimation, exponential-backoff reconnects, and audio backpressure (frames are
 * dropped instead of letting latency build up in the socket buffer).
 */
export class WebSocketService implements RealtimeSocket {
  private socket: WebSocketLike | null = null;
  private _status: ConnectionStatus = 'idle';
  private _clockOffsetMs = 0;
  private rttMs: number | null = null;
  private attempt = 0;
  private intentionalClose = false;
  private hasConnectedBefore = false;
  private lastMessageAt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private framesSent = 0;
  private framesDropped = 0;
  private readonly eventListeners = new Set<(event: ServerEvent) => void>();
  private readonly statusListeners = new Set<
    (status: ConnectionStatus, info: ConnectionInfo) => void
  >();
  private readonly options: Required<WebSocketServiceOptions>;

  constructor(options: WebSocketServiceOptions) {
    this.options = {
      createSocket: (url) => new WebSocket(url),
      reconnect: RECONNECT_POLICY,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      maxBufferedBytes: MAX_SOCKET_BUFFERED_BYTES,
      now: () => Date.now(),
      random: Math.random,
      ...options,
    };
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get clockOffsetMs(): number {
    return this._clockOffsetMs;
  }

  connect(): Promise<void> {
    if (this._status === 'open') return Promise.resolve();
    this.intentionalClose = false;
    this.attempt = 0;
    this.clearReconnect();
    return new Promise((resolve, reject) => this.open(resolve, reject));
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnect();
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close(1000, 'client closed');
    }
    this.hasConnectedBefore = false;
    this.setStatus('closed');
  }

  send(event: ClientJsonEvent): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(event));
    return true;
  }

  sendAudio(frame: ArrayBuffer): boolean {
    const socket = this.socket;
    if (
      !socket ||
      socket.readyState !== OPEN ||
      socket.bufferedAmount > this.options.maxBufferedBytes
    ) {
      this.framesDropped += 1;
      return false;
    }
    socket.send(frame);
    this.framesSent += 1;
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
    return { framesSent: this.framesSent, framesDropped: this.framesDropped, rttMs: this.rttMs };
  }

  private open(resolve?: () => void, reject?: (error: Error) => void): void {
    this.setStatus(this.hasConnectedBefore ? 'reconnecting' : 'connecting');
    let socket: WebSocketLike;
    try {
      socket = this.options.createSocket(this.options.url);
    } catch (error) {
      reject?.(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      const reconnected = this.hasConnectedBefore;
      this.hasConnectedBefore = true;
      this.attempt = 0;
      this.lastMessageAt = this.options.now();
      this.startHeartbeat();
      this.setStatus('open', reconnected);
      resolve?.();
    };
    socket.onmessage = (message) => this.handleMessage(message);
    socket.onerror = () => undefined; // `onclose` always follows and carries the decision.
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopHeartbeat();
      if (!this.hasConnectedBefore) {
        this.setStatus('closed');
        reject?.(new Error('Could not connect to the realtime server'));
        return;
      }
      if (!this.intentionalClose) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const { maxAttempts, baseDelayMs, maxDelayMs } = this.options.reconnect;
    if (this.attempt >= maxAttempts) {
      this.hasConnectedBefore = false;
      this.setStatus('closed');
      return;
    }
    this.attempt += 1;
    this.setStatus('reconnecting');
    const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (this.attempt - 1));
    const delay = exponential * (0.8 + this.options.random() * 0.4);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private handleMessage(message: MessageEvent): void {
    this.lastMessageAt = this.options.now();
    if (typeof message.data !== 'string') return;
    let json: unknown;
    try {
      json = JSON.parse(message.data);
    } catch {
      return;
    }
    const parsed = ServerEventSchema.safeParse(json);
    if (!parsed.success) {
      console.warn('Ignoring invalid server event', parsed.error.issues[0]);
      return;
    }
    const event = parsed.data;
    if (event.type === 'session.status' && event.payload.pong) this.updateClock(event.payload.pong);
    this.eventListeners.forEach((listener) => listener(event));
  }

  private updateClock(pong: { clientSentAt: number; serverReceivedAt: number }): void {
    const now = this.options.now();
    const rtt = Math.max(0, now - pong.clientSentAt);
    const offset = pong.serverReceivedAt - (pong.clientSentAt + rtt / 2);
    const firstSample = this.rttMs === null;
    this.rttMs = firstSample ? rtt : Math.round(this.rttMs! * 0.7 + rtt * 0.3);
    // Exponentially smoothed so one slow round-trip does not skew audio timestamps.
    this._clockOffsetMs = firstSample ? offset : this._clockOffsetMs * 0.8 + offset * 0.2;
    this.emitStatus();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const ping = () =>
      this.send({ type: 'session.ping', payload: { clientSentAt: this.options.now() } });
    ping();
    this.heartbeatTimer = setInterval(() => {
      if (this.options.now() - this.lastMessageAt > this.options.heartbeatTimeoutMs) {
        // Half-open connection: force a close so the reconnect logic takes over.
        this.socket?.close(4001, 'heartbeat timeout');
        return;
      }
      ping();
    }, this.options.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setStatus(status: ConnectionStatus, reconnected = false): void {
    this._status = status;
    this.emitStatus(reconnected);
  }

  private emitStatus(reconnected = false): void {
    const info: ConnectionInfo = { attempt: this.attempt, reconnected, rttMs: this.rttMs };
    this.statusListeners.forEach((listener) => listener(this._status, info));
  }
}
