# Fix: Schema Persistence and Table "Resurrection" Bug

## Summary

This document describes the comprehensive fixes implemented for the "table resurrection" bug where:
1. Previously deleted tables would reappear in the schema editor
2. Tables created by AI would disappear when asking follow-up questions
3. The schema would oscillate between different states unexpectedly

## Root Causes Identified

### Issue #1: Fallback Table Injection
**Location:** `AssistantSidebar.tsx` lines 227-234

**Problem:** When the `tables` state was empty, the code injected a fallback `users-default-id` table:
```typescript
return {
  'users-default-id': {
    title: 'users',
    columns: [
      { title: 'id', format: 'uuid', type: 'string' },
      { title: 'email', format: 'email', type: 'string' },
    ],
  },
};
```

**Impact:** Unexpected `users-default-id` table would appear even when user had intentionally cleared all tables.

### Issue #2: Stale Schema in Transport Body
**Location:** `AssistantSidebar.tsx` lines 308-317

**Problem:** The `DefaultChatTransport` was created with `useMemo` and captured `listOfTables` at memo creation time, not at request time. When React re-renders were delayed, stale schema data was sent to the API.

**Impact:** API would receive old table state, process it, and send back results based on stale data. When the client applied these results, it would overwrite the current (newer) state.

### Issue #3: `updateTablesFromAI` Does Full Replacement
**Location:** `store.ts` `updateTablesFromAI` function

**Problem:** The function always replaces ALL tables with whatever the API returns. Combined with Issue #2, this causes data loss.

**Impact:** If API receives stale data (e.g., 1 table), it returns 1 table. Client then replaces its current 5 tables with that 1 table.

### Issue #4: No Versioning/Conflict Detection
**Problem:** No mechanism existed to detect if an API response was based on stale data.

**Impact:** Old state could silently overwrite newer state without any warning.

### Issue #5: Auto-Recovery Loads Sample Data
**Location:** `RootProvider.tsx`

**Problem:** Empty table state triggered automatic loading of sample data.

**Impact:** When user intentionally deleted all tables, sample data would reappear on page refresh.

### Issue #6: Cross-Tab Synchronization
**Problem:** Multiple browser tabs could overwrite each other's localStorage state.

**Impact:** An older tab could overwrite a newer tab's clean state.

## Solutions Implemented

### Fix #1: Remove Fallback Table Injection ✅
**File:** `AssistantSidebar.tsx`

Changed `listOfTables` to return empty object instead of fallback:
```typescript
// Before
const listOfTables = useMemo(() => {
  if (Object.keys(tables).length > 0) return tables;
  return { 'users-default-id': {...} }; // BAD: Injects fake table
}, [tables]);

// After
const getLatestTables = useCallback(() => {
  return tablesRef.current; // Just return current state, even if empty
}, []);
```

### Fix #2: Fresh Schema at Request Time ✅
**File:** `AssistantSidebar.tsx`

Use a ref to get fresh tables at request time, not memo time:
```typescript
// Track latest tables in a ref
const tablesRef = useRef(tables);
tablesRef.current = tables;

// In transport fetch handler, inject fresh schema
const transport = useMemo(() => {
  return new DefaultChatTransport({
    api: '/api/chat',
    body: { provider, apiKey, model }, // No schema here!
    fetch: async (url, options) => {
      // Inject fresh schema at request time
      const bodyData = JSON.parse(options.body);
      bodyData.schema = callbacksRef.current.getLatestTables();
      options.body = JSON.stringify(bodyData);
      return fetch(url, options);
    },
  });
}, [provider, apiKey, model]); // No tables dependency!
```

### Fix #3: Schema Version Tracking ✅
**Files:** `store.ts`, `AssistantSidebar.tsx`, `route.ts`

Added monotonically increasing version counter:
```typescript
// store.ts
let schemaVersion = 0;

export function getSchemaVersion(): number {
  return schemaVersion;
}

export function incrementSchemaVersion(): number {
  schemaVersion++;
  return schemaVersion;
}
```

Client sends version with each request:
```typescript
// AssistantSidebar.tsx
bodyData.schemaVersion = getSchemaVersion();
sentSchemaVersionRef.current = schemaVersion;
```

API echoes version back in responses:
```typescript
// route.ts
writer.write({
  type: 'data-tables-batch',
  data: {
    tables: cloneTables(schemaState),
    schemaVersion: clientSchemaVersion, // Echo back
  },
});
```

Client validates before applying:
```typescript
// AssistantSidebar.tsx
if (responseVersion < sentSchemaVersionRef.current) {
  console.warn('Ignoring stale schema update');
  return; // Don't apply stale updates
}
```

### Fix #4: User Intent Tracking ✅
**Files:** `store.ts`, `RootProvider.tsx`

Added `schema-user-cleared` flag:
```typescript
// store.ts
export function hasUserClearedState(): boolean {
  return localStorage.getItem('schema-user-cleared') === 'true';
}

export function setUserClearedState(cleared: boolean): void {
  if (cleared) {
    localStorage.setItem('schema-user-cleared', 'true');
  } else {
    localStorage.removeItem('schema-user-cleared');
  }
}
```

Set when user deletes last table or clears cache:
```typescript
// In deleteTable()
if (currentTableCount === 1) {
  setUserClearedState(true);
}

// In clearCache()
setUserClearedState(true);
```

Respected in sample data loading:
```typescript
// RootProvider.tsx
if (!tablesData || Object.keys(parsedTables).length === 0) {
  if (hasUserClearedState()) {
    console.log('User cleared - not loading sample data');
    return;
  }
  // Only load sample data for fresh installs
  loadSampleData();
}
```

