// ** import types
import type { ChatThread, GroupedThreads, ThreadSummary } from '@/lib/db/types';
import type { ThreadMessage } from '@assistant-ui/react';

// ** import core packages
import { useState, useEffect, useCallback, useRef } from 'react';

// ** import database
import {
  initDB,
  saveThread,
  getThread,
  getAllThreads,
  getRecentThreads,
  searchThreads as dbSearchThreads,
  deleteThread as dbDeleteThread,
  clearAllThreads,
  isIndexedDBAvailable,
} from '@/lib/db/chat-db';

// ** import utils
import { toast } from 'sonner';

// ============================================================================
// Hook Interface
// ============================================================================

interface UseChatHistoryReturn {
  // State
  currentThreadId: string | null;
  threads: ThreadSummary[];
  recentThreads: ThreadSummary[];
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  createNewThread: () => string;
  loadThread: (id: string) => Promise<ChatThread | null>;
  saveCurrentThread: (
    messages: ThreadMessage[],
    provider: 'openai' | 'google',
    model: string,
  ) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  searchThreads: (query: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  setCurrentThreadId: (id: string | null) => void;

  // Helpers
  generateThreadTitle: (firstMessage: string) => string;
  groupThreadsByTime: (threads: ThreadSummary[]) => GroupedThreads;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique thread ID
 */
function generateThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate thread title from first user message
 */
function generateThreadTitle(firstMessage: string): string {
  if (!firstMessage || firstMessage.trim().length === 0) {
    return `New Conversation ${new Date().toLocaleTimeString()}`;
  }

  // Clean up the message
  const cleaned = firstMessage
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s-]/g, ''); // Remove special chars

  // Truncate to 50 chars
  if (cleaned.length <= 50) {
    return cleaned;
  }

  return cleaned.substring(0, 47) + '...';
}

/**
 * Group threads by time period
 */
