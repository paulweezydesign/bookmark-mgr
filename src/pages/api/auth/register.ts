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
    const { email, password, name } = body ?? {};

    if (!email || !password) {
      return new Response(
        JSON.stringify({ message: 'Email and password are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return new Response(
        JSON.stringify({ message: 'Email already in use' }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const user = new User({ email, password, name });
    await user.save();

    const token = createAuthToken(user._id.toString(), user.email);
    setAuthCookie(cookies, token);

    return new Response(
      JSON.stringify({ user: sanitizeUser(user), token }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ message: error?.message || 'Unable to register user' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
