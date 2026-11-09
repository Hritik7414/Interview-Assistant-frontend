import { formatOffset } from '@/lib/utils';
import type { TranscriptUtterance } from '@/mvc/models/transcript.model';

/** One utterance: final text in full contrast, the still-changing interim tail muted. */
export function TranscriptLine({ utterance }: { utterance: TranscriptUtterance }) {
  const interim = utterance.interimText !== '';
  return (
    <li className="grid grid-cols-[2.75rem_1fr] gap-2" data-interim={interim || undefined}>
      <time className="pt-0.5 text-[0.7rem] tabular-nums text-muted-foreground/80">
        {formatOffset(utterance.startMs)}
      </time>
      <p className="text-sm leading-relaxed">
        {utterance.text}
        {interim && (
          <span className="text-muted-foreground italic">
            {utterance.text ? ' ' : ''}
            {utterance.interimText}
            <span
              aria-hidden
              className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary/70 align-middle"
            />
          </span>
        )}
      </p>
    </li>
  );
}
