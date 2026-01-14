'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { parseSQLSchemaAsync } from '@/lib/sql-parser';
import {
  validateSchemaJSON,
  extractImportData,
  detectFileType,
} from '@/lib/json-schema-io';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

interface ImportSQLProps {
  open: boolean;
  onClose: () => void;
}

export function ImportSQL({ open, onClose }: ImportSQLProps) {
  const {
    tables,
    setTables,
    triggerLayout,
    triggerFitView,
  } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'sql' | 'json' | 'unknown'>('unknown');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    definition: any;
    paths: any;
    tableCount: number;
  } | null>(null);
  const [parseResult, setParseResult] = useState<{
    success: boolean;
    message: string;
    tableCount?: number;
  } | null>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setFileType('unknown');
    setParseResult(null);
    setIsDragging(false);
    setShowOverwriteConfirm(false);
    setPendingImport(null);
  }, []);

  const performImport = useCallback(
    (definition: any, paths: any, tableCount: number) => {
      console.log('[Import] Starting import process...');

      // Close dialog FIRST to unblock UI - this must happen synchronously
      setIsProcessing(false);
      onClose();
      resetState();

      // Show success message immediately
      toast.success(
        `Imported ${tableCount} table${tableCount > 1 ? 's' : ''} successfully`
      );

      // Use double requestAnimationFrame to ensure dialog has closed and rendered
      // before doing heavy work
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          console.log('[Import] Setting tables...');
          setTables(definition, paths);
          console.log('[Import] Tables set');

          // Schedule layout after React has processed the table update
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              console.log('[Import] Triggering layout...');
              triggerLayout();

              // Schedule fit view after layout completes
              setTimeout(() => {
                console.log('[Import] Fitting view...');
                triggerFitView();
              }, 800);
            });
          });
        });
      });

      console.log('[Import] ✅ Import complete!');
    },
    [setTables, triggerLayout, triggerFitView, onClose, resetState]
  );

  const handleCancelOverwrite = useCallback(() => {
    setShowOverwriteConfirm(false);
    setPendingImport(null);
    setIsProcessing(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const sqlFile = files.find(
      (f) =>
        f.name.endsWith('.sql') ||
        f.name.endsWith('.json') ||
        f.type === 'application/sql' ||
        f.type === 'application/json' ||
        f.type === 'text/plain'
    );

    if (sqlFile) {
      setFile(sqlFile);
      setFileType(detectFileType(sqlFile.name));
      setParseResult(null);
    } else {
      toast.error('Please upload a valid schema file (.sql or .json)');
    }
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target;
      if (files && files.length > 0) {
        const selectedFile = files[0];
        setFile(selectedFile);
        setFileType(detectFileType(selectedFile.name));
        setParseResult(null);
      }
    },
    []
  );

  const handleImport = useCallback(async () => {
    if (!file) return;

    setIsProcessing(true);
    setParseResult(null);

    try {
      const text = await file.text();

      // Handle JSON import
      if (fileType === 'json') {
        console.log('[Import] Starting JSON validation...');
        const validationResult = validateSchemaJSON(text);

        if (!validationResult.valid) {
          setParseResult({
            success: false,
            message: `Invalid JSON: ${validationResult.errors.join(', ')}`,
          });
          toast.error('Invalid JSON schema file');
          setIsProcessing(false);
          return;
        }

        if (!validationResult.data) {
          setParseResult({
            success: false,
            message: 'Failed to extract data from JSON file',
          });
          toast.error('Failed to parse JSON');
          setIsProcessing(false);
          return;
        }

        // Show warnings if any
        if (validationResult.warnings.length > 0) {
          validationResult.warnings.forEach((warning) => {
            toast.warning(warning);
          });
        }

        const importData = extractImportData(validationResult.data);
        console.log('[Import] JSON parsed, found', importData.tableCount, 'tables');

        // Check for existing schema
        const hasExistingSchema = Object.keys(tables).length > 0;

        if (hasExistingSchema) {
          // Store pending JSON import for confirmation
          setPendingImport({
            definition: importData.tables,
            paths: {},
            tableCount: importData.tableCount,
            // Additional JSON-specific data stored in closure
            _jsonData: importData,
          } as any);
          setShowOverwriteConfirm(true);
          setIsProcessing(false);
          return;
        }

        // No existing schema, import directly
        performJSONImport(importData);
        return;
      }

      // Parse the SQL schema ASYNCHRONOUSLY (non-blocking!)
      console.log('[Import] Starting async SQL parsing...');
      const parsedTables = await parseSQLSchemaAsync(text);
      const tableCount = Object.keys(parsedTables).length;
      console.log('[Import] Parsing complete, found', tableCount, 'tables');

      if (tableCount === 0) {
        setParseResult({
          success: false,
          message:
            'No tables found in the SQL file. Please check the file format.',
        });
        toast.error('No tables found in SQL file');
        setIsProcessing(false);
        return;
      }

      // Apply to store
      // Convert to the format expected by setTables
      const definition: any = {};
      const paths: any = {};

      Object.entries(parsedTables).forEach(([name, table]) => {
        // Build definition object
        const properties: any = {};
        const required: string[] = [];

        table.columns?.forEach((col) => {
          properties[col.title] = {
            type: col.type,
            format: col.format,
            default: col.default,
            enumTypeName: col.enumTypeName,
            enumValues: col.enumValues,
            description: col.pk
              ? '<pk/>'
              : col.fk
                ? `\`${col.fk}\``
                : undefined,
          };

          if (col.required) {
            required.push(col.title);
          }
        });

        definition[name] = {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        };

        // Set up paths for views
        if (table.is_view) {
          paths[`/${name}`] = { get: {} };
        }
      });

      // Check if schema already exists in the store
      const hasExistingSchema = Object.keys(tables).length > 0;

      if (hasExistingSchema) {
        // Show confirmation dialog
        setPendingImport({ definition, paths, tableCount });
        setShowOverwriteConfirm(true);
        setIsProcessing(false);
        return;
      }

      // No existing schema, import directly
      performImport(definition, paths, tableCount);
    } catch (error) {
      console.error('Error parsing SQL file:', error);
      setParseResult({
        success: false,
        message: `Error parsing SQL file: ${error instanceof Error ? error.message : 'Unknown error'
          }`,
      });
      toast.error('Failed to parse SQL file');
      setIsProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, fileType, tables, performImport]);

  // Perform JSON import directly to store
  const performJSONImport = useCallback(
    (importData: ReturnType<typeof extractImportData>) => {
      console.log('[Import] Starting JSON import...');

      // Close dialog FIRST to unblock UI
      setIsProcessing(false);
      onClose();
      resetState();

      toast.success(
        `Imported ${importData.tableCount} table${importData.tableCount > 1 ? 's' : ''} from JSON`
      );

      // Apply import in next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Set tables directly (without going through setTables transformation)
          useStore.setState({
            tables: importData.tables,
            enumTypes: importData.enumTypes,
            edgeRelationships: importData.edgeRelationships,
            visibleSchemas: importData.visibleSchemas,
            collapsedSchemas: importData.collapsedSchemas,
          });

          // Save to localStorage
          useStore.getState().saveToLocalStorage();

          console.log('[Import] JSON import applied');

          // Schedule layout and fit view
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              triggerLayout();
              setTimeout(() => {
                triggerFitView();
              }, 800);
            });
          });
        });
      });
    },
    [onClose, resetState, triggerLayout, triggerFitView]
  );

  // Update handleConfirmOverwrite to handle JSON imports
  const handleConfirmOverwriteWithJSON = useCallback(() => {
    if (pendingImport) {
      setShowOverwriteConfirm(false);
      setIsProcessing(true);

      // Check if this is a JSON import (has _jsonData)
      if ((pendingImport as any)._jsonData) {
        performJSONImport((pendingImport as any)._jsonData);
      } else {
        performImport(
          pendingImport.definition,
          pendingImport.paths,
          pendingImport.tableCount
        );
      }
    }
  }, [pendingImport, performImport, performJSONImport]);

  const handleClose = useCallback(() => {
    if (!isProcessing) {
      resetState();
      onClose();
    }
  }, [isProcessing, resetState, onClose]);

  // Cleanup on unmount - release file references
  useEffect(() => {
    return () => {
      // Clear any pending file references
      setFile(null);
      setPendingImport(null);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Schema</DialogTitle>
          <DialogDescription>
            Upload a PostgreSQL schema file (.sql) or JSON export (.json) to
            visualize your database structure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Drag and Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-lg p-8
              transition-colors duration-200 ease-in-out
              ${isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              }
              ${file ? 'bg-muted/50' : ''}
            `}
          >
            <input
              type="file"
              id="sql-file-input"
              accept=".sql,.json,text/plain,application/sql,application/json"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isProcessing}
            />

            <div className="flex flex-col items-center justify-center text-center space-y-3">
              {file ? (
                <>
                  <FileText className="w-12 h-12 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetState();
                    }}
                    disabled={isProcessing}
                  >
                    Change File
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      Drag & drop your SQL file here
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      or click to browse
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supports .sql and .json files
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Parse Result */}
          {parseResult && (
            <div
              className={`
                flex items-start space-x-2 p-4 rounded-lg
                ${parseResult.success
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-red-500/10 text-red-700 dark:text-red-400'
                }
              `}
            >
              {parseResult.success ? (
                <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              )}
              <p className="text-sm">{parseResult.message}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!file || isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Schema
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Overwrite Confirmation Dialog */}
      <Dialog
        open={showOverwriteConfirm}
        onOpenChange={setShowOverwriteConfirm}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-500" />
              <DialogTitle>Overwrite Existing Schema?</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              You currently have{' '}
              <strong>
                {Object.keys(tables).length} table
                {Object.keys(tables).length !== 1 ? 's' : ''}
              </strong>{' '}
              in your schema. Importing this SQL file will{' '}
              <strong>replace all existing tables</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {pendingImport && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm">
                  <strong>New schema:</strong> {pendingImport.tableCount} table
                  {pendingImport.tableCount !== 1 ? 's' : ''} will be imported
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={handleCancelOverwrite}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmOverwriteWithJSON}>
                Overwrite Schema
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
