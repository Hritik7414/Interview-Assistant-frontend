import type { QuestionStatus, ServerEventOf } from '@shared';
import {
  activeAnswer,
  applyDelta,
  completeAnswer,
  initialAnswerState,
  isTerminal,
  startAnswer,
} from '@/mvc/models/answer.model';
import { updateQuestionStatus } from '@/mvc/models/question.model';
import type { RealtimeSocket } from '@/services/websocket.service';
import type { InterviewStore } from '@/store/interview.store';

const QUESTION_STATUS_BY_ANSWER: Record<string, QuestionStatus> = {
  completed: 'answered',
  cancelled: 'cancelled',
  failed: 'failed',
};

/** Streams answer events into the store and lets the user cancel the active answer. */
export class AnswerController {
  private readonly now: () => number;

  constructor(
    private readonly deps: {
      store: InterviewStore;
      socket: Pick<RealtimeSocket, 'send'>;
      now?: () => number;
    },
  ) {
    this.now = deps.now ?? (() => Date.now());
  }

  handleStarted(event: ServerEventOf<'answer.started'>): void {
    this.deps.store.setState((state) => ({
      answers: startAnswer(state.answers, event.payload),
      questions: updateQuestionStatus(state.questions, event.payload.questionId, 'answering'),
    }));
  }

  handleDelta(event: ServerEventOf<'answer.delta'>): void {
    this.deps.store.setState((state) => ({
      answers: applyDelta(state.answers, event.payload, this.now()),
    }));
  }

  handleCompleted(event: ServerEventOf<'answer.completed'>): void {
    const { answer } = event.payload;
    this.deps.store.setState((state) => ({
      answers: completeAnswer(state.answers, event.payload),
      questions: updateQuestionStatus(
        state.questions,
        answer.questionId,
        QUESTION_STATUS_BY_ANSWER[answer.status] ?? 'answered',
      ),
    }));
  }

  /** Requests cancellation; the server confirms with `answer.completed` (cancelled). */
  cancelActive(): boolean {
    const { answers, session } = this.deps.store.getState();
    const answer = activeAnswer(answers);
    if (!answer || isTerminal(answer.status) || !session.sessionId) return false;
    return this.deps.socket.send({
      type: 'answer.cancel',
      payload: { sessionId: session.sessionId, answerId: answer.id },
    });
  }

  reset(): void {
    this.deps.store.setState({ answers: initialAnswerState });
  }
}
