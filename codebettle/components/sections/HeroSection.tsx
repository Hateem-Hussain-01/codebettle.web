'use client';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import PremiumBackdrop from '@/components/ui/PremiumBackdrop';
import TiltCard from '@/components/ui/TiltCard';
import { ArrowRight, Play, Code2, Cpu, Globe, Smartphone, Video, Award } from 'lucide-react';

const TYPEWRITER_WORDS = ['Web Developer', 'Mobile Developer', 'Data Scientist', 'UI/UX Designer', 'DevOps Engineer'];

const FLOATING_ICONS = [
  { icon: <Code2 className="w-5 h-5" />, style: 'top-[20%] left-[8%]', delay: 0 },
  { icon: <Cpu className="w-5 h-5" />, style: 'top-[15%] right-[12%]', delay: 0.5 },
  { icon: <Globe className="w-5 h-5" />, style: 'bottom-[30%] left-[5%]', delay: 1 },
  { icon: <Smartphone className="w-5 h-5" />, style: 'bottom-[25%] right-[8%]', delay: 1.5 },
];

/**
 * Home hero — premium 3D transformation (Eman, 16 Nov 2026).
 *
 * What changed vs before:
 * - The duplicate statistics row (1,500+ Students / 8+ Courses /
 *   5+ Instructors) is REMOVED — the separate StatsSection below the
 *   hero keeps those numbers (untouched). The space is rebalanced
 *   with a 3D-tilted glass code window + two floating chips, so the
 *   hero still feels complete.
 * - Depth backdrop (gold glows + faint grid + bottom fade) replaces
 *   the old flat gradient blobs.
 * - The floating icons now drift with the mouse (gentle parallax,
 *   transform-only, disabled under reduced motion).
 * - CTAs lift on hover and press in on tap.
 *
 * What did NOT change: the typewriter headline, the copy, the CTA
 * destinations, the scroll indicator, the badge.
 */
