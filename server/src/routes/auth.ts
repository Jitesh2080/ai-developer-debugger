import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import {
  getUserById,
  loginUser,
  registerUser,
  signToken,
  upsertGoogleUser,
} from '../services/auth.js';

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(200).optional(),
});

authRouter.post('/register', async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const user = await registerUser({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name || parsed.data.email.split('@')[0]!,
    });
    res.status(201).json({ token: signToken(user.id), user });
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

authRouter.post('/login', async (req, res) => {
  const parsed = credsSchema.pick({ email: true, password: true }).safeParse(
    req.body,
  );
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const user = await loginUser(parsed.data.email, parsed.data.password);
    res.json({ token: signToken(user.id), user });
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await getUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

// Whether Google OAuth is configured (the frontend hides the button if not).
authRouter.get('/config', (_req, res) => {
  res.json({ googleEnabled: Boolean(env.GOOGLE_CLIENT_ID) });
});

// ---- Google OAuth ----

authRouter.get('/google', (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: 'Google OAuth is not configured' });
    return;
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.OAUTH_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('access_type', 'online');
  res.redirect(url.toString());
});

authRouter.get('/google/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    res.status(503).json({ error: 'Google OAuth is not configured' });
    return;
  }
  if (!code) {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }
  try {
    // Exchange the authorization code for tokens.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.OAUTH_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) throw new Error('Token exchange failed');

    // Fetch the user's profile.
    const profileRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    const profile = (await profileRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    const user = await upsertGoogleUser({
      googleId: profile.sub,
      email: profile.email,
      name: profile.name || profile.email.split('@')[0]!,
      avatarUrl: profile.picture,
    });

    // Hand the JWT back to the SPA via the URL fragment.
    const redirect = new URL('/auth/callback', env.CLIENT_URL);
    redirect.hash = `token=${signToken(user.id)}`;
    res.redirect(redirect.toString());
  } catch (err) {
    res.status(502).json({ error: `Google sign-in failed: ${(err as Error).message}` });
  }
});
