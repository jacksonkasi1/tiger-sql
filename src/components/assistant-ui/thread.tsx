'use client';

import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from '@/components/assistant-ui/attachment';
import { MarkdownText } from '@/components/assistant-ui/markdown-text';
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning';
import { ToolFallback } from '@/components/assistant-ui/tool-fallback';
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ActionBarPrimitive,
  AssistantIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  Database,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';
import type { FC } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select';

export interface UnifiedModel {
  id: string;
  name: string;
  provider: 'openai' | 'google';
}

interface ThreadProps {
  models?: UnifiedModel[];
  currentModel?: UnifiedModel;
  onModelChange?: (modelId: string) => void;
}

export const Thread: FC<ThreadProps> = ({
  models = [],
  currentModel,
  onModelChange,
}) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background overflow-hidden"
      style={{
        ['--thread-max-width' as string]: '100%',
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-6"
      >
        <AssistantIf condition={({ thread }) => thread.isEmpty}>
          <ThreadWelcome />
        </AssistantIf>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            EditComposer,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-3 overflow-visible rounded-t-2xl bg-gradient-to-t from-background via-background to-transparent pb-4 px-2 pt-10">
          <ThreadScrollToBottom />
          <Composer
            models={models}
            currentModel={currentModel}
            onModelChange={onModelChange}
          />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded-full p-2 bg-background shadow-sm hover:bg-muted disabled:invisible"
      >
        <ArrowDownIcon className="size-4" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4 py-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Database className="size-6 text-primary" />
            </div>
            <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in font-semibold text-xl duration-200">
              Schema Assistant
            </h1>
          </div>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in text-muted-foreground text-sm delay-75 duration-200 leading-relaxed max-w-[85%]">
            I can help you design and modify your database schema. Try one of
            the suggestions below or ask me anything!
          </p>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};

const SUGGESTIONS = [
  {
    title: 'Create a users table',
    label: 'with email and profile fields',
    prompt:
      'Create a users table with id, email, name, avatar_url, and created_at columns',
    icon: Sparkles,
  },
  {
    title: 'Add a posts table',
    label: 'with foreign key to users',
    prompt:
      'Create a posts table with title, content, author_id (foreign key to users), and timestamps',
    icon: Wand2,
  },
  {
    title: 'List all tables',
    label: 'in the current schema',
    prompt: 'List all tables in the database',
    icon: Database,
  },
  {
    title: 'Design an e-commerce schema',
    label: 'products, orders, customers',
    prompt:
      'Design a basic e-commerce schema with products, customers, orders, and order_items tables',
    icon: Zap,
  },
] as const;

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full grid-cols-1 @sm:grid-cols-2 gap-3 pb-4 px-1">
      {SUGGESTIONS.map((suggestion, index) => {
        const Icon = suggestion.icon;
        return (
          <div
            key={suggestion.prompt}
            className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200"
            style={{ animationDelay: `${100 + index * 50}ms` }}
          >
            <ThreadPrimitive.Suggestion prompt={suggestion.prompt} send asChild>
              <Button
                variant="outline"
                className="aui-thread-welcome-suggestion h-auto w-full flex-col items-start justify-start gap-1 rounded-xl border p-3 text-left text-xs transition-all hover:bg-muted hover:border-primary/20"
                aria-label={suggestion.prompt}
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-3.5 text-primary" />
                  <span className="aui-thread-welcome-suggestion-text-1 font-medium">
                    {suggestion.title}
                  </span>
                </div>
                <span className="aui-thread-welcome-suggestion-text-2 text-muted-foreground text-xs pl-5.5">
                  {suggestion.label}
                </span>
              </Button>
            </ThreadPrimitive.Suggestion>
          </div>
        );
      })}
    </div>
  );
};

