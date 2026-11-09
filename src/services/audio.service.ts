import { AUDIO_FRAME_DURATION_MS, AUDIO_SAMPLE_RATE, AUDIO_SAMPLES_PER_FRAME } from '@shared';
import { AUDIO_WORKLET_NAME, AUDIO_WORKLET_URL } from '@/lib/constants';
import type { AudioDevice, AudioSourceKind, MicPermission, UiErrorCode } from '@/types';

export interface AudioCaptureOptions {
  source: AudioSourceKind;
  deviceId: string | null;
  /** 16 kHz mono PCM16 frame and its capture time (epoch ms, client clock). */
  onFrame(pcm: Int16Array, capturedAt: number): void;
  /** RMS level in [0, 1] per frame. */
  onLevel(level: number): void;
  /** A source stopped producing audio (device unplugged, tab sharing ended). */
  onEnded(info: { reason: string; fatal: boolean }): void;
}

/** Browser audio capture used by the controllers (fakeable in tests). */
export interface AudioCapture {
  readonly active: boolean;
  isSupported(): boolean;
  isTabAudioSupported(): boolean;
  queryPermission(): Promise<MicPermission>;
  requestPermission(): Promise<MicPermission>;
  listInputDevices(): Promise<AudioDevice[]>;
  onDevicesChanged(listener: () => void): () => void;
  start(options: AudioCaptureOptions): Promise<void>;
  stop(): Promise<void>;
}

export class AudioCaptureError extends Error {
  constructor(
    readonly code: UiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AudioCaptureError';
  }
}

/** Maps getUserMedia / getDisplayMedia failures to actionable messages. */
export function toAudioCaptureError(
  error: unknown,
  source: 'microphone' | 'tab',
): AudioCaptureError {
  if (error instanceof AudioCaptureError) return error;
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new AudioCaptureError(
        'AUDIO_PERMISSION_DENIED',
        source === 'tab'
          ? 'Screen sharing was cancelled or blocked. Choose a tab and allow audio sharing.'
          : 'Microphone access was denied. Allow it in your browser’s site settings and try again.',
      );
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new AudioCaptureError(
        'AUDIO_DEVICE_NOT_FOUND',
        'The selected microphone is not available.',
      );
    case 'NotReadableError':
    case 'AbortError':
      return new AudioCaptureError(
        'AUDIO_DEVICE_BUSY',
        'The microphone is in use by another application.',
      );
    default:
      return new AudioCaptureError(
        'AUDIO_UNSUPPORTED',
        `Could not start audio capture${error instanceof Error ? `: ${error.message}` : ''}`,
      );
  }
}

type SourceKind = 'microphone' | 'tab';

interface ActiveCapture {
  context: AudioContext | null;
  node: AudioWorkletNode | null;
  streams: Array<{ stream: MediaStream; kind: SourceKind }>;
  timer: ReturnType<typeof setInterval> | null;
  liveTracks: Set<MediaStreamTrack>;
}

/**
 * Captures microphone and/or tab audio with the Web Audio API. Sources are mixed,
 * down-mixed to mono and resampled to 16 kHz PCM16 inside an AudioWorklet
 * (off the main thread), then delivered as fixed 50 ms frames.
 */
export class BrowserAudioService implements AudioCapture {
  private capture: ActiveCapture | null = null;

