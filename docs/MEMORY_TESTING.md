# Memory Leak Testing Guide

This guide explains how to detect and fix memory leaks in the Tiger SQL Visualizer using multiple tools.

## 🔧 Tools Overview

We use three complementary tools for memory leak detection:

1. **Chrome DevTools** - Real-time heap monitoring, manual profiling
2. **Built-in Memory Monitor** - Runtime monitoring with growth rate tracking
3. **MemLab** - Automated leak detection, CI/CD integration

---

## 1. Chrome DevTools (Real-time Monitoring)

### Setup
1. Open Chrome DevTools (F12)
2. Go to **Performance Monitor** tab
   - If not visible: More tools → Performance Monitor
3. Check "JS heap size"

### Quick Test
```bash
# Start dev server
npm run dev

# Open http://localhost:3000
# Watch JS heap size in Performance Monitor

# Expected results:
# - Initial load: 30-50 MB
# - After importing 100 tables: 50-80 MB
# - After 30 seconds: Growth < 1 MB/sec
```

### Memory Profiling
1. Go to **Memory** tab in DevTools
2. Click "Take snapshot"
3. Perform actions (import SQL, drag nodes, etc.)
4. Click "Take snapshot" again
5. Compare snapshots:
   - Look for "Detached DOM tree" entries
   - Check for increasing object counts
   - Identify growing arrays/objects

### Heap Snapshot Analysis
- **Detached DOM trees**: Indicates DOM nodes not properly cleaned up
- **Strings**: Large string accumulation might indicate localStorage issues
- **Arrays**: Growing arrays suggest event listeners or state not being cleared
- **Closures**: Can hold references to large objects

---

## 2. Built-in Memory Monitor (Runtime Monitoring)

### Usage

Open the app and run in DevTools console:

```javascript
// Start monitoring (logs every 1 second)
window.memoryMonitor.start()

// Perform actions...
// Import SQL, drag nodes, interact with UI

// Stop and see summary
window.memoryMonitor.stop()

// Check localStorage usage
window.memoryMonitor.logLocalStorage()

// Force garbage collection (requires --expose-gc flag)
window.memoryMonitor.forceGC()
```

### Running Chrome with GC Exposure

```bash
# macOS/Linux
chrome --expose-gc --js-flags="--max-old-space-size=4096" http://localhost:3000

# Windows
chrome.exe --expose-gc --js-flags="--max-old-space-size=4096" http://localhost:3000
```

### Interpreting Results

```
[Memory Summary]
  Duration: 30.0s
  Initial: 45.23MB
  Final: 48.76MB
  Peak: 52.11MB
  Growth: 3.53MB
  Rate: 0.12MB/sec    ← Should be < 0.5 MB/sec
```

**Good**:
- Growth rate < 0.5 MB/sec
- Peak < 100 MB
- Stable after GC

**Bad**:
- Growth rate > 1 MB/sec (indicates leak)
- Peak > 200 MB (excessive memory usage)
- Growth continues linearly (no GC cleanup)

---

## 3. MemLab (Automated Leak Detection)

### Installation

```bash
npm install -g memlab
```

### Running Tests

```bash
# Start dev server first
npm run dev

# In another terminal:

# Test 1: SQL Import Flow
memlab run --scenario memlab-tests/import-sql.js

# Test 2: Node Interactions
memlab run --scenario memlab-tests/node-interaction.js

# Test 3: Cache Operations
memlab run --scenario memlab-tests/cache-operations.js

# Run all tests
memlab run --scenario memlab-tests/*.js
```

### Understanding MemLab Output

```
[MemLab] Analyzing heap...
[MemLab] Leaked objects: 5
[MemLab] Total leaked size: 2.34 MB

Leaks detected:
  1. Detached HTMLDivElement (1.2 MB)
     - Retained by: EventListener in FlowCanvas
     - Path: window -> FlowCanvas -> handleKeyDown -> div

  2. Array[1000] (0.8 MB)
     - Retained by: Closure in ImportSQL
     - Path: window -> ImportSQL -> pendingImport -> tables
```

### Analyzing Leak Reports

MemLab creates reports in `.memlab/` directory:

```bash
# View leak traces
cat .memlab/leak-traces.json

# View heap snapshots
ls .memlab/data/cur-run/*.heapsnapshot

# Open in Chrome DevTools
# DevTools → Memory → Load → Select .heapsnapshot file
```

---

## 🎯 Common Memory Leak Patterns

### 1. Event Listeners Not Removed

**Bad**:
```javascript
useEffect(() => {
  window.addEventListener('keydown', handleKeyDown);
  // ❌ No cleanup!
}, []);
```

**Good**:
```javascript
useEffect(() => {
  window.addEventListener('keydown', handleKeyDown);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}, []);
```

### 2. Timers Not Cleared

**Bad**:
```javascript
useEffect(() => {
  const interval = setInterval(() => {...}, 1000);
  // ❌ No cleanup!
}, []);
```

