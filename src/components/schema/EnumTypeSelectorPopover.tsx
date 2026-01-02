'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Plus, List, AlertCircle } from 'lucide-react';

interface EnumTypeSelectorPopoverProps {
  onSelect: (enumTypeName: string, enumValues: string[]) => void;
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type ViewMode = 'select' | 'create';

export function EnumTypeSelectorPopover({
  onSelect,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: EnumTypeSelectorPopoverProps) {
  const { enumTypes, createEnumType } = useStore();
  const [internalOpen, setInternalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('select');

  // New enum creation state
  const [newEnumName, setNewEnumName] = useState('');
  const [newEnumValues, setNewEnumValues] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (controlledOnOpenChange ?? (() => {}))
    : setInternalOpen;

  // Get list of existing enum types
  const existingEnums = useMemo(() => {
    return Object.entries(enumTypes).map(([key, enumDef]) => ({
      key,
      name: enumDef.name,
      schema: enumDef.schema,
      values: enumDef.values,
      displayName: enumDef.schema
        ? `${enumDef.schema}.${enumDef.name}`
        : enumDef.name,
    }));
  }, [enumTypes]);

  // Parse new enum values
  const parsedNewValues = useMemo(() => {
    return newEnumValues
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }, [newEnumValues]);

  const handleSelectExisting = (enumKey: string) => {
    const enumDef = enumTypes[enumKey];
    if (enumDef) {
      onSelect(enumKey, enumDef.values);
      setOpen(false);
      resetCreateForm();
    }
  };

  const handleCreateNew = () => {
    setCreateError(null);

    // Validate name
    const trimmedName = newEnumName.trim();
    if (!trimmedName) {
      setCreateError('Enum name is required');
      return;
    }

    // Check for valid identifier (alphanumeric and underscore, starting with letter)
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmedName)) {
      setCreateError(
        'Name must start with a letter and contain only letters, numbers, and underscores',
      );
      return;
    }

    // Check if name already exists
    const existingKeys = Object.keys(enumTypes).map((k) => k.toLowerCase());
    if (existingKeys.includes(trimmedName.toLowerCase())) {
      setCreateError('An enum with this name already exists');
      return;
    }

    // Validate values
    if (parsedNewValues.length === 0) {
      setCreateError('At least one value is required');
      return;
    }

    // Create the enum
    createEnumType(trimmedName, undefined, parsedNewValues);

    // Select the newly created enum
    onSelect(trimmedName, parsedNewValues);
    setOpen(false);
    resetCreateForm();
  };

  const resetCreateForm = () => {
    setNewEnumName('');
    setNewEnumValues('');
    setCreateError(null);
    setViewMode('select');
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetCreateForm();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        side="right"
        align="start"
        sideOffset={8}
      >
        {viewMode === 'select' ? (
          <>
            {/* Select Existing Enum View */}
            <Command className="bg-popover">
              <CommandInput
                placeholder="Search enum types..."
                className="h-9 text-sm !outline-none !ring-0 !border-0"
              />
              <CommandList className="max-h-[240px]">
                <CommandEmpty className="py-4 text-sm text-muted-foreground/60 text-center">
                  No enum types found
                </CommandEmpty>
                {existingEnums.length > 0 && (
                  <CommandGroup heading="Existing Enums">
                    {existingEnums.map((enumItem) => (
                      <CommandItem
                        key={enumItem.key}
                        value={enumItem.displayName}
                        onSelect={() => handleSelectExisting(enumItem.key)}
                        className="flex items-center justify-between py-2 px-2"
                      >
                        <div className="flex items-center gap-2">
                          <List className="h-3.5 w-3.5 text-purple-500" />
                          <span className="font-mono text-sm">
                            {enumItem.displayName}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {enumItem.values.length} value
                          {enumItem.values.length !== 1 ? 's' : ''}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => setViewMode('create')}
                    className="py-2 px-2"
                  >
                    <Plus className="mr-2 h-3.5 w-3.5 text-primary" />
                    <span className="text-sm">Create new enum type...</span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </>
        ) : (
          <>
            {/* Create New Enum View */}
            <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  Create New Enum
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setViewMode('select')}
                >
                  Back
                </Button>
              </div>
            </div>

            <div className="p-3 space-y-3">
              {/* Name Input */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Enum Name
                </label>
                <Input
                  value={newEnumName}
                  onChange={(e) => {
                    setNewEnumName(e.target.value);
                    setCreateError(null);
                  }}
                  placeholder="status_type"
                  className="h-8 text-sm font-mono"
                  autoFocus
                />
              </div>

              {/* Values Input */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Values (comma-separated)
                </label>
                <Textarea
                  value={newEnumValues}
                  onChange={(e) => {
                    setNewEnumValues(e.target.value);
                    setCreateError(null);
                  }}
                  placeholder="pending, active, completed"
                  className="min-h-[60px] text-sm font-mono resize-none"
                />
              </div>

              {/* Preview */}
              {parsedNewValues.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Preview ({parsedNewValues.length} value
                    {parsedNewValues.length !== 1 ? 's' : ''})
                  </label>
                  <ScrollArea className="max-h-16">
                    <div className="flex flex-wrap gap-1 p-2 bg-muted/30 rounded-md">
                      {parsedNewValues.map((value, index) => (
                        <Badge
                          key={`${value}-${index}`}
                          variant="secondary"
                          className="text-xs font-mono px-2 py-0.5"
                        >
                          {value}
                        </Badge>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Error */}
              {createError && (
                <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{createError}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/50 bg-muted/20">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode('select')}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateNew}
                disabled={!newEnumName.trim() || parsedNewValues.length === 0}
              >
                Create & Select
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
