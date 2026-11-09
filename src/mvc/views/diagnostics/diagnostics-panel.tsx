'use client';

import type { LatencyMetricName } from '@shared';
import { Gauge } from 'lucide-react';
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useDiagnostics } from '@/hooks/use-diagnostics';
import { cn, formatCount, formatMs } from '@/lib/utils';
import {
  DIAGNOSTIC_METRICS,
  rateLatency,
  type LatencyRating,
} from '@/mvc/models/diagnostics.model';

const METRIC_LABELS: Record<LatencyMetricName, { label: string; hint: string }> = {
  audioIngestion: { label: 'Audio ingest', hint: 'Browser capture → server receipt' },
  transcription: { label: 'Transcription', hint: 'Audio sent to STT → transcript received' },
  questionDetection: {
    label: 'Question detect',
    hint: 'End of utterance → question detected (includes the pause wait)',
  },
  llmFirstToken: { label: 'LLM first token', hint: 'Request sent → first token received' },
  answerTotal: { label: 'Answer total', hint: 'Request sent → answer completed' },
  endToEnd: { label: 'Question → answer', hint: 'Interviewer stops speaking → first answer token' },
};

const RATING_DOT: Record<LatencyRating, string> = {
  good: 'bg-success',
  fair: 'bg-warning',
  poor: 'bg-destructive',
  none: 'bg-muted-foreground/30',
};

export function DiagnosticsPanel() {
  const { metrics, rttMs, framesSent, framesDropped, serverAudio } = useDiagnostics();

  return (
    <Card aria-label="Latency diagnostics">
      <CardHeader className="min-h-10 py-2">
        <CardTitle>
          <Gauge aria-hidden />
          Latency
        </CardTitle>
        <span className="text-[0.7rem] tabular-nums text-muted-foreground">
          RTT {formatMs(rttMs)}
        </span>
      </CardHeader>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[0.68rem] text-muted-foreground">
            <th scope="col" className="px-4 py-1.5 text-left font-medium">
              Stage
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Last
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Avg
            </th>
            <th scope="col" className="py-1.5 pr-4 pl-2 text-right font-medium">
              p95
            </th>
          </tr>
        </thead>
        <tbody>
          {DIAGNOSTIC_METRICS.map((metric) => {
            const stats = metrics?.[metric] ?? null;
            const rating = rateLatency(metric, stats?.p95);
            return (
              <tr
                key={metric}
                className="border-t border-border/60"
                title={METRIC_LABELS[metric].hint}
              >
                <th scope="row" className="px-4 py-1.5 text-left font-normal">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-label={`Rating: ${rating}`}
                      className={cn('size-1.5 rounded-full', RATING_DOT[rating])}
                    />
                    {METRIC_LABELS[metric].label}
                  </span>
                </th>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatMs(stats?.last)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {formatMs(stats?.avg)}
                </td>
                <td className="py-1.5 pr-4 pl-2 text-right tabular-nums">{formatMs(stats?.p95)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <CardFooter className="justify-between tabular-nums">
        <span>
          Frames sent {formatCount(framesSent)}
          {framesDropped > 0 && (
            <span className="text-warning"> · dropped {formatCount(framesDropped)}</span>
          )}
        </span>
        <span>
          Server audio {serverAudio ? `${(serverAudio.audioMs / 1000).toFixed(1)} s` : '—'}
        </span>
      </CardFooter>
    </Card>
  );
}
