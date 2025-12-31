# UI Transparency Plan: Reasoning & Tool I/O Display

> **Goal**: Make AI operations transparent to users by showing thinking/reasoning and tool call input/output in an expandable, minimal UI.

## 📋 Overview

Currently, the chat interface feels like a "black box" - users only see final outputs and limited logs. This plan outlines implementing:

1. **AI Reasoning/Thinking Display** - Show what the AI is "thinking" during processing
2. **Tool/MCP Call Transparency** - Show expandable input/output for each tool execution

## 🎯 Objectives

### Phase 1: AI Reasoning Display (Priority: HIGH)
Show the AI's reasoning/thinking process as it works through requests.

### Phase 2: Tool I/O Transparency (Priority: HIGH)
Display tool call inputs and outputs in a collapsible, hover-expandable format.

---

## 📚 Reference: assistant-ui Components

Based on [assistant-ui documentation](https://www.assistant-ui.com/docs):

### Reasoning Component
- **Location**: `@assistant-ui/react` + custom `reasoning.tsx`
- **Features**:
  - Collapsible reasoning sections
  - Shimmer effect while streaming
  - Automatic grouping of consecutive reasoning parts
  - Scroll lock during collapse animation

### ToolGroup Component
- **Features**:
  - Groups consecutive tool calls
  - Collapsible sections with count display
  - Custom styling per tool type

### Key Primitives
- `MessagePrimitive.Parts` - Renders message parts with custom components
- `ReasoningGroup` - Wraps consecutive reasoning parts
- `ToolGroup` - Wraps consecutive tool calls

---

## 🏗️ Implementation Plan

### Phase 1: AI Reasoning Display

#### 1.1 Backend Changes (`src/app/api/chat/route.ts`)

Enable reasoning/thinking in the stream:

```typescript
// Current (disabled)
writer.merge(
  result.toUIMessageStream({
    sendSources: false,
    sendReasoning: false,  // ← Enable this
    // ...
  }),
);

// Updated
writer.merge(
  result.toUIMessageStream({
    sendSources: false,
    sendReasoning: true,  // ← Enable reasoning
    // ...
  }),
);
```

#### 1.2 Create Reasoning Component

**File**: `src/components/assistant-ui/reasoning.tsx`

```tsx
"use client";

import { FC, PropsWithChildren, useState } from "react";
import { ChevronDown, ChevronUp, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Reasoning Root Container
const ReasoningRoot: FC<PropsWithChildren<{ className?: string }>> = ({ 
  children, 
  className 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={cn(
      "mb-3 rounded-lg border border-purple-500/20 bg-purple-500/5",
      className
    )}>
      {children}
    </Collapsible>
  );
};

// Reasoning Trigger (header)
const ReasoningTrigger: FC<{ 
  isStreaming?: boolean; 
  className?: string 
}> = ({ isStreaming, className }) => {
  return (
    <CollapsibleTrigger className={cn(
      "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium",
      "text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors",
      className
    )}>
      <Brain size={14} className={cn(isStreaming && "animate-pulse")} />
      <span>{isStreaming ? "Thinking..." : "Reasoning"}</span>
      <ChevronDown size={14} className="ml-auto transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
    </CollapsibleTrigger>
  );
};

// Reasoning Content
const ReasoningContent: FC<PropsWithChildren<{ className?: string }>> = ({ 
  children, 
  className 
}) => {
  return (
    <CollapsibleContent className={cn(
      "px-3 pb-3 text-sm text-muted-foreground border-t border-purple-500/10",
      className
    )}>
      <div className="pt-2 prose prose-sm dark:prose-invert max-w-none">
        {children}
      </div>
    </CollapsibleContent>
  );
};

// Main Reasoning Component
export const Reasoning: FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  
  return (
    <ReasoningRoot>
      <ReasoningTrigger />
      <ReasoningContent>{text}</ReasoningContent>
    </ReasoningRoot>
  );
};

// Reasoning Group (for consecutive reasoning parts)
export const ReasoningGroup: FC<PropsWithChildren<{
  startIndex: number;
  endIndex: number;
  isStreaming?: boolean;
}>> = ({ startIndex, endIndex, isStreaming, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const count = endIndex - startIndex + 1;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors">
        <Brain size={14} className={cn(isStreaming && "animate-pulse")} />
        <span>
          {isStreaming ? "Thinking..." : `Reasoning (${count} step${count > 1 ? 's' : ''})`}
        </span>
        {isStreaming && (
          <span className="ml-2 h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
        )}
        <ChevronDown size={14} className="ml-auto transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 text-sm text-muted-foreground border-t border-purple-500/10">
        <div className="pt-2 space-y-2">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default Reasoning;
```

#### 1.3 Integrate into ChatSidebar

Update `src/components/ChatSidebar.tsx` to render reasoning parts:

```tsx
// In message rendering section
{message.parts?.map((part, partIndex) => {
  if (part.type === 'reasoning') {
    return (
      <Reasoning 
        key={partIndex} 
        text={part.text || part.reasoning} 
      />
    );
  }
  // ... existing part handling
})}
```

---

### Phase 2: Tool I/O Transparency

#### 2.1 Enhanced ToolResult Component

**Updated File**: `src/components/ChatSidebar.tsx` (ToolResult section)

```tsx
function ToolResult({ tool }: { tool: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isComplete = !!tool.result;
  const input = tool.args || tool.input;
  const output = tool.result || tool.output;
  const isSuccess = output?.ok !== false;
  
  // ... existing icon/summary functions ...

  return (
    <div className={cn(
      'rounded-lg transition-all duration-200',
      isComplete
        ? isSuccess
          ? 'bg-emerald-500/5 border border-emerald-500/20'
          : 'bg-red-500/5 border border-red-500/20'
        : 'bg-muted/40 border border-border/50',
    )}>
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
      >
        {/* Status icon */}
        {isComplete ? (
          isSuccess ? (
            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
          ) : (
            <X size={14} className="text-red-500 flex-shrink-0" />
          )
        ) : (
          <Loader2 size={14} className="text-primary animate-spin flex-shrink-0" />
        )}
        
        {/* Tool icon */}
        {getToolIcon(tool.toolName)}
        
        {/* Tool name */}
        <span className="font-medium text-xs text-foreground">
          {tool.toolName}
        </span>
        
        {/* Summary */}
        {getToolSummary(tool.toolName, output)}
        
        {/* Running indicator */}
        {!isComplete && (
          <span className="text-muted-foreground animate-pulse ml-auto text-xs">
            running...
          </span>
        )}
        
        {/* Expand/collapse arrow */}
        <span className="ml-auto">
          {isExpanded ? (
            <ChevronUp size={14} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={14} className="text-muted-foreground" />
          )}
        </span>
      </button>
      
      {/* Expandable I/O Section */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-3">
          {/* Input Section */}
          {input && Object.keys(input).length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ArrowRight size={12} />
                <span>Input</span>
              </div>
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-32">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          
          {/* Output Section */}
          {output && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ArrowLeft size={12} />
                <span>Output</span>
              </div>
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-48">
                {typeof output === 'string' 
                  ? output 
                  : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

#### 2.2 Tool Group Component

**File**: `src/components/assistant-ui/tool-group.tsx`

```tsx
"use client";

import { FC, PropsWithChildren, useState } from "react";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const ToolGroup: FC<PropsWithChildren<{
  startIndex: number;
  endIndex: number;
  isRunning?: boolean;
}>> = ({ startIndex, endIndex, isRunning, children }) => {
  const [isOpen, setIsOpen] = useState(true); // Default open for transparency
  const toolCount = endIndex - startIndex + 1;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="my-2">
      <CollapsibleTrigger className={cn(
        "flex items-center gap-2 w-full px-3 py-2 rounded-lg",
        "bg-muted/50 hover:bg-muted transition-colors",
        "text-sm font-medium"
      )}>
        <Wrench size={14} className={cn(
          "text-blue-500",
          isRunning && "animate-spin"
        )} />
        <span>
          {toolCount} tool {toolCount === 1 ? 'call' : 'calls'}
        </span>
        {isRunning && (
          <span className="text-xs text-muted-foreground animate-pulse">
            executing...
          </span>
        )}
        {isOpen ? (
          <ChevronUp size={14} className="ml-auto text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="ml-auto text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2 pl-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default ToolGroup;
```

---

### Phase 3: MCP-Specific Transparency

#### 3.1 MCP Tool Badge

Add visual indicator for MCP vs Atomic tools:

```tsx
// In ToolResult component
<Badge 
  variant="outline" 
  className={cn(
    "text-[10px] h-4 ml-2",
    tool.source === 'mcp' 
      ? "border-purple-500/50 text-purple-600" 
      : "border-blue-500/50 text-blue-600"
  )}
>
  {tool.source === 'mcp' ? 'MCP' : 'Schema'}
</Badge>
```

#### 3.2 Backend: Tag Tool Source

Update `src/app/api/chat/route.ts` to include tool source:

```typescript
// When merging tools
const tools = {
  ...Object.fromEntries(
    Object.entries(atomicTools).map(([name, tool]) => [
      name, 
      { ...tool, _source: 'atomic' }
    ])
  ),
  ...Object.fromEntries(
    Object.entries(mcpTools).map(([name, tool]) => [
      name, 
      { ...tool, _source: 'mcp' }
    ])
  ),
};
```

---

## 📁 File Structure

```
src/
├── components/
│   ├── assistant-ui/
│   │   ├── reasoning.tsx      # NEW: Reasoning display component
│   │   ├── tool-group.tsx     # NEW: Tool grouping component
│   │   └── tool-result.tsx    # REFACTOR: Extract from ChatSidebar
│   ├── ChatSidebar.tsx        # UPDATE: Integrate new components
│   └── ui/
│       └── collapsible.tsx    # EXISTING: Used by new components
├── app/
│   └── api/
│       └── chat/
│           └── route.ts       # UPDATE: Enable reasoning, tag sources
└── lib/
    └── mcp/
        └── router.ts          # UPDATE: Include source info in responses
```

---

## 🎨 UI/UX Design

### Reasoning Display
```
┌─────────────────────────────────────────────┐
│ 🧠 Thinking...                          ▼  │  ← Collapsed (default while streaming)
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 🧠 Reasoning (3 steps)                  ▲  │  ← Expanded
├─────────────────────────────────────────────┤
│ 1. Analyzing the user's request for a      │
│    users table with authentication...      │
│                                            │
│ 2. Considering best practices for UUID     │
│    primary keys and email validation...    │
│                                            │
│ 3. Planning column structure with proper   │
│    constraints and indexes...              │
└─────────────────────────────────────────────┘
```

### Tool I/O Display
```
┌─────────────────────────────────────────────┐
│ ✓ 🏗️ createTable users (5 columns) [Schema] ▼│  ← Collapsed
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ ✓ 🏗️ createTable users (5 columns) [Schema] ▲│  ← Expanded
├─────────────────────────────────────────────┤
│ → Input                                     │
│ ┌─────────────────────────────────────────┐ │
│ │ {                                       │ │
│ │   "tableId": "public.users",           │ │
│ │   "columns": [                         │ │
│ │     { "title": "id", "type": "uuid" }, │ │
│ │     ...                                │ │
│ │   ]                                    │ │
│ │ }                                      │ │
│ └─────────────────────────────────────────┘ │
│ ← Output                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ {                                       │ │
│ │   "ok": true,                          │ │
│ │   "message": "Table created",          │ │
│ │   "table": { "id": "public.users" }    │ │
│ │ }                                      │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 📋 Implementation Checklist

### Phase 1: Reasoning (Week 1)
- [x] Enable `sendReasoning: true` in backend
- [x] Create `reasoning.tsx` component
- [x] Create `ReasoningGroup` for consecutive reasoning
- [x] Integrate into ChatSidebar message rendering
- [x] Add shimmer/pulse animation while streaming
- [ ] Test with different AI providers (OpenAI, Gemini)
- [x] Typecheck passed
- [x] Lint check passed
- [x] Build check passed

### Phase 2: Tool I/O (Week 2)
- [ ] Refactor ToolResult into separate file
- [ ] Add input/output expandable sections
- [ ] Create ToolGroup component
- [ ] Add MCP vs Atomic badge indicators
- [ ] Implement hover preview (optional)
- [ ] Test with various tool types

### Phase 3: Polish (Week 3)
- [ ] Add keyboard navigation (expand/collapse)
- [ ] Add copy buttons for I/O content
- [ ] Implement search within tool outputs
- [ ] Add "expand all" / "collapse all" controls
- [ ] Performance optimization (virtualization if needed)
- [ ] Accessibility audit (ARIA labels, focus management)

---

## 🔗 Related Documentation

- [assistant-ui Reasoning](https://www.assistant-ui.com/docs/ui/Reasoning)
- [assistant-ui ToolGroup](https://www.assistant-ui.com/docs/ui/ToolGroup)
- [assistant-ui PartGrouping](https://www.assistant-ui.com/docs/ui/PartGrouping)
- [assistant-ui Thread](https://www.assistant-ui.com/docs/ui/Thread)

---

## 📝 Notes

1. **Performance**: Large tool outputs should be truncated with "show more"
2. **Streaming**: Reasoning should stream incrementally, not wait for completion
3. **Mobile**: Ensure collapsible sections work well on touch devices
4. **Theming**: Use CSS variables for consistent dark/light mode support
5. **Persistence**: Consider saving expand/collapse state per session