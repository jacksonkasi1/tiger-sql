#!/usr/bin/env node

/**
 * Patch script for @assistant-ui/react useToolInvocations.js
 *
 * This script fixes an issue where the library throws an error when JSON property
 * order changes during streaming. Some AI providers (like Gemini) don't guarantee
 * consistent JSON property ordering between stream chunks, which causes the
 * "argsText can only be appended, not updated" error.
 *
 * The fix checks if two JSON strings are semantically equivalent (same data,
 * different property order) and handles that case gracefully.
 */

const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  '@assistant-ui',
  'react',
  'dist',
  'legacy-runtime',
  'runtime-cores',
  'assistant-transport',
  'useToolInvocations.js',
);

// Check if file exists
if (!fs.existsSync(targetFile)) {
  console.log('[patch-assistant-ui] Target file not found, skipping patch');
  process.exit(0);
}

// Read current content
let content = fs.readFileSync(targetFile, 'utf8');

// Check if already patched
if (content.includes('areJsonEquivalent')) {
  console.log('[patch-assistant-ui] Already patched, skipping');
  process.exit(0);
}

// Helper function to add after isArgsTextComplete
const helperFunction = `
// Helper to check if two JSON strings represent the same object (regardless of property order)
// Added by patch-assistant-ui.js to fix streaming with AI providers that reorder JSON properties
const areJsonEquivalent = (json1, json2) => {
    try {
        const obj1 = JSON.parse(json1);
        const obj2 = JSON.parse(json2);
        // Deep compare by normalizing to sorted JSON (handles nested objects)
        const sortKeys = (obj) => {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(sortKeys);
            return Object.keys(obj).sort().reduce((acc, key) => {
                acc[key] = sortKeys(obj[key]);
                return acc;
            }, {});
        };
        return JSON.stringify(sortKeys(obj1)) === JSON.stringify(sortKeys(obj2));
    }
    catch {
        return false;
    }
};
`;

// Find the position after isArgsTextComplete function
const insertAfterPattern =
  /const isArgsTextComplete = \(argsText\) => \{[\s\S]*?\n\};/;
const match = content.match(insertAfterPattern);

if (!match) {
  console.error(
    '[patch-assistant-ui] Could not find isArgsTextComplete function',
  );
  process.exit(1);
}

// Insert helper function after isArgsTextComplete
const insertPosition = match.index + match[0].length;
content =
  content.slice(0, insertPosition) +
  helperFunction +
  content.slice(insertPosition);

// Replace the error-throwing code with a more comprehensive fix
// The key change: when JSON is equivalent but reordered, we need to:
// 1. Update the state with the new argsText
// 2. Mark as complete if the JSON is valid
// 3. Close the controller if not already closed
// 4. Return early to avoid the delta append logic (which would fail)
const errorPattern =
  /if \(!content\.argsText\.startsWith\(lastState\.argsText\)\) \{\s*throw new Error\(`Tool call argsText can only be appended, not updated: \$\{content\.argsText\} does not start with \$\{lastState\.argsText\}`\);/;

const replacement = `if (!content.argsText.startsWith(lastState.argsText)) {
                                        // Check if both are complete JSON and semantically equivalent (handles property reordering)
                                        const bothComplete = isArgsTextComplete(content.argsText) && isArgsTextComplete(lastState.argsText);
                                        const areEquivalent = bothComplete && areJsonEquivalent(content.argsText, lastState.argsText);

                                        if (areEquivalent) {
                                            // Same JSON data, different property order - update state and skip delta append
                                            lastToolStates.current[content.toolCallId] = {
                                                argsText: content.argsText,
                                                hasResult: lastState.hasResult,
                                                argsComplete: true,
                                                controller: lastState.controller,
                                            };
                                            // Close controller if not already closed
                                            if (!lastState.argsComplete) {
                                                lastState.controller.argsText.close();
                                            }
                                            // Skip the rest of this block - don't try to append delta
                                        } else {
                                            // Not equivalent - log warning and reset to handle the new content
                                            if (process.env["NODE_ENV"] !== "production") {
                                                console.warn("[assistant-ui] argsText changed during streaming, resetting:", {
                                                    previous: lastState.argsText?.substring(0, 100),
                                                    next: content.argsText?.substring(0, 100),
                                                    bothComplete,
                                                    areEquivalent
                                                });
                                            }
                                            // Reset argsText tracking to accept the new content from the beginning
                                            // This handles cases where the stream restarts or sends corrected data
                                            lastState.argsText = "";
                                        }`;

if (!content.match(errorPattern)) {
  console.error('[patch-assistant-ui] Could not find error pattern to replace');
  process.exit(1);
}

content = content.replace(errorPattern, replacement);

// We also need to handle the control flow - add closing brace and condition for skipping
// Find where we need to add the skip logic
const deltaPattern =
  /const argsTextDelta = content\.argsText\.slice\(lastState\.argsText\.length\);/;
const deltaMatch = content.match(deltaPattern);

if (deltaMatch) {
  // Wrap the delta logic in a condition to skip when equivalent
  const deltaReplacement = `// Skip delta append if we already handled equivalent JSON above
                                    if (content.argsText.startsWith(lastState.argsText)) {
                                        const argsTextDelta = content.argsText.slice(lastState.argsText.length);`;

  content = content.replace(deltaPattern, deltaReplacement);

  // Find the closing of this block and add the closing brace
  // Look for the pattern that updates lastToolStates after shouldClose
  const closePattern =
    /lastToolStates\.current\[content\.toolCallId\] = \{\s*argsText: content\.argsText,\s*hasResult: lastState\.hasResult,\s*argsComplete: shouldClose,\s*controller: lastState\.controller,\s*\};/;

  content = content.replace(closePattern, (match) => {
    return match + '\n                                    }';
  });
}

// Write patched content
fs.writeFileSync(targetFile, content, 'utf8');

console.log('[patch-assistant-ui] Successfully patched useToolInvocations.js');
