import type { ServerEventOf } from '@shared';
import { addQuestion, initialQuestionState } from '@/mvc/models/question.model';
import type { InterviewStore } from '@/store/interview.store';

/** Applies detected questions to the store through the question model. */
export class QuestionController {
  constructor(private readonly store: InterviewStore) {}

  handleDetected(event: ServerEventOf<'question.detected'>): void {
    this.store.setState((state) => ({
      questions: addQuestion(state.questions, event.payload.question),
    }));
  }

  reset(): void {
    this.store.setState({ questions: initialQuestionState });
  }
}
