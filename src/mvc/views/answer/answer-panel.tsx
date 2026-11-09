'use client';

import { Ban, Check, Copy, Sparkles, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ProviderBadge } from '@/components/shared/provider-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuestionAnswer } from '@/hooks/use-question-answer';
import { cn, formatMs } from '@/lib/utils';
import { countWords } from '@/mvc/models/answer.model';
import { AnswerContent } from './answer-content';

function ThinkingPlaceholder() {
  return (
    <div className="flex flex-col gap-3" aria-label="Generating answer">
      {[92, 80, 86, 64].map((width, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="size-1.5 rounded-full bg-muted" />
          <Skeleton className="h-4" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => void copy()}
      aria-label={copied ? 'Copied' : 'Copy answer'}
    >
      {copied ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
    </Button>
  );
}

export function AnswerPanel({ className }: { className?: string }) {
  const { question, answer, isStreaming, awaitingAnswer, cancelAnswer } = useQuestionAnswer();
  const showThinking = awaitingAnswer || (answer !== null && answer.status === 'pending');
  const words = answer ? countWords(answer.text) : 0;

  return (
    <Card aria-label="Suggested answer" className={cn('min-h-0', className)}>
      <CardHeader>
        <CardTitle>
          <Sparkles aria-hidden />
          Suggested answer
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {answer && <ProviderBadge provider={answer.provider} kind="answer" />}
          {answer?.status === 'cancelled' && <Badge variant="outline">Cancelled</Badge>}
          {isStreaming ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelAnswer}
              className="h-7 text-muted-foreground"
            >
              <Ban aria-hidden />
              Stop
            </Button>
          ) : (
            answer?.status === 'completed' && <CopyButton text={answer.text} />
          )}
        </div>
      </CardHeader>
      <CardContent
        data-testid="answer-content"
        aria-live="polite"
        aria-busy={isStreaming || showThinking}
        className="scrollbar-thin flex-1 overflow-y-auto"
      >
        {!question ? (
          <EmptyState icon={Sparkles} title="No answer yet">
            A concise, resume-grounded answer streams here the moment a question is detected.
          </EmptyState>
        ) : showThinking ? (
          <ThinkingPlaceholder />
        ) : answer ? (
          <div className="flex flex-col gap-4">
            <AnswerContent text={answer.text} streaming={isStreaming} />
            {answer.status === 'failed' && (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden />
                <AlertTitle>Answer failed</AlertTitle>
                <AlertDescription>
                  {answer.errorMessage ?? 'The language model could not produce an answer.'}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between tabular-nums">
        <span>{answer ? `${words} words` : 'Target: 60–90 words, 3–6 bullets'}</span>
        {answer && (
          <span>
            First token{' '}
            {formatMs(
              answer.latency.firstTokenMs ??
                (answer.firstTokenAt ? answer.firstTokenAt - answer.startedAt : null),
            )}
            {answer.latency.totalMs ? ` · total ${formatMs(answer.latency.totalMs)}` : ''}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
