'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { Column } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
} from '@/components/ui/command';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Key,
  Sparkles,
  Search,
  Circle,
  MoreVertical,
  Plus,
  Trash2,
  Focus,
  Check,
  ChevronsUpDown,
  Pencil,
  List,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EnumValuesPopover } from './EnumValuesPopover';
import { EnumEditorPopover } from './EnumEditorPopover';

interface TableCollapsibleProps {
  tableId: string;
}

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

const COLORS = [
  '#EC4899',
  '#A855F7',
  '#1E40AF',
  '#3B82F6',
  '#14B8A6',
  '#06B6D4',
  '#84CC16',
  '#22C55E',
  '#EAB308',
  '#F97316',
  '#EF4444',
  '#6B7280',
];

type IndexType = 'primary_key' | 'unique_key' | 'index' | 'none';

export function TableCollapsible({ tableId }: TableCollapsibleProps) {
  const {
    tables,
    enumTypes,
    expandedTables,
    toggleTableExpanded,
    updateColumn,
    deleteColumn,
    addColumn,
    deleteTable,
    triggerFocusTable,
    updateTableColor,
    updateTableName,
    saveColumnEnumValues,
  } = useStore();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const table = tables[tableId];
  const isExpanded = expandedTables.has(tableId);

  // Sortable hook for drag & drop
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!table) return null;

  const handleAddColumn = () => {
    const newColumn: Column = {
      title: 'new_column',
      format: 'varchar',
      type: 'string',
      required: false,
    };
    addColumn(tableId, newColumn);
  };

  const handleFocusTable = () => {
    triggerFocusTable(tableId);
  };

  const handleStartRename = () => {
    setRenameValue(table.title);
    setIsRenaming(true);
  };

  const handleSaveRename = () => {
    if (renameValue.trim() && renameValue !== table.title) {
      updateTableName(tableId, renameValue.trim());
    }
    setIsRenaming(false);
  };

  const handleCancelRename = () => {
    setIsRenaming(false);
    setRenameValue('');
  };

  const getIndexType = (column: Column): IndexType => {
    if (column.pk) return 'primary_key';
    if (column.unique) return 'unique_key';
    const indexes = table.indexes || [];
    const isInIndex = indexes.some((idx) => idx.columns.includes(column.title));
    if (isInIndex) return 'index';
    return 'none';
  };

  const handleIndexTypeChange = (columnIndex: number, indexType: IndexType) => {
    const column = table.columns?.[columnIndex];
    if (!column) return;

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

  return (
    <>
      <Collapsible
        open={isExpanded}
        onOpenChange={() => toggleTableExpanded(tableId)}
        ref={setNodeRef}
        style={style}
      >
        <div
          className={cn(
            'group border-b border-border/10 hover:bg-muted/20 transition-colors',
            isDragging && 'opacity-50 scale-[0.98] shadow-lg z-50',
          )}
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            {/* Drag Handle - LEFT FIRST (DrawSQL Style) */}
            <button
              {...attributes}
              {...listeners}
              className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity touch-none"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Expand/Collapse Trigger */}
            <CollapsibleTrigger asChild>
              <button className="shrink-0 hover:bg-accent/50 rounded-sm p-0.5 transition-colors">
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>

            {/* Color Indicator */}
            <div
              className="w-2.5 h-2.5 rounded shrink-0 cursor-pointer hover:ring-1 hover:ring-offset-1 hover:ring-offset-background transition-all"
              style={{ backgroundColor: table.color || 'hsl(var(--primary))' }}
              onClick={() => toggleTableExpanded(tableId)}
            />

            {/* Table Name - Editable */}
            {isRenaming ? (
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleSaveRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename();
                  if (e.key === 'Escape') handleCancelRename();
                }}
                className="h-6 flex-1 text-[13px] font-medium px-2 border focus-visible:ring-1 focus-visible:ring-primary/30"
                placeholder="Table name"
                autoFocus
              />
            ) : (
              <span
                className="flex-1 text-[13px] font-medium text-foreground truncate cursor-pointer select-none"
                onClick={() => toggleTableExpanded(tableId)}
              >
                {table.title}
              </span>
            )}

            {/* Column Count Badge */}
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-[18px] shrink-0 font-normal tabular-nums bg-muted/50 hover:bg-muted/70 transition-colors border-0"
            >
              {table.columns?.length || 0}
            </Badge>

            {/* Action Icons - DrawSQL Order */}
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Rename/Edit Icon */}
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 hover:bg-accent/60"
                onClick={handleStartRename}
                title="Rename table"
              >
                <Pencil className="h-3 w-3" />
              </Button>

              {/* Focus Icon */}
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 hover:bg-accent/60"
                onClick={handleFocusTable}
                title="Focus on canvas"
              >
                <Focus className="h-3 w-3" />
              </Button>

              {/* 3-Dots Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 hover:bg-accent/60"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleStartRename}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Rename table
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleFocusTable}>
                    <Focus className="mr-2 h-3.5 w-3.5" />
                    Focus in canvas
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete table
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <CollapsibleContent>
            <div className="bg-muted/5 border-t border-border/10">
              {/* Columns List */}
              <div className="py-0.5">
                {table.columns && table.columns.length > 0 ? (
                  table.columns.map((column, index) => {
                    // Get enum values from enumTypes store or column
                    const getEnumValues = (): string[] => {
                      if (
                        column.enumTypeName &&
                        enumTypes[column.enumTypeName]
                      ) {
                        return enumTypes[column.enumTypeName].values;
                      }
                      return column.enumValues || [];
                    };

                    // Handle saving enum values
                    const handleSaveEnumValues = (newValues: string[]) => {
                      saveColumnEnumValues(tableId, index, newValues);
                    };

                    return (
                      <ColumnRow
                        key={`${tableId}-col-${index}`}
                        tableId={tableId}
                        column={column}
                        columnIndex={index}
                        indexType={getIndexType(column)}
                        onIndexTypeChange={handleIndexTypeChange}
                        onUpdate={(updates) =>
                          updateColumn(tableId, index, updates)
                        }
                        onDelete={() => deleteColumn(tableId, index)}
                        enumValues={getEnumValues()}
                        onSaveEnumValues={handleSaveEnumValues}
                      />
                    );
                  })
                ) : (
                  <div className="text-center py-4 text-xs text-muted-foreground">
                    No columns yet
                  </div>
                )}
              </div>

              {/* Bottom Actions - DrawSQL Style */}
              <div className="px-2 pb-1.5 pt-1 flex items-center gap-2 border-t border-border/10">
                {/* Color Picker Button */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 hover:bg-accent/50"
                      title="Change table color"
                    >
                      <div
                        className="h-3.5 w-3.5 rounded border border-border/30"
                        style={{
                          backgroundColor: table.color || 'hsl(var(--primary))',
                        }}
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-2.5 bg-popover/95 backdrop-blur-sm"
                    align="start"
                  >
                    <div className="grid grid-cols-4 gap-1.5">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className="h-7 w-7 rounded-md transition-all hover:scale-110 hover:shadow-md relative ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          style={{ backgroundColor: color }}
                          onClick={() => updateTableColor(tableId, color)}
                        >
                          {table.color === color && (
                            <Check className="h-3.5 w-3.5 absolute inset-0 m-auto text-white drop-shadow-lg" />
                          )}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Add Column Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-6 text-[11px] font-medium border-border/40 hover:bg-accent/50 hover:border-border/60"
                  onClick={handleAddColumn}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Column
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Table</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{table.title}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteTable(tableId);
                setShowDeleteDialog(false);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface ColumnRowProps {
  tableId: string;
  column: Column;
  columnIndex: number;
  indexType: IndexType;
  onIndexTypeChange: (columnIndex: number, indexType: IndexType) => void;
  onUpdate: (updates: Partial<Column>) => void;
  onDelete: () => void;
  enumValues: string[];
  onSaveEnumValues: (values: string[]) => void;
}

function ColumnRow({
  column,
  columnIndex,
  indexType,
  onIndexTypeChange,
  onUpdate,
  onDelete,
  enumValues,
  onSaveEnumValues,
}: ColumnRowProps) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [enumEditorOpen, setEnumEditorOpen] = useState(false);

  const isEnumColumn = column.format === 'enum' || column.enumTypeName;

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
    <div className="group flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/30 transition-colors">
      {/* Drag Handle */}
      <button
        className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
        title="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Index Type Icon */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 hover:bg-accent/50"
          >
            {indexType === 'primary_key' ? (
              <Key className="h-3 w-3 text-amber-500" />
            ) : indexType === 'unique_key' ? (
              <Sparkles className="h-3 w-3 text-indigo-500" />
            ) : indexType === 'index' ? (
              <Search className="h-3 w-3 text-violet-500" />
            ) : (
              <Circle className="h-3 w-3 text-muted-foreground/30" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuRadioGroup
            value={indexType}
            onValueChange={(value) =>
              onIndexTypeChange(columnIndex, value as IndexType)
            }
          >
            <DropdownMenuRadioItem value="primary_key" className="text-sm">
              <Key className="mr-2 h-3.5 w-3.5 text-amber-500" />
              Primary key
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="unique_key" className="text-sm">
              <Sparkles className="mr-2 h-3.5 w-3.5 text-indigo-500" />
              Unique key
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="index" className="text-sm">
              <Search className="mr-2 h-3.5 w-3.5 text-violet-500" />
              Index
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="none" className="text-sm">
              <Circle className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              None
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Column Name Input - Subtle border */}
      <Input
        value={column.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        className="h-6 flex-1 text-[12px] font-mono border-transparent hover:border-border/40 focus-visible:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/20 bg-transparent px-1.5 rounded-sm"
        placeholder="column_name"
      />

      {/* Data Type Combobox - With Enum Support */}
      <div className="flex items-center gap-0.5">
        {isEnumColumn && enumValues.length > 0 ? (
          <EnumValuesPopover
            enumTypeName={column.enumTypeName || 'enum'}
            enumValues={enumValues}
            isArray={column.isArray}
            trigger={
              <Button
                variant="outline"
                role="combobox"
                className="h-6 w-[100px] justify-between text-[11px] font-mono px-1.5 bg-muted/20 border-border/30 hover:bg-muted/40 hover:border-border/50"
              >
                <span className="truncate flex items-center gap-1">
                  <List className="h-2.5 w-2.5 text-purple-500" />
                  {getTypeDisplayText()}
                </span>
                <ChevronsUpDown className="ml-1 h-2.5 w-2.5 shrink-0 opacity-50" />
              </Button>
            }
          />
        ) : (
          <Popover open={typeOpen} onOpenChange={setTypeOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={typeOpen}
                className="h-6 w-[100px] justify-between text-[11px] font-mono px-1.5 bg-muted/20 border-border/30 hover:bg-muted/40 hover:border-border/50"
              >
                <span className="truncate">{getTypeDisplayText()}</span>
                <ChevronsUpDown className="ml-1 h-2.5 w-2.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[200px] p-0 border-border/40 shadow-lg"
              align="end"
            >
              <Command className="bg-popover">
                <CommandInput
                  placeholder="Search type..."
                  className="h-8 text-xs font-mono border-0"
                />
                <CommandEmpty className="py-2 text-xs text-muted-foreground text-center">
                  No type found.
                </CommandEmpty>
                <CommandGroup className="max-h-[200px] overflow-auto p-1">
                  {POSTGRES_TYPES.map((type) => (
                    <CommandItem
                      key={type}
                      value={type}
                      onSelect={() => {
                        onUpdate({ format: type });
                        setTypeOpen(false);
                      }}
                      className="text-xs font-mono aria-selected:bg-primary/10 aria-selected:text-primary rounded-sm py-1.5 px-2"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-3 w-3 text-primary',
                          (column.format || column.type) === type
                            ? 'opacity-100'
                            : 'opacity-0',
                        )}
                      />
                      {type}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        {/* Enum Edit Button */}
        {isEnumColumn && (
          <EnumEditorPopover
            enumTypeName={column.enumTypeName || 'enum'}
            currentValues={enumValues}
            onSave={onSaveEnumValues}
            open={enumEditorOpen}
            onOpenChange={setEnumEditorOpen}
            trigger={
              <button className="h-5 w-5 flex items-center justify-center rounded transition-all duration-150 hover:bg-muted/50 text-muted-foreground/50 hover:text-purple-500">
                <Pencil className="h-2.5 w-2.5" />
              </button>
            }
          />
        )}
      </div>

      {/* NULL/NOT NULL Chip - Subtle styling */}
      <button
        onClick={() => onUpdate({ required: !column.required })}
        className={cn(
          'h-6 w-7 flex items-center justify-center text-[10px] font-bold rounded border transition-all shrink-0',
          column.required
            ? 'bg-primary/10 text-primary border-primary/25'
            : 'bg-muted/30 text-muted-foreground/60 border-border/30 hover:bg-muted/50 hover:border-border/50',
        )}
        title={
          column.required
            ? 'NOT NULL (click to allow NULL)'
            : 'Nullable (click to require)'
        }
      >
        {column.required ? 'NN' : 'N'}
      </button>

      {/* More Options */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <MoreVertical className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => onUpdate({ required: !column.required })}
            className="text-sm"
          >
            Set {column.required ? 'NULL' : 'NOT NULL'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive text-sm"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
