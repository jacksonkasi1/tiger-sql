'use client';

import { memo, useMemo } from 'react';
import { NodeProps } from '@xyflow/react';
import { cn, getTableHeaderColor } from '@/lib/utils';
import { TableNodeData } from '@/types/flow';
import { useStore } from '@/lib/store';
import { SmartColumnRow } from './SmartColumnRow';
import { EnumValuesPopover } from '@/components/schema/EnumValuesPopover';
import { List } from 'lucide-react';

/**
 * SmartTableNode - An optimized table node component that:
 * 1. Uses SmartColumnRow for memoized, compact column display
 * 2. Enforces max-width constraints to prevent layout overflow
 * 3. Handles enum types with popovers
 * 4. Supports accessibility features
 */
function SmartTableNodeComponent({ data, selected, id }: NodeProps) {
  const tableData = data as unknown as TableNodeData;
  const tableName = id;
  const headerColor =
    (tableData as any).color || getTableHeaderColor(tableName);
  const { enumTypes } = useStore();

  // Memoize enum value lookup function
  const getEnumValues = useMemo(() => {
    return (col: {
      enumTypeName?: string;
      enumValues?: string[];
    }): string[] => {
      if (col.enumTypeName && enumTypes[col.enumTypeName]) {
        return enumTypes[col.enumTypeName].values;
      }
      return col.enumValues || [];
    };
  }, [enumTypes]);

  // Memoize column list to prevent unnecessary re-renders
  const columns = useMemo(() => tableData.columns || [], [tableData.columns]);

  return (
    <div
      className={cn(
        'rounded-md overflow-visible bg-background shadow-sm transition-all',
        'border',
        selected ? 'border-blue-400 dark:border-blue-500' : 'border-border',
      )}
      style={{
        minWidth: '240px',
        maxWidth: '320px',
        width: 'max-content',
      }}
      role="table"
      aria-label={`Table: ${tableData.title}`}
    >
      {/* Table Header */}
      <div
        className="py-2.5 px-3 text-foreground font-semibold text-base border-t-[4px] rounded-t-md"
        style={{
          borderTopColor: headerColor,
          backgroundColor: `${headerColor}10`,
        }}
        role="rowgroup"
      >
        <span role="columnheader">{tableData.title}</span>
        {tableData.is_view && (
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            (view)
          </span>
        )}
      </div>

      {/* Columns */}
      <div className="bg-background" role="rowgroup">
        {columns.map((col, index) => {
          const isEnum = col.format === 'enum' || col.enumTypeName;
          const enumValues = isEnum ? getEnumValues(col) : [];

          // For enum columns with values, render with popover
          if (isEnum && enumValues.length > 0) {
            return (
              <EnumColumnRow
                key={`${tableName}_${col.title}_${index}`}
                column={col}
                enumValues={enumValues}
              />
            );
          }

          // For all other columns, use SmartColumnRow
          return (
            <SmartColumnRow
              key={`${tableName}_${col.title}_${index}`}
              column={col}
              tableName={tableName}
              index={index}
              selected={selected}
            />
          );
        })}

        {columns.length === 0 && (
          <div
            className="py-6 text-center text-xs text-muted-foreground"
            role="row"
          >
            <span role="cell">No columns</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * EnumColumnRow - Special handling for enum columns with popover
 */
interface EnumColumnRowProps {
  column: TableNodeData['columns'][0];
  enumValues: string[];
}

const EnumColumnRow = memo(function EnumColumnRow({
  column,
  enumValues,
}: EnumColumnRowProps) {
  const isPK = column.pk;

  return (
    <div
      className={cn(
        'relative group py-2 px-3 flex items-center gap-2 border-b border-border/50 last:border-b-0',
        'hover:bg-muted/40 transition-colors',
        'border-l-[3px] border-transparent',
        isPK && 'border-l-yellow-500/50',
      )}
      role="row"
    >
      {/* Icon */}
      <div className="shrink-0 w-4 flex justify-center" aria-hidden="true">
        <List className="h-3.5 w-3.5 text-purple-500" aria-label="Enum type" />
      </div>

      {/* Column Name */}
      <span
        className="flex-1 text-sm font-medium truncate font-mono"
        title={column.title}
        role="cell"
      >
        {column.title}
      </span>

      {/* Enum Type with Popover */}
      <EnumValuesPopover
        enumTypeName={column.enumTypeName || 'enum'}
        enumValues={enumValues}
        isArray={(column as any).isArray}
        trigger={
          <span className="nodrag text-xs text-purple-500 font-mono shrink-0 cursor-help hover:text-purple-400 transition-colors max-w-[100px] truncate">
            {column.enumTypeName
              ? `${column.enumTypeName.includes('.') ? column.enumTypeName.split('.').pop() : column.enumTypeName}${(column as any).isArray ? '[]' : ''}`
              : `enum${(column as any).isArray ? '[]' : ''}`}
          </span>
        }
      />

      {/* NULL Indicator */}
      {!column.required && (
        <span
          className="text-[10px] text-muted-foreground/50 shrink-0 font-bold"
          aria-label="Nullable"
        >
          N
        </span>
      )}
    </div>
  );
});

export const SmartTableNode = memo(SmartTableNodeComponent);
