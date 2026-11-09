'use client';

import { AppHeader } from '@/components/layout/app-header';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useInterviewSession } from '@/hooks/use-interview-session';
import { AnswerPanel } from '@/mvc/views/answer/answer-panel';
import { ContextPanel } from '@/mvc/views/context/context-panel';
import { ControlsPanel } from '@/mvc/views/controls/controls-panel';
import { DiagnosticsPanel } from '@/mvc/views/diagnostics/diagnostics-panel';
import { QuestionPanel } from '@/mvc/views/question/question-panel';
import { TranscriptPanel } from '@/mvc/views/transcript/transcript-panel';
import { ErrorBanner } from './error-banner';

/** Responsive workspace for setup, live assistance and diagnostics. */
export function DashboardView() {
  const session = useInterviewSession();
  const serverReachable = session.capabilities ? true : session.capabilitiesError ? false : null;

  return (
    <TooltipProvider>
      <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background xl:h-dvh">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(ellipse_at_12%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_35%),radial-gradient(ellipse_at_90%_12%,color-mix(in_oklch,var(--info)_6%,transparent),transparent_30%)]"
        />
        <AppHeader
          status={session.displayStatus}
          mode={session.mode}
          connection={session.connection}
          serverReachable={serverReachable}
        />
        <ErrorBanner
          error={session.error}
          capabilitiesError={session.capabilitiesError}
          onDismiss={session.dismissError}
        />
        <main className="relative mx-auto grid w-full max-w-[1800px] flex-1 grid-cols-1 gap-4 p-3 sm:gap-5 sm:p-5 md:grid-cols-2 lg:gap-6 lg:p-6 xl:min-h-0 xl:grid-cols-12 xl:p-7">
          <div className="flex min-w-0 flex-col gap-4 md:col-span-1 xl:col-span-3 xl:min-h-0">
            <ControlsPanel />
            <ContextPanel className="xl:flex-1" />
          </div>
          <div className="flex min-w-0 flex-col gap-4 md:col-span-1 xl:col-span-5 xl:min-h-0">
            <QuestionPanel />
            <AnswerPanel className="min-h-[320px] flex-1 xl:min-h-0" />
          </div>
          <div className="flex min-w-0 flex-col gap-4 md:col-span-2 xl:col-span-4 xl:min-h-0">
            <TranscriptPanel className="min-h-[300px] flex-1 xl:min-h-0" />
            <DiagnosticsPanel />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
