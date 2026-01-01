# Schema Display Optimization Strategy

## Problem Statement

When the AI generates SQL DDL (Data Definition Language) statements for database schemas, the resulting text can become very long and cause UI components to expand horizontally, breaking the visual layout. This is particularly evident in:

1. **Table nodes in the flow canvas** - Cards expand horizontally to accommodate long type definitions
2. **GUI Editor sidebar** - Column definitions overflow their containers
3. **Type definitions** - Long modifiers like `BIGINT GENERATED ALWAYS AS IDENTITY` cause horizontal overflow

### Root Cause Analysis

The fundamental issue is **data density**—we are currently trying to display the *definition* of the data rather than the *nature* of the data. SQL DDL is designed for execution, not for visual display.

### Specific Problem Elements

| SQL Element | Example | Display Problem |
|-------------|---------|-----------------|
| Identity columns | `BIGINT GENERATED ALWAYS AS IDENTITY` | 35+ characters for type alone |
| Generated/Computed | `NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED` | Expression can be arbitrarily long |
| CHECK constraints | `CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled'))` | Multiple values expand indefinitely |
| Foreign keys | `REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE NO ACTION` | Full reference path is verbose |
| Default expressions | `DEFAULT timezone('utc'::text, now())` | Complex expressions |
| Multi-word types | `TIMESTAMP WITH TIME ZONE`, `DOUBLE PRECISION` | 20+ characters |
| PostGIS types | `GEOMETRY(Point, 4326)` | Parameters are critical, can't abbreviate |
| Collations | `text COLLATE "de_DE" COMPRESSION pglz` | Infrastructure noise |

---

## Current Architecture Analysis

### Existing Type System (`src/lib/types.ts`)

The current `Column` interface already separates concerns to some degree:

```typescript
interface Column {
  title: string;       // Column name
  format: string;      // Display format (e.g., 'bigint', 'text')
  type: string;        // Internal type
  default?: any;       // Default value
  required?: boolean;  // NOT NULL
  pk?: boolean;        // Primary key
  fk?: string;         // Foreign key reference
  unique?: boolean;    // Unique constraint
  enumValues?: string[];
  enumTypeName?: string;
  isArray?: boolean;
  comment?: string;
}
```

### Current Display (`src/components/flow/ModernTableNode.tsx`)

The current implementation already uses icons for some properties:
- 🔑 Key icon for primary keys
- 🔗 Link2 icon for foreign keys
- ✨ Sparkles icon for unique
- 📋 List icon for enums
- ⚪ Circle for regular columns

**What's missing:**
- No handling for `GENERATED AS IDENTITY`
- No handling for computed/generated columns
- `format` field contains full type string (e.g., `"bigint generated always as identity"`)
- No truncation or overflow handling for long formats

---

## Proposed Solution Architecture

### Phase 1: Extended Column Schema (Data Model)

Extend the `Column` interface to separate base type from modifiers:

```typescript
interface Column {
  // Existing fields...
  title: string;
  format: string;           // Keep for backward compatibility
  type: string;
  
  // NEW: Structured type information
  baseType?: string;        // e.g., 'bigint', 'numeric(12,2)', 'text'
  modifiers?: ColumnModifiers;
}

interface ColumnModifiers {
  identity?: boolean | 'always' | 'by_default';
  generated?: {
    expression: string;     // e.g., 'quantity * unit_price'
    stored: boolean;
  };
  check?: {
    expression: string;     // e.g., "status IN ('pending', 'paid')"
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
  arrayDimensions?: number; // For multi-dimensional arrays like integer[][]
}
```

### Phase 2: Display Component Enhancement

Create a compact display system using badges/icons:

```
┌─────────────────────────────────────┐
│ products                            │
├─────────────────────────────────────┤
│ 🔑 id          BIGINT    [ID]      │
│ ⚪ name        TEXT      [NN]      │
│ ⚪ price       NUMERIC   [CHK]     │
│ ⚙️ subtotal    NUMERIC   [GEN]     │
│ 🔗 user_id     BIGINT    [FK→]     │
└─────────────────────────────────────┘
```

**Badge Priority System (to avoid badge clutter):**

Badges imply each other. Show only the highest priority:

| Priority | Badge | Implies |
|----------|-------|---------|
| 1 | `PK` (Primary Key) | `NN` (Not Null), often `ID` |
| 2 | `FK` (Foreign Key) | - |
| 3 | `ID` (Identity) | `NN` (Not Null) |
| 4 | `GEN` (Generated) | - |
| 5 | `NN` (Not Null) | - |

**Rule:** If `PK` is shown, don't show `NN` or `ID`. If `ID` is shown, don't show `NN`.

### Phase 3: Progressive Disclosure UI

