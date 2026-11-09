import { CONTEXT_LIMITS } from '@shared';
import { describe, expect, it } from 'vitest';
import {
  answerForQuestion,
  applyDelta,
  completeAnswer,
  countWords,
  initialAnswerState,
  parseAnswerBlocks,
  startAnswer,
} from '@/mvc/models/answer.model';
import { dropRate, rateLatency } from '@/mvc/models/diagnostics.model';
import {
  canStart,
  canStop,
  deriveDisplayStatus,
  emptyContext,
  isModeAvailable,
  mapServerState,
  validateContext,
} from '@/mvc/models/interview.model';
import {
  activeQuestion,
  addQuestion,
  initialQuestionState,
  previousQuestions,
  updateQuestionStatus,
} from '@/mvc/models/question.model';
import {
  applyFinal,
  applyPartial,
  groupUtterances,
  initialTranscriptState,
} from '@/mvc/models/transcript.model';
import { ANSWER_ID, CAPABILITIES, events, QUESTION_ID } from '../../helpers/fakes';

const segment = (id: string, text: string, startMs: number, endMs = startMs + 1_000) => ({
  id,
  text,
  isFinal: true,
  startMs,
  endMs,
  confidence: 0.9,
  speechFinal: false,
  receivedAt: 1,
});

describe('transcript model', () => {
  it('replaces partials and promotes them to finals by id', () => {
    let state = applyPartial(initialTranscriptState, segment('a', 'how', 0));
    state = applyPartial(state, segment('a', 'how would', 0));
    expect(state.partial?.text).toBe('how would');
    state = applyFinal(state, segment('a', 'How would you?', 0));
    expect(state.partial).toBeNull();
    expect(state.lines.map((line) => line.text)).toEqual(['How would you?']);
    // A late partial for a finalised segment is ignored.
    expect(applyPartial(state, segment('a', 'how', 0))).toBe(state);
  });

  it('deduplicates finals by id and bounds the number of lines', () => {
    let state = applyFinal(initialTranscriptState, segment('a', 'one', 0));
    state = applyFinal(state, segment('a', 'one!', 0));
    expect(state.lines).toHaveLength(1);
    for (let i = 0; i < 5; i += 1)
      state = applyFinal(state, segment(`n${i}`, `line ${i}`, i * 2_000), 3);
    expect(state.lines.map((line) => line.text)).toEqual(['line 2', 'line 3', 'line 4']);
  });

  it('groups finals split mid-sentence into one utterance and attaches the interim tail', () => {
    let state = applyFinal(initialTranscriptState, segment('a', 'Hi there.', 0, 1_000));
    state = applyFinal(state, segment('b', 'Could you walk me', 2_000, 3_000));
    state = applyFinal(state, segment('c', 'through your background?', 3_100, 4_000));
    state = applyPartial(state, segment('d', 'and also', 4_200));
    expect(groupUtterances(state)).toEqual([
      { id: 'a', startMs: 0, text: 'Hi there.', interimText: '' },
      {
        id: 'b',
        startMs: 2_000,
        text: 'Could you walk me through your background?',
        interimText: 'and also',
      },
    ]);
  });
});

describe('question model', () => {
  it('adds unique questions, tracks the active one and status changes', () => {
    let state = addQuestion(initialQuestionState, events.question('First?', 'q1').payload.question);
    state = addQuestion(state, events.question('Second?', 'q2').payload.question);
    state = addQuestion(state, events.question('Second?', 'q2').payload.question);
    expect(state.items).toHaveLength(2);
    expect(activeQuestion(state)?.text).toBe('Second?');
    expect(previousQuestions(state).map((q) => q.id)).toEqual(['q1']);
    expect(updateQuestionStatus(state, 'q2', 'answered').items[1]!.status).toBe('answered');
  });
});

describe('answer model', () => {
  it('streams deltas in order, ignoring duplicates and late deltas', () => {
    let state = startAnswer(initialAnswerState, events.answerStarted().payload);
    state = applyDelta(state, events.delta('- Hello', 0).payload, 100);
    state = applyDelta(state, events.delta('- Hello', 0).payload, 110); // duplicate index
    state = applyDelta(state, events.delta(' world', 3).payload, 120); // coalesced (skipped) indexes are fine
    expect(state.byId[ANSWER_ID]).toMatchObject({
      text: '- Hello world',
      status: 'streaming',
      firstTokenAt: 100,
    });

    state = completeAnswer(state, events.answerCompleted('- Hello world.').payload);
    expect(state.byId[ANSWER_ID]).toMatchObject({
      status: 'completed',
      text: '- Hello world.',
      latency: { firstTokenMs: 290 },
    });
    expect(applyDelta(state, events.delta('late', 9).payload, 200)).toBe(state);
    expect(answerForQuestion(state, QUESTION_ID)?.id).toBe(ANSWER_ID);
  });

  it('parses bullets (including a marker whose text has not arrived) and paragraphs', () => {
    expect(parseAnswerBlocks('- One\n• Two\n1. Three\n-')).toEqual([
      { kind: 'bullet', text: 'One' },
      { kind: 'bullet', text: 'Two' },
      { kind: 'bullet', text: 'Three' },
      { kind: 'bullet', text: '' },
    ]);
    expect(parseAnswerBlocks('Plain sentence.\n-5% churn')).toEqual([
      { kind: 'paragraph', text: 'Plain sentence.' },
      { kind: 'paragraph', text: '-5% churn' },
    ]);
    expect(countWords('- I led [project] — twice.')).toBe(4);
  });
});

describe('interview model', () => {
  it('guards start/stop transitions', () => {
    expect(canStart('idle')).toBe(true);
    expect(canStart('listening')).toBe(false);
    expect(canStop('listening')).toBe(true);
    expect(canStop('stopped')).toBe(false);
  });

  it('derives a single display status from session and connection', () => {
    expect(deriveDisplayStatus('idle', 'idle')).toBe('ready');
    expect(deriveDisplayStatus('connecting', 'connecting')).toBe('starting');
    expect(deriveDisplayStatus('thinking', 'open')).toBe('thinking');
    expect(deriveDisplayStatus('listening', 'reconnecting')).toBe('reconnecting');
    expect(deriveDisplayStatus('answering', 'closed')).toBe('disconnected');
    expect(deriveDisplayStatus('error', 'closed')).toBe('error');
  });

  it('maps server states', () => {
    expect(mapServerState('suspended')).toBe('reconnecting');
    expect(mapServerState('starting')).toBe('connecting');
    expect(mapServerState('answering')).toBe('answering');
  });

  it('validates context with the shared schema', () => {
    expect(validateContext(emptyContext).valid).toBe(true);
    const result = validateContext({
      ...emptyContext,
      resume: 'x'.repeat(CONTEXT_LIMITS.resume + 1),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.resume).toMatch(/at most/);
  });

  it('knows whether a mode is available', () => {
    expect(isModeAvailable(CAPABILITIES, 'demo')).toBe(true);
    expect(isModeAvailable(CAPABILITIES, 'live')).toBe(false);
    expect(isModeAvailable(null, 'live')).toBe(false);
  });
});

describe('diagnostics model', () => {
  it('rates latency against the shared budgets', () => {
    expect(rateLatency('llmFirstToken', 400)).toBe('good');
    expect(rateLatency('llmFirstToken', 1_500)).toBe('fair');
    expect(rateLatency('llmFirstToken', 5_000)).toBe('poor');
    expect(rateLatency('llmFirstToken', null)).toBe('none');
    expect(dropRate(90, 10)).toBe(0.1);
    expect(dropRate(0, 0)).toBe(0);
  });
});
