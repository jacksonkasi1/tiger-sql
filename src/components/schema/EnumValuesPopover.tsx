'use client';

import { useState } from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface EnumValuesPopoverProps {
  enumTypeName: string;
  enumValues: string[];
  isArray?: boolean;
  trigger: React.ReactNode;
}

const MAX_VISIBLE_VALUES = 100; // Show all values by default
const SHOW_SEARCH_THRESHOLD = 15;

export function EnumValuesPopover({
  enumTypeName,
  enumValues,
  isArray,
  trigger,
}: EnumValuesPopoverProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter values based on search
  const filteredValues = searchQuery
    ? enumValues.filter((v) =>
        v.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : enumValues;

  // Show limited values unless searching
  const displayValues = searchQuery
    ? filteredValues
    : filteredValues.slice(0, MAX_VISIBLE_VALUES);

  const hasMore = !searchQuery && enumValues.length > MAX_VISIBLE_VALUES;
  const remainingCount = enumValues.length - MAX_VISIBLE_VALUES;
  const showSearch = enumValues.length >= SHOW_SEARCH_THRESHOLD;

  // Extract display name from enum type (handle schema.name format)
  const displayName = enumTypeName.includes('.')
    ? enumTypeName.split('.').pop()
    : enumTypeName;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent
        className="w-64 p-0"
        side="right"
        align="start"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Enum:
            </span>
            <span className="text-sm font-semibold text-foreground">
              {displayName}
            </span>
            {isArray && (
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 h-4 font-normal"
              >
                array
              </Badge>
            )}
          </div>
        </div>

        {/* Search (only for large lists) */}
        {showSearch && (
          <div className="px-3 py-2 border-b border-border/30">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search values..."
                className="h-7 text-xs pl-7 pr-2 bg-muted/20"
              />
            </div>
          </div>
        )}

        {/* Values List */}
        <div className="max-h-64 overflow-y-auto">
          <div className="p-2 space-y-1">
            {displayValues.length > 0 ? (
              displayValues.map((value, index) => (
                <div
                  key={`${value}-${index}`}
                  className="px-2 py-1.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <span className="text-xs font-mono text-foreground">
                    &apos;{value}&apos;
                  </span>
                </div>
              ))
            ) : (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {searchQuery ? 'No matching values' : 'No enum values defined'}
              </div>
            )}

            {/* Show more indicator */}
            {hasMore && (
              <div className="px-2 py-1.5 text-center">
                <span className="text-xs text-muted-foreground">
                  +{remainingCount} more value{remainingCount > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer with count */}
        <div className="px-3 py-1.5 border-t border-border/30 bg-muted/20">
          <span className="text-[10px] text-muted-foreground">
            {enumValues.length} value{enumValues.length !== 1 ? 's' : ''} total
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
