'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseResizableOptions {
  /** Storage key for persisting width */
  storageKey: string;
  /** Default width in pixels */
  defaultWidth: number;
  /** Minimum width in pixels */
  minWidth: number;
  /** Maximum width in pixels */
  maxWidth: number;
  /** Direction of resize - 'left' means handle on left side, 'right' means handle on right side */
  side: 'left' | 'right';
}

interface UseResizableReturn {
  /** Current width in pixels */
  width: number;
  /** Whether currently resizing */
  isResizing: boolean;
  /** Mouse down handler for resize handle */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** Reset width to default */
  resetWidth: () => void;
}

/**
 * Hook for making a sidebar resizable with localStorage persistence
 */
export function useResizable({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  side,
}: UseResizableOptions): UseResizableReturn {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  // Load persisted width on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsedWidth = parseInt(stored, 10);
        if (!isNaN(parsedWidth) && parsedWidth >= minWidth && parsedWidth <= maxWidth) {
          setWidth(parsedWidth);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [storageKey, minWidth, maxWidth]);

  // Save width to localStorage when it changes (debounced via isResizing)
  useEffect(() => {
    if (!isResizing) {
      try {
        localStorage.setItem(storageKey, String(width));
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [width, isResizing, storageKey]);

  // Handle mouse down on resize handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  // Reset width to default
  const resetWidth = useCallback(() => {
    setWidth(defaultWidth);
  }, [defaultWidth]);

  // Handle mouse move and mouse up during resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      let newWidth: number;

      if (side === 'left') {
        // For left sidebar: width = mouse X position
        newWidth = e.clientX;
      } else {
        // For right sidebar: width = window width - mouse X position
        newWidth = window.innerWidth - e.clientX;
      }

      // Clamp to min/max
      newWidth = Math.min(maxWidth, Math.max(minWidth, newWidth));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    // Add event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Add cursor style to body during resize
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, minWidth, maxWidth, side]);

  return {
    width,
    isResizing,
    handleMouseDown,
    resetWidth,
  };
}
