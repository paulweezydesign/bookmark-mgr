import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit3,
  FolderOpen,
  Globe,
  Link2,
  Loader2,
  Moon,
  PlusCircle,
  RefreshCcw,
  Search,
  Sun,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Bookmark, BookmarkDraft } from '../lib/bookmarkClient';
import { BookmarkClient, parseImportPayload } from '../lib/bookmarkClient';
import { useDebouncedValue } from '../lib/useDebouncedValue';

const THEME_STORAGE_KEY = 'bookmark-mgr:theme';

const emptyFormState = {
  title: '',
  url: '',
  description: '',
  notes: '',
  tagsInput: '',
  folder: '',
};

type FormState = typeof emptyFormState;

type FeedbackState = {
  type: 'success' | 'error' | 'info';
  message: string;
};

function parseTagsInput(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, array) => array.indexOf(tag) === index);
}

function formatUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

const BookmarkManager: React.FC = () => {
  const [client] = useState(() => new BookmarkClient());
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [folderFilter, setFolderFilter] = useState('all');
  const [formState, setFormState] = useState<FormState>(emptyFormState);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [deadLinkStatus, setDeadLinkStatus] = useState<Record<string, 'checking' | 'ok' | 'dead'>>({});
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    let mounted = true;
    client.load().then((data) => {
      if (mounted) {
        setBookmarks(data);
        setLastSynced(client.getLastSync());
      }
    });
    const unsubscribe = client.subscribe((data) => {
      if (mounted) {
        setBookmarks(data);
        setLastSynced(client.getLastSync());
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = async () => {
      setIsOnline(true);
      setSyncState('syncing');
      const success = await client.sync();
      setSyncState(success ? 'idle' : 'error');
      setLastSynced(client.getLastSync());
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [client]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const interval = window.setInterval(() => {
      client.sync().then((result) => {
        const online = typeof navigator === 'undefined' ? true : navigator.onLine;
        setSyncState(result || !online ? 'idle' : 'error');
        setLastSynced(client.getLastSync());
      });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [client]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const fuse = useMemo(() => {
    if (!bookmarks.length) return null;
    return new Fuse(bookmarks, {
      keys: ['title', 'url', 'description', 'notes', 'tags', 'folder'],
      includeScore: true,
      threshold: 0.32,
      minMatchCharLength: 2,
      ignoreLocation: true,
    });
  }, [bookmarks]);

  const searchedBookmarks = useMemo(() => {
    if (!debouncedQuery.trim()) return bookmarks;
    if (!fuse) return bookmarks;
    return fuse.search(debouncedQuery.trim()).map((result) => result.item);
  }, [bookmarks, debouncedQuery, fuse]);

  const filteredBookmarks = useMemo(() => {
    let next = [...searchedBookmarks];
    if (activeTags.length) {
      next = next.filter((bookmark) =>
        activeTags.every((tag) => bookmark.tags.includes(tag)),
      );
    }
    if (folderFilter === 'unfiled') {
      next = next.filter((bookmark) => !bookmark.folder);
    } else if (folderFilter !== 'all') {
      next = next.filter((bookmark) => bookmark.folder === folderFilter);
    }
    return next.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [searchedBookmarks, activeTags, folderFilter]);

  const allTags = useMemo(() => {
    return Array.from(new Set(bookmarks.flatMap((bookmark) => bookmark.tags))).sort(
      (a, b) => a.localeCompare(b),
    );
  }, [bookmarks]);

  const folders = useMemo(() => {
    return Array.from(
      new Set(bookmarks.map((bookmark) => bookmark.folder).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
  }, [bookmarks]);

  const duplicateGroups = useMemo(() => {
    const map = client.detectDuplicates();
    return Array.from(map.entries());
  }, [bookmarks, client]);

  const hasPending = client.hasPending();
  const pendingCount = client.getPendingCount();
  const totalVisits = bookmarks.reduce((total, bookmark) => total + bookmark.visitCount, 0);

  const potentialDuplicate = useMemo(() => {
    const normalizedUrl = formState.url.trim();
    if (!normalizedUrl) return [] as Bookmark[];
    return bookmarks.filter(
      (bookmark) =>
        bookmark.url === normalizedUrl &&
        (!editingBookmark || bookmark.id !== editingBookmark.id),
    );
  }, [bookmarks, formState.url, editingBookmark]);

  const openForm = (bookmark?: Bookmark) => {
    if (bookmark) {
      setEditingBookmark(bookmark);
      setFormState({
        title: bookmark.title,
        url: bookmark.url,
        description: bookmark.description,
        notes: bookmark.notes,
        tagsInput: bookmark.tags.join(', '),
        folder: bookmark.folder,
      });
    } else {
      setEditingBookmark(null);
      setFormState(emptyFormState);
    }
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingBookmark(null);
    setFormState(emptyFormState);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = formState.title.trim();
    const trimmedUrl = formState.url.trim();
    if (!trimmedTitle || !trimmedUrl) {
      setFormError('Title and URL are required.');
      return;
    }
    const payload: BookmarkDraft = {
      title: trimmedTitle,
      url: formatUrl(trimmedUrl),
      description: formState.description.trim(),
      notes: formState.notes.trim(),
      tags: parseTagsInput(formState.tagsInput),
      folder: formState.folder.trim(),
    };
    try {
      setSyncState('syncing');
      if (editingBookmark) {
        await client.updateBookmark(editingBookmark.id, payload as Partial<Bookmark>);
        setFeedback({ type: 'success', message: 'Bookmark updated successfully.' });
      } else {
        await client.createBookmark(payload);
        setFeedback({ type: 'success', message: 'Bookmark added to your library.' });
      }
      setSyncState(client.hasPending() ? 'syncing' : 'idle');
      closeForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save bookmark.';
      setFormError(message);
      setFeedback({ type: 'error', message });
      setSyncState(client.hasPending() ? 'syncing' : 'error');
    }
  };

  const handleDelete = async (bookmark: Bookmark) => {
    const confirmed =
      typeof window === 'undefined' || window.confirm(`Delete bookmark "${bookmark.title}"?`);
    if (!confirmed) return;
    try {
      setSyncState('syncing');
      await client.deleteBookmark(bookmark.id);
      setFeedback({ type: 'info', message: 'Bookmark moved to trash and will sync shortly.' });
      setSyncState(client.hasPending() ? 'syncing' : 'idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete bookmark.';
      setFeedback({ type: 'error', message });
      setSyncState(client.hasPending() ? 'syncing' : 'error');
    }
  };

  const handleVisit = async (bookmark: Bookmark) => {
    if (typeof window !== 'undefined') {
      window.open(bookmark.url, '_blank', 'noopener');
    }
    try {
      setSyncState('syncing');
      await client.trackVisit(bookmark.id);
      setFeedback({ type: 'success', message: 'Visit recorded and synced.' });
      setSyncState(client.hasPending() ? 'syncing' : 'idle');
    } catch (error) {
      setFeedback({ type: 'error', message: 'Visit recorded locally. Will sync later.' });
      setSyncState(client.hasPending() ? 'syncing' : 'error');
    }
  };

  const handleCheckLink = async (bookmark: Bookmark) => {
    setDeadLinkStatus((state) => ({ ...state, [bookmark.id]: 'checking' }));
    const ok = await client.checkLink(bookmark.url);
    setDeadLinkStatus((state) => ({ ...state, [bookmark.id]: ok ? 'ok' : 'dead' }));
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const entries = parseImportPayload(text);
      if (!entries.length) {
        setFeedback({ type: 'error', message: 'No bookmarks detected in the import file.' });
        return;
      }
      setSyncState('syncing');
      const { imported, skipped } = await client.importBookmarks(entries);
      const message = skipped
        ? `Imported ${imported} bookmark(s). Skipped ${skipped} duplicate(s).`
        : `Imported ${imported} bookmark(s).`;
      setFeedback({ type: 'success', message });
      setSyncState(client.hasPending() ? 'syncing' : 'idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import bookmarks.';
      setFeedback({ type: 'error', message });
      setSyncState(client.hasPending() ? 'syncing' : 'error');
    } finally {
      event.target.value = '';
    }
  };

  const handleExport = () => {
    try {
      const payload = client.exportBookmarks();
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'bookmarks.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setFeedback({ type: 'success', message: 'Export ready. Downloaded bookmarks.json.' });
    } catch (error) {
      setFeedback({ type: 'error', message: 'Unable to export bookmarks.' });
    }
  };

  const toggleTag = (tag: string) => {
    setActiveTags((previous) =>
      previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag],
    );
  };

  return (
    <div className={`min-h-screen pb-16 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Bookmark Manager</h1>
              <button
                type="button"
                onClick={() => setDarkMode((value) => !value)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600"
                aria-label="Toggle dark mode"
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              Capture, organise, and explore your saved knowledge. Instant search, smart sync,
              and health checks help you maintain a resilient bookmark library.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
                isOnline
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              }`}
            >
              <span className="flex h-2.5 w-2.5 rounded-full bg-current" aria-hidden />
              {isOnline ? 'Online' : 'Offline mode'}
            </div>
            {hasPending && (
              <div className="flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
                {pendingCount} pending sync
              </div>
            )}
            {lastSynced && (
              <div className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Last synced {formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}
              </div>
            )}
            <button
              type="button"
              onClick={() => openForm()}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <PlusCircle className="h-4 w-4" />
              New bookmark
            </button>
          </div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,_3fr)_minmax(0,_1fr)]">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search titles, URLs, tags, notes..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-10 py-3 text-sm font-medium text-slate-700 shadow-inner placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Advanced search with fuzzy matching runs automatically after you pause typing.
                </p>
              </div>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-slate-400" />
                  <select
                    value={folderFilter}
                    onChange={(event) => setFolderFilter(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="all">All folders</option>
                    <option value="unfiled">Unfiled</option>
                    {folders.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
                  >
                    Import
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.html,.htm"
                    className="hidden"
                    onChange={handleImport}
                  />
                  <Download className="h-4 w-4 text-slate-400" />
                  <button
                    type="button"
                    onClick={handleExport}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
                  >
                    Export
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  <Tag className="h-4 w-4" />
                  Filter by tag
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {allTags.length === 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tags appear here as you add them to bookmarks.
                    </p>
                  )}
                  {allTags.map((tag) => {
                    const isActive = activeTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                  {activeTags.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTags([])}
                      className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      Clear tags
                    </button>
                  )}
                </div>
              </div>
            </div>

            {duplicateGroups.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-amber-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Duplicate bookmarks detected
                </div>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Review URLs with identical entries and consolidate or delete them.
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  {duplicateGroups.slice(0, 5).map(([key, group]) => (
                    <li key={key} className="rounded-lg border border-amber-200/60 bg-white/60 p-3 dark:border-amber-500/30 dark:bg-amber-900/20">
                      <p className="font-semibold">{group[0]?.url ?? key}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        {group.map((bookmark) => (
                          <span
                            key={bookmark.id}
                            className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-700 dark:bg-amber-800/60 dark:text-amber-200"
                          >
                            {bookmark.title}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                  {duplicateGroups.length > 5 && (
                    <li className="text-xs italic text-amber-600 dark:text-amber-300">
                      +{duplicateGroups.length - 5} more duplicate group(s)
                    </li>
                  )}
                </ul>
              </div>
            )}

            {feedback && (
              <div
                className={`flex items-center gap-3 rounded-2xl border p-4 text-sm shadow-sm ${
                  feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200'
                    : feedback.type === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-200'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-900/20 dark:text-indigo-200'
                }`}
              >
                {feedback.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
                {feedback.type === 'error' && <AlertTriangle className="h-4 w-4" />}
                {feedback.type === 'info' && <RefreshCcw className="h-4 w-4" />}
                <span>{feedback.message}</span>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {filteredBookmarks.map((bookmark) => {
                const status = deadLinkStatus[bookmark.id];
                return (
                  <article
                    key={bookmark.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-indigo-500"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <a
                            href={bookmark.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-lg font-semibold leading-tight text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
                          >
                            {bookmark.title}
                          </a>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {bookmark.url}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {bookmark.folder || 'Unfiled'}
                        </span>
                      </div>
                      {bookmark.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-300">{bookmark.description}</p>
                      )}
                      {bookmark.notes && (
                        <div className="rounded-xl bg-indigo-50/80 p-3 text-xs text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
                          <p className="font-semibold uppercase tracking-wide">Notes</p>
                          <p className="mt-1 whitespace-pre-wrap text-indigo-600 dark:text-indigo-200">
                            {bookmark.notes}
                          </p>
                        </div>
                      )}
                      {bookmark.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 text-xs">
                          {bookmark.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(tag)}
                              className="rounded-full bg-slate-200 px-2.5 py-0.5 font-semibold text-slate-600 transition hover:bg-indigo-500 hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-500"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                        <Globe className="h-3.5 w-3.5" />
                        <span>{bookmark.visitCount} visit(s)</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                        <RefreshCcw className="h-3.5 w-3.5" />
                        <span>
                          {bookmark.lastVisitedAt
                            ? `Last visited ${formatDistanceToNow(new Date(bookmark.lastVisitedAt), {
                                addSuffix: true,
                              })}`
                            : 'Never visited'}
                        </span>
                      </div>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleVisit(bookmark)}
                          className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                        >
                          <Globe className="h-3.5 w-3.5" /> Visit
                        </button>
                        <button
                          type="button"
                          onClick={() => openForm(bookmark)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(bookmark)}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCheckLink(bookmark)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500"
                        >
                          <Link2 className="h-3.5 w-3.5" /> Check link
                        </button>
                        {status === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                        {status === 'ok' && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Live
                          </span>
                        )}
                        {status === 'dead' && (
                          <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                            <AlertTriangle className="h-3 w-3" /> Dead link
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              {filteredBookmarks.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  No bookmarks match your filters yet. Add a bookmark or adjust search filters.
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Library health
              </h2>
              <dl className="mt-4 grid gap-4 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Total bookmarks</dt>
                  <dd className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {bookmarks.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Unique tags</dt>
                  <dd className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {allTags.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Folders</dt>
                  <dd className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {folders.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Total visits tracked</dt>
                  <dd className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {totalVisits}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Potential duplicates</dt>
                  <dd className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {duplicateGroups.length}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Sync activity
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="font-semibold capitalize">{syncState}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Pending updates</span>
                  <span className="font-semibold">{pendingCount}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Auto re-sync</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-300">Enabled</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Offline fallback</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-300">Ready</span>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Tips
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                <li>Use folders and tags together for advanced organisation.</li>
                <li>Import Chrome/Firefox exports or JSON backups directly.</li>
                <li>Dead link checks help you prune stale resources.</li>
                <li>Dark mode keeps late-night browsing comfortable.</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={closeForm}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close form"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {editingBookmark ? 'Edit bookmark' : 'Add a new bookmark'}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Capture metadata, notes, and organisation details. Everything syncs across devices
              automatically.
            </p>
            {potentialDuplicate.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
                <p className="font-semibold uppercase tracking-wide">Duplicate warning</p>
                <p className="mt-1">
                  This URL already exists in your library. Saving will create another copy unless you
                  update the existing bookmark instead.
                </p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  Title
                  <input
                    value={formState.title}
                    onChange={(event) => setFormState((state) => ({ ...state, title: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="e.g. Astro documentation"
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  URL
                  <input
                    value={formState.url}
                    onChange={(event) => setFormState((state) => ({ ...state, url: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="https://example.com/article"
                    required
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  Folder
                  <input
                    value={formState.folder}
                    onChange={(event) => setFormState((state) => ({ ...state, folder: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="e.g. Frontend"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  Tags
                  <input
                    value={formState.tagsInput}
                    onChange={(event) => setFormState((state) => ({ ...state, tagsInput: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="astro, react, tailwind"
                  />
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    Separate multiple tags with commas.
                  </span>
                </label>
              </div>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                Description
                <textarea
                  value={formState.description}
                  onChange={(event) =>
                    setFormState((state) => ({ ...state, description: event.target.value }))
                  }
                  rows={3}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Add a quick summary for fast discovery"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                Notes
                <textarea
                  value={formState.notes}
                  onChange={(event) => setFormState((state) => ({ ...state, notes: event.target.value }))}
                  rows={3}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Capture takeaways, highlights, or todos"
                />
              </label>
              {formError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-200">
                  {formError}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Offline changes are kept locally and re-synchronised once you reconnect.
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {editingBookmark ? 'Save changes' : 'Save bookmark'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookmarkManager;
