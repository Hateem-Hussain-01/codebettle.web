'use client';
import { motion, useReducedMotion, useScroll } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import PublicPageBackdrop from '@/components/ui/PublicPageBackdrop';
import HeroSceneWrapper from '@/components/sections/HeroSceneWrapper';
import { ArrowRight } from 'lucide-react';

const TYPEWRITER_WORDS = ['Web Developer', 'Mobile Developer', 'Data Scientist', 'UI/UX Designer', 'DevOps Engineer'];

// Hero stats (Eman, 17 Nov 2026 — from the calm-vs-3D preview
// screenshot): 1500+ Students trained / 300+ Reviews / 4.8/5 Average
// rating. They count up from 0 ON PAGE LOAD (not on scroll), so they
// are a separate row from the StatsSection below the hero (which keeps
// its own four stats and its scroll-gated Counter, untouched).
const HERO_STATS = [
  { value: 1500, suffix: '+', label: 'Students trained', decimal: false },
  { value: 300, suffix: '+', label: 'Reviews', decimal: false },
  { value: 4.8, suffix: '/5', label: 'Average rating', decimal: true },
];

// Count-up that starts on mount — i.e. on page load — never gated on
// scroll. Same ~1.8s / 60-step animation as the StatsSection Counter.
// Reduced-motion users see the final value immediately.
function HeroLoadCounter({ to, decimal = false }: { to: number; decimal?: boolean }) {
  const reduceMotion = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      setCount(to);
      return;
    }
    const duration = 1800;
    const steps = 60;
    const step = to / steps;
    let current = 0;
    const interval = setInterval(() => {
      current = Math.min(current + step, to);
      setCount(decimal ? Math.round(current * 10) / 10 : Math.floor(current));
      if (current >= to) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [to, decimal, reduceMotion]);

  return <span>{decimal ? count.toFixed(1) : count.toLocaleString()}</span>;
}

/**
 * Home hero — screenshot redesign (Eman, 17 Nov 2026, from the
 * calm-vs-3D preview): two columns — left the badge, the two-line
 * headline, the subtext and the two CTAs; right the student.py code
 * window; the three hero stats along the bottom of the hero, counting
 * up on page load.
 *
 * The typewriter KEEPS working exactly as before (Eman, 17 Nov 2026,
 * correction): it cycles the role phrases one after another on line 2
 * of the headline ("Become a" stays on line 1, the changing role on
 * line 2) and must NEVER wrap to a third line — the PR #62 approach
 * (whitespace-nowrap + fluid clamp) is kept, re-sized for the narrower
 * left column: clamp(1.9rem, 4.6vw, 3.1rem), the preview's own sizing.
 * The longest role ("Mobile Developer") fits the column at the 3.1rem
 * cap on desktop and at the 1.9rem floor on small phones.
 *
 * What did NOT change: the real 3D scene behind the content (React
 * Three Fiber, scroll-driven camera, lazy + reduced-motion safe), the
 * Mac-window frame around the hero (address bar, no top dots), the
 * StatsSection below the hero, and the navbar. The scroll indicator
 * stays — it sits in the bottom padding below the stats row, so it
 * cannot overlap them.
 */
