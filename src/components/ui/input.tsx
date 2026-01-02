import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm',
          'transition-all duration-150 ease-out',
          'placeholder:text-muted-foreground/60',
          'hover:border-border/80',
          'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/20',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
