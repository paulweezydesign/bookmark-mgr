import type { Types } from 'mongoose';
import Bookmark, { type IBookmark } from './models/Bookmark';

export interface BookmarkPayload {
  url: string;
  title: string;
  description?: string;
  tags?: string[];
  folder?: string;
}

export interface BookmarkImportResult {
  bookmarks: BookmarkPayload[];
  errors: string[];
}

const isValidUrl = (value: string) => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch (error) {
    return false;
  }
};

export const detectDuplicateBookmark = async (
  userId: Types.ObjectId | string,
  url: string,
  currentId?: string,
): Promise<IBookmark | null> => {
  return Bookmark.findOne({
    user: userId,
    url,
    ...(currentId ? { _id: { $ne: currentId } } : {}),
  });
};

export const validateBookmarkUrl = async (
  url: string,
  timeoutMs = 5000,
): Promise<{ ok: boolean; status?: number }> => {
  if (!isValidUrl(url)) {
    return { ok: false };
  }

  if (process.env.SKIP_LINK_VALIDATION === 'true') {
    return { ok: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok && response.status >= 400) {
      return { ok: false, status: response.status };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false };
  }
};

export const parseBookmarkImport = (payload: string): BookmarkImportResult => {
  const results: BookmarkPayload[] = [];
  const errors: string[] = [];

  if (!payload.trim()) {
    return { bookmarks: results, errors };
  }

  try {
    const parsed = JSON.parse(payload);
    const collection = Array.isArray(parsed) ? parsed : parsed?.bookmarks;

    if (!Array.isArray(collection)) {
      throw new Error('Invalid bookmark import structure');
    }

    collection.forEach((item, index) => {
      if (!item?.url || !item?.title) {
        errors.push(`Row ${index + 1}: Missing url or title`);
        return;
      }

      if (!isValidUrl(item.url)) {
        errors.push(`Row ${index + 1}: Invalid URL ${item.url}`);
        return;
      }

      results.push({
        url: item.url,
        title: item.title,
        description: item.description ?? '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        folder: item.folder ?? '',
      });
    });
  } catch (error) {
    errors.push('Unable to parse bookmark import payload');
  }

  return { bookmarks: results, errors };
};

export const serializeBookmarks = (bookmarks: IBookmark[]): string => {
  const data = bookmarks.map((bookmark) => ({
    id: bookmark._id.toString(),
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description,
    tags: bookmark.tags,
    folder: bookmark.folder,
    visitCount: bookmark.visitCount,
    lastVisitedAt: bookmark.lastVisitedAt,
    createdAt: bookmark.createdAt,
    updatedAt: bookmark.updatedAt,
  }));

  return JSON.stringify({ bookmarks: data }, null, 2);
};

export const toBookmarkDto = (bookmark: IBookmark) => ({
  id: bookmark._id.toString(),
  url: bookmark.url,
  title: bookmark.title,
  description: bookmark.description,
  tags: bookmark.tags,
  folder: bookmark.folder,
  visitCount: bookmark.visitCount,
  lastVisitedAt: bookmark.lastVisitedAt,
  createdAt: bookmark.createdAt,
  updatedAt: bookmark.updatedAt,
});
