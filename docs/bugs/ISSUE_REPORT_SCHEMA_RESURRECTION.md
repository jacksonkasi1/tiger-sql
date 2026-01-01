# Issue Report: Schema Persistence and Table "Resurrection"

## Executive Summary
Users are experiencing an issue where previously deleted tables reappear ("resurrect") in the schema editor after a period of time or subsequent interactions. This creates a confusing experience where the AI Assistant appears to undo the user's cleanup work, merging old "legacy" tables with newly created ones.

## Visual Analysis of the Incident

1.  **Initial State:** The user starts with a full "Gaming" schema (tables: `regions`, `games`, `players`, etc.).
2.  **Cleanup Phase:** The user instructs the AI to drop all tables. The AI successfully executes `dropTable` commands, and the UI reflects this by removing the tables from the list.
3.  **Clean State:** The system reaches a verified clean state containing only the new desired core entities (e.g., `users`, `instruments`, `accounts`). The old gaming data is confirmed deleted.
4.  **The Anomaly:** While continuing to build (adding `balance_transactions`), the deleted "Gaming" tables (`regions`, `games`, etc.) suddenly reappear in the Table List, co-existing with the new tables.

## Technical Root Cause Analysis

The investigation points to a **State Synchronization Conflict** involving LocalStorage, likely triggered by multiple open tabs or sessions.

### 1. The "Last Write Wins" Race Condition
The application uses `localStorage` as the primary persistence layer but lacks cross-tab synchronization.

*   **Mechanism:** The `useStore` hook initializes from `localStorage` only on component mount. It saves state to `localStorage` via a `debouncedSave` function whenever the in-memory state changes.
*   **Scenario:**
    1.  **Tab A (Active):** User deletes all tables. The in-memory state is cleared. `debouncedSave` writes the **Clean State** to `localStorage`.
    2.  **Tab B (Background/Dormant):** This tab was opened previously and still holds the **Old State** (with Gaming tables) in its React state/memory.
    3.  **Trigger:** If Tab B triggers a save (e.g., due to a window focus event, a delayed debounce, or user interaction), it writes its **Old State** to `localStorage`, overwriting the **Clean State** saved by Tab A.
    4.  **Resurrection:** When the user refreshes Tab A or opens a new session, the app initializes from `localStorage`, which now contains the old tables. The UI renders the "resurrected" tables.

### 2. Auto-Recovery Logic (Contributing Factor)
The `RootProvider.tsx` component contains a safety mechanism that creates a vulnerability for empty states.

```typescript
// RootProvider.tsx
useEffect(() => {
  // ...
  const tablesData = localStorage.getItem('table-list');
  // Load sample data if no tables exist
  if (!tablesData || Object.keys(parsedTables).length === 0) {
    const sampleData = getSampleData();
    setTables(sampleData.definitions, sampleData.paths);
    // ...
  }
}, ...);
```

*   **Risk:** If the user successfully deletes *all* tables (resulting in an empty state), and then refreshes the page before creating a new table, this logic may interpret the empty state as a "fresh install" and automatically inject default sample data.
*   *Note:* While the observed "resurrected" tables (Gaming) differ from the code's current default sample data (E-commerce), this logic confirms that the system is designed to "fill the void" if persistence is cleared, adding to the instability of a blank-slate approach.

## Conclusion
The issue is not the LLM recreating tables, but the application's state management reverting to a previous snapshot. The "Ghost" tables are likely persisting in a background browser tab and overwriting the user's deletion progress.