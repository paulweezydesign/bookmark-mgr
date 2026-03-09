import type { APIRoute } from 'astro';
import connectDB from '../../../lib/database';
import Bookmark from '../../../lib/models/Bookmark';
import {
  detectDuplicateBookmark,
  parseBookmarkImport,
  serializeBookmarks,
  toBookmarkDto,
  validateBookmarkUrl,
  type BookmarkPayload,
} from '../../../lib/bookmarkUtils';
import { withAuth, type AuthenticatedContext } from '../../../lib/auth';

const buildFilter = (
  context: AuthenticatedContext,
  search?: string,
  tags?: string[],
  folder?: string,
) => {
  const filter: Record<string, any> = { user: context.locals.userId };

  if (search) {
    filter.$text = { $search: search };
  }

  if (tags && tags.length > 0) {
    filter.tags = { $all: tags };
  }

  if (folder) {
    filter.folder = folder;
  }

  return filter;
};

export const get: APIRoute = withAuth(async (context) => {
  try {
    await connectDB();

    const url = new URL(context.request.url);
    const page = Math.max(Number(url.searchParams.get('page') || 1), 1);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);
    const search = url.searchParams.get('search') || undefined;
    const tagsParam = url.searchParams.get('tags') || '';
    const folder = url.searchParams.get('folder') || undefined;
    const format = url.searchParams.get('format') || 'json';

    const tags = tagsParam
      ? tagsParam.split(',').map((tag) => tag.trim()).filter(Boolean)
      : [];

    const filter = buildFilter(context, search, tags, folder);
    const skip = (page - 1) * limit;

    const query = Bookmark.find(filter);

    if (search) {
      query.sort({ score: { $meta: 'textScore' } });
      query.select({ score: { $meta: 'textScore' } });
    } else {
      query.sort({ createdAt: -1 });
    }

    const [bookmarks, total] = await Promise.all([
      query.skip(skip).limit(limit),
      Bookmark.countDocuments(filter),
    ]);

    if (format === 'export') {
      return new Response(serializeBookmarks(bookmarks), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="bookmarks.json"',
        },
      });
    }

    return new Response(
      JSON.stringify({
        data: bookmarks.map((bookmark) => toBookmarkDto(bookmark)),
        pagination: {
          page,
          limit,
          total,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ message: error?.message || 'Failed to fetch bookmarks' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});

const createBookmark = async (
  userId: string,
  payload: BookmarkPayload,
) => {
  const { url, title, description, tags, folder } = payload;

  if (!url || !title) {
    throw new Error('URL and title are required');
  }

  const duplicate = await detectDuplicateBookmark(userId, url);

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

  const bookmark = await Bookmark.create({
    user: userId,
    url,
    title,
    description,
    tags: tags ?? [],
    folder,
  });

  return bookmark;
};

export const post: APIRoute = withAuth(async (context) => {
  try {
    await connectDB();

    const body = await context.request.json();

    if (!body || typeof body !== 'object') {
      return new Response(
        JSON.stringify({ message: 'Invalid request payload' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Import payload support
    if (typeof body?.import === 'string') {
      const { bookmarks, errors } = parseBookmarkImport(body.import);
      const created: ReturnType<typeof toBookmarkDto>[] = [];

      for (const payload of bookmarks) {
        try {
          const bookmark = await createBookmark(context.locals.userId, payload);
          created.push(toBookmarkDto(bookmark));
        } catch (error: any) {
          errors.push(error?.message || 'Failed to import bookmark');
        }
      }

      return new Response(
        JSON.stringify({ created, errors }),
        {
          status: errors.length > 0 ? 207 : 201,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const bookmark = await createBookmark(context.locals.userId, body as BookmarkPayload);

    return new Response(
      JSON.stringify({ data: toBookmarkDto(bookmark) }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    const status = error?.status || 500;

    return new Response(
      JSON.stringify({ message: error?.message || 'Failed to create bookmark' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});
