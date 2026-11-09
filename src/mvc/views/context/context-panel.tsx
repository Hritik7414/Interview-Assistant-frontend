'use client';

import { CONTEXT_LIMITS } from '@shared';
import {
  Briefcase,
  Check,
  FileText,
  LoaderCircle,
  NotebookPen,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInterviewContext } from '@/hooks/use-interview-session';
import { cn } from '@/lib/utils';
import type { ContextField as Field } from '@/mvc/models/interview.model';
import { ContextField } from './context-field';

const FIELDS: ReadonlyArray<{
  field: Field;
  tab: string;
  label: string;
  icon: typeof FileText;
  placeholder: string;
}> = [
  {
    field: 'resume',
    tab: 'Resume',
    label: 'Resume',
    icon: FileText,
    placeholder:
      'Paste your resume. Answers only reference experience written here — nothing is invented.',
  },
  {
    field: 'jobDescription',
    tab: 'Job',
    label: 'Job description',
    icon: Briefcase,
    placeholder: 'Paste the job description so answers are tailored to the role.',
  },
  {
    field: 'instructions',
    tab: 'Notes',
    label: 'Additional instructions',
    icon: NotebookPen,
    placeholder: 'Optional guidance, e.g. “Use the STAR format” or “Emphasise leadership”.',
  },
];

function SyncStatus({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  const presentation = {
    saving: { icon: LoaderCircle, text: 'Saving…', className: 'text-muted-foreground', spin: true },
    saved: { icon: Check, text: 'Applied to next answer', className: 'text-success', spin: false },
    error: { icon: TriangleAlert, text: 'Not saved', className: 'text-destructive', spin: false },
  }[state];
  const Icon = presentation.icon;
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[0.7rem]', presentation.className)}
      role="status"
    >
      <Icon aria-hidden className={cn('size-3', presentation.spin && 'animate-spin')} />
      {presentation.text}
    </span>
  );
}

export function ContextPanel({ className }: { className?: string }) {
  const { context, contextSync, limits, updateContext } = useInterviewContext();
  const limitFor = (field: Field) =>
    ({
      resume: limits?.resumeChars ?? CONTEXT_LIMITS.resume,
      jobDescription: limits?.jobDescriptionChars ?? CONTEXT_LIMITS.jobDescription,
      instructions: limits?.instructionsChars ?? CONTEXT_LIMITS.instructions,
    })[field];

  return (
    <Card aria-label="Candidate context" className={cn('min-h-0', className)}>
      <CardHeader>
        <CardTitle>
          <UserRound aria-hidden />
          Your context
        </CardTitle>
        <SyncStatus state={contextSync} />
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Tabs defaultValue="resume" className="min-h-0 flex-1">
          <TabsList aria-label="Context fields">
            {FIELDS.map(({ field, tab, icon: Icon }) => (
              <TabsTrigger key={field} value={field}>
                <Icon aria-hidden />
                {tab}
                {context[field].trim() !== '' && (
                  <span aria-label="filled" className="size-1.5 rounded-full bg-success" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {FIELDS.map(({ field, label, placeholder }) => (
            <TabsContent key={field} value={field} className="min-h-0">
              <ContextField
                label={label}
                value={context[field]}
                limit={limitFor(field)}
                placeholder={placeholder}
                onChange={(value) => updateContext(field, value)}
              />
            </TabsContent>
          ))}
        </Tabs>
        <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
          Kept in memory for this session only and never written to server logs.
        </p>
      </CardContent>
    </Card>
  );
}
