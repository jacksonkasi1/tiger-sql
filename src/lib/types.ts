// ============================================================================
// Operation History Types for Undo/Redo Support (Phase 5.2)
// ============================================================================

/**
 * Record of a schema operation for undo/redo capability
 */
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

// ============================================================================
// Schema Types
// ============================================================================

export interface ColumnModifiers {
  identity?: boolean | 'always' | 'by_default';
  generated?: {
    expression: string;
    stored: boolean;
  };
  check?: {
    expression: string;
    name?: string;
  };
  references?: {
    table: string;
    column: string;
    onDelete?: string;
    onUpdate?: string;
  };
  collate?: string;
  deferrable?: boolean;
  isArray?: boolean;
  arrayDimensions?: number;
}

export interface Column {
  title: string;
  format: string; // Raw SQL string (NEVER MUTATE - source of truth)
  type: string;
  baseType?: string; // Parsed base type (e.g., 'BIGINT', 'TIMESTAMP WITH TIME ZONE')
  modifiers?: ColumnModifiers; // Structured modifiers (computed/cached)
  default?: any;
  required?: boolean;
  pk?: boolean;
  fk?: string | undefined;
  unique?: boolean;
  enumValues?: string[]; // Values for enum types
  enumTypeName?: string; // Name of the enum type (e.g., "user_status")
  isArray?: boolean; // True for array columns (e.g., status[] for multi-value enum)
  comment?: string; // Comment/note for the column
}

export interface ForeignKeyReference {
  schema?: string;
  table: string;
  columns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export type ConstraintType = 'primary_key' | 'foreign_key' | 'unique' | 'check';

export interface TableConstraint {
  name?: string;
  type: ConstraintType;
  columns?: string[];
  reference?: ForeignKeyReference;
  expression?: string; // Raw expression for check constraints
}

export interface TableIndex {
  name: string;
  columns: string[]; // Raw columns or expressions used by the index
  unique?: boolean;
  using?: string | null;
  where?: string | null;
}

export interface EnumTypeDefinition {
  name: string;
  schema?: string;
  values: string[];
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Table {
  title: string;
  columns?: Column[];
  position?: Position;
  is_view?: boolean;
  schema?: string; // Schema name (e.g., 'public', 'auth', 'storage')
  color?: string; // Header color for the table card
  comment?: string; // Comment/note for the table
  constraints?: TableConstraint[];
  indexes?: TableIndex[];
}

export interface TableState {
  [key: string]: Table;
}

export interface Payload {
  name: string;
  value: string | number;
}

export interface Visual {
  id: string;
  type: string;
  position: Position;
  size: Size;
  [key: string]: any;
}

export interface VisualState {
  [key: string]: Visual;
}

export interface SQLCardItem {
  query: string;
  result?: string;
}

export interface SchemaView {
  translate: {
    x: number;
    y: number;
  };
  scale: number;
}

export interface SupabaseApiKey {
  url: string;
  anon: string;
  last_url: string;
}

// ============================================================================
// Streaming Data Types for AI SDK
// ============================================================================

/**
 * Progress notification for streaming operations
 */
export interface StreamingProgress {
  message: string;
  current: number;
  total: number;
  phase?: 'fetching' | 'processing' | 'applying';
}

/**
 * Batch of tables streamed from the server
 */
export interface StreamingTablesBatch {
  tables: TableState;
  batchNumber: number;
  totalBatches?: number;
  isComplete: boolean;
}

/**
 * Transient notification for user feedback
 */
export interface StreamingNotification {
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

/**
 * Union type for all streaming data parts
 * Used with AI SDK's createUIMessageStream and onData callback
 */
/**
 * Operation history batch for undo/redo support
 */
export interface StreamingOperationHistory {
  operations: OperationRecord[];
  canUndo: boolean;
}

export type StreamingDataPart =
  | { type: 'data-progress'; data: StreamingProgress; transient?: boolean }
  | { type: 'data-tables-batch'; data: StreamingTablesBatch; id?: string }
  | {
      type: 'data-notification';
      data: StreamingNotification;
      transient?: boolean;
    }
  | {
      type: 'data-operation-history';
      data: StreamingOperationHistory;
    };

/**
 * Extended UIMessage type with our custom data parts
 */
export interface CustomUIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'data-progress'; data: StreamingProgress }
    | { type: 'data-tables-batch'; data: StreamingTablesBatch }
    | { type: 'data-notification'; data: StreamingNotification }
    | { type: string; [key: string]: unknown } // For tool parts
  >;
}
