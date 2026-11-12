'use client';
import { motion, useInView } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import { Users, BookOpen, Award, Star } from 'lucide-react';

const stats = [
  { icon: <Users className="w-8 h-8" />, value: 1500, suffix: '+', label: 'Active Students', color: 'text-primary-text' },
  { icon: <BookOpen className="w-8 h-8" />, value: 8, suffix: '+', label: 'Expert Courses', color: 'text-blue-400' },
  { icon: <Award className="w-8 h-8" />, value: 300, suffix: '+', label: 'Certificates Issued', color: 'text-green-400' },
  { icon: <Star className="w-8 h-8" />, value: 4.8, suffix: '', label: 'Average Rating', color: 'text-yellow-400', decimal: true },
];

function Counter({ to, decimal = false }: { to: number; decimal?: boolean }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
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
  }, [inView, to, decimal]);

  return <span ref={ref}>{decimal ? count.toFixed(1) : count.toLocaleString()}</span>;
}

export default function StatsSection() {
  return (
    <section className="py-20 bg-dark-card border-y border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="text-center"
            >
              <div className={`${stat.color} flex justify-center mb-4 opacity-80`}>{stat.icon}</div>
              <p className={`text-4xl font-black ${stat.color}`}>
                <Counter to={stat.value} decimal={stat.decimal} />{stat.suffix}
              </p>
              <p className="text-muted text-sm mt-2">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
