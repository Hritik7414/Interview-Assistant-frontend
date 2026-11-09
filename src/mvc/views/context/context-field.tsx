'use client';

import { Upload } from 'lucide-react';
import { useId, useRef, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatCount } from '@/lib/utils';

const MAX_FILE_BYTES = 200 * 1024;

export function ContextField({
  label,
  value,
  limit,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  limit: number;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const over = value.length > limit;

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || file.size > MAX_FILE_BYTES) return;
    onChange((await file.text()).slice(0, limit));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={over}
        aria-describedby={`${id}-count`}
        spellCheck
        className="min-h-40 flex-1 resize-none xl:min-h-0"
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={() => fileInput.current?.click()}
        >
          <Upload aria-hidden className="size-3.5" />
          Load .txt / .md
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          className="hidden"
          onChange={(event) => void onFile(event)}
        />
        <span
          id={`${id}-count`}
          className={cn(
            'text-[0.7rem] tabular-nums text-muted-foreground',
            over && 'font-medium text-destructive',
          )}
        >
          {formatCount(value.length)} / {formatCount(limit)}
        </span>
      </div>
    </div>
  );
}
