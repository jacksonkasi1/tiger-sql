# Chat History IndexedDB Implementation Plan

## Overview
Implement persistent chat history using IndexedDB to maintain conversation threads when the AssistantSidebar drawer is closed and reopened. This will provide a seamless chat experience with history management similar to modern AI chat applications.

## Current Problem
- When closing and reopening the AssistantSidebar, the chat conversation is lost
- No persistence between sessions
- Users cannot access previous conversations
- No way to manage or search through chat history

## Proposed Solution
Use IndexedDB to store chat threads locally in the browser, providing:
- Persistent chat history across drawer open/close
- Search and filter capabilities
- Thread management (delete, view recent)
- Time-based grouping
- Efficient storage using browser's IndexedDB API

---

## Architecture

### 1. IndexedDB Schema

**Database Name**: `schema-assistant-db`
**Version**: 1

#### Object Stores

##### `chat-threads` Store
```typescript
{
  id: string;              // UUID v4
  title: string;           // Auto-generated from first message (max 50 chars)
  messages: Message[];     // Array of message objects
  createdAt: number;       // Unix timestamp
  updatedAt: number;       // Unix timestamp
  metadata: {
    provider: 'openai' | 'google';
    model: string;
    totalMessages: number;
    lastUserMessage?: string; // For preview/search
  }
}
```

**Indexes**:
- `id` (primary key, unique)
- `createdAt` (for sorting)
- `updatedAt` (for sorting)
- `title` (for search)

##### Message Format (from @assistant-ui/react)
```typescript
{
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}
```

---

## Implementation Plan

### Phase 1: IndexedDB Setup & Utilities

#### File: `src/lib/db/chat-db.ts`
Core IndexedDB operations wrapper:

```typescript
- initDB(): Promise<IDBDatabase>
  // Initialize database with schema

- saveThread(thread: ChatThread): Promise<void>
  // Save or update a thread

- getThread(id: string): Promise<ChatThread | null>
  // Retrieve specific thread

- getAllThreads(): Promise<ChatThread[]>
  // Get all threads sorted by updatedAt desc

- searchThreads(query: string): Promise<ChatThread[]>
  // Search threads by title or last message

- deleteThread(id: string): Promise<void>
  // Delete a specific thread

- clearAllThreads(): Promise<void>
  // Delete all threads (for testing/reset)

- getRecentThreads(limit: number): Promise<ChatThread[]>
  // Get most recent N threads
```

**Error Handling**:
- Graceful fallback if IndexedDB is unavailable (Safari private mode)
- Storage quota exceeded handling
- Migration support for future schema changes

---

### Phase 2: Chat History Hook

#### File: `src/hooks/use-chat-history.ts`
React hook for managing chat history state:

```typescript
interface UseChatHistoryReturn {
  // State
  currentThreadId: string | null;
  threads: ChatThread[];
  isLoading: boolean;

  // Actions
  createNewThread(): Promise<string>;
  loadThread(id: string): Promise<ChatThread | null>;
  saveCurrentThread(messages: Message[]): Promise<void>;
  deleteThread(id: string): Promise<void>;
  searchThreads(query: string): Promise<ChatThread[]>;
  clearHistory(): Promise<void>;

  // Helpers
  generateThreadTitle(firstMessage: string): string;
  groupThreadsByTime(threads: ChatThread[]): GroupedThreads;
}
```

**Features**:
- Auto-save on message send/receive
- Debounced saving (500ms) to avoid excessive writes
- Thread title generation from first user message
- Time-based grouping (Today, Yesterday, This Week, Older)

---

### Phase 3: UI Components

#### 3.1 History Sidebar Component
**File**: `src/components/assistant-ui/ChatHistory.tsx`

**Features**:
- Search bar at top
- Time-grouped thread list
- Recent threads (last 3) shown by default
- "View All" button to expand
- Hover to show delete icon
- Click thread to load conversation
- Active thread highlighting
- Empty state when no history

**Layout**:
```
┌─────────────────────────────┐
│ ← History          [+] [•••]│
├─────────────────────────────┤
│ 🔍 Search threads...        │
├─────────────────────────────┤
│ Recent                      │
│ ┌─────────────────────────┐ │
│ │ Thread Title 1    [🗑️]  │ │
│ │ 2 hours ago             │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Thread Title 2    [🗑️]  │ │
│ │ 5 hours ago             │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ View All          [↓]       │
├─────────────────────────────┤
│ Today                       │
│ Yesterday                   │
│ This Week                   │
└─────────────────────────────┘
```

#### 3.2 Update AssistantSidebar Component
**File**: `src/components/AssistantSidebar.tsx`

**Changes**:
- Add History icon button in header (next to Undo/Redo)
- Toggle between chat view and history view
- Integrate `use-chat-history` hook
- Auto-save current conversation
- Load thread when selected from history
- Handle "New Thread" creation

