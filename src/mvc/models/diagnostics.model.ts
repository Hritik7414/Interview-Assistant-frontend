import { LATENCY_BUDGETS_MS, type LatencyMetricName } from '@shared';

export type LatencyRating = 'good' | 'fair' | 'poor' | 'none';

/** Display order of pipeline stages, from audio in to answer out. */
export const DIAGNOSTIC_METRICS: readonly LatencyMetricName[] = [
  'audioIngestion',
  'transcription',
  'questionDetection',
  'llmFirstToken',
  'answerTotal',
  'endToEnd',
];

/** Rates a latency against the shared budgets (good ≤ first bound, fair ≤ second). */
export function rateLatency(
  metric: LatencyMetricName,
  valueMs: number | null | undefined,
): LatencyRating {
  if (valueMs === null || valueMs === undefined || !Number.isFinite(valueMs)) return 'none';
  const [good, fair] = LATENCY_BUDGETS_MS[metric];
  if (valueMs <= good) return 'good';
  if (valueMs <= fair) return 'fair';
  return 'poor';
}

/** Share of captured audio frames that were dropped client-side. */
export function dropRate(sent: number, dropped: number): number {
  const total = sent + dropped;
  return total === 0 ? 0 : dropped / total;
}
