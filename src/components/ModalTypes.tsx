'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useClipboard } from '@/lib/hooks';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ModalTypesProps {
  open: boolean;
  onClose: () => void;
}

export function ModalTypes({ open, onClose }: ModalTypesProps) {
  const { tables } = useStore();
  const { copy, copied } = useClipboard();

  const capitalizeFirstLetter = (text: string) => {
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const exportedCode = useMemo(() => {
    const referenceTable: { [key: string]: string } = {
      uuid: 'string',
      text: 'string',
      char: 'string',
      character: 'string',
      varchar: 'string',
      ARRAY: 'any[]',
      boolean: 'boolean',
      date: 'string',
      time: 'string',
      timestamp: 'string',
      timestamptz: 'string',
      interval: 'string',
      json: 'json',
      smallint: 'number',
      int: 'number',
      integer: 'number',
      bigint: 'number',
      float: 'number',
      float8: 'number',
    };

    const tableEntries = Object.entries(tables);
    if (tableEntries.length === 0) {
      return '';
    }

    // Map short table names (without schema) back to their full keys
    const tableLookup = new Map<string, string>();
    tableEntries.forEach(([key, value]) => {
      tableLookup.set(key, key);
      const parts = key.split('.');
      const shortName = parts[parts.length - 1];
      tableLookup.set(shortName, key);
      if (value?.title) {
        tableLookup.set(value.title, key);
      }
    });

    // Build dependency graph (table -> referenced tables)
    const dependencyMap = new Map<string, Set<string>>();
    tableEntries.forEach(([key, value]) => {
      const deps = new Set<string>();
      (value.columns ?? []).forEach((column) => {
        if (!column.fk) return;
        const fkTableRaw = column.fk.split('.')[0];
        if (!fkTableRaw) return;
        const normalizedKey = tableLookup.get(fkTableRaw);
        if (normalizedKey && normalizedKey !== key) {
          deps.add(normalizedKey);
        }
      });
      dependencyMap.set(key, deps);
    });

    // Kahn's algorithm for topological sorting with cycle fallback
    const topologicalSort = (graph: Map<string, Set<string>>) => {
      const indegree = new Map<string, number>();
      const adjacency = new Map<string, Set<string>>();

      graph.forEach((deps, node) => {
        if (!indegree.has(node)) indegree.set(node, 0);
        deps.forEach((dep) => {
          if (!graph.has(dep)) return;
          if (!adjacency.has(dep)) {
            adjacency.set(dep, new Set());
          }
          const neighbors = adjacency.get(dep)!;
          if (!neighbors.has(node)) {
            neighbors.add(node);
            indegree.set(node, (indegree.get(node) ?? 0) + 1);
          }
        });
      });

      const queue: string[] = [];
      graph.forEach((_deps, node) => {
        if ((indegree.get(node) ?? 0) === 0) {
          queue.push(node);
        }
      });

      const ordered: string[] = [];
      while (queue.length > 0) {
        const current = queue.shift()!;
        ordered.push(current);
        const neighbors = adjacency.get(current);
        if (!neighbors) continue;
        neighbors.forEach((neighbor) => {
          const nextIndegree = (indegree.get(neighbor) ?? 0) - 1;
          indegree.set(neighbor, nextIndegree);
          if (nextIndegree === 0) {
            queue.push(neighbor);
          }
        });
      }

      if (ordered.length !== graph.size) {
        const seen = new Set(ordered);
        graph.forEach((_deps, node) => {
          if (!seen.has(node)) {
            ordered.push(node);
          }
        });
      }

      return ordered;
    };

    const orderedTables = topologicalSort(dependencyMap);

    let code = '';
    orderedTables.forEach((tableKey) => {
      const table = tableKey;
      const value = tables[tableKey];
      if (!value) {
        return;
      }

      code += `interface ${capitalizeFirstLetter(table)} {\n`;
      (value.columns ?? []).forEach((column) => {
        code += `  ${column.title}`;

        if (!column.required) code += '?';
        code += ': ';

        // Handle enum types
        if (
          column.format === 'enum' &&
          column.enumValues &&
          column.enumValues.length > 0
        ) {
          const enumValues = column.enumValues.map((v) => `'${v}'`).join(' | ');
          code += enumValues;
        } else {
          code += referenceTable[column.format] || 'any // type unknown';
        }

        if (column.pk) code += '   /* primary key */';
        if (column.fk) code += `   /* foreign key to ${column.fk} */`;
        if (column.enumTypeName)
          code += `   /* enum: ${column.enumTypeName} */`;
        code += `;\n`;
      });

      (value.columns ?? [])
        .map((col) => col.fk)
        .filter((fk): fk is string => typeof fk === 'string' && fk.length > 0)
        .forEach((fk) => {
          const reference = fk.split('.')[0];
          code += `  ${reference}?: ${capitalizeFirstLetter(reference)};\n`;
        });

      code += `};\n\n`;
    });

    return code;
  }, [tables]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Export Types (for TypeScript)</DialogTitle>
            <Button onClick={() => copy(exportedCode)} size="sm">
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <DialogDescription>
            There might be some issues with the exported code. You may submit{' '}
            <a
              href="https://github.com/jacksonkasi1/tiger-sql/issues"
              target="_blank"
              className="underline hover:text-primary"
              rel="noreferrer"
            >
              issues here
            </a>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <pre className="bg-muted text-sm rounded-md p-4">{exportedCode}</pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
