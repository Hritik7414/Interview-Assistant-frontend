import { createServerEvent } from '@shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketService, type WebSocketLike } from '@/services/websocket.service';
import type { ConnectionStatus } from '@/types';

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  binaryType: BinaryType = 'blob';
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly sent: unknown[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  receive(data: unknown): void {
    this.onmessage?.({
      data: typeof data === 'string' ? data : JSON.stringify(data),
    } as MessageEvent);
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006 } as CloseEvent);
  }
}

const latest = () => FakeWebSocket.instances.at(-1)!;

function createService(overrides: Partial<ConstructorParameters<typeof WebSocketService>[0]> = {}) {
  let now = 1_000;
  const statuses: Array<{ status: ConnectionStatus; reconnected: boolean }> = [];
  const service = new WebSocketService({
    url: 'ws://test/ws',
    createSocket: (url) => new FakeWebSocket(url),
    reconnect: { maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 1_000 },
    heartbeatIntervalMs: 1_000,
    heartbeatTimeoutMs: 3_000,
    maxBufferedBytes: 100,
    now: () => now,
    random: () => 0.5,
    ...overrides,
  });
  service.onStatus((status, info) => statuses.push({ status, reconnected: info.reconnected }));
  return { service, statuses, advance: (ms: number) => (now += ms) };
}

describe('WebSocketService', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('connects, uses binary array buffers and starts the heartbeat', async () => {
    const { service, statuses } = createService();
    const connecting = service.connect();
    latest().open();
    await connecting;
    expect(service.status).toBe('open');
    expect(latest().binaryType).toBe('arraybuffer');
    expect(JSON.parse(latest().sent[0] as string)).toMatchObject({ type: 'session.ping' });
    expect(statuses.map((s) => s.status)).toEqual(['connecting', 'open']);
  });

  it('rejects when the first connection fails', async () => {
    const { service } = createService();
    const connecting = service.connect();
    latest().drop();
    await expect(connecting).rejects.toThrow(/Could not connect/);
    expect(service.status).toBe('closed');
  });

  it('delivers schema-valid events and ignores invalid ones', async () => {
    const { service } = createService();
    const received: string[] = [];
    service.onEvent((event) => received.push(event.type));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const connecting = service.connect();
    latest().open();
    await connecting;

    latest().receive(createServerEvent('session.status', null, { state: 'idle' }));
    latest().receive('not json');
    latest().receive({
      type: 'session.status',
      sessionId: null,
      ts: 1,
      payload: { state: 'flying' },
    });
    expect(received).toEqual(['session.status']);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('estimates RTT and clock offset from pongs', async () => {
    const { service, advance } = createService();
    const connecting = service.connect();
    latest().open();
    await connecting;
    advance(40); // client time 1040; ping was sent at 1000
    latest().receive(
      createServerEvent('session.status', null, {
        state: 'idle',
        pong: { clientSentAt: 1_000, serverReceivedAt: 6_020 },
      }),
    );
    expect(service.stats().rttMs).toBe(40);
    expect(service.clockOffsetMs).toBe(5_000); // 6020 − (1000 + 40/2)
  });

  it('reconnects with exponential backoff and reports the reconnect', async () => {
    const { service, statuses } = createService();
    const connecting = service.connect();
    latest().open();
    await connecting;

    latest().drop();
    expect(service.status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeWebSocket.instances).toHaveLength(2);
    latest().open();
    expect(statuses.at(-1)).toEqual({ status: 'open', reconnected: true });
  });

  it('gives up after the maximum number of attempts', async () => {
    const { service } = createService();
    const connecting = service.connect();
    latest().open();
    await connecting;
    latest().drop();
    await vi.advanceTimersByTimeAsync(100);
    latest().drop();
    await vi.advanceTimersByTimeAsync(200);
    latest().drop();
    expect(service.status).toBe('closed');
  });

  it('never reconnects after an intentional disconnect', async () => {
    const { service } = createService();
    const connecting = service.connect();
    latest().open();
    await connecting;
    service.disconnect();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(service.status).toBe('closed');
  });

  it('drops audio instead of queueing when the socket is congested or closed', async () => {
    const { service } = createService();
    expect(service.sendAudio(new ArrayBuffer(10))).toBe(false);
    const connecting = service.connect();
    latest().open();
    await connecting;
    expect(service.sendAudio(new ArrayBuffer(10))).toBe(true);
    latest().bufferedAmount = 500;
    expect(service.sendAudio(new ArrayBuffer(10))).toBe(false);
    expect(service.stats()).toMatchObject({ framesSent: 1, framesDropped: 2 });
  });

  it('treats a silent connection as dead and reconnects', async () => {
    const { service, advance } = createService();
    const connecting = service.connect();
    latest().open();
    await connecting;
    advance(4_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(service.status).toBe('reconnecting');
  });
});
