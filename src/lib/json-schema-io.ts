'use client';

// ** import types
import type {
    TableState,
    EnumTypeDefinition,
    TigerSQLExport,
    ImportValidationResult,
} from './types';
import type { RelationshipType } from '@/types/flow';

// ============================================================================
// Constants
// ============================================================================

/** Current export format version */
const EXPORT_VERSION = '1.0.0';

/** Export source identifier */
const EXPORT_SOURCE = 'tiger-sql';

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Creates a complete JSON export of the current schema state.
 * This captures all schema data exactly as stored internally for lossless export.
 */
export function exportSchemaToJSON(
    tables: TableState,
    enumTypes: Record<string, EnumTypeDefinition>,
    edgeRelationships: Record<string, RelationshipType>,
    visibleSchemas: Set<string>,
    collapsedSchemas: Set<string>
): TigerSQLExport {
    const tableCount = Object.keys(tables).length;
    const enumCount = Object.keys(enumTypes).length;

    return {
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        schema: {
            tables,
            enumTypes,
            edgeRelationships,
            visibleSchemas: Array.from(visibleSchemas),
            collapsedSchemas: Array.from(collapsedSchemas),
        },
        metadata: {
            tableCount,
            enumCount,
            exportSource: EXPORT_SOURCE,
        },
    };
}

/**
 * Downloads the schema export as a JSON file.
 */
export function downloadSchemaJSON(
    exportData: TigerSQLExport,
    filename?: string
): void {
    // Generate default filename with date
    const date = new Date().toISOString().split('T')[0];
    const defaultFilename = `schema_${date}.json`;
    const finalFilename = filename || defaultFilename;

    // Serialize with pretty printing for readability
    const json = JSON.stringify(exportData, null, 2);

    // Create blob and trigger download
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================================================
// Import Validation Functions
// ============================================================================

/**
 * Validates a JSON string as a Tiger SQL export.
 * Checks structure, required fields, and data integrity.
 */
export function validateSchemaJSON(jsonString: string): ImportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    let parsed: unknown;

    // Step 1: Parse JSON
    try {
        parsed = JSON.parse(jsonString);
    } catch (error) {
        return {
            valid: false,
            errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`],
            warnings: [],
        };
    }

    // Step 2: Check top-level structure
    if (!parsed || typeof parsed !== 'object') {
        return {
            valid: false,
            errors: ['Export must be a JSON object'],
            warnings: [],
        };
    }

    const data = parsed as Record<string, unknown>;

    // Step 3: Check required fields
    if (!data.version || typeof data.version !== 'string') {
        errors.push('Missing or invalid "version" field');
    }

    if (!data.schema || typeof data.schema !== 'object') {
        errors.push('Missing or invalid "schema" field');
        return { valid: false, errors, warnings };
    }

    const schema = data.schema as Record<string, unknown>;

    // Step 4: Validate schema.tables
    if (!schema.tables || typeof schema.tables !== 'object') {
        errors.push('Missing or invalid "schema.tables" field');
    } else {
        const tables = schema.tables as Record<string, unknown>;

        Object.entries(tables).forEach(([tableId, table]) => {
            if (!table || typeof table !== 'object') {
                errors.push(`Invalid table definition: ${tableId}`);
                return;
            }

            const tableObj = table as Record<string, unknown>;

            // Check table title
            if (!tableObj.title || typeof tableObj.title !== 'string') {
                warnings.push(`Table "${tableId}" missing or invalid title`);
            }

            // Check columns array
            if (tableObj.columns && !Array.isArray(tableObj.columns)) {
                errors.push(`Table "${tableId}" columns must be an array`);
            }
        });
    }

    // Step 5: Validate schema.enumTypes (optional but must be object if present)
    if (schema.enumTypes !== undefined && typeof schema.enumTypes !== 'object') {
        errors.push('"schema.enumTypes" must be an object');
    }

    // Step 6: Validate schema.edgeRelationships (optional but must be object if present)
    if (schema.edgeRelationships !== undefined && typeof schema.edgeRelationships !== 'object') {
        errors.push('"schema.edgeRelationships" must be an object');
    }

    // Step 7: Validate schema arrays (optional but must be arrays if present)
    if (schema.visibleSchemas !== undefined && !Array.isArray(schema.visibleSchemas)) {
        errors.push('"schema.visibleSchemas" must be an array');
    }

    if (schema.collapsedSchemas !== undefined && !Array.isArray(schema.collapsedSchemas)) {
        errors.push('"schema.collapsedSchemas" must be an array');
    }

    // Step 8: Version compatibility check
    if (data.version && typeof data.version === 'string') {
        const [major] = data.version.split('.').map(Number);
        const [currentMajor] = EXPORT_VERSION.split('.').map(Number);

        if (major > currentMajor) {
            warnings.push(`Importing from newer version (${data.version}). Some features may not be supported.`);
        }
    }

    // Return validation result
    if (errors.length > 0) {
        return { valid: false, errors, warnings };
    }

    return {
        valid: true,
        errors: [],
        warnings,
        data: data as unknown as TigerSQLExport,
    };
}

// ============================================================================
// Import Types for Store Integration
// ============================================================================

/**
 * Extract the import data in a format ready for store application.
 * This provides type-safe extraction of validated import data.
 */
export interface ExtractedImportData {
    tables: TableState;
    enumTypes: Record<string, EnumTypeDefinition>;
    edgeRelationships: Record<string, RelationshipType>;
    visibleSchemas: Set<string>;
    collapsedSchemas: Set<string>;
    tableCount: number;
}

/**
 * Extracts validated import data for store application.
 */
export function extractImportData(data: TigerSQLExport): ExtractedImportData {
    return {
        tables: data.schema.tables,
        enumTypes: data.schema.enumTypes || {},
        edgeRelationships: data.schema.edgeRelationships || {},
        visibleSchemas: new Set(data.schema.visibleSchemas || []),
        collapsedSchemas: new Set(data.schema.collapsedSchemas || []),
        tableCount: Object.keys(data.schema.tables).length,
    };
}

/**
 * Detects file type from filename extension.
 */
export function detectFileType(filename: string): 'sql' | 'json' | 'unknown' {
    const lowerName = filename.toLowerCase();
    if (lowerName.endsWith('.json')) return 'json';
    if (lowerName.endsWith('.sql')) return 'sql';
    return 'unknown';
}
