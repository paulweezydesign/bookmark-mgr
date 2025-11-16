export type Bookmark = {
  id: string;
  title: string;
  url: string;
  description: string;
  notes: string;
  tags: string[];
  folder: string;
  createdAt: string;
  updatedAt: string;
  visitCount: number;
  lastVisitedAt?: string;
};

export type BookmarkDraft = {
  title: string;
  url: string;
  description?: string;
  notes?: string;
  tags?: string[];
  folder?: string;
};

type PendingOperation =
  | { type: 'create'; bookmark: Bookmark }
  | { type: 'update'; id: string; updates: Partial<Bookmark> }
  | { type: 'delete'; id: string };

const BOOKMARK_STORAGE_KEY = 'bookmark-mgr:bookmarks';
const PENDING_STORAGE_KEY = 'bookmark-mgr:pending-ops';
const LAST_SYNC_KEY = 'bookmark-mgr:last-sync';

const isBrowser = typeof window !== 'undefined';

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bookmark-${Math.random().toString(36).slice(2, 11)}-${Date.now().toString(36)}`;
}

function normalizeTags(tags: string[] | undefined | null): string[] {
  if (!tags) return [];
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, idx, arr) => arr.indexOf(tag) === idx)
    .sort((a, b) => a.localeCompare(b));
}

function parseBookmark(raw: Partial<Bookmark>): Bookmark {
  const now = new Date().toISOString();
  return {
    id: raw.id ?? createId(),
    title: raw.title?.trim() ?? 'Untitled',
    url: raw.url?.trim() ?? '',
    description: raw.description?.trim() ?? '',
    notes: raw.notes?.trim() ?? '',
    tags: normalizeTags(raw.tags ?? []),
    folder: raw.folder?.trim() ?? '',
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
    visitCount: typeof raw.visitCount === 'number' ? raw.visitCount : 0,
    lastVisitedAt: raw.lastVisitedAt,
  };
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function safeLocalStorageGet<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    return JSON.parse(stored) as T;
  } catch (error) {
    console.warn('Failed to parse localStorage key', key, error);
    return fallback;
  }
}

function safeLocalStorageSet(key: string, value: unknown) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Failed to persist to localStorage', key, error);
  }
}

export class BookmarkClient {
  private bookmarks: Bookmark[] = [];
  private pending: PendingOperation[] = [];
  private listeners = new Set<(bookmarks: Bookmark[]) => void>();
  private baseUrl: string;

  constructor(baseUrl = '/api/bookmarks') {
    this.baseUrl = baseUrl;

    if (isBrowser) {
      this.bookmarks = safeLocalStorageGet<Bookmark[]>(BOOKMARK_STORAGE_KEY, []);
      this.pending = safeLocalStorageGet<PendingOperation[]>(PENDING_STORAGE_KEY, []);

      const applyPending = () => {
        const restored = clone(this.bookmarks);
        for (const op of this.pending) {
          if (op.type === 'create') {
            const exists = restored.some((bookmark) => bookmark.id === op.bookmark.id);
            if (!exists) restored.push(op.bookmark);
          }
          if (op.type === 'update') {
            const idx = restored.findIndex((bookmark) => bookmark.id === op.id);
            if (idx !== -1) {
              restored[idx] = { ...restored[idx], ...op.updates };
            }
          }
          if (op.type === 'delete') {
            const idx = restored.findIndex((bookmark) => bookmark.id === op.id);
            if (idx !== -1) {
              restored.splice(idx, 1);
            }
          }
        }
        this.bookmarks = restored;
      };

      applyPending();
    }
  }

  subscribe(listener: (bookmarks: Bookmark[]) => void) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private getSnapshot() {
    return clone(this.bookmarks);
  }

  private persist() {
    safeLocalStorageSet(BOOKMARK_STORAGE_KEY, this.bookmarks);
    safeLocalStorageSet(PENDING_STORAGE_KEY, this.pending);
  }

  private notify() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async apiRequest(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'API request failed');
    }
    if (response.status === 204) {
      return null;
    }
    return response.json();
  }

  private async fetchRemote(): Promise<Bookmark[]> {
    const data = await this.apiRequest(this.baseUrl);
    const list: Bookmark[] = Array.isArray(data)
      ? data.map((item) => parseBookmark(item))
      : (data?.bookmarks ?? []).map((item: Partial<Bookmark>) => parseBookmark(item));
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  private recordPending(operation: PendingOperation) {
    this.pending.push(operation);
    this.persist();
  }

  private removePending(predicate: (operation: PendingOperation) => boolean) {
    this.pending = this.pending.filter((operation) => !predicate(operation));
    this.persist();
  }

  private upsertLocal(bookmark: Bookmark) {
    const idx = this.bookmarks.findIndex((item) => item.id === bookmark.id);
    if (idx !== -1) {
      this.bookmarks[idx] = bookmark;
    } else {
      this.bookmarks.push(bookmark);
    }
  }

  private applyPendingLocally(base: Bookmark[]) {
    const result = clone(base);
    for (const operation of this.pending) {
      if (operation.type === 'create') {
        const exists = result.some((bookmark) => bookmark.id === operation.bookmark.id);
        if (!exists) {
          result.push(operation.bookmark);
        }
      }
      if (operation.type === 'update') {
        const idx = result.findIndex((bookmark) => bookmark.id === operation.id);
        if (idx !== -1) {
          result[idx] = { ...result[idx], ...operation.updates };
        }
      }
      if (operation.type === 'delete') {
        const idx = result.findIndex((bookmark) => bookmark.id === operation.id);
        if (idx !== -1) {
          result.splice(idx, 1);
        }
      }
    }
    return result;
  }

  async load(): Promise<Bookmark[]> {
    try {
      const remote = await this.fetchRemote();
      this.bookmarks = this.applyPendingLocally(remote);
      this.persist();
      safeLocalStorageSet(LAST_SYNC_KEY, new Date().toISOString());
      this.notify();
    } catch (error) {
      console.warn('Using cached bookmarks because remote fetch failed', error);
    }
    return this.getSnapshot();
  }

  getLastSync(): string | null {
    if (!isBrowser) return null;
    return window.localStorage.getItem(LAST_SYNC_KEY);
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  getPendingCount(): number {
    return this.pending.length;
  }

  async createBookmark(draft: BookmarkDraft): Promise<Bookmark[]> {
    const now = new Date().toISOString();
    const bookmark = parseBookmark({
      ...draft,
      id: crypto.randomUUID(),
      description: draft.description ?? '',
      notes: draft.notes ?? '',
      tags: draft.tags ?? [],
      folder: draft.folder ?? '',
      createdAt: now,
      updatedAt: now,
      visitCount: 0,
    });

    this.bookmarks.push(bookmark);
    this.recordPending({ type: 'create', bookmark });
    this.notify();

    try {
      const savedData = await this.apiRequest(this.baseUrl, {
        method: 'POST',
        body: JSON.stringify(bookmark),
      });
      if (savedData) {
        const saved = parseBookmark(savedData.bookmark ?? savedData);
        this.upsertLocal(saved);
        this.removePending((operation) => operation.type === 'create' && operation.bookmark.id === bookmark.id);
        this.persist();
        this.notify();
      }
    } catch (error) {
      console.warn('Queued bookmark creation for sync', error);
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        throw error;
      }
    }

    return this.getSnapshot();
  }

  async updateBookmark(id: string, updates: Partial<Bookmark>): Promise<Bookmark[]> {
    const idx = this.bookmarks.findIndex((bookmark) => bookmark.id === id);
    if (idx === -1) {
      throw new Error('Bookmark not found');
    }

    const now = new Date().toISOString();
    const merged: Bookmark = {
      ...this.bookmarks[idx],
      ...updates,
      tags: normalizeTags(updates.tags ?? this.bookmarks[idx].tags),
      folder: updates.folder?.trim() ?? this.bookmarks[idx].folder,
      updatedAt: now,
    };

    this.bookmarks[idx] = merged;
    this.recordPending({ type: 'update', id, updates: merged });
    this.notify();

    try {
      const savedData = await this.apiRequest(`${this.baseUrl}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(merged),
      });
      if (savedData) {
        const saved = parseBookmark(savedData.bookmark ?? savedData);
        this.upsertLocal(saved);
        this.removePending((operation) => operation.type === 'update' && operation.id === id);
        this.persist();
        this.notify();
      }
    } catch (error) {
      console.warn('Queued bookmark update for sync', error);
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        throw error;
      }
    }

    return this.getSnapshot();
  }

  async deleteBookmark(id: string): Promise<Bookmark[]> {
    this.bookmarks = this.bookmarks.filter((bookmark) => bookmark.id !== id);
    this.recordPending({ type: 'delete', id });
    this.notify();

    try {
      await this.apiRequest(`${this.baseUrl}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      this.removePending((operation) => operation.type === 'delete' && operation.id === id);
      this.persist();
      this.notify();
    } catch (error) {
      console.warn('Queued bookmark deletion for sync', error);
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        throw error;
      }
    }

    return this.getSnapshot();
  }

  async trackVisit(id: string): Promise<Bookmark[]> {
    const bookmark = this.bookmarks.find((item) => item.id === id);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }
    const updates: Partial<Bookmark> = {
      visitCount: (bookmark.visitCount ?? 0) + 1,
      lastVisitedAt: new Date().toISOString(),
    };
    return this.updateBookmark(id, updates);
  }

  async importBookmarks(entries: BookmarkDraft[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    for (const entry of entries) {
      const normalizedUrl = entry.url?.trim();
      if (!normalizedUrl) {
        skipped += 1;
        continue;
      }
      const duplicate = this.bookmarks.find((bookmark) => bookmark.url === normalizedUrl);
      if (duplicate) {
        skipped += 1;
        continue;
      }
      try {
        await this.createBookmark(entry);
        imported += 1;
      } catch (error) {
        console.warn('Failed to import bookmark, queued instead', error);
        imported += 1;
      }
    }
    return { imported, skipped };
  }

  exportBookmarks(): string {
    return JSON.stringify(this.bookmarks, null, 2);
  }

  async sync(): Promise<boolean> {
    if (!this.pending.length) {
      return true;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }

    const queue = [...this.pending];

    for (const operation of queue) {
      try {
        if (operation.type === 'create') {
          const savedData = await this.apiRequest(this.baseUrl, {
            method: 'POST',
            body: JSON.stringify(operation.bookmark),
          });
          if (savedData) {
            const saved = parseBookmark(savedData.bookmark ?? savedData);
            this.upsertLocal(saved);
          }
          this.removePending((pendingOp) => pendingOp === operation);
        }

        if (operation.type === 'update') {
          const savedData = await this.apiRequest(`${this.baseUrl}/${encodeURIComponent(operation.id)}`, {
            method: 'PUT',
            body: JSON.stringify(operation.updates),
          });
          if (savedData) {
            const saved = parseBookmark(savedData.bookmark ?? savedData);
            this.upsertLocal(saved);
          }
          this.removePending((pendingOp) => pendingOp === operation);
        }

        if (operation.type === 'delete') {
          await this.apiRequest(`${this.baseUrl}/${encodeURIComponent(operation.id)}`, {
            method: 'DELETE',
          });
          this.removePending((pendingOp) => pendingOp === operation);
        }
      } catch (error) {
        console.warn('Sync failed for operation', operation, error);
        return false;
      }
    }

    try {
      const remote = await this.fetchRemote();
      this.bookmarks = remote;
      this.persist();
      safeLocalStorageSet(LAST_SYNC_KEY, new Date().toISOString());
      this.notify();
    } catch (error) {
      console.warn('Failed to refresh bookmarks after sync', error);
    }

    return true;
  }

  async checkLink(url: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
      if (!response.ok) {
        // fallback to GET when HEAD is not allowed
        const getResponse = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeout);
        return getResponse.ok;
      }
      clearTimeout(timeout);
      return true;
    } catch (error) {
      console.warn('Dead link detected', error);
      clearTimeout(timeout);
      return false;
    }
  }

  detectDuplicates(): Map<string, Bookmark[]> {
    const map = new Map<string, Bookmark[]>();
    for (const bookmark of this.bookmarks) {
      if (!bookmark.url) continue;
      const key = bookmark.url.toLowerCase();
      const group = map.get(key) ?? [];
      group.push(bookmark);
      map.set(key, group);
    }

    for (const [key, group] of map) {
      if (group.length < 2) {
        map.delete(key);
      }
    }

    return map;
  }
}

export function parseNetscapeHtmlBookmarks(html: string): BookmarkDraft[] {
  if (!isBrowser) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const anchors = Array.from(doc.querySelectorAll('a')) as HTMLAnchorElement[];

  return anchors.map((anchor) => {
    const tags = anchor.getAttribute('tags')?.split(',').map((tag) => tag.trim()) ?? [];
    return {
      title: anchor.textContent?.trim() || anchor.getAttribute('add_date') || anchor.href,
      url: anchor.href,
      description: anchor.getAttribute('description') ?? anchor.getAttribute('note') ?? '',
      notes: anchor.getAttribute('note') ?? '',
      tags,
      folder: anchor.closest('dl')?.previousElementSibling?.textContent?.trim() ?? '',
    } satisfies BookmarkDraft;
  });
}

export function parseImportPayload(text: string): BookmarkDraft[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('<')) {
    return parseNetscapeHtmlBookmarks(trimmed);
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => ({
        title: entry.title ?? entry.name ?? 'Untitled',
        url: entry.url ?? entry.href ?? '',
        description: entry.description ?? entry.summary ?? '',
        notes: entry.notes ?? entry.comment ?? '',
        tags: entry.tags ?? entry.labels ?? [],
        folder: entry.folder ?? entry.category ?? '',
      }));
    }

    if (parsed && typeof parsed === 'object') {
      const bookmarks = (parsed.bookmarks ?? parsed.items ?? []) as BookmarkDraft[];
      return Array.isArray(bookmarks) ? bookmarks : [];
    }
  } catch (error) {
    console.warn('Failed to parse import payload', error);
  }

  return [];
}
