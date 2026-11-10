'use client';

import AuthShell from '@/components/auth/AuthShell';
import LoginForm from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';

/**
 * Create Account route. Renders the shared sliding-panel auth shell in
 * 'register' mode; the panel button switches to Sign In in place
 * (and the shell updates the URL to /auth/login after the slide).
 */
export default function RegisterPage() {
  return (
    <AuthShell initialMode="register" loginForm={<LoginForm />} registerForm={<RegisterForm />} />
  );
}
