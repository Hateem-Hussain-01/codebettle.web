'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '@/components/ui/Button';

interface NavbarProps {
  session?: { name: string; role: string; avatar?: string } | null;
}

export default function Navbar({ session }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const portalLink = session ? `/${session.role}/dashboard` : null;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'bg-dark/95 backdrop-blur-md border-b border-dark-border shadow-lg' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="CodeBettle" width={36} height={36} className="rounded-lg" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="text-xl font-bold gradient-text">CodeBettle</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/courses" className="text-sm text-muted hover:text-white transition-colors">Courses</Link>
            <Link href="/instructors" className="text-sm text-muted hover:text-white transition-colors">Instructors</Link>
            <Link href="/blog" className="text-sm text-muted hover:text-white transition-colors">Blog</Link>
            <Link href="/about" className="text-sm text-muted hover:text-white transition-colors">About</Link>
            <Link href="/contact" className="text-sm text-muted hover:text-white transition-colors">Contact</Link>
          </div>

          {/* Auth */}
          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <Link href={portalLink!}>
                <Button variant="primary" size="sm">
                  {session.role === 'admin' ? 'Admin Panel' : session.role === 'instructor' ? 'Dashboard' : 'My Learning'}
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/auth/login"><Button variant="ghost" size="sm">Login</Button></Link>
                <Link href="/auth/register"><Button variant="primary" size="sm">Get Started</Button></Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-muted hover:text-white transition-colors p-2">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-dark-card border-b border-dark-border"
          >
            <div className="px-4 py-4 flex flex-col gap-3">
              {[['/', 'Home'], ['/courses', 'Courses'], ['/instructors', 'Instructors'], ['/blog', 'Blog'], ['/about', 'About'], ['/contact', 'Contact']].map(([href, label]) => (
                <Link key={href} href={href} className="text-muted hover:text-white py-1.5 text-sm" onClick={() => setMobileOpen(false)}>{label}</Link>
              ))}
              <div className="pt-2 border-t border-dark-border flex flex-col gap-2">
                {session ? (
                  <Link href={portalLink!} onClick={() => setMobileOpen(false)}>
                    <Button variant="primary" size="sm" fullWidth>Go to Portal</Button>
                  </Link>
                ) : (
                  <>
                    <Link href="/auth/login" onClick={() => setMobileOpen(false)}><Button variant="secondary" size="sm" fullWidth>Login</Button></Link>
                    <Link href="/auth/register" onClick={() => setMobileOpen(false)}><Button variant="primary" size="sm" fullWidth>Get Started</Button></Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
