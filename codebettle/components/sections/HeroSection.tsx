'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import PremiumBackdrop from '@/components/ui/PremiumBackdrop';
import HeroSceneWrapper from '@/components/sections/HeroSceneWrapper';
import { ArrowRight, Play } from 'lucide-react';

const TYPEWRITER_WORDS = ['Web Developer', 'Mobile Developer', 'Data Scientist', 'UI/UX Designer', 'DevOps Engineer'];

/**
 * Home hero — fully-3D public site, Step 1 (Eman, 17 Nov 2026).
 *
 * The hero is now a real 3D scene (React Three Fiber): floating gold
 * shapes + a gold particle field behind the content, with a slow
 * mouse-move camera parallax — lazy-loaded, reduced-motion safe, and
 * static on phones. It REPLACES the old PR #60 hero motion: the
 * framer-motion parallax layer, the floating icons, the TiltCard on
 * the code window and the two floating chips are all gone.
 *
 * What did NOT change: the typewriter headline (still one line —
 * see the PR #62 note on the h1), the copy, the CTA destinations,
 * the scroll indicator, the badge, and the Python code window
 * (static now, no tilt). The duplicate statistics row is still gone
 * — the separate StatsSection below the hero keeps those numbers.
 */
export default function HeroSection() {
  const [wordIndex, setWordIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [typing, setTyping] = useState(true);

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

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      <PremiumBackdrop variant="hero" />
      {/* Real 3D scene (lazy, desktop + WebGL only — phones and
          reduced-motion users keep the static backdrop above). */}
      <HeroSceneWrapper />

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

        {/* Hero visual — the glass code window, static now (the 3D
            scene behind it carries the motion). The code is the
            student's first Python program. */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="relative mt-16 sm:mt-20 max-w-2xl mx-auto"
        >
          {/* Glow behind the window */}
          <div aria-hidden="true" className="absolute -inset-8 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
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
