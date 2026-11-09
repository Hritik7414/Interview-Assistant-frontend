/** Frontend tuning constants (protocol constants live in src/shared). */
export const UI_LIMITS = {
  maxTranscriptLines: 400,
  maxQuestions: 50,
  maxAnswers: 50,
} as const;

export const SESSION_TIMEOUTS = {
  startMs: 10_000,
  stopMs: 3_000,
} as const;

export const CONTEXT_SAVE_DEBOUNCE_MS = 800;
export const AUDIO_LEVEL_UPDATE_MS = 80;
export const AUDIO_STATS_UPDATE_MS = 500;

export const RECONNECT_POLICY = {
  maxAttempts: 6,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
} as const;

/** Drop audio rather than queue more than ~8 s of it in the socket buffer. */
export const MAX_SOCKET_BUFFERED_BYTES = 256 * 1024;

export const AUDIO_WORKLET_URL = '/worklets/pcm-capture.worklet.js';
export const AUDIO_WORKLET_NAME = 'pcm-capture';