export default function HeroSection() {
  const [wordIndex, setWordIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [typing, setTyping] = useState(true);
  // Step 2: hero scroll progress (0 → 1 as the hero scrolls out),
  // passed to the 3D scene wrapper.
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });

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
    <section ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* Shared public-page backdrop (static grid + glows). The hero
          scene already carries the particle field, so no second
          particle canvas here. */}
      <PublicPageBackdrop variant="hero" particles={false} />
      {/* Real 3D scene (lazy, desktop + WebGL only — phones and
          reduced-motion users keep the static backdrop above). */}
      <HeroSceneWrapper scrollYProgress={scrollYProgress} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-28 w-full">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-12 items-center">
          {/* Left: badge, headline, subtext, CTAs. min-w-0 lets the
              column shrink below its min-content on narrow phones —
              without it the code window's longest line would force
              the single-column grid wider than the container and the
              text would run to the viewport edge. */}
          <div className="text-left min-w-0">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <span className="inline-flex items-center font-mono text-xs uppercase tracking-[0.16em] px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary-text mb-6">
                ADMISSIONS OPEN — NEW BATCHES
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              // NOTE (17 Nov 2026 — two-line headline): line 1 is the
              // static "Become a", line 2 is the typewriter role. Both
              // lines are whitespace-nowrap with the fluid clamp from
              // the preview (1.9rem floor → 3.1rem cap), so the longest
              // role ("Mobile Developer") fits its line at every
              // viewport and the headline NEVER wraps to a third line.
              // The clamp's max is smaller than the old centred
              // headline's (4.5rem) because the left column is
              // narrower than the old full-width container.
              className="text-[clamp(1.9rem,4.6vw,3.1rem)] whitespace-nowrap font-black leading-[1.08] mb-6"
            >
              <span className="block text-foreground">Become a</span>
              <span className="block">
                <span className="gradient-text">{displayed}</span>
                <span className="inline-block w-[2px] h-[0.75em] bg-primary ml-1 animate-pulse align-middle" />
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg text-muted max-w-xl mb-10 leading-relaxed"
            >
              Learn by building real projects, with mentors who review your work — from your first line of code to your first job.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
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
                <Link href="/book-a-call">
                  <Button size="lg" variant="outline">
                    Book a Call
                  </Button>
                </Link>
              </motion.span>
            </motion.div>
          </div>

          {/* Right: the student.py code window — the student's first
              Python program, exactly as in the preview. The 3 gold
              dots stay (dark + gold); the red/yellow/green dots
              belong to the course cards only. */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="relative min-w-0"
          >
            {/* Glow behind the window */}
            <div aria-hidden="true" className="absolute -inset-8 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="glass-card rounded-2xl overflow-hidden text-left shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)]">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border">
                  <span className="w-3 h-3 rounded-full bg-primary" />
                  <span className="w-3 h-3 rounded-full bg-primary/60" />
                  <span className="w-3 h-3 rounded-full bg-primary/30" />
                  <span className="ml-2 text-xs font-mono text-muted">student.py</span>
                </div>
                {/* overflow-x-auto + whitespace-nowrap: on narrow
                    phones the longest line (self.skills.append) is
                    wider than the window — it scrolls inside the
                    window instead of forcing the grid wider (see the
                    min-w-0 notes) or clipping mid-word. */}
                <div className="px-5 py-4 font-mono text-sm sm:text-base leading-7 overflow-x-auto whitespace-nowrap">
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">1</span>
                    <span>
                      <span className="text-primary-text">class</span>{' '}
                      <span className="text-foreground font-semibold">Developer</span>
                      <span className="text-muted">:</span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">2</span>
                    <span>
                      <span className="text-muted">&nbsp;&nbsp;&nbsp;&nbsp;</span>
                      <span className="text-primary-text">def</span>{' '}
                      <span className="text-foreground font-semibold">__init__</span>
                      <span className="text-muted">(self, name):</span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">3</span>
                    <span>
                      <span className="text-muted">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                      <span className="text-foreground">self.name</span>
                      <span className="text-muted"> = </span>
                      <span className="text-foreground">name</span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">4</span>
                    <span>
                      <span className="text-muted">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                      <span className="text-foreground">self.skills</span>
                      <span className="text-muted"> = []</span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">5</span>
                    <span>&nbsp;</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">6</span>
                    <span>
                      <span className="text-muted">&nbsp;&nbsp;&nbsp;&nbsp;</span>
                      <span className="text-primary-text">def</span>{' '}
                      <span className="text-foreground font-semibold">learn</span>
                      <span className="text-muted">(self, course):</span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">7</span>
                    <span>
                      <span className="text-muted">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                      <span className="text-foreground">self.skills.append</span>
                      <span className="text-muted">(course)</span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">8</span>
                    <span>
                      <span className="text-muted">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                      <span className="text-primary-text">return</span>{' '}
                      <span className="text-primary-light">&quot;Level up&quot;</span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">9</span>
                    <span>&nbsp;</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">10</span>
                    <span>
                      <span className="text-foreground">you</span>
                      <span className="text-muted"> = </span>
                      <span className="text-foreground font-semibold">Developer</span>
                      <span className="text-muted">(</span>
                      <span className="text-primary-light">&quot;Future You&quot;</span>
                      <span className="text-muted">)</span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">11</span>
                    <span>
                      <span className="text-foreground">you.learn</span>
                      <span className="text-muted">(</span>
                      <span className="text-primary-light">&quot;Python&quot;</span>
                      <span className="text-muted">)</span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted/60 select-none w-4 text-right">12</span>
                    <span className="text-muted"># start today</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Hero stats — count up on page load (see HeroLoadCounter).
            The row sits on the hero's bottom edge, above the scroll
            indicator's padding zone, so the two never overlap. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-14 sm:mt-16 flex flex-wrap gap-x-12 gap-y-6 border-t border-dark-border pt-8"
        >
          {HERO_STATS.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl sm:text-4xl font-black text-foreground">
                <HeroLoadCounter to={stat.value} decimal={stat.decimal} />
                <span className="text-primary-text">{stat.suffix}</span>
              </p>
              <p className="text-muted text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Scroll indicator — sits in the bottom padding below the stats
          row, so it cannot overlap them. */}
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
