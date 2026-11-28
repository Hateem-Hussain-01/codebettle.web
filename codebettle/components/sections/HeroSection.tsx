'use client';
import { motion, useReducedMotion, useScroll } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import PublicPageBackdrop from '@/components/ui/PublicPageBackdrop';
import HeroSceneWrapper from '@/components/sections/HeroSceneWrapper';
import { ArrowRight } from 'lucide-react';

const TYPEWRITER_WORDS = ['Web Developer', 'Mobile Developer', 'Data Scientist', 'UI/UX Designer', 'DevOps Engineer'];

// The student.py code window types itself out once on page load
// (Eman, 28 Nov 2026): the code writes start to end, then stops —
// no loop, no restart. Each line is styled segments, transcribed
// exactly from the static window (same text, same classes); the
// render below reveals them character by character.
//
// Timing: one character every CODE_TYPE_MS, after a short start
// delay so the window has settled in (its fade-up runs 0.5s in).
// ~243 characters ≈ 3.8s of typing. Reduced-motion users get the
// full code at once — no animation.
type CodeSegment = { text: string; className: string };
const CODE_LINES: CodeSegment[][] = [
  [
    { text: 'class ', className: 'text-primary-text' },
    { text: 'Developer', className: 'text-foreground font-semibold' },
    { text: ':', className: 'text-muted' },
  ],
  [
    { text: '    ', className: 'text-muted' },
    { text: 'def ', className: 'text-primary-text' },
    { text: '__init__', className: 'text-foreground font-semibold' },
    { text: '(self, name):', className: 'text-muted' },
  ],
  [
    { text: '        ', className: 'text-muted' },
    { text: 'self.name', className: 'text-foreground' },
    { text: ' = ', className: 'text-muted' },
    { text: 'name', className: 'text-foreground' },
  ],
  [
    { text: '        ', className: 'text-muted' },
    { text: 'self.skills', className: 'text-foreground' },
    { text: ' = []', className: 'text-muted' },
  ],
  [{ text: ' ', className: '' }],
  [
    { text: '    ', className: 'text-muted' },
    { text: 'def ', className: 'text-primary-text' },
    { text: 'learn', className: 'text-foreground font-semibold' },
    { text: '(self, course):', className: 'text-muted' },
  ],
  [
    { text: '        ', className: 'text-muted' },
    { text: 'self.skills.append', className: 'text-foreground' },
    { text: '(course)', className: 'text-muted' },
  ],
  [
    { text: '        ', className: 'text-muted' },
    { text: 'return ', className: 'text-primary-text' },
    { text: '"Level up"', className: 'text-primary-light' },
  ],
  [{ text: ' ', className: '' }],
  [
    { text: 'you', className: 'text-foreground' },
    { text: ' = ', className: 'text-muted' },
    { text: 'Developer', className: 'text-foreground font-semibold' },
    { text: '(', className: 'text-muted' },
    { text: '"Future You"', className: 'text-primary-light' },
    { text: ')', className: 'text-muted' },
  ],
  [
    { text: 'you.learn', className: 'text-foreground' },
    { text: '(', className: 'text-muted' },
    { text: '"Python"', className: 'text-primary-light' },
    { text: ')', className: 'text-muted' },
  ],
  [{ text: '# start today', className: 'text-muted' }],
];
const CODE_LINE_LENGTHS = CODE_LINES.map((line) => line.reduce((n, s) => n + s.text.length, 0));
// Reveal-stream offset of each line: a line costs its characters
// plus one step for the move onto the next line.
const CODE_LINE_OFFSETS = CODE_LINE_LENGTHS.reduce<number[]>((offsets, len, i) => {
  offsets.push(i === 0 ? 0 : offsets[i - 1] + CODE_LINE_LENGTHS[i - 1] + 1);
  return offsets;
}, []);
const CODE_TOTAL = CODE_LINE_LENGTHS.reduce((n, len) => n + len, 0) + (CODE_LINES.length - 1);
const CODE_TYPE_MS = 15;
const CODE_TYPE_START_DELAY_MS = 500;
// The code body is whitespace-nowrap (no pre), so plain spaces
// would collapse — indentation is non-breaking spaces, exactly as
// the old static window's &nbsp; entities were.
const nbsp = (s: string) => s.replace(/ /g, ' ');

