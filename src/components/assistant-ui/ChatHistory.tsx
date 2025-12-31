'use client';

// ** import types
import type { ThreadSummary, GroupedThreads } from '@/lib/db/types';

// ** import core packages
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ** import utils
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// ** import ui components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Trash2,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ============================================================================
// Thread Item Component
// ============================================================================

interface ThreadItemProps {
  thread: ThreadSummary;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function ThreadItem({
  thread,
  isActive,
  onSelect,
  onDelete,
}: ThreadItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const timeAgo = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(thread.updatedAt), {
        addSuffix: true,
      });
    } catch {
      return 'Recently';
    }
  }, [thread.updatedAt]);

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-1 p-3 rounded-md cursor-pointer transition-all duration-150',
        'border border-transparent',
        isActive
          ? 'bg-primary/10 border-primary/20'
          : 'hover:bg-accent/50 hover:border-border/40',
      )}
      onClick={() => onSelect(thread.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'text-sm font-medium line-clamp-2 flex-1',
            isActive ? 'text-primary' : 'text-foreground',
          )}
        >
          {thread.title}
        </span>

        {/* Delete button - show on hover or if active */}
        {(isHovered || isActive) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(thread.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <span className="text-xs text-muted-foreground">{timeAgo}</span>

      {thread.lastMessage && (
        <p className="text-xs text-muted-foreground/80 line-clamp-1">
          {thread.lastMessage}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Thread Group Component
// ============================================================================

interface ThreadGroupProps {
  title: string;
  threads: ThreadSummary[];
  currentThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function ThreadGroup({
  title,
  threads,
  currentThreadId,
  onSelectThread,
  onDeleteThread,
}: ThreadGroupProps) {
  if (threads.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="px-3 py-1.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
      </div>

      {threads.map((thread) => (
        <ThreadItem
          key={thread.id}
          thread={thread}
          isActive={thread.id === currentThreadId}
          onSelect={onSelectThread}
          onDelete={onDeleteThread}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Main ChatHistory Component
// ============================================================================

interface ChatHistoryProps {
  threads: ThreadSummary[];
  recentThreads: ThreadSummary[];
  currentThreadId: string | null;
  isLoading: boolean;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onNewThread: () => void;
  onSearch: (query: string) => void;
  onClearHistory: () => void;
  onBack: () => void;
  groupThreadsByTime: (threads: ThreadSummary[]) => GroupedThreads;
}

export function ChatHistory({
  threads,
  recentThreads,
  currentThreadId,
  isLoading,
  onSelectThread,
  onDeleteThread,
  onNewThread,
  onSearch,
  onClearHistory,
  onBack,
  groupThreadsByTime,
}: ChatHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showViewAll, setShowViewAll] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Group threads by time
  const groupedThreads = useMemo(
    () => groupThreadsByTime(threads),
    [threads, groupThreadsByTime],
  );

  // Handle search with debounce
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      searchTimeoutRef.current = setTimeout(() => {
        onSearch(value);
      }, 300);
    },
    [onSearch],
  );

  // Handle delete with confirmation
  const handleDeleteClick = useCallback((id: string) => {
    setThreadToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (threadToDelete) {
      onDeleteThread(threadToDelete);
      setThreadToDelete(null);
      setDeleteDialogOpen(false);
    }
  }, [threadToDelete, onDeleteThread]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b min-h-[50px] shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-sm">History</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onNewThread}
            title="New thread"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Search Bar */}
        <div className="px-3 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search threads..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* Thread List */}
        <ScrollArea className="flex-1">
          <div className="px-2 py-2 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">
                  Loading...
                </div>
              </div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="text-sm text-muted-foreground mb-2">
                  {searchQuery
                    ? 'No threads match your search'
                    : 'No conversations yet'}
                </div>
                {!searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onNewThread}
                    className="text-xs"
                  >
                    Start a conversation
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Recent Section - only show if not searching and not viewing all */}
                {!searchQuery && !showViewAll && recentThreads.length > 0 && (
                  <>
                    <ThreadGroup
                      title="Recent"
                      threads={recentThreads}
                      currentThreadId={currentThreadId}
                      onSelectThread={onSelectThread}
                      onDeleteThread={handleDeleteClick}
                      isExpanded={false}
                      onToggleExpand={() => {}}
                    />

                    {threads.length > recentThreads.length && (
                      <div className="px-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs h-8"
                          onClick={() => setShowViewAll(true)}
                        >
                          View All ({threads.length})
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* All threads grouped by time - show when searching or viewing all */}
                {(searchQuery || showViewAll) && (
                  <>
                    <ThreadGroup
                      title="Today"
                      threads={groupedThreads.today}
                      currentThreadId={currentThreadId}
                      onSelectThread={onSelectThread}
                      onDeleteThread={handleDeleteClick}
                      isExpanded={true}
                      onToggleExpand={() => {}}
                    />

                    <ThreadGroup
                      title="Yesterday"
                      threads={groupedThreads.yesterday}
                      currentThreadId={currentThreadId}
                      onSelectThread={onSelectThread}
                      onDeleteThread={handleDeleteClick}
                      isExpanded={true}
                      onToggleExpand={() => {}}
                    />

                    <ThreadGroup
                      title="This Week"
                      threads={groupedThreads.thisWeek}
                      currentThreadId={currentThreadId}
                      onSelectThread={onSelectThread}
                      onDeleteThread={handleDeleteClick}
                      isExpanded={true}
                      onToggleExpand={() => {}}
                    />

                    <ThreadGroup
                      title="This Month"
                      threads={groupedThreads.thisMonth}
                      currentThreadId={currentThreadId}
                      onSelectThread={onSelectThread}
                      onDeleteThread={handleDeleteClick}
                      isExpanded={true}
                      onToggleExpand={() => {}}
                    />

                    <ThreadGroup
                      title="Older"
                      threads={groupedThreads.older}
                      currentThreadId={currentThreadId}
                      onSelectThread={onSelectThread}
                      onDeleteThread={handleDeleteClick}
                      isExpanded={true}
                      onToggleExpand={() => {}}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Delete All Button at Bottom */}
        {threads.length > 0 && (
          <div className="p-3 border-t shrink-0">
            <Button
              variant="ghost"
              className="w-full justify-center text-sm h-9 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                const confirmed = window.confirm(
                  'Are you sure you want to delete all conversations? This cannot be undone.',
                );
                if (confirmed) {
                  onClearHistory();
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All History
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
