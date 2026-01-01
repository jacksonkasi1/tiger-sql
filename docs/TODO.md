# Postgres Schema Visualization - TODO

## Current Status
**Phase 3 (ReactFlow Integration):** ✅ COMPLETE
**Phase 4 (Advanced Features):** 🚧 IN PROGRESS

---

# Phase 4: Advanced Features - TODO

## Overview
Phase 4 focuses on enhancing the schema visualization with professional features including organization, filtering, querying, and collaboration capabilities.

---

## Pending Tasks

### 🔴 Critical (Foundation)
- [x] **Table grouping by schema** ✅ COMPLETED
  - Schema detection from SQL CREATE statements
  - Schema-based filtering with visibility controls
  - Group positioning and layout (auto-layout groups by schema)
  - Settings to show/hide schemas (SchemaFilter panel)
  - Color-coded schema indicators
  - LocalStorage persistence for schema preferences

### 🟡 High Priority (Core Features)
- [ ] **Relationship filtering**
  - Toggle visibility of FK connections
  - Filter by relationship type (one-to-one, one-to-many, many-to-many)
  - Hide/show all edges
  - Filter by source/target table
  - Visual indicators for hidden relationships

- [x] **Search and filter tables** ✅ COMPLETED
  - Global search bar component
  - Search by table/view name
  - Search by column name
  - Filter by table type (table/view)
  - Highlight search results
  - Jump to table feature
  - Recent searches history
  - Keyboard shortcuts (Ctrl/Cmd+F)

### 🟢 Medium Priority (Advanced Features)
- [ ] **SQL query builder from diagram**
  - Visual query builder UI
  - SELECT query generation from node selection
  - JOIN detection from FK relationships
  - WHERE clause builder
  - Export query as SQL
  - Execute query (with connection)
  - Query history

- [ ] **Version comparison**
  - Schema snapshot functionality
  - Compare two schema versions
  - Highlight differences (added/removed/modified)
  - Migration script generation
  - Version history timeline
  - Import/export schema versions

### 🔵 Low Priority (Collaboration)
- [ ] **Collaborative editing**
  - Real-time cursor tracking
  - Multi-user presence indicators
  - Shared canvas state
  - Conflict resolution
  - WebSocket/WebRTC integration
  - User permissions system
  - Activity feed

### ⚪ Very Low Priority (Polish & Future Enhancements)
**Note:** These are nice-to-have features to be implemented after all phases are complete. Design and placement decisions will be finalized later.

- [ ] **Hover states with pulse animation**
  - Highlight valid connection targets when dragging
  - Pulse animation on valid handles
  - Visual feedback for connection validation
  - Invalid target indication with red glow

- [ ] **Connection validation messages**
  - Toast notifications for failed connections
  - Explain why connection was rejected
  - Show connection rules on demand
  - Visual feedback for validation errors

- [ ] **Connection statistics panel**
  - Total tables, views, and relationships count
  - Orphaned tables indicator
  - Circular dependency detection
  - Connection health metrics
  - Collapsible panel (position TBD)
  - Performance metrics for large schemas

- [ ] **Connection mode toggle (Future)**
  - UI toggle for strict/flexible connection modes
  - Persist mode preference in localStorage
  - Tooltips explaining each mode
  - Visual indication of current mode
  - Note: Currently hardcoded to strict mode

- [ ] **Smart connection suggestions**
  - Detect patterns like user_id → users.id
  - Suggest connections based on naming conventions
  - Auto-complete for FK references
  - ML-based relationship predictions

- [ ] **Performance optimizations**
  - Virtualize rendering for 50+ tables
  - Lazy load nodes outside viewport
  - Optimize re-renders with React.memo
  - Connection pooling for large schemas

- [ ] **Accessibility improvements**
  - Keyboard navigation for connections
  - Screen reader support
  - ARIA labels for all interactive elements
  - Focus management
  - High contrast mode

