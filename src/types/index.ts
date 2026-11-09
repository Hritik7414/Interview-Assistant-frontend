import type { ErrorCode } from '@shared';

/** Where audio comes from. `simulated` streams silence (Demo Mode without a microphone). */
export type AudioSourceKind = 'microphone' | 'microphone+tab' | 'tab' | 'simulated';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Client-side session lifecycle (superset of the server's SessionState). */
export type ClientSessionStatus =
  | 'idle'
  | 'preparing'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'answering'
  | 'reconnecting'
  | 'stopping'
  | 'stopped'
  | 'error';

export type MicPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export type UiErrorCode =
  | ErrorCode
  | 'NETWORK_ERROR'
  | 'AUDIO_PERMISSION_DENIED'
  | 'AUDIO_DEVICE_NOT_FOUND'
  | 'AUDIO_DEVICE_BUSY'
  | 'AUDIO_UNSUPPORTED'
  | 'AUDIO_ENDED'
  | 'NO_TAB_AUDIO'
  | 'START_TIMEOUT'
  | 'DISCONNECTED';

export interface UiError {
  code: UiErrorCode;
  message: string;
  recoverable: boolean;
  at: number;
}
