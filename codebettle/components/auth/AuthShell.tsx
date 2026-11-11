'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, FolderKanban, GraduationCap } from 'lucide-react';
import AuthSocialNav from './AuthSocialNav';

export type AuthMode = 'login' | 'register';

interface AuthShellProps {
  /** Which form the route opened with: /auth/login -> 'login', /auth/register -> 'register'. */
  initialMode: AuthMode;
  loginForm: ReactNode;
  registerForm: ReactNode;
}

/**
 * Shared auth shell: CSS grid-texture page background, the two-panel
 * sliding card (desktop) / single form + compact switch banner (mobile),
 * and the social navbar below the card.
 *
 * Sliding-panel behaviour (mirrors the reference video, in CodeBettle's
 * dark/gold theme instead of the video's purple): the card is split in
 * two — the Sign In form on the left, the Create Account form on the
 * right — and a gold overlay panel covers the inactive half. Switching
 * mode slides the overlay across the card (framer-motion, 0.6s) while
 * the form underneath is revealed. The URL is updated with
 * `router.replace` only after the slide finishes, so a refresh keeps
 * the right mode without cutting the animation short; the current query
 * string (e.g. ?redirect=...) is carried over.
 *
 * On small screens there is no room for two panels: only the active
 * form shows, with a compact banner above the card to switch modes.
 * The texture stays in the page background only — never inside the
 * cards — and the cards keep their opaque dark-card style so text
 * contrast is unchanged.
 */
/** Benefit points shown on the gold overlay panel, in both modes.
 * True to CodeBettle — no invented numbers or stats. */
const PANEL_BENEFITS = [
  { icon: FolderKanban, text: 'Hands-on projects in every course' },
  { icon: GraduationCap, text: 'Learn from expert instructors' },
  { icon: Award, text: 'Certificates on completion' },
] as const;

function PanelBenefits() {
  return (
    <ul className="mt-6 space-y-2.5 text-left">
      {PANEL_BENEFITS.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-2.5 text-sm font-semibold text-dark/85">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dark/10">
            <Icon className="h-4 w-4" />
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}

export default function AuthShell({ initialMode, loginForm, registerForm }: AuthShellProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const replaceTimer = useRef<number | null>(null);

  const switchMode = (next: AuthMode) => {
    if (next === mode) return;
    setMode(next);
    if (replaceTimer.current) window.clearTimeout(replaceTimer.current);
    // Let the 0.6s slide finish before the route change remounts the page.
    replaceTimer.current = window.setTimeout(() => {
      const query = window.location.search;
      router.replace(next === 'login' ? `/auth/login${query}` : `/auth/register${query}`);
    }, 650);
  };

  useEffect(
    () => () => {
      if (replaceTimer.current) window.clearTimeout(replaceTimer.current);
    },
    []
  );

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-4">
      {/* Page background: code-based grid texture (subtle) + dark veil + gold glow.
          The texture never enters the cards. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255, 255, 255, 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.045) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-background/80" />
      <div aria-hidden="true" className="absolute top-1/4 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-[100px]" />

      {/* Mobile switch banner: the sliding overlay is desktop-only. */}
      <div className="relative z-10 mb-3 flex w-full max-w-4xl items-center justify-between gap-3 rounded-xl border border-dark-border bg-dark-card px-4 py-2.5 md:hidden">
        <p className="text-sm text-muted">
          {mode === 'login' ? 'New to CodeBettle?' : 'Already have an account?'}
        </p>
        <button
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          className="shrink-0 cursor-pointer rounded-full border border-primary/60 px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-dark"
        >
          {mode === 'login' ? 'Sign Up' : 'Sign In'}
        </button>
      </div>

      {/* Sliding-panel card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-4xl"
      >
        <div className="relative overflow-hidden rounded-2xl border border-dark-border bg-dark-card shadow-2xl">
          <div className="grid md:grid-cols-2">
            {/* Sign In form — left half. Hidden on mobile when register is active. */}
            <div
              aria-hidden={mode === 'register' || undefined}
              inert={mode === 'register' || undefined}
              className={`flex flex-col justify-center p-5 sm:p-6 ${mode === 'register' ? 'hidden md:flex' : ''}`}
            >
              <Suspense fallback={<div className="text-center text-muted">Loading...</div>}>
                {loginForm}
              </Suspense>
            </div>
            {/* Create Account form — right half. Hidden on mobile when login is active. */}
            <div
              aria-hidden={mode === 'login' || undefined}
              inert={mode === 'login' || undefined}
              className={`flex flex-col justify-center p-5 sm:p-6 ${mode === 'login' ? 'hidden md:flex' : ''}`}
            >
              {registerForm}
            </div>
          </div>

          {/* Gold overlay panel — desktop only, slides across the card. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 hidden w-1/2 flex-col items-center justify-center bg-[linear-gradient(135deg,#FDE68A_0%,#F5C518_45%,#C9A000_100%)] px-8 text-center text-dark md:flex"
            initial={false}
            animate={{ x: mode === 'login' ? '100%' : '0%' }}
            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          >
            {/* Decorative soft circles for depth */}
            <div aria-hidden="true" className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
            <div aria-hidden="true" className="absolute -bottom-12 -left-8 h-44 w-44 rounded-full bg-dark/10 blur-2xl" />
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="relative flex flex-col items-center"
              >
                {mode === 'login' ? (
                  <>
                    <h2 className="text-3xl font-black">Welcome Back!</h2>
                    <p className="mt-3 text-sm font-medium text-dark/75">
                      Sign in to access your account and continue where you left off.
                    </p>
                    <PanelBenefits />
                    <button
                      type="button"
                      onClick={() => switchMode('register')}
                      className="mt-6 cursor-pointer rounded-full border-2 border-dark/80 px-8 py-2.5 text-sm font-bold tracking-widest text-dark transition-colors hover:bg-dark hover:text-primary"
                    >
                      SIGN UP
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl font-black">Create Your Account!</h2>
                    <p className="mt-3 text-sm font-medium text-dark/75">
                      Join us today and explore all the features we have to offer.
                    </p>
                    <PanelBenefits />
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="mt-6 cursor-pointer rounded-full border-2 border-dark/80 px-8 py-2.5 text-sm font-bold tracking-widest text-dark transition-colors hover:bg-dark hover:text-primary"
                    >
                      SIGN IN
                    </button>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>

      {/* Social navbar — below the card, outside it. */}
      <div className="relative z-10 mt-4">
        <AuthSocialNav />
      </div>
    </div>
  );
}