Implement a three-tier information architecture:

**Tier 1 - Always Visible (Compact):**
- Column name
- Base type only (e.g., `BIGINT`, not `BIGINT GENERATED ALWAYS...`)
- Icons for key properties (PK, FK, etc.)
- Small badges for modifiers (prioritized)

**Tier 2 - On Hover (Tooltip via Portal):**
- Full type definition
- Constraint expressions
- Default values
- Foreign key details

**Important:** Use a **React Portal** for tooltips. Standard CSS hover inside React Flow nodes will get clipped by canvas boundaries or `overflow: hidden`.

**Tier 3 - On Click/Expand (Detail Panel):**
- Complete SQL definition
- Edit capabilities
- Related constraints and indexes

---

## Critical Edge Cases

### 1. Multi-Word Base Types (The "Timestamp" Trap)

**Problem:** Types like `TIMESTAMP WITH TIME ZONE` or `DOUBLE PRECISION` are multi-word.

**The Breaker:** A naive regex like `/^([^\s(]+)/` extracts only `TIMESTAMP`, leaving `WITH TIME ZONE` as garbage.

**Solution:** Use a whitelist of multi-word types or consume words until hitting a reserved keyword:

```typescript
const MULTI_WORD_TYPES = [
  'timestamp with time zone',
  'timestamp without time zone',
  'time with time zone',
  'time without time zone',
  'double precision',
  'character varying',
  'bit varying',
];

const STOP_KEYWORDS = [
  'GENERATED', 'DEFAULT', 'NOT', 'NULL', 'CHECK', 
  'PRIMARY', 'REFERENCES', 'CONSTRAINT', 'UNIQUE',
  'COLLATE', 'COMPRESSION', 'DEFERRABLE'
];
```

### 2. Arrays (The Syntax `[]`)

**Problem:** `text[]`, `integer[][]`, `character varying(255)[]`

**Solution:** 
- Preserve `[]` in `baseType`
- Add `isArray: true` modifier
- For multi-dimensional: `arrayDimensions: 2`
- Add a "stack" icon or `[ ]` badge for array types

### 3. PostGIS & Geometric Types

**Problem:** `GEOMETRY(Point, 4326)` or `GEOGRAPHY(Polygon, 4326)` have critical parameters.

**Solution:**
- Don't abbreviate these types
- If `type.startsWith('geo')`, show full definition in tooltip
- Use a distinct "Globe" icon in compact view
- Never strip the SRID parameter (4326)

### 4. Collations & Storage Parameters (The "Noise")

**Problem:** `text COLLATE "de_DE" COMPRESSION pglz` adds length but isn't schema-critical.

**Solution:** Strip completely for compact view:
- Remove `COLLATE ...`
- Remove `COMPRESSION ...`
- Remove `WITH (fillfactor = 70)`
- Remove `TABLESPACE ...`

These go in a "Table Settings" modal if needed.

### 5. Quoted Identifiers & Unicode

**Problem:** Columns named `"Select"`, `"User Name"`, or `"📦_status"`.

**The Breaker:** Regex like `\w+` fails on spaces and unicode.

**Solution:**
```typescript
// Support quoted identifiers and unicode
const IDENTIFIER_REGEX = /^("?[\w\s\u00A0-\uFFFF]+"?|[\w]+)/;
```

**Case Sensitivity:** 
- Unquoted: `UserTable` → `usertable` (Postgres lowercases)
- Quoted: `"UserTable"` stays `"UserTable"`
- UI must respect this or generated SQL will fail

### 6. Partitioned Tables

**Problem:** `CREATE TABLE measurements (...) PARTITION BY RANGE (log_date);`

**Solution:**
- Add a "Partition Parent" icon (stacked layers)
- Collapse child partitions by default
- Show children as a single "stack" behind main node

### 7. Table Inheritance

**Problem:** `CREATE TABLE capitals (state char(2)) INHERITS (cities);`

**The Issue:** Inherited columns aren't in the `CREATE` statement—table appears empty.

**Solution:**
- Detect `INHERITS`
- Pull columns from parent table
- Show inherited columns grayed out to indicate source

### 8. Foreign Tables (FDW)

**Problem:** `CREATE FOREIGN TABLE stripe_payments (...) SERVER stripe_server;`

**Solution:**
- Distinct header color (purple or striped)
- "Globe/Cloud" icon indicating "data lives elsewhere"

### 9. Range Types

**Problem:** `int4range`, `daterange`, `tstzrange`

**Solution:**
- Custom icon (horizontal slider `[---]`)
- Common in scheduling/calendaring apps

### 10. Custom Domains

**Problem:** `CREATE DOMAIN us_zip AS TEXT CHECK (VALUE ~ '^\d{5}$');`

