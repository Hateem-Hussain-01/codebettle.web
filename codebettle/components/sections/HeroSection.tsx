'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { ArrowRight, Play, Code2, Cpu, Globe, Smartphone } from 'lucide-react';

const TYPEWRITER_WORDS = ['Web Developer', 'Mobile Developer', 'Data Scientist', 'UI/UX Designer', 'DevOps Engineer'];

const FLOATING_ICONS = [
  { icon: <Code2 className="w-5 h-5" />, style: 'top-[20%] left-[8%]', delay: 0 },
  { icon: <Cpu className="w-5 h-5" />, style: 'top-[15%] right-[12%]', delay: 0.5 },
  { icon: <Globe className="w-5 h-5" />, style: 'bottom-[30%] left-[5%]', delay: 1 },
  { icon: <Smartphone className="w-5 h-5" />, style: 'bottom-[25%] right-[8%]', delay: 1.5 },
];

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
      {/* Background gradient */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-primary/3 rounded-full blur-[100px]" />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(245,197,24,1) 1px, transparent 1px), linear-gradient(90deg, rgba(245,197,24,1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Floating icons */}
      {FLOATING_ICONS.map((item, i) => (
        <motion.div
          key={i}
          className={`absolute ${item.style} w-12 h-12 rounded-xl glass-card flex items-center justify-center text-primary hidden lg:flex`}
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: item.delay, ease: 'easeInOut' }}
        >
          {item.icon}
        </motion.div>
      ))}

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-32">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary mb-8">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            Pakistan's #1 Digital Institute
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-7xl font-black text-white leading-tight mb-6"
        >
          Become a{' '}
          <span className="relative">
            <span className="gradient-text">{displayed}</span>
            <span className="inline-block w-0.5 h-10 bg-primary ml-1 animate-pulse" />
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
          <Link href="/courses">
            <Button size="lg" variant="primary" neon className="group">
              Explore Courses
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/about">
            <Button size="lg" variant="secondary" className="group">
              <Play className="w-4 h-4" />
              How It Works
            </Button>
          </Link>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 grid grid-cols-3 gap-8 max-w-md mx-auto"
        >
          {[['1,500+', 'Students'], ['8+', 'Courses'], ['5+', 'Instructors']].map(([num, label]) => (
            <div key={label} className="text-center">
              <p className="text-2xl sm:text-3xl font-black gradient-text">{num}</p>
              <p className="text-xs text-muted mt-1">{label}</p>
            </div>
          ))}
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
