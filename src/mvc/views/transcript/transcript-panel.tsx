'use client';

import { ArrowDown, Captions } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { ProviderBadge } from '@/components/shared/provider-badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useTranscript } from '@/hooks/use-transcript';
import { cn, formatCount } from '@/lib/utils';
import { TranscriptLine } from './transcript-line';

export function TranscriptPanel({ className }: { className?: string }) {
  const { lines, partial, utterances, wordCount, simulated, status } = useTranscript();
  const { ref, pinned, onScroll, scrollToBottom } = useAutoScroll<HTMLDivElement>(
    `${lines.length}:${partial?.text ?? ''}`,
  );
  const empty = lines.length === 0 && partial === null;
  const listening = status === 'listening' || status === 'thinking' || status === 'answering';

  return (
    <Card aria-label="Live transcript" className={cn('relative min-h-0', className)}>
      <CardHeader>
        <CardTitle>
          <Captions aria-hidden />
          Live transcript
        </CardTitle>
        <div className="flex items-center gap-2">
          {simulated && (
            <ProviderBadge
              provider={{ name: 'mock-transcription', model: null, simulated: true }}
              kind="transcript"
            />
          )}
          <span className="text-[0.7rem] tabular-nums text-muted-foreground">
            {formatCount(wordCount)} words
          </span>
        </div>
      </CardHeader>
      <div
        ref={ref}
        onScroll={onScroll}
        role="log"
        aria-label="Transcript"
        aria-live="off"
        tabIndex={0}
        className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {empty ? (
          <EmptyState icon={Captions} title={listening ? 'Listening…' : 'Transcript is empty'}>
            {listening
              ? 'Speech will appear here in real time.'
              : 'Start listening to see interim and final transcripts as people speak.'}
          </EmptyState>
        ) : (
          <ol className="flex flex-col gap-2.5" data-testid="transcript-lines">
            {utterances.map((utterance) => (
              <TranscriptLine key={utterance.id} utterance={utterance} />
            ))}
          </ol>
        )}
      </div>
      {!pinned && !empty && (
        <Button
          variant="secondary"
          size="sm"
          onClick={scrollToBottom}
          className="absolute right-4 bottom-4 h-7 shadow-md"
        >
          <ArrowDown aria-hidden />
          Latest
        </Button>
      )}
    </Card>
  );
}