  get active(): boolean {
    return this.capture !== null;
  }

  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioWorkletNode !== 'undefined'
    );
  }

  isTabAudioSupported(): boolean {
    return (
      typeof window !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
    );
  }

  async queryPermission(): Promise<MicPermission> {
    if (!this.isSupported()) return 'unsupported';
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return status.state === 'granted'
        ? 'granted'
        : status.state === 'denied'
          ? 'denied'
          : 'prompt';
    } catch {
      return 'unknown'; // Permissions API not available for microphone in this browser.
    }
  }

  async requestPermission(): Promise<MicPermission> {
    if (!this.isSupported()) return 'unsupported';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return 'granted';
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'prompt';
    }
  }

  async listInputDevices(): Promise<AudioDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'audioinput' && device.deviceId !== '')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      }));
  }

  onDevicesChanged(listener: () => void): () => void {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return () => undefined;
    mediaDevices.addEventListener('devicechange', listener);
    return () => mediaDevices.removeEventListener('devicechange', listener);
  }

  async start(options: AudioCaptureOptions): Promise<void> {
    await this.stop();
    if (options.source === 'simulated') {
      this.startSimulated(options);
      return;
    }
    if (!this.isSupported()) {
      throw new AudioCaptureError(
        'AUDIO_UNSUPPORTED',
        'This browser does not support realtime audio capture.',
      );
    }

    const capture: ActiveCapture = {
      context: null,
      node: null,
      streams: [],
      timer: null,
      liveTracks: new Set(),
    };
    this.capture = capture;
    try {
      if (options.source === 'microphone' || options.source === 'microphone+tab') {
        capture.streams.push({
          stream: await this.openMicrophone(options.deviceId),
          kind: 'microphone',
        });
      }
      if (options.source === 'tab' || options.source === 'microphone+tab') {
        capture.streams.push({ stream: await this.openTabAudio(), kind: 'tab' });
      }
      await this.startGraph(capture, options);
    } catch (error) {
      await this.stop();
      throw error instanceof AudioCaptureError ? error : toAudioCaptureError(error, 'microphone');
    }
  }

  async stop(): Promise<void> {
    const capture = this.capture;
    this.capture = null;
    if (!capture) return;
    if (capture.timer) clearInterval(capture.timer);
    if (capture.node) {
      capture.node.port.onmessage = null;
      capture.node.disconnect();
    }
    capture.streams.forEach(({ stream }) => stream.getTracks().forEach((track) => track.stop()));
    if (capture.context && capture.context.state !== 'closed')
      await capture.context.close().catch(() => undefined);
  }

  private async openMicrophone(deviceId: string | null): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      throw toAudioCaptureError(error, 'microphone');
    }
  }

  private async openTabAudio(): Promise<MediaStream> {
    if (!this.isTabAudioSupported()) {
      throw new AudioCaptureError(
        'AUDIO_UNSUPPORTED',
        'Tab audio capture is not supported in this browser.',
      );
    }
    let stream: MediaStream;
    try {
      // Chrome requires a video track; `systemAudio`/`preferCurrentTab` are Chromium hints.
      const constraints: DisplayMediaStreamOptions & Record<string, unknown> = {
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: 'include',
        preferCurrentTab: false,
      };
      stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (error) {
      throw toAudioCaptureError(error, 'tab');
    }
    stream.getVideoTracks().forEach((track) => track.stop());
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new AudioCaptureError(
        'NO_TAB_AUDIO',
        'No audio was shared. Pick a browser tab and turn on “Share tab audio”.',
      );
    }
    return new MediaStream(stream.getAudioTracks());
  }

  private async startGraph(capture: ActiveCapture, options: AudioCaptureOptions): Promise<void> {
    const context = new AudioContext({ latencyHint: 'interactive' });
    capture.context = context;
    await context.audioWorklet.addModule(AUDIO_WORKLET_URL);
    const node = new AudioWorkletNode(context, AUDIO_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: {
        targetSampleRate: AUDIO_SAMPLE_RATE,
        frameSamples: AUDIO_SAMPLES_PER_FRAME,
      },
    });
    capture.node = node;

    for (const { stream, kind } of capture.streams) {
      context.createMediaStreamSource(stream).connect(node); // multiple sources are summed (mixed)
      for (const track of stream.getAudioTracks()) {
        capture.liveTracks.add(track);
        track.addEventListener('ended', () => this.handleTrackEnded(capture, track, kind, options));
      }
    }
    // A muted sink keeps the graph pulled without playing captured audio back.
    const sink = context.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(context.destination);

    node.port.onmessage = (
      message: MessageEvent<{ type: string; pcm: ArrayBuffer; rms: number }>,
    ) => {
      if (message.data.type !== 'frame') return;
      options.onFrame(new Int16Array(message.data.pcm), Date.now());
      options.onLevel(Math.min(1, message.data.rms * 4));
    };
    await context.resume();
  }

  private handleTrackEnded(
    capture: ActiveCapture,
    track: MediaStreamTrack,
    kind: SourceKind,
    options: AudioCaptureOptions,
  ): void {
    if (this.capture !== capture) return;
    capture.liveTracks.delete(track);
    const reason = kind === 'tab' ? 'Tab audio sharing stopped' : 'The microphone was disconnected';
    options.onEnded({ reason, fatal: capture.liveTracks.size === 0 });
  }

  /** Demo Mode without a microphone: streams silent frames through the same pipeline. */
  private startSimulated(options: AudioCaptureOptions): void {
    const capture: ActiveCapture = {
      context: null,
      node: null,
      streams: [],
      timer: null,
      liveTracks: new Set(),
    };
    capture.timer = setInterval(() => {
      options.onFrame(new Int16Array(AUDIO_SAMPLES_PER_FRAME), Date.now());
      options.onLevel(0);
    }, AUDIO_FRAME_DURATION_MS);
    this.capture = capture;
  }
}
