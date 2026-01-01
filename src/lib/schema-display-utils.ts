import { Column, ColumnModifiers } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Multi-word PostgreSQL types that need special handling.
 * Sorted by length (longest first) for correct matching.
 */
const MULTI_WORD_TYPES = [
  'timestamp with time zone',
  'timestamp without time zone',
  'time with time zone',
  'time without time zone',
  'character varying',
  'double precision',
  'bit varying',
].sort((a, b) => b.length - a.length);

/**
 * Extension types with special handling.
 */
const EXTENSION_TYPES: Record<string, { icon: string; extension: string }> = {
  geometry: { icon: 'Globe', extension: 'postgis' },
  geography: { icon: 'Globe', extension: 'postgis' },
  vector: { icon: 'Brain', extension: 'pgvector' },
  citext: { icon: 'CaseSensitive', extension: 'citext' },
  hstore: { icon: 'Braces', extension: 'hstore' },
  ltree: { icon: 'GitBranch', extension: 'ltree' },
  tsvector: { icon: 'Search', extension: 'built-in' },
  tsquery: { icon: 'Search', extension: 'built-in' },
};

// ============================================================================
// String Safety Utilities
// ============================================================================

/**
 * Removes string literals from SQL to safely search for keywords.
 * This prevents false-positives when keywords appear inside quoted strings.
 *
 * Example: CHECK (status = 'GENERATED') should NOT trigger identity detection.
 */
export function removeStringLiterals(sql: string): string {
  return (
    sql
      // Replace single-quoted strings with placeholder
      .replace(/'[^']*'/g, "''")
      // Replace double-quoted identifiers with placeholder
      .replace(/"[^"]*"/g, '""')
      // Replace dollar-quoted strings (PostgreSQL specific)
      .replace(/\$\$[\s\S]*?\$\$/g, '$$$$')
      // Replace tagged dollar quotes like $tag$...$tag$
      .replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)\$[\s\S]*?\$\1\$/g, '$$$$')
  );
}

/**
 * Strips SQL comments from input.
 * Must be called before parsing to avoid comments breaking column splitting.
 */
export function stripSqlComments(sql: string): string {
  return (
    sql
      // Remove single-line comments
      .replace(/--[^\n]*/g, '')
      // Remove block comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
  );
}

// ============================================================================
// Balanced Parentheses Utilities
// ============================================================================

/**
 * Extracts content within balanced parentheses starting from a given index.
 * Handles nested parentheses correctly.
 *
 * @param str The string to search
 * @param startIndex Index to start searching for opening paren
 * @returns The balanced content including parens, or empty string if not found
 */
export function extractBalancedParens(str: string, startIndex: number): string {
  let depth = 0;
  let start = -1;

  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (str[i] === ')') {
      depth--;
      if (depth === 0 && start !== -1) {
        return str.substring(start, i + 1);
      }
    }
  }

  return '';
}

// ============================================================================
// SERIAL Detection
// ============================================================================

/**
 * Detects if a column definition is an expanded SERIAL/BIGSERIAL type.
 * PostgreSQL stores SERIAL as: integer NOT NULL DEFAULT nextval('tablename_colname_seq'::regclass)
 */
export function detectSerialType(
  format: string,
): 'SERIAL' | 'BIGSERIAL' | 'SMALLSERIAL' | null {
  const lower = format.toLowerCase();

  // Check for nextval pattern
  if (!lower.includes('nextval(')) return null;

  // BIGSERIAL: bigint with nextval
  if (lower.startsWith('bigint') || lower.includes(' bigint ')) {
    return 'BIGSERIAL';
  }

  // SMALLSERIAL: smallint with nextval
  if (lower.startsWith('smallint') || lower.includes(' smallint ')) {
    return 'SMALLSERIAL';
  }

  // SERIAL: integer with nextval
  if (
    lower.startsWith('integer') ||
    lower.startsWith('int ') ||
    lower.includes(' integer ') ||
    lower.includes(' int ')
  ) {
    return 'SERIAL';
  }

  return null;
}

// ============================================================================
// Type Sanitization & Parsing
// ============================================================================

