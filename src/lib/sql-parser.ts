import { TableState, Column } from './types';

/**
 * Parse CREATE TYPE ... AS ENUM statements
 * Returns a map of enum type names to their values
 */
function parseEnumTypes(statements: string[]): Map<string, string[]> {
  const enumTypes = new Map<string, string[]>();

  for (const statement of statements) {
    const trimmed = statement.trim();

    // Match: CREATE TYPE type_name AS ENUM ('value1', 'value2', ...)
    // Also handle schema-qualified: CREATE TYPE schema.type_name AS ENUM (...)
    // Handle underscores in type names (e.g., post_status, user_role)
    const enumMatch = trimmed.match(
      /create\s+type\s+(?:if\s+not\s+exists\s+)?(?:["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\.)?["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s+as\s+enum\s*\(([^)]+)\)/i,
    );

    if (enumMatch) {
      const schemaName = enumMatch[1];
      const enumTypeName = enumMatch[2];
      const valuesString = enumMatch[3];

      // Parse enum values (handle quoted strings)
      const values: string[] = [];
      const valueRegex = /'([^']+)'|"([^"]+)"/g;
      let match;
      while ((match = valueRegex.exec(valuesString)) !== null) {
        values.push(match[1] || match[2]);
      }

      // Store with schema prefix if present
      const fullEnumName = schemaName
        ? `${schemaName}.${enumTypeName}`
        : enumTypeName;
      if (values.length > 0) {
        enumTypes.set(fullEnumName, values);
        // Also store without schema for easier lookup
        enumTypes.set(enumTypeName, values);
      }
    }
  }

  return enumTypes;
}

/**
 * Parse SQL schema asynchronously (non-blocking for large files)
 * Breaks up work into chunks to keep UI responsive
 */
