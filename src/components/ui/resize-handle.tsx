'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface ResizeHandleProps {
  /** Which side of the panel the handle is on */
  side: 'left' | 'right';
  /** Whether currently resizing */
  isResizing?: boolean;
  /** Mouse down handler to start resizing */
  onMouseDown: (e: React.MouseEvent) => void;
  /** Optional double-click handler (e.g., to reset width) */
  onDoubleClick?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * A resize handle component for sidebars.
 * Place on the edge of a sidebar to allow dragging to resize.
 */
export function ResizeHandle({
  side,
  isResizing = false,
  onMouseDown,
  onDoubleClick,
  className,
}: ResizeHandleProps) {
  return (
    <div
      className={cn(
        'absolute top-0 h-full w-1.5 cursor-col-resize group z-50',
        'hover:bg-primary/20 active:bg-primary/30 transition-colors',
        isResizing && 'bg-primary/30',
        side === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
        className,
      )}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize (double-click to reset)"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize handle"
    >
      {/* Visual grip indicator - shows on hover */}
      <div
        className={cn(
          'absolute top-1/2 -translate-y-1/2',
          'w-4 h-8 flex items-center justify-center rounded-sm',
          'bg-muted/80 border border-border/50 shadow-sm',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          isResizing && 'opacity-100 bg-primary/20 border-primary/30',
          side === 'left' ? 'left-1/2 -translate-x-1/2' : 'right-1/2 translate-x-1/2',
        )}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>
    </div>
  );
}
