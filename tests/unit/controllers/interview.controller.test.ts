import { decodeAudioFrame } from '@shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/interview-api.service';
import { createTestApp, events, flush, INTERVIEW_ID, SESSION_ID } from '../../helpers/fakes';

async function startedApp() {
  const ctx = createTestApp();
  await ctx.app.init();
  ctx.controller.updateContext('resume', 'Senior engineer');
  await ctx.controller.start();
  return ctx;
}

describe('InterviewController', () => {
  afterEach(() => vi.useRealTimers());

  it('loads capabilities, permission and devices on init', async () => {
    const { app, store } = createTestApp();
    await app.init();
    const state = store.getState();
    expect(state.capabilities?.modes.demo.available).toBe(true);
    expect(state.audio).toMatchObject({
      permission: 'granted',
      deviceId: 'mic-1',
      tabAudioSupported: true,
    });
  });

  it('starts a session: interview → socket → session.start → ready → audio', async () => {
    const { api, socket, audio, store } = await startedApp();
    expect(api.createInterview).toHaveBeenCalledWith({
      mode: 'demo',
      context: { resume: 'Senior engineer', jobDescription: '', instructions: '' },
    });
    expect(socket.connect).toHaveBeenCalled();
    expect(socket.sentOfType('session.start')[0]!.payload).toEqual({
      interviewId: INTERVIEW_ID,
      audio: { encoding: 'linear16', sampleRate: 16_000, channels: 1 },
    });
    expect(store.getState().session).toMatchObject({
      status: 'listening',
      sessionId: SESSION_ID,
      interviewId: INTERVIEW_ID,
    });
    expect(audio.start).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'microphone', deviceId: 'mic-1' }),
    );
    expect(store.getState().audio.capturing).toBe(true);
  });

  it('encodes captured audio frames with sequence numbers and server-clock timestamps', async () => {
    const { socket, audio } = await startedApp();
    socket.clockOffsetMs = 250;
    audio.emitFrame(1_000);
    audio.emitFrame(1_050);
    const frames = socket.audioFrames.map((frame) => decodeAudioFrame(frame));
    expect(frames.map((f) => f.ok && [f.frame.seq, f.frame.capturedAt])).toEqual([
      [0, 1_250],
      [1, 1_300],
    ]);
  });

  it('routes realtime events for the current session into the store', async () => {
    const { socket, store } = await startedApp();
    socket.emit(events.segment('transcript.final', 'Tell me about yourself.', 's1'));
    socket.emit(
      events.segment('transcript.final', 'From another session', 's2', 0, 'other-session'),
    );
    socket.emit(events.question('Tell me about yourself.'));
    socket.emit(events.status('thinking'));
    socket.emit(events.answerStarted());
    socket.emit(events.delta('- I lead teams.', 0));
    const state = store.getState();
    expect(state.transcript.lines.map((l) => l.text)).toEqual(['Tell me about yourself.']);
    expect(state.questions.items[0]?.status).toBe('answering');
    expect(state.session.status).toBe('thinking');
    expect(Object.values(state.answers.byId)[0]?.text).toBe('- I lead teams.');
  });

  it('stops: audio off, session.stop, wait for stopped, disconnect', async () => {
    const { controller, socket, audio, store } = await startedApp();
    await controller.stop();
    expect(audio.stop).toHaveBeenCalled();
    expect(socket.sentOfType('session.stop')[0]!.payload).toEqual({ sessionId: SESSION_ID });
    expect(socket.disconnect).toHaveBeenCalled();
    expect(store.getState().session).toMatchObject({ status: 'stopped', sessionId: null });
  });

  it('surfaces REST failures and leaves the session in an error state', async () => {
    const { app, api, controller, store, audio } = createTestApp();
    await app.init();
    api.createInterview.mockRejectedValueOnce(
      new ApiError('NETWORK_ERROR', 'Cannot reach the server', 0),
    );
    await controller.start();
    expect(store.getState().session.status).toBe('error');
    expect(store.getState().error).toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the server',
    });
    expect(audio.start).not.toHaveBeenCalled();
  });

  it('fails the start when the server rejects session.start', async () => {
    const { app, socket, controller, store, audio } = createTestApp();
    await app.init();
    socket.autoReady = false;
    const starting = controller.start();
    await flush(10);
    socket.emit(events.error('TRANSCRIPTION_PROVIDER_ERROR', 'Deepgram rejected the API key'));
    await starting;
    expect(store.getState().error).toMatchObject({ code: 'TRANSCRIPTION_PROVIDER_ERROR' });
    expect(audio.start).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('times out when the server never answers session.start', async () => {
    vi.useFakeTimers();
    const { app, socket, controller, store } = createTestApp();
    await app.init();
    socket.autoReady = false;
    const starting = controller.start();
    await vi.advanceTimersByTimeAsync(10_001);
    await starting;
    expect(store.getState().error?.code).toBe('START_TIMEOUT');
  });

  it('refuses to start with invalid context', async () => {
    const { app, controller, api, store } = createTestApp();
    await app.init();
    controller.updateContext('instructions', 'x'.repeat(2_001));
    await controller.start();
    expect(api.createInterview).not.toHaveBeenCalled();
    expect(store.getState().error?.code).toBe('VALIDATION_ERROR');
  });

  it('resumes the same session after the connection recovers', async () => {
    const { socket, store } = await startedApp();
    socket.setStatus('reconnecting', { attempt: 1 });
    expect(store.getState().session.status).toBe('reconnecting');
    socket.setStatus('open', { reconnected: true });
    await flush(10);
    const resume = socket.sentOfType('session.start').at(-1)!;
    expect(resume.payload.resumeSessionId).toBe(SESSION_ID);
    expect(store.getState().session.status).toBe('listening');
  });

  it('ends the session when the connection is lost for good', async () => {
    const { socket, store, audio } = await startedApp();
    socket.setStatus('closed');
    await flush(10);
    expect(store.getState().session.status).toBe('error');
    expect(store.getState().error?.code).toBe('DISCONNECTED');
    expect(audio.stop).toHaveBeenCalled();
  });

  it('handles a server-initiated stop with an explanation', async () => {
    const { socket, store } = await startedApp();
    socket.emit(events.status('stopped', 'transcription_failed'));
    await flush(10);
    expect(store.getState().session.status).toBe('stopped');
    expect(store.getState().error?.message).toMatch(/Transcription stopped unexpectedly/);
  });

  it('debounces context updates during a live session', async () => {
    vi.useFakeTimers();
    const { app, api, controller, store } = createTestApp();
    await app.init();
    await controller.start();
    await vi.advanceTimersByTimeAsync(0);
    controller.updateContext('jobDescription', 'Plat');
    controller.updateContext('jobDescription', 'Platform engineer');
    expect(store.getState().contextSync).toBe('saving');
    await vi.advanceTimersByTimeAsync(800);
    expect(api.updateContext).toHaveBeenCalledOnce();
    expect(api.updateContext).toHaveBeenCalledWith(INTERVIEW_ID, {
      jobDescription: 'Platform engineer',
    });
    expect(store.getState().contextSync).toBe('saved');
  });

  it('cancels the active answer through the socket', async () => {
    const { controller, socket } = await startedApp();
    socket.emit(events.question('Why us?'));
    socket.emit(events.answerStarted());
    expect(controller.cancelAnswer()).toBe(true);
    expect(socket.sentOfType('answer.cancel')[0]!.payload).toMatchObject({ sessionId: SESSION_ID });
  });

  it('stops the session when every audio source ends', async () => {
    const { audio, store } = await startedApp();
    audio.options?.onEnded({ reason: 'Tab audio sharing stopped', fatal: true });
    await flush(20);
    expect(store.getState().session.status).toBe('stopped');
    expect(store.getState().error?.code).toBe('AUDIO_ENDED');
  });

  it('locks mode and source while a session is running', async () => {
    const { controller, store } = await startedApp();
    controller.setAudioSource('tab');
    controller.setMode('live');
    expect(store.getState().audio.source).toBe('microphone');
    expect(store.getState().mode).toBe('demo');
  });
});
