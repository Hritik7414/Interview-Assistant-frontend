import {
  InterviewContextSchema,
  type CapabilitiesDTO,
  type InterviewContextDTO,
  type InterviewMode,
  type SessionState,
} from '@shared';
import type { ClientSessionStatus, ConnectionStatus } from '@/types';

export type ContextField = keyof InterviewContextDTO;

export const emptyContext: InterviewContextDTO = {
  resume: '',
  jobDescription: '',
  instructions: '',
};

const STARTABLE: ReadonlySet<ClientSessionStatus> = new Set(['idle', 'stopped', 'error']);
const STOPPABLE: ReadonlySet<ClientSessionStatus> = new Set([
  'preparing',
  'connecting',
  'listening',
  'thinking',
  'answering',
  'reconnecting',
]);
const LIVE: ReadonlySet<ClientSessionStatus> = new Set([
  'listening',
  'thinking',
  'answering',
  'reconnecting',
]);

export function canStart(status: ClientSessionStatus): boolean {
  return STARTABLE.has(status);
}

export function canStop(status: ClientSessionStatus): boolean {
  return STOPPABLE.has(status);
}

/** A session exists on the server and is (or is trying to be) streaming. */
export function isSessionLive(status: ClientSessionStatus): boolean {
  return LIVE.has(status);
}

/** Mode and audio configuration are locked while a session runs. */
export function isConfigurationLocked(status: ClientSessionStatus): boolean {
  return !canStart(status);
}

/** Maps the server's lifecycle onto the client lifecycle. */
export function mapServerState(state: SessionState): ClientSessionStatus {
  switch (state) {
    case 'listening':
    case 'thinking':
    case 'answering':
      return state;
    case 'starting':
      return 'connecting';
    case 'suspended':
      return 'reconnecting';
    case 'stopped':
      return 'stopped';
    case 'idle':
      return 'idle';
  }
}

export type DisplayStatus =
  | 'ready'
  | 'starting'
  | 'listening'
  | 'thinking'
  | 'answering'
  | 'reconnecting'
  | 'stopping'
  | 'disconnected'
  | 'error';

/** Single user-facing status combining session lifecycle and connection health. */
export function deriveDisplayStatus(
  session: ClientSessionStatus,
  connection: ConnectionStatus,
): DisplayStatus {
  if (session === 'error') return 'error';
  if (session === 'reconnecting' || (isSessionLive(session) && connection === 'reconnecting'))
    return 'reconnecting';
  if (isSessionLive(session) && connection === 'closed') return 'disconnected';
  switch (session) {
    case 'preparing':
    case 'connecting':
      return 'starting';
    case 'listening':
    case 'thinking':
    case 'answering':
    case 'stopping':
      return session;
    default:
      return 'ready';
  }
}

export interface ContextValidation {
  valid: boolean;
  errors: Partial<Record<ContextField, string>>;
}

export function validateContext(context: InterviewContextDTO): ContextValidation {
  const result = InterviewContextSchema.safeParse(context);
  if (result.success) return { valid: true, errors: {} };
  const errors: Partial<Record<ContextField, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && field in emptyContext && !errors[field as ContextField]) {
      errors[field as ContextField] = issue.message;
    }
  }
  return { valid: false, errors };
}

export function isModeAvailable(
  capabilities: CapabilitiesDTO | null,
  mode: InterviewMode,
): boolean {
  if (mode === 'demo') return true;
  return capabilities?.modes.live.available ?? false;
}