export async function parseSQLSchemaAsync(sql: string): Promise<TableState> {
  const tables: TableState = {};

  // Remove comments
  let cleanedSQL = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const statements = cleanedSQL.split(';').filter((s) => s.trim());

  console.log(`[SQL Parser] Processing ${statements.length} statements...`);

  // First pass: Parse enum types
  const enumTypes = parseEnumTypes(statements);
  console.log(`[SQL Parser] Found ${enumTypes.size} enum types`);

  // Process in batches to avoid blocking
  const BATCH_SIZE = 10;

  // Second pass: CREATE TABLE/VIEW (in batches)
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);

    // Yield control to browser every batch
    await new Promise((resolve) => setTimeout(resolve, 0));

    for (const statement of batch) {
      const trimmed = statement.trim();

      // CREATE TABLE
      const createTableMatch = trimmed.match(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:["']?(\w+)["']?\.)?["']?(\w+)["']?\s*\(/i,
      );

      if (createTableMatch) {
        const schemaName = createTableMatch[1]; // undefined if no schema specified
        const tableName = createTableMatch[2];
        const columns = parseColumns(statement, enumTypes);

        // Only include schema in key if schema is explicitly specified
        const uniqueKey = schemaName ? `${schemaName}.${tableName}` : tableName;
        tables[uniqueKey] = {
          title: tableName,
          is_view: false,
          columns: columns,
          position: { x: 0, y: 0 },
          schema: schemaName, // undefined if no schema specified
        };
      }

      // CREATE VIEW
      const createViewMatch = trimmed.match(
        /create\s+(?:or\s+replace\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:["']?(\w+)["']?\.)?["']?(\w+)["']?\s+as/i,
      );

      if (createViewMatch) {
        const schemaName = createViewMatch[1]; // undefined if no schema specified
        const viewName = createViewMatch[2];

        // Only include schema in key if schema is explicitly specified
        const uniqueKey = schemaName ? `${schemaName}.${viewName}` : viewName;
        tables[uniqueKey] = {
          title: viewName,
          is_view: true,
          columns: [],
          position: { x: 0, y: 0 },
          schema: schemaName, // undefined if no schema specified
        };
      }
    }

    // Log progress every 50 statements
    if (i % 50 === 0 && i > 0) {
      console.log(
        `[SQL Parser] Processed ${i}/${statements.length} statements...`,
      );
    }
  }

  console.log(`[SQL Parser] Found ${Object.keys(tables).length} tables/views`);

  // Second pass: ALTER TABLE (in batches)
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);

    await new Promise((resolve) => setTimeout(resolve, 0));

    for (const statement of batch) {
      const trimmed = statement.trim();

      const alterTableMatch = trimmed.match(
        /alter\s+table\s+(?:["']?(\w+)["']?\.)?["']?(\w+)["']?/i,
      );

      if (alterTableMatch) {
        const schemaName = alterTableMatch[1]; // undefined if no schema specified
        const tableName = alterTableMatch[2];
        // Only include schema in key if schema is explicitly specified
        const uniqueKey = schemaName ? `${schemaName}.${tableName}` : tableName;

        parseForeignKeysFromAlter(tables, uniqueKey, trimmed);
        parsePrimaryKeysFromAlter(tables, uniqueKey, trimmed);
      }
    }
  }

  console.log(`[SQL Parser] ✅ Parsing complete`);
  return tables;
}

/**
 * Parse PostgreSQL CREATE TABLE statements into TableState format (SYNCHRONOUS - may block UI)
 */
export function parseSQLSchema(sql: string): TableState {
  const tables: TableState = {};

  // Remove comments (both -- and /* */)
  let cleanedSQL = sql
    .replace(/--[^\n]*/g, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

  // Split into individual statements
  const statements = cleanedSQL.split(';').filter((s) => s.trim());

  // First pass: Parse enum types
  const enumTypes = parseEnumTypes(statements);

  for (const statement of statements) {
    const trimmed = statement.trim();

    // Match CREATE TABLE statements
    // Improved regex to handle schema prefixes (e.g., public.users) and quoted identifiers
    const createTableMatch = trimmed.match(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:["']?(\w+)["']?\.)?["']?(\w+)["']?\s*\(/i,
    );

    if (createTableMatch) {
      // Extract schema and table name
      const schemaName = createTableMatch[1]; // undefined if no schema specified
      const tableName = createTableMatch[2]; // Always use the actual table name, not schema
      const columns = parseColumns(statement, enumTypes);

      // Only include schema in key if schema is explicitly specified
      // This avoids adding 'public.' prefix when no schema is mentioned
      const uniqueKey = schemaName ? `${schemaName}.${tableName}` : tableName;
      tables[uniqueKey] = {
        title: tableName,
        is_view: false,
        columns: columns,
        position: { x: 0, y: 0 },
        schema: schemaName, // undefined if no schema specified
      };
    }

    // Match CREATE VIEW statements
    // Improved regex to handle schema prefixes and quoted identifiers
    const createViewMatch = trimmed.match(
      /create\s+(?:or\s+replace\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:["']?(\w+)["']?\.)?["']?(\w+)["']?\s+as/i,
    );

    if (createViewMatch) {
      const schemaName = createViewMatch[1]; // undefined if no schema specified
      const viewName = createViewMatch[2]; // Use actual view name, not schema

      // Only include schema in key if schema is explicitly specified
      const uniqueKey = schemaName ? `${schemaName}.${viewName}` : viewName;
      tables[uniqueKey] = {
        title: viewName,
        is_view: true,
        columns: [],
        position: { x: 0, y: 0 },
        schema: schemaName, // undefined if no schema specified
      };
    }
  }

  // Second pass: Process ALL ALTER TABLE statements for foreign keys and primary keys
  for (const statement of statements) {
    const trimmed = statement.trim();

    // Match ALTER TABLE statements (handle schema prefixes like public.users or just users)
    const alterTableMatch = trimmed.match(
      /alter\s+table\s+(?:["']?(\w+)["']?\.)?["']?(\w+)["']?/i,
    );

    if (alterTableMatch) {
      const schemaName = alterTableMatch[1]; // undefined if no schema specified
      const tableName = alterTableMatch[2]; // Use the table name, ignore schema prefix

      // Only include schema in key if schema is explicitly specified
      const uniqueKey = schemaName ? `${schemaName}.${tableName}` : tableName;

      // Parse foreign keys
      parseForeignKeysFromAlter(tables, uniqueKey, trimmed);

      // Parse primary keys from ALTER TABLE statements
      parsePrimaryKeysFromAlter(tables, uniqueKey, trimmed);
    }
  }

  return tables;
}

/**
 * Parse columns from CREATE TABLE statement
 */
function parseColumns(
  createStatement: string,
  enumTypes: Map<string, string[]> = new Map(),
): Column[] {
  const columns: Column[] = [];
  const tableConstraints: Array<{
    type: 'primary_key' | 'foreign_key' | 'unique' | 'check';
    columns: string[];
    reference?: { table: string; column: string };
    expression?: string;
  }> = [];

  // Extract the content between parentheses
  const match = createStatement.match(/\(([\s\S]+)\)/);
  if (!match) return columns;

  const content = match[1];

  // Split by commas, but be careful with nested parentheses
  const columnDefs = splitByComma(content);

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
      tableConstraints.push({
        type: 'foreign_key',
        columns: cols,
        reference: ref,
      });
      continue;
    }

    if (trimmed.match(/^unique\s*\(/i)) {
      const cols = extractConstraintColumns(trimmed);
      tableConstraints.push({ type: 'unique', columns: cols });
      continue;
    }

    if (trimmed.match(/^check\s*\(/i)) {
      // For table-level CHECK, we don't have specific columns, so skip for now
      // (could be added later if needed)
      continue;
    }

    // Skip other constraint definitions (named constraints, etc.)
    if (trimmed.match(/^constraint\s+/i)) {
      continue;
    }

    const column = parseColumnDefinition(trimmed, enumTypes);
    if (column) {
      columns.push(column);
    }
  }

  // BACK-PROPAGATION: Apply table-level constraints to columns
  for (const constraint of tableConstraints) {
    if (constraint.type === 'primary_key') {
      constraint.columns.forEach((colName) => {
        const col = columns.find((c) => c.title === colName);
        if (col) {
          col.pk = true;
          col.required = true;
        }
      });
    }

    if (constraint.type === 'foreign_key' && constraint.reference) {
      constraint.columns.forEach((colName) => {
        const col = columns.find((c) => c.title === colName);
        if (col) {
          col.fk = `${constraint.reference!.table}.${constraint.reference!.column}`;
        }
      });
    }

    if (constraint.type === 'unique') {
      constraint.columns.forEach((colName) => {
        const col = columns.find((c) => c.title === colName);
        if (col) {
          col.unique = true;
        }
      });
    }
  }

  return columns;
}

/**
 * Parse a single column definition
 */
function parseColumnDefinition(
  def: string,
  enumTypes: Map<string, string[]> = new Map(),
): Column | null {
  // Extract column name (supporting quoted identifiers with spaces/special chars)
  // Matches: "column name", 'column name', or unquoted_column_name
  const nameMatch = def.match(
    /^("([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))\s+(.+)/i,
  );

  if (!nameMatch) return null;

  // Use the correct capture group depending on quoted/unquoted
  const columnName =
    nameMatch[2] !== undefined
      ? nameMatch[2] // double-quoted
      : nameMatch[3] !== undefined
        ? nameMatch[3] // single-quoted
        : nameMatch[4]; // unquoted

  const rest = nameMatch[5];

  // Extract data type - handle enum types (may be schema-qualified)
  // PostgreSQL enum columns are defined as: column_name enum_type_name
  // Or: column_name schema.enum_type_name
  // Array syntax: column_name enum_type_name[] or schema.enum_type_name[]
  let dataType: string;
  let enumTypeName: string | undefined;
  let enumValues: string[] | undefined = undefined;
  let isArray = false;

  // Check for array suffix [] in the rest of the definition
  // Match patterns like: type_name[], schema.type_name[], "type_name"[]
  const arrayMatch = rest.match(
    /^(["']?[a-zA-Z_][a-zA-Z0-9_]*["']?(?:\.["']?[a-zA-Z_][a-zA-Z0-9_]*["']?)?)\s*\[\s*\]/i,
  );
  if (arrayMatch) {
    isArray = true;
  }

  // Extract data type - handle enum types and regular types
  // First check if it's a schema-qualified type (schema.type)
  const schemaQualifiedMatch = rest.match(
    /^["']?(\w+)["']?\.["']?(\w+)["']?\s*(?:\[\s*\])?/i,
  );

  if (schemaQualifiedMatch) {
    const schemaName = schemaQualifiedMatch[1];
    const typeName = schemaQualifiedMatch[2];
    const fullTypeName = `${schemaName}.${typeName}`;

    // Check if this matches an enum type
    if (enumTypes.has(fullTypeName)) {
      dataType = 'enum';
      enumTypeName = fullTypeName;
      enumValues = enumTypes.get(fullTypeName);
    } else if (enumTypes.has(typeName)) {
      dataType = 'enum';
      enumTypeName = typeName;
      enumValues = enumTypes.get(typeName);
    } else {
      dataType = fullTypeName;
    }
  } else {
    // Single type name (no schema) - extract type name up to constraints
    // Match type name (can include underscores) - stop at [], DEFAULT, NOT NULL, etc.
    // First, try to extract just the type name before any constraints
    const typeNameMatch = rest.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\[\s*\])?(?:\s+(?:DEFAULT|NOT|NULL|PRIMARY|UNIQUE|CHECK|REFERENCES|CONSTRAINT)|$)/i,
    );

    if (typeNameMatch) {
      const extractedType = typeNameMatch[1];

      // Check if it's an enum type
      if (enumTypes.has(extractedType)) {
        dataType = 'enum';
        enumTypeName = extractedType;
        enumValues = enumTypes.get(extractedType);
      } else {
        // Regular type - extract with possible size constraints like varchar(255) or array []
        const fullTypeMatch = rest.match(
          /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\([\d,\s]+\))?\s*(?:\[\s*\])?/i,
        );
        if (!fullTypeMatch) return null;
        dataType = fullTypeMatch[0].trim().replace(/\s*\[\s*\]\s*$/, ''); // Remove array suffix from dataType
      }
    } else {
      // Fallback: try simple word match
      const simpleMatch = rest.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/i);
      if (!simpleMatch) return null;

      const extractedType = simpleMatch[1];
      if (enumTypes.has(extractedType)) {
        dataType = 'enum';
        enumTypeName = extractedType;
        enumValues = enumTypes.get(extractedType);
      } else {
        // Regular type
        const fullTypeMatch = rest.match(
          /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\([\d,\s]+\))?\s*(?:\[\s*\])?/i,
        );
        if (!fullTypeMatch) return null;
        dataType = fullTypeMatch[0].trim().replace(/\s*\[\s*\]\s*$/, ''); // Remove array suffix from dataType
      }
    }
  }

  // Check for constraints
  const isPrimaryKey = /primary\s+key/i.test(rest);
  const isNotNull = /not\s+null/i.test(rest);

  // Check for foreign key reference
  let foreignKey: string | undefined;
  const fkMatch = rest.match(
    /references\s+["']?(\w+)["']?\s*\(["']?(\w+)["']?\)/i,
  );
  if (fkMatch) {
    foreignKey = `${fkMatch[1]}.${fkMatch[2]}`;
  }

  // Check for default value - improved to handle quoted strings and complex expressions
  let defaultValue: any;
  // Match quoted strings, parenthesized expressions, or unquoted values
  const defaultMatch = rest.match(
    /default\s+((?:'[^']*'|"[^"]*"|\([^)]+\)|[^,\s]+(?:\s*[^,]*?)))/i,
  );

  if (defaultMatch) {
    let val = defaultMatch[1].trim();
    // Remove surrounding quotes if present for string literals
    if (
      (val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))
    ) {
      val = val.slice(1, -1);
    }
    defaultValue = val;
  }

  // Map PostgreSQL types to format
  const format = enumTypeName ? 'enum' : mapPostgreSQLType(dataType);

  return {
    title: columnName,
    format: format,
    type: enumTypeName ? 'enum' : determineType(format),
    default: defaultValue,
    required: isNotNull || isPrimaryKey,
    pk: isPrimaryKey,
    fk: foreignKey,
    enumTypeName: enumTypeName,
    enumValues: enumValues,
    isArray: isArray || undefined, // Only set if true
  };
}

/**
 * Parse foreign keys from ALTER TABLE statements
 * @param tableKey - Schema-qualified key (e.g., "public.posts" or "auth.users")
 */
function parseForeignKeysFromAlter(
  tables: TableState,
  tableKey: string,
  alterStmt: string,
): void {
  // Match: ALTER TABLE "table" ADD CONSTRAINT "name" FOREIGN KEY("col") REFERENCES "ref_table"("ref_col")
  const fkMatch = alterStmt.match(
    /add\s+constraint\s+["']?\w+["']?\s+foreign\s+key\s*\(["']?(\w+)["']?\)\s*references\s+["']?(\w+)["']?\s*\(["']?(\w+)["']?\)/i,
  );

  if (fkMatch && tables[tableKey]) {
    const columnName = fkMatch[1];
    const refTable = fkMatch[2];
    const refColumn = fkMatch[3];

    // Find the column and add FK reference
    const column = tables[tableKey].columns?.find(
      (c) => c.title === columnName,
    );
    if (column) {
      column.fk = `${refTable}.${refColumn}`;
    }
  }
}

/**
 * Parse primary keys from ALTER TABLE statements
 * @param tableKey - Schema-qualified key (e.g., "public.posts" or "auth.users")
 */
function parsePrimaryKeysFromAlter(
  tables: TableState,
  tableKey: string,
  alterStmt: string,
): void {
  // Match: ALTER TABLE "table" ADD PRIMARY KEY("col")
  const pkMatch = alterStmt.match(/add\s+primary\s+key\s*\(["']?(\w+)["']?\)/i);

  if (pkMatch && tables[tableKey]) {
    const columnName = pkMatch[1];

    // Find the column and mark as primary key
    const column = tables[tableKey].columns?.find(
      (c) => c.title === columnName,
    );
    if (column) {
      column.pk = true;
      column.required = true;
    }
  }
}

/**
 * Split string by comma, respecting parentheses
 */
function splitByComma(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current);
  }

  return result;
}

/**
 * Extract column names from constraint definitions like PRIMARY KEY (col1, col2)
 */
function extractConstraintColumns(constraintDef: string): string[] {
  const match = constraintDef.match(/\(\s*([^)]+)\s*\)/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map((col) => col.trim().replace(/["`]/g, '')) // Remove quotes
    .filter((col) => col.length > 0);
}

/**
 * Extract foreign key information from FOREIGN KEY (cols) REFERENCES table(col)
 */
function extractForeignKeyInfo(constraintDef: string): {
  cols: string[];
  ref?: { table: string; column: string };
} {
  const cols = extractConstraintColumns(constraintDef);

  const refMatch = constraintDef.match(
    /references\s+(?:["']?(\w+)["']?\.)?["']?(\w+)["']?\s*\(\s*["']?(\w+)["']?\s*\)/i,
  );

  let ref;
  if (refMatch) {
    ref = {
      table: refMatch[1] ? `${refMatch[1]}.${refMatch[2]}` : refMatch[2],
      column: refMatch[3],
    };
  }

  return { cols, ref };
}

/**
 * Map PostgreSQL data types to internal format
 */
function mapPostgreSQLType(pgType: string): string {
  const type = pgType.toLowerCase();

  // Serial types
  if (type.includes('serial')) return 'integer';

  // Integer types
  if (type === 'smallint') return 'int2';
  if (type === 'integer' || type === 'int') return 'int4';
  if (type === 'bigint') return 'int8';

  // Numeric types
  if (type.includes('numeric') || type.includes('decimal')) return 'numeric';
  if (type === 'real') return 'float4';
  if (type === 'double precision' || type === 'double') return 'float8';
  if (type.includes('float')) return 'float8'; // FLOAT(n) maps to float8

  // String types
  if (type.includes('varchar') || type.includes('character varying'))
    return 'varchar';
  if (type.includes('char') || type.includes('character')) return 'char';
  if (type === 'text') return 'text';

  // Boolean
  if (type === 'boolean' || type === 'bool') return 'bool';

  // Date/Time types
  if (type === 'date') return 'date';
  if (type === 'time') return 'time';
  if (type.includes('timestamp')) {
    if (type.includes('with time zone') || type.includes('timestamptz')) {
      return 'timestamptz';
    }
    return 'timestamp';
  }

  // UUID
  if (type === 'uuid') return 'uuid';

  // JSON types
  if (type === 'json') return 'json';
  if (type === 'jsonb') return 'jsonb';

  // Array types
  if (type.includes('[]')) return type;

  // Enum types (should be handled before this point, but fallback)
  if (type === 'enum') return 'enum';

  // Default: return as-is
  return type;
}

/**
 * Determine the type category from format
 */
function determineType(format: string): string {
  const f = format.toLowerCase();

  // Enum types
  if (f === 'enum') {
    return 'enum';
  }

  // Numeric types
  if (
    f.includes('int') ||
    f.includes('serial') ||
    f === 'numeric' ||
    f.includes('float')
  ) {
    return 'number';
  }

  // String types
  if (f.includes('char') || f === 'text') {
    return 'string';
  }

  // Boolean
  if (f === 'bool') {
    return 'boolean';
  }

  // JSON
  if (f === 'json' || f === 'jsonb') {
    return 'object';
  }

  // Array
  if (f.includes('[]')) {
    return 'array';
  }

  // Default
  return 'string';
}
