import type { APIRoute } from 'astro';
import { clearAuthCookie } from '../../../lib/auth';

export const post: APIRoute = async ({ cookies }) => {
  clearAuthCookie(cookies);

  return new Response(
    JSON.stringify({ message: 'Logged out successfully' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
