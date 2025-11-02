import type { APIRoute } from 'astro';
import connectDB from '../../../lib/database';
import User from '../../../lib/models/User';
import { createAuthToken, setAuthCookie } from '../../../lib/auth';

const sanitizeUser = (user: any) => ({
  id: user._id.toString(),
  email: user.email,
  name: user.name,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const post: APIRoute = async ({ request, cookies }) => {
  try {
    await connectDB();

    const body = await request.json();
    const { email, password } = body ?? {};

    if (!email || !password) {
      return new Response(
        JSON.stringify({ message: 'Email and password are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const user = await User.findOne({ email });

    if (!user) {
      return new Response(
        JSON.stringify({ message: 'Invalid credentials' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const isValid = await user.comparePassword(password);

    if (!isValid) {
      return new Response(
        JSON.stringify({ message: 'Invalid credentials' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const token = createAuthToken(user._id.toString(), user.email);
    setAuthCookie(cookies, token);

    return new Response(
      JSON.stringify({ user: sanitizeUser(user), token }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ message: error?.message || 'Unable to login' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
