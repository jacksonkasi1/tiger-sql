'use client';

import { useEffect, useState } from 'react';
import {
  useStore,
  hasUserClearedState,
  setUserClearedState,
  setupCrossTabSync,
  cleanupCrossTabSync,
  incrementSchemaVersion,
} from '@/lib/store';
import { useUndoRedoShortcuts } from '@/hooks/use-undo-redo';
import AES from 'crypto-js/aes';
import UTF8 from 'crypto-js/enc-utf8';
import { useRouter, usePathname } from 'next/navigation';
import { Settings } from './Settings';
import { Loading } from './Loading';
import { getSampleData } from '@/data/sampleData';
import { SchemaFilter } from './flow/SchemaFilter';
import { Button } from '@/components/ui/button';
import { Filter } from 'lucide-react';

export function RootProvider({ children }: { children: React.ReactNode }) {
  const [isFetching, setIsFetching] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSchemaFilterOpen, setIsSchemaFilterOpen] = useState(false);
  const {
    setTables,
    setSchemaView,
    setSupabaseApiKey,
    initializeFromLocalStorage,
    autoArrange,
  } = useStore();
  const router = useRouter();
  const pathname = usePathname();

  // Initialize global undo/redo keyboard shortcuts
  useUndoRedoShortcuts();

  // Initialize from localStorage on mount and set up cross-tab sync
  useEffect(() => {
    initializeFromLocalStorage();
    setupCrossTabSync();
    setIsInitialized(true);

    return () => {
      cleanupCrossTabSync();
    };
  }, [initializeFromLocalStorage]);

  // Load sample data if no tables exist after initialization
  // BUT respect the user-cleared flag to avoid "resurrecting" deleted data
  useEffect(() => {
    if (!isInitialized) return;

    const tablesData = localStorage.getItem('table-list');
    const parsedTables = tablesData ? JSON.parse(tablesData) : {};
    const userIntentionallyCleared = hasUserClearedState();

    // Load sample data ONLY if:
    // 1. No tables exist AND
    // 2. User has NOT intentionally cleared all tables
    if (!tablesData || Object.keys(parsedTables).length === 0) {
      if (userIntentionallyCleared) {
        console.log(
          '[RootProvider] Empty state detected, but user intentionally cleared tables. Not loading sample data.',
        );
        return;
      }

      console.log(
        '[RootProvider] Fresh install detected. Loading sample data.',
      );
      const sampleData = getSampleData();
      setTables(sampleData.definitions, sampleData.paths);
      // Clear the user-cleared flag since we're loading fresh data
      setUserClearedState(false);
      // Auto arrange after a short delay to ensure DOM is ready
      setTimeout(() => {
        autoArrange();
      }, 200);
    }
  }, [isInitialized, setTables, autoArrange]);

  // Handle hash changes for shared links
  useEffect(() => {
    if (!isInitialized) return;

    const handleHashChange = () => {
      const hash = window.location.hash;
      if (!hash) return;

      try {
        const encryptedText = hash.substring(1);
        const decryptedText = AES.decrypt(
          encryptedText,
          'this password doesnt matter',
        ).toString(UTF8);
        const result = JSON.parse(decryptedText);

        if (result.tables) {
          const tables = result.tables;
          const paths: { [key: string]: any } = {};
          // Reconstruct paths object for setTables
          Object.keys(tables).forEach((key) => {
            paths[`/${key}`] = { get: {} };
          });

          // Increment schema version for hash import (invalidates stale AI responses)
          incrementSchemaVersion();

          // Set tables with positions preserved
          useStore.setState({ tables: result.tables });

          // Clear user-cleared flag since we're loading tables from shared link
          if (Object.keys(result.tables).length > 0) {
            setUserClearedState(false);
          }

          console.log(
            '[RootProvider] Loaded',
            Object.keys(result.tables).length,
            'tables from shared link',
          );
        }

        if (result.schemaView) {
          setSchemaView(result.schemaView);
        }

        if (result.apikey) {
          setSupabaseApiKey(result.apikey);
        }

        // Navigate to home and clear hash
        router.push('/');
        window.history.replaceState(null, '', window.location.pathname);
      } catch (err) {
        console.error('Error decrypting shared link:', err);
      }
    };

    // Check hash on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isInitialized, setTables, setSchemaView, setSupabaseApiKey, router]);

  useEffect(() => {
    if (pathname !== '/') {
      setIsSchemaFilterOpen(false);
    }
  }, [pathname, setIsSchemaFilterOpen]);

  useEffect(() => {
    if (!isSchemaFilterOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSchemaFilterOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSchemaFilterOpen]);

  if (!isInitialized) {
    return <Loading />;
  }

  return (
    <>
      {children}
      {pathname === '/' ? (
        <div className="fixed top-5 right-5 z-50 flex items-start gap-3 pointer-events-none">
          {isSchemaFilterOpen && (
            <SchemaFilter
              className="pointer-events-auto"
              onClose={() => setIsSchemaFilterOpen(false)}
            />
          )}
          <div className="pointer-events-auto flex flex-col gap-2">
            <Button
              variant="outline"
              size="icon"
              title={
                isSchemaFilterOpen ? 'Hide schema filter' : 'Show schema filter'
              }
              onClick={() => setIsSchemaFilterOpen((open) => !open)}
              className={
                isSchemaFilterOpen ? 'bg-primary text-primary-foreground' : ''
              }
            >
              <Filter size={20} />
            </Button>
            <Settings
              isFetching={isFetching}
              setIsFetching={setIsFetching}
              variant="toolbar"
            />
          </div>
        </div>
      ) : (
        <Settings
          isFetching={isFetching}
          setIsFetching={setIsFetching}
          variant="floating"
        />
      )}
      {isFetching && <Loading />}
    </>
  );
}
