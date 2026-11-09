'use client';

import type { QuestionDTO } from '@shared';
import { History, MessageCircleQuestion } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuestionAnswer } from '@/hooks/use-question-answer';

const TRIGGER_LABELS: Record<string, string> = {
  'trigger:speech-final': 'end of speech',
  'trigger:utterance-end': 'pause',
  'trigger:silence': 'silence',
  'trigger:audio-gap': 'pause',
  'trigger:flush': 'session end',
};

function detectionNote(question: QuestionDTO): string {
  const trigger = question.reasons.find((reason) => reason.startsWith('trigger:'));
  return `Detected on ${TRIGGER_LABELS[trigger ?? ''] ?? 'pause'} · ${new Date(
    question.detectedAt,
  ).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

export function QuestionPanel() {
  const { question, previous } = useQuestionAnswer();

  return (
    <Card aria-label="Detected question">
      <CardHeader>
        <CardTitle>
          <MessageCircleQuestion aria-hidden />
          Detected question
        </CardTitle>
        {question && (
          <Badge
            variant="outline"
            title="Heuristic confidence that this is an interviewer question"
          >
            {Math.round(question.confidence * 100)}% confidence
          </Badge>
        )}
      </CardHeader>
      <CardContent aria-live="polite" className="min-h-28">
        {question ? (
          <figure className="flex flex-col gap-2">
            <blockquote
              data-testid="active-question"
              className="border-l-2 border-primary pl-3 text-[1.05rem] leading-snug font-medium text-balance"
            >
              {question.text}
            </blockquote>
            <figcaption className="pl-3 text-[0.72rem] text-muted-foreground">
              {detectionNote(question)}
            </figcaption>
          </figure>
        ) : (
          <EmptyState icon={MessageCircleQuestion} title="Waiting for a question" className="py-4">
            Questions appear here as soon as the interviewer pauses after asking one.
          </EmptyState>
        )}
      </CardContent>
      {previous.length > 0 && (
        <details className="group border-t px-4 py-2 text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground select-none hover:text-foreground">
            <History aria-hidden className="size-3.5" />
            Earlier questions ({previous.length})
          </summary>
          <ol className="scrollbar-thin mt-2 max-h-32 space-y-1.5 overflow-y-auto pr-1">
            {previous.map((item) => (
              <li key={item.id} className="leading-snug text-muted-foreground">
                {item.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}
