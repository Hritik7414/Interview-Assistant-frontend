import { Fragment, type ReactNode } from 'react';
import { parseAnswerBlocks } from '@/mvc/models/answer.model';

/** Highlights bracketed placeholders like [specific project] for the candidate to fill in. */
function withPlaceholders(text: string): ReactNode {
  return text.split(/(\[[^\]]+\])/g).map((part, index) =>
    /^\[[^\]]+\]$/.test(part) ? (
      <mark key={index} className="rounded bg-warning/15 px-1 text-foreground">
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-caret bg-primary"
    />
  );
}

export function AnswerContent({ text, streaming }: { text: string; streaming: boolean }) {
  const blocks = parseAnswerBlocks(text);
  if (blocks.length === 0) return streaming ? <Caret /> : null;
  const bullets = blocks.every((block) => block.kind === 'bullet');

  if (bullets) {
    return (
      <ul className="flex flex-col gap-2.5">
        {blocks.map((block, index) => (
          <li key={index} className="flex gap-3 text-[0.95rem] leading-relaxed">
            <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-primary/70" />
            <span>
              {withPlaceholders(block.text)}
              {streaming && index === blocks.length - 1 && <Caret />}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 text-[0.95rem] leading-relaxed">
      {blocks.map((block, index) => (
        <p
          key={index}
          className={
            block.kind === 'bullet'
              ? 'pl-4 before:-ml-4 before:mr-2 before:text-primary before:content-["•"]'
              : undefined
          }
        >
          {withPlaceholders(block.text)}
          {streaming && index === blocks.length - 1 && <Caret />}
        </p>
      ))}
    </div>
  );
}