**The Issue:** Column shows `us_zip`—is it string? number? object?

**Solution:**
- Resolve underlying type for display
- Show `US_ZIP` as main type
- Small label `(TEXT)` underneath

### 11. Exclusion Constraints

**Problem:** `EXCLUDE USING gist (c WITH &&)` is verbose.

**Solution:**
- Badge as `[EXCL]`
- Full logic in tooltip only

---

## Implementation Plan

### Short-term Fixes (Quick Wins)

1. **Noise Reduction Sanitizer (First Step)**
   ```typescript
   function sanitizeTypeString(fullType: string): string {
     return fullType
       .replace(/\s+WITH\s*\([^)]+\)/gi, '')      // Remove WITH (fillfactor...)
       .replace(/\s+TABLESPACE\s+\w+/gi, '')      // Remove TABLESPACE
       .replace(/\s+COLLATE\s+"?[^"\s]+"?/gi, '') // Remove COLLATE
       .replace(/\s+COMPRESSION\s+\w+/gi, '')     // Remove COMPRESSION
       .trim();
   }
   ```

2. **CSS Overflow Handling**
   ```css
   .table-node {
     max-width: 320px;
   }
   .column-type {
     max-width: 35%;
     overflow: hidden;
     text-overflow: ellipsis;
     white-space: nowrap;
   }
   ```

3. **Consumption-Based Parser**
   ```typescript
   const parseColumnType = (fullFormat: string) => {
     // Sanitize first
     let remaining = sanitizeTypeString(fullFormat).trim();
     
     // Extract Base Type (Handle Multi-word & Arrays)
     const typeMatch = remaining.match(
       /^([\w\s]+(\([^)]+\))?(\[\])*)(?=\s+(GENERATED|DEFAULT|NOT|CHECK|PRIMARY|REFERENCES|CONSTRAINT|$))/i
     );
     
     // Fallback: whole string is the type
     const baseType = typeMatch ? typeMatch[0].trim() : remaining;
     
     // Process modifiers from remainder
     remaining = remaining.substring(baseType.length).toLowerCase();
   
     return {
       baseType: normalizeBaseType(baseType),
       modifiers: {
         identity: remaining.includes('generated') && remaining.includes('identity'),
         generated: remaining.includes('generated') && !remaining.includes('identity'),
         check: remaining.includes('check'),
         default: remaining.includes('default'),
         deferrable: remaining.includes('deferrable'),
       }
     };
   };
   ```

### Medium-term Improvements

1. **Update SQL Parser** (`src/lib/sql-parser.ts`)
   - Extract modifiers during parsing
   - Populate `baseType` and `modifiers` fields
   - Maintain backward compatibility with `format` field

2. **Create Display Components**
   - `<ColumnTypeDisplay>` - Smart type rendering with abbreviation
   - `<ModifierBadges>` - Prioritized icon/badge row
   - `<ColumnDetailPopover>` - Portal-based tooltip for full details

3. **Update AI Tool Schemas** (`src/app/api/chat/route.ts`)
   - Extend column input schema to accept structured modifiers
   - AI can output either full SQL format or structured format
   - Parser normalizes both to internal representation

### Long-term Architecture

1. **Use a Real Parser (Avoid the Regex Trap)**
   - For production: use `pgsql-ast-parser` or `libpg-query` (WASM)
   - Handles nested parentheses, function calls in DEFAULT
   - Reliable constraint extraction without edge case failures

2. **Schema Intermediate Representation (IR)**
   - Canonical internal format for all schema objects
   - Multiple input parsers (SQL, AI output, import)
   - Multiple output renderers (compact UI, full SQL, migration)

---

## Component Design Specifications

### SmartColumnRow Component

```typescript
interface SmartColumnRowProps {
  name: string;
  format: string;       // Full raw string for backward compat
  baseType?: string;    // Parsed base type
  modifiers?: ColumnModifiers;
  isPk?: boolean;
  isFk?: boolean;
  isUnique?: boolean;
}
```

### Badge Priority Logic

```typescript
function getVisibleBadges(column: Column): Badge[] {
  const badges: Badge[] = [];
  
  // PK implies NN and often ID - show only PK
  if (column.pk) {
    badges.push({ type: 'pk', icon: Key, color: 'yellow' });
  } else {
    // FK doesn't imply other badges
    if (column.fk) {
      badges.push({ type: 'fk', icon: Link2, color: 'green' });
    }
    
    // ID implies NN - show only ID
    if (column.modifiers?.identity) {
      badges.push({ type: 'id', label: 'ID', color: 'blue' });
    } else if (column.required) {
      badges.push({ type: 'nn', label: '•', color: 'red' });
    }
  }
  
  // These don't imply each other
  if (column.modifiers?.generated) {
    badges.push({ type: 'gen', icon: Calculator, color: 'purple' });
  }
  if (column.modifiers?.check) {
    badges.push({ type: 'chk', icon: CheckCircle, color: 'orange' });
  }
  
  return badges;
}
```

