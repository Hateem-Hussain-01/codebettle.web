import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const session = request.cookies.get('cb_session');
  const { pathname } = request.nextUrl;

  const protectedRoutes = ['/student', '/instructor', '/admin'];
  const isProtected = protectedRoutes.some(r => pathname.startsWith(r));

  if (!isProtected) return NextResponse.next();

  if (!session) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  try {
    const decoded = Buffer.from(session.value, 'base64').toString('utf-8');
    const user = JSON.parse(decoded);

    if (pathname.startsWith('/student') && user.role !== 'student') {
      return NextResponse.redirect(new URL(`/${user.role}/dashboard`, request.url));
    }
    if (pathname.startsWith('/instructor') && user.role !== 'instructor') {
      return NextResponse.redirect(new URL(`/${user.role === 'student' ? 'student' : 'admin'}/dashboard`, request.url));
    }
    if (pathname.startsWith('/admin') && user.role !== 'admin') {
      return NextResponse.redirect(new URL(`/${user.role}/dashboard`, request.url));
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
}

export const config = {
  matcher: ['/student/:path*', '/instructor/:path*', '/admin/:path*'],
};
