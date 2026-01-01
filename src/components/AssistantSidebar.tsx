'use client';

// ** import types
import type {
  Table,
  StreamingTablesBatch,
  StreamingNotification,
  StreamingOperationHistory,
  OperationRecord,
} from '@/lib/types';

// ** import core packages
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  AssistantRuntimeProvider,
  useThread,
  type ThreadMessage,
} from '@assistant-ui/react';
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk';
import { useChat, type UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

// ** import utils
import { useStore } from '@/lib/store';
import { useLocalStorage } from '@/lib/hooks';
import { useHotkeys } from 'react-hotkeys-hook';
import { useChatHistory } from '@/hooks/use-chat-history';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useResizable } from '@/hooks/useResizable';
import { ResizeHandle } from '@/components/ui/resize-handle';

// ** import ui components
import { Button } from '@/components/ui/button';
import { X, Undo2, Redo2, History, Sparkles, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ** import assistant-ui components
import { Thread } from '@/components/assistant-ui/thread';
import { ChatHistory } from '@/components/assistant-ui/ChatHistory';

// ============================================================================
// Message Tracker Component (runs inside AssistantRuntimeProvider)
// ============================================================================

interface MessageTrackerProps {
  onMessagesChange: (messages: ThreadMessage[]) => void;
  children: React.ReactNode;
}

function MessageTracker({ onMessagesChange, children }: MessageTrackerProps) {
  const messages = useThread((state) => state.messages);

  useEffect(() => {
    if (messages && messages.length > 0) {
      // Create a mutable copy of the readonly array
      onMessagesChange([...messages]);
    }
  }, [messages, onMessagesChange]);

  return <>{children}</>;
}

interface AssistantSidebarProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const SIDEBAR_CONFIG = {
  storageKey: 'assistant-sidebar-width',
  defaultWidth: 400,
  minWidth: 320,
  maxWidth: 700,
} as const;

interface Model {
  id: string;
  name: string;
  enabled?: boolean;
}

export interface UnifiedModel {
  id: string;
  name: string;
  provider: 'openai' | 'google';
}

export function AssistantSidebar({
  isOpen = false,
  onOpenChange,
}: AssistantSidebarProps) {
  const { tables, updateTablesFromAI } = useStore();

  // Resizable sidebar
  const { width, isResizing, handleMouseDown, resetWidth } = useResizable({
    storageKey: SIDEBAR_CONFIG.storageKey,
    defaultWidth: SIDEBAR_CONFIG.defaultWidth,
    minWidth: SIDEBAR_CONFIG.minWidth,
    maxWidth: SIDEBAR_CONFIG.maxWidth,
    side: 'right',
  });
  const [aiProvider, setAiProvider] = useLocalStorage<'openai' | 'google'>(
    'ai-provider',
    'openai',
  );
  const [openaiApiKey] = useLocalStorage<string>('ai-openai-key', '');
  const [googleApiKey] = useLocalStorage<string>('ai-google-key', '');
  const [openaiModel, setOpenaiModel] = useLocalStorage<string>(
    'ai-openai-model',
    'gpt-4o-mini',
  );
  const [googleModel, setGoogleModel] = useLocalStorage<string>(
    'ai-google-model',
    'gemini-1.5-pro-latest',
  );

  // Load models from local storage
  const [openaiModels] = useLocalStorage<Model[]>('ai-openai-models', []);
  const [googleModels] = useLocalStorage<Model[]>('ai-google-models', []);
  const [customOpenaiModels] = useLocalStorage<string[]>(
    'ai-custom-openai-models',
    [],
  );
  const [customGoogleModels] = useLocalStorage<string[]>(
    'ai-custom-google-models',
    [],
  );

  // Operation history for undo/redo
  const [operationHistory, setOperationHistory] = useState<OperationRecord[]>(
    [],
  );
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Chat history state
  const [showHistory, setShowHistory] = useState(false);

  // Initialize chat history
  const chatHistory = useChatHistory();

  // Combine and unify models
  const allModels = useMemo(() => {
    const models: UnifiedModel[] = [];

    // OpenAI Models
    const openAI = openaiModels.filter((m) => m.enabled !== false);
    customOpenaiModels.forEach((m) => {
      if (!openAI.find((existing) => existing.id === m)) {
        openAI.push({ id: m, name: m, enabled: true });
      }
    });
    if (openAI.length === 0) {
      openAI.push({ id: 'gpt-4o-mini', name: 'GPT-4o mini', enabled: true });
      openAI.push({ id: 'gpt-4o', name: 'GPT-4o', enabled: true });
    }
    openAI.forEach((m) => models.push({ ...m, provider: 'openai' }));

    // Google Models
    const google = googleModels.filter((m) => m.enabled !== false);
    customGoogleModels.forEach((m) => {
      if (!google.find((existing) => existing.id === m)) {
        google.push({ id: m, name: m, enabled: true });
      }
    });
    if (google.length === 0) {
      google.push({
        id: 'gemini-1.5-pro-latest',
        name: 'Gemini 1.5 Pro',
        enabled: true,
      });
      google.push({
        id: 'gemini-1.5-flash-latest',
        name: 'Gemini 1.5 Flash',
        enabled: true,
      });
      google.push({
        id: 'gemini-2.0-flash-thinking-exp-01-21',
        name: 'Gemini 2.0 Flash Thinking',
        enabled: true,
      });
    }
    google.forEach((m) => models.push({ ...m, provider: 'google' }));

    return models;
  }, [openaiModels, googleModels, customOpenaiModels, customGoogleModels]);

  const currentModel = useMemo(() => {
    return (
      allModels.find(
        (m) =>
          m.id === (aiProvider === 'openai' ? openaiModel : googleModel) &&
          m.provider === aiProvider,
      ) || allModels[0]
    );
  }, [allModels, aiProvider, openaiModel, googleModel]);

  const handleModelChange = (modelId: string) => {
    const model = allModels.find((m) => m.id === modelId);
    if (!model) return;
    setAiProvider(model.provider);
    if (model.provider === 'openai') {
      setOpenaiModel(model.id);
    } else {
      setGoogleModel(model.id);
    }
  };

  const setIsOpen = (value: boolean) => {
    onOpenChange?.(value);
  };

  // Get current schema for the API
  const listOfTables = useMemo(() => {
    // Return tables object map to preserve IDs and state on server round-trip
    if (Object.keys(tables).length > 0) {
      return tables;
    }

    // Fallback for empty state
    return {
      'users-default-id': {
        title: 'users',
        columns: [
          { title: 'id', format: 'uuid', type: 'string' },
          { title: 'email', format: 'email', type: 'string' },
        ],
      },
    };
  }, [tables]);

  // Ref to store the latest callbacks to avoid stale closures
  const callbacksRef = useRef({
    updateTablesFromAI,
    setOperationHistory,
    setHistoryIndex,
  });
  callbacksRef.current = {
    updateTablesFromAI,
    setOperationHistory,
    setHistoryIndex,
  };

  // Handle data parts from the stream - called via custom fetch handler
  const handleDataPart = useCallback((type: string, data: unknown) => {
    const { updateTablesFromAI, setOperationHistory, setHistoryIndex } =
      callbacksRef.current;

    switch (type) {
      case 'data-tables-batch': {
        const batchData = data as StreamingTablesBatch;
        // Always apply table updates when isComplete is true (final state)
        // or when there are tables to update (intermediate updates)
        if (batchData.tables !== undefined) {
          const tableCount = Object.keys(batchData.tables).length;

          // Apply updates for:
          // 1. Final complete state (even if empty - e.g., all tables dropped)
          // 2. Intermediate updates with actual tables
          if (batchData.isComplete || tableCount > 0) {
            updateTablesFromAI(batchData.tables);

            if (batchData.isComplete) {
              if (tableCount > 0) {
                toast.success('Schema Updated', {
                  description: `Updated ${tableCount} tables`,
                });
              } else {
                toast.success('Schema Cleared', {
                  description: 'All tables have been removed',
                });
              }
            }
          }
        }
        break;
      }
      case 'data-notification': {
        const notificationData = data as StreamingNotification;
        if (notificationData.level === 'success') {
          toast.success('Success', { description: notificationData.message });
        } else if (notificationData.level === 'error') {
          toast.error('Error', { description: notificationData.message });
        }
        break;
      }
      case 'data-operation-history': {
        const historyData = data as StreamingOperationHistory;
        if (historyData.operations) {
          setOperationHistory((prev) => [...prev, ...historyData.operations]);
          setHistoryIndex((prev) => prev + historyData.operations.length);
        }
        break;
      }
    }
  }, []);

  // Store handleDataPart in a ref for access in fetch handler
  const handleDataPartRef = useRef(handleDataPart);
  handleDataPartRef.current = handleDataPart;

  // Create transport with custom fetch to intercept data parts and pass body
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: '/api/chat',
      body: {
        provider: aiProvider === 'google' ? 'google' : 'openai',
        apiKey: aiProvider === 'google' ? googleApiKey : openaiApiKey,
        model: aiProvider === 'google' ? googleModel : openaiModel,
        schema: listOfTables,
      },
      fetch: async (url, options) => {
        const response = await fetch(url, options);

        if (!response.body) {
          return response;
        }

        // Create a transform stream to intercept data parts
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const stream = new ReadableStream({
          async start(controller) {
            const dispatchDataParts = (payload: any) => {
              const items = Array.isArray(payload) ? payload : [payload];
              for (const item of items) {
                if (item && typeof item === 'object' && 'type' in item) {
                  const partType = item.type as string;
                  if (partType.startsWith('data-')) {
                    handleDataPartRef.current(partType, item.data);
                  }
                }
              }
            };

            const processLine = (line: string) => {
              const trimmed = line.trim();
              if (!trimmed) return;

              let jsonStr = '';
              if (trimmed.startsWith('data: ')) {
                jsonStr = trimmed.slice(6);
                if (jsonStr === '[DONE]') return;
              } else if (trimmed.startsWith('2:') || trimmed.startsWith('g:')) {
                jsonStr = trimmed.slice(2);
              }

              if (jsonStr) {
                try {
                  dispatchDataParts(JSON.parse(jsonStr));
                } catch {
                  // Skip invalid JSON
                }
              }
            };

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  if (buffer) {
                    processLine(buffer);
                  }
                  controller.close();
                  break;
                }

                // Pass through the chunk
                controller.enqueue(value);

                // Also parse and handle data parts
                const text = decoder.decode(value, { stream: true });
                buffer += text;
                const lines = buffer.split('\n');

                // Keep the last part in buffer as it might be incomplete
                buffer = lines.pop() || '';

                for (const line of lines) {
                  processLine(line);
                }
              }
            } catch (error) {
              controller.error(error);
            }
          },
        });

        return new Response(stream, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      },
    });
  }, [
    aiProvider,
    googleApiKey,
    openaiApiKey,
    googleModel,
    openaiModel,
    listOfTables,
  ]);

  // Create useChat instance with transport
  // Use currentThreadId as the chat ID so each thread has its own chat instance
  const chat = useChat({
    id: chatHistory.currentThreadId || 'default',
    transport,
  });

  // Store chat.setMessages in a ref for use in handlers
  const setMessagesRef = useRef(chat.setMessages);
  setMessagesRef.current = chat.setMessages;

  // Create runtime using useAISDKRuntime with direct useChat access
  // @ts-ignore
  const runtime = useAISDKRuntime(chat);

  // Handle message updates from the Thread
  const handleMessagesChange = useCallback(
    (messages: ThreadMessage[]) => {
      if (!chatHistory.isInitialized || !chatHistory.currentThreadId) return;

      // Only save when the last assistant message is complete (not streaming)
      // This prevents saving incomplete messages with empty content
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        // Check if the message is still being generated
        const status = lastMessage.status;
        if (status?.type === 'running' || status?.type === 'requires-action') {
          // Still streaming, don't save yet
          return;
        }

        // Check if assistant message has actual content
        const hasContent = lastMessage.content.some(
          (part) =>
            part.type === 'text' &&
            (part as { type: 'text'; text: string }).text.trim().length > 0,
        );
        if (!hasContent) {
          // No content yet, don't save
          return;
        }
      }

      // Save thread with current messages
      chatHistory.saveCurrentThread(
        messages,
        aiProvider,
        aiProvider === 'google' ? googleModel : openaiModel,
      );
    },
    [chatHistory, aiProvider, googleModel, openaiModel],
  );

  // Create new thread when sidebar opens if no current thread
  useEffect(() => {
    if (isOpen && !chatHistory.currentThreadId && chatHistory.isInitialized) {
      // Check if we have any threads in history
      if (chatHistory.threads.length > 0) {
        // Load the most recent thread
        const recentThreadId = chatHistory.threads[0].id;
        chatHistory.loadThread(recentThreadId).then((thread) => {
          if (thread && thread.messages && thread.messages.length > 0) {
            // Convert to ThreadMessageLike format
            const messagesToLoad = thread.messages.map((msg) => {
              const textParts = msg.content
                .filter(
                  (part): part is { type: 'text'; text: string } =>
                    part.type === 'text',
                )
                .map((part) => ({ type: 'text' as const, text: part.text }));

              const msgAny = msg as any;
              if (textParts.length === 0 && msgAny.parts) {
                const partsContent = msgAny.parts
                  .filter((p: any) => p.type === 'text' && p.text)
                  .map((p: any) => ({ type: 'text' as const, text: p.text }));
                if (partsContent.length > 0) {
                  textParts.push(...partsContent);
                }
              }

              return {
                id: msg.id,
                role: msg.role as 'user' | 'assistant' | 'system',
                content:
                  textParts.length > 0
                    ? textParts
                    : [{ type: 'text' as const, text: ' ' }],
                createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
                // Always mark loaded messages as complete
                ...(msg.role === 'assistant' && {
                  status: { type: 'complete' as const },
                }),
              };
            });

            // Convert to UIMessage format and set via AI SDK
            const uiMessages: UIMessage[] = messagesToLoad.map((msg) => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant' | 'system',
              content: '',
              parts: msg.content.map((part) => ({
                type: 'text' as const,
                text: (part as { type: 'text'; text: string }).text,
              })),
              createdAt: msg.createdAt,
            }));
            setMessagesRef.current(uiMessages);
          }
        });
      } else {
        // Create a new thread if no history exists
        chatHistory.createNewThread();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, chatHistory.isInitialized]);

  // Chat history handlers
  const handleNewThread = useCallback(() => {
    // Clear messages via AI SDK setMessages
    setMessagesRef.current([]);
    // Create new thread ID in chat history
    chatHistory.createNewThread();
    // Go back to chat view
    setShowHistory(false);
  }, [chatHistory]);

  useHotkeys(
    ['meta+n', 'ctrl+n'],
    (e) => {
      e.preventDefault();
      if (isOpen) {
        handleNewThread();
      }
    },
    { enableOnFormTags: true, preventDefault: true },
    [isOpen, handleNewThread],
  );

  const handleSelectThread = useCallback(
    async (threadId: string) => {
      console.log('[handleSelectThread] Loading thread:', threadId);
      const thread = await chatHistory.loadThread(threadId);
      console.log('[handleSelectThread] Loaded thread:', thread);

      if (thread && thread.messages && thread.messages.length > 0) {
        // Update the current thread ID in chat history state
        chatHistory.setCurrentThreadId(threadId);

        // Convert ThreadMessage[] to ThreadMessageLike[] format for runtime.thread.reset()
        // The format is: { id, role, content: [{type, text}], createdAt, status? }
        const messagesToLoad = thread.messages.map((msg) => {
          // Extract text content from the content array
          const textParts = msg.content
            .filter(
              (part): part is { type: 'text'; text: string } =>
                part.type === 'text',
            )
            .map((part) => ({ type: 'text' as const, text: part.text }));

          // For assistant messages with empty content, check if there's parts data
          // Also handle messages that might have 'parts' instead of 'content'
          const msgAny = msg as any;
          if (textParts.length === 0 && msgAny.parts) {
            const partsContent = msgAny.parts
              .filter((p: any) => p.type === 'text' && p.text)
              .map((p: any) => ({ type: 'text' as const, text: p.text }));
            if (partsContent.length > 0) {
              textParts.push(...partsContent);
            }
          }

          return {
            id: msg.id,
            role: msg.role as 'user' | 'assistant' | 'system',
            content:
              textParts.length > 0
                ? textParts
                : [{ type: 'text' as const, text: ' ' }], // Fallback to space to avoid empty
            createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
            // Always mark loaded messages as complete - they were saved after completion
            ...(msg.role === 'assistant' && {
              status: { type: 'complete' as const },
            }),
          };
        });

        console.log('[handleSelectThread] Messages to load:', messagesToLoad);

        // Convert messages to AI SDK UIMessage format
        const uiMessages: UIMessage[] = messagesToLoad.map((msg) => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: '',
          parts: msg.content.map((part) => ({
            type: 'text' as const,
            text: (part as { type: 'text'; text: string }).text,
          })),
          createdAt: msg.createdAt,
        }));

        console.log('[handleSelectThread] Setting UIMessages:', uiMessages);

        // Clear messages first, then set new messages after a tick
        // This forces a clean slate before loading the new thread
        chat.setMessages([]);

        // Use requestAnimationFrame to ensure the clear has been processed
        requestAnimationFrame(() => {
          chat.setMessages(uiMessages);
        });
      } else {
        console.log(
          '[handleSelectThread] No messages to load, creating new thread',
        );
        // If no messages, clear messages for new thread
        setMessagesRef.current([]);
        chatHistory.setCurrentThreadId(threadId);
      }
      setShowHistory(false);
    },
    [chatHistory, chat],
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      await chatHistory.deleteThread(threadId);
    },
    [chatHistory],
  );

  // Undo/Redo handlers
  const canUndo = historyIndex >= 0;
  const canRedo =
    historyIndex < operationHistory.length - 1 && operationHistory.length > 0;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const operation = operationHistory[historyIndex];
    const newTables = { ...tables };

    if (operation.before) {
      Object.entries(operation.before).forEach(([id, table]) => {
        if (table === null) {
          delete newTables[id];
        } else {
          const originalId = Object.keys(tables).find(
            (key) => tables[key].title === (table as Table).title,
          );
          if (originalId) {
            newTables[originalId] = table as Table;
          } else {
            newTables[id] = table as Table;
          }
        }
      });
    }

    updateTablesFromAI(newTables);
    setHistoryIndex((prev) => prev - 1);
    toast.info('Undo', { description: 'Reverted last operation' });
  }, [canUndo, historyIndex, operationHistory, tables, updateTablesFromAI]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const operation = operationHistory[historyIndex + 1];
    const newTables = { ...tables };

    if (operation.after) {
      Object.entries(operation.after).forEach(([id, table]) => {
        if (table === null) {
          const originalId = Object.keys(tables).find(
            (key) => tables[key].title === id,
          );
          if (originalId) {
            delete newTables[originalId];
          }
        } else {
          newTables[id] = table as Table;
        }
      });
    }

    updateTablesFromAI(newTables);
    setHistoryIndex((prev) => prev + 1);
    toast.info('Redo', { description: 'Reapplied operation' });
  }, [canRedo, historyIndex, operationHistory, tables, updateTablesFromAI]);

  return (
    <div
      className={cn(
        'fixed inset-y-0 right-0 z-[60] bg-background border-l shadow-2xl flex flex-col transition-transform duration-300',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle */}
      <ResizeHandle
        side="left"
        isResizing={isResizing}
        onMouseDown={handleMouseDown}
        onDoubleClick={resetWidth}
      />
      <AssistantRuntimeProvider runtime={runtime}>
        <MessageTracker onMessagesChange={handleMessagesChange}>
          <TooltipProvider>
            {showHistory ? (
              <ChatHistory
                threads={chatHistory.threads}
                recentThreads={chatHistory.recentThreads}
                currentThreadId={chatHistory.currentThreadId}
                isLoading={chatHistory.isLoading}
                onSelectThread={handleSelectThread}
                onDeleteThread={handleDeleteThread}
                onNewThread={handleNewThread}
                onSearch={chatHistory.searchThreads}
                onClearHistory={chatHistory.clearHistory}
                onBack={() => setShowHistory(false)}
                groupThreadsByTime={chatHistory.groupThreadsByTime}
              />
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b min-h-[50px]">
                  <div className="flex items-center gap-2 px-2">
                    <Sparkles className="size-4 text-primary" />
                    <span className="font-semibold text-sm">Assistant</span>
                    <Badge
                      variant="outline"
                      className="ml-1 h-5 px-1.5 text-[10px] font-normal text-muted-foreground bg-muted/50"
                    >
                      {aiProvider === 'google' ? 'Gemini' : 'OpenAI'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-0.5">
                    {/* New Chat */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={handleNewThread}
                        >
                          <Plus className="size-4 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        New Chat{' '}
                        <span className="text-muted-foreground ml-1 text-xs">
                          ⌘N
                        </span>
                      </TooltipContent>
                    </Tooltip>

                    {/* History Button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setShowHistory(true)}
                        >
                          <History className="size-4 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Chat History</TooltipContent>
                    </Tooltip>

                    {/* Undo/Redo */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={handleUndo}
                          disabled={!canUndo}
                        >
                          <Undo2 className="size-4 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Undo</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={handleRedo}
                          disabled={!canRedo}
                        >
                          <Redo2 className="size-4 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Redo</TooltipContent>
                    </Tooltip>

                    <div className="w-px h-4 bg-border mx-1" />

                    {/* Close */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setIsOpen(false)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>

                {/* Assistant UI Thread */}
                <div className="flex-1 overflow-hidden bg-background">
                  <Thread
                    models={allModels}
                    currentModel={currentModel}
                    onModelChange={handleModelChange}
                  />
                </div>
              </>
            )}
          </TooltipProvider>
        </MessageTracker>
      </AssistantRuntimeProvider>
    </div>
  );
}

export default AssistantSidebar;