/**
 * Sanitizes raw SQL type strings by removing "noise" elements that are
 * infrastructure-specific but not schema-critical for display purposes.
 *
 * This is a PURE FUNCTION - it never mutates the input.
 */
export function sanitizeTypeString(rawType: string): string {
  return (
    rawType
      // Remove storage parameters
      .replace(/\s+WITH\s*\([^)]+\)/gi, '')
      // Remove tablespace specifications
      .replace(/\s+TABLESPACE\s+\w+/gi, '')
      // Remove collation specifications (handle complex names)
      .replace(/\s+COLLATE\s+(?:"[^"]+"|[\w.]+)/gi, '')
      // Remove compression settings
      .replace(/\s+COMPRESSION\s+\w+/gi, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Extracts the base type from a format string using whitelist approach.
 * This avoids the greedy regex problem with multi-word types.
 */
function extractBaseType(format: string): { baseType: string; rest: string } {
  const lower = format.toLowerCase().trim();

  // Check for SERIAL types first (expanded form)
  const serialType = detectSerialType(format);
  if (serialType) {
    return { baseType: serialType, rest: format };
  }

  // Check multi-word types (sorted by length, longest first)
  for (const mwt of MULTI_WORD_TYPES) {
    if (lower.startsWith(mwt)) {
      const afterType = format.substring(mwt.length);
      // Check for precision/array suffix
      const suffixMatch = afterType.match(/^(\s*\([^)]+\))?(\s*\[\s*\])*/);
      const suffix = suffixMatch ? suffixMatch[0] : '';
      const baseType = format.substring(0, mwt.length + suffix.length).trim();
      const rest = format.substring(mwt.length + suffix.length).trim();
      return { baseType: baseType.toUpperCase(), rest };
    }
  }

  // Check for extension types (may have parameters like vector(1536))
  for (const extType of Object.keys(EXTENSION_TYPES)) {
    if (lower.startsWith(extType)) {
      // Check for parameters
      const afterType = format.substring(extType.length);
      const paramMatch = afterType.match(/^(\s*\([^)]+\))?(\s*\[\s*\])*/);
      const suffix = paramMatch ? paramMatch[0] : '';
      const baseType = format
        .substring(0, extType.length + suffix.length)
        .trim();
      const rest = format.substring(extType.length + suffix.length).trim();
      return { baseType: baseType.toUpperCase(), rest };
    }
  }

  // Single word type with optional precision and array
  // Match: word, optional (precision), optional []
  const singleTypeMatch = format.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)(\s*\([^)]+\))?(\s*\[\s*\])*/,
  );

  if (singleTypeMatch) {
    const baseType = singleTypeMatch[0].trim();
    const rest = format.substring(singleTypeMatch[0].length).trim();
    return { baseType: baseType.toUpperCase(), rest };
  }

  // Fallback: return first word
  const firstWord = format.split(/\s+/)[0];
  return {
    baseType: firstWord.toUpperCase(),
    rest: format.substring(firstWord.length).trim(),
  };
}

/**
 * Parses a sanitized column type string into structured baseType and modifiers.
 * Uses safe keyword detection that respects string literals.
 *
 * This is a PURE FUNCTION - it never mutates the input.
 */
