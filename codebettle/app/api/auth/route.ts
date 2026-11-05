import { NextRequest, NextResponse } from 'next/server';
import { login, createSessionToken } from '@/lib/auth';
import { getUserByEmail, users } from '@/lib/data/users';

export async function POST(request: NextRequest) {
  const { action, email, password, name, phone } = await request.json();

  if (action === 'login') {
    const user = await login(email, password);
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
    const dbUser = getUserByEmail(email)!;
    const token = createSessionToken(dbUser);
    const response = NextResponse.json({ user, success: true });
    response.cookies.set('cb_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return response;
  }

  if (action === 'register') {
    const existing = getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }
    const newUser = {
      id: `student-${Date.now()}`,
      name,
      email,
      password,
      phone,
      role: 'student' as const,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1C1C1C&textColor=F5C518`,
      status: 'active' as const,
      joinedAt: new Date().toISOString().split('T')[0],
      enrolledCourses: [],
      wishlist: [],
    };
    users.push(newUser);
    const token = createSessionToken(newUser);
    const response = NextResponse.json({ user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, avatar: newUser.avatar }, success: true });
    response.cookies.set('cb_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return response;
  }

  if (action === 'logout') {
    const response = NextResponse.json({ success: true });
    response.cookies.delete('cb_session');
    return response;
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
