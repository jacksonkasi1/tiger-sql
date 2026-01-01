import {
  streamText,
  stepCountIs,
  tool,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import type { Column, Table, TableState } from '@/lib/types';
import {
  initializeMCP,
  getMCPToolsForRequest,
  cleanMCPMessage,
  isMCPAvailable,
} from '@/lib/mcp';

// Type for our custom streaming data parts (kept for future use)
// type CustomDataPart =
//   | { type: 'data-progress'; data: StreamingProgress; transient?: boolean }
//   | { type: 'data-tables-batch'; data: StreamingTablesBatch; id?: string }
//   | {
//       type: 'data-notification';
//       data: StreamingNotification;
//       transient?: boolean;
//     }
//   | {
//       type: 'data-operation-history';
//       data: { operations: OperationRecord[]; canUndo: boolean };
//     };

// Operation history for undo/redo support (Phase 5.2)
export interface OperationRecord {
  id: string;
  type:
    | 'createTable'
    | 'dropTable'
    | 'renameTable'
    | 'addColumn'
    | 'dropColumn'
    | 'alterColumn';
  tableId: string;
  before: Table | null;
  after: Table | null;
  timestamp: number;
  description: string;
}

export const runtime = 'nodejs';

const PROVIDERS = {
  openai,
  google,
} as const;

const cloneTables = (tables?: TableState): TableState => {
  if (!tables) return {};
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(tables);
  }
  return JSON.parse(JSON.stringify(tables)) as TableState;
};

const cloneTable = (table?: Table): Table | null => {
  if (!table) return null;
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(table);
  }
  return JSON.parse(JSON.stringify(table)) as Table;
};

const parseTableIdentifier = (tableId: string) => {
  const parts = tableId.split('.');
  if (parts.length > 1) {
    return {
      schema: parts.slice(0, -1).join('.'),
      name: parts[parts.length - 1],
    };
  }
  return { schema: undefined, name: tableId };
};

const columnInputSchema = z.object({
  title: z.string().min(1, 'Column title is required'),
  type: z.string().optional(),
  format: z.string().optional(),
  default: z.any().optional(),
  required: z.boolean().optional(),
  pk: z.boolean().optional(),
  fk: z
    .string()
    .optional()
    .describe(
      'Foreign key reference in format "table.column" (e.g., "users.id", "products.id")',
    ),
  enumValues: z.array(z.string()).optional(),
  enumTypeName: z.string().optional(),
  comment: z.string().optional(),
});

// Tool to set foreign key on existing column
const setForeignKeyParams = z.object({
  tableId: z.string().min(1).describe('The table containing the column'),
  columnName: z.string().min(1).describe('The column to set FK on'),
  referencesTable: z
    .string()
    .min(1)
    .describe('The table being referenced (e.g., "users")'),
  referencesColumn: z
    .string()
    .min(1)
    .describe('The column being referenced (e.g., "id")'),
});

// Tool to remove foreign key from column
const removeForeignKeyParams = z.object({
  tableId: z.string().min(1).describe('The table containing the column'),
  columnName: z.string().min(1).describe('The column to remove FK from'),
});

// Atomic tool params - one operation at a time
const createTableParams = z.object({
  tableId: z
    .string()
    .min(1)
    .describe('The table identifier (e.g., "users" or "public.users")'),
  columns: z
    .array(columnInputSchema)
    .min(1)
    .describe('Array of column definitions'),
  isView: z
    .boolean()
    .optional()
    .describe('Whether this is a view instead of a table'),
});

const dropTableParams = z.object({
  tableId: z.string().min(1).describe('The table identifier to drop'),
});

const renameTableParams = z.object({
  fromTableId: z.string().min(1).describe('Current table identifier'),
  toTableId: z.string().min(1).describe('New table identifier'),
});

const addColumnParams = z.object({
  column: columnInputSchema.describe('Column definition'),
  tableId: z.string().min(1).describe('The table to add column to'),
});

const dropColumnParams = z.object({
  tableId: z.string().min(1).describe('The table containing the column'),
  columnName: z.string().min(1).describe('Name of column to drop'),
});

