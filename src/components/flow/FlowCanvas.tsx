'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ReactFlowProvider,
  Edge,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '@/lib/store';
import { ViewNode } from './ViewNode';
import { SmartTableNode } from './SmartTableNode';
import { CustomEdge } from './CustomEdge';
import { RelationshipSelector } from './RelationshipSelector';
import {
  ContextMenu,
  createNodeContextMenu,
  createEdgeContextMenu,
} from './ContextMenu';
import { tablesToNodes, tablesToEdges, getAllSchemas } from '@/lib/flow-utils';
import { HistoryLabels } from '@/lib/history';
import { getLayoutedNodesWithSchemas } from '@/lib/layout';
import { RelationshipType, FlowEdge } from '@/types/flow';
import { MarkerType } from '@xyflow/react';
import { toast } from 'sonner';

import { Table, TableState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { debugLog } from '@/lib/debug';

const nodeTypes = {
  table: SmartTableNode,
  view: ViewNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

type CopiedTableEntry = {
  key: string;
  table: Table;
};

type CopiedSelection = {
  tables: CopiedTableEntry[];
  center: {
    x: number;
    y: number;
  };
};

const cloneTable = (table: Table): Table => JSON.parse(JSON.stringify(table));

const buildCandidateKey = (
  schema: string | undefined,
  baseName: string,
  attempt: number,
) => {
  const suffix = attempt === 1 ? '_copy' : `_copy_${attempt}`;
  const nameWithSuffix = `${baseName}${suffix}`;
  return schema ? `${schema}.${nameWithSuffix}` : nameWithSuffix;
};

const createUniqueTableKey = (baseKey: string, occupiedKeys: Set<string>) => {
  const parts = baseKey.split('.');
  const schema = parts.length > 1 ? parts[0] : undefined;
  const baseName = parts.length > 1 ? parts.slice(1).join('.') : baseKey;

  let attempt = 1;
  let candidate = buildCandidateKey(schema, baseName, attempt);

  while (occupiedKeys.has(candidate)) {
    attempt += 1;
    candidate = buildCandidateKey(schema, baseName, attempt);
  }

  return candidate;
};

type ParsedForeignKey = {
  schema?: string;
  table: string;
  column: string;
};

const parseForeignKey = (fk?: string | null): ParsedForeignKey | null => {
  if (!fk) return null;
  const cleaned = fk.trim();
  if (!cleaned) return null;
  const segments = cleaned.split('.');
  if (segments.length < 2) return null;

  const column = segments.pop()!;
  const table = segments.pop()!;
  const schema = segments.length > 0 ? segments.join('.') : undefined;

  return { schema, table, column };
};

const isInputLikeElement = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  );
};

/**
 * Get the type category for a PostgreSQL data type.
 * Types in the same category are compatible for FK relationships.
 *
 * NOTE: Unknown/empty types return an empty category string and emit a dev-only
 * warning. Callers (e.g. `areTypesCompatible`) should treat empty categories as
 * incompatible in strict mode unless the raw types are exactly equal.
 */
const getTypeCategory = (type: string): string => {
  const rawType = (type || '').trim();

  // Guard: no discernible type
  if (!rawType) {
    debugLog.warn(
      '[FlowCanvas] getTypeCategory called with empty/unknown type',
    );
    return '';
  }

  const t = rawType.toLowerCase();

  // UUID type
  if (t === 'uuid') return 'uuid';

  // Integer types (all compatible with each other)
  if (
    t === 'integer' ||
    t === 'int' ||
    t === 'int4' ||
    t === 'smallint' ||
    t === 'int2' ||
    t === 'bigint' ||
    t === 'int8' ||
    t === 'serial' ||
    t === 'smallserial' ||
    t === 'bigserial' ||
    t.includes('serial')
  ) {
    return 'integer';
  }

  // Numeric/decimal types
  if (
    t === 'numeric' ||
    t === 'decimal' ||
    t.startsWith('numeric(') ||
    t.startsWith('decimal(')
  ) {
    return 'numeric';
  }

  // Floating point types
  if (
    t === 'real' ||
    t === 'float4' ||
    t === 'double precision' ||
    t === 'float8' ||
    t.startsWith('float')
  ) {
    return 'float';
  }

  // String types (varchar, char, text are compatible)
  if (
    t === 'text' ||
    t === 'varchar' ||
    t === 'char' ||
    t === 'character' ||
    t === 'character varying' ||
    t.startsWith('varchar(') ||
    t.startsWith('char(') ||
    t.startsWith('character(') ||
    t.startsWith('character varying(')
  ) {
    return 'string';
  }

  // Boolean type
  if (t === 'boolean' || t === 'bool') return 'boolean';

  // Date type
  if (t === 'date') return 'date';

  // Time types (time with/without timezone)
  if (t === 'time' || t.startsWith('time ') || t === 'timetz') return 'time';

  // Timestamp types (timestamp with/without timezone)
  if (
    t === 'timestamp' ||
    t === 'timestamptz' ||
    t.startsWith('timestamp ') ||
    t === 'timestamp with time zone' ||
    t === 'timestamp without time zone'
  ) {
    return 'timestamp';
  }

  // JSON types (json and jsonb are compatible)
  if (t === 'json' || t === 'jsonb') return 'json';

  // Bytea (binary)
  if (t === 'bytea') return 'bytea';

  // Array types - extract base type
  if (t.endsWith('[]')) {
    const baseType = t.slice(0, -2);
    return `array:${getTypeCategory(baseType)}`;
  }

  // Enum types - return as-is for exact matching
  if (t === 'enum') return 'enum';

  // For unknown types, return as-is (will require exact match)
  return t;
};

