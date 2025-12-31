'use client';

// ** import types
import type {
  Table,
  StreamingProgress,
  StreamingTablesBatch,
  StreamingNotification,
  StreamingOperationHistory,
  OperationRecord,
} from '@/lib/types';

// ** import core packages
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

// ** import utils
import { useStore } from '@/lib/store';
import { useLocalStorage } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ** import ui components
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  X,
  ArrowUp,
  ArrowDown,
  Paperclip,
  Trash2,
  Check,
  CheckCircle2,
  Loader2,
  Table2,
  Columns,
  Edit3,
  CircleMinus,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Wand2,
  Database,
  Zap,
  Search,
  List,
  StopCircle,
  Bot,
  User,
  Copy,
  ExternalLink,
  Undo2,
  Redo2,
  History,
} from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownText } from '@/components/ui/markdown-text';
import { Reasoning } from '@/components/assistant-ui/reasoning';

// Helper to transform JSON-like responses from Gemini 3 to natural language
// Gemini 3 preview often outputs JSON arrays despite system prompt instructions
const transformJsonToNaturalLanguage = (text: string): string => {
  if (!text) return text;
  const trimmed = text.trim();

  // Detect JSON array like ["table1", "table2", ...]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === 'string')
      ) {
        if (parsed.length === 0) {
          return 'There are no tables in the database.';
        }
        return `The tables in the database are: ${parsed.join(', ')}.`;
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }

  // Detect JSON object like {"tables": ["table1", ...]}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.tables && Array.isArray(parsed.tables)) {
        if (parsed.tables.length === 0) {
          return 'There are no tables in the database.';
        }
        return `The tables in the database are: ${parsed.tables.join(', ')}.`;
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }

  return text;
};

interface ChatSidebarProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface Model {
  id: string;
  name: string;
  enabled?: boolean;
}

// Suggestions for empty state (assistant-ui style)
const SUGGESTIONS = [
  {
    title: 'Create a blog schema',
    prompt: 'Create a blog with users, posts, and comments tables',
    icon: Database,
    description: 'Set up a complete blog database',
  },
  {
    title: 'Add timestamps',
    prompt: 'Add created_at and updated_at columns to all tables',
    icon: Zap,
    description: 'Track record creation and updates',
  },
  {
    title: 'E-commerce schema',
    prompt: 'Create tables for products, orders, customers, and order_items',
    icon: Table2,
    description: 'Build an online store database',
  },
  {
    title: 'List all tables',
    prompt: 'Show me all the tables in my schema with their columns',
    icon: List,
    description: 'View your current schema',
  },
] as const;

// Copy button with feedback
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 text-muted-foreground hover:text-foreground',
            className,
          )}
          onClick={handleCopy}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {copied ? 'Copied!' : 'Copy'}
      </TooltipContent>
    </Tooltip>
  );
}

