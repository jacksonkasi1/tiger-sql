// ** import types
import type { ChatThread, ThreadSummary } from './types';

// ============================================================================
// IndexedDB Configuration
// ============================================================================

const DB_NAME = 'schema-assistant-db';
const DB_VERSION = 1;
const STORE_NAME = 'chat-threads';

// ============================================================================
// IndexedDB Initialization
// ============================================================================

/**
 * Initialize IndexedDB with schema
 * Creates object store with indexes if it doesn't exist
 */
export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Check if IndexedDB is available
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(
        new Error(
          `Failed to open IndexedDB: ${request.error?.message || 'Unknown error'}`,
        ),
      );
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

        // Create indexes for efficient queries
        objectStore.createIndex('createdAt', 'createdAt', { unique: false });
        objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        objectStore.createIndex('title', 'title', { unique: false });
      }
    };
  });
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Save or update a thread
 */
export async function saveThread(thread: ChatThread): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(thread);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        new Error(
          `Failed to save thread: ${request.error?.message || 'Unknown error'}`,
        ),
      );

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get a specific thread by ID
 */
export async function getThread(id: string): Promise<ChatThread | null> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () =>
      reject(
        new Error(
          `Failed to get thread: ${request.error?.message || 'Unknown error'}`,
        ),
      );

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get all threads sorted by updatedAt (descending)
 * Returns summaries without full message content for performance
 */
export async function getAllThreads(): Promise<ThreadSummary[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('updatedAt');
    const request = index.openCursor(null, 'prev'); // Descending order

    const threads: ThreadSummary[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

      if (cursor) {
        const thread = cursor.value as ChatThread;

        // Create summary without full messages
        threads.push({
          id: thread.id,
          title: thread.title,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          messageCount: thread.messages.length,
          lastMessage: thread.metadata.lastUserMessage,
        });

        cursor.continue();
      } else {
        resolve(threads);
      }
    };

    request.onerror = () =>
      reject(
        new Error(
          `Failed to get threads: ${request.error?.message || 'Unknown error'}`,
        ),
      );

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get recent threads (for "Recent" section)
 */
export async function getRecentThreads(
  limit: number = 3,
): Promise<ThreadSummary[]> {
  const allThreads = await getAllThreads();
  return allThreads.slice(0, limit);
}

/**
 * Search threads by title or last message
 */
export async function searchThreads(query: string): Promise<ThreadSummary[]> {
  if (!query.trim()) {
    return getAllThreads();
  }

  const allThreads = await getAllThreads();
  const lowerQuery = query.toLowerCase();

  return allThreads.filter((thread) => {
    const titleMatch = thread.title.toLowerCase().includes(lowerQuery);
    const messageMatch = thread.lastMessage
      ?.toLowerCase()
      .includes(lowerQuery);

    return titleMatch || messageMatch;
  });
}

/**
 * Delete a specific thread
 */
export async function deleteThread(id: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        new Error(
          `Failed to delete thread: ${request.error?.message || 'Unknown error'}`,
        ),
      );

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Clear all threads (for testing/reset)
 */
export async function clearAllThreads(): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        new Error(
          `Failed to clear threads: ${request.error?.message || 'Unknown error'}`,
        ),
      );

    transaction.oncomplete = () => db.close();
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get total storage size used by IndexedDB (approximate)
 */
export async function getStorageSize(): Promise<number> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const threads = request.result as ChatThread[];
        const size = JSON.stringify(threads).length;
        resolve(size);
      };

      request.onerror = () =>
        reject(
          new Error(
            `Failed to calculate storage size: ${request.error?.message || 'Unknown error'}`,
          ),
        );

      transaction.oncomplete = () => db.close();
    });
  } catch {
    return 0;
  }
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.indexedDB;
}