/**
 * Check if two PostgreSQL types are compatible for FK relationships.
 * In strict mode, types must be in the same category.
 *
 * Conservative behavior for unknown types:
 * - If either category is empty (unknown) and types don't match exactly, they're incompatible
 * - This prevents accidental connections between columns with missing type information
 */
const areTypesCompatible = (
  sourceType: string,
  targetType: string,
): boolean => {
  const sourceCategory = getTypeCategory(sourceType);
  const targetCategory = getTypeCategory(targetType);

  // Guard: if either category is unknown (empty) and types don't match exactly, incompatible
  if (sourceCategory === '' || targetCategory === '') {
    // Only allow if raw types are exactly equal
    const isExactMatch =
      sourceType.trim().toLowerCase() === targetType.trim().toLowerCase();
    if (!isExactMatch) {
      debugLog.warn(
        '[FlowCanvas] Type compatibility denied due to unknown category',
        { sourceType, targetType, sourceCategory, targetCategory },
      );
    }
    return isExactMatch;
  }

  // Same category = compatible
  if (sourceCategory === targetCategory) return true;

  // Special case: integer and numeric can reference each other (common pattern)
  if (
    (sourceCategory === 'integer' && targetCategory === 'numeric') ||
    (sourceCategory === 'numeric' && targetCategory === 'integer')
  ) {
    return true;
  }

  return false;
};