// Collapsible Tool Result Component
function ToolResult({ tool }: { tool: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isComplete = !!tool.result;
  const output = tool.result || tool.output;
  const isSuccess = output?.ok !== false;

  // Get icon based on tool name
  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'createTable':
        return <Table2 size={14} className="text-emerald-500" />;
      case 'dropTable':
        return <CircleMinus size={14} className="text-red-500" />;
      case 'renameTable':
        return <ArrowRightLeft size={14} className="text-blue-500" />;
      case 'addColumn':
        return <Columns size={14} className="text-emerald-500" />;
      case 'dropColumn':
        return <CircleMinus size={14} className="text-orange-500" />;
      case 'alterColumn':
        return <Edit3 size={14} className="text-amber-500" />;
      case 'listTables':
      case 'getTableDetails':
        return <Search size={14} className="text-blue-500" />;
      case 'listSchemas':
        return <List size={14} className="text-purple-500" />;
      default:
        return <Wand2 size={14} className="text-muted-foreground" />;
    }
  };

  // Format tool output for display
  const getToolSummary = (toolName: string, output: any) => {
    if (!output) return null;
    switch (toolName) {
      case 'createTable':
        return output.table ? (
          <span className="text-muted-foreground">
            {output.table.id} ({output.table.columnCount} columns)
          </span>
        ) : null;
      case 'addColumn':
        return output.column ? (
          <span className="text-muted-foreground">
            {output.column} ({output.tableColumnCount} total)
          </span>
        ) : null;
      case 'dropTable':
        return output.remainingTables !== undefined ? (
          <span className="text-muted-foreground">
            {output.remainingTables} tables remaining
          </span>
        ) : null;
      case 'listTables':
        return output.total !== undefined ? (
          <span className="text-muted-foreground">
            Found {output.total} table{output.total !== 1 ? 's' : ''}
          </span>
        ) : null;
      case 'listSchemas':
        return output.total !== undefined ? (
          <span className="text-muted-foreground">
            Found {output.total} schema{output.total !== 1 ? 's' : ''}
          </span>
        ) : null;
      default:
        return output.message ? (
          <span className="text-muted-foreground truncate max-w-[150px]">
            {output.message}
          </span>
        ) : null;
    }
  };

  // Get detailed output for expanded view
  const getDetailedOutput = (toolName: string, output: any) => {
    if (!output) return null;

    // For list operations, show the items
    if (toolName === 'listTables' && output.tables) {
      return (
        <div className="space-y-1">
          {output.tables.slice(0, 10).map((t: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Table2 size={12} className="text-muted-foreground" />
              <span>{t.id || t.title}</span>
              {t.columnCount && (
                <Badge variant="outline" className="text-[10px] h-4">
                  {t.columnCount} cols
                </Badge>
              )}
            </div>
          ))}
          {output.tables.length > 10 && (
            <span className="text-xs text-muted-foreground">
              ...and {output.tables.length - 10} more
            </span>
          )}
        </div>
      );
    }

    if (toolName === 'createTable' && output.table?.columns) {
      return (
        <div className="space-y-1">
          {output.table.columns.slice(0, 8).map((col: string, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Columns size={12} className="text-muted-foreground" />
              <span>{col}</span>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  const detailedOutput = getDetailedOutput(tool.toolName, output);
  const hasDetails = !!detailedOutput;

  return (
    <div
      className={cn(
        'rounded-lg transition-all duration-200',
        isComplete
          ? isSuccess
            ? 'bg-emerald-500/5 border border-emerald-500/20'
            : 'bg-red-500/5 border border-red-500/20'
          : 'bg-muted/40 border border-border/50',
      )}
    >
      <button
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
        disabled={!hasDetails}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 text-left',
          hasDetails && 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5',
          !hasDetails && 'cursor-default',
        )}
      >
        {isComplete ? (
          isSuccess ? (
            <CheckCircle2
              size={14}
              className="text-emerald-500 flex-shrink-0"
            />
          ) : (
            <X size={14} className="text-red-500 flex-shrink-0" />
          )
        ) : (
          <Loader2
            size={14}
            className="text-primary animate-spin flex-shrink-0"
          />
        )}
        {getToolIcon(tool.toolName)}
        <span className="font-medium text-xs text-foreground">
          {tool.toolName}
        </span>
        {getToolSummary(tool.toolName, output)}
        {!isComplete && (
          <span className="text-muted-foreground animate-pulse ml-auto text-xs">
            running...
          </span>
        )}
        {hasDetails && isComplete && (
          <span className="ml-auto">
            {isExpanded ? (
              <ChevronUp size={14} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={14} className="text-muted-foreground" />
            )}
          </span>
        )}
      </button>
      {isExpanded && detailedOutput && (
        <div className="px-3 pb-2 pt-1 border-t border-border/30">
          {detailedOutput}
        </div>
      )}
    </div>
  );
}

export function ChatSidebar({
  isOpen = false,
  onOpenChange,
}: ChatSidebarProps) {
  const { tables, updateTablesFromAI, supabaseApiKey } = useStore();
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

  // Combine built-in (if fetched) + custom + default fallback
  const availableOpenaiModels = useMemo(() => {
    // Filter out disabled models
    const models = openaiModels.filter((m) => m.enabled !== false);

    // Add custom models
    customOpenaiModels.forEach((m) => {
      if (!models.find((existing) => existing.id === m)) {
        models.push({ id: m, name: m, enabled: true });
      }
    });
    // Ensure default exists if list is empty
    if (models.length === 0) {
      models.push({ id: 'gpt-4o-mini', name: 'GPT-4o mini', enabled: true });
      models.push({ id: 'gpt-4o', name: 'GPT-4o', enabled: true });
    }
    return models;
  }, [openaiModels, customOpenaiModels]);

  const availableGoogleModels = useMemo(() => {
    const models = googleModels.filter((m) => m.enabled !== false);

    customGoogleModels.forEach((m) => {
      if (!models.find((existing) => existing.id === m)) {
        models.push({ id: m, name: m, enabled: true });
      }
    });
    if (models.length === 0) {
      models.push({
        id: 'gemini-1.5-pro-latest',
        name: 'Gemini 1.5 Pro',
        enabled: true,
      });
      models.push({
        id: 'gemini-1.5-flash-latest',
        name: 'Gemini 1.5 Flash',
        enabled: true,
      });
      models.push({
        id: 'gemini-2.0-flash-thinking-exp-01-21',
        name: 'Gemini 2.0 Flash Thinking',
        enabled: true,
      });
    }
    return models;
  }, [googleModels, customGoogleModels]);

  const setIsOpen = (value: boolean) => {
    onOpenChange?.(value);
  };

  // Manage input state manually (AI SDK 5 pattern)
  const [input, setInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Streaming progress state
  const [streamingProgress, setStreamingProgress] =
    useState<StreamingProgress | null>(null);

  // Operation history for undo/redo (Phase 5.2)
  const [operationHistory, setOperationHistory] = useState<OperationRecord[]>(
    [],
  );
  const [historyIndex, setHistoryIndex] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track if user is at bottom of scroll
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Handle scroll to detect if at bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const atBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsAtBottom(atBottom);
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Create transport with configuration (without schema - it's passed per message)
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: {
          provider: aiProvider === 'google' ? 'google' : 'openai',
          apiKey: aiProvider === 'google' ? googleApiKey : openaiApiKey,
          model: aiProvider === 'google' ? googleModel : openaiModel,
          // schema is NOT included here - it's passed per message to avoid stale state
        },
      }),
    [aiProvider, googleApiKey, openaiApiKey, googleModel, openaiModel],
  );

  // Log schema sent to API for debugging
  useEffect(() => {
    console.log(
      '[ChatSidebar] Current tables state:',
      Object.keys(tables).length,
      'tables',
    );
  }, [tables]);

  // Handler for streaming data parts (called as chunks arrive)
  // Using 'any' type because AI SDK's onData callback receives unknown data structure
  const handleStreamingData = useCallback(
    (dataPart: { type: string; id?: string; data: unknown }) => {
      console.log('[onData] Received streaming data:', dataPart.type);

      switch (dataPart.type) {
        case 'data-progress': {
          const progressData = dataPart.data as StreamingProgress;
          setStreamingProgress(progressData);
          console.log('[onData] Progress:', progressData.message);
          break;
        }

        case 'data-tables-batch': {
          const batchData = dataPart.data as StreamingTablesBatch;
          console.log(
            `[onData] Tables batch ${batchData.batchNumber}:`,
            Object.keys(batchData.tables).length,
            'tables, complete:',
            batchData.isComplete,
          );

          // Apply tables when complete OR when there are tables to update
          // IMPORTANT: Must apply even when empty (for delete all operations)
          if (
            batchData.isComplete ||
            Object.keys(batchData.tables).length > 0
          ) {
            updateTablesFromAI(batchData.tables);

            if (batchData.isComplete) {
              const tableCount = Object.keys(batchData.tables).length;
              toast.success('Schema updated', {
                description: `${tableCount} table${tableCount === 1 ? '' : 's'} in workspace`,
              });
            }
          }
          break;
        }

        case 'data-notification': {
          const notificationData = dataPart.data as StreamingNotification;
          console.log(
            '[onData] Notification:',
            notificationData.level,
            notificationData.message,
          );

          // Show notifications as toasts based on level
          if (notificationData) {
            switch (notificationData.level) {
              case 'success':
                toast.success(notificationData.message);
                break;
              case 'error':
                toast.error(notificationData.message);
                break;
              case 'warning':
                toast.warning(notificationData.message);
                break;
              default:
                toast.info(notificationData.message);
            }
          }
          break;
        }

        // Phase 5.2 - Operation History for Undo/Redo support
        case 'data-operation-history': {
          const historyData = dataPart.data as StreamingOperationHistory;
          console.log(
            '[onData] Operation history received:',
            historyData.operations.length,
            'operations, canUndo:',
            historyData.canUndo,
          );
          // Store operation history for undo/redo
          setOperationHistory((prev) => [...prev, ...historyData.operations]);
          setHistoryIndex((prev) => prev + historyData.operations.length);
          break;
        }
      }
    },
    [updateTablesFromAI],
  );

  // Use Vercel AI SDK 6's useChat hook with stop function for cancellation (Phase 5.1)
  const { messages, sendMessage, status, setMessages, stop } = useChat({
    id: 'sql-assistant',
    transport,
    // Handle streaming data parts as they arrive
    onData: handleStreamingData,
    onFinish: ({ message }) => {
      // Clear streaming progress when finished
      setStreamingProgress(null);
      // Debug: Log all part types for reasoning debugging
      const reasoningParts = message.parts.filter(
        (p: any) => p.type === 'reasoning',
      );
      console.log('[onFinish] Processing message:', {
        id: message.id,
        role: message.role,
        partCount: message.parts.length,
        partTypes: message.parts.map((p: any) => p.type),
        reasoningPartsCount: reasoningParts.length,
        reasoningTexts: reasoningParts.map((p: any) =>
          p.text?.substring(0, 100),
        ),
      });

      let toolsExecuted = 0;
      let schemaModifyingTools = 0;

      // Atomic schema-modifying tools
      const schemaTools = [
        'createTable',
        'dropTable',
        'renameTable',
        'addColumn',
        'dropColumn',
        'alterColumn',
      ];

      message.parts.forEach((part: any, index: number) => {
        // Check if this is any tool call
        if (part.type?.startsWith('tool-')) {
          toolsExecuted++;

          // Extract tool name from type (e.g., "tool-createTable" -> "createTable")
          const toolName = part.type.replace('tool-', '');
          const isSchemaModifyingTool = schemaTools.includes(toolName);

          if (isSchemaModifyingTool) {
            schemaModifyingTools++;
          }

          console.log(`[onFinish] Tool ${toolsExecuted} (Part ${index}):`, {
            type: part.type,
            toolName,
            isSchemaModifying: isSchemaModifyingTool,
            state: part.state,
            hasOutput: !!part.output,
            hasResult: !!part.result,
          });

          // Handle output from atomic tools
          const output = part.output || part.result;
          if (output && typeof output === 'object') {
            console.log(`[onFinish] Tool output:`, {
              ok: output.ok,
              message: output.message,
            });
          }
        }
      });

      console.log('[onFinish] Summary:', {
        totalToolsExecuted: toolsExecuted,
        schemaModifyingTools,
        finalTableCount: Object.keys(tables).length,
      });

      // Note: Schema updates are now handled by onData (streaming data-tables-batch)
      // The onFinish handler just logs completion
      if (schemaModifyingTools > 0) {
        console.log(
          `[onFinish] ✅ ${schemaModifyingTools} schema operation(s) completed - updates handled via streaming`,
        );
      }
    },
    onError: (error) => {
      // Clear streaming progress on error
      setStreamingProgress(null);
      console.error('Chat error:', error);
      toast.error('Assistant request failed', {
        description: error.message,
      });
    },
  });

  // Compute isLoading from status
  const isLoading = status === 'streaming' || status === 'submitted';

  // Auto-scroll when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isLoading, isAtBottom, scrollToBottom]);

  // Cancel handler (Phase 5.1 - Cancellation Support)
  const handleCancel = useCallback(() => {
    console.log('[ChatSidebar] User cancelled operation');
    stop();
    setStreamingProgress(null);
    toast.info('Operation cancelled');
  }, [stop]);

  // Undo/Redo handlers (Phase 5.2)
  const canUndo = historyIndex >= 0 && operationHistory.length > 0;
  const canRedo =
    historyIndex < operationHistory.length - 1 && operationHistory.length > 0;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;

    const operation = operationHistory[historyIndex];
    const newTables = { ...tables };

    // Handle different operation types
    switch (operation.type) {
      case 'createTable':
        // Undo create = delete the table
        delete newTables[operation.tableId];
        break;
      case 'dropTable':
        // Undo drop = restore the table (before state)
        if (operation.before) {
          newTables[operation.tableId] = operation.before;
        }
        break;
      case 'renameTable':
        // Undo rename = restore old table ID with before state
        if (operation.before) {
          // Find and remove the renamed table, restore original
          delete newTables[operation.tableId];
          // The before state has the original table data
          const originalId = operation.before.title || operation.tableId;
          newTables[originalId] = operation.before;
        }
        break;
      default:
        // For addColumn, dropColumn, alterColumn - restore before state
        if (operation.before) {
          newTables[operation.tableId] = operation.before;
        }
        break;
    }

    updateTablesFromAI(newTables);
    setHistoryIndex((prev) => prev - 1);
    toast.info(`Undone: ${operation.description}`);
  }, [canUndo, historyIndex, operationHistory, tables, updateTablesFromAI]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;

    const operation = operationHistory[historyIndex + 1];
    const newTables = { ...tables };

    // Handle different operation types
    switch (operation.type) {
      case 'createTable':
        // Redo create = add the table (after state)
        if (operation.after) {
          newTables[operation.tableId] = operation.after;
        }
        break;
      case 'dropTable':
        // Redo drop = delete the table
        delete newTables[operation.tableId];
        break;
      case 'renameTable':
        // Redo rename = apply the new table with after state
        if (operation.after && operation.before) {
          const originalId = operation.before.title || operation.tableId;
          delete newTables[originalId];
          newTables[operation.tableId] = operation.after;
        }
        break;
      default:
        // For addColumn, dropColumn, alterColumn - apply after state
        if (operation.after) {
          newTables[operation.tableId] = operation.after;
        }
        break;
    }

    updateTablesFromAI(newTables);
    setHistoryIndex((prev) => prev + 1);
    toast.info(`Redone: ${operation.description}`);
  }, [canRedo, historyIndex, operationHistory, tables, updateTablesFromAI]);

  const clearHistory = useCallback(() => {
    setOperationHistory([]);
    setHistoryIndex(-1);
  }, []);

  const listOfTables = useMemo(() => {
    const authUserTable: Table = {
      title: 'auth.users',
      columns: [
        { title: 'id', format: 'uuid', type: 'string' },
        { title: 'email', format: 'varchar', type: 'string' },
      ],
    };

    const hasRealTables = Object.keys(tables).length > 0;
    if (hasRealTables) {
      const tablesList = Object.entries(tables)
        .map(([, value]) => (value.is_view ? undefined : value))
        .filter(Boolean) as Table[];
      tablesList.push(authUserTable);
      return tablesList;
    }
    return [];
  }, [tables]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const provider = aiProvider === 'google' ? 'google' : 'openai';
    const apiKey = provider === 'google' ? googleApiKey : openaiApiKey;

    if (!apiKey) {
      toast.error('Missing API key', {
        description:
          provider === 'google'
            ? 'Add your Google Gemini API key in Settings.'
            : 'Add your OpenAI API key in Settings.',
      });
      return;
    }

    if (!input.trim()) return;

    // CRITICAL: Read FRESH state from Zustand, not closure-captured value
    // Similar to Cline's pattern: "messages = await this.contextManager.getMessages()"
    // This ensures we always send current state, even if React hasn't re-rendered yet
    const currentTables = useStore.getState().tables;
    const schemaTableCount = Object.keys(currentTables).length;
    console.log(
      `[ChatSidebar] 📤 Sending message with ${schemaTableCount} tables in schema (fresh read)`,
    );

    await sendMessage(
      { text: input },
      {
        body: {
          schema: currentTables, // ✅ Fresh state from store, not stale closure
          attachments: selectedFiles.map((file) => ({
            name: file.name,
            type: file.type,
          })),
          // Explicitly pass fresh config to ensure it overrides stale transport state
          provider,
          apiKey,
          model: provider === 'google' ? googleModel : openaiModel,
        },
      },
    );

    // Clear input and files after submission
    setInput('');
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSelectedFiles([]);
  };

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleModelChange = (value: string) => {
    // Check if it's an OpenAI model
    if (availableOpenaiModels.some((m) => m.id === value)) {
      setAiProvider('openai');
      setOpenaiModel(value);
    } else if (availableGoogleModels.some((m) => m.id === value)) {
      setAiProvider('google');
      setGoogleModel(value);
    }
  };

  const currentModelValue = aiProvider === 'google' ? googleModel : openaiModel;

  return (
    <div
      className={cn(
        'fixed top-0 right-0 h-full z-[60]',
        'transform transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
      style={{ width: 'min(480px, 40vw)', minWidth: '320px' }}
    >
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        {/* Resize Handle */}
        <ResizableHandle
          withHandle
          className="w-2 bg-transparent hover:bg-primary/10 transition-colors"
        />
        <ResizablePanel defaultSize={100} minSize={30}>
          <div
            className={cn(
              'h-full flex flex-col',
              'bg-background/95 backdrop-blur-xl',
              'border-l border-border',
              'shadow-[-3px_0_8px_-1px_rgba(0,0,0,0.04)] dark:shadow-[-3px_0_10px_-1px_rgba(0,0,0,0.12)]',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-gradient-to-r from-background to-muted/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Sparkles size={18} className="text-primary" />
                </div>
                <h2 className="font-semibold text-lg">Schema Assistant</h2>
              </div>
              <div className="flex items-center gap-1">
                {/* Undo/Redo buttons (Phase 5.2) */}
                {operationHistory.length > 0 && (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleUndo}
                          disabled={!canUndo}
                          className="h-8 w-8"
                        >
                          <Undo2 size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Undo</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleRedo}
                          disabled={!canRedo}
                          className="h-8 w-8"
                        >
                          <Redo2 size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Redo</TooltipContent>
                    </Tooltip>
                    {/* History dropdown */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <History size={16} />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-72 p-0"
                        sideOffset={8}
                      >
                        <div className="flex items-center justify-between p-3 border-b">
                          <span className="text-sm font-medium">
                            Operation History
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearHistory}
                            className="h-7 text-xs text-muted-foreground"
                          >
                            Clear
                          </Button>
                        </div>
                        <ScrollArea className="h-[200px]">
                          {operationHistory.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground text-center">
                              No operations yet
                            </div>
                          ) : (
                            <div className="p-2 space-y-1">
                              {operationHistory.map((op, idx) => (
                                <div
                                  key={op.id}
                                  className={cn(
                                    'text-xs p-2 rounded-md',
                                    idx <= historyIndex
                                      ? 'bg-muted'
                                      : 'bg-muted/30 text-muted-foreground',
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] h-4"
                                    >
                                      {op.type}
                                    </Badge>
                                    <span className="truncate flex-1">
                                      {op.tableId}
                                    </span>
                                  </div>
                                  <div className="text-muted-foreground mt-1 truncate">
                                    {op.description}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </TooltipProvider>
                )}
                {messages.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={clearChat}
                          className="h-8 w-8"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clear Chat</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsOpen(false);
                  }}
                  className="h-8 w-8"
                >
                  <X size={16} />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-4 relative"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col h-full">
                  {/* Welcome Section */}
                  <div className="flex flex-col items-center justify-center flex-1 text-center">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 mb-4">
                      <Wand2 size={32} className="text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">Hello there!</h3>
                    <p className="text-sm text-muted-foreground max-w-[280px]">
                      I can help you create, modify, and explore your database
                      schema.
                    </p>

                    {/* Current tables */}
                    {listOfTables.length > 0 && (
                      <div className="mt-6 w-full">
                        <p className="text-xs text-muted-foreground mb-2">
                          Your tables:
                        </p>
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {listOfTables.slice(0, 8).map((table) => (
                            <Badge
                              key={table.title}
                              variant="outline"
                              className="text-xs bg-background"
                            >
                              <Table2 size={10} className="mr-1" />
                              {table.title}
                            </Badge>
                          ))}
                          {listOfTables.length > 8 && (
                            <Badge variant="secondary" className="text-xs">
                              +{listOfTables.length - 8} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Suggestions */}
                  <div className="mt-auto pb-2">
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      Try asking:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {SUGGESTIONS.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => setInput(suggestion.prompt)}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-xl text-left',
                            'border border-border/50 bg-card/50',
                            'hover:bg-accent hover:border-primary/30',
                            'transition-all duration-200 group',
                          )}
                        >
                          <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                            <suggestion.icon
                              size={16}
                              className="text-primary"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium group-hover:text-primary transition-colors">
                              {suggestion.title}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {suggestion.description}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map((message, index) => (
                    <div key={message.id} className="group">
                      {message.role === 'user' ? (
                        /* User message - assistant-ui style */
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User size={16} className="text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                              You
                            </div>
                            <div className="text-sm">
                              {message.parts
                                .filter((p: any) => p.type === 'text')
                                .map((p: any) => p.text)
                                .join('')}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Assistant response - assistant-ui style with markdown */
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                            <Bot size={16} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-3">
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                              Assistant
                            </div>

                            {/* Render reasoning parts first */}
                            {message.parts.some(
                              (p: any) => p.type === 'reasoning',
                            ) && (
                              <div className="space-y-2">
                                {message.parts
                                  .filter((p: any) => {
                                    if (p.type === 'reasoning') {
                                      console.log(
                                        '[Reasoning] Found reasoning part:',
                                        {
                                          text: p.text,
                                          hasText: !!p.text,
                                        },
                                      );
                                    }
                                    return p.type === 'reasoning';
                                  })
                                  .map((part: any, partIndex: number) => {
                                    // AI SDK reasoning parts have `text` property
                                    const reasoningText = part.text || '';
                                    // Check if this is the last message and still streaming
                                    const isLastMessage =
                                      index === messages.length - 1;
                                    const isCurrentlyStreaming =
                                      isLastMessage &&
                                      status === 'streaming' &&
                                      !reasoningText;

                                    return (
                                      <Reasoning
                                        key={`reasoning-${partIndex}`}
                                        text={reasoningText}
                                        status={
                                          isCurrentlyStreaming
                                            ? { type: 'running' }
                                            : undefined
                                        }
                                      />
                                    );
                                  })}
                              </div>
                            )}

                            {/* Show thinking indicator while streaming if no reasoning parts yet */}
                            {index === messages.length - 1 &&
                              status === 'streaming' &&
                              !message.parts.some(
                                (p: any) =>
                                  p.type === 'reasoning' || p.type === 'text',
                              ) && (
                                <Reasoning
                                  text=""
                                  status={{ type: 'running' }}
                                />
                              )}

                            {/* Render text parts with Markdown */}
                            {message.parts.filter((p: any) => p.type === 'text')
                              .length > 0 ? (
                              message.parts.map(
                                (part: any, partIndex: number) => {
                                  if (part.type === 'text') {
                                    return (
                                      <div key={partIndex} className="text-sm">
                                        {part.text ? (
                                          <MarkdownText>
                                            {transformJsonToNaturalLanguage(
                                              part.text,
                                            )}
                                          </MarkdownText>
                                        ) : (
                                          <span className="text-muted-foreground animate-pulse">
                                            Thinking...
                                          </span>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                },
                              )
                            ) : (
                              <div className="text-sm text-muted-foreground italic">
                                Tool executed successfully
                              </div>
                            )}

                            {/* Show tool invocations with collapsible UI */}
                            {message.parts.some(
                              (p: any) => p.type === 'tool',
                            ) && (
                              <div className="space-y-1.5 mt-2">
                                {message.parts
                                  .filter((part: any) => part.type === 'tool')
                                  .map((tool: any, toolIndex: number) => (
                                    <ToolResult key={toolIndex} tool={tool} />
                                  ))}
                              </div>
                            )}

                            {/* Action bar - assistant-ui style */}
                            <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <TooltipProvider delayDuration={0}>
                                <CopyButton
                                  text={message.parts
                                    .filter((p: any) => p.type === 'text')
                                    .map((p: any) => p.text)
                                    .join('\n')}
                                />
                                {supabaseApiKey?.url && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                          try {
                                            const projectRef = new URL(
                                              supabaseApiKey.url,
                                            ).hostname.split('.')[0];
                                            window.open(
                                              `https://app.supabase.com/project/${projectRef}/sql`,
                                              '_blank',
                                            );
                                          } catch (error) {
                                            console.error(
                                              'Failed to open SQL tab:',
                                              error,
                                            );
                                          }
                                        }}
                                      >
                                        <ExternalLink size={14} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">
                                      Open SQL Editor
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={() => {
                                        setMessages(
                                          messages.filter(
                                            (_, i) => i !== index,
                                          ),
                                        );
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    Delete
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                    <Bot size={16} className="text-white animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Assistant
                    </div>
                    <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-xl border border-border/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-sm">
                            {streamingProgress
                              ? streamingProgress.message
                              : 'Thinking...'}
                          </span>
                        </div>
                        {/* Cancel button (Phase 5.1 - Cancellation Support) */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancel}
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        >
                          <StopCircle className="h-3.5 w-3.5 mr-1" />
                          Cancel
                        </Button>
                      </div>
                      {streamingProgress && streamingProgress.total > 1 && (
                        <>
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-emerald-500 to-teal-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                              style={{
                                width: `${Math.min((streamingProgress.current / streamingProgress.total) * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Step {streamingProgress.current} of{' '}
                              {streamingProgress.total}
                            </span>
                            {streamingProgress.phase && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] h-5"
                              >
                                {streamingProgress.phase}
                              </Badge>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Bottom padding to prevent content being hidden behind input */}
              <div className="h-36" />
              <div ref={chatEndRef} />

              {/* Scroll to bottom button (assistant-ui style) */}
              {!isAtBottom && messages.length > 0 && (
                <div className="sticky bottom-4 flex justify-center pointer-events-none">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={scrollToBottom}
                    className={cn(
                      'h-8 w-8 rounded-full shadow-lg pointer-events-auto',
                      'bg-background/95 backdrop-blur-sm border-border/50',
                      'hover:bg-accent transition-all duration-200',
                    )}
                  >
                    <ArrowDown size={16} />
                  </Button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/50 bg-background/95 backdrop-blur-xl">
              {/* Selected Files */}
              {selectedFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {selectedFiles.map((file, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      <span className="text-xs truncate max-w-[120px]">
                        {file.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 rounded-full"
                        onClick={() => removeFile(index)}
                      >
                        <X size={10} />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Input Form */}
              <TooltipProvider>
                <form
                  onSubmit={onSubmit}
                  className="relative flex min-h-[120px] flex-col rounded-2xl border border-border shadow-lg bg-card focus-within:ring-1 focus-within:ring-ring transition-all duration-200"
                >
                  <div className="flex-1 relative overflow-y-auto max-h-[200px]">
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask, search, or make anything..."
                      className="w-full border-0 p-3 shadow-none ring-0 ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none resize-none bg-transparent min-h-[80px] text-[15px]"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="flex items-center gap-2 p-2 pb-2 mt-auto">
                    <Select
                      value={currentModelValue}
                      onValueChange={handleModelChange}
                    >
                      <SelectTrigger className="h-8 border border-input bg-background rounded-full pl-3 pr-1 py-1.5 text-xs text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0 transition-colors gap-1.5 w-auto inline-flex items-center justify-between">
                        <SelectValue className="text-sm" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableOpenaiModels.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-xs text-muted-foreground font-normal px-2 py-1">
                              OpenAI
                            </SelectLabel>
                            {availableOpenaiModels.map((m) => (
                              <SelectItem key={`openai-${m.id}`} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {availableGoogleModels.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-xs text-muted-foreground font-normal px-2 py-1">
                              Google
                            </SelectLabel>
                            {availableGoogleModels.map((m) => (
                              <SelectItem key={`google-${m.id}`} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>

                    <div className="ml-auto flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.sql,.txt"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={handleFileButtonClick}
                            disabled={isLoading}
                          >
                            <Paperclip size={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Attach file</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="submit"
                            size="icon"
                            className={cn(
                              'h-8 w-8 rounded-full transition-all duration-200',
                              input.trim()
                                ? 'bg-primary text-primary-foreground shadow-md'
                                : 'bg-muted text-muted-foreground',
                            )}
                            disabled={isLoading || !input.trim()}
                          >
                            <ArrowUp size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Send</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </form>
              </TooltipProvider>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
