'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useClipboard } from '@/lib/hooks';
import { downloadSQLSchema } from '@/lib/sql-exporter';
import { toPng } from 'html-to-image';
import {
  Share2,
  FileType,
  Database,
  Camera,
  Sparkles,
  Target,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ModalTypes } from './ModalTypes';
import { HelperZoom } from './HelperZoom';
import { UndoRedoButtons } from './UndoRedoButtons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import AES from 'crypto-js/aes';

interface HelperProps {
  onChatOpen?: () => void;
  isChatOpen?: boolean;
}

export function Helper({ onChatOpen, isChatOpen = false }: HelperProps) {
  const { tables, schemaView, supabaseApiKey, triggerLayout, triggerFitView } =
    useStore();
  const { copy, copied } = useClipboard();
  const [exportTypes, setExportTypes] = useState(false);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(true);

  const handleAutoArrange = () => {
    triggerLayout();
  };

  const handleFitView = () => {
    triggerFitView();
  };

  const handleExportSQL = () => {
    try {
      const tableCount = Object.keys(tables).length;

      if (tableCount === 0) {
        toast.error('No tables to export', {
          description: 'Please import or create a schema first',
        });
        return;
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `schema_${timestamp}.sql`;

      downloadSQLSchema(tables, filename);

      toast.success('SQL schema exported successfully', {
        description: `Downloaded ${filename}`,
      });
    } catch (error) {
      console.error('Error exporting SQL:', error);
      toast.error('Failed to export SQL schema', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const screenshot = () => {
    // Target the ReactFlow viewport (the part with nodes and edges)
    const el = document.querySelector('.react-flow__viewport') as HTMLElement;

    if (!el) {
      console.error('ReactFlow viewport not found');
      return;
    }

    // Get the parent react-flow element for background color
    const reactFlowEl = document.querySelector('.react-flow') as HTMLElement;
    const isDarkMode = reactFlowEl?.classList.contains('dark:bg-dark-900');

    toPng(el, {
      skipFonts: true,
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
      // Include all child nodes
      filter: (node) => {
        // Exclude minimap and controls from screenshot
        return (
          !node.classList?.contains('react-flow__minimap') &&
          !node.classList?.contains('react-flow__controls')
        );
      },
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = 'Tiger SQL.png';
        link.href = dataUrl;
        link.click();
      })
      .catch((error) => {
        console.error('Error taking screenshot:', error);

        // Fallback: capture the entire ReactFlow container
        if (reactFlowEl) {
          toPng(reactFlowEl, {
            skipFonts: true,
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
          })
            .then((dataUrl) => {
              const link = document.createElement('a');
              link.download = 'Tiger SQL.png';
              link.href = dataUrl;
              link.click();
            })
            .catch((err) => {
              console.error('Fallback screenshot also failed:', err);
            });
        }
      });
  };

  const shareLink = () => {
    const encrypted = AES.encrypt(
      JSON.stringify({
        apikey: supabaseApiKey,
        schemaView: schemaView,
        tables: tables,
      }),
      'this password doesnt matter',
    ).toString();

    const url = new URL(window.location.href);
    url.hash = encrypted;
    copy(url.toString());
  };

  return (
    <>
      <div
        className={cn(
          'fixed right-5 bottom-5 z-40 flex items-center space-x-2',
          'transition-all duration-300 ease-in-out',
          isChatOpen ? 'mr-[420px]' : 'mr-0',
        )}
      >
        {/* Toggle toolbar visibility button */}
        <Button
          variant="outline"
          size="icon"
          title={isToolbarExpanded ? 'Hide toolbar' : 'Show toolbar'}
          onClick={() => setIsToolbarExpanded(!isToolbarExpanded)}
        >
          {isToolbarExpanded ? (
            <ChevronRight size={20} />
          ) : (
            <ChevronLeft size={20} />
          )}
        </Button>

        {/* All other buttons - shown only when expanded */}
        {isToolbarExpanded && (
          <>
            {/* Undo/Redo buttons */}
            <UndoRedoButtons />

            <Button
              variant="outline"
              size="icon"
              title={copied ? 'Copied' : 'Share link'}
              onClick={shareLink}
              className={copied ? 'bg-primary text-primary-foreground' : ''}
            >
              <Share2 size={20} />
            </Button>

            <Button
              variant="outline"
              size="icon"
              title="Export Types"
              onClick={() => setExportTypes(true)}
            >
              <FileType size={20} />
            </Button>

            <Button
              variant="outline"
              size="icon"
              title="Export SQL"
              onClick={handleExportSQL}
            >
              <Database size={20} />
            </Button>

            <Button
              variant="outline"
              size="icon"
              title="Take a screenshot"
              onClick={screenshot}
            >
              <Camera size={20} />
            </Button>

            <Button
              variant="outline"
              size="icon"
              title="Auto arrange"
              onClick={handleAutoArrange}
            >
              <Sparkles size={20} />
            </Button>

            <Button
              variant="outline"
              size="icon"
              title="Fit view"
              onClick={handleFitView}
            >
              <Target size={20} />
            </Button>

            {onChatOpen && (
              <Button
                variant="outline"
                size="icon"
                title="Open SQL AI Chat"
                onClick={onChatOpen}
              >
                <MessageSquare size={20} />
              </Button>
            )}

            <HelperZoom />
          </>
        )}
      </div>

      <ModalTypes open={exportTypes} onClose={() => setExportTypes(false)} />
    </>
  );
}
