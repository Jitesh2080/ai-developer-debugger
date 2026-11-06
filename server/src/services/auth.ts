import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  password_hash: string | null;
  google_id: string | null;
}

const mapUser = (r: UserRow): AuthUser => ({
  id: r.id,
  email: r.email,
  name: r.name,
  avatarUrl: r.avatar_url,
});

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function registerUser(params: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthUser> {
  const existing = await query<UserRow>('SELECT * FROM users WHERE email = $1', [
    params.email,
  ]);
  if (existing.rows.length > 0) {
    throw new Error('An account with that email already exists.');
  }
  const passwordHash = await hashPassword(params.password);
  const { rows } = await query<UserRow>(
    `INSERT INTO users (email, name, password_hash)
     VALUES ($1, $2, $3) RETURNING *`,
    [params.email, params.name, passwordHash],
  );
  return mapUser(rows[0]!);
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE email = $1', [
    email,
  ]);
  const row = rows[0];
  if (!row || !row.password_hash) {
    throw new Error('Invalid email or password.');
  }
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) throw new Error('Invalid email or password.');
  return mapUser(row);
}

/** Find or create a user from a verified Google profile. */
export async function upsertGoogleUser(profile: {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}): Promise<AuthUser> {
  const byGoogle = await query<UserRow>(
    'SELECT * FROM users WHERE google_id = $1',
    [profile.googleId],
  );
  if (byGoogle.rows.length > 0) return mapUser(byGoogle.rows[0]!);

  // Link to an existing email account if present, else create a new user.
  const byEmail = await query<UserRow>('SELECT * FROM users WHERE email = $1', [
    profile.email,
  ]);
  if (byEmail.rows.length > 0) {
    const { rows } = await query<UserRow>(
      `UPDATE users SET google_id = $2, avatar_url = COALESCE($3, avatar_url)
         WHERE email = $1 RETURNING *`,
      [profile.email, profile.googleId, profile.avatarUrl ?? null],
    );
    return mapUser(rows[0]!);
  }

  const { rows } = await query<UserRow>(
    `INSERT INTO users (email, name, google_id, avatar_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [profile.email, profile.name, profile.googleId, profile.avatarUrl ?? null],
  );
  return mapUser(rows[0]!);
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? mapUser(rows[0]) : null;
}