export function parseColumnType(sanitizedType: string): {
  baseType: string;
  modifiers: ColumnModifiers;
} {
  const { baseType, rest } = extractBaseType(sanitizedType);

  // Remove string literals for safe keyword detection
  const safeRest = removeStringLiterals(rest.toLowerCase());

  const modifiers: ColumnModifiers = {};

  // Identity columns (safe detection)
  if (safeRest.includes('generated') && safeRest.includes('identity')) {
    modifiers.identity = safeRest.includes('by default')
      ? 'by_default'
      : 'always';
  }

  // Generated/Computed columns (safe detection)
  if (safeRest.includes('generated') && !safeRest.includes('identity')) {
    // Use original rest for expression extraction (we need the actual content)
    const genMatch = rest.match(
      /generated\s+(?:always|by\s+default)\s+as\s*(\([^)]+\)|\S+)\s*(stored)?/i,
    );
    if (genMatch) {
      modifiers.generated = {
        expression: genMatch[1].replace(/^\(|\)$/g, '').trim(),
        stored: genMatch[2]?.toLowerCase() === 'stored' || true,
      };
    }
  }

  // Check constraints (safe detection)
  if (safeRest.includes('check')) {
    const checkIndex = rest.toLowerCase().indexOf('check');
    if (checkIndex !== -1) {
      const checkContent = extractBalancedParens(rest, checkIndex + 5);
      if (checkContent) {
        modifiers.check = {
          expression: checkContent.slice(1, -1).trim(), // Remove outer parens
        };
      }
    }
  }

  // Foreign key references (inline)
  if (safeRest.includes('references')) {
    const refMatch = rest.match(
      /references\s+(?:["']?(\w+)["']?\.)?["']?(\w+)["']?\s*\(\s*["']?(\w+)["']?\s*\)/i,
    );
    if (refMatch) {
      modifiers.references = {
        table: refMatch[1] ? `${refMatch[1]}.${refMatch[2]}` : refMatch[2],
        column: refMatch[3],
      };
    }
  }

  // Array detection (from base type)
  if (baseType.includes('[]')) {
    modifiers.isArray = true;
    modifiers.arrayDimensions = (baseType.match(/\[\]/g) || []).length;
  }

  // Deferrable constraints
  if (safeRest.includes('deferrable')) {
    modifiers.deferrable = true;
  }

  // Collation (extract from original)
  const collateMatch = rest.match(/collate\s+(?:"([^"]+)"|(\S+))/i);
  if (collateMatch) {
    modifiers.collate = collateMatch[1] || collateMatch[2];
  }

  return {
    baseType: normalizeBaseType(baseType),
    modifiers,
  };
}

/**
 * Normalizes base type strings for consistent display.
 */
function normalizeBaseType(baseType: string): string {
  // Remove array brackets for display (we track in modifiers)
  const withoutArrays = baseType.replace(/\[\]/g, '').trim();

  // Normalize whitespace
  return withoutArrays.replace(/\s+/g, ' ').toUpperCase();
}

// ============================================================================
// Badge Priority & Display Logic
// ============================================================================

export interface BadgeInfo {
  type: string;
  label?: string;
  icon?: string;
  color: string;
  priority: number;
  tooltip?: string;
}

/**
 * Determines which badges to show for a column, respecting priority rules.
 * Badges imply each other - show only the highest priority.
 */
export function getVisibleBadges(column: Column): BadgeInfo[] {
  const badges: BadgeInfo[] = [];

  // Priority 1: Primary Key (implies NN and often ID)
  if (column.pk) {
    badges.push({
      type: 'pk',
      icon: 'Key',
      color: 'yellow',
      priority: 1,
      tooltip: 'Primary Key',
    });
    // PK implies NOT NULL and often identity, so we return early
    // to avoid badge clutter
    return addSecondaryBadges(badges, column);
  }

  // Priority 2: Foreign Key
  if (column.fk || column.modifiers?.references) {
    badges.push({
      type: 'fk',
      icon: 'Link2',
      color: 'green',
      priority: 2,
      tooltip: column.fk
        ? `References ${column.fk}`
        : column.modifiers?.references
          ? `References ${column.modifiers.references.table}.${column.modifiers.references.column}`
          : 'Foreign Key',
    });
  }

  // Priority 3: Identity (implies NN)
  if (column.modifiers?.identity) {
    badges.push({
      type: 'id',
      label: 'ID',
      color: 'blue',
      priority: 3,
      tooltip:
        column.modifiers.identity === 'always'
          ? 'Generated Always As Identity'
          : 'Generated By Default As Identity',
    });
    // Identity implies NOT NULL, so skip NN badge
    return addSecondaryBadges(badges, column);
  }

  // Priority 4: Generated/Computed
  if (column.modifiers?.generated) {
    badges.push({
      type: 'gen',
      icon: 'Calculator',
      color: 'purple',
      priority: 4,
      tooltip: `Computed: ${column.modifiers.generated.expression}`,
    });
  }

  // Priority 5: Not Null (only if no higher priority badges imply it)
  if (column.required && !badges.some((b) => b.priority <= 3)) {
    badges.push({
      type: 'nn',
      label: '•',
      color: 'red',
      priority: 5,
      tooltip: 'Not Null',
    });
  }

  return addSecondaryBadges(badges, column);
}