function FlowCanvasInner() {
  const {
    tables,
    updateTablePosition,
    setTablePositions,
    updateColumn,
    getEdgeRelationship,
    setEdgeRelationship,
    layoutTrigger,
    fitViewTrigger,
    zoomInTrigger,
    zoomOutTrigger,
    focusTableId,
    focusTableTrigger,
    visibleSchemas,
    expandTable,
    deleteTable,
    pushHistory,
  } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedEdge, setSelectedEdge] = useState<{
    id: string;
    type: RelationshipType;
    position: { x: number; y: number };
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    type: 'node' | 'edge';
    x: number;
    y: number;
    nodeId?: string;
    edgeId?: string;
    isView?: boolean;
  } | null>(null);
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(
    new Set(),
  );
  const copiedSelectionRef = useRef<CopiedSelection | null>(null);
  const pasteOffsetRef = useRef(0);

  // Track manually deleted edges to prevent auto-restore
  const deletedEdgesRef = useRef<Set<string>>(new Set());

  // Track when connection is being dragged to show handles on all nodes
  const [isConnecting, setIsConnecting] = useState(false);

  // Connection mode stored in global state (persisted by the store)
  const connectionMode = useStore((s) => s.connectionMode);

  const { fitView, zoomIn, zoomOut, getZoom, screenToFlowPosition } =
    useReactFlow();

  // Use refs to avoid dependency on functions
  const reactFlowRef = useRef({ fitView, zoomIn, zoomOut, getZoom });
  useEffect(() => {
    reactFlowRef.current = { fitView, zoomIn, zoomOut, getZoom };
  }, [fitView, zoomIn, zoomOut, getZoom]);
  const nodesRef = useRef<any[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const lastCursorPositionRef = useRef<{ x: number; y: number } | null>(null);
  const pasteInProgressRef = useRef(false);

  const updateCursorPosition = useCallback(
    (event: React.MouseEvent) => {
      if (!screenToFlowPosition) return;
      lastCursorPositionRef.current = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
    },
    [screenToFlowPosition],
  );

  // Track pending layout trigger to auto-trigger after nodes are set
  const pendingLayoutRef = useRef(false);
  const currentLayoutTriggerRef = useRef(0);
  const isApplyingLayoutRef = useRef(false);
  const fitViewRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Convert tables to nodes and edges when tables change (ASYNC to prevent blocking)
  useEffect(() => {
    // Use setTimeout(0) to yield to browser rendering, preventing UI freeze
    const timeoutId = setTimeout(() => {
      // Check INSIDE the timeout to get the latest ref value, not a stale closure
      // This prevents the race condition where position updates trigger table changes
      // which then overwrite the layout positions
      if (isApplyingLayoutRef.current) {
        debugLog.log(
          '[FlowCanvas] Skipping tables-to-nodes conversion - layout in progress',
        );
        return;
      }

      debugLog.log('[FlowCanvas] Converting tables to nodes/edges...', {
        tableCount: Object.keys(tables).length,
        visibleSchemasSize: visibleSchemas.size,
        visibleSchemas: Array.from(visibleSchemas),
        isApplyingLayout: isApplyingLayoutRef.current,
      });

      // Filter tables by visible schemas
      // Check if any schemas exist in the database
      const allSchemas = getAllSchemas(tables);
      const hasSchemas = allSchemas.length > 0;

      const filteredTables = Object.entries(tables).reduce(
        (acc, [key, table]) => {
          if (!hasSchemas) {
            // No schemas exist - show all tables (default state)
            acc[key] = table;
          } else if (visibleSchemas.size === 0) {
            // Schemas exist but user hid all of them - hide everything
            // Don't add table to acc
          } else {
            // Only show tables that have a schema in visibleSchemas, or tables without schemas
            if (!table.schema || visibleSchemas.has(table.schema)) {
              acc[key] = table;
            }
          }
          return acc;
        },
        {} as typeof tables,
      );

      const flowNodes = tablesToNodes(filteredTables);
      // Ensure all nodes have unique IDs
      const nodesWithUniqueIds = flowNodes.map((node, index) => ({
        ...node,
        id: node.id || `node-${index}`, // Fallback ID if missing
      }));

      const flowEdges: FlowEdge[] = tablesToEdges(filteredTables)
        .filter((edge) => !deletedEdgesRef.current.has(edge.id))
        .map((edge, index) => {
          const relationshipType = getEdgeRelationship(edge.id);

          const markerEnd = {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: '#6B7280',
          };

          const markerStart =
            relationshipType === 'many-to-many'
              ? {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                  color: '#6B7280',
                }
              : undefined;

          // Ensure edge.data exists and has required properties
          if (!edge.data) {
            throw new Error(`Edge ${edge.id} is missing data property`);
          }

          return {
            ...edge,
            id: edge.id || `edge-${index}`, // Ensure edge has ID
            type: 'custom',
            markerEnd,
            markerStart,
            data: {
              sourceColumn: edge.data.sourceColumn,
              targetColumn: edge.data.targetColumn,
              relationshipType,
            },
          } as FlowEdge;
        });

      debugLog.log(
        `[FlowCanvas] Setting ${nodesWithUniqueIds.length} nodes and ${flowEdges.length} edges`,
      );
      setNodes(nodesWithUniqueIds);
      setEdges(flowEdges);
      debugLog.log('[FlowCanvas] Nodes/edges set');

      // Reset pending flag if tables are empty
      if (nodesWithUniqueIds.length === 0) {
        pendingLayoutRef.current = false;
        return;
      }

      // If layout was triggered before nodes were ready, trigger it now
      // Use double requestAnimationFrame to ensure React has fully processed state updates
      if (
        pendingLayoutRef.current &&
        nodesWithUniqueIds.length > 0 &&
        flowEdges.length > 0 &&
        !isApplyingLayoutRef.current
      ) {
        isApplyingLayoutRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            debugLog.log('[FlowCanvas] Auto-triggering layout after nodes set');
            const layoutedNodes = getLayoutedNodesWithSchemas(
              nodesWithUniqueIds,
              flowEdges,
              { direction: 'TB' },
            );
            setNodes(layoutedNodes);

            // Update positions in store using batch update
            const positions: Record<string, { x: number; y: number }> = {};
            layoutedNodes.forEach((node) => {
              positions[node.id] = { x: node.position.x, y: node.position.y };
            });
            setTablePositions(positions);

            // Fit view after layout
            setTimeout(() => {
              reactFlowRef.current.fitView({ padding: 0.2, duration: 400 });
              // Keep the flag set for a bit longer to prevent any late table->node conversions
              setTimeout(() => {
                isApplyingLayoutRef.current = false;
              }, 200);
            }, 50);

            pendingLayoutRef.current = false;
            currentLayoutTriggerRef.current = 0;
          });
        });
      }
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    tables,
    visibleSchemas,
    setNodes,
    setEdges,
    getEdgeRelationship,
    setTablePositions,
  ]);

  // Listen for layout trigger from store
  useEffect(() => {
    // Skip if we're currently applying layout to prevent infinite loops
    if (isApplyingLayoutRef.current) {
      return;
    }

    // Only process if trigger actually changed (prevents duplicate runs)
    if (
      layoutTrigger > 0 &&
      layoutTrigger !== currentLayoutTriggerRef.current
    ) {
      currentLayoutTriggerRef.current = layoutTrigger;

      if (nodes.length > 0 && edges.length > 0) {
        // Nodes are ready, layout immediately
        debugLog.log('[FlowCanvas] Layout triggered, nodes ready');
        isApplyingLayoutRef.current = true;

        // Use requestAnimationFrame to ensure we're not blocking
        requestAnimationFrame(() => {
          const layoutedNodes = getLayoutedNodesWithSchemas(nodes, edges, {
            direction: 'TB',
          });
          setNodes(layoutedNodes);

          // Update positions in store using batch update
          const positions: Record<string, { x: number; y: number }> = {};
          layoutedNodes.forEach((node) => {
            positions[node.id] = { x: node.position.x, y: node.position.y };
          });
          setTablePositions(positions);

          // Fit view after layout - retry if ReactFlow isn't ready
          let retryCount = 0;
          const maxRetries = 20; // Maximum 1 second of retries (20 * 50ms)
          const attemptFitView = () => {
            if (reactFlowRef.current?.fitView) {
              reactFlowRef.current.fitView({ padding: 0.2, duration: 400 });
              // Keep the flag set for a bit longer to prevent any late table->node conversions
              setTimeout(() => {
                isApplyingLayoutRef.current = false;
              }, 200);
            } else if (retryCount < maxRetries) {
              retryCount++;
              // Retry after a short delay if ReactFlow isn't ready yet
              setTimeout(attemptFitView, 50);
            } else {
              // Max retries reached, stop trying
              setTimeout(() => {
                isApplyingLayoutRef.current = false;
              }, 200);
            }
          };
          setTimeout(attemptFitView, 50);
        });
      } else {
        // Nodes not ready yet, mark as pending
        debugLog.log(
          '[FlowCanvas] Layout triggered but nodes not ready, marking as pending',
        );
        pendingLayoutRef.current = true;
      }
    }
  }, [layoutTrigger, nodes, edges, setNodes, setTablePositions]);

  // Listen for fit view trigger from store
  useEffect(() => {
    // Clear any pending retry
    if (fitViewRetryTimeoutRef.current) {
      clearTimeout(fitViewRetryTimeoutRef.current);
      fitViewRetryTimeoutRef.current = null;
    }

    if (fitViewTrigger > 0) {
      let retryCount = 0;
      const maxRetries = 20; // Maximum 1 second of retries (20 * 50ms)
      const attemptFitView = () => {
        if (reactFlowRef.current?.fitView) {
          reactFlowRef.current.fitView({ padding: 0.2, duration: 400 });
          fitViewRetryTimeoutRef.current = null;
        } else if (retryCount < maxRetries) {
          retryCount++;
          // Retry after a short delay if ReactFlow isn't ready yet
          fitViewRetryTimeoutRef.current = setTimeout(attemptFitView, 50);
        } else {
          fitViewRetryTimeoutRef.current = null;
        }
      };
      attemptFitView();
    }

    // Cleanup on unmount or when trigger changes
    return () => {
      if (fitViewRetryTimeoutRef.current) {
        clearTimeout(fitViewRetryTimeoutRef.current);
        fitViewRetryTimeoutRef.current = null;
      }
    };
  }, [fitViewTrigger]);

  // Listen for zoom in trigger
  useEffect(() => {
    if (zoomInTrigger > 0 && reactFlowRef.current?.zoomIn) {
      reactFlowRef.current.zoomIn({ duration: 200 });
      setTimeout(() => {
        const zoom = reactFlowRef.current?.getZoom?.();
        if (zoom !== undefined) {
          window.dispatchEvent(
            new CustomEvent('reactflow:zoom', { detail: { zoom } }),
          );
        }
      }, 250);
    }
  }, [zoomInTrigger]);

  // Listen for zoom out trigger
  useEffect(() => {
    if (zoomOutTrigger > 0 && reactFlowRef.current?.zoomOut) {
      reactFlowRef.current.zoomOut({ duration: 200 });
      setTimeout(() => {
        const zoom = reactFlowRef.current?.getZoom?.();
        if (zoom !== undefined) {
          window.dispatchEvent(
            new CustomEvent('reactflow:zoom', { detail: { zoom } }),
          );
        }
      }, 250);
    }
  }, [zoomOutTrigger]);

  // Listen for focus table trigger (from search)
  useEffect(() => {
    if (focusTableTrigger > 0 && focusTableId) {
      const node = nodes.find((n) => n.id === focusTableId);
      if (node && reactFlowRef.current?.fitView) {
        reactFlowRef.current.fitView({
          nodes: [node],
          padding: 0.3,
          duration: 600,
          maxZoom: 1.2,
        });

        setTimeout(() => {
          useStore.setState({ focusTableId: null });
        }, 650);
      }
    }
  }, [focusTableTrigger, focusTableId, nodes]);

  // Emit initial zoom level (only once on mount)
  useEffect(() => {
    const zoom = reactFlowRef.current?.getZoom?.();
    if (zoom !== undefined) {
      window.dispatchEvent(
        new CustomEvent('reactflow:zoom', { detail: { zoom } }),
      );
    }
  }, []); // Empty deps - only run once

  // Handle ReactFlow zoom changes to update display
  const onMove = useCallback(() => {
    const zoom = reactFlowRef.current?.getZoom?.();
    if (zoom !== undefined) {
      window.dispatchEvent(
        new CustomEvent('reactflow:zoom', { detail: { zoom } }),
      );
    }
  }, []); // No deps - use ref

  const copySelectedTables = useCallback(() => {
    const selectedNodes =
      nodesRef.current?.filter((node) => node.selected) ?? [];

    if (!selectedNodes.length) {
      toast.error('Select at least one table to copy');
      return false;
    }

    const storeTables = useStore.getState().tables;
    const copiedTables: CopiedTableEntry[] = selectedNodes
      .map((node) => {
        const tableData = storeTables[node.id];
        if (!tableData) return null;
        return {
          key: node.id,
          table: cloneTable(tableData),
        };
      })
      .filter(Boolean) as CopiedTableEntry[];

    if (!copiedTables.length) {
      toast.error('Unable to copy the selected tables');
      return false;
    }

    const xs = copiedTables.map(({ table }) => table.position?.x ?? 0);
    const ys = copiedTables.map(({ table }) => table.position?.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };

    copiedSelectionRef.current = { tables: copiedTables, center };
    pasteOffsetRef.current = 0;
    toast.success(
      `Copied ${copiedTables.length} table${
        copiedTables.length === 1 ? '' : 's'
      }`,
    );
    return true;
  }, []);

  const pasteCopiedTables = useCallback(() => {
    // Prevent duplicate pastes with debouncing
    if (pasteInProgressRef.current) {
      return false;
    }

    const payload = copiedSelectionRef.current;

    if (!payload || payload.tables.length === 0) {
      toast.error('Copy tables first before pasting');
      return false;
    }

    pasteInProgressRef.current = true;

    const state = useStore.getState();
    const existingKeys = new Set(Object.keys(state.tables));
    const newTables: TableState = {};
    const newKeyMap = new Map<string, string>();

    const payloadCenter = payload.center ?? { x: 0, y: 0 };
    const cursorPosition = lastCursorPositionRef.current;
    let deltaX = 0;
    let deltaY = 0;

    if (cursorPosition) {
      deltaX = cursorPosition.x - payloadCenter.x;
      deltaY = cursorPosition.y - payloadCenter.y;
      pasteOffsetRef.current = 0;
    } else {
      pasteOffsetRef.current += 1;
      const offsetAmount = pasteOffsetRef.current * 40;
      deltaX = offsetAmount;
      deltaY = offsetAmount;
    }

    payload.tables.forEach(({ key, table }) => {
      const nextKey = createUniqueTableKey(key, existingKeys);
      existingKeys.add(nextKey);
      newKeyMap.set(key, nextKey);

      const duplicatedTable = cloneTable(table);
      duplicatedTable.title = nextKey;
      const baseX = duplicatedTable.position?.x ?? 0;
      const baseY = duplicatedTable.position?.y ?? 0;
      duplicatedTable.position = {
        x: baseX + deltaX,
        y: baseY + deltaY,
      };

      newTables[nextKey] = duplicatedTable;
    });

    Object.values(newTables).forEach((table) => {
      if (!table.columns) return;

      table.columns = table.columns.map((column) => {
        if (!column.fk) {
          return { ...column };
        }

        const parsed = parseForeignKey(column.fk);
        if (!parsed) {
          return { ...column };
        }

        const originalTargetKey = parsed.schema
          ? `${parsed.schema}.${parsed.table}`
          : parsed.table;

        if (newKeyMap.has(originalTargetKey)) {
          const mappedKey = newKeyMap.get(originalTargetKey)!;
          return {
            ...column,
            fk: `${mappedKey}.${parsed.column}`,
          };
        }

        return { ...column, fk: undefined };
      });
    });

    state.addTables(newTables);
    const newCount = Object.keys(newTables).length;
    toast.success(`Pasted ${newCount} table${newCount === 1 ? '' : 's'}`);

    // Reset paste flag after a short delay to prevent rapid duplicate pastes
    setTimeout(() => {
      pasteInProgressRef.current = false;
    }, 100);

    return true;
  }, []);

  // Keyboard shortcuts (memoized to prevent re-creation)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
      const isInputField = isInputLikeElement(event.target);

      // Ctrl/Cmd + A: Select all nodes
      if (cmdOrCtrl && event.key === 'a') {
        if (isInputField) return;
        event.preventDefault();
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            selected: true,
          })),
        );
      }

      // Ctrl/Cmd + C: Copy selection
      if (cmdOrCtrl && event.key.toLowerCase() === 'c') {
        if (isInputField) return;
        const copied = copySelectedTables();
        if (copied) {
          event.preventDefault();
        }
      }

      // Ctrl/Cmd + V: Paste copied tables
      if (cmdOrCtrl && event.key.toLowerCase() === 'v') {
        if (isInputField) return;
        if (pasteInProgressRef.current) {
          event.preventDefault();
          return;
        }
        event.preventDefault(); // Prevent React Flow's built-in paste
        const pasted = pasteCopiedTables();
        if (!pasted) {
          // If paste failed, reset the flag immediately
          pasteInProgressRef.current = false;
        }
      }

      // Delete / Backspace: Let ReactFlow handle this via onNodesDelete callback
      // (ReactFlow's built-in delete handling triggers onNodesDelete which calls deleteTable)

      // Space: Fit view (ignore when typing)
      if (event.code === 'Space') {
        if (!isInputField) {
          event.preventDefault();
          reactFlowRef.current.fitView({ padding: 0.2, duration: 400 });
        }
      }

      // Escape: Clear selection
      if (event.key === 'Escape') {
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            selected: false,
          })),
        );
        setSelectedEdge(null);
        setHighlightedEdges(new Set());
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'v' || key === 'meta' || key === 'control') {
        pasteInProgressRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setNodes, setEdges, copySelectedTables, pasteCopiedTables]);

  // Handle node drag start - no history push here anymore
  // We push history AFTER the drag completes with the new positions
  const onNodeDragStart = useCallback(
    (_event: any, _node: any, _nodes: any[]) => {
      // Intentionally empty - history is pushed at drag end with final positions
    },
    [],
  );

  // Handle node drag end to sync position back to store AND push history
  const onNodeDragStop = useCallback(
    (_event: any, node: any, nodes: any[]) => {
      // Update all dragged nodes' positions (handles multi-select drag)
      nodes.forEach((n: any) => {
        updateTablePosition(n.id, n.position.x, n.position.y);
      });

      // Push history AFTER positions are updated with the resulting state
      if (nodes.length > 1) {
        pushHistory(HistoryLabels.moveTables(nodes.length));
      } else {
        pushHistory(HistoryLabels.moveTable(node.id));
      }
    },
    [updateTablePosition, pushHistory],
  );

  // Handle node deletion from ReactFlow (keyboard Delete/Backspace triggers this)
  const onNodesDelete = useCallback(
    (deleted: any[]) => {
      // Delete tables from store (this persists the deletion)
      deleted.forEach((node) => {
        deleteTable(node.id);
      });

      if (deleted.length > 0) {
        toast.success(
          `Deleted ${deleted.length} table${deleted.length > 1 ? 's' : ''}`,
          {
            position: 'bottom-center',
            duration: 2000,
          },
        );
      }
    },
    [deleteTable],
  );

  // Track connection start to show handles on all nodes
  const onConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, []);

  // Track connection end to hide handles
  const onConnectEnd = useCallback(() => {
    setIsConnecting(false);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      debugLog.log('[onConnect] Connection attempt:', {
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
      });

      // Block connecting a column to itself
      if (
        params.source === params.target &&
        params.sourceHandle === params.targetHandle
      ) {
        debugLog.log('[onConnect] Blocked: self-column connection');
        toast.error('Cannot connect column to itself', {
          description: 'A column cannot reference itself',
          position: 'bottom-center',
          duration: 2000,
        });
        return;
      }

      // Validate in strict mode - check type compatibility
      if (connectionMode === 'strict') {
        const sourceNode = nodes.find((n) => n.id === params.source);
        const targetNode = nodes.find((n) => n.id === params.target);
        if (sourceNode && targetNode) {
          const sourceHandleId = params.sourceHandle;
          const targetHandleId = params.targetHandle;
          if (sourceHandleId && targetHandleId) {
            const sourceColumn = sourceNode.data.columns?.find(
              (_col: any, index: number) => {
                const handleId = `${sourceNode.id}_${_col.title}_${index}`;
                return handleId === sourceHandleId;
              },
            );
            const targetColumn = targetNode.data.columns?.find(
              (_col: any, index: number) => {
                const handleId = `${targetNode.id}_${_col.title}_${index}`;
                return handleId === targetHandleId;
              },
            );

            // In strict mode, validate type compatibility using category matching
            // Use format first (contains PostgreSQL type like uuid, varchar) instead of type (generic like string, number)
            const sourceType = sourceColumn?.format || sourceColumn?.type || '';
            const targetType = targetColumn?.format || targetColumn?.type || '';
            const isTypeCompatible = areTypesCompatible(sourceType, targetType);

            debugLog.log('[onConnect] Strict mode check:', {
              sourceColumn: sourceColumn?.title,
              targetColumn: targetColumn?.title,
              sourceType,
              targetType,
              sourceCategory: getTypeCategory(sourceType),
              targetCategory: getTypeCategory(targetType),
              isTypeCompatible,
            });

            if (!isTypeCompatible) {
              toast.error('Type mismatch', {
                description: `Cannot connect ${sourceType || 'unknown'} to ${targetType || 'unknown'}. Types must be compatible.`,
                position: 'bottom-center',
                duration: 2500,
              });
              return;
            }
          }
        }
      }

      // Helper to parse handle ids by looking up actual node data
      // Handle format: "<table>_<col>_<index>" but col can contain underscores
      const parseHandle = (
        handleId?: string | null,
        nodeId?: string | null,
      ) => {
        if (!handleId || !nodeId) return null;

        // Find the node to get actual column data
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || !node.data.columns) return null;

        // Handle format: tableName_columnName_index
        // We know the table name (nodeId) and can extract index from the end
        const parts = handleId.split('_');
        const idxPart = parts.pop();
        const index = idxPart ? Number(idxPart) : NaN;

        if (
          Number.isNaN(index) ||
          index < 0 ||
          index >= node.data.columns.length
        ) {
          return null;
        }

        // Get actual column name from node data using index
        const column = node.data.columns[index];
        if (!column) return null;

        return { table: nodeId, col: column.title, index };
      };

      try {
        const src = parseHandle(params.sourceHandle, params.source);
        const tgt = parseHandle(params.targetHandle, params.target);

        debugLog.log('[onConnect] Parsed handles:', { src, tgt });

        if (
          src &&
          tgt &&
          !Number.isNaN(src.index) &&
          !Number.isNaN(tgt.index)
        ) {
          // Persist FK on the source column so tablesToEdges will regenerate this relationship
          const fkValue = `${tgt.table}.${tgt.col}`;
          debugLog.log('[onConnect] Creating FK:', {
            sourceTable: src.table,
            sourceCol: src.col,
            sourceIndex: src.index,
            fkValue,
          });

          updateColumn(src.table, src.index, { fk: fkValue });

          toast.success('Relationship created', {
            description: `${src.table}.${src.col} → ${tgt.table}.${tgt.col}`,
            position: 'bottom-center',
            duration: 2000,
          });
        }
      } catch (err) {
        console.error('[onConnect] Failed to persist FK:', err);
      }

      // Still add the visual edge immediately for instant feedback
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges, updateColumn, connectionMode, nodes],
  );

  // Validate connections based on connection mode (no toasts - visual validation only)
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      // Block connecting a column to itself
      if (
        connection.source === connection.target &&
        connection.sourceHandle === connection.targetHandle
      ) {
        return false;
      }

      // In flexible mode, allow all connections
      if (connectionMode === 'flexible') {
        return true;
      }

      // In strict mode, validate type compatibility between source and target columns
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const sourceHandleId = connection.sourceHandle;
      const targetHandleId = connection.targetHandle;
      if (!sourceHandleId || !targetHandleId) return false;

      const sourceColumn = sourceNode.data.columns?.find(
        (_col: any, index: number) => {
          const handleId = `${sourceNode.id}_${_col.title}_${index}`;
          return handleId === sourceHandleId;
        },
      );
      const targetColumn = targetNode.data.columns?.find(
        (_col: any, index: number) => {
          const handleId = `${targetNode.id}_${_col.title}_${index}`;
          return handleId === targetHandleId;
        },
      );

      if (!sourceColumn || !targetColumn) return false;

      // Check type compatibility using category matching
      // Use format first (contains PostgreSQL type like uuid, varchar) instead of type (generic like string, number)
      const sourceType = sourceColumn.format || sourceColumn.type || '';
      const targetType = targetColumn.format || targetColumn.type || '';

      return areTypesCompatible(sourceType, targetType);
    },
    [connectionMode, nodes],
  );

  const onNodeClick = useCallback(
    (_event: any, node: any) => {
      const connectedEdges = edges.filter(
        (edge) => edge.source === node.id || edge.target === node.id,
      );
      setHighlightedEdges(new Set(connectedEdges.map((e) => e.id)));
      // Expand table in sidebar when clicked on canvas
      expandTable(node.id);
    },
    [edges, expandTable],
  );

  const onPaneClick = useCallback(() => {
    setHighlightedEdges(new Set());
    setSelectedEdge(null);
    setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      const isView = node.type === 'view';
      setContextMenu({
        type: 'node',
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
        isView,
      });
    },
    [],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({
        type: 'edge',
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
      });
    },
    [],
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      const relationshipType = getEdgeRelationship(edge.id);
      setSelectedEdge({
        id: edge.id,
        type: relationshipType,
        position: {
          x: event.clientX,
          y: event.clientY,
        },
      });
    },
    [getEdgeRelationship],
  );

  // Helper to remove FK from source column when deleting an edge
  const removeFkFromEdge = useCallback(
    (edgeId: string) => {
      // Edge ID format: "sourceTable.sourceColumn-targetTable.targetColumn"
      const edgeParts = edgeId.split('-');
      if (edgeParts.length === 2) {
        const [sourceInfo] = edgeParts;
        const sourceParts = sourceInfo.split('.');
        if (sourceParts.length >= 2) {
          const sourceColumn = sourceParts[sourceParts.length - 1];
          const sourceTable = sourceParts.slice(0, -1).join('.');

          const table = tables[sourceTable];
          if (table?.columns) {
            const columnIndex = table.columns.findIndex(
              (col) => col.title === sourceColumn,
            );
            if (columnIndex >= 0) {
              updateColumn(sourceTable, columnIndex, { fk: undefined });
            }
          }
        }
      }
    },
    [tables, updateColumn],
  );

  const handleRelationshipChange = useCallback(
    (type: RelationshipType) => {
      if (selectedEdge) {
        setEdgeRelationship(selectedEdge.id, type);
        setEdges((eds) =>
          eds.map((edge) =>
            edge.id === selectedEdge.id
              ? {
                  ...edge,
                  markerStart:
                    type === 'many-to-many'
                      ? {
                          type: MarkerType.ArrowClosed,
                          width: 20,
                          height: 20,
                          color: '#6B7280',
                        }
                      : undefined,
                  data: {
                    ...edge.data,
                    relationshipType: type,
                  },
                }
              : edge,
          ),
        );
      }
    },
    [selectedEdge, setEdgeRelationship, setEdges],
  );

  const handleEdgeDelete = useCallback(() => {
    if (selectedEdge) {
      // Remove FK from source column to persist the deletion
      removeFkFromEdge(selectedEdge.id);

      setEdges((eds) => eds.filter((edge) => edge.id !== selectedEdge.id));
      setSelectedEdge(null);

      toast.success('Relationship deleted', {
        position: 'bottom-center',
        duration: 2000,
      });
    }
  }, [selectedEdge, setEdges, removeFkFromEdge]);

  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      let deletedCount = 0;
      edges.forEach((edge) => {
        removeFkFromEdge(edge.id);
        deletedEdgesRef.current.add(edge.id);
        deletedCount++;
      });

      if (deletedCount > 0) {
        toast.success(`Relationship${deletedCount > 1 ? 's' : ''} deleted`, {
          position: 'bottom-center',
          duration: 2000,
        });
      }
    },
    [removeFkFromEdge],
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
    },
    [setNodes, setEdges],
  );

  const handleCopyNodeId = useCallback((nodeId: string) => {
    navigator.clipboard.writeText(nodeId).catch((err) => {
      console.error('Failed to copy node ID to clipboard:', err);
    });
  }, []);

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        reactFlowRef.current.fitView({
          padding: 0.2,
          duration: 400,
          nodes: [node],
        });
      }
    },
    [nodes],
  );

  const handleHideNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, hidden: true } : node,
        ),
      );
    },
    [setNodes],
  );

  const handleEdgeDeleteFromMenu = useCallback(
    (edgeId: string) => {
      // Remove FK from source column to persist the deletion
      removeFkFromEdge(edgeId);

      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));

      toast.success('Relationship deleted', {
        position: 'bottom-center',
        duration: 2000,
      });
    },
    [setEdges, removeFkFromEdge],
  );

  const handleChangeEdgeType = useCallback(
    (edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (edge) {
        const relationshipType = getEdgeRelationship(edge.id);
        setSelectedEdge({
          id: edge.id,
          type: relationshipType,
          position: contextMenu
            ? { x: contextMenu.x, y: contextMenu.y }
            : { x: 0, y: 0 },
        });
      }
      setContextMenu(null);
    },
    [edges, getEdgeRelationship, contextMenu],
  );

  // Apply highlighting to edges (memoized)
  const edgesWithHighlight = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      animated: highlightedEdges.has(edge.id),
      selected: selectedEdge?.id === edge.id,
    }));
  }, [edges, highlightedEdges, selectedEdge]);

  return (
    <div
      className={cn('w-full h-screen', isConnecting && 'connecting')}
      ref={flowWrapperRef}
      onMouseMove={updateCursorPosition}
    >
      <ReactFlow
        nodes={nodes}
        edges={edgesWithHighlight}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onMove={onMove}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'custom',
          animated: false,
        }}
        className="bg-white dark:bg-dark-900"
      >
        <Background className="dark:opacity-20" />
        <MiniMap
          className="!bg-warm-gray-100 dark:!bg-dark-800 !border-warm-gray-300 dark:!border-dark-border"
          nodeClassName="!fill-warm-gray-300 dark:!fill-dark-700"
        />
      </ReactFlow>

      {/* Connection Mode Toggle moved to the Settings toolbar (top-right) */}

      {/* Relationship Selector */}
      {selectedEdge && (
        <RelationshipSelector
          currentType={selectedEdge.type}
          onSelect={handleRelationshipChange}
          position={selectedEdge.position}
          onClose={() => setSelectedEdge(null)}
          onDelete={handleEdgeDelete}
        />
      )}

      {/* Context Menu */}
      {contextMenu && contextMenu.type === 'node' && contextMenu.nodeId && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={createNodeContextMenu(
            contextMenu.nodeId,
            contextMenu.isView || false,
            () => handleNodeDelete(contextMenu.nodeId!),
            () => handleCopyNodeId(contextMenu.nodeId!),
            () => handleFocusNode(contextMenu.nodeId!),
            () => handleHideNode(contextMenu.nodeId!),
          )}
          onClose={() => setContextMenu(null)}
        />
      )}

      {contextMenu && contextMenu.type === 'edge' && contextMenu.edgeId && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={createEdgeContextMenu(
            contextMenu.edgeId,
            () => handleEdgeDeleteFromMenu(contextMenu.edgeId!),
            () => handleChangeEdgeType(contextMenu.edgeId!),
          )}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