export default function HeroSection() {
  const [wordIndex, setWordIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [typing, setTyping] = useState(true);
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  // Mouse parallax (transform-only): the icon layer drifts a few px
  // toward the cursor; the backdrop glows drift the opposite way.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const iconsX = useTransform(sx, (v) => v * 16);
  const iconsY = useTransform(sy, (v) => v * 12);

  useEffect(() => {
    const word = TYPEWRITER_WORDS[wordIndex];
    let timeout: NodeJS.Timeout;

    if (typing) {
      if (displayed.length < word.length) {
        timeout = setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80);
      } else {
        timeout = setTimeout(() => setTyping(false), 1800);
      }
    } else {
      if (displayed.length > 0) {
        timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 50);
      } else {
        setWordIndex((i) => (i + 1) % TYPEWRITER_WORDS.length);
        setTyping(true);
      }
    }

    return () => clearTimeout(timeout);
  }, [displayed, typing, wordIndex]);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (reduceMotion || !sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background"
    >
      <PremiumBackdrop variant="hero" />

      {/* Floating icons — parallax layer (drifts with the mouse) */}
      <motion.div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ x: iconsX, y: iconsY }}>
        {FLOATING_ICONS.map((item, i) => (
          <motion.div
            key={i}
            className={`absolute ${item.style} w-12 h-12 rounded-xl glass-card flex items-center justify-center text-primary-text hidden lg:flex`}
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 3, repeat: Infinity, delay: item.delay, ease: 'easeInOut' }}
          >
            {item.icon}
          </motion.div>
        ))}
      </motion.div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-32">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary-text mb-8">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            Pakistan's #1 Digital Institute
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          // NOTE (16 Nov 2026 — hero headline wrap): the typewriter word
          // must stay on ONE line. whitespace-nowrap + a fluid clamp size
          // (20px on small phones → 72px on desktop) keeps even the
          // longest phrase ("Become a DevOps Engineer", ~1116px at 72px
          // in a wide bold font) inside the max-w-7xl container at every
          // viewport. Before this, the word wrapped to a second line and
          // the whole section below (subtext, CTAs, code window) jumped
          // down every time the word changed — a layout shift on each
          // typewriter cycle. The cursor height is em-relative so it
          // scales with the fluid font instead of a fixed 40px.
          className="text-[clamp(1.25rem,5.2vw,4.5rem)] whitespace-nowrap font-black text-foreground leading-tight mb-6"
        >
          Become a{' '}
          <span className="relative">
            <span className="gradient-text">{displayed}</span>
            <span className="inline-block w-[2px] h-[0.75em] bg-primary ml-1 animate-pulse align-middle" />
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg sm:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Expert-led courses in web development, mobile apps, data science, and design. Learn from industry professionals and build real-world projects.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <motion.span whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
            <Link href="/courses">
              <Button size="lg" variant="primary" neon className="group">
                Explore Courses
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </motion.span>
          <motion.span whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
            <Link href="/about">
              <Button size="lg" variant="secondary" className="group">
                <Play className="w-4 h-4" />
                How It Works
              </Button>
            </Link>
          </motion.span>
        </motion.div>

        {/* Hero visual — a 3D-tilted glass code window that replaces
            the removed statistics row and keeps the hero balanced.
            The code is the student's first Python program; the two
            floating chips name two real CodeBettle promises (live
            classes, verified certificates). */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="relative mt-16 sm:mt-20 max-w-2xl mx-auto"
        >
          {/* Glow behind the window */}
          <div aria-hidden="true" className="absolute -inset-8 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <TiltCard max={5} className="relative">
            <div className="glass-card rounded-2xl overflow-hidden text-left shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)]">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border">
                <span className="w-3 h-3 rounded-full bg-primary" />
                <span className="w-3 h-3 rounded-full bg-primary/60" />
                <span className="w-3 h-3 rounded-full bg-primary/30" />
                <span className="ml-2 text-xs font-mono text-muted">hello.py — Python</span>
                <span className="ml-auto text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary-text border border-primary/30">
                  Python
                </span>
              </div>
              <div className="px-5 py-4 font-mono text-sm sm:text-base leading-7">
                <div className="flex gap-4">
                  <span className="text-muted/60 select-none w-4 text-right">1</span>
                  <span className="text-muted"># Your first program — Python</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-muted/60 select-none w-4 text-right">2</span>
                  <span>
                    <span className="text-primary-text">def</span>{' '}
                    <span className="text-foreground font-semibold">become_developer</span>
                    <span className="text-muted">():</span>
                  </span>
                </div>
                <div className="flex gap-4">
                  <span className="text-muted/60 select-none w-4 text-right">3</span>
                  <span>
                    <span className="text-muted">&nbsp;&nbsp;&nbsp;&nbsp;skills = [</span>
                    <span className="text-primary-light">&quot;Python&quot;, &quot;AI&quot;, &quot;Web&quot;</span>
                    <span className="text-muted">]</span>
                  </span>
                </div>
                <div className="flex gap-4">
                  <span className="text-muted/60 select-none w-4 text-right">4</span>
                  <span>
                    <span className="text-muted">&nbsp;&nbsp;&nbsp;&nbsp;</span>
                    <span className="text-primary-text">return</span>{' '}
                    <span className="text-foreground">build_career(skills)</span>
                  </span>
                </div>
              </div>
            </div>
          </TiltCard>

          {/* Floating chips — real promises, floating gently. They sit
              fully clear of the window (above-left / below-right) so
              they never cover the header or the code lines. */}
          <div className="absolute -top-14 left-0 hidden lg:flex items-center gap-2 glass-card rounded-full px-4 py-2.5 text-sm font-medium text-foreground shadow-lg animate-float-slow whitespace-nowrap">
            <Video className="w-4 h-4 text-primary-text" />
            Live interactive classes
          </div>
          <div
            className="absolute -bottom-14 right-0 hidden lg:flex items-center gap-2 glass-card rounded-full px-4 py-2.5 text-sm font-medium text-foreground shadow-lg animate-float-slower whitespace-nowrap"
            style={{ animationDelay: '1.2s' }}
          >
            <Award className="w-4 h-4 text-primary-text" />
            Verified certificates
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <div className="w-6 h-10 rounded-full border-2 border-muted flex justify-center pt-2">
          <div className="w-1.5 h-1.5 bg-primary rounded-full" />
        </div>
      </motion.div>
    </section>
  );
}
