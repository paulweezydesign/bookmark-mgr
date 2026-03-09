import type { APIRoute, APIContext, AstroCookies } from 'astro';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Please define the JWT_SECRET environment variable');
}

const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '7d';
export const AUTH_COOKIE_NAME = 'auth_token';

export interface TokenPayload {
  sub: string;
  email?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedLocals {
  userId: string;
  tokenPayload: TokenPayload;
}

export type AuthenticatedContext = APIContext & {
  locals: APIContext['locals'] & AuthenticatedLocals;
};

export const createAuthToken = (userId: string, email?: string) => {
  return jwt.sign({ sub: userId, email }, JWT_SECRET!, {
    expiresIn: TOKEN_TTL,
  });
};

export const verifyAuthToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET!) as TokenPayload;
  } catch (error) {
    return null;
  }
};

export const setAuthCookie = (cookies: AstroCookies, token: string) => {
  cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
};

export const clearAuthCookie = (cookies: AstroCookies) => {
  cookies.set(AUTH_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: 0,
  });
};

const extractToken = (context: APIContext): string | null => {
  const cookieToken = context.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = context.request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
};

export const withAuth = (
  handler: (context: AuthenticatedContext) => ReturnType<APIRoute>,
): APIRoute => {
  return async (context) => {
    const token = extractToken(context);

    if (!token) {
      return new Response(
        JSON.stringify({ message: 'Authentication required' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const payload = verifyAuthToken(token);

    if (!payload?.sub) {
      return new Response(
        JSON.stringify({ message: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const enrichedContext = {
      ...context,
      locals: {
        ...(context.locals || {}),
        userId: payload.sub,
        tokenPayload: payload,
      },
    } as AuthenticatedContext;

    return handler(enrichedContext);
  };
};