const Composer: FC<ThreadProps> = ({ models, currentModel, onModelChange }) => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone className="aui-composer-attachment-dropzone flex w-full flex-col rounded-2xl border border-input bg-background shadow-sm transition-all focus-within:border-gray-300 dark:focus-within:border-gray-700 overflow-hidden min-h-[120px] pointer-events-auto">
        <ComposerAttachments />
        <ComposerPrimitive.Input
          placeholder="Ask about your schema..."
          className="aui-composer-input min-h-[80px] w-full resize-none bg-transparent p-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0 border-none shadow-none ring-0 focus-visible:ring-offset-0 pointer-events-auto"
          rows={1}
          autoFocus
          aria-label="Message input"
        />

        <div className="flex items-center justify-between px-2 pb-2 pt-1 mt-auto">
          <div className="flex items-center gap-2">
            <ComposerAddAttachment className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" />

            {models && models.length > 0 && currentModel && onModelChange && (
              <Select value={currentModel.id} onValueChange={onModelChange}>
                <SelectTrigger className="h-8 w-fit gap-2 rounded-full border border-input bg-transparent px-3 text-xs font-medium hover:bg-muted/50 focus:ring-0 focus:ring-offset-0 transition-colors shadow-sm">
                  <span className="text-foreground">
                    {currentModel.provider === 'google' ? 'Gemini' : 'OpenAI'}
                  </span>
                  <span className="text-muted-foreground/40">|</span>
                  <span className="text-muted-foreground truncate max-w-[100px]">
                    {currentModel.name}
                  </span>
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectLabel>OpenAI Models</SelectLabel>
                    {models
                      .filter((m) => m.provider === 'openai')
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Google Models</SelectLabel>
                    {models
                      .filter((m) => m.provider === 'google')
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ComposerAction />
          </div>
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  return (
    <>
      <AssistantIf condition={({ thread }) => !thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send message"
            side="top"
            type="submit"
            variant="default"
            size="icon"
            className="aui-composer-send size-8 rounded-full transition-all shadow-sm"
            aria-label="Send message"
          >
            <ArrowUpIcon className="aui-composer-send-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AssistantIf>

      <AssistantIf condition={({ thread }) => thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 rounded-full transition-all shadow-sm"
            aria-label="Stop generating"
          >
            <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AssistantIf>
    </>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-2 text-destructive text-xs dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-assistant-message-root fade-in slide-in-from-bottom-1 relative mx-auto w-full max-w-(--thread-max-width) animate-in py-4 duration-150 group"
      data-role="assistant"
    >
      <div className="aui-assistant-message-content wrap-break-word px-1 text-foreground leading-relaxed text-sm">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning: Reasoning,
            ReasoningGroup: ReasoningGroup,
            tools: { Fallback: ToolFallback },
          }}
        />
        <MessageError />
      </div>

      <AssistantActionBar />

      <div className="aui-assistant-message-footer mt-2 flex items-center justify-between">
        <BranchPicker />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohideFloat="single-branch"
      className="aui-assistant-action-bar-root mt-2 flex gap-1 items-center px-1"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton
          tooltip="Copy"
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground/60 hover:text-foreground"
        >
          <AssistantIf condition={({ message }) => message.isCopied}>
            <CheckIcon className="size-3.5" />
          </AssistantIf>
          <AssistantIf condition={({ message }) => !message.isCopied}>
            <CopyIcon className="size-3.5" />
          </AssistantIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.ExportMarkdown asChild>
        <TooltipIconButton
          tooltip="Export as Markdown"
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground/60 hover:text-foreground"
        >
          <DownloadIcon className="size-3.5" />
        </TooltipIconButton>
      </ActionBarPrimitive.ExportMarkdown>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton
          tooltip="Refresh"
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground/60 hover:text-foreground"
        >
          <RefreshCwIcon className="size-3.5" />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-user-message-root fade-in slide-in-from-bottom-1 mx-auto flex w-full max-w-(--thread-max-width) animate-in flex-col items-end px-1 py-4 duration-150 group"
      data-role="user"
    >
      <UserMessageAttachments />
      <div className="aui-user-message-content wrap-break-word rounded-2xl bg-muted px-4 py-2.5 text-foreground text-sm">
        <MessagePrimitive.Parts />
      </div>

      <UserActionBar />

      <BranchPicker className="aui-user-branch-picker mt-2 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      className="aui-user-action-bar-root mt-2 flex items-center gap-1"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton
          tooltip="Copy"
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground/60 hover:text-foreground"
        >
          <AssistantIf condition={({ message }) => message.isCopied}>
            <CheckIcon className="size-3.5" />
          </AssistantIf>
          <AssistantIf condition={({ message }) => !message.isCopied}>
            <CopyIcon className="size-3.5" />
          </AssistantIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton
          tooltip="Edit"
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground/60 hover:text-foreground"
        >
          <PencilIcon className="size-3.5" />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root className="aui-edit-composer-wrapper mx-auto flex w-full max-w-(--thread-max-width) flex-col px-1 py-2">
      <ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-[85%] flex-col rounded-xl bg-muted border border-input/50">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input min-h-10 w-full resize-none bg-transparent p-3 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-2 mb-2 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs hover:bg-background/50"
            >
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-7 text-xs">
              Update
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        'aui-branch-picker-root inline-flex items-center text-muted-foreground text-xs select-none',
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton
          tooltip="Previous"
          variant="ghost"
          size="icon"
          className="size-5 hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-mono mx-1 opacity-70">
        <BranchPickerPrimitive.Number />/<BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton
          tooltip="Next"
          variant="ghost"
          size="icon"
          className="size-5 hover:text-foreground"
        >
          <ChevronRightIcon className="size-3" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