### Fix #5: Cross-Tab Synchronization ✅
**Files:** `store.ts`, `RootProvider.tsx`

Added storage event listener:
```typescript
// store.ts
function handleCrossTabStorageEvent(event: StorageEvent) {
  if (event.key !== 'table-list') return;
  
  const newTables = JSON.parse(event.newValue);
  useStore.setState({ tables: newTables });
}

export function setupCrossTabSync() {
  window.addEventListener('storage', handleCrossTabStorageEvent);
}
```

Initialized on app mount:
```typescript
// RootProvider.tsx
useEffect(() => {
  initializeFromLocalStorage();
  setupCrossTabSync();
  
  return () => cleanupCrossTabSync();
}, []);
```

## Complete Scenario Coverage

| # | Scenario | Status | How It's Fixed |
|---|----------|--------|----------------|
| 1 | Fresh Install | ✅ | Sample data loads when no `schema-user-cleared` flag |
| 2 | Manual Delete All Tables | ✅ | `deleteTable()` sets user-cleared flag on last table |
| 3 | Clear Cache Button | ✅ | `clearCache()` sets user-cleared flag |
| 4 | AI Creates Tables | ✅ | Fresh schema sent at request time + version tracking |
| 5 | AI Drops All Tables | ✅ | `updateTablesFromAI()` sets user-cleared flag when going to 0 |
| 6 | Follow-up Question After AI | ✅ | Fresh schema via ref at request time (not stale memo) |
| 7 | Rapid AI Requests | ✅ | Version validation rejects stale responses |
| 8 | Cross-Tab Changes | ✅ | Storage event listener syncs state |
| 9 | Stale Background Tab | ✅ | Cross-tab sync updates before tab can overwrite |
| 10 | Undo/Redo During AI | ✅ | `undo()`/`redo()` increment schema version |
| 11 | Page Refresh Mid-Operation | ✅ | `visibilitychange` event flushes pending saves |
| 12 | localStorage Quota Exceeded | ✅ | Existing error handling in `performSave()` |
| 13 | Import SQL | ✅ | `setTables()` increments schema version |
| 14 | Connect to Supabase | ✅ | Uses `setTables()` which increments version |
| 15 | Load from Shared Link | ✅ | Hash import increments version + clears flag |
| 16 | AI Stream Interrupted | ✅ | Partial state is valid; user can undo or re-ask |

## Testing Checklist

### Test 1: No Fallback Table Injection
1. Clear localStorage completely: `localStorage.clear()`
2. Set user cleared flag: `localStorage.setItem('schema-user-cleared', 'true')`
3. Refresh page
4. **Expected:** Empty canvas (no `users-default-id` table appears)

### Test 2: Fresh Schema in Requests
1. Start with sample data (5 tables)
2. Open browser DevTools Network tab
3. Ask AI a question
4. Inspect the request body in Network tab
5. **Expected:** `schema` field contains all 5 tables, `schemaVersion` present

### Test 3: Version Validation (Stale Response Rejection)
1. Open browser with tables
2. Ask AI to create tables
3. While AI is responding, manually add/delete a table
4. **Expected:** Console shows "Ignoring stale schema update" for old response

### Test 4: AI Drops All Tables (User Intent)
1. Ask AI to create 5 tables
2. Ask AI to "drop all tables"
3. Verify console shows: "AI cleared all tables - marking state as intentionally cleared"
4. Refresh page
5. **Expected:** Canvas remains empty (no sample data resurrection)

### Test 5: Cross-Tab Sync
1. Open two browser tabs
2. In Tab A, create a table via AI
3. **Expected:** Tab B shows the new table without refresh
4. Console in Tab B shows: "Synced state from other tab"

### Test 6: Follow-up Questions (Stale Schema Prevention)
1. Ask AI: "Create a gaming schema with players, games, scores tables"
2. Wait for tables to appear (3 tables)
3. Ask AI: "What indexes should I add?"
4. **Expected:** All 3 tables remain (console shows fresh schema sent)

### Test 7: Undo/Redo Version Safety
1. Ask AI to create tables
2. While AI is responding, press Cmd+Z to undo
3. **Expected:** Undo works, AI response is rejected as stale

### Test 8: Shared Link Import
1. Create some tables
2. Share via hash link
3. Open in new incognito window
4. **Expected:** Tables load, console shows "Loaded N tables from shared link"

## Console Logging

Enable debugging by watching for these log messages:

```
[Transport] Sending fresh schema: 5 tables, version: 3
[api/chat] Received schema: 5 tables, version: 3, hash: 5:games,players,scores,...
[handleDataPart] Applying schema update: 5 -> 5 tables
[SchemaVersion] Incremented to 4
[CrossTabSync] Synced state from other tab: 3 tables
[Store] User deleted last table - marking state as intentionally cleared
[RootProvider] Empty state detected, but user intentionally cleared tables
```

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/store.ts` | Schema versioning (`getSchemaVersion`, `incrementSchemaVersion`), user intent tracking (`hasUserClearedState`, `setUserClearedState`), cross-tab sync (`setupCrossTabSync`, `handleCrossTabStorageEvent`), version increment in all table mutations, AI empty state detection |
| `src/components/AssistantSidebar.tsx` | Removed fallback table injection, use ref for fresh tables at request time, send schema version with requests, validate response version before applying |
| `src/app/api/chat/route.ts` | Log received schema version, echo version back in all `data-tables-batch` responses |
| `src/components/RootProvider.tsx` | Initialize cross-tab sync on mount, respect user-cleared flag for sample data, increment version on shared link import |

## Backward Compatibility

All fixes are backward compatible:
- New localStorage keys are optional - missing keys default to safe values
- Schema version starts at 0 - works with existing sessions
- Existing users with data are not affected