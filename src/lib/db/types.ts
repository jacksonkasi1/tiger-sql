// ** import types
import type { ThreadMessage } from '@assistant-ui/react';

// ============================================================================
// Chat History Types for IndexedDB
// ============================================================================

/**
 * Chat thread stored in IndexedDB
 */
export interface ChatThread {
  id: string; // UUID v4
  title: string; // Auto-generated from first message (max 50 chars)
  messages: ThreadMessage[]; // Array of message objects from assistant-ui
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
  metadata: {
    provider: 'openai' | 'google';
    model: string;
    totalMessages: number;
    lastUserMessage?: string; // For preview/search
  };
}

/**
 * Grouped threads by time period
 */
export interface GroupedThreads {
  today: ThreadSummary[];
  yesterday: ThreadSummary[];
  thisWeek: ThreadSummary[];
  thisMonth: ThreadSummary[];
  older: ThreadSummary[];
}

/**
 * Thread summary for list display (without full messages)
 */
export interface ThreadSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
}
