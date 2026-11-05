import { cookies } from 'next/headers';
import { getUserByEmail, getUserById, type User } from './data/users';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  avatar?: string;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('cb_session');
  if (!sessionCookie) return null;

  try {
    const decoded = Buffer.from(sessionCookie.value, 'base64').toString('utf-8');
    const user = JSON.parse(decoded) as SessionUser;
    const dbUser = getUserById(user.id);
    if (!dbUser || dbUser.status === 'suspended') return null;
    return user;
  } catch {
    return null;
  }
}

export function createSessionToken(user: User): string {
  const session: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
  };
  return Buffer.from(JSON.stringify(session)).toString('base64');
}

export async function login(email: string, password: string): Promise<SessionUser | null> {
  const user = getUserByEmail(email);
  if (!user || user.password !== password) return null;
  if (user.status === 'suspended') return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
  };
}
