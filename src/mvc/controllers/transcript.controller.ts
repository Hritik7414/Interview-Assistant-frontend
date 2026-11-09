import type { ServerEventOf } from '@shared';
import { applyFinal, applyPartial, initialTranscriptState } from '@/mvc/models/transcript.model';
import type { InterviewStore } from '@/store/interview.store';

/** Applies transcript events to the store through the transcript model. */
export class TranscriptController {
  constructor(private readonly store: InterviewStore) {}

  handlePartial(event: ServerEventOf<'transcript.partial'>): void {
    this.store.setState((state) => ({
      transcript: applyPartial(state.transcript, event.payload.segment),
    }));
  }

  handleFinal(event: ServerEventOf<'transcript.final'>): void {
    this.store.setState((state) => ({
      transcript: applyFinal(state.transcript, event.payload.segment),
    }));
  }

  reset(): void {
    this.store.setState({ transcript: initialTranscriptState });
  }
}