**Good**:
```javascript
useEffect(() => {
  const interval = setInterval(() => {...}, 1000);
  return () => clearInterval(interval);
}, []);
```

### 3. Detached DOM Nodes

**Bad**:
```javascript
const [nodes, setNodes] = useState([]);

// Creating new arrays on every render
return nodes.map(node => <Node key={node.id} data={node} />);
```

**Good**:
```javascript
const [nodes, setNodes] = useState([]);

// Memoize to prevent recreation
const nodeElements = useMemo(() =>
  nodes.map(node => <Node key={node.id} data={node} />),
  [nodes]
);
```

### 4. Closure Holding Large Objects

**Bad**:
```javascript
const handleClick = () => {
  // ❌ Captures entire tables object
  console.log(tables);
};
```

**Good**:
```javascript
const handleClick = useCallback(() => {
  // ✅ Only captures count
  console.log(Object.keys(tables).length);
}, [tables.length]);
```

---

## 🧪 Testing Workflow

### Before Fixing
1. **Baseline measurement**:
   ```bash
   npm run dev
   window.memoryMonitor.start()
   # Interact with app for 60 seconds
   window.memoryMonitor.stop()
   # Note: Growth rate, peak usage
   ```

2. **MemLab detection**:
   ```bash
   memlab run --scenario memlab-tests/*.js
   # Note: Number of leaks, total size
   ```

### After Fixing
1. Repeat baseline measurement
2. Compare results:
   - Growth rate should decrease
   - Peak usage should be lower
   - MemLab should report fewer leaks

### Continuous Monitoring
Add to CI/CD:

```yaml
# .github/workflows/memory-test.yml
name: Memory Leak Tests

on: [push, pull_request]

jobs:
  memlab:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Start server
        run: npm run start &
      - name: Wait for server
        run: npx wait-on http://localhost:3000
      - name: Run MemLab tests
        run: |
          npm install -g memlab
          memlab run --scenario memlab-tests/*.js
      - name: Check for leaks
        run: |
          if grep -q "Leaked objects: [1-9]" .memlab/report.txt; then
            echo "Memory leaks detected!"
            exit 1
          fi
```

---

## 📊 Performance Benchmarks

### Target Metrics

| Metric | Target | Acceptable | Poor |
|--------|--------|------------|------|
| Initial Load | < 50 MB | < 80 MB | > 100 MB |
| After Import (100 tables) | < 80 MB | < 120 MB | > 150 MB |
| Growth Rate | < 0.5 MB/s | < 1 MB/s | > 2 MB/s |
| localStorage Size | < 2 MB | < 5 MB | > 10 MB |
| MemLab Leaks | 0 | < 3 | > 5 |

### Real-World Scenarios

#### Scenario 1: Small Schema (20 tables)
- Initial: 35 MB
- After import: 45 MB
- Growth: 0.2 MB/s
- MemLab: 0 leaks

#### Scenario 2: Medium Schema (100 tables)
- Initial: 35 MB
- After import: 65 MB
- Growth: 0.4 MB/s
- MemLab: 0 leaks

#### Scenario 3: Large Schema (500+ tables)
- Initial: 35 MB
- After import: 120 MB
- Growth: 0.6 MB/s
- MemLab: 1-2 minor leaks acceptable

---

## 🚨 Troubleshooting

### "120 MB on initial load"
**Cause**: Corrupted localStorage or large cached data

**Fix**:
```javascript
// In DevTools console:
localStorage.clear()
location.reload()

// Or use Clear Cache button in app
```

### "App hangs after import"
**Cause**: Synchronous blocking operations

**Check**:
- Is import wrapped in `requestAnimationFrame`?
- Are large operations debounced?
- Is localStorage write debounced?

### "Memory keeps growing"
**Cause**: Event listeners or timers not cleaned up

**Debug**:
```javascript
// In DevTools console:
// Count event listeners
getEventListeners(window)
getEventListeners(document)

// Check for intervals
// (These show in Performance tab → Call Tree)
```

### "Detached DOM trees"
**Cause**: React components holding references to removed DOM nodes

**Debug**:
1. Take heap snapshot
2. Search for "Detached"
3. Check "Retained by" path
4. Add cleanup to those components

---

## 📚 Additional Resources

- [Chrome DevTools Memory Profiling](https://developer.chrome.com/docs/devtools/memory-problems/)
- [MemLab Documentation](https://facebook.github.io/memlab/)
- [React Memory Leaks Guide](https://react.dev/learn/escape-hatches#cleanup-functions)
- [JavaScript Memory Management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management)

---

## 🎯 Quick Checklist

Before deploying:
- [ ] Initial load < 80 MB
- [ ] Growth rate < 0.5 MB/s
- [ ] localStorage < 5 MB
- [ ] MemLab reports 0 leaks
- [ ] No detached DOM trees in heap snapshot
- [ ] All useEffects have cleanup functions
- [ ] All event listeners are removed
- [ ] No setInterval/setTimeout without cleanup
