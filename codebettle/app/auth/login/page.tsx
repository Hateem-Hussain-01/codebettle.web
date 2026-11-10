'use client';

import AuthShell from '@/components/auth/AuthShell';
import LoginForm from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';

/**
 * Sign In route. Renders the shared sliding-panel auth shell in
 * 'login' mode; the panel button switches to Create Account in place
 * (and the shell updates the URL to /auth/register after the slide).
 */
export default function LoginPage() {
  return (
    <AuthShell initialMode="login" loginForm={<LoginForm />} registerForm={<RegisterForm />} />
  );
}