### Layout Constraints

| Element | Max Width | Overflow Behavior |
|---------|-----------|-------------------|
| Table Node | 320px | Internal scroll |
| Column Name | 40% | Truncate with ellipsis |
| Type Display | 35% | Abbreviate + badge |
| Modifiers | 25% | Icon row, overflow to +N |

---

## Type Mapping Reference

### Base Type Extraction Examples

| Full Type | Base Type | Modifiers |
|-----------|-----------|-----------|
| `BIGINT GENERATED ALWAYS AS IDENTITY` | `BIGINT` | `{identity: 'always'}` |
| `NUMERIC(12,2) GENERATED ALWAYS AS (qty * price) STORED` | `NUMERIC(12,2)` | `{generated: {expression: 'qty * price'}}` |
| `TEXT CHECK (status IN ('a', 'b'))` | `TEXT` | `{check: {expression: "..."}}` |
| `TIMESTAMP WITH TIME ZONE DEFAULT now()` | `TIMESTAMP WITH TIME ZONE` | (use existing `default` field) |
| `text[]` | `TEXT[]` | `{isArray: true}` |
| `integer[][]` | `INTEGER[][]` | `{isArray: true, arrayDimensions: 2}` |
| `GEOMETRY(Point, 4326)` | `GEOMETRY(Point, 4326)` | (don't abbreviate geo types) |

### Icon/Badge Mapping

| Property | Icon | Badge Text | Color | Priority |
|----------|------|------------|-------|----------|
| Primary Key | `Key` | - | Yellow | 1 |
| Foreign Key | `Link2` | `→table` | Green | 2 |
| Identity | `Zap` or `Hash` | `ID` | Blue | 3 |
| Generated | `Calculator` | `GEN` | Purple | 4 |
| Not Null | - | `•` | Red | 5 |
| Check | `CheckCircle` | `CHK` | Orange | 6 |
| Unique | `Sparkles` | `UNQ` | Blue | 7 |
| Array | `Layers` | `[]` | Gray | 8 |
| Geo Type | `Globe` | - | Teal | - |
| Range | `Slider` | `[--]` | Indigo | - |
| Has Default | `Equal` | `=` | Gray | - |

---

## 🔴 Critical Issues (Must Fix Before Ship)

These issues will cause the tool to be fundamentally broken or produce incorrect output.

### 1. SERIAL/BIGSERIAL Type Expansion

**The Problem:** When importing from a live database via `pg_dump` or `information_schema`, you never see `SERIAL`—you see the expanded form.

```sql
-- User writes:
id SERIAL PRIMARY KEY

-- PostgreSQL stores (and returns via information_schema):
id INTEGER NOT NULL DEFAULT nextval('users_id_seq'::regclass)
```

**The Consequence:** Every primary key looks like a messy computed column instead of a clean ID.

**The Fix:** Detect and collapse `nextval()` patterns:
```typescript
const SERIAL_PATTERN = /^integer\s+.*default\s+nextval\([^)]+_seq/i;
const BIGSERIAL_PATTERN = /^bigint\s+.*default\s+nextval\([^)]+_seq/i;

function detectSerialType(format: string): 'SERIAL' | 'BIGSERIAL' | null {
  if (BIGSERIAL_PATTERN.test(format)) return 'BIGSERIAL';
  if (SERIAL_PATTERN.test(format)) return 'SERIAL';
  return null;
}
```

### 2. String Literals Containing Keywords

**The Problem:** A CHECK constraint may contain reserved words inside string literals.

```sql
status TEXT CHECK (status != 'GENERATED BY AI')
```

**The Consequence:** `remaining.includes('generated')` false-positives and badges the column as `[GEN]`.

**The Fix:** Strip string literals before keyword detection:
```typescript
function removeStringLiterals(sql: string): string {
  return sql
    .replace(/'[^']*'/g, "''")           // Replace 'strings' with empty
    .replace(/"[^"]*"/g, '""')           // Replace "identifiers"
    .replace(/\$\$[\s\S]*?\$\$/g, '');   // Dollar quotes
}

// Check keywords on sanitized version
const keywordCheck = removeStringLiterals(remaining);
const hasIdentity = keywordCheck.includes('generated') && keywordCheck.includes('identity');
```

### 3. Nested Parentheses in DEFAULT

**The Problem:** PostgreSQL allows subqueries and complex expressions in DEFAULT.

```sql
price NUMERIC DEFAULT (SELECT max(base_price) FROM products WHERE active = true)
duration INTERVAL DEFAULT (now() + interval '1 day')
```

**The Consequence:** Regex `/\([^)]+\)/` matches the first `)` and breaks.

**The Fix:** Use a parenthesis-balancing parser:
```typescript
function extractBalancedParens(str: string, startIndex: number): string {
  let depth = 0;
  let start = -1;
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (str[i] === ')') {
      depth--;
      if (depth === 0) return str.substring(start, i + 1);
    }
  }
  return '';
}
```

### 4. Comments in DDL

**The Problem:** Real-world SQL files contain comments.

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY, -- auto-incremented
  name TEXT NOT NULL -- user's display name
);
```

**The Consequence:** `splitByComma()` includes `-- auto-incremented` in the column definition, causing parse failures or invalid SQL export.

**The Fix:** Strip comments before parsing:
```typescript
function stripSqlComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, '')           // Single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '');  // Block comments
}
```

### 5. Greedy Regex Bug in Multi-Word Type Detection

**The Problem:** The regex `[\w\s]+` is greedy.

For `TEXT NOT NULL`:
1. Matches `TEXT NOT` (all word/space chars)
2. Lookahead for `NULL` fails
3. Backtrack fails to find valid split

**The Fix:** Use whitelist approach with longest-match-first:
```typescript
function extractBaseType(format: string): string {
  const lower = format.toLowerCase();
  
  // Check multi-word types first (longest match wins)
  for (const mwt of MULTI_WORD_TYPES.sort((a, b) => b.length - a.length)) {
    if (lower.startsWith(mwt)) {
      const afterType = format.substring(mwt.length);
      const suffixMatch = afterType.match(/^(\([^)]+\))?(\[\])?/);
      return mwt.toUpperCase() + (suffixMatch?.[0] || '');
    }
  }
  
  // Single word type
  const match = format.match(/^(\w+(\([^)]+\))?(\[\])*)/);
  return match ? match[0] : format;
}
```

### 6. XSS in Column Names

**The Problem:** Column names could contain malicious content.

```sql
CREATE TABLE test (
  "<script>alert('xss')</script>" TEXT
);
```

**The Fix:** React's JSX escapes by default, but verify:
- Never use `dangerouslySetInnerHTML` with user data
- SQL export must properly quote identifiers
- Add sanitization tests

---

## 🟡 High Priority (Fix Before Launch)

### 7. Extension Types (Vector, etc.)

Modern PostgreSQL users rely on extensions:

| Type | Extension | Importance |
|------|-----------|------------|
| `vector(1536)` | pgvector | **Critical for AI apps** |
| `citext` | citext | Common |
| `hstore` | hstore | Legacy but used |
| `ltree` | ltree | Hierarchical data |
| `tsvector` | built-in | Full-text search |

**The Fix:** Add extension type detection:
```typescript
const EXTENSION_TYPES: Record<string, { icon: string; extension: string }> = {
  'geometry': { icon: 'Globe', extension: 'postgis' },
  'geography': { icon: 'Globe', extension: 'postgis' },
  'vector': { icon: 'Brain', extension: 'pgvector' },
  'citext': { icon: 'CaseSensitive', extension: 'citext' },
  'hstore': { icon: 'Braces', extension: 'hstore' },
  'ltree': { icon: 'GitBranch', extension: 'ltree' },
  'tsvector': { icon: 'Search', extension: 'built-in' },
};
```

### 8. Malformed Input Handling

**The Problem:** Users will paste bad SQL. The app shouldn't crash.

**The Fix:** Return partial results with error reporting:
```typescript
interface ParseResult {
  tables: Record<string, Table>;
  errors: Array<{
    line?: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
}
```

### 9. Touch/Mobile Support

**The Problem:** Hover tooltips don't work on mobile/tablet.

**The Fix:**
- Long-press to show tooltip
- Tap toggles expanded state
- Alternative: tap opens detail panel

### 10. Named Constraints Inline

**The Problem:** Constraint names matter for migrations.

```sql
id BIGINT CONSTRAINT pk_users PRIMARY KEY
email TEXT CONSTRAINT email_unique UNIQUE
```

**The Fix:** Add to Column interface:
```typescript
interface Column {
  // ... existing
  constraintNames?: {
    primaryKey?: string;
    unique?: string;
    foreignKey?: string;
    check?: string;
  };
}
```

---

## 🟢 Optional (v1.1)

- **Virtualization (#17):** For 100+ tables
- **Web Worker Parsing (#18):** For >5MB SQL files
- **UNLOGGED Tables:** Visual distinction
- **Exclusion Constraints:** Rare in web apps
- **Complex Collation Regex:** Rare use case

---

## Critical Parser Gap: Table-Level Constraint Back-Propagation

### The Problem

The current `sql-parser.ts` relies on `parseColumnType(column.format)` to detect attributes. However, in PostgreSQL, constraints are often defined at the **Table Level** (bottom of CREATE TABLE), not inline with the column.

**Example that will break current logic:**

```sql
CREATE TABLE order_items (
    order_id INT,
    product_id INT,
    -- This PK is NOT in the column definition strings!
    PRIMARY KEY (order_id, product_id), 
    -- This FK is NOT in the column definition string!
    FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

**Current Parser Behavior:**
1. ✅ Handles inline column constraints (`id BIGINT PRIMARY KEY`)
2. ✅ Handles `ALTER TABLE` constraints (second pass)
3. ❌ Does NOT handle inline table-level constraints at bottom of CREATE TABLE

**Consequence:** `parseColumnType` sees `order_id INT`, finds no `PRIMARY KEY` keyword. UI shows `order_id` as a regular column (⚪) when it's actually a Primary Key.

### The Fix: Two-Pass Parsing Within CREATE TABLE

Add a "back-propagation" step inside `parseColumns()`:

```typescript
function parseColumns(
  createStatement: string,
  enumTypes: Map<string, string[]> = new Map(),
): Column[] {
  const columns: Column[] = [];
  const tableConstraints: TableConstraint[] = []; // NEW

  const match = createStatement.match(/\(([\s\S]+)\)/);
  if (!match) return columns;

  const columnDefs = splitByComma(match[1]);

  for (const def of columnDefs) {
    const trimmed = def.trim();

    // Capture table-level constraints instead of skipping
    if (trimmed.match(/^primary\s+key\s*\(/i)) {
      const cols = extractConstraintColumns(trimmed);
      tableConstraints.push({ type: 'primary_key', columns: cols });
      continue;
    }
    if (trimmed.match(/^foreign\s+key\s*\(/i)) {
      const { cols, ref } = extractForeignKeyInfo(trimmed);
      tableConstraints.push({ type: 'foreign_key', columns: cols, reference: ref });
      continue;
    }
    if (trimmed.match(/^unique\s*\(/i)) {
      const cols = extractConstraintColumns(trimmed);
      tableConstraints.push({ type: 'unique', columns: cols });
      continue;
    }
    // ... parse regular columns
  }

  // BACK-PROPAGATION STEP
  for (const constraint of tableConstraints) {
    if (constraint.type === 'primary_key') {
      constraint.columns.forEach(colName => {
        const col = columns.find(c => c.title === colName);
        if (col) {
          col.pk = true;
          col.required = true;
        }
      });
    }
    if (constraint.type === 'foreign_key') {
      constraint.columns.forEach(colName => {
        const col = columns.find(c => c.title === colName);
        if (col && constraint.reference) {
          col.fk = `${constraint.reference.table}.${constraint.reference.column}`;
        }
      });
    }
    if (constraint.type === 'unique') {
      constraint.columns.forEach(colName => {
        const col = columns.find(c => c.title === colName);
        if (col) col.unique = true;
      });
    }
  }

  return columns;
}
```

### Composite Keys

This also handles **composite primary keys** correctly:

```sql
PRIMARY KEY (order_id, product_id)
```

Both `order_id` and `product_id` will have `pk: true` set.

---

## Additional UX Considerations

### 1. Search Schema (Cmd+F Limitation)

**Problem:** Hidden details (Check constraints in tooltips) won't be found by browser Cmd+F since the tooltip isn't in the DOM until hover.

**Solution:** Implement a dedicated "Search Schema" bar that searches the *data model*, not the rendered DOM.

### 2. Copy/Paste Experience

**Problem:** If user selects a node and hits Cmd+C, ensure they get **Raw SQL** (or clean JSON), not visual text like "BIGINT [ID]".

**Solution:** Users copy nodes to paste into DB clients—they need executable code. Implement custom clipboard handling for nodes.

---

## Production Readiness Checklist

Handle these to be in the top 1% of schema tools:

- [ ] **Inheritance:** Show inherited columns (grayed out)
- [ ] **Partitioning:** Group/hide child partitions
- [ ] **Quotes:** Handle `"Order Date"` without crashing
- [ ] **Unicode:** Handle table `🚀_launches`
- [ ] **Arrays:** Render `text[][]` correctly
- [ ] **FDW:** Foreign tables look distinct
- [ ] **Ranges:** `daterange` types have distinct icon
- [ ] **Domains:** Custom types resolve to base type
- [ ] **PostGIS:** Geo types show full definition
- [ ] **Case Sensitivity:** Preserve quoted identifier case

---

## Migration Strategy

### Backward Compatibility

1. Keep `format` field populated with full type string
2. Add new fields as optional (`baseType`, `modifiers`)
3. Display logic falls back to `format` if structured fields missing
4. Gradually migrate parsing and AI output to use structured format

### Parser Updates

```typescript
// In parseColumnDefinition(), after extracting type:
const sanitized = sanitizeTypeString(rawDefinition);
const { baseType, modifiers } = parseColumnType(sanitized);

return {
  title: columnName,
  format: format,              // Full string for backward compat
  type: enumTypeName ? 'enum' : determineType(format),
  baseType: baseType,          // NEW: Just the type
  modifiers: modifiers,        // NEW: Structured modifiers
  // ... rest of fields
};
```

---

## Testing Considerations

1. **Visual Regression Tests**
   - Ensure table nodes don't exceed max width
   - Verify truncation appears correctly
   - Check tooltip/popover positioning (Portal-based)

2. **Parser Tests**
   - All PostgreSQL type variants correctly extracted
   - Multi-word types handled
   - Arrays preserved
   - Quoted identifiers work
   - Unicode support

3. **Edge Case Tests**
   - `TIMESTAMP WITH TIME ZONE` → not `TIMESTAMP`
   - `text[][]` → preserves dimensions
   - `"User Name"` → preserves quotes
   - `GEOMETRY(Point, 4326)` → not abbreviated

4. **AI Integration Tests**
   - AI-generated schemas display correctly
   - Structured output properly parsed
   - SQL export produces valid DDL

---

## Application Lifecycle Considerations

These are critical implementation details that prevent production bugs.

### 1. The "Round-Trip" Data Loss Risk

**The Trap:** If the sanitized output becomes the "source of truth," imported schemas will lose production optimizations (tablespaces, compression settings) when exported.

**The Rule:** Input SQL == Output SQL (unless the user explicitly changed it).

**Implementation:**
```typescript
// WRONG: Mutating the store
column.format = sanitizeTypeString(column.format); // ❌ Data loss!

// CORRECT: Pure selectors at render time
const getDisplayType = (column: Column) => {
  // Never mutate - compute on demand
  return parseColumnType(sanitizeTypeString(column.format));
};

// Store structure
interface Column {
  format: string;        // NEVER MUTATE - original SQL
  baseType?: string;     // Computed/cached, not authoritative
  modifiers?: ColumnModifiers; // Computed/cached, not authoritative
}
```

**Key Principle:** The `sanitizeTypeString()` and `parseColumnType()` functions are **Selectors** (pure functions), not transformers. They run at render time or are memoized—they never alter the saved state.

### 2. The Editing Experience (Interaction Paradox)

**The Trap:** User sees `BIGINT [ID]`, double-clicks to edit, and either:
- Sees only `BIGINT` → saves → loses `GENERATED ALWAYS AS IDENTITY`
- Sees full 50-character string in a 150px input → impossible to edit

**The Fix: Hybrid Editing Mode**

Do NOT expand raw SQL into a tiny input field. Instead, open a **Popover Form** or **Side Panel**:

```
┌─────────────────────────────────────┐
│ Edit Column: id                     │
├─────────────────────────────────────┤
│ Name:     [id________________]      │
│                                     │
│ Type:     [BIGINT         ▼]        │
│                                     │
│ ☑ Primary Key                       │
│ ☑ Identity (Auto Increment)         │
│ ☐ Nullable                          │
│ ☐ Unique                            │
│                                     │
│ Default:  [________________]        │
│                                     │
│ [Cancel]              [Save]        │
└─────────────────────────────────────┘
```

**Why:** Don't make users type SQL. Let them toggle switches. The SQL is generated from the structured form data on save.

### 3. React Flow Performance Bottleneck

**The Trap:** Regex parsing inside `SmartColumnRow` runs on every render. With 50 tables × 20 columns = **1,000 regex operations per frame** during zoom/pan/drag. This causes lag.

**The Fix: Memoization**

Option A: Parse once on import, store in state:
```typescript
// On schema import/load
const importSchema = (sql: string) => {
  const tables = parseSql(sql);
  
  // Pre-compute display data, store alongside raw
  for (const table of Object.values(tables)) {
    for (const column of table.columns) {
      const parsed = parseColumnType(column.format);
      column.baseType = parsed.baseType;       // Cached
      column.modifiers = parsed.modifiers;     // Cached
      // column.format remains untouched (source of truth)
    }
  }
  
  store.setState({ tables });
};
```

Option B: Memoize inside the component:
```typescript
const SmartColumnRow: React.FC<Props> = ({ column }) => {
  // Only re-parse if raw format string actually changes
  const { baseType, modifiers } = useMemo(
    () => parseColumnType(column.format),
    [column.format]
  );
  
  return (
    // ... render with baseType and modifiers
  );
};
```

**Recommendation:** Use Option A (parse on import) for large schemas. Use Option B (useMemo) as a fallback for dynamic/AI-generated content.

---

## Success Metrics

1. **Visual**: Table nodes maintain consistent width (≤320px)
2. **Information**: All column details accessible within 2 clicks
3. **Performance**: No additional render cycles for type processing
4. **Compatibility**: Existing saved schemas display correctly
5. **Edge Cases**: All 10 production checklist items passing

---

## References

- Current implementation: `src/components/flow/ModernTableNode.tsx`
- Type definitions: `src/lib/types.ts`
- SQL Parser: `src/lib/sql-parser.ts`
- SQL Generator: `src/lib/schema-sql.ts`
- AI Route: `src/app/api/chat/route.ts`

---

## Implementation Checklist (Final)

Before writing code, verify:

### 🔴 Critical (Ship Blockers)
- [x] **SERIAL Detection:** Collapse `nextval()` patterns back to SERIAL/BIGSERIAL ✅
- [x] **String Literal Safety:** Don't match keywords inside quoted strings ✅
- [x] **Nested Parens:** Handle subqueries in DEFAULT expressions with balanced parser ✅
- [x] **Comment Stripping:** Remove `--` and `/* */` before parsing ✅
- [x] **Greedy Regex Fix:** Use whitelist approach for multi-word types ✅
- [x] **XSS Prevention:** Never use dangerouslySetInnerHTML with column data ✅

### Data Integrity
- [x] **Round-Trip Safety:** Raw `format` string is never mutated in store ✅
- [x] **Selectors:** `sanitizeTypeString()` and `parseColumnType()` are pure functions ✅
- [x] **Table-Level Constraints:** Parser back-propagates PKs, FKs, UNIQUEs from CREATE TABLE footer ✅
- [ ] **Named Constraints:** Preserve constraint names for PK/FK/UNIQUE/CHECK
- [ ] **Cache Invalidation:** Clear baseType/modifiers when format changes

### Parser Robustness
- [ ] **Graceful Degradation:** Return partial results on parse failure
- [ ] **Error Reporting:** Surface line numbers and clear error messages
- [x] **Case Handling:** Normalize to lowercase internally, preserve case for display ✅

### User Experience
- [ ] **Edit UX:** Column editing uses form-based UI, not raw SQL input
- [x] **Tooltips:** Use React Portal to avoid clipping in React Flow canvas ✅
- [x] **Badge Priority:** Implement priority logic to avoid badge clutter ✅
- [ ] **Search:** Schema search queries data model, not just DOM
- [ ] **Copy/Paste:** Copying nodes produces executable SQL, not visual text
- [ ] **Touch Support:** Tap to show tooltips on mobile/tablet

### Accessibility
- [x] **Aria Labels:** All icon-only elements have descriptive labels ✅
- [x] **Keyboard Nav:** Tooltips accessible via keyboard ✅
- [x] **Color Independence:** Badges distinguishable without color alone ✅
- [x] **Screen Reader:** Full type announced on focus ✅

### Performance
- [x] **Parsing:** Memoized (useMemo or pre-computed on import) ✅
- [x] **Rendering:** No regex in render path without memoization ✅
- [x] **Extension Types:** Support vector, citext, hstore, ltree, tsvector ✅

---

## Changelog

- **v1.0** - Initial strategy document
- **v1.1** - Added edge cases for multi-word types, arrays, PostGIS, quoted identifiers
- **v1.2** - Added badge priority system to avoid UI clutter
- **v1.3** - Added production readiness checklist (inheritance, partitioning, FDW, etc.)
- **v1.4** - Added Portal recommendation for tooltips in React Flow
- **v1.5** - Added noise reduction sanitizer as first implementation step
- **v2.0** - Added Application Lifecycle section (round-trip safety, editing UX, performance)
- **v2.1** - Added Table-Level Constraint Back-Propagation section (critical parser gap)
- **v2.2** - Added Search Schema and Copy/Paste UX considerations
- **v2.3** - Expanded implementation checklist with categorized items
- **v3.0** - Added Critical Issues section (SERIAL, string literals, nested parens, comments, regex bug, XSS)
- **v3.1** - Added High Priority items (extension types, malformed input, touch support, named constraints)
- **v3.2** - Expanded checklist with accessibility, parser robustness, and critical ship blockers
- **v4.0** - **IMPLEMENTATION COMPLETE** - Core features implemented:
  - `schema-display-utils.ts` with all critical parsing functions
  - `SmartColumnRow.tsx` with memoization and accessibility
  - `SmartTableNode.tsx` integrated into FlowCanvas
  - Table-level constraint back-propagation in sql-parser.ts
  - Badge priority system with extension type support