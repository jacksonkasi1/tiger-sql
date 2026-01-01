'use client';

import { create } from 'zustand';
import { getRandomColor } from './utils';
import {
  TableState,
  Column,
  SchemaView,
  SupabaseApiKey,
  EnumTypeDefinition,
} from './types';
import { RelationshipType } from '@/types/flow';
import {
  HistoryState,
  createInitialHistoryState,
  createHistoryEntry,
  pushHistoryEntry,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  getUndoLabel as historyGetUndoLabel,
  getRedoLabel as historyGetRedoLabel,
  deepClone,
  HistoryLabels,
  serializeHistory,
  deserializeHistory,
  areSnapshotsDifferent,
  HISTORY_STORAGE_KEY,
} from './history';

// ============================================================================
// Cross-Tab Synchronization Constants
// ============================================================================
const STORAGE_TIMESTAMP_KEY = 'schema-last-modified';
const USER_CLEARED_STATE_KEY = 'schema-user-cleared';

// ============================================================================
// Schema Version Tracking
// ============================================================================
// Monotonically increasing version counter to detect stale updates
let schemaVersion = 0;

/**
 * Get the current schema version.
 * This can be sent with API requests to detect stale responses.
 */
export function getSchemaVersion(): number {
  return schemaVersion;
}

/**
 * Increment and return the new schema version.
 * Call this whenever the schema is modified locally.
 */
export function incrementSchemaVersion(): number {
  schemaVersion++;
  console.log('[SchemaVersion] Incremented to', schemaVersion);
  return schemaVersion;
}

/**
 * Generate a hash of the current table state for comparison.
 * Used to detect if incoming updates are based on stale state.
 */
export function getTablesHash(tables: TableState): string {
  const keys = Object.keys(tables).sort();
  return `${keys.length}:${keys.join(',')}`;
}

/**
 * Check if the user has intentionally cleared all tables.
 * This prevents auto-recovery from loading sample data when user wants empty state.
 */
export function hasUserClearedState(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(USER_CLEARED_STATE_KEY) === 'true';
}

/**
 * Mark that the user has intentionally cleared all tables.
 */
export function setUserClearedState(cleared: boolean): void {
  if (typeof window === 'undefined') return;
  if (cleared) {
    localStorage.setItem(USER_CLEARED_STATE_KEY, 'true');
  } else {
    localStorage.removeItem(USER_CLEARED_STATE_KEY);
  }
}

/**
 * Set the last modification timestamp in localStorage.
 */
function setStorageTimestamp(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
}

interface AppState {
  // Modal state
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;

  // Sidebar state
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  expandedTables: Set<string>;
  toggleTableExpanded: (tableId: string) => void;
  expandTable: (tableId: string) => void;
  collapseTable: (tableId: string) => void;

  // Table state
  tables: TableState;
  setTables: (definition: any, paths: any) => void;
  updateTablesFromAI: (
    tables: TableState,
    meta?: { enumTypes?: Record<string, EnumTypeDefinition> },
  ) => void;
  updateTablePosition: (tableId: string, x: number, y: number) => void;
  setTablePositions: (
    updates: Record<string, { x: number; y: number }>,
  ) => void;
  updateTableName: (tableId: string, newName: string) => void;
  updateTableColor: (tableId: string, color: string) => void;
  updateTableComment: (tableId: string, comment: string) => void;
  addTable: () => string;
  addColumn: (tableId: string, column: Column) => void;
  updateColumn: (
    tableId: string,
    columnIndex: number,
    updates: Partial<Column>,
  ) => void;
  deleteColumn: (tableId: string, columnIndex: number) => void;
  reorderColumns: (tableId: string, oldIndex: number, newIndex: number) => void;
  deleteTable: (tableId: string) => void;
  reorderTables: (orderedIds: string[]) => void;
  autoArrange: () => void;

  // Layout trigger for ReactFlow
  layoutTrigger: number;
  triggerLayout: () => void;
  fitViewTrigger: number;
  triggerFitView: () => void;
  zoomInTrigger: number;
  triggerZoomIn: () => void;
  zoomOutTrigger: number;
  triggerZoomOut: () => void;

  // Search and focus
  focusTableId: string | null;
  focusTableTrigger: number;
  triggerFocusTable: (tableId: string) => void;

  // Selection and highlighting
  tableSelected: Set<Element>;
  setTableSelected: (selected: Set<Element>) => void;
  tableHighlighted: string;
  setTableHighlighted: (highlighted: string) => void;
  connectorHighlighted: string[];
  setConnectorHighlighted: (highlighted: string[]) => void;

  // Schema view (zoom/pan)
  schemaView: SchemaView;
  setSchemaView: (view: SchemaView) => void;
  updateSchemaViewTranslate: (x: number, y: number) => void;
  updateSchemaViewScale: (scale: number) => void;

  // Supabase API key
  supabaseApiKey: SupabaseApiKey;
  setSupabaseApiKey: (apiKey: SupabaseApiKey) => void;

  // Edge relationships
  edgeRelationships: Record<string, RelationshipType>;
  setEdgeRelationship: (edgeId: string, type: RelationshipType) => void;
  getEdgeRelationship: (edgeId: string) => RelationshipType;

  // Connection mode (strict vs flexible)
  connectionMode: 'strict' | 'flexible';
  setConnectionMode: (mode: 'strict' | 'flexible') => void;

  // Schema grouping
  visibleSchemas: Set<string>;
  collapsedSchemas: Set<string>;
  toggleSchemaVisibility: (schema: string) => void;
  toggleSchemaCollapse: (schema: string) => void;
  showAllSchemas: () => void;
  hideAllSchemas: () => void;
  getVisibleSchemas: () => string[];

  // Initialize from localStorage
  initializeFromLocalStorage: () => void;

  // Save to localStorage
  saveToLocalStorage: () => void;

  // Clear localStorage cache
  clearCache: () => void;

  // Add new tables (used for copy/paste, AI updates, etc.)
  addTables: (tables: TableState, skipHistory?: boolean) => void;

  // Enum types
  enumTypes: Record<string, EnumTypeDefinition>;
  setEnumTypes: (types: Record<string, EnumTypeDefinition>) => void;
  updateEnumType: (enumKey: string, values: string[]) => void;
  createEnumType: (
    name: string,
    schema: string | undefined,
    values: string[],
  ) => void;
  deleteEnumType: (enumKey: string) => void;
  renameEnumType: (oldKey: string, newName: string) => void;
  getEnumType: (enumKey: string) => EnumTypeDefinition | undefined;

  // History state for undo/redo
  history: HistoryState;

  // History actions
  pushHistory: (label: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getUndoLabel: () => string | null;
  getRedoLabel: () => string | null;
  clearHistory: () => void;
}

const checkView = (title: string, paths: any) => {
  if (paths[`/${title}`] && Object.keys(paths[`/${title}`]).length === 1) {
    return true;
  }
  return false;
};

const sanitizeTables = (tables: TableState) => {
  const cleaned: TableState = {};
  let removedTables = 0;
  let removedColumns = 0;

  Object.entries(tables).forEach(([key, table]) => {
    if (!key || !key.trim()) {
      removedTables++;
      return;
    }

    const columns = Array.isArray(table?.columns) ? table.columns : [];
    const validColumns = columns.filter(
      (column) =>
        column && typeof column.title === 'string' && column.title.trim(),
    );

    if (validColumns.length === 0) {
      removedTables++;
      removedColumns += columns.length;
      return;
    }

    cleaned[key] = {
      ...table,
      title: table.title || key,
      columns: validColumns,
    };
  });

  return {
    tables: cleaned,
    removedTables,
    removedColumns,
  };
};

// Debounced localStorage save to prevent excessive writes
let saveTimeoutId: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 500; // Wait 500ms before saving
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit

// Track if we're currently syncing from another tab to prevent save loops
let isSyncingFromOtherTab = false;

function debouncedSave(saveFn: () => void) {
  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
  }
  saveTimeoutId = setTimeout(() => {
    saveFn();
    saveTimeoutId = null;
  }, SAVE_DEBOUNCE_MS);
}

// Internal function to perform the actual save (used by both debounced and immediate saves)
// Note: get() will be set by the store initialization
let getStateFn: (() => AppState) | null = null;

function performSave() {
  if (typeof window === 'undefined' || !getStateFn) return;

  try {
    const state = getStateFn();

    // Check current storage size before saving
    const currentSize = getStorageSize();
    if (currentSize > MAX_STORAGE_SIZE) {
      console.warn(
        `localStorage size (${(currentSize / 1024 / 1024).toFixed(2)}MB) exceeds limit. Clearing old data...`,
      );
      // Clear only table data, keep user preferences
      localStorage.removeItem('table-list');
      localStorage.removeItem('edge-relationships');
      localStorage.removeItem('enum-types');
    }

    // Store data with size-optimized JSON (no extra whitespace)
    const tablesJson = JSON.stringify(state.tables);
    const edgeRelationshipsJson = JSON.stringify(state.edgeRelationships);
    const visibleSchemasJson = JSON.stringify(Array.from(state.visibleSchemas));
    const collapsedSchemasJson = JSON.stringify(
      Array.from(state.collapsedSchemas),
    );
    const enumTypesJson = JSON.stringify(state.enumTypes);

    // Check individual item sizes before saving
    const totalNewSize =
      tablesJson.length +
      edgeRelationshipsJson.length +
      visibleSchemasJson.length +
      collapsedSchemasJson.length +
      enumTypesJson.length;

    if (totalNewSize > MAX_STORAGE_SIZE) {
      console.error(
        `Cannot save: Data size (${(totalNewSize / 1024 / 1024).toFixed(2)}MB) exceeds ${MAX_STORAGE_SIZE / 1024 / 1024}MB limit`,
      );
      // Show warning to user
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(
          new CustomEvent('storage:exceeded', {
            detail: { size: totalNewSize, limit: MAX_STORAGE_SIZE },
          }),
        );
      }
      return;
    }

    localStorage.setItem('table-list', tablesJson);
    localStorage.setItem('edge-relationships', edgeRelationshipsJson);
    localStorage.setItem('visible-schemas', visibleSchemasJson);
    localStorage.setItem('collapsed-schemas', collapsedSchemasJson);
    localStorage.setItem('enum-types', enumTypesJson);
    localStorage.setItem('connection-mode', state.connectionMode);

    // Update timestamp for cross-tab conflict resolution
    setStorageTimestamp();

    // If we're saving tables, clear the user-cleared flag (user is actively working)
    if (Object.keys(state.tables).length > 0) {
      setUserClearedState(false);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded. Clearing cache...');
      if (getStateFn) {
        getStateFn().clearCache();
      }
    } else {
      console.error('Error saving to localStorage:', error);
    }
  }
}

// Flush pending saves immediately (for app close/unload)
function flushPendingSave() {
  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
    saveTimeoutId = null;
    // Execute the pending save immediately
    performSave();
  }
}

// ============================================================================
// Cross-Tab Synchronization
// ============================================================================

/**
 * Handle storage events from other tabs.
 * When another tab updates localStorage, sync our in-memory state.
 */
function handleCrossTabStorageEvent(event: StorageEvent) {
  // Only handle table-list changes
  if (event.key !== 'table-list') return;

  // Ignore if we triggered this change
  if (isSyncingFromOtherTab) return;

  // Ignore if no new value (item was deleted)
  if (!event.newValue) return;

  console.log('[CrossTabSync] Detected table-list change from another tab');

  try {
    isSyncingFromOtherTab = true;

    const newTables = JSON.parse(event.newValue);

    // Also sync related data
    const edgeRelationshipsData = localStorage.getItem('edge-relationships');
    const visibleSchemasData = localStorage.getItem('visible-schemas');
    const enumTypesData = localStorage.getItem('enum-types');

    const updates: Partial<AppState> = {
      tables: newTables,
    };

    if (edgeRelationshipsData) {
      updates.edgeRelationships = JSON.parse(edgeRelationshipsData);
    }

    if (visibleSchemasData) {
      updates.visibleSchemas = new Set(JSON.parse(visibleSchemasData));
    }

    if (enumTypesData) {
      updates.enumTypes = JSON.parse(enumTypesData);
    }

    // Update the store with new state from other tab
    useStore.setState(updates);

    console.log(
      '[CrossTabSync] Synced state from other tab:',
      Object.keys(newTables).length,
      'tables',
    );
  } catch (error) {
    console.error('[CrossTabSync] Error syncing from other tab:', error);
  } finally {
    isSyncingFromOtherTab = false;
  }
}

/**
 * Set up cross-tab synchronization.
 * This should be called once when the app initializes.
 */
