import type { QuestionDTO, QuestionStatus } from '@shared';
import { UI_LIMITS } from '@/lib/constants';

export interface QuestionState {
  /** Chronological order (oldest first). */
  items: QuestionDTO[];
  activeId: string | null;
}

export const initialQuestionState: QuestionState = { items: [], activeId: null };

export function addQuestion(
  state: QuestionState,
  question: QuestionDTO,
  maxItems: number = UI_LIMITS.maxQuestions,
): QuestionState {
  if (state.items.some((item) => item.id === question.id)) return state;
  return { items: [...state.items, question].slice(-maxItems), activeId: question.id };
}

export function updateQuestionStatus(
  state: QuestionState,
  questionId: string,
  status: QuestionStatus,
): QuestionState {
  if (!state.items.some((item) => item.id === questionId)) return state;
  return {
    ...state,
    items: state.items.map((item) => (item.id === questionId ? { ...item, status } : item)),
  };
}

export function activeQuestion(state: QuestionState): QuestionDTO | null {
  return state.items.find((item) => item.id === state.activeId) ?? null;
}

/** Earlier questions, newest first, excluding the active one. */
export function previousQuestions(state: QuestionState): QuestionDTO[] {
  return state.items.filter((item) => item.id !== state.activeId).reverse();
}
