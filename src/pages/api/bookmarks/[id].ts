import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import connectDB from '../../../lib/database';
import Bookmark from '../../../lib/models/Bookmark';
import {
  detectDuplicateBookmark,
  toBookmarkDto,
  validateBookmarkUrl,
} from '../../../lib/bookmarkUtils';
import { withAuth } from '../../../lib/auth';

const ensureValidId = (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error: any = new Error('Invalid bookmark id');
    error.status = 400;
    throw error;
  }
};

const fetchBookmark = async (userId: string, id: string) => {
  const bookmark = await Bookmark.findOne({ _id: id, user: userId });

  if (!bookmark) {
    const error: any = new Error('Bookmark not found');
    error.status = 404;
    throw error;
  }

  return bookmark;
};

export const get: APIRoute = withAuth(async (context) => {
  try {
    await connectDB();

    const { id } = context.params;
    ensureValidId(id!);

    const url = new URL(context.request.url);
    const visit = url.searchParams.get('visit') === 'true';

    const bookmark = await fetchBookmark(context.locals.userId, id!);

    if (visit) {
      bookmark.visitCount += 1;
      bookmark.lastVisitedAt = new Date();
      await bookmark.save();
    }

    return new Response(
      JSON.stringify({ data: toBookmarkDto(bookmark) }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    const status = error?.status || 500;

    return new Response(
      JSON.stringify({ message: error?.message || 'Failed to fetch bookmark' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});

export const put: APIRoute = withAuth(async (context) => {
  try {
    await connectDB();

    const { id } = context.params;
    ensureValidId(id!);

    const payload = await context.request.json();
    const bookmark = await fetchBookmark(context.locals.userId, id!);

    const { url, title, description, tags, folder } = payload ?? {};

    if (url && url !== bookmark.url) {
      const duplicate = await detectDuplicateBookmark(context.locals.userId, url, id!);

      if (duplicate) {
        const error: any = new Error('Bookmark already exists');
        error.status = 409;
        throw error;
      }

      const validation = await validateBookmarkUrl(url);

      if (!validation.ok) {
        const error: any = new Error('Bookmark URL is not reachable');
        error.status = 422;
        throw error;
      }

      bookmark.url = url;
    }

    if (title) bookmark.title = title;
    if (description !== undefined) bookmark.description = description;
    if (Array.isArray(tags)) bookmark.tags = tags;
    if (folder !== undefined) bookmark.folder = folder;

    await bookmark.save();

    return new Response(
      JSON.stringify({ data: toBookmarkDto(bookmark) }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    const status = error?.status || 500;

    return new Response(
      JSON.stringify({ message: error?.message || 'Failed to update bookmark' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});

export const del: APIRoute = withAuth(async (context) => {
  try {
    await connectDB();

    const { id } = context.params;
    ensureValidId(id!);

    const bookmark = await fetchBookmark(context.locals.userId, id!);
    await bookmark.deleteOne();

    return new Response(null, { status: 204 });
  } catch (error: any) {
    const status = error?.status || 500;

    return new Response(
      JSON.stringify({ message: error?.message || 'Failed to delete bookmark' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});

export const patch: APIRoute = withAuth(async (context) => {
  try {
    await connectDB();

    const { id } = context.params;
    ensureValidId(id!);

    const bookmark = await fetchBookmark(context.locals.userId, id!);
    const body = await context.request.json();

    if (body?.action === 'visit') {
      bookmark.visitCount += 1;
      bookmark.lastVisitedAt = new Date();
      await bookmark.save();

      return new Response(
        JSON.stringify({ data: toBookmarkDto(bookmark) }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({ message: 'Unsupported patch action' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    const status = error?.status || 500;

    return new Response(
      JSON.stringify({ message: error?.message || 'Failed to update bookmark' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});