**New Header Layout**:
```
[Sparkles] Assistant [Gemini]    [History] [Undo] [Redo] [•••] [X]
```

---

### Phase 4: Integration with @assistant-ui/react

#### 4.1 Thread State Management
Since `@assistant-ui/react` manages message state internally, we need to:

1. **Hook into message flow**:
   - Monitor runtime message changes
   - Extract messages using `runtime.messages` or similar API
   - Auto-save on new assistant response

2. **Load thread into runtime**:
   - Use `useExternalHistory` from `@assistant-ui/react-ai-sdk`
   - Initialize runtime with loaded messages
   - Maintain conversation context

3. **New thread handling**:
   - Clear current runtime state
   - Create new thread in IndexedDB
   - Reset UI to empty state

#### Example Integration:
```typescript
// In AssistantSidebar
const { createNewThread, loadThread, saveCurrentThread } = useChatHistory();

// On new message from runtime
useEffect(() => {
  if (runtime.messages.length > 0) {
    saveCurrentThread(runtime.messages);
  }
}, [runtime.messages]);

// On thread selection
const handleThreadSelect = async (threadId: string) => {
  const thread = await loadThread(threadId);
  if (thread) {
    runtime.initialize(thread.messages); // API depends on library
  }
};
```

---

### Phase 5: UI/UX Enhancements

#### 5.1 Thread Title Generation
Auto-generate meaningful titles from first user message:
- Take first 50 characters
- Clean up formatting
- Fallback: "New Conversation" + timestamp

#### 5.2 Time Grouping
Group threads by:
- **Today**: Threads from today
- **Yesterday**: Threads from yesterday
- **This Week**: Threads from last 7 days
- **This Month**: Threads from last 30 days
- **Older**: Everything else

#### 5.3 Search Functionality
- Real-time search as user types
- Search in thread titles
- Search in last user message content
- Highlight matching text
- Show "No results" state

#### 5.4 Delete Confirmation
- Show confirmation dialog before deletion
- "Delete All History" option with warning
- Undo deletion (optional, Phase 6)

#### 5.5 Empty States
- No history yet: "Start a conversation"
- No search results: "No threads match your search"
- Deleted all: "History cleared"

---

## File Structure

```
src/
├── lib/
│   └── db/
│       ├── chat-db.ts           # IndexedDB operations
│       └── types.ts             # TypeScript types
├── hooks/
│   └── use-chat-history.ts      # React hook for history
├── components/
│   ├── assistant-ui/
│   │   ├── ChatHistory.tsx      # History sidebar component
│   │   ├── ThreadItem.tsx       # Individual thread item
│   │   └── ThreadSearch.tsx     # Search input component
│   └── AssistantSidebar.tsx     # Updated with history integration
```

---

## Data Flow

```
┌─────────────────┐
│ AssistantSidebar│
└────────┬────────┘
         │
         │ uses
         ▼
┌─────────────────┐
│ use-chat-history│
└────────┬────────┘
         │
         │ calls
         ▼
┌─────────────────┐
│   chat-db.ts    │
└────────┬────────┘
         │
         │ interacts
         ▼
┌─────────────────┐
│   IndexedDB     │
└─────────────────┘
```

---

## Migration & Compatibility

### Browser Support
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (handle private mode)
- Mobile browsers: Full support

### Storage Limits
- IndexedDB typically allows 50-100MB per origin
- Estimate: ~1MB per 100 messages
- Target: Support 1000+ threads
- Implement storage quota monitoring

### Fallback Strategy
If IndexedDB unavailable:
1. Warn user (toast notification)
2. Fall back to sessionStorage (temporary)
3. Disable history features gracefully

---

## Testing Checklist

### Unit Tests
- [ ] IndexedDB CRUD operations
- [ ] Thread title generation
- [ ] Time-based grouping logic
- [ ] Search filtering

### Integration Tests
- [ ] Save thread on message send
- [ ] Load thread and restore messages
- [ ] Delete thread removes from DB
- [ ] Search returns correct results

### E2E Tests
- [ ] Create new conversation
- [ ] Close drawer, reopen → conversation persists
- [ ] Switch between threads
- [ ] Delete thread from UI
- [ ] Search threads by title
- [ ] Clear all history

### Edge Cases
- [ ] Very long conversations (1000+ messages)
- [ ] Special characters in messages
- [ ] Concurrent tab usage
- [ ] Storage quota exceeded
- [ ] IndexedDB unavailable (Safari private)
- [ ] Empty thread handling

---

## Performance Considerations

