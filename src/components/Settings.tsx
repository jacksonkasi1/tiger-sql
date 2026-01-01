'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useLocalStorage } from '@/lib/hooks';
import { useTheme } from '@/components/theme-provider';
import {
  Github,
  Network,
  Settings as SettingsIcon,
  Moon,
  Sun,
  RefreshCw,
  Plus,
  Trash2,
  X as XIcon,
  Lock,
  Unlock,
} from 'lucide-react';
import Image from 'next/image';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface SettingsProps {
  isFetching: boolean;
  setIsFetching: (isFetching: boolean) => void;
  variant?: 'floating' | 'toolbar';
  className?: string;
}

interface Model {
  id: string;
  name: string;
  enabled?: boolean;
}

export function Settings({
  isFetching: _isFetching,
  setIsFetching,
  variant = 'floating',
  className,
}: SettingsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    supabaseApiKey,
    setSupabaseApiKey,
    setTables,
    autoArrange,
    connectionMode,
    setConnectionMode,
  } = useStore();
  const [url, setUrl] = useState(supabaseApiKey.url);
  const [anon, setAnon] = useState(supabaseApiKey.anon);
  const [connectionString, setConnectionString] = useState('');
  const [importSource, setImportSource] = useState<'supabase' | 'postgres'>(
    'supabase',
  );
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [, setDefinitions] = useLocalStorage<any>('definitions', {});

  const [aiProvider, setAiProvider] = useLocalStorage<'openai' | 'google'>(
    'ai-provider',
    'openai',
  );
  const [openaiApiKey, setOpenaiApiKey] = useLocalStorage<string>(
    'ai-openai-key',
    '',
  );

  const [googleApiKey, setGoogleApiKey] = useLocalStorage<string>(
    'ai-google-key',
    '',
  );

  // Model lists
  const [openaiModels, setOpenaiModels] = useLocalStorage<Model[]>(
    'ai-openai-models',
    [],
  );
  const [googleModels, setGoogleModels] = useLocalStorage<Model[]>(
    'ai-google-models',
    [],
  );
  const [customOpenaiModels, setCustomOpenaiModels] = useLocalStorage<string[]>(
    'ai-custom-openai-models',
    [],
  );
  const [customGoogleModels, setCustomGoogleModels] = useLocalStorage<string[]>(
    'ai-custom-google-models',
    [],
  );

  // Max steps for AI agent (user-configurable, default 50)
  const [maxSteps, setMaxSteps] = useLocalStorage<number>('ai-max-steps', 50);

  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');

  const { setTheme, isDark } = useTheme();

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  // Update local state when store changes
  useEffect(() => {
    setUrl(supabaseApiKey.url);
    setAnon(supabaseApiKey.anon);
  }, [supabaseApiKey]);

  const applySchema = (
    definitions: any,
    paths: any,
    shouldAutoArrange = true,
  ) => {
    setDefinitions(definitions);
    setTables(definitions, paths || {});
    if (shouldAutoArrange) {
      setTimeout(() => {
        autoArrange();
      }, 0);
    }
    setOpen(false);
  };

  const fetchSupabaseSchema = async () => {
    if (!url || !anon) return;

    setIsFetching(true);
    setError('');

    try {
      const res = await fetch(`${url}/rest/v1/?apikey=${anon}`);

      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (
          contentType &&
          contentType.indexOf('application/openapi+json') !== -1
        ) {
          const data = await res.json();
          if (data?.definitions) {
            const lastUrlChanged = supabaseApiKey.last_url !== url;
            setSupabaseApiKey({ url, anon, last_url: url });
            applySchema(data.definitions, data.paths, lastUrlChanged);
          }
        } else {
          setError('Invalid link');
        }
      } else {
        setError('Error with fetching data');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsFetching(false);
    }
  };

  const fetchPostgresSchema = async () => {
    if (!connectionString) {
      setError('Connection string is required');
      return;
    }

    setIsFetching(true);
    setError('');

    try {
      const res = await fetch('/api/schema/postgres', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ connectionString }),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to fetch schema');
      }

      const data = await res.json();

      if (!data?.definitions) {
        throw new Error('Schema response missing definitions');
      }

      applySchema(data.definitions, data.paths);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsFetching(false);
    }
  };

  const fetchModels = async (provider: 'openai' | 'google') => {
    const apiKey = provider === 'openai' ? openaiApiKey : googleApiKey;
    if (!apiKey) {
      toast.error(
        `Please enter a ${provider === 'openai' ? 'OpenAI' : 'Google'} API Key first.`,
      );
      return;
    }

    setIsFetchingModels(true);
    try {
      const res = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch models');
      }

      const data = await res.json();
      const modelsWithEnabled = data.models.map((m: any) => ({
        ...m,
        enabled: true,
      }));

      if (provider === 'openai') {
        setOpenaiModels(modelsWithEnabled);
        toast.success(`Fetched ${data.models.length} OpenAI models`);
      } else {
        setGoogleModels(modelsWithEnabled);
        toast.success(`Fetched ${data.models.length} Gemini models`);
      }
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to fetch models',
      );
    } finally {
      setIsFetchingModels(false);
    }
  };

  const toggleModel = (provider: 'openai' | 'google', modelId: string) => {
    if (provider === 'openai') {
      setOpenaiModels(
        openaiModels.map((m) =>
          m.id === modelId ? { ...m, enabled: !m.enabled } : m,
        ),
      );
    } else {
      setGoogleModels(
        googleModels.map((m) =>
          m.id === modelId ? { ...m, enabled: !m.enabled } : m,
        ),
      );
    }
  };

  const deleteModel = (provider: 'openai' | 'google', modelId: string) => {
    if (provider === 'openai') {
      setOpenaiModels(openaiModels.filter((m) => m.id !== modelId));
    } else {
      setGoogleModels(googleModels.filter((m) => m.id !== modelId));
    }
  };

  const addCustomModel = (provider: 'openai' | 'google') => {
    if (!customModelInput.trim()) return;

    if (provider === 'openai') {
      if (!customOpenaiModels.includes(customModelInput)) {
        setCustomOpenaiModels([...customOpenaiModels, customModelInput]);
        toast.success(`Added custom model: ${customModelInput}`);
      }
    } else {
      if (!customGoogleModels.includes(customModelInput)) {
        setCustomGoogleModels([...customGoogleModels, customModelInput]);
        toast.success(`Added custom model: ${customModelInput}`);
      }
    }
    setCustomModelInput('');
  };

  const removeCustomModel = (provider: 'openai' | 'google', model: string) => {
    if (provider === 'openai') {
      setCustomOpenaiModels(customOpenaiModels.filter((m) => m !== model));
    } else {
      setCustomGoogleModels(customGoogleModels.filter((m) => m !== model));
    }
  };

  const isToolbarVariant = variant === 'toolbar';

  const containerClasses = cn(
    isToolbarVariant
      ? 'flex flex-col gap-2'
      : 'fixed right-5 top-5 z-50 flex flex-col gap-2',
    'pointer-events-auto',
    className,
  );

  const renderModelList = (models: Model[], provider: 'openai' | 'google') => (
    <div className="flex flex-col gap-1">
      {models.map((m) => {
        const switchId = `${provider}-${m.id}`;
        return (
          <div
            key={m.id}
            className="flex items-center justify-between group rounded-md border border-transparent hover:border-border hover:bg-muted/50 px-2 py-1 transition-colors"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <Switch
                id={switchId}
                size="sm"
                checked={m.enabled !== false}
                onCheckedChange={() => toggleModel(provider, m.id)}
              />
              <Label
                htmlFor={switchId}
                className={cn(
                  'text-xs truncate cursor-pointer',
                  m.enabled === false &&
                    'text-muted-foreground line-through opacity-70',
                )}
              >
                {m.name}
              </Label>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              onClick={() => deleteModel(provider, m.id)}
              title="Delete model (until refresh)"
            >
              <Trash2 size={12} />
            </Button>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className={containerClasses}>
        <Button
          variant="outline"
          size="icon"
          title="Schema"
          onClick={() => router.push('/')}
          className={
            pathname === '/' ? 'bg-primary text-primary-foreground' : ''
          }
        >
          <Network size={20} />
        </Button>

        {isToolbarVariant && (
          <Button
            variant="outline"
            size="icon"
            title={
              connectionMode === 'flexible'
                ? 'Flexible Mode: Any column can connect to any column. Click to switch to Strict Mode.'
                : 'Strict Mode: Only type-compatible columns can connect. Click to switch to Flexible Mode.'
            }
            onClick={() =>
              setConnectionMode(
                connectionMode === 'flexible' ? 'strict' : 'flexible',
              )
            }
            className={`p-2 rounded-lg border transition-all shadow-sm hover:shadow-md ${
              connectionMode === 'flexible'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400'
            }`}
          >
            {connectionMode === 'flexible' ? (
              <Unlock size={18} />
            ) : (
              <Lock size={18} />
            )}
          </Button>
        )}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" title="Settings">
              <SettingsIcon size={20} />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
            <SheetHeader>
              <div className="w-full flex justify-center mb-4">
                <Image
                  src="/logo.svg"
                  width={128}
                  height={128}
                  alt="Tiger SQL Logo"
                />
              </div>
              <SheetTitle className="text-3xl font-bold bg-gradient-to-r from-green-500 to-green-400 bg-clip-text text-transparent">
                Tiger SQL
              </SheetTitle>
              <SheetDescription>Open Source • LocalStorage</SheetDescription>
            </SheetHeader>

            <div className="flex items-center justify-center gap-4 mt-2">
              <a
                href="https://github.com/jacksonkasi1/tiger-sql"
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github size={20} />
              </a>
            </div>

            <div className="mt-6 space-y-2">
              <h3 className="font-semibold text-sm uppercase mb-2">
                Import Source
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={importSource === 'supabase' ? 'default' : 'outline'}
                  onClick={() => {
                    setImportSource('supabase');
                    setError('');
                  }}
                >
                  Supabase OpenAPI
                </Button>
                <Button
                  type="button"
                  variant={importSource === 'postgres' ? 'default' : 'outline'}
                  onClick={() => {
                    setImportSource('postgres');
                    setError('');
                  }}
                >
                  Postgres Connection
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <h3 className="font-semibold text-sm uppercase mb-2">Steps</h3>
                {importSource === 'supabase' ? (
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>
                      Obtain OpenAPI URL following instruction{' '}
                      <a
                        className="underline hover:text-primary"
                        target="_blank"
                        href="https://github.com/jacksonkasi1/tiger-sql#-instructions"
                        rel="noreferrer"
                      >
                        here
                      </a>
                    </li>
                    <li>Paste the URL and anon key below</li>
                    <li>Enjoy Tiger SQL</li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Provide a valid Postgres connection string</li>
                    <li>Click Fetch Schema to introspect tables and views</li>
                    <li>Review the imported structure in the editor</li>
                  </ol>
                )}
              </div>

              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (importSource === 'supabase') {
                    fetchSupabaseSchema();
                  } else {
                    fetchPostgresSchema();
                  }
                }}
              >
                {importSource === 'supabase' ? (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="url" className="text-sm font-medium">
                        URL
                      </label>
                      <Input
                        id="url"
                        type="text"
                        name="url"
                        placeholder="https://your-project.supabase.co"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="anon" className="text-sm font-medium">
                        API KEY
                      </label>
                      <Input
                        id="anon"
                        type="text"
                        name="anon"
                        placeholder="your-anon-key"
                        value={anon}
                        onChange={(e) => setAnon(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <label
                      htmlFor="connection-string"
                      className="text-sm font-medium"
                    >
                      Postgres Connection String
                    </label>
                    <Textarea
                      id="connection-string"
                      name="connection-string"
                      rows={3}
                      placeholder="postgresql://user:password@host:5432/database"
                      value={connectionString}
                      onChange={(e) => setConnectionString(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The connection string is used once to introspect your
                      schema and is not stored locally.
                    </p>
                  </div>
                )}

                <Button type="submit" className="w-full">
                  Fetch Schema
                </Button>

                {error && <p className="text-sm text-destructive">{error}</p>}
              </form>

              <div className="space-y-4 border-t border-border/50 pt-6">
                <div>
                  <h3 className="font-semibold text-sm uppercase mb-2">
                    AI Assistant
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Configure API access to enable the chat assistant. Keys are
                    stored locally.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={aiProvider === 'openai' ? 'default' : 'outline'}
                    onClick={() => setAiProvider('openai')}
                  >
                    OpenAI
                  </Button>
                  <Button
                    type="button"
                    variant={aiProvider === 'google' ? 'default' : 'outline'}
                    onClick={() => setAiProvider('google')}
                  >
                    Google Gemini
                  </Button>
                </div>

                {aiProvider === 'openai' ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="openai-api-key"
                        className="text-sm font-medium"
                      >
                        OpenAI API Key
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="openai-api-key"
                          type="password"
                          value={openaiApiKey}
                          placeholder="sk-..."
                          autoComplete="off"
                          onChange={(event) =>
                            setOpenaiApiKey(event.target.value.trim())
                          }
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => fetchModels('openai')}
                          disabled={!openaiApiKey || isFetchingModels}
                          title="Validate & Fetch Models"
                        >
                          <RefreshCw
                            size={16}
                            className={cn(isFetchingModels && 'animate-spin')}
                          />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Click the refresh button to validate key and fetch
                        available models.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Available Models
                      </label>
                      <div className="text-xs text-muted-foreground bg-muted p-2 rounded-md max-h-[150px] overflow-y-auto">
                        {openaiModels.length > 0 ? (
                          renderModelList(openaiModels, 'openai')
                        ) : (
                          <span className="italic">No models fetched yet.</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Custom Models
                      </label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add custom model ID (e.g., gpt-4-turbo)"
                          value={customModelInput}
                          onChange={(e) => setCustomModelInput(e.target.value)}
                          className="text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => addCustomModel('openai')}
                        >
                          <Plus size={16} />
                        </Button>
                      </div>
                      {customOpenaiModels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {customOpenaiModels.map((m) => (
                            <Badge
                              key={m}
                              variant="secondary"
                              className="text-[10px] px-1 py-0 h-5 gap-1 pr-0.5 cursor-default"
                            >
                              {m}
                              <span
                                className="cursor-pointer hover:text-destructive p-0.5"
                                onClick={() => removeCustomModel('openai', m)}
                              >
                                <XIcon size={10} />
                              </span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="gemini-api-key"
                        className="text-sm font-medium"
                      >
                        Google API Key
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="gemini-api-key"
                          type="password"
                          value={googleApiKey}
                          placeholder="AIza..."
                          autoComplete="off"
                          onChange={(event) =>
                            setGoogleApiKey(event.target.value.trim())
                          }
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => fetchModels('google')}
                          disabled={!googleApiKey || isFetchingModels}
                          title="Validate & Fetch Models"
                        >
                          <RefreshCw
                            size={16}
                            className={cn(isFetchingModels && 'animate-spin')}
                          />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Click the refresh button to validate key and fetch
                        available models.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Available Models
                      </label>
                      <div className="text-xs text-muted-foreground bg-muted p-2 rounded-md max-h-[150px] overflow-y-auto">
                        {googleModels.length > 0 ? (
                          renderModelList(googleModels, 'google')
                        ) : (
                          <span className="italic">No models fetched yet.</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Custom Models
                      </label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add custom model ID (e.g., gemini-1.5-flash)"
                          value={customModelInput}
                          onChange={(e) => setCustomModelInput(e.target.value)}
                          className="text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => addCustomModel('google')}
                        >
                          <Plus size={16} />
                        </Button>
                      </div>
                      {customGoogleModels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {customGoogleModels.map((m) => (
                            <Badge
                              key={m}
                              variant="secondary"
                              className="text-[10px] px-1 py-0 h-5 gap-1 pr-0.5 cursor-default"
                            >
                              {m}
                              <span
                                className="cursor-pointer hover:text-destructive p-0.5"
                                onClick={() => removeCustomModel('google', m)}
                              >
                                <XIcon size={10} />
                              </span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Max Agent Steps Setting */}
                <div className="space-y-3 border-t border-border/50 pt-4 mt-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="max-steps" className="text-sm font-medium">
                      Max Agent Steps
                    </Label>
                    <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                      {maxSteps}
                    </span>
                  </div>
                  <Input
                    id="max-steps"
                    type="range"
                    min={10}
                    max={100}
                    step={10}
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(parseInt(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum tool executions per request. Default: 50
                  </p>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Button
          variant="outline"
          size="icon"
          title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
          onClick={toggleTheme}
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </Button>
      </div>
    </>
  );
}