---

## Implementation Order

### Step 1: Table Grouping (Week 1)
1. Detect schema information from table metadata
2. Create schema grouping UI component
3. Implement collapsible groups
4. Update layout algorithm for grouped tables
5. Add schema filter controls

### Step 2: Search & Filtering (Week 2)
1. Create search bar component
2. Implement search functionality
3. Add highlight and focus features
4. Create relationship filter controls
5. Implement edge visibility toggling

### Step 3: Query Builder (Week 3-4)
1. Design query builder UI
2. Implement node-to-query conversion
3. Add JOIN detection logic
4. Create query preview panel
5. Add export functionality
6. (Optional) Database connection for execution

### Step 4: Version Comparison (Week 5)
1. Design schema snapshot format
2. Implement snapshot save/load
3. Create comparison algorithm
4. Build diff visualization UI
5. Add migration script generator

### Step 5: Collaboration (Week 6+)
1. Research collaboration architecture
2. Set up WebSocket/WebRTC backend
3. Implement presence system
4. Add real-time sync
5. Create permissions and access control

---

## Files to Create/Modify

### New Files (Phase 4)
- `/src/components/search/SearchBar.tsx` - Global search component
- `/src/components/search/FilterPanel.tsx` - Advanced filtering
- `/src/components/grouping/SchemaGroup.tsx` - Schema boundary component
- `/src/components/query/QueryBuilder.tsx` - Visual query builder
- `/src/components/query/QueryPanel.tsx` - Query preview and export
- `/src/components/version/VersionCompare.tsx` - Schema diff viewer
- `/src/components/collab/Presence.tsx` - User presence indicators
- `/src/lib/query-builder.ts` - Query generation utilities
- `/src/lib/schema-diff.ts` - Version comparison logic
- `/src/types/query.ts` - Query builder types
- `/src/types/version.ts` - Version control types

### Modified Files
- `/src/components/flow/FlowCanvas.tsx` - Add search, filters, grouping
- `/src/lib/store.ts` - Add Phase 4 state management
- `/src/components/Sidebar.tsx` - Add Phase 4 controls
- `/src/components/Helper.tsx` - Add query builder and version buttons

---

## Testing Checklist

### Table Grouping
- [ ] Tables correctly grouped by schema
- [ ] Groups can be collapsed/expanded
- [ ] Layout respects group boundaries
- [ ] Filter by schema works
- [ ] Visual styling is clear

### Search & Filter
- [ ] Search finds tables by name
- [ ] Search finds columns by name
- [ ] Results are highlighted
- [ ] Relationship filtering works
- [ ] Edge visibility toggles correctly

### Query Builder
- [ ] Generates valid SQL
- [ ] JOINs are detected correctly
- [ ] Complex queries work
- [ ] Export functionality works
- [ ] Error handling for invalid selections

### Version Comparison
- [ ] Snapshots save correctly
- [ ] Comparison shows all differences
- [ ] Migration scripts are valid SQL
- [ ] Version history is maintained
- [ ] Import/export works reliably

### Collaboration
- [ ] Multiple users can connect
- [ ] Cursor positions sync
- [ ] Changes sync in real-time
- [ ] Conflicts are resolved
- [ ] Performance with multiple users

---

## Progress Tracking

**Phase 4 Started:** 2025-11-05
**Status:** 🚧 IN PROGRESS

### Completed ✅
- ✅ Address code review comments (spacebar shortcut, clipboard error handling, handle ID collisions)
- ✅ Search and filter tables with keyboard shortcuts (Ctrl/Cmd+F)
- ✅ Auto-focus persistence bug fix
- ✅ SQL import with drag-and-drop
- ✅ SQL export direct download
- ✅ Schema overwrite confirmation dialog
- ✅ **Table grouping by schema** (Critical Priority)
  - Schema detection and extraction from SQL
  - SchemaFilter control panel in top-right
  - Schema-aware auto-layout (groups positioned horizontally)
  - Visibility toggle per schema with persistence
  - Color-coded schema indicators
  - Show All / Hide All controls