function groupThreadsByTime(threads: ThreadSummary[]): GroupedThreads {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const grouped: GroupedThreads = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  };

  threads.forEach((thread) => {
    if (thread.updatedAt > oneDayAgo) {
      grouped.today.push(thread);
    } else if (thread.updatedAt > twoDaysAgo) {
      grouped.yesterday.push(thread);
    } else if (thread.updatedAt > oneWeekAgo) {
      grouped.thisWeek.push(thread);
    } else if (thread.updatedAt > oneMonthAgo) {
      grouped.thisMonth.push(thread);
    } else {
      grouped.older.push(thread);
    }
  });

  return grouped;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useChatHistory(): UseChatHistoryReturn {
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [recentThreads, setRecentThreads] = useState<ThreadSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Debounce save to avoid excessive writes
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track the last saved message count per thread to prevent duplicate saves
  const lastSavedStateRef = useRef<{
    threadId: string | null;
    messageCount: number;
  }>({
    threadId: null,
    messageCount: 0,
  });

  // Block saves for a short period after creating a new thread to avoid race conditions
  const ignoreSavesUntilRef = useRef<number>(0);

  // ============================================================================
  // Initialize
  // ============================================================================

  useEffect(() => {
    async function initialize() {
      if (!isIndexedDBAvailable()) {
        toast.error('Chat History Unavailable', {
          description: 'IndexedDB is not supported in this browser',
        });
        setIsInitialized(true);
        return;
      }

      try {
        await initDB();
        await refreshThreads();
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize chat history:', error);
        toast.error('Failed to Initialize Chat History', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        setIsInitialized(true);
      }
    }

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // Refresh threads list
  // ============================================================================

  const refreshThreads = useCallback(async () => {
    try {
      const [allThreads, recent] = await Promise.all([
        getAllThreads(),
        getRecentThreads(3),
      ]);

      setThreads(allThreads);
      setRecentThreads(recent);
    } catch (error) {
      console.error('Failed to refresh threads:', error);
    }
  }, []);

  // ============================================================================
  // Create new thread
  // ============================================================================

  const createNewThread = useCallback(() => {
    const newId = generateThreadId();
    setCurrentThreadId(newId);
    // Reset the saved state tracker for the new thread
    lastSavedStateRef.current = { threadId: newId, messageCount: 0 };
    // Block saves for 1 second to prevent old messages from being saved to the new thread
    ignoreSavesUntilRef.current = Date.now() + 1000;
    return newId;
  }, []);

  // ============================================================================
  // Load thread
  // ============================================================================

  const loadThread = useCallback(async (id: string) => {
    setIsLoading(true);

    try {
      const thread = await getThread(id);

      if (!thread) {
        toast.error('Thread Not Found', {
          description: 'The requested conversation could not be found',
        });
        return null;
      }

      setCurrentThreadId(id);
      return thread;
    } catch (error) {
      console.error('Failed to load thread:', error);
      toast.error('Failed to Load Thread', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ============================================================================
  // Save current thread (debounced)
  // ============================================================================

  const saveCurrentThread = useCallback(
    async (
      messages: ThreadMessage[],
      provider: 'openai' | 'google',
      model: string,
    ) => {
      if (!currentThreadId || messages.length === 0) {
        return;
      }

      // Check if we're in the "ignore period" after creating a new thread
      if (Date.now() < ignoreSavesUntilRef.current) {
        return;
      }

      // Capture the thread ID at call time to avoid stale closure issues
      const threadIdToSave = currentThreadId;

      // Only save if there's at least one user message
      const userMessages = messages.filter((m) => m.role === 'user');
      if (userMessages.length === 0) {
        return;
      }

      // Prevent duplicate saves: skip if we already saved this exact state
      const lastSaved = lastSavedStateRef.current;
      if (
        lastSaved.threadId === threadIdToSave &&
        lastSaved.messageCount === messages.length
      ) {
        return;
      }

      // Prevent saving old messages to a new thread
      // Only skip if the thread changed AND we have MORE saved messages than incoming
      // This catches the case where old messages are re-triggered after thread switch
      if (
        lastSaved.threadId !== null &&
        lastSaved.threadId !== threadIdToSave &&
        lastSaved.messageCount > 0 &&
        messages.length <= lastSaved.messageCount
      ) {
        // Update tracker to new thread but don't save stale messages
        lastSavedStateRef.current = {
          threadId: threadIdToSave,
          messageCount: 0,
        };
        return;
      }

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce save by 500ms
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          // Find first user message for title
          const firstUserMessage = messages.find((m) => m.role === 'user');
          const firstContent =
            firstUserMessage?.content?.[0]?.type === 'text'
              ? firstUserMessage.content[0].text
              : '';

          // Find last user message for metadata
          const lastUserMessage = userMessages[userMessages.length - 1];
          const lastContent =
            lastUserMessage?.content?.[0]?.type === 'text'
              ? lastUserMessage.content[0].text
              : '';

          // Check if thread exists
          const existingThread = await getThread(threadIdToSave);
          const now = Date.now();

          const thread: ChatThread = {
            id: threadIdToSave,
            title: existingThread
              ? existingThread.title
              : generateThreadTitle(firstContent),
            messages,
            createdAt: existingThread ? existingThread.createdAt : now,
            updatedAt: now,
            metadata: {
              provider,
              model,
              totalMessages: messages.length,
              lastUserMessage: lastContent.substring(0, 100), // Store preview
            },
          };

          await saveThread(thread);
          // Update the saved state tracker
          lastSavedStateRef.current = {
            threadId: threadIdToSave,
            messageCount: messages.length,
          };
          await refreshThreads();
        } catch (error) {
          console.error('Failed to save thread:', error);
          // Don't show toast for auto-save failures to avoid annoying user
        }
      }, 500);
    },
    [currentThreadId, refreshThreads],
  );

  // ============================================================================
  // Delete thread
  // ============================================================================

  const deleteThreadAction = useCallback(
    async (id: string) => {
      try {
        await dbDeleteThread(id);
        await refreshThreads();

        // If we deleted the current thread, clear it
        if (id === currentThreadId) {
          setCurrentThreadId(null);
        }

        toast.success('Thread Deleted', {
          description: 'Conversation removed from history',
        });
      } catch (error) {
        console.error('Failed to delete thread:', error);
        toast.error('Failed to Delete Thread', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [currentThreadId, refreshThreads],
  );

  // ============================================================================
  // Search threads
  // ============================================================================

  const searchThreadsAction = useCallback(async (query: string) => {
    setIsLoading(true);

    try {
      const results = await dbSearchThreads(query);
      setThreads(results);
    } catch (error) {
      console.error('Failed to search threads:', error);
      toast.error('Search Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ============================================================================
  // Clear all history
  // ============================================================================

  const clearHistory = useCallback(async () => {
    try {
      await clearAllThreads();
      setThreads([]);
      setRecentThreads([]);
      setCurrentThreadId(null);

      toast.success('History Cleared', {
        description: 'All conversations have been deleted',
      });
    } catch (error) {
      console.error('Failed to clear history:', error);
      toast.error('Failed to Clear History', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  // ============================================================================
  // Wrapped setCurrentThreadId that resets the tracker
  // ============================================================================

  const setCurrentThreadIdWrapped = useCallback((id: string | null) => {
    setCurrentThreadId(id);
    // Reset the saved state tracker when switching threads
    lastSavedStateRef.current = {
      threadId: id,
      messageCount: 0,
    };
  }, []);

  // ============================================================================
  // Cleanup on unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    currentThreadId,
    threads,
    recentThreads,
    isLoading,
    isInitialized,
    createNewThread,
    loadThread,
    saveCurrentThread,
    deleteThread: deleteThreadAction,
    searchThreads: searchThreadsAction,
    clearHistory,
    setCurrentThreadId: setCurrentThreadIdWrapped,
    generateThreadTitle,
    groupThreadsByTime,
  };
}