/**
 * Home hero — screenshot redesign (Eman, 17 Nov 2026, from the
 * calm-vs-3D preview): two columns — left the badge, the two-line
 * headline, the subtext and the two CTAs; right the student.py code
 * window; the stats live only in the StatsSection below the hero —
 * the upper hero stats row was REMOVED (Eman, 20 Nov 2026: the same
 * numbers appeared twice, "upper walay stats ko remove kr do").
 *
 * The code window types itself out once on load (Eman, 28 Nov
 * 2026): start to end, then it stops — no loop. See CODE_LINES.
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
  // Code-window typewriter (Eman, 28 Nov 2026): characters revealed
  // so far, 0 → CODE_TOTAL, then it stops. Reduced motion shows the
  // full code at once.
  const reduceMotion = useReducedMotion();
  const [codeTyped, setCodeTyped] = useState(0);
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

  useEffect(() => {
    if (reduceMotion) {
      setCodeTyped(CODE_TOTAL);
      return;
    }
    if (codeTyped >= CODE_TOTAL) return;
    const delay = codeTyped === 0 ? CODE_TYPE_START_DELAY_MS : CODE_TYPE_MS;
    const timeout = setTimeout(() => setCodeTyped((n) => Math.min(n + 1, CODE_TOTAL)), delay);
    return () => clearTimeout(timeout);
  }, [codeTyped, reduceMotion]);

  return (
    <section ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* Shared public-page backdrop (static grid + glows). The hero
          scene already carries the particle field, so no second
          particle canvas here. Hero readability (Eman, 20 Nov 2026
          — first step: reduce opacity, do NOT remove): the backdrop
          sits behind the headline too, so it renders at half
          strength; the 3D scene itself is dimmed to 35% in
          HeroSceneWrapper. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-50">
        <PublicPageBackdrop variant="hero" particles={false} />
      </div>
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
              {/* The badge background is SOLID bg-background (17 Nov 2026
                  — badge legibility): the pill used to be bg-primary/10,
                  and the gold 3D icosahedron drifting behind the hero
                  showed through it, hiding the pill's left border and
                  partly obscuring the "A" in "ADMISSIONS" on the live
                  page. bg-background is opaque in both themes and
                  matches the hero section behind it, so no 3D shape can
                  ever show through again. Never make this translucent
                  without re-checking the badge in a real browser. */}
              <span className="inline-flex items-center font-mono text-xs uppercase tracking-[0.16em] px-4 py-2 rounded-full border border-primary/30 bg-background text-primary-text mb-6">
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
              belong to the course cards only. The code types itself
              out once on load (Eman, 28 Nov 2026) — see CODE_LINES
              above. Unrevealed characters render opacity-0, so the
              window keeps its final height from the first paint and
              nothing below it shifts as the code appears. */}
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
                  {CODE_LINES.map((line, i) => {
                    const len = CODE_LINE_LENGTHS[i];
                    const offset = CODE_LINE_OFFSETS[i];
                    const reveal = Math.max(0, Math.min(len, codeTyped - offset));
                    // The caret sits at the typing position — the
                    // first line the stream has reached but not
                    // finished. Once the code is complete it is gone.
                    const isActive =
                      codeTyped < CODE_TOTAL && codeTyped >= offset && codeTyped < offset + len + 1;
                    let used = 0;
                    return (
                      <div key={i} className="flex gap-4">
                        <span className="text-muted/60 select-none w-4 text-right">{i + 1}</span>
                        <span>
                          {line.map((seg, j) => {
                            const shown = Math.max(0, Math.min(seg.text.length, reveal - used));
                            const hidden = seg.text.slice(shown);
                            used += seg.text.length;
                            return (
                              <span key={j} className={seg.className || undefined}>
                                {nbsp(seg.text.slice(0, shown))}
                                {hidden.length > 0 && <span className="opacity-0">{nbsp(hidden)}</span>}
                              </span>
                            );
                          })}
                          {isActive && (
                            <span className="inline-block w-2 h-[1.1em] bg-primary animate-pulse align-middle" />
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

      </div>

      {/* Scroll indicator — sits in the bottom padding. */}
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