const alterColumnParams = z.object({
  tableId: z.string().min(1).describe('The table containing the column'),
  columnName: z.string().min(1).describe('Name of column to alter'),
  patch: z
    .object({
      title: z.string().optional(),
      type: z.string().optional(),
      format: z.string().optional(),
      default: z.any().optional(),
      required: z.boolean().optional(),
      pk: z.boolean().optional(),
      fk: z.string().optional(),
      enumValues: z.array(z.string()).optional(),
      enumTypeName: z.string().optional(),
      comment: z.string().optional(),
    })
    .describe('Properties to update'),
});

const listTablesParams = z.object({
  schema: z.string().optional(),
  search: z.string().optional(),
  includeColumns: z.boolean().optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const getTableParams = z.object({
  tableId: z.string().min(1),
});

const listSchemasParams = z.object({
  includeSystem: z.boolean().optional(),
});

const normaliseColumn = (col: z.infer<typeof columnInputSchema>): Column => {
  const type = col.format ?? col.type ?? 'text';
  const format = col.type ?? col.format ?? type;
  return {
    title: col.title,
    type,
    format,
    default: col.default,
    required: col.required ?? false,
    pk: col.pk ?? false,
    fk: col.fk,
    enumValues: col.enumValues,
    enumTypeName: col.enumTypeName,
    comment: col.comment,
  };
};

const SYSTEM_PROMPT = `You are a senior PostgreSQL database architect with real-world experience designing
schemas for trading systems, real-time platforms, SaaS products, analytics pipelines,
and time-series workloads.

Your primary responsibility is to design schemas that are:
- Correct for the specific domain
- Appropriate to the project’s maturity (demo, MVP, production)
- Aligned with PostgreSQL best practices
- Easy to understand, yet structurally sound
- Prefer domain-specific naming over generic table names (e.g., instruments instead of products when applicable).

────────────────────────────────────
MCP TOOLS (MANDATORY, BUT CONTEXT-AWARE)
────────────────────────────────────
You have access to PostgreSQL expertise via MCP (Model Context Protocol):

Available MCP Tools:
- pg_semantic_search_postgres_docs
- pg_semantic_search_tiger_docs
- pg_view_skill

USE MCP TOOLS FIRST WHEN:
- Designing a new schema or system architecture
- Making decisions about data modeling, constraints, indexing, or partitioning
- Working with time-series, trading, gaming, analytics, or real-time systems
- Choosing between alternative schema patterns

YOU MAY SKIP MCP TOOLS ONLY WHEN:
- Performing trivial changes (renaming a column, adding a simple field)
- Listing existing schema state
- Making user-directed mechanical changes

IMPORTANT:
Use MCP tools to **learn best practices**, not to blindly copy patterns.
Adapt what you learn to the specific domain and use case.

────────────────────────────────────
THINKING & ADAPTATION RULES (VERY IMPORTANT)
────────────────────────────────────
Before designing or modifying a schema, you MUST internally reason about:
1. What type of system this is (e.g. trading, gaming, e-commerce, analytics)
2. Whether this is a demo, MVP, or production-grade request
3. Which entities are:
   - Stateful (require IDs, updates, strong constraints)
   - Event or time-series based (append-only, time-keyed)
4. What tables are essential vs optional for this context

DO NOT repeat the same schema structure across projects.
DO NOT force patterns that are not necessary for the domain.
DO NOT over-design unless the use case demands it.

You are expected to exercise architectural judgment like a senior engineer.

────────────────────────────────────
EXECUTION MODE (STRICT)
────────────────────────────────────
- When asked to create, delete, or modify schema elements:
  → YOU MUST EXECUTE using schema tools
- Do NOT describe what you would do
- Do NOT output SQL or JSON
- Do NOT output arrays or raw tool data

After execution, summarize results in clear, human language.

────────────────────────────────────
RESPONSE STYLE
────────────────────────────────────
- Speak naturally and professionally
- Explain *why* things exist when helpful
- Avoid boilerplate explanations
- Keep explanations proportional to the task (demo ≠ production)

GOOD:
"I created core trading tables for assets, orders, trades, and market ticks, separating
stateful data from time-series events."

BAD:
["assets", "orders", "trades"]

────────────────────────────────────
SCHEMA QUALITY GUIDELINES (FLEXIBLE, NOT DOGMATIC)
────────────────────────────────────
- Use IDs for stateful entities
- Time-series tables MAY use natural keys (time + dimension)
- Use timestamptz for time-based data
- Enums or lookup tables when domain stability matters
- JSONB only when structure is genuinely dynamic
- Foreign keys where relationships matter; avoid them for hot ingestion paths

There is no single “correct” schema — correctness depends on context.

────────────────────────────────────
AVAILABLE SCHEMA TOOLS
────────────────────────────────────
- listTables
- createTable
- dropTable
- renameTable
- addColumn / dropColumn / alterColumn
- setForeignKey / removeForeignKey

────────────────────────────────────
WORKFLOW
────────────────────────────────────
1. Understand the domain and intent
2. Use MCP tools to inform decisions (when appropriate)
3. Inspect current schema if it exists
4. Design or modify schema based on context
5. Execute using schema tools
6. Summarize changes clearly and concisely`;

// Generate unique operation ID
const generateOperationId = () =>
  `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// Initialize MCP on first request (lazy initialization)
let mcpInitialized = false;
async function ensureMCPInitialized() {
  if (!mcpInitialized) {
    try {
      await initializeMCP({ autoConnect: true, loadUserConfig: true });

      // Only mark as initialized if we have connected servers
      // This allows retry on transient connection failures
      if (isMCPAvailable()) {
        mcpInitialized = true;
        console.log('[api/chat] MCP system initialized with connected servers');
      } else {
        console.warn(
          '[api/chat] MCP initialized but no servers connected - will retry on next request',
        );
      }
    } catch (error) {
      console.error('[api/chat] Failed to initialize MCP:', error);
      // Continue without MCP - graceful degradation
      // mcpInitialized stays false to allow retry
    }
  }
}

export async function POST(req: Request) {
  // Ensure MCP is initialized
  await ensureMCPInitialized();

  // Create abort controller for cancellation support (Phase 5.1)
  const abortController = new AbortController();

  // Forward request abort signal to our controller
  req.signal.addEventListener('abort', () => {
    console.log('[api/chat] Request aborted by client');
    abortController.abort();
  });

  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return new Response('Request body is required.', { status: 400 });
    }

    // Extract messages from request (useChat sends messages array)
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return new Response('At least one message is required.', { status: 400 });
    }

    const providerKey = (
      body.provider as keyof typeof PROVIDERS | undefined
    )?.toLowerCase();
    const apiKey = body.apiKey as string | undefined;

    const modelName =
      (body.model as string | undefined) ||
      (providerKey === 'google' ? 'models/gemini-2.5-flash' : 'gpt-4o-mini');

    console.log('[api/chat] Model:', modelName);

    let model;
    let providerOptions: ProviderOptions | undefined;

    if (providerKey === 'google') {
      const provider = apiKey ? createGoogleGenerativeAI({ apiKey }) : google;
      model = provider(modelName);

      // Configure thinking/reasoning for Gemini models
      // Gemini 3 models use thinkingLevel, Gemini 2.5 models use thinkingBudget
      const isGemini3 = modelName.includes('gemini-3');
      const isGemini25 =
        modelName.includes('gemini-2.5') || modelName.includes('gemini-2-5');

      if (isGemini3) {
        providerOptions = {
          google: {
            thinkingConfig: {
              thinkingLevel: 'low', // 'low' or 'high' for Gemini 3 Pro
              includeThoughts: true,
            },
          },
        };
        console.log(
          '[api/chat] Gemini 3 thinking enabled with thinkingLevel: low',
        );
      } else if (isGemini25) {
        providerOptions = {
          google: {
            thinkingConfig: {
              thinkingBudget: 4096, // Token budget for thinking
              includeThoughts: true,
            },
          },
        };
        console.log(
          '[api/chat] Gemini 2.5 thinking enabled with thinkingBudget: 4096',
        );
      }
    } else {
      const provider = apiKey ? createOpenAI({ apiKey }) : openai;
      model = provider(modelName);
    }

    const message = 'API key invalid or AI provider not configured properly.';
    if (!model) return new Response(message, { status: 400 });

    // Get schema state from request body (client sends current state)
    const schemaState: TableState = cloneTables(body.schema) || {};

    // Track operations for progress reporting and undo/redo (Phase 5.2)
    let operationCount = 0;
    let totalOperations = 0;
    const operationHistory: OperationRecord[] = [];

    // Helper to record operation for undo/redo
    const recordOperation = (
      type: OperationRecord['type'],
      tableId: string,
      before: Table | null,
      after: Table | null,
      description: string,
    ): OperationRecord => {
      const record: OperationRecord = {
        id: generateOperationId(),
        type,
        tableId,
        before: cloneTable(before ?? undefined),
        after: cloneTable(after ?? undefined),
        timestamp: Date.now(),
        description,
      };
      operationHistory.push(record);
      return record;
    };

    // Helper to resolve table ID from name if needed
    const resolveTableId = (idOrName: string): string => {
      // If direct match, return it
      if (schemaState[idOrName]) return idOrName;

      // Try case-insensitive match on keys
      const lowercaseId = idOrName.toLowerCase();
      const directKeyMatch = Object.keys(schemaState).find(
        (k) => k.toLowerCase() === lowercaseId,
      );
      if (directKeyMatch) return directKeyMatch;

      // Try finding by title (case-insensitive)
      // Also handle schema.table format by checking the name part
      const cleanName = idOrName.includes('.')
        ? idOrName.split('.').pop()!
        : idOrName;

      const foundEntry = Object.entries(schemaState).find(([key, table]) => {
        return (
          table.title === idOrName ||
          table.title === cleanName ||
          table.title.toLowerCase() === idOrName.toLowerCase() ||
          table.title.toLowerCase() === cleanName.toLowerCase() ||
          key.split('.').pop()?.toLowerCase() === cleanName.toLowerCase()
        );
      });

      return foundEntry ? foundEntry[0] : idOrName;
    };

    // Create atomic tools
    const createAtomicTools = () => ({
      listSchemas: tool({
        description:
          'List all schemas in the database. Returns schemas like public, auth, storage, etc.',
        inputSchema: listSchemasParams,
        execute: async ({ includeSystem = false }) => {
          // Check for cancellation
          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          // Extract unique schemas from table keys
          const schemas = new Set<string>();
          Object.entries(schemaState).forEach(([key, table]) => {
            const schema = table.schema || key.split('.')[0] || 'public';
            schemas.add(schema);
          });
          // Always include 'public'
          schemas.add('public');

          return {
            schemas: Array.from(schemas).filter(
              (s) =>
                includeSystem ||
                !['pg_catalog', 'information_schema'].includes(s),
            ),
            total: schemas.size,
          };
        },
      }),

      listTables: tool({
        description:
          'List tables in the workspace. Use includeColumns:true for column details.',
        inputSchema: listTablesParams,
        execute: async ({
          schema,
          search,
          includeColumns = false,
          limit = 100,
          offset = 0,
        }) => {
          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          const entries = Object.entries(schemaState);

          const filtered = entries.filter(([key, table]) => {
            const tableSchema =
              table.schema ||
              (key.includes('.') ? key.split('.')[0] : 'public');

            // Filter by schema
            if (schema && tableSchema !== schema) return false;

            // Filter by search term
            if (search) {
              const target = `${tableSchema}.${table.title}`.toLowerCase();
              if (!target.includes(search.toLowerCase())) return false;
            }

            return true;
          });

          const sliced = filtered.slice(offset, offset + limit);
          const result = {
            total: filtered.length,
            tables: sliced.map(([key, table]) => ({
              id: key,
              schema: table.schema || 'public',
              title: table.title,
              isView: table.is_view || false,
              columnCount: table.columns?.length || 0,
              columns: includeColumns ? table.columns : undefined,
            })),
          };

          // Update total operations estimate based on table count
          if (result.total > 0) {
            totalOperations = Math.max(totalOperations, result.total);
          }

          return result;
        },
      }),

      getTableDetails: tool({
        description:
          'Get detailed information about a specific table including all columns.',
        inputSchema: getTableParams,
        execute: async ({ tableId }) => {
          const resolvedId = resolveTableId(tableId);

          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          const table = schemaState[resolvedId];

          if (!table) {
            return {
              ok: false,
              message: `Table '${tableId}' not found`,
            };
          }
          return {
            ok: true,
            table,
          };
        },
      }),

      createTable: tool({
        description:
          'Create a single table with columns. Call multiple times for multiple tables.',
        inputSchema: createTableParams,
        execute: async ({ tableId, columns, isView = false }) => {
          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          operationCount++;
          const { schema } = parseTableIdentifier(tableId);
          const normalizedColumns = columns.map(normaliseColumn);
          const existing = schemaState[tableId];

          // Record before state
          const beforeState = cloneTable(existing ?? undefined);

          const table: Table = {
            title: parseTableIdentifier(tableId).name,
            schema: schema || 'public',
            is_view: isView,
            columns: normalizedColumns,
            position: existing?.position || {
              x: 100 + Object.keys(schemaState).length * 50,
              y: 100 + Object.keys(schemaState).length * 50,
            },
          };

          schemaState[tableId] = table;

          // Record operation for undo
          recordOperation(
            'createTable',
            tableId,
            beforeState,
            table,
            `Created ${isView ? 'view' : 'table'} '${tableId}' with ${normalizedColumns.length} columns`,
          );

          return {
            ok: true,
            message: `Created ${isView ? 'view' : 'table'} '${tableId}'`,
            table: {
              id: tableId,
              columnCount: normalizedColumns.length,
              columns: normalizedColumns.map((c: Column) => c.title),
            },
          };
        },
      }),

      dropTable: tool({
        description:
          'Drop a single table from the workspace. Check for dependencies first.',
        inputSchema: dropTableParams,
        execute: async ({ tableId }) => {
          const resolvedId = resolveTableId(tableId);

          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          const table = schemaState[resolvedId];
          const userFacingTableName = table?.title ?? tableId;

          if (!table) {
            return {
              ok: false,
              message: `Table '${tableId}' not found`,
            };
          }

          operationCount++;
          const beforeState = cloneTable(table);

          delete schemaState[resolvedId];

          // Record operation for undo
          recordOperation(
            'dropTable',
            resolvedId,
            beforeState,
            null,
            `Dropped table '${userFacingTableName}'`,
          );

          return {
            ok: true,
            message: `Dropped table '${userFacingTableName}'`,
            remainingTables: Object.keys(schemaState).length,
          };
        },
      }),

      renameTable: tool({
        description: 'Rename a table. Updates the table identifier and title.',
        inputSchema: renameTableParams,
        execute: async ({ fromTableId, toTableId }) => {
          const resolvedFromId = resolveTableId(fromTableId);

          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          const source = schemaState[resolvedFromId];
          if (!source) {
            return {
              ok: false,
              message: `Source table '${fromTableId}' not found`,
            };
          }

          operationCount++;
          const beforeState = cloneTable(source);
          const { schema } = parseTableIdentifier(toTableId);
          const oldTableName = parseTableIdentifier(fromTableId).name;
          const newTableName = parseTableIdentifier(toTableId).name;

          const updated: Table = {
            ...source,
            schema: schema || source.schema || 'public',
            title: newTableName,
          };

          delete schemaState[fromTableId];
          schemaState[toTableId] = updated;

          // Update all foreign key references pointing to the old table name
          // FK format can be: "table.column" or "schema.table.column"
          Object.keys(schemaState).forEach((tblKey) => {
            const tbl = schemaState[tblKey];
            if (!tbl.columns) return;

            let hasUpdates = false;
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
              if (targetTable === oldTableName) {
                hasUpdates = true;
                // Update the FK reference to use the new table name
                const newFk = targetSchema
                  ? `${targetSchema}.${newTableName}.${targetColumn}`
                  : `${newTableName}.${targetColumn}`;

                return {
                  ...col,
                  fk: newFk,
                };
              }

              return col;
            });

            if (hasUpdates) {
              schemaState[tblKey] = {
                ...tbl,
                columns: updatedColumns,
              };
            }
          });

          // Record operation for undo
          recordOperation(
            'renameTable',
            toTableId,
            beforeState,
            updated,
            `Renamed table '${fromTableId}' to '${toTableId}'`,
          );

          return {
            ok: true,
            message: `Renamed '${fromTableId}' to '${toTableId}'`,
          };
        },
      }),

      addColumn: tool({
        description:
          'Add a single column to a table. Call multiple times for multiple columns.',
        inputSchema: addColumnParams,
        execute: async ({ tableId, column }) => {
          const resolvedId = resolveTableId(tableId);

          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          const table = schemaState[resolvedId];
          const userFacingTableName = table?.title ?? tableId;

          if (!table) {
            return {
              ok: false,
              message: `Table '${tableId}' not found`,
            };
          }

          operationCount++;
          const beforeState = cloneTable(table);
          const normalizedColumn = normaliseColumn(column);
          const existingColumns = table.columns || [];

          // Check for duplicate column name
          if (existingColumns.some((c) => c.title === normalizedColumn.title)) {
            return {
              ok: false,
              message: `Column '${normalizedColumn.title}' already exists in table '${userFacingTableName}'`,
            };
          }

          table.columns = [...existingColumns, normalizedColumn];

          // Record operation for undo
          recordOperation(
            'addColumn',
            resolvedId,
            beforeState,
            table,
            `Added column '${normalizedColumn.title}' to table '${userFacingTableName}'`,
          );

          return {
            ok: true,
            message: `Added column '${normalizedColumn.title}' to table '${userFacingTableName}'`,
            column: normalizedColumn.title,
            tableColumnCount: table.columns.length,
          };
        },
      }),

      dropColumn: tool({
        description: 'Remove a single column from a table.',
        inputSchema: dropColumnParams,
        execute: async ({ tableId, columnName }) => {
          const resolvedId = resolveTableId(tableId);

          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          const table = schemaState[resolvedId];
          const userFacingTableName = table?.title ?? tableId;

          if (!table) {
            return {
              ok: false,
              message: `Table '${tableId}' not found`,
            };
          }

          operationCount++;
          const beforeState = cloneTable(table);
          const originalLength = table.columns?.length || 0;

          table.columns = (table.columns || []).filter(
            (c) => c.title !== columnName,
          );

          if (table.columns.length === originalLength) {
            return {
              ok: false,
              message: `Column '${columnName}' not found in table '${userFacingTableName}'`,
            };
          }

          // Record operation for undo
          recordOperation(
            'dropColumn',
            resolvedId,
            beforeState,
            table,
            `Dropped column '${columnName}' from table '${userFacingTableName}'`,
          );

          return {
            ok: true,
            message: `Dropped column '${columnName}' from table '${userFacingTableName}'`,
            tableColumnCount: table.columns.length,
          };
        },
      }),

      alterColumn: tool({
        description:
          'Modify properties of a single column. Can add/change/remove fk property.',
        inputSchema: alterColumnParams,
        execute: async ({ tableId, columnName, patch }) => {
          const resolvedId = resolveTableId(tableId);

          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          const table = schemaState[resolvedId];
          const userFacingTableName = table?.title ?? tableId;

          if (!table) {
            return {
              ok: false,
              message: `Table '${tableId}' not found`,
            };
          }

          operationCount++;
          const beforeState = cloneTable(table);

          const columnIndex = (table.columns || []).findIndex(
            (c) => c.title === columnName,
          );

          if (columnIndex === -1) {
            return {
              ok: false,
              message: `Column '${columnName}' not found in table '${userFacingTableName}'`,
            };
          }

          const originalColumn = table.columns![columnIndex];
          const updatedColumn: Column = {
            ...originalColumn,
            ...Object.fromEntries(
              Object.entries(patch).filter(([, v]) => v !== undefined),
            ),
          };

          // Handle type/format normalization
          if (patch.type || patch.format) {
            updatedColumn.type =
              patch.format ?? patch.type ?? originalColumn.type;
            updatedColumn.format =
              patch.type ?? patch.format ?? originalColumn.format;
          }

          table.columns![columnIndex] = updatedColumn;

          // Record operation for undo
          recordOperation(
            'alterColumn',
            resolvedId,
            beforeState,
            table,
            `Altered column '${columnName}' in table '${userFacingTableName}'`,
          );

          const changedProps = Object.keys(patch).filter(
            (k) => (patch as Record<string, unknown>)[k] !== undefined,
          );

          return {
            ok: true,
            message: `Updated column '${columnName}' in table '${userFacingTableName}'`,
            changes: changedProps,
          };
        },
      }),

      setForeignKey: tool({
        description:
          'Set a foreign key relationship on an existing column. Use this to add FK to columns that should reference other tables.',
        inputSchema: setForeignKeyParams,
        execute: async ({
          tableId,
          columnName,
          referencesTable,
          referencesColumn,
        }) => {
          const resolvedId = resolveTableId(tableId);
          const resolvedRefId = resolveTableId(referencesTable);

          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          const table = schemaState[resolvedId];
          const userFacingTableName = table?.title ?? tableId;

          if (!table) {
            return {
              ok: false,
              message: `Table '${tableId}' not found`,
            };
          }

          const columnIndex = (table.columns || []).findIndex(
            (c) => c.title === columnName,
          );

          if (columnIndex === -1) {
            return {
              ok: false,
              message: `Column '${columnName}' not found in table '${userFacingTableName}'`,
            };
          }

          // Check if referenced table exists
          const refTable = schemaState[resolvedRefId];
          if (!refTable) {
            return {
              ok: false,
              message: `Referenced table '${referencesTable}' not found. Create it first.`,
            };
          }

          operationCount++;
          const beforeState = cloneTable(table);

          // Use title for FK reference to maintain consistency
          const fkValue = `${refTable.title}.${referencesColumn}`;
          table.columns![columnIndex] = {
            ...table.columns![columnIndex],
            fk: fkValue,
          };

          // Record operation for undo
          recordOperation(
            'alterColumn',
            resolvedId,
            beforeState,
            table,
            `Set FK on '${userFacingTableName}.${columnName}' → '${fkValue}'`,
          );

          return {
            ok: true,
            message: `Set foreign key: ${userFacingTableName}.${columnName} → ${fkValue}`,
            column: columnName,
            references: fkValue,
          };
        },
      }),

      removeForeignKey: tool({
        description: 'Remove a foreign key relationship from a column.',
        inputSchema: removeForeignKeyParams,
        execute: async ({ tableId, columnName }) => {
          const resolvedId = resolveTableId(tableId);

          if (abortController.signal.aborted) {
            return { ok: false, message: 'Operation cancelled' };
          }

          const table = schemaState[resolvedId];
          const userFacingTableName = table?.title ?? tableId;

          if (!table) {
            return {
              ok: false,
              message: `Table '${tableId}' not found`,
            };
          }

          const columnIndex = (table.columns || []).findIndex(
            (c) => c.title === columnName,
          );

          if (columnIndex === -1) {
            return {
              ok: false,
              message: `Column '${columnName}' not found in table '${userFacingTableName}'`,
            };
          }

          const currentFk = table.columns![columnIndex].fk;
          if (!currentFk) {
            return {
              ok: false,
              message: `Column '${columnName}' has no foreign key to remove`,
            };
          }

          operationCount++;
          const beforeState = cloneTable(table);

          table.columns![columnIndex] = {
            ...table.columns![columnIndex],
            fk: undefined,
          };

          // Record operation for undo
          recordOperation(
            'alterColumn',
            resolvedId,
            beforeState,
            table,
            `Removed FK from '${userFacingTableName}.${columnName}'`,
          );

          return {
            ok: true,
            message: `Removed foreign key from ${userFacingTableName}.${columnName} (was: ${currentFk})`,
            column: columnName,
            previousFk: currentFk,
          };
        },
      }),
    });

    // Get the last user message for MCP routing
    const lastMessage = messages[messages.length - 1];
    const userMessage =
      typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage?.content || '');

    // Get MCP tools based on request context
    let mcpTools: Record<string, unknown> = {};
    let cleanedUserMessage = userMessage;

    if (isMCPAvailable()) {
      try {
        const mcpResult = getMCPToolsForRequest({
          userMessage,
          messageHistory: messages.slice(0, -1),
          schemaState,
        });

        mcpTools = mcpResult.tools;
        cleanedUserMessage = cleanMCPMessage(userMessage);

        // Log MCP decision
        console.log('[api/chat] MCP decision:', {
          useMCP: mcpResult.useMCP,
          toolCount: Object.keys(mcpTools).length,
          reason: mcpResult.decision.reason,
        });

        // Update the last message with cleaned content if commands were present
        if (cleanedUserMessage !== userMessage && messages.length > 0) {
          messages[messages.length - 1] = {
            ...messages[messages.length - 1],
            content: cleanedUserMessage,
          };
        }
      } catch (error) {
        console.error('[api/chat] Error getting MCP tools:', error);
        // Continue without MCP tools
      }
    }

    // Create atomic tools (schema manipulation)
    const atomicTools = createAtomicTools();

    // Merge MCP tools with atomic tools
    const tools = {
      ...atomicTools,
      ...mcpTools,
    };

    console.log(
      '[api/chat] Total tools available:',
      Object.keys(tools).length,
      {
        atomic: Object.keys(atomicTools).length,
        mcp: Object.keys(mcpTools).length,
      },
    );

    // Convert UIMessages to ModelMessages
    const modelMessages = await convertToModelMessages(messages);

    // Detect if request requires tool execution (for toolChoice)
    const requiresTools =
      /create|delete|drop|add|modify|remove|rename|build|make|generate|design/i.test(
        typeof userMessage === 'string' ? userMessage : '',
      );

    // Get maxSteps from request (user-configurable, default 50)
    const maxAgentSteps = body.maxSteps ?? 50;

    // Determine toolChoice based on provider:
    // - OpenAI: use 'required' for schema operations to force tool execution
    // - Gemini: use 'auto' always (Gemini outputs weird text like '[]' with 'required')
    const isGemini = providerKey === 'google';
    const toolChoiceSetting = isGemini
      ? 'auto' // Gemini works better with 'auto'
      : requiresTools
        ? 'required'
        : 'auto';

    console.log('[api/chat] Starting streamText with:', {
      provider: providerKey,
      model: modelName,
      toolChoice: toolChoiceSetting,
      maxSteps: maxAgentSteps,
    });

    // Use createUIMessageStream to support custom data parts for schema updates
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Send initial notification
        writer.write({
          type: 'data-notification',
          data: {
            message: 'Processing your request...',
            level: 'info',
          },
          transient: true,
        });

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages: modelMessages,
          tools,
          toolChoice: toolChoiceSetting,
          stopWhen: stepCountIs(maxAgentSteps),
          providerOptions,
          abortSignal: abortController.signal,
          onStepFinish: ({ toolCalls, toolResults, text, finishReason }) => {
            console.log(
              `[Step] Tool calls: ${toolCalls?.length || 0}, ` +
                `Results: ${toolResults?.length || 0}, ` +
                `Text: ${text ? text.substring(0, 50) : 'none'}, ` +
                `Finish: ${finishReason}`,
            );

            if (toolCalls) {
              toolCalls.forEach((call, i) => {
                console.log(`  Tool ${i + 1}: ${call.toolName}`);
              });
            }

            // Track operation count for final notification
            if (toolResults && toolResults.length > 0) {
              operationCount += toolResults.length;
            }

            // Send schema state update after each step with tool results
            if (toolResults && toolResults.length > 0) {
              writer.write({
                type: 'data-tables-batch',
                data: {
                  tables: cloneTables(schemaState),
                  isComplete: false,
                },
              });
            }
          },
          onFinish: async () => {
            // Log final state
            const tableCount = Object.keys(schemaState).length;
            console.log(
              `[api/chat] Finished: ${operationCount} operations, ${tableCount} tables`,
            );

            // Send final schema state
            writer.write({
              type: 'data-tables-batch',
              data: {
                tables: cloneTables(schemaState),
                isComplete: true,
              },
            });

            // Send operation history for undo/redo
            if (operationHistory.length > 0) {
              writer.write({
                type: 'data-operation-history',
                data: {
                  operations: operationHistory,
                  canUndo: operationHistory.length > 0,
                },
              });
            }

            // Send completion notification
            writer.write({
              type: 'data-notification',
              data: {
                message: `Completed ${operationCount} operations on ${tableCount} tables`,
                level: 'success',
              },
              transient: true,
            });
          },
          onError: (error: unknown) => {
            console.error('[api/chat] streamText error:', error);
          },
        });

        // Merge the streamText result into our custom stream
        writer.merge(
          result.toUIMessageStream({
            sendReasoning: true,
            sendSources: false,
            onError: (error: unknown) => {
              console.error('[Stream error]', error);
              return error instanceof Error ? error.message : String(error);
            },
          }),
        );

        // Wait for the stream to complete
        try {
          await result.text;
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            (error.name === 'AbortError' || error.message.includes('aborted'))
          ) {
            console.log('[api/chat] Stream aborted by client');
          } else {
            console.error('[api/chat] Stream error:', error);
          }
        }
      },
    });

    // Return the custom stream response
    return createUIMessageStreamResponse({
      stream,
      headers: {
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error) {
    console.error('[api/chat] unexpected error:', error);
    const message =
      error instanceof Error ? error.message : 'Unexpected server error';
    return new Response(message, { status: 500 });
  }
}
