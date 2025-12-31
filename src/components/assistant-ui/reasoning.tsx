'use client';

import { FC, PropsWithChildren, ComponentProps } from 'react';
import { ChevronRight, Brain, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useMessage } from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Main Reasoning Component
export const Reasoning: FC<{
  text?: string;
  part?: { text: string; type: string };
  status?: { type: string };
}> = ({ text, part, status }) => {
  const content = text ?? part?.text;
  const isStreaming = status?.type === 'running';

  if (!content && !isStreaming) return null;

  return (
    <div className="py-2 first:pt-0 last:pb-0">
      {content ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ className, ...props }: ComponentProps<'p'>) => (
              <p
                className={cn('leading-relaxed mb-2 last:mb-0', className)}
                {...props}
              />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="animate-pulse text-xs">Thinking...</span>
        </div>
      )}
    </div>
  );
};

// ReasoningGroup - wraps consecutive reasoning parts
export const ReasoningGroup: FC<
  PropsWithChildren<{
    startIndex: number;
    endIndex: number;
  }>
> = ({ children }) => {
  const { status } = useMessage();
  const isStreaming = status?.type === 'running';
  // const count = endIndex - startIndex + 1; // Unused for now to keep it minimal

  return (
    <Collapsible defaultOpen={isStreaming} className="my-2">
      <CollapsibleTrigger
        className={cn(
          'group flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors select-none w-fit',
        )}
      >
        {isStreaming ? (
          <Loader2 className="size-3 animate-spin text-purple-500" />
        ) : (
          <Brain className="size-3" />
        )}

        <span>{isStreaming ? 'Thinking...' : 'Reasoning'}</span>

        <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]:rotate-90 text-muted-foreground/50 group-hover:text-muted-foreground" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 pl-3 border-l-2 border-purple-500/10 text-xs text-muted-foreground/90">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default Reasoning;
