import type { AudioCapture } from '@/services/audio.service';
import type { InterviewApi } from '@/services/interview-api.service';
import type { RealtimeSocket } from '@/services/websocket.service';
import type { InterviewStore } from '@/store/interview.store';
import { AnswerController } from './answer.controller';
import { InterviewController } from './interview.controller';
import { QuestionController } from './question.controller';
import { TranscriptController } from './transcript.controller';

export interface Controllers {
  interview: InterviewController;
  transcript: TranscriptController;
  question: QuestionController;
  answer: AnswerController;
}

/** Wires the controllers together around one store and one set of services. */
export function createControllers(deps: {
  store: InterviewStore;
  api: InterviewApi;
  socket: RealtimeSocket;
  audio: AudioCapture;
  now?: () => number;
}): Controllers {
  const transcript = new TranscriptController(deps.store);
  const question = new QuestionController(deps.store);
  const answer = new AnswerController({
    store: deps.store,
    socket: deps.socket,
    ...(deps.now ? { now: deps.now } : {}),
  });
  const interview = new InterviewController({ ...deps, transcript, question, answer });
  return { interview, transcript, question, answer };
}
