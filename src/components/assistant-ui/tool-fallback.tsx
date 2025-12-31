'use client';

import type { ToolCallMessagePartComponent } from '@assistant-ui/react';
import { CheckIcon, ChevronRightIcon, XIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// Helper to safely format result for display
const formatResult = (result: unknown): string => {
  if (result === undefined || result === null) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'number' || typeof result === 'boolean')
    return String(result);
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
};

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const isRunning = status?.type === 'running';
  const isError = (status as any)?.type === 'error';

  return (
    <div className="flex flex-col py-0.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'group flex w-fit items-center gap-1.5 rounded text-xs font-medium transition-colors hover:text-foreground',
          isRunning
            ? 'text-blue-500'
            : isError
              ? 'text-destructive'
              : 'text-muted-foreground',
        )}
      >
        {isRunning ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : isError ? (
          <XIcon className="size-3" />
        ) : (
          <CheckIcon className="size-3" />
        )}
        <span className="font-mono">{toolName}</span>
        <ChevronRightIcon
          className={cn(
            'size-3 opacity-0 transition-all group-hover:opacity-100',
            isOpen && 'rotate-90 opacity-100',
          )}
        />
      </button>

      {isOpen && (
        <div className="mt-1 flex flex-col gap-1.5 border-l-2 pl-3 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-muted-foreground/70">
              Input
            </span>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 px-2 py-1.5 font-mono text-muted-foreground">
              {argsText}
            </pre>
          </div>

          {isError && (status as any).error && (
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-destructive/70">Error</span>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 px-2 py-1.5 font-mono text-destructive">
                {typeof (status as any).error === 'string'
                  ? (status as any).error
                  : JSON.stringify((status as any).error, null, 2)}
              </pre>
            </div>
          )}

          {result && !isError && (
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-muted-foreground/70">
                Result
              </span>
              <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded bg-muted/50 px-2 py-1.5 font-mono text-muted-foreground">
                {formatResult(result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