### In Progress 🚧
- None (Ready for next task: Relationship Filtering)

### Blocked ⛔
- None

---

# Phase 3: ReactFlow Integration - TODO

## Current Status
Phase 3 focuses on migrating from custom SVG-based schema visualization to ReactFlow for professional features and better UX.

**Status:** ✅ COMPLETE (2025-11-05)

---

## Pending Tasks

### 🔴 Critical (Blocking)
- [ ] **Install ReactFlow dependencies**
  - `@xyflow/react` - Core ReactFlow library
  - `@dagrejs/dagre` - Auto-layout algorithm
  - Update package.json and install

### 🟡 High Priority (Core Features)
- [ ] **Create custom TableNode component**
  - Location: `/src/components/flow/TableNode.tsx`
  - Replace current Table component logic
  - Add ReactFlow handles for connections
  - Style with Tailwind matching current design
  - Support primary key indicators
  - Support foreign key connection points

- [ ] **Create custom ViewNode component**
  - Location: `/src/components/flow/ViewNode.tsx`
  - Similar to TableNode but for database views
  - Different visual indicator (newspaper icon)

- [ ] **Create FlowCanvas component**
  - Location: `/src/components/flow/FlowCanvas.tsx`
  - Main ReactFlow wrapper
  - Replace current canvas implementation in page.tsx
  - Implement pan/zoom with ReactFlow
  - Add MiniMap, Controls, Background

- [ ] **Implement data conversion utilities**
  - Location: `/src/lib/flow-utils.ts`
  - Convert table data to ReactFlow nodes
  - Convert FK relationships to ReactFlow edges
  - Handle position persistence

- [ ] **Implement auto-layout with dagre**
  - Location: `/src/lib/layout.ts`
  - Dagre layout algorithm integration
  - Support multiple directions (TB, LR, BT, RL)
  - Smart spacing calculations
  - Preserve manual adjustments

### 🟢 Medium Priority (Enhancements)
- [ ] **Add custom edge styling**
  - Match current SVG connector appearance
  - Smooth/step edge types
  - Edge labels for relationship types
  - Animated edges on hover

- [ ] **Implement selection features**
  - Multi-select nodes (ReactFlow native)
  - Highlight related tables on selection
  - Context menu on right-click

- [ ] **Add keyboard shortcuts**
  - Ctrl/Cmd + A: Select all
  - Delete: Remove selected tables
  - Ctrl/Cmd + F: Search tables
  - Space: Fit view

- [ ] **Integrate with existing features**
  - ChatSidebar compatibility
  - Settings panel integration
  - Screenshot with ReactFlow export
  - Share link with positions

### 🔵 Low Priority (Polish)
- [ ] **Performance optimizations**
  - Lazy rendering for large schemas
  - Virtualization for 100+ tables
  - Memoization of expensive calculations

- [ ] **Accessibility**
  - Keyboard navigation
  - Screen reader support
  - Focus management
  - ARIA labels

- [ ] **Advanced features**
  - Table grouping
  - Relationship filtering
  - Zoom to selection
  - Export formats (PNG, SVG, JSON)

---

## Implementation Order

### Step 1: Setup (Day 1)
1. Install dependencies
2. Create directory structure
3. Set up TypeScript types

### Step 2: Core Components (Day 2-3)
1. TableNode component
2. ViewNode component
3. Data conversion utilities
4. Basic FlowCanvas integration

### Step 3: Feature Parity (Day 4-5)
1. Auto-layout implementation
2. Edge styling
3. Selection and highlighting
4. Pan/zoom controls

### Step 4: Integration (Day 6)
1. Replace main page implementation
2. Migrate all existing features
3. Ensure backwards compatibility
4. Update localStorage handling