/**
 * Adds secondary badges that can coexist with primary ones.
 */
function addSecondaryBadges(badges: BadgeInfo[], column: Column): BadgeInfo[] {
  // Check constraint
  if (column.modifiers?.check) {
    badges.push({
      type: 'chk',
      icon: 'CheckCircle',
      color: 'orange',
      priority: 6,
      tooltip: `Check: ${column.modifiers.check.expression}`,
    });
  }

  // Array type
  if (column.modifiers?.isArray) {
    badges.push({
      type: 'array',
      label: '[]',
      color: 'gray',
      priority: 7,
      tooltip: `Array${column.modifiers.arrayDimensions && column.modifiers.arrayDimensions > 1 ? ` (${column.modifiers.arrayDimensions}D)` : ''}`,
    });
  }

  // Unique constraint
  if (column.unique) {
    badges.push({
      type: 'unique',
      icon: 'Sparkles',
      color: 'blue',
      priority: 8,
      tooltip: 'Unique',
    });
  }

  // Check for extension types
  const baseTypeLower = column.format?.toLowerCase() || '';
  for (const [extType, info] of Object.entries(EXTENSION_TYPES)) {
    if (baseTypeLower.startsWith(extType)) {
      badges.push({
        type: 'ext',
        icon: info.icon,
        color: 'teal',
        priority: 9,
        tooltip: `${extType} (${info.extension})`,
      });
      break;
    }
  }

  return badges;
}

// ============================================================================
// Display Formatting Utilities
// ============================================================================

/**
 * Formats a column for compact display in table nodes.
 */
export function formatColumnDisplay(column: Column): {
  name: string;
  type: string;
  badges: BadgeInfo[];
} {
  const { baseType, modifiers } = parseColumnType(
    sanitizeTypeString(column.format),
  );

  // Merge parsed modifiers with stored modifiers
  const mergedColumn: Column = {
    ...column,
    modifiers: { ...column.modifiers, ...modifiers },
  };

  return {
    name: column.title,
    type: baseType + (modifiers.isArray ? '[]' : ''),
    badges: getVisibleBadges(mergedColumn),
  };
}

/**
 * Gets tooltip content for a column (full details).
 */
export function getColumnTooltip(column: Column): string {
  const parts: string[] = [];

  // Full raw type
  parts.push(`Type: ${column.format}`);

  const { modifiers } = parseColumnType(sanitizeTypeString(column.format));

  // Modifiers
  if (modifiers.identity) {
    parts.push(
      `Identity: ${modifiers.identity === 'always' ? 'GENERATED ALWAYS' : 'GENERATED BY DEFAULT'}`,
    );
  }

  if (modifiers.generated) {
    parts.push(`Computed: ${modifiers.generated.expression}`);
    parts.push(`Stored: ${modifiers.generated.stored ? 'Yes' : 'No'}`);
  }

  if (modifiers.check) {
    parts.push(`Check: ${modifiers.check.expression}`);
  }

  if (column.fk || modifiers.references) {
    const ref =
      column.fk ||
      `${modifiers.references?.table}.${modifiers.references?.column}`;
    parts.push(`References: ${ref}`);
  }

  if (column.default !== undefined) {
    parts.push(`Default: ${column.default}`);
  }

  if (column.required) {
    parts.push('Required: Yes');
  }

  if (column.unique) {
    parts.push('Unique: Yes');
  }

  return parts.join('\n');
}

/**
 * Checks if a type is an extension type.
 */
export function isExtensionType(
  typeName: string,
): { icon: string; extension: string } | null {
  const lower = typeName.toLowerCase();
  for (const [extType, info] of Object.entries(EXTENSION_TYPES)) {
    if (lower.startsWith(extType)) {
      return info;
    }
  }
  return null;
}
