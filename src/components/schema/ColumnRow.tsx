'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { Column } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Menu,
  Key,
  Sparkles,
  Search as SearchIcon,
  Circle,
  MoreHorizontal,
  Trash2,
  Check,
  ChevronsUpDown,
  Link2,
  X,
  Pencil,
  List,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { EnumValuesPopover } from './EnumValuesPopover';
import { EnumEditorPopover } from './EnumEditorPopover';
import { EnumTypeSelectorPopover } from './EnumTypeSelectorPopover';

const POSTGRES_TYPES = [
  'serial',
  'bigserial',
  'bigint',
  'integer',
  'int',
  'smallint',
  'varchar',
  'text',
  'char',
  'boolean',
  'timestamp',
  'timestamptz',
  'date',
  'time',
  'json',
  'jsonb',
  'uuid',
  'numeric',
  'decimal',
  'real',
  'double precision',
  'bytea',
  'enum',
];

type IndexType = 'primary_key' | 'unique_key' | 'index' | 'none';

interface ColumnRowProps {
  tableId: string;
  column: Column;
  columnIndex: number;
  isDragOverlay?: boolean;
}

export function ColumnRow({
  tableId,
  column,
  columnIndex,
  isDragOverlay = false,
}: ColumnRowProps) {
  const {
    tables,
    enumTypes,
    updateColumn,
    deleteColumn,
    saveColumnEnumValues,
  } = useStore();
  const [typeOpen, setTypeOpen] = useState(false);
  const [fkOpen, setFkOpen] = useState(false);
  const [enumEditorOpen, setEnumEditorOpen] = useState(false);
  const [enumSelectorOpen, setEnumSelectorOpen] = useState(false);

  const table = tables[tableId];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnIndex.toString(), disabled: isDragOverlay });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getIndexType = (): IndexType => {
    if (column.pk) return 'primary_key';
    if (column.unique) return 'unique_key';
    const indexes = table?.indexes || [];
    const isInIndex = indexes.some((idx) => idx.columns.includes(column.title));
    if (isInIndex) return 'index';
    return 'none';
  };

  const handleIndexTypeChange = (indexType: IndexType) => {
    const updates: Partial<Column> = {};
    if (indexType === 'primary_key') {
      updates.pk = true;
      updates.unique = false;
      updates.required = true;
    } else if (indexType === 'unique_key') {
      updates.unique = true;
      updates.pk = false;
    } else {
      updates.pk = false;
      updates.unique = false;
    }
    updateColumn(tableId, columnIndex, updates);
  };

  const indexType = getIndexType();

  // Get all tables and columns for FK selector - grouped by table
  const getFkOptionsGrouped = () => {
    const grouped: Record<string, { label: string; value: string }[]> = {};
    Object.values(tables).forEach((t) => {
      if (t.title === tableId) return; // Skip self
      if (!grouped[t.title]) grouped[t.title] = [];
      t.columns?.forEach((col) => {
        grouped[t.title].push({
          label: col.title,
          value: `${t.title}.${col.title}`,
        });
      });
    });
    return grouped;
  };

  const fkOptionsGrouped = getFkOptionsGrouped();

  // Get enum values from enumTypes store or column
  const getEnumValues = (): string[] => {
    if (column.enumTypeName && enumTypes[column.enumTypeName]) {
      return enumTypes[column.enumTypeName].values;
    }
    return column.enumValues || [];
  };

  // Handle saving enum values
  const handleSaveEnumValues = (newValues: string[]) => {
    saveColumnEnumValues(tableId, columnIndex, newValues);
  };

  // Check if column is an enum type
  const isEnumColumn = column.format === 'enum' || column.enumTypeName;
  const enumValues = getEnumValues();

  // Handle selecting an enum type from the selector
  const handleEnumTypeSelect = (enumTypeName: string, values: string[]) => {
    updateColumn(tableId, columnIndex, {
      format: 'enum',
      type: 'enum',
      enumTypeName,
      enumValues: values,
    });
    setEnumSelectorOpen(false);
  };

  // Get display text for type (including array suffix)
  const getTypeDisplayText = () => {
    if (isEnumColumn && column.enumTypeName) {
      const displayName = column.enumTypeName.includes('.')
        ? column.enumTypeName.split('.').pop()
        : column.enumTypeName;
      return `${displayName}${column.isArray ? '[]' : ''}`;
    }
    return `${column.format || column.type || 'varchar'}${column.isArray ? '[]' : ''}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-1.5 px-2 py-1 hover:bg-muted/30 transition-all duration-150 ease-out rounded-sm mx-1',
        isDragging && 'opacity-0',
        isDragOverlay && 'shadow-lg bg-background border border-border/60',
      )}
    >
      {/* Drag Handle - Minimal like DrawSQL */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity duration-150"
      >
        <Menu className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Column Name - Primary focus */}
      <Input
        value={column.title}
        onChange={(e) =>
          updateColumn(tableId, columnIndex, { title: e.target.value })
        }
        className="h-8 flex-[1.3] min-w-[80px] text-xs font-mono border-border/40 bg-transparent hover:bg-background hover:border-border/60 focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-ring/15 px-2 rounded"
        placeholder="column_name"
      />

      {/* Data Type Selector */}
      <div className="relative group/type flex items-center gap-0.5 flex-[0.8] min-w-[70px] overflow-hidden">
        <Popover open={typeOpen} onOpenChange={setTypeOpen}>
          {isEnumColumn && enumValues.length > 0 ? (
            <EnumValuesPopover
              enumTypeName={column.enumTypeName || 'enum'}
              enumValues={enumValues}
              isArray={column.isArray}
              trigger={
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    role="combobox"
                    aria-expanded={typeOpen}
                    className="h-8 flex-1 justify-between text-xs font-mono px-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all duration-150 rounded"
                  >
                    <div className="flex items-center gap-1 min-w-0 max-w-12">
                      <List className="h-3 w-3 text-purple-500 shrink-0" />
                      <span className="truncate">{getTypeDisplayText()}</span>
                    </div>
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-40" />
                  </Button>
                </PopoverTrigger>
              }
            />
          ) : (
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                role="combobox"
                aria-expanded={typeOpen}
                className="h-8 flex-1 justify-between text-xs font-mono px-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all duration-150 rounded"
              >
                <span className="truncate min-w-0">{getTypeDisplayText()}</span>
                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-40" />
              </Button>
            </PopoverTrigger>
          )}
          <PopoverContent
            className="w-[220px] p-0 border-border/60 shadow-xl"
            align="end"
          >
            <Command className="bg-popover">
              <CommandInput
                placeholder="Search type..."
                className="h-9 text-sm font-mono border-0 outline-none ring-0 focus:outline-none focus:ring-0"
              />
              <CommandEmpty className="py-4 text-sm text-muted-foreground/60 text-center">
                No type found.
              </CommandEmpty>
              <CommandList className="max-h-[240px] overflow-auto p-1">
                <CommandGroup>
                  {POSTGRES_TYPES.map((type) => (
                    <CommandItem
                      key={type}
                      value={type}
                      onSelect={() => {
                        if (type === 'enum') {
                          // Open enum type selector instead of directly setting type
                          setTypeOpen(false);
                          setEnumSelectorOpen(true);
                        } else {
                          updateColumn(tableId, columnIndex, {
                            format: type,
                          });
                          setTypeOpen(false);
                        }
                      }}
                      className="text-sm font-mono data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary rounded-md py-2 px-2"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-3.5 w-3.5 text-primary transition-opacity duration-150',
                          (column.format || column.type) === type
                            ? 'opacity-100'
                            : 'opacity-0',
                        )}
                      />
                      {type}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Enum Type Selector (shown when user selects 'enum' type) */}
        <EnumTypeSelectorPopover
          onSelect={handleEnumTypeSelect}
          open={enumSelectorOpen}
          onOpenChange={setEnumSelectorOpen}
          trigger={<span />}
        />

        {/* Enum Edit Button */}
        {isEnumColumn && (
          <EnumEditorPopover
            enumTypeName={column.enumTypeName || 'enum'}
            currentValues={enumValues}
            onSave={handleSaveEnumValues}
            open={enumEditorOpen}
            onOpenChange={setEnumEditorOpen}
            trigger={
              <button className="h-6 w-6  flex items-center justify-center rounded transition-all duration-150 hover:bg-muted/50 text-muted-foreground/50 hover:text-purple-500">
                <Pencil className="h-3 w-3" />
              </button>
            }
          />
        )}
      </div>

      {/* End Controls - Compact like DrawSQL */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* NULL/NOT NULL - Simple N */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() =>
                  updateColumn(tableId, columnIndex, {
                    required: !column.required,
                  })
                }
                className={cn(
                  'h-6 w-6 flex items-center justify-center text-[10px] font-semibold rounded transition-all duration-150',
                  column.required
                    ? 'text-foreground/70 hover:bg-muted/50'
                    : 'text-muted-foreground/40 hover:bg-muted/40 hover:text-muted-foreground/60',
                )}
              >
                N
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>
                {column.required
                  ? 'NOT NULL — click to allow NULL'
                  : 'Nullable — click to require'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Index/FK Indicator */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-6 w-6 flex items-center justify-center rounded transition-all duration-150 hover:bg-muted/50">
              {indexType === 'primary_key' ? (
                <Key className="h-3.5 w-3.5 text-amber-500" />
              ) : indexType === 'unique_key' ? (
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              ) : indexType === 'index' ? (
                <SearchIcon className="h-3.5 w-3.5 text-violet-500" />
              ) : column.fk ? (
                <Link2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Circle className="h-3 w-3 text-muted-foreground/25" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 p-1.5">
            {/* Index Type Selection - using MenuItem with checkmark instead of RadioItem */}
            <DropdownMenuItem
              onClick={() => handleIndexTypeChange('primary_key')}
              className={cn(
                'text-sm py-2 px-2 rounded-md justify-between',
                indexType === 'primary_key' && 'bg-amber-500/10',
              )}
            >
              <span className="flex items-center">
                <Key className="mr-2.5 h-4 w-4 text-amber-500" />
                Primary key
              </span>
              {indexType === 'primary_key' && (
                <Check className="h-4 w-4 text-amber-500" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleIndexTypeChange('unique_key')}
              className={cn(
                'text-sm py-2 px-2 rounded-md justify-between',
                indexType === 'unique_key' && 'bg-indigo-500/10',
              )}
            >
              <span className="flex items-center">
                <Sparkles className="mr-2.5 h-4 w-4 text-indigo-500" />
                Unique key
              </span>
              {indexType === 'unique_key' && (
                <Check className="h-4 w-4 text-indigo-500" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleIndexTypeChange('index')}
              className={cn(
                'text-sm py-2 px-2 rounded-md justify-between',
                indexType === 'index' && 'bg-violet-500/10',
              )}
            >
              <span className="flex items-center">
                <SearchIcon className="mr-2.5 h-4 w-4 text-violet-500" />
                Index
              </span>
              {indexType === 'index' && (
                <Check className="h-4 w-4 text-violet-500" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleIndexTypeChange('none')}
              className={cn(
                'text-sm py-2 px-2 rounded-md justify-between',
                indexType === 'none' && 'bg-muted/60',
              )}
            >
              <span className="flex items-center">
                <Circle className="mr-2.5 h-4 w-4 text-muted-foreground/60" />
                None
              </span>
              {indexType === 'none' && (
                <Check className="h-4 w-4 text-muted-foreground" />
              )}
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1.5" />
            {/* FK Selector in same menu */}
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Foreign Key
              </p>
              {column.fk ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                    {column.fk}
                  </span>
                  <button
                    onClick={() =>
                      updateColumn(tableId, columnIndex, { fk: undefined })
                    }
                    className="text-destructive hover:bg-destructive/10 p-1 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Popover open={fkOpen} onOpenChange={setFkOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs justify-start"
                    >
                      <Link2 className="mr-2 h-3 w-3" />
                      Add reference...
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[280px] p-0 border-border/60 shadow-xl"
                    align="end"
                    side="right"
                  >
                    <Command className="bg-popover">
                      <CommandInput
                        placeholder="Search table.column..."
                        className="h-8 text-xs border-0 ring-0 focus:ring-0"
                      />
                      <CommandList className="max-h-[240px] p-1">
                        <CommandEmpty className="py-4 text-xs text-muted-foreground/60 text-center">
                          No columns found.
                        </CommandEmpty>
                        {Object.entries(fkOptionsGrouped).map(
                          ([tableName, columns]) => (
                            <CommandGroup
                              key={tableName}
                              heading={tableName}
                              className="py-0.5"
                            >
                              {columns.map((option) => (
                                <CommandItem
                                  key={option.value}
                                  value={option.value}
                                  onSelect={() => {
                                    updateColumn(tableId, columnIndex, {
                                      fk: option.value,
                                    });
                                    setFkOpen(false);
                                  }}
                                  className="text-xs font-mono py-1.5 px-2 rounded"
                                >
                                  {option.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ),
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* More Options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-6 w-6 flex items-center justify-center rounded transition-all duration-150 hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground/70">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 p-1.5">
            <DropdownMenuItem
              onClick={() =>
                updateColumn(tableId, columnIndex, {
                  required: !column.required,
                })
              }
              className="text-sm py-2 px-2 rounded-md"
            >
              Set {column.required ? 'NULL' : 'NOT NULL'}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem
              onClick={() => deleteColumn(tableId, columnIndex)}
              className="text-destructive py-2 px-2 rounded-md focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="mr-2.5 h-4 w-4" />
              Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