### Step 5: Testing & Polish (Day 7)
1. Test with real schemas
2. Performance testing
3. Bug fixes
4. Documentation updates

---

## Files to Modify

### New Files
- `/src/components/flow/TableNode.tsx`
- `/src/components/flow/ViewNode.tsx`
- `/src/components/flow/FlowCanvas.tsx`
- `/src/components/flow/CustomEdge.tsx`
- `/src/lib/flow-utils.ts`
- `/src/lib/layout.ts`
- `/src/types/flow.ts`

### Modified Files
- `/src/app/page.tsx` - Integrate FlowCanvas
- `/src/lib/store.ts` - Add ReactFlow state
- `/src/components/Helper.tsx` - Update for ReactFlow
- `/package.json` - Add dependencies

### Deprecated Files (keep for reference)
- `/src/components/Table.tsx` - Replaced by TableNode
- `/src/components/Connector.tsx` - Replaced by ReactFlow edges

---

## Testing Checklist

### Functional Testing
- [ ] Tables render correctly
- [ ] Foreign keys show as edges
- [ ] Drag and drop works
- [ ] Pan and zoom smooth
- [ ] Auto-layout produces good results
- [ ] Selection works properly
- [ ] Dark mode compatibility
- [ ] LocalStorage persistence

### Performance Testing
- [ ] Load time with 10 tables
- [ ] Load time with 50 tables
- [ ] Load time with 100+ tables
- [ ] Memory usage acceptable
- [ ] Smooth animations at 60fps

### Compatibility Testing
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers
- [ ] Different screen sizes

---

## Notes

### Current Implementation Details
- Custom SVG connectors in `Connector.tsx`
- Manual drag handling in `Table.tsx`
- Pan/zoom in `page.tsx` scrollEvent
- Selection with `@viselect/react`
- Position storage in Zustand + localStorage

### ReactFlow Benefits
- Built-in pan/zoom controls
- Native selection handling
- Performance optimized for large graphs
- Auto-layout ready
- Extensive customization
- Active community & documentation
- Accessibility features
- Export capabilities

### Migration Risks
- Bundle size increase (~40-50KB)
- Learning curve for customization
- Potential breaking changes
- Need to maintain backwards compatibility

### Mitigation Strategies
- Incremental migration approach
- Keep old implementation during transition
- Comprehensive testing
- User feedback collection
- Fallback options if issues arise

---

## Progress Tracking

**Phase 3 Started:** 2025-11-05
**Phase 3 Completed:** 2025-11-05
**Status:** ✅ COMPLETE

### Completed ✅
- ✅ Install ReactFlow dependencies (`@xyflow/react`, `@dagrejs/dagre`)
- ✅ Create custom TableNode component with handles
- ✅ Create custom ViewNode component for database views
- ✅ Create FlowCanvas component with controls, minimap, background
- ✅ Implement data conversion utilities (tables → nodes/edges)
- ✅ Implement dagre auto-layout with TB/LR directions
- ✅ Integrate FlowCanvas into main page
- ✅ Fix FK connector handle mapping (unique IDs per column)
- ✅ Add target handles to ALL columns (not just PKs)
- ✅ Implement edge highlighting on node selection
- ✅ Add layout controls and fit-to-view
- ✅ Add keyboard shortcuts (Ctrl/Cmd+A, Delete, Space, Escape)
- ✅ Implement right-click context menu for nodes and edges
- ✅ Update screenshot functionality for ReactFlow
- ✅ Edge relationship selector (one-to-many, one-to-one, many-to-many)

### In Progress 🚧
- None

### Blocked ⛔
- None

---

## Recent Fixes

### Code Review Fixes - Phase 4 (2025-11-05)

**Issues Addressed:**
Three code review comments were fixed to improve code quality and reliability.

**1. Spacebar Shortcut Fix**
- **Problem:** Spacebar shortcut used incorrect `!event.target` check which could fail
- **Solution:** Added proper input field detection checking for INPUT, TEXTAREA, and contentEditable elements
- **File:** `src/components/flow/FlowCanvas.tsx:167-178`

