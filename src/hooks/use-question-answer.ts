'use client';

import { useMemo } from 'react';
import { answerForQuestion, isTerminal } from '@/mvc/models/answer.model';
import { activeQuestion, previousQuestions } from '@/mvc/models/question.model';
import { useInterviewApp } from './interview-app-context';
import { useInterviewSelector } from './use-interview-session';

/** The active question, its answer (if any) and earlier questions. */
export function useQuestionAnswer() {
  const { controllers } = useInterviewApp();
  const questions = useInterviewSelector((state) => state.questions);
  const answers = useInterviewSelector((state) => state.answers);
  const status = useInterviewSelector((state) => state.session.status);

  return useMemo(() => {
    const question = activeQuestion(questions);
    const answer = question ? answerForQuestion(answers, question.id) : null;
    return {
      question,
      answer,
      previous: previousQuestions(questions),
      sessionStatus: status,
      isStreaming: answer !== null && !isTerminal(answer.status),
      awaitingAnswer:
        question !== null && answer === null && (status === 'thinking' || status === 'answering'),
      cancelAnswer: () => controllers.interview.cancelAnswer(),
    };
  }, [questions, answers, status, controllers]);
}
