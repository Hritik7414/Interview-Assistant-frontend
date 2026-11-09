import type { TranscriptSegmentDTO } from '@shared';
import { UI_LIMITS } from '@/lib/constants';

export interface TranscriptLine {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  receivedAt: number;
}

export interface TranscriptState {
  lines: TranscriptLine[];
  /** In-progress (interim) text for the current utterance. */
  partial: TranscriptLine | null;
}

export const initialTranscriptState: TranscriptState = { lines: [], partial: null };

function toLine(segment: TranscriptSegmentDTO): TranscriptLine {
  return {
    id: segment.id,
    text: segment.text,
    startMs: segment.startMs,
    endMs: segment.endMs,
    receivedAt: segment.receivedAt,
  };
}

/** Interim results replace each other; a partial for an already-final segment is stale. */
export function applyPartial(
  state: TranscriptState,
  segment: TranscriptSegmentDTO,
): TranscriptState {
  if (state.lines.some((line) => line.id === segment.id)) return state;
  return { ...state, partial: toLine(segment) };
}

/** Appends (or replaces, by id) a final segment and clears its partial. Bounded length. */
export function applyFinal(
  state: TranscriptState,
  segment: TranscriptSegmentDTO,
  maxLines: number = UI_LIMITS.maxTranscriptLines,
): TranscriptState {
  const line = toLine(segment);
  const index = state.lines.findIndex((existing) => existing.id === line.id);
  const lines =
    index >= 0
      ? state.lines.map((existing, i) => (i === index ? line : existing))
      : [...state.lines, line].slice(-maxLines);
  const partial = state.partial?.id === line.id ? null : state.partial;
  return { lines, partial };
}

/** A readable paragraph: consecutive final segments of one utterance plus any interim tail. */
export interface TranscriptUtterance {
  id: string;
  startMs: number;
  text: string;
  interimText: string;
}

/** Segments closer than this (audio time) belong to the same spoken utterance. */
export const UTTERANCE_GAP_MS = 500;

/**
 * Groups final segments into utterances so a sentence split across provider
 * finals reads as one paragraph; the interim text continues the last utterance
 * when it follows it closely, otherwise it starts a new one.
 */
export function groupUtterances(
  state: TranscriptState,
  gapMs: number = UTTERANCE_GAP_MS,
): TranscriptUtterance[] {
  const groups: TranscriptUtterance[] = [];
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const line of state.lines) {
    const current = groups.at(-1);
    if (current && line.startMs - lastEnd < gapMs) {
      current.text = `${current.text} ${line.text}`;
    } else {
      groups.push({ id: line.id, startMs: line.startMs, text: line.text, interimText: '' });
    }
    lastEnd = line.endMs;
  }
  const { partial } = state;
  if (partial) {
    const current = groups.at(-1);
    if (current && partial.startMs - lastEnd < gapMs) current.interimText = partial.text;
    else
      groups.push({
        id: partial.id,
        startMs: partial.startMs,
        text: '',
        interimText: partial.text,
      });
  }
  return groups;
}

export function transcriptWordCount(state: TranscriptState): number {
  return state.lines.reduce(
    (total, line) => total + line.text.split(/\s+/).filter(Boolean).length,
    0,
  );
}
