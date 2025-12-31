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
import { useState, useMemo, useCallback, useRef } from 'react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';

// ** import utils
import { useStore } from '@/lib/store';
import { useLocalStorage } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ** import ui components
import { Button } from '@/components/ui/button';
import { X, Undo2, Redo2, History, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// ** import assistant-ui components
import { Thread } from '@/components/assistant-ui/thread';

interface AssistantSidebarProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

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
    const authUserTable = {
      title: 'users',
      columns: [
        { title: 'id', format: 'uuid', type: 'string' },
        { title: 'email', format: 'email', type: 'string' },
      ],
    };
    const hasRealTables = Object.keys(tables).length > 0;
    const tablesList = hasRealTables
      ? Object.values(tables).map((t) => ({
          title: t.title,
          columns: t.columns,
        }))
      : [authUserTable];
    return tablesList;
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
        if (batchData.tables && Object.keys(batchData.tables).length > 0) {
          updateTablesFromAI(batchData.tables);
          if (batchData.isComplete) {
            toast.success('Schema Updated', {
              description: `Updated ${Object.keys(batchData.tables).length} tables`,
            });
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

  // Store handleDataPart in a ref for access in transport
  const handleDataPartRef = useRef(handleDataPart);
  handleDataPartRef.current = handleDataPart;

  // Create transport with custom fetch to intercept data parts
  const transport = useMemo(() => {
    return new AssistantChatTransport({
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

        const stream = new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  controller.close();
                  break;
                }

                // Pass through the chunk
                controller.enqueue(value);

                // Also parse and handle data parts
                const text = decoder.decode(value, { stream: true });
                const lines = text.split('\n');

                for (const line of lines) {
                  // Look for data-* type lines (AI SDK stream format)
                  if (line.startsWith('g:')) {
                    try {
                      // Parse the JSON after "g:"
                      const jsonStr = line.slice(2);
                      const parsed = JSON.parse(jsonStr);

                      // Check if it's a data part
                      if (
                        parsed &&
                        typeof parsed === 'object' &&
                        'type' in parsed
                      ) {
                        const partType = parsed.type as string;
                        if (partType.startsWith('data-')) {
                          handleDataPartRef.current(partType, parsed.data);
                        }
                      }
                    } catch {
                      // Not valid JSON, skip
                    }
                  }
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

  // Create runtime using assistant-ui's native hook
  const runtime = useChatRuntime({
    transport,
  });

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

  const clearHistory = useCallback(() => {
    setOperationHistory([]);
    setHistoryIndex(-1);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-[400px] min-w-[320px] max-w-[90vw] bg-background border-l shadow-2xl flex flex-col sm:max-w-[50vw]">
      <TooltipProvider>
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

            {/* History */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={operationHistory.length === 0}
                >
                  <History className="size-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end">
                <div className="flex items-center justify-between p-2 border-b bg-muted/30">
                  <span className="text-xs font-medium">History</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearHistory}
                    className="h-5 text-[10px] px-2"
                  >
                    Clear
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {operationHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No operations yet
                    </p>
                  ) : (
                    operationHistory.map((op, i) => (
                      <div
                        key={op.id}
                        className={cn(
                          'text-xs p-2 rounded flex flex-col gap-0.5',
                          i === historyIndex
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted text-muted-foreground',
                        )}
                      >
                        <span className="font-medium">
                          {i === historyIndex && 'Current: '}
                          {Object.keys(op.before || {}).length > 0
                            ? 'Schema Update'
                            : 'Operation'}
                        </span>
                        <span className="text-[10px] opacity-70">
                          {new Date(op.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

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
          <AssistantRuntimeProvider runtime={runtime}>
            <Thread
              models={allModels}
              currentModel={currentModel}
              onModelChange={handleModelChange}
            />
          </AssistantRuntimeProvider>
        </div>
      </TooltipProvider>
    </div>
  );
}

export default AssistantSidebar;
