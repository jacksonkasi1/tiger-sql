import { TableState } from './types';

/**
 * Generate PostgreSQL SQL schema from tables
 */
export function generateSQLSchema(tables: TableState): string {
  let sql = '';

  const reservedKeyword = [
    'user',
    'database',
    'default',
    'dictionary',
    'files',
    'group',
    'index',
    'level',
    'max',
    'min',
    'password',
    'procedure',
    'table',
    'user',
    'view',
  ];

  // Collect all enum types from columns
  const enumTypes = new Map<string, string[]>();
  Object.values(tables).forEach((table) => {
    table.columns?.forEach((col) => {
      if (col.enumTypeName && col.enumValues && col.enumValues.length > 0) {
        enumTypes.set(col.enumTypeName, col.enumValues);
      }
    });
  });

  // Generate CREATE TYPE statements for enums (before tables)
  if (enumTypes.size > 0) {
    sql += '-- Enum Types\n';
    enumTypes.forEach((values, typeName) => {
      // Handle schema-qualified enum names
      const parts = typeName.split('.');
      const enumName = parts.length > 1 ? parts[1] : typeName;
      const schemaPrefix = parts.length > 1 ? `${parts[0]}.` : '';

      sql += `CREATE TYPE ${schemaPrefix}"${enumName}" AS ENUM (`;
      sql += values.map((v) => `'${v}'`).join(', ');
      sql += `);\n`;
    });
    sql += '\n';
  }

  // Build dependency graph to order tables correctly
  const dependencies: Record<string, string[]> = {};

  Object.entries(tables).forEach(([table, value]) => {
    dependencies[table] =
      value.columns
        ?.map((v) => v.fk?.split('.')[0])
        .filter((v) => typeof v === 'string')
        .filter((v) => table !== v) || [];
  });

  // Topological sort to get correct table order
  const sortedTables: string[] = [];
  const remainingKeys = Object.keys(dependencies);

  while (remainingKeys.length) {
    let addedInThisIteration = false;

    for (let i = remainingKeys.length - 1; i >= 0; i--) {
      const key = remainingKeys[i];
      const deps = dependencies[key];

      // Check if all dependencies are already processed
      if (deps.every((dependency) => sortedTables.includes(dependency))) {
        sortedTables.push(key);
        remainingKeys.splice(i, 1);
        addedInThisIteration = true;
      }
    }

    // If we couldn't add any tables in this iteration, there might be circular dependencies
    // Just add the remaining ones
    if (!addedInThisIteration && remainingKeys.length > 0) {
      sortedTables.push(...remainingKeys);
      break;
    }
  }

  // Generate CREATE TABLE statements
  sortedTables.forEach((tableName) => {
    const table = tables[tableName];

    // Skip views for now
    if (table.is_view) return;

    sql += `-- Table: ${tableName}\n`;
    sql += `CREATE TABLE "${tableName}" (\n`;

    const columns = table.columns || [];
    const primaryKeys: string[] = [];
    const foreignKeys: Array<{
      column: string;
      refTable: string;
      refColumn: string;
    }> = [];

    columns.forEach((col, i) => {
      // Column name (with quotes if reserved keyword)
      if (reservedKeyword.includes(col.title)) {
        sql += `  "${col.title}"`;
      } else {
        sql += `  ${col.title}`;
      }

      // Data type
      if (col.format === 'integer' && col.pk) {
        sql += ` SERIAL`;
      } else if (col.format === 'enum' && col.enumTypeName) {
        // Use the enum type name for enum columns
        const enumTypeParts = col.enumTypeName.split('.');
        const enumName =
          enumTypeParts.length > 1 ? enumTypeParts[1] : col.enumTypeName;
        const schemaPrefix =
          enumTypeParts.length > 1 ? `${enumTypeParts[0]}.` : '';
        const arraySuffix = col.isArray ? '[]' : '';
        sql += ` ${schemaPrefix}"${enumName}"${arraySuffix}`;
      } else {
        // Handle array types for non-enum columns
        const arraySuffix = col.isArray ? '[]' : '';
        sql += ` ${col.format.toUpperCase()}${arraySuffix}`;
      }

      // NOT NULL constraint
      if (col.required && !col.pk) {
        sql += ` NOT NULL`;
      }

      // Default value
      if (col.default !== undefined && col.default !== null && col.default !== '') {
        sql += ` DEFAULT ${col.default}`;
      }

      // Track primary keys and foreign keys for ALTER TABLE statements
      if (col.pk) {
        primaryKeys.push(col.title);
      }

      if (col.fk) {
        const [refTable, refColumn] = col.fk.split('.');
        foreignKeys.push({ column: col.title, refTable, refColumn });
      }

      // Add comma if not last column
      if (i < columns.length - 1) {
        sql += ',';
      }

      sql += '\n';
    });

    sql += `);\n\n`;

    // Add ALTER TABLE for primary key
    if (primaryKeys.length > 0) {
      sql += `ALTER TABLE "${tableName}" ADD PRIMARY KEY (${primaryKeys.map((pk) => `"${pk}"`).join(', ')});\n`;
    }

    // Add ALTER TABLE for foreign keys
    foreignKeys.forEach((fk) => {
      const constraintName = `${tableName}_${fk.column}_foreign`;
      sql += `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${fk.column}") REFERENCES "${fk.refTable}" ("${fk.refColumn}");\n`;
    });

    if (primaryKeys.length > 0 || foreignKeys.length > 0) {
      sql += '\n';
    }
  });

  // Add views at the end
  sortedTables.forEach((tableName) => {
    const table = tables[tableName];

    if (table.is_view) {
      sql += `-- View: ${tableName}\n`;
      sql += `-- Note: View definition needs to be manually added\n`;
      sql += `-- CREATE VIEW "${tableName}" AS SELECT ...;\n\n`;
    }
  });

  return sql;
}

/**
 * Download SQL schema as a file
 */
export function downloadSQLSchema(
  tables: TableState,
  filename: string = 'schema.sql',
): void {
  const sql = generateSQLSchema(tables);

  // Create blob and download
  const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