1. **Lazy Loading**: Only load thread messages when selected
2. **Debounced Saving**: Wait 500ms after last message before saving
3. **Indexed Searches**: Use IndexedDB indexes for fast queries
4. **Virtual Scrolling**: If thread list > 100 items, use virtual scrolling
5. **Message Pagination**: For very long threads, paginate messages

---

## Security & Privacy

1. **Local Storage Only**: All data stays in browser
2. **No Server Sync**: Pure client-side implementation
3. **User Control**: Easy deletion of history
4. **Sensitive Data**: Consider option to disable history
5. **Encryption**: Optional encryption of stored messages (Phase 6)

---

## Future Enhancements (Phase 6+)

1. **Export/Import**: Download/upload thread history
2. **Thread Sharing**: Generate shareable links
3. **Thread Tags**: Categorize conversations
4. **Thread Notes**: Add manual notes to threads
5. **Cloud Sync**: Optional sync to user account
6. **Message Bookmarks**: Star important messages
7. **Thread Merge**: Combine related conversations
8. **Full-Text Search**: Advanced search with operators
9. **Message Editing**: Edit past messages
10. **Thread Templates**: Pre-defined conversation starters

---

## Implementation Timeline

### Week 1: Core Infrastructure
- Day 1-2: IndexedDB setup (`chat-db.ts`)
- Day 3-4: React hook (`use-chat-history.ts`)
- Day 5: Unit tests

### Week 2: UI Components
- Day 1-2: ChatHistory component
- Day 3: ThreadItem and search components
- Day 4-5: AssistantSidebar integration

### Week 3: Polish & Testing
- Day 1-2: E2E tests
- Day 3: Bug fixes
- Day 4: Performance optimization
- Day 5: Documentation

---

## Success Metrics

- ✅ Conversations persist across drawer close/open
- ✅ Search returns results in < 100ms
- ✅ Thread save completes in < 50ms
- ✅ Support 500+ threads without performance degradation
- ✅ Zero data loss on browser crash/refresh
- ✅ Works in all major browsers

---

## Code Style Guidelines

Following project's `CLAUDE.md` import organization:

```typescript
// ** import types
import type { ChatThread, Message } from '@/lib/db/types'

// ** import core packages
import { useState, useEffect, useCallback } from 'react'

// ** import database
import { getAllThreads, searchThreads, deleteThread } from '@/lib/db/chat-db'

// ** import utils
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ** import ui components
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
```

---

## API Reference

### IndexedDB Functions

```typescript
// Initialize database
await initDB(): Promise<IDBDatabase>

// Thread operations
await saveThread(thread: ChatThread): Promise<void>
await getThread(id: string): Promise<ChatThread | null>
await getAllThreads(): Promise<ChatThread[]>
await deleteThread(id: string): Promise<void>

// Search
await searchThreads(query: string): Promise<ChatThread[]>
await getRecentThreads(limit: number): Promise<ChatThread[]>

// Utilities
await clearAllThreads(): Promise<void>
await getStorageSize(): Promise<number>
```

### Hook API

```typescript
const {
  currentThreadId,
  threads,
  isLoading,
  createNewThread,
  loadThread,
  saveCurrentThread,
  deleteThread,
  searchThreads,
  clearHistory
} = useChatHistory();
```

---

## Notes

- This implementation is designed to be efficient and scalable
- IndexedDB is chosen over localStorage for better performance with large datasets
- The architecture allows for easy future enhancements
- All data remains local to the user's browser
- Thread titles are auto-generated for better UX
- Time-based grouping improves navigation
- Search functionality makes finding conversations easy

---

## Questions to Address

Before implementation, consider:

1. **Thread Title Length**: Confirm 50 chars is appropriate
2. **Recent Limit**: Is 3 recent threads enough, or make configurable?
3. **Storage Alerts**: Warn users at 80% quota?
4. **Encryption**: Required for sensitive data?
5. **Auto-Delete**: Should old threads (>90 days) be auto-deleted?
6. **Export Format**: JSON, Markdown, or both?

---

## Dependencies

### New Dependencies (if needed)
- None! Using built-in IndexedDB API

### Existing Dependencies
- `@assistant-ui/react`: Message runtime
- `lucide-react`: Icons (History, Search, Trash)
- `sonner`: Toast notifications
- `uuid` or `nanoid`: Thread ID generation

---

## Conclusion

This plan provides a comprehensive approach to implementing persistent chat history using IndexedDB. The solution is efficient, user-friendly, and follows modern web development best practices. The phased approach allows for incremental development and testing, ensuring a robust final implementation.

The architecture is designed to be:
- **Scalable**: Handle thousands of threads
- **Performant**: Fast searches and saves
- **Maintainable**: Clean separation of concerns
- **Extensible**: Easy to add future features
- **User-Friendly**: Intuitive UI/UX

Once approved, implementation can begin following the detailed specifications above.