export function setupCrossTabSync() {
  if (typeof window === 'undefined') return;

  // Listen for storage events from other tabs
  window.addEventListener('storage', handleCrossTabStorageEvent);

  console.log('[CrossTabSync] Cross-tab synchronization enabled');
}

/**
 * Clean up cross-tab synchronization listeners.
 */
export function cleanupCrossTabSync() {
  if (typeof window === 'undefined') return;
  window.removeEventListener('storage', handleCrossTabStorageEvent);
}

// Set up event listeners to flush on app close/unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingSave);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingSave();
    }
  });
}

function getStorageSize(): number {
  if (typeof window === 'undefined') return 0;
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length + key.length;
    }
  }
  return total;
}

export const useStore = create<AppState>((set, get) => {
  // Set the get function for performSave to use
  getStateFn = get;

  return {
    // Initial state
    isModalOpen: false,
    sidebarOpen: true,
    expandedTables: new Set<string>(),
    tables: {},
    enumTypes: {},
    tableSelected: new Set<Element>(),
    tableHighlighted: '',
    connectorHighlighted: [],
    schemaView: {
      translate: { x: 0, y: 0 },
      scale: 1,
    },
    supabaseApiKey: {
      url: '',
      anon: '',
      last_url: '',
    },
    edgeRelationships: {},
    connectionMode: 'flexible',
    visibleSchemas: new Set<string>(),
    collapsedSchemas: new Set<string>(),
    layoutTrigger: 0,
    fitViewTrigger: 0,
    zoomInTrigger: 0,
    zoomOutTrigger: 0,
    focusTableId: null,
    focusTableTrigger: 0,

    // History state
    history: createInitialHistoryState(),

    // Actions
    setIsModalOpen: (open) => set({ isModalOpen: open }),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),

    toggleTableExpanded: (tableId) => {
      set((state) => {
        const newExpanded = new Set(state.expandedTables);
        if (newExpanded.has(tableId)) {
          newExpanded.delete(tableId);
        } else {
          newExpanded.add(tableId);
        }
        return { expandedTables: newExpanded };
      });
    },

    expandTable: (tableId) => {
      set((state) => ({
        expandedTables: new Set(state.expandedTables).add(tableId),
      }));
    },

    collapseTable: (tableId) => {
      set((state) => {
        const newExpanded = new Set(state.expandedTables);
        newExpanded.delete(tableId);
        return { expandedTables: newExpanded };
      });
    },

    setTables: (definition: any, paths: any) => {
      // Increment schema version for bulk import
      incrementSchemaVersion();

      const tableGroup: TableState = {};
      const currentTables = get().tables;

      for (const [rawKey, value] of Object.entries(definition)) {
        const key = typeof rawKey === 'string' ? rawKey.trim() : '';
        const tableValue = value as any;
        const properties = tableValue?.properties;

        if (
          !key ||
          !properties ||
          typeof properties !== 'object' ||
          Object.keys(properties).length === 0
        ) {
          continue;
        }

        const colGroup: Column[] = Object.keys(properties).map(
          (colKey: string) => {
            const colVal = properties[colKey];
            return {
              title: colKey,
              format: colVal.format?.split(' ')[0] || '',
              type: colVal.type,
              default: colVal.default || undefined,
              required: tableValue.required?.includes(colKey) || false,
              pk: colVal.description?.includes('<pk/>') || false,
              fk: colVal.description
                ? colVal.description.split('`')[1]
                : undefined,
              enumTypeName: colVal.enumTypeName,
              enumValues: colVal.enumValues,
            };
          },
        );

        const keyParts = key.split('.');
        const schema = keyParts.length > 1 ? keyParts[0] : undefined;

        tableGroup[key] = {
          title: key,
          is_view: checkView(key, paths),
          columns: colGroup,
          position: currentTables[key]
            ? currentTables[key].position
            : { x: 0, y: 0 },
          schema,
          color: currentTables[key]?.color || getRandomColor(),
        };
      }

      const { tables: sanitizedTables, removedTables } =
        sanitizeTables(tableGroup);
      set({ tables: sanitizedTables });
      if (removedTables > 0) {
        console.log(
          `[setTables] Sanitized ${removedTables} invalid table definition(s)`,
        );
      }

      // Ensure all new schemas are visible when importing
      const sanitizedSchemas = new Set(
        Object.values(sanitizedTables)
          .map((table) => table.schema)
          .filter(Boolean) as string[],
      );
      const currentVisibleSchemas = get().visibleSchemas;
      if (currentVisibleSchemas.size === 0) {
        // If no schemas are visible, show all new schemas
        set({ visibleSchemas: sanitizedSchemas });
      } else {
        // Add new schemas to visible set if they don't exist
        const updatedVisibleSchemas = new Set(currentVisibleSchemas);
        sanitizedSchemas.forEach((schema) => updatedVisibleSchemas.add(schema));
        set({ visibleSchemas: updatedVisibleSchemas });
      }

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.importSQL());
      get().saveToLocalStorage();
    },

    updateTablesFromAI: (updatedTables, meta) => {
      // Increment schema version since we're updating from AI
      incrementSchemaVersion();

      // Log the update for debugging
      const incomingCount = Object.keys(updatedTables).length;
      const currentCount = Object.keys(get().tables).length;
      console.log(
        `[updateTablesFromAI] Updating tables: ${currentCount} -> ${incomingCount}`,
      );

      // If AI is clearing all tables (going from N > 0 to 0), set the user-cleared flag
      // This prevents sample data from loading on page refresh
      if (currentCount > 0 && incomingCount === 0) {
        console.log(
          '[updateTablesFromAI] AI cleared all tables - marking state as intentionally cleared',
        );
        setUserClearedState(true);
      } else if (incomingCount > 0) {
        // If AI is adding tables, clear the user-cleared flag
        setUserClearedState(false);
      }

      set((state) => {
        const nextTables: TableState = {};
        const discoveredSchemas = new Set<string>();

        for (const [tableId, tableValue] of Object.entries(updatedTables)) {
          const existing = state.tables[tableId];
          const columns = tableValue.columns ?? [];

          if (tableValue.schema) {
            discoveredSchemas.add(tableValue.schema);
          }

          nextTables[tableId] = {
            ...tableValue,
            columns,
            position: existing?.position ??
              tableValue.position ?? { x: 0, y: 0 },
            color: existing?.color || getRandomColor(),
          };
        }

        const mergedVisibleSchemas = new Set(state.visibleSchemas);
        discoveredSchemas.forEach((schema) => mergedVisibleSchemas.add(schema));

        const { tables: sanitizedTables, removedTables } =
          sanitizeTables(nextTables);

        if (removedTables > 0) {
          console.log(
            `[updateTablesFromAI] Sanitized ${removedTables} invalid table(s) from AI response`,
          );
        }

        const updates: Partial<AppState> = {
          tables: sanitizedTables,
          visibleSchemas: mergedVisibleSchemas,
        };

        if (meta?.enumTypes) {
          updates.enumTypes = meta.enumTypes;
        }

        return updates;
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.applySQLChanges());
      get().saveToLocalStorage();
    },

    setTablePositions: (updates) => {
      set((state) => {
        const newTables = { ...state.tables };
        let hasChanges = false;

        Object.entries(updates).forEach(([id, pos]) => {
          if (newTables[id]) {
            newTables[id] = {
              ...newTables[id],
              position: pos,
            };
            hasChanges = true;
          }
        });

        if (!hasChanges) return state;

        return {
          tables: newTables,
        };
      });

      get().pushHistory(HistoryLabels.autoArrange());
      get().saveToLocalStorage();
    },

    updateTablePosition: (tableId, x, y) => {
      set((state) => {
        const existing = state.tables[tableId];
        if (!existing) {
          return state;
        }

        return {
          tables: {
            ...state.tables,
            [tableId]: {
              ...existing,
              position: { x, y },
            },
          },
        };
      });
      get().saveToLocalStorage();
    },

    updateTableName: (tableId, newName) => {
      // Increment schema version for local change
      incrementSchemaVersion();
      const currentTables = get().tables;
      const table = currentTables[tableId];
      if (!table) return;

      const oldName = tableId;
      const updatedTables = { ...currentTables };
      delete updatedTables[tableId];
      updatedTables[newName] = {
        ...table,
        title: newName,
      };

      // Update all foreign key references pointing to the old table name
      // FK format can be: "table.column" or "schema.table.column"
      Object.keys(updatedTables).forEach((tblKey) => {
        const tbl = updatedTables[tblKey];
        if (!tbl.columns) return;

        const updatedColumns = tbl.columns.map((col) => {
          if (!col.fk) return col;

          // Parse the FK reference
          const fkParts = col.fk.split('.');
          let targetTable: string;
          let targetColumn: string;
          let targetSchema: string | undefined;

          if (fkParts.length === 2) {
            // Format: table.column
            [targetTable, targetColumn] = fkParts;
          } else if (fkParts.length === 3) {
            // Format: schema.table.column
            [targetSchema, targetTable, targetColumn] = fkParts;
          } else {
            return col; // Invalid format, skip
          }

          // Check if this FK points to the renamed table
          if (targetTable === oldName) {
            // Update the FK reference to use the new table name
            const newFk = targetSchema
              ? `${targetSchema}.${newName}.${targetColumn}`
              : `${newName}.${targetColumn}`;

            return {
              ...col,
              fk: newFk,
            };
          }

          return col;
        });

        updatedTables[tblKey] = {
          ...tbl,
          columns: updatedColumns,
        };
      });

      // Update edgeRelationships to use the new table name in edge IDs
      const currentEdgeRelationships = get().edgeRelationships;
      const updatedEdgeRelationships: Record<string, RelationshipType> = {};

      Object.entries(currentEdgeRelationships).forEach(([edgeId, relType]) => {
        // Edge ID format: "sourceTable.sourceCol-targetTable.targetCol"
        // Need to update if oldName appears in either position
        let newEdgeId = edgeId;

        // Replace old table name with new table name in edge ID
        // Be careful to match whole table names (not partial matches)
        const edgeParts = edgeId.split('-');
        if (edgeParts.length === 2) {
          const [sourcePart, targetPart] = edgeParts;
          const sourceTableName = sourcePart.split('.')[0];
          const targetTableName = targetPart.split('.')[0];

          let newSourcePart = sourcePart;
          let newTargetPart = targetPart;

          if (sourceTableName === oldName) {
            newSourcePart = newName + sourcePart.slice(oldName.length);
          }
          if (targetTableName === oldName) {
            newTargetPart = newName + targetPart.slice(oldName.length);
          }

          newEdgeId = `${newSourcePart}-${newTargetPart}`;
        }

        updatedEdgeRelationships[newEdgeId] = relType;
      });

      // Update expandedTables if the old table was expanded
      const wasExpanded = get().expandedTables.has(tableId);
      if (wasExpanded) {
        const newExpanded = new Set(get().expandedTables);
        newExpanded.delete(tableId);
        newExpanded.add(newName);
        set({
          tables: updatedTables,
          expandedTables: newExpanded,
          edgeRelationships: updatedEdgeRelationships,
        });
      } else {
        set({
          tables: updatedTables,
          edgeRelationships: updatedEdgeRelationships,
        });
      }

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.renameTable(oldName, newName));
      get().saveToLocalStorage();
    },

    updateTableColor: (tableId, color) => {
      // Increment schema version for local change
      incrementSchemaVersion();
      const table = get().tables[tableId];
      if (!table) return;

      set((state) => {
        const existing = state.tables[tableId];
        if (!existing) return state;

        return {
          tables: {
            ...state.tables,
            [tableId]: {
              ...existing,
              color,
            },
          },
        };
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.changeTableColor(tableId));
      get().saveToLocalStorage();
    },

    updateTableComment: (tableId, comment) => {
      // Increment schema version for local change
      incrementSchemaVersion();
      const table = get().tables[tableId];
      if (!table) return;

      set((state) => {
        const existing = state.tables[tableId];
        if (!existing) return state;

        return {
          tables: {
            ...state.tables,
            [tableId]: {
              ...existing,
              comment,
            },
          },
        };
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.updateTableComment(tableId));
      get().saveToLocalStorage();
    },

    addTable: () => {
      // Increment schema version for local change
      incrementSchemaVersion();
      const { tables, addTables, triggerFocusTable } = get();

      const baseName = 'new_table';
      let counter = 1;
      let tableName = baseName;

      while (tables[tableName]) {
        tableName = `${baseName}_${counter}`;
        counter += 1;
      }

      const newTable: TableState = {
        [tableName]: {
          title: tableName,
          columns: [
            {
              title: 'id',
              format: 'uuid',
              type: 'string',
              required: true,
              pk: true,
            },
          ],
          position: { x: 0, y: 0 },
          color: getRandomColor(),
        },
      };

      addTables(newTable, true); // Skip history push in addTables

      set((state) => ({
        expandedTables: new Set(state.expandedTables).add(tableName),
      }));

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.addTable(tableName));

      triggerFocusTable(tableName);

      return tableName;
    },

    addColumn: (tableId, column) => {
      // Increment schema version for local change
      incrementSchemaVersion();
      const table = get().tables[tableId];
      if (!table) return;

      set((state) => {
        const existing = state.tables[tableId];
        if (!existing) return state;

        return {
          tables: {
            ...state.tables,
            [tableId]: {
              ...existing,
              columns: [...(existing.columns || []), column],
            },
          },
        };
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.addColumn(tableId, column.title));
      get().saveToLocalStorage();
    },

    updateColumn: (tableId, columnIndex, updates) => {
      // Increment schema version for local change
      incrementSchemaVersion();
      const table = get().tables[tableId];
      if (!table || !table.columns) return;

      const columnName = table.columns[columnIndex]?.title || 'column';

      set((state) => {
        const existing = state.tables[tableId];
        if (!existing || !existing.columns) return state;

        const newColumns = [...existing.columns];
        newColumns[columnIndex] = {
          ...newColumns[columnIndex],
          ...updates,
        };

        return {
          tables: {
            ...state.tables,
            [tableId]: {
              ...existing,
              columns: newColumns,
            },
          },
        };
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.updateColumn(tableId, columnName));
      get().saveToLocalStorage();
    },

    deleteColumn: (tableId, columnIndex) => {
      // Increment schema version for local change
      incrementSchemaVersion();
      const table = get().tables[tableId];
      if (!table || !table.columns) return;

      const columnName = table.columns[columnIndex]?.title || 'column';

      set((state) => {
        const existing = state.tables[tableId];
        if (!existing || !existing.columns) return state;

        const newColumns = existing.columns.filter(
          (_, idx) => idx !== columnIndex,
        );

        return {
          tables: {
            ...state.tables,
            [tableId]: {
              ...existing,
              columns: newColumns,
            },
          },
        };
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.deleteColumn(tableId, columnName));
      get().saveToLocalStorage();
    },

    reorderColumns: (tableId, oldIndex, newIndex) => {
      // Increment schema version for local change
      incrementSchemaVersion();
      const table = get().tables[tableId];
      if (!table || !table.columns) return;

      set((state) => {
        const existing = state.tables[tableId];
        if (!existing || !existing.columns) return state;

        const newColumns = [...existing.columns];
        const [movedColumn] = newColumns.splice(oldIndex, 1);
        newColumns.splice(newIndex, 0, movedColumn);

        return {
          tables: {
            ...state.tables,
            [tableId]: {
              ...existing,
              columns: newColumns,
            },
          },
        };
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.reorderColumns(tableId));
      get().saveToLocalStorage();
    },

    deleteTable: (tableId) => {
      const table = get().tables[tableId];
      if (!table) return;

      // Increment schema version for local change
      incrementSchemaVersion();

      const tableName = tableId;
      const currentTableCount = Object.keys(get().tables).length;

      set((state) => {
        const newTables = { ...state.tables };
        delete newTables[tableId];

        const newExpanded = new Set(state.expandedTables);
        newExpanded.delete(tableId);

        return {
          tables: newTables,
          expandedTables: newExpanded,
        };
      });

      // If this was the last table, mark that user intentionally cleared state
      if (currentTableCount === 1) {
        setUserClearedState(true);
        console.log(
          '[Store] User deleted last table - marking state as intentionally cleared',
        );
      }

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.deleteTable(tableName));
      get().saveToLocalStorage();
    },

    reorderTables: (orderedIds) => {
      // Increment schema version for local change
      incrementSchemaVersion();
      set((state) => {
        const newTables: TableState = {};
        // Rebuild tables object in the new order
        orderedIds.forEach((id) => {
          if (state.tables[id]) {
            newTables[id] = state.tables[id];
          }
        });
        // Add any tables that weren't in orderedIds (shouldn't happen, but safe)
        Object.keys(state.tables).forEach((id) => {
          if (!newTables[id]) {
            newTables[id] = state.tables[id];
          }
        });
        return { tables: newTables };
      });
      get().saveToLocalStorage();
    },

    autoArrange: () => {
      // Trigger layout in ReactFlow
      set((state) => ({ layoutTrigger: state.layoutTrigger + 1 }));
    },

    triggerLayout: () => {
      set((state) => ({ layoutTrigger: state.layoutTrigger + 1 }));
    },

    triggerFitView: () => {
      set((state) => ({ fitViewTrigger: state.fitViewTrigger + 1 }));
    },

    triggerZoomIn: () => {
      set((state) => ({ zoomInTrigger: state.zoomInTrigger + 1 }));
    },

    triggerZoomOut: () => {
      set((state) => ({ zoomOutTrigger: state.zoomOutTrigger + 1 }));
    },

    triggerFocusTable: (tableId) => {
      set((state) => ({
        focusTableId: tableId,
        focusTableTrigger: state.focusTableTrigger + 1,
        // Don't set tableHighlighted here - it interferes with drag operations
        // SearchBar will handle highlighting separately if needed
      }));
    },

    setTableSelected: (selected) => set({ tableSelected: selected }),
    setTableHighlighted: (highlighted) =>
      set({ tableHighlighted: highlighted }),
    setConnectorHighlighted: (highlighted) =>
      set({ connectorHighlighted: highlighted }),

    setSchemaView: (view) => {
      set({ schemaView: view });
      if (typeof window !== 'undefined') {
        localStorage.setItem('view', JSON.stringify(view));
      }
    },

    updateSchemaViewTranslate: (x, y) => {
      const newView = {
        ...get().schemaView,
        translate: { x, y },
      };
      get().setSchemaView(newView);
    },

    updateSchemaViewScale: (scale) => {
      const newView = {
        ...get().schemaView,
        scale,
      };
      get().setSchemaView(newView);
    },

    setSupabaseApiKey: (apiKey) => {
      set({ supabaseApiKey: apiKey });
      if (typeof window !== 'undefined') {
        localStorage.setItem('supabase-apikey', JSON.stringify(apiKey));
      }
    },

    setConnectionMode: (mode) => {
      set({ connectionMode: mode });
      if (typeof window !== 'undefined') {
        localStorage.setItem('connection-mode', mode);
      }
    },

    setEdgeRelationship: (edgeId, type) => {
      set((state) => ({
        edgeRelationships: {
          ...state.edgeRelationships,
          [edgeId]: type,
        },
      }));

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.updateRelationship());
      get().saveToLocalStorage();
    },

    getEdgeRelationship: (edgeId) => {
      return get().edgeRelationships[edgeId] || 'one-to-many';
    },

    // Schema grouping actions
    toggleSchemaVisibility: (schema) => {
      set((state) => {
        const newVisibleSchemas = new Set(state.visibleSchemas);
        if (newVisibleSchemas.has(schema)) {
          newVisibleSchemas.delete(schema);
        } else {
          newVisibleSchemas.add(schema);
        }
        return { visibleSchemas: newVisibleSchemas };
      });
      get().saveToLocalStorage();
    },

    toggleSchemaCollapse: (schema) => {
      set((state) => {
        const newCollapsedSchemas = new Set(state.collapsedSchemas);
        if (newCollapsedSchemas.has(schema)) {
          newCollapsedSchemas.delete(schema);
        } else {
          newCollapsedSchemas.add(schema);
        }
        return { collapsedSchemas: newCollapsedSchemas };
      });
      get().saveToLocalStorage();
    },

    showAllSchemas: () => {
      const { tables } = get();
      const allSchemas = new Set<string>();
      Object.values(tables).forEach((table) => {
        if (table.schema) {
          allSchemas.add(table.schema);
        }
      });
      set({ visibleSchemas: allSchemas });
      get().saveToLocalStorage();
    },

    hideAllSchemas: () => {
      set({ visibleSchemas: new Set<string>() });
      get().saveToLocalStorage();
    },

    getVisibleSchemas: () => {
      return Array.from(get().visibleSchemas);
    },

    initializeFromLocalStorage: () => {
      if (typeof window === 'undefined') return;

      try {
        const tablesData = localStorage.getItem('table-list');
        if (tablesData) {
          const loadedTables = JSON.parse(tablesData);
          const { tables: cleanedTables, removedTables } =
            sanitizeTables(loadedTables);

          if (removedTables > 0) {
            console.log(
              `[initializeFromLocalStorage] Cleaned up ${removedTables} dummy table(s)`,
            );
            localStorage.setItem('table-list', JSON.stringify(cleanedTables));
          }

          set({ tables: cleanedTables });
        }

        const viewData = localStorage.getItem('view');
        if (viewData) {
          set({ schemaView: JSON.parse(viewData) });
        }

        const apiKeyData = localStorage.getItem('supabase-apikey');
        if (apiKeyData) {
          set({ supabaseApiKey: JSON.parse(apiKeyData) });
        }

        const edgeRelationshipsData =
          localStorage.getItem('edge-relationships');
        if (edgeRelationshipsData) {
          set({ edgeRelationships: JSON.parse(edgeRelationshipsData) });
        }

        const visibleSchemasData = localStorage.getItem('visible-schemas');
        if (visibleSchemasData) {
          set({ visibleSchemas: new Set(JSON.parse(visibleSchemasData)) });
        } else {
          // Default: show all schemas
          get().showAllSchemas();
        }

        const collapsedSchemasData = localStorage.getItem('collapsed-schemas');
        if (collapsedSchemasData) {
          set({ collapsedSchemas: new Set(JSON.parse(collapsedSchemasData)) });
        }

        const enumTypesData = localStorage.getItem('enum-types');
        if (enumTypesData) {
          try {
            set({ enumTypes: JSON.parse(enumTypesData) });
          } catch (error) {
            console.error('Error parsing enum types from localStorage', error);
          }
        }

        const connectionModeData = localStorage.getItem('connection-mode');
        if (
          connectionModeData === 'strict' ||
          connectionModeData === 'flexible'
        ) {
          set({ connectionMode: connectionModeData as 'strict' | 'flexible' });
        }

        // Try to restore history from localStorage
        const historyData = localStorage.getItem(HISTORY_STORAGE_KEY);
        const state = get();

        if (historyData) {
          const restoredHistory = deserializeHistory(historyData);
          if (restoredHistory && restoredHistory.entries.length > 0) {
            console.log(
              `[initializeFromLocalStorage] Restored ${restoredHistory.entries.length} history entries`,
            );
            set({ history: restoredHistory });
          } else if (Object.keys(state.tables).length > 0) {
            // History invalid or empty, create initial entry
            const entry = createHistoryEntry(
              HistoryLabels.initialState(),
              state.tables,
              state.enumTypes,
              state.edgeRelationships,
            );
            set({
              history: {
                ...state.history,
                entries: [entry],
                currentIndex: 0,
              },
            });
          }
        } else if (Object.keys(state.tables).length > 0) {
          // No history saved, create initial entry
          const entry = createHistoryEntry(
            HistoryLabels.initialState(),
            state.tables,
            state.enumTypes,
            state.edgeRelationships,
          );
          set({
            history: {
              ...state.history,
              entries: [entry],
              currentIndex: 0,
            },
          });
        }
      } catch (error) {
        console.error('Error loading from localStorage:', error);
      }
    },

    saveToLocalStorage: () => {
      // Debounce the save operation to prevent excessive writes
      debouncedSave(performSave);
    },

    addTables: (tablesToAdd: TableState, skipHistory?: boolean) => {
      // Increment schema version for bulk add
      incrementSchemaVersion();
      const tableCount = Object.keys(tablesToAdd).length;

      set((state) => {
        const mergedTables = {
          ...state.tables,
          ...tablesToAdd,
        };

        const { tables: sanitizedTables } = sanitizeTables(mergedTables);
        const updatedVisibleSchemas = new Set(state.visibleSchemas);

        Object.values(tablesToAdd).forEach((table) => {
          if (table.schema) {
            updatedVisibleSchemas.add(table.schema);
          }
        });

        return {
          tables: sanitizedTables,
          visibleSchemas: updatedVisibleSchemas,
        };
      });

      // Push history AFTER state change with the resulting state (unless skipped)
      if (!skipHistory) {
        get().pushHistory(HistoryLabels.bulkAddTables(tableCount));
      }
      get().saveToLocalStorage();
    },

    setEnumTypes: (types) => {
      set({ enumTypes: types });
      get().saveToLocalStorage();
    },

    updateEnumType: (enumKey, values) => {
      const state = get();
      console.log('[updateEnumType] Called with enumKey:', enumKey);
      console.log(
        '[updateEnumType] Available enumTypes keys:',
        Object.keys(state.enumTypes),
      );

      let existingEnum = state.enumTypes[enumKey];
      let actualKey = enumKey;

      // If exact key not found, try to find by name (fallback for schema prefix mismatch)
      if (!existingEnum) {
        console.log(
          '[updateEnumType] Exact key not found, searching by name...',
        );
        const enumName = enumKey.includes('.')
          ? enumKey.split('.').pop()!
          : enumKey;
        const foundEntry = Object.entries(state.enumTypes).find(
          ([key, def]) => def.name === enumName || key.endsWith(`.${enumName}`),
        );
        if (foundEntry) {
          [actualKey, existingEnum] = foundEntry;
          console.log('[updateEnumType] Found by name with key:', actualKey);
        }
      }

      // If enum still not found, create it and update all columns that reference it
      if (!existingEnum) {
        console.log(
          '[updateEnumType] Enum not found in store, creating new enum type and updating columns',
        );

        // Determine schema and name from the key
        const hasSchema = enumKey.includes('.');
        const schema = hasSchema ? enumKey.split('.')[0] : undefined;
        const enumName = hasSchema ? enumKey.split('.').pop()! : enumKey;

        // Create the new enum type
        const newEnumType: EnumTypeDefinition = {
          name: enumName,
          schema,
          values,
        };

        // Update all columns that reference this enum type
        const updatedTables = { ...state.tables };
        Object.entries(updatedTables).forEach(([tableId, table]) => {
          if (!table.columns) return;
          const updatedColumns = table.columns.map((col) => {
            if (col.enumTypeName === enumKey) {
              return {
                ...col,
                enumValues: values,
              };
            }
            return col;
          });
          updatedTables[tableId] = {
            ...table,
            columns: updatedColumns,
          };
        });

        set({
          enumTypes: {
            ...state.enumTypes,
            [enumKey]: newEnumType,
          },
          tables: updatedTables,
        });

        // Push history AFTER state change with the resulting state
        get().pushHistory(HistoryLabels.updateEnum(enumName));
        get().saveToLocalStorage();
        return;
      }

      const enumName = existingEnum.name;

      // Update the enum type definition
      const updatedEnumTypes = {
        ...state.enumTypes,
        [actualKey]: {
          ...existingEnum,
          values,
        },
      };

      // Update all columns that reference this enum type
      const updatedTables = { ...state.tables };
      Object.entries(updatedTables).forEach(([tableId, table]) => {
        if (!table.columns) return;
        const updatedColumns = table.columns.map((col) => {
          if (
            col.enumTypeName === actualKey ||
            col.enumTypeName === enumKey ||
            col.enumTypeName === existingEnum.name
          ) {
            return {
              ...col,
              enumValues: values,
            };
          }
          return col;
        });
        updatedTables[tableId] = {
          ...table,
          columns: updatedColumns,
        };
      });

      set({
        enumTypes: updatedEnumTypes,
        tables: updatedTables,
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.updateEnum(enumName));
      get().saveToLocalStorage();
    },

    createEnumType: (name, schema, values) => {
      const enumKey = schema ? `${schema}.${name}` : name;
      const newEnum: EnumTypeDefinition = {
        name,
        schema,
        values,
      };

      set((state) => ({
        enumTypes: {
          ...state.enumTypes,
          [enumKey]: newEnum,
        },
      }));

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.createEnum(name));
      get().saveToLocalStorage();
    },

    deleteEnumType: (enumKey) => {
      const state = get();
      const enumToDelete = state.enumTypes[enumKey];
      if (!enumToDelete) return;

      const enumName = enumToDelete.name;

      // Remove from enumTypes
      const { [enumKey]: _, ...remainingEnums } = state.enumTypes;

      // Clear enum references from columns using this type
      const updatedTables = { ...state.tables };
      Object.entries(updatedTables).forEach(([tableId, table]) => {
        if (!table.columns) return;
        const updatedColumns = table.columns.map((col) => {
          if (
            col.enumTypeName === enumKey ||
            col.enumTypeName === enumToDelete.name
          ) {
            return {
              ...col,
              format: 'varchar',
              type: 'string',
              enumTypeName: undefined,
              enumValues: undefined,
            };
          }
          return col;
        });
        updatedTables[tableId] = {
          ...table,
          columns: updatedColumns,
        };
      });

      set({
        enumTypes: remainingEnums,
        tables: updatedTables,
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.deleteEnum(enumName));
      get().saveToLocalStorage();
    },

    renameEnumType: (oldKey, newName) => {
      const state = get();
      const existingEnum = state.enumTypes[oldKey];
      if (!existingEnum) return;

      const oldName = existingEnum.name;

      // Determine new key
      const newKey = existingEnum.schema
        ? `${existingEnum.schema}.${newName}`
        : newName;

      // Create updated enum with new name
      const { [oldKey]: _, ...remainingEnums } = state.enumTypes;
      const updatedEnumTypes = {
        ...remainingEnums,
        [newKey]: {
          ...existingEnum,
          name: newName,
        },
      };

      // Update all columns that reference this enum type
      const updatedTables = { ...state.tables };
      Object.entries(updatedTables).forEach(([tableId, table]) => {
        if (!table.columns) return;
        const updatedColumns = table.columns.map((col) => {
          if (
            col.enumTypeName === oldKey ||
            col.enumTypeName === existingEnum.name
          ) {
            return {
              ...col,
              enumTypeName: newKey,
            };
          }
          return col;
        });
        updatedTables[tableId] = {
          ...table,
          columns: updatedColumns,
        };
      });

      set({
        enumTypes: updatedEnumTypes,
        tables: updatedTables,
      });

      // Push history AFTER state change with the resulting state
      get().pushHistory(HistoryLabels.renameEnum(oldName, newName));
      get().saveToLocalStorage();
    },

    getEnumType: (enumKey) => {
      return get().enumTypes[enumKey];
    },

    // History actions
    pushHistory: (label) => {
      const state = get();
      const currentHistory = state.history;

      // Create entry with CURRENT state (after action has been applied)
      const entry = createHistoryEntry(
        label,
        state.tables,
        state.enumTypes,
        state.edgeRelationships,
      );

      // Check if this would be a duplicate (no actual change)
      if (currentHistory.entries.length > 0) {
        const currentEntry =
          currentHistory.entries[currentHistory.currentIndex];
        if (
          currentEntry &&
          !areSnapshotsDifferent(currentEntry.snapshot, entry.snapshot)
        ) {
          console.log(
            `[pushHistory] Skipping duplicate entry for "${label}" - no state change detected`,
          );
          return;
        }
      }

      console.log(`[pushHistory] Adding entry: "${label}"`, {
        entriesBefore: currentHistory.entries.length,
        currentIndex: currentHistory.currentIndex,
        tableCount: Object.keys(state.tables).length,
      });

      set((state) => ({
        history: pushHistoryEntry(state.history, entry),
      }));

      // Persist history to localStorage
      const newHistory = get().history;
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, serializeHistory(newHistory));
      } catch (error) {
        console.warn('[pushHistory] Failed to persist history:', error);
      }
    },

    undo: () => {
      // Increment schema version to invalidate any in-flight AI responses
      incrementSchemaVersion();

      const { history } = get();
      console.log('[Undo] Before:', {
        currentIndex: history.currentIndex,
        entriesCount: history.entries.length,
        canUndo: historyCanUndo(history),
        entries: history.entries.map((e, i) => ({
          index: i,
          label: e.label,
          tablePositions: Object.entries(e.snapshot.tables).map(([k, t]) => ({
            id: k,
            x: t.position?.x,
            y: t.position?.y,
          })),
        })),
      });

      if (!historyCanUndo(history)) {
        console.log('[Undo] Cannot undo - at initial state');
        return;
      }

      // Go to the previous entry (the state BEFORE the current action)
      const prevEntry = history.entries[history.currentIndex - 1];
      console.log('[Undo] Restoring to entry:', {
        index: history.currentIndex - 1,
        label: prevEntry.label,
        tableNames: Object.keys(prevEntry.snapshot.tables),
        positions: Object.entries(prevEntry.snapshot.tables).map(([k, t]) => ({
          id: k,
          x: t.position?.x,
          y: t.position?.y,
        })),
      });

      const newHistory = {
        ...history,
        currentIndex: history.currentIndex - 1,
      };

      set({
        tables: deepClone(prevEntry.snapshot.tables),
        enumTypes: deepClone(prevEntry.snapshot.enumTypes),
        edgeRelationships: deepClone(prevEntry.snapshot.edgeRelationships),
        history: newHistory,
      });

      const newState = get();
      console.log('[Undo] After:', {
        currentIndex: newState.history.currentIndex,
        tableNames: Object.keys(newState.tables),
        canUndo: historyCanUndo(newState.history),
        canRedo: historyCanRedo(newState.history),
      });

      // Persist history and state
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, serializeHistory(newHistory));
      } catch (error) {
        console.warn('[Undo] Failed to persist history:', error);
      }
      get().saveToLocalStorage();
    },

    redo: () => {
      // Increment schema version to invalidate any in-flight AI responses
      incrementSchemaVersion();

      const { history } = get();
      console.log('[Redo] Before:', {
        currentIndex: history.currentIndex,
        entriesCount: history.entries.length,
        canRedo: historyCanRedo(history),
        entries: history.entries.map((e, i) => ({
          index: i,
          label: e.label,
          tablePositions: Object.entries(e.snapshot.tables).map(([k, t]) => ({
            id: k,
            x: t.position?.x,
            y: t.position?.y,
          })),
        })),
      });

      if (!historyCanRedo(history)) {
        console.log('[Redo] Cannot redo - at end of history');
        return;
      }

      // Go to the next entry (the state AFTER the redone action)
      const nextEntry = history.entries[history.currentIndex + 1];
      console.log('[Redo] Restoring to entry:', {
        index: history.currentIndex + 1,
        label: nextEntry.label,
        tableNames: Object.keys(nextEntry.snapshot.tables),
        positions: Object.entries(nextEntry.snapshot.tables).map(([k, t]) => ({
          id: k,
          x: t.position?.x,
          y: t.position?.y,
        })),
      });

      const newHistory = {
        ...history,
        currentIndex: history.currentIndex + 1,
      };

      set({
        tables: deepClone(nextEntry.snapshot.tables),
        enumTypes: deepClone(nextEntry.snapshot.enumTypes),
        edgeRelationships: deepClone(nextEntry.snapshot.edgeRelationships),
        history: newHistory,
      });

      const newState = get();
      console.log('[Redo] After:', {
        currentIndex: newState.history.currentIndex,
        tableNames: Object.keys(newState.tables),
        canUndo: historyCanUndo(newState.history),
        canRedo: historyCanRedo(newState.history),
      });

      // Persist history and state
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, serializeHistory(newHistory));
      } catch (error) {
        console.warn('[Redo] Failed to persist history:', error);
      }
      get().saveToLocalStorage();
    },

    canUndo: () => historyCanUndo(get().history),

    canRedo: () => historyCanRedo(get().history),

    getUndoLabel: () => historyGetUndoLabel(get().history),

    getRedoLabel: () => historyGetRedoLabel(get().history),

    clearHistory: () => {
      // Create a fresh history with current state as the initial entry
      const state = get();
      const entry = createHistoryEntry(
        HistoryLabels.initialState(),
        state.tables,
        state.enumTypes,
        state.edgeRelationships,
      );

      const newHistory: HistoryState = {
        entries: [entry],
        currentIndex: 0,
        maxEntries: state.history.maxEntries,
      };

      set({ history: newHistory });

      // Persist cleared history
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, serializeHistory(newHistory));
      } catch (error) {
        console.warn(
          '[clearHistory] Failed to persist cleared history:',
          error,
        );
      }

      console.log(
        '[clearHistory] History cleared, created fresh initial state',
      );
    },

    clearCache: () => {
      if (typeof window === 'undefined') return;

      try {
        // Mark that user intentionally cleared the state
        setUserClearedState(true);

        // Clear all schema-related data from localStorage
        localStorage.removeItem('table-list');
        localStorage.removeItem('edge-relationships');
        localStorage.removeItem('visible-schemas');
        localStorage.removeItem('collapsed-schemas');
        localStorage.removeItem('enum-types');
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        localStorage.removeItem(STORAGE_TIMESTAMP_KEY);

        // Reset history state completely
        set({ history: createInitialHistoryState() });

        // Clear timeout if pending
        if (saveTimeoutId) {
          clearTimeout(saveTimeoutId);
          saveTimeoutId = null;
        }

        console.log(
          'Cache cleared successfully (including history) - user cleared flag set',
        );

        // Dispatch event for UI feedback
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('storage:cleared'));
        }
      } catch (error) {
        console.error('Error clearing cache:', error);
      }
    },
  };
});
