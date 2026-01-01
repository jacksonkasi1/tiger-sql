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

interface ModalSQLProps {
  open: boolean;
  onClose: () => void;
}

export function ModalSQL({ open, onClose }: ModalSQLProps) {
  const { tables } = useStore();
  const { copy, copied } = useClipboard();

  const reservedKeyword = [
    'user',
    'database',
    'default',
    'dictionary',
    'files',
    'group',
    'index',
    'level',
    'max',
    'min',
    'password',
    'procedure',
    'table',
    'user',
    'view',
  ];

  const exportedCode = useMemo(() => {
    let code = '';
    const dependencies: any = {};

    Object.entries(tables).forEach(([table, value]) => {
      dependencies[table] = value.columns
        ?.map((v) => v.fk?.split('.')[0])
        .filter((v) => typeof v === 'string')
        .filter((v) => table != v);
    });

    let keys = Object.keys(dependencies);
    const output: string[] = [];

    while (keys.length) {
      for (let i in keys) {
        let key = keys[i];
        let d = dependencies[key];

        if (d.every((dependency: any) => output.includes(dependency))) {
          output.push(key);
          keys.splice(+i, 1);
        }
      }
    }

    output.forEach((v) => {
      if (tables[v].is_view) return;
      const table = v;
      const value = tables[v];

      code += `create table ${table} (\n`;
      value.columns?.forEach((v, i, arr) => {
        // Set title
        if (reservedKeyword.includes(v.title)) {
          code += `  "${v.title}"`;
        } else {
          code += `  ${v.title}`;
        }

        // Set data format
        if (v.format == 'integer' && v.pk) {
          code += ` serial`;
        } else {
          code += ` ${v.format}`;
        }

        // Set references
        if (v.fk)
          code += ` references ${v.fk.split('.')[0]} (${v.fk.split('.')[1]})`;

        // Set default
        if (v.format == 'date' || v.format.includes('timestamp'))
          code += ` default now()`;
        if (v.required && v.format == 'uuid' && !v.fk)
          code += ` default uuid_generate_v4()`;
        // Set not null/primary key
        else if (v.required && !v.fk) code += ` not null`;
        if (v.pk) code += ` primary key`;

        if (i == arr.length - 1) {
          code += `\n`;
        } else {
          code += `,\n`;
        }
      });
      code += `);\n\n`;
    });
    return code;
  }, [tables]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Export SQL</DialogTitle>
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
