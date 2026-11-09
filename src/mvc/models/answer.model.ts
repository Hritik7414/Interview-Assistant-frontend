import type {
  AnswerDTO,
  AnswerStatus,
  FinishReason,
  ProviderDescriptor,
  ServerEventPayload,
} from '@shared';
import { UI_LIMITS } from '@/lib/constants';

export interface AnswerItem {
  id: string;
  questionId: string;
  text: string;
  status: AnswerStatus;
  finishReason: FinishReason | null;
  provider: ProviderDescriptor;
  startedAt: number;
  firstTokenAt: number | null;
  completedAt: number | null;
  /** Highest delta index applied; guards against duplicates and reordering. */
  lastIndex: number;
  errorMessage: string | null;
  latency: { firstTokenMs: number | null; totalMs: number | null };
}

export interface AnswerState {
  byId: Record<string, AnswerItem>;
  order: string[];
  activeId: string | null;
}

export const initialAnswerState: AnswerState = { byId: {}, order: [], activeId: null };

export function startAnswer(
  state: AnswerState,
  payload: ServerEventPayload<'answer.started'>,
  maxAnswers: number = UI_LIMITS.maxAnswers,
): AnswerState {
  if (state.byId[payload.answerId]) return state;
  const item: AnswerItem = {
    id: payload.answerId,
    questionId: payload.questionId,
    text: '',
    status: 'pending',
    finishReason: null,
    provider: payload.provider,
    startedAt: payload.startedAt,
    firstTokenAt: null,
    completedAt: null,
    lastIndex: -1,
    errorMessage: null,
    latency: { firstTokenMs: null, totalMs: null },
  };
  const order = [...state.order, item.id];
  const evicted = order.length > maxAnswers ? order.splice(0, order.length - maxAnswers) : [];
  const byId = { ...state.byId, [item.id]: item };
  evicted.forEach((id) => delete byId[id]);
  return { byId, order, activeId: item.id };
}

/** Applies a streamed delta. Duplicate/stale indexes and deltas after completion are ignored. */
export function applyDelta(
  state: AnswerState,
  payload: ServerEventPayload<'answer.delta'>,
  receivedAt: number,
): AnswerState {
  const item = state.byId[payload.answerId];
  if (!item || payload.index <= item.lastIndex || isTerminal(item.status)) return state;
  return {
    ...state,
    byId: {
      ...state.byId,
      [item.id]: {
        ...item,
        text: item.text + payload.delta,
        status: 'streaming',
        lastIndex: payload.index,
        firstTokenAt: item.firstTokenAt ?? receivedAt,
      },
    },
  };
}

/** The completed answer from the server is authoritative (full text, final status). */
export function completeAnswer(
  state: AnswerState,
  payload: ServerEventPayload<'answer.completed'>,
): AnswerState {
  const answer: AnswerDTO = payload.answer;
  const existing = state.byId[answer.id];
  const item: AnswerItem = {
    id: answer.id,
    questionId: answer.questionId,
    text: answer.text,
    status: answer.status,
    finishReason: answer.finishReason,
    provider: answer.provider,
    startedAt: answer.startedAt,
    firstTokenAt: answer.firstTokenAt,
    completedAt: answer.completedAt,
    lastIndex: existing?.lastIndex ?? -1,
    errorMessage: answer.errorMessage,
    latency: { firstTokenMs: payload.latency.firstTokenMs, totalMs: payload.latency.totalMs },
  };
  return {
    byId: { ...state.byId, [item.id]: item },
    order: existing ? state.order : [...state.order, item.id],
    activeId: state.activeId ?? item.id,
  };
}

export function isTerminal(status: AnswerStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed';
}

export function activeAnswer(state: AnswerState): AnswerItem | null {
  return state.activeId ? (state.byId[state.activeId] ?? null) : null;
}

export function answerForQuestion(state: AnswerState, questionId: string): AnswerItem | null {
  for (let i = state.order.length - 1; i >= 0; i -= 1) {
    const item = state.byId[state.order[i]!];
    if (item?.questionId === questionId) return item;
  }
  return null;
}

export type AnswerBlock = { kind: 'bullet' | 'paragraph'; text: string };

/** Splits answer text into bullet / paragraph blocks for rendering. */
export function parseAnswerBlocks(text: string): AnswerBlock[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // A bare marker ("-") is a bullet whose text has not streamed in yet.
      const bullet = line.match(/^(?:[-•*]|\d+[.)])(?:\s+(.*))?$/);
      return bullet
        ? { kind: 'bullet' as const, text: bullet[1] ?? '' }
        : { kind: 'paragraph' as const, text: line };
    });
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}