**2. Clipboard Error Handling**
- **Problem:** Clipboard write operation could fail silently without error handling
- **Solution:** Added `.catch()` handler to log clipboard access errors to console
- **File:** `src/components/flow/FlowCanvas.tsx:334-337`

**3. Handle ID Collision Prevention**
- **Problem:** Handle IDs using only column titles could cause collisions with duplicate column names
- **Solution:** Updated handle ID format to include column index: `tableName_columnName_index`
- **Files:**
  - `src/components/flow/ViewNode.tsx:36-41`
  - `src/components/flow/TableNode.tsx:38-43`

**Result:**
✅ All code review comments resolved
✅ More robust keyboard shortcuts
✅ Better error visibility for clipboard operations
✅ Unique handle IDs prevent connection issues

### FK Connector Handle Mapping Fix (2025-11-05)

**Problem:**
Foreign key connector lines were attaching to node centers/bounding boxes instead of specific column positions.

**Root Cause:**
1. Handle IDs were not unique (used `col.title` instead of `${tableName}_${col.title}`)
2. Only PK columns had target handles, but any column can be referenced by FK
3. Handle positioning used absolute pixels which could drift

**Solution:**
1. Changed handle IDs to `${tableName}_${columnName}` format for uniqueness
2. Added target handles to ALL columns (PK columns = blue, others = gray)
3. Updated edge creation to use matching handle ID format
4. Changed handle positioning to relative (50% + translateY) for better alignment

**Files Modified:**
- `src/components/flow/TableNode.tsx`: Fixed handle ID generation and added handles to all columns
- `src/lib/flow-utils.ts`: Updated edge creation to use unique handle IDs

**Result:**
✅ Edges now connect precisely to the correct columns
✅ Multiple columns with same name across tables work correctly
✅ Handle positioning is stable and accurate

### ViewNode Component & Additional Features (2025-11-05)

**New Features Added:**
1. **ViewNode Component** - Dedicated component for database views
   - Purple-themed styling to distinguish from tables
   - Newspaper icon indicator
   - Consistent handle positioning with tables

2. **Keyboard Shortcuts**
   - `Ctrl/Cmd + A`: Select all nodes
   - `Delete/Backspace`: Remove selected nodes and connected edges
   - `Space`: Fit view to canvas
   - `Escape`: Clear selection and close menus

3. **Context Menu**
   - Right-click on nodes: Focus, Copy ID, Hide, Delete
   - Right-click on edges: Change relationship type, Delete
   - Clean UI with icons and hover effects

4. **Enhanced Screenshot**
   - Improved dark mode detection
   - Filter out minimap and controls
   - Fallback mechanism for reliability
   - Higher quality with 2x pixel ratio

**Files Created:**
- `src/components/flow/ViewNode.tsx`: Dedicated view node component
- `src/components/flow/ContextMenu.tsx`: Reusable context menu component

**Files Modified:**
- `src/components/flow/FlowCanvas.tsx`: Added keyboard shortcuts, context menu handlers
- `src/components/Helper.tsx`: Enhanced screenshot functionality

---

## Questions & Decisions

### Open Questions
1. Should we support custom edge types (one-to-many, many-to-many)?
2. What's the best default layout direction?
3. Should MiniMap be always visible or toggleable?
4. How to handle very large schemas (500+ tables)?

### Decisions Made
- Use `@xyflow/react` (latest ReactFlow)
- Use dagre for auto-layout
- Keep existing color scheme and styling
- Maintain localStorage format for compatibility

---

## Resources & References

- **ReactFlow Docs:** https://reactflow.dev/
- **Examples:** https://reactflow.dev/examples
- **Dagre Layout:** https://github.com/dagrejs/dagre
- **Current Codebase:** `/src/components/`
