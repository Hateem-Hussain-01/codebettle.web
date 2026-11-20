'use client';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import Card from './Card';
import CountUp from './CountUp';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  /**
   * The stat value. A NUMBER counts up on mount (CodeBettle's own
   * ~1.8s CountUp — see components/ui/CountUp.tsx); a STRING renders
   * as-is (e.g. a pre-formatted label that cannot count up).
   */
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: 'yellow' | 'blue' | 'green' | 'purple' | 'red';
  trend?: { value: number; label: string };
  /** Stagger delay in seconds (e.g. 0.05 + index * 0.06). Defaults to 0. */
  delay?: number;
  /** One decimal place for a numeric value (e.g. an average rating). Defaults to false. */
  decimal?: boolean;
  /** Text before a numeric value (e.g. "PKR "). Defaults to ''. */
  prefix?: string;
  /** Text after a numeric value (e.g. "K"). Defaults to ''. */
  suffix?: string;
  /** V32 glass surface (translucent + blur) on the underlying Card. Defaults to false. */
  glass?: boolean;
  /**
   * Optional destination for the "View more" link under the value
   * (V32 reference: every stat card links onward; Eman, 20 Nov 2026
   * — dashboard items lacked the reference's hierarchy). Only real
   * routes the user can open — never invented. Absent = no link.
   */
  href?: string;
}

export default function StatCard({ title, value, subtitle, icon, color = 'yellow', trend, delay = 0, decimal = false, prefix = '', suffix = '', glass = false, href }: StatCardProps) {
  // Reduced motion: no hover lift at all (the entrance below is
  // already instant under reduced motion via framer-motion).
  const reduceMotion = useReducedMotion();
  const colors = {
    yellow: 'text-primary-text bg-primary/10',
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    red: 'text-red-400 bg-red-400/10',
  };

  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      // Dashboard V32-EXACT (Eman, 20 Nov 2026): the video's own
      // hover lift — whileHover y:-5 on the card. This REPLACES the
      // card-lift (-2px) the adapted V32 used: the inner Card gets no
      // `hover` prop any more, so the two lifts never stack (-7px).
      // Reduced motion disables the lift entirely.
      whileHover={reduceMotion ? undefined : { y: -5 }}
    >
      {/* Equal-height stat cards (Eman, 20 Nov 2026 — "ye cards ka
          size same kro"): the grid item (this motion.div) stretches
          to the row height, but the Card inside sized to its own
          content — so a card whose title wrapped ("Teacher-authored")
          or that carried a subtitle ("1 read (2%)") stuck out below
          the rest. h-full on BOTH keeps every card's bottom aligned
          in any grid row, on every dashboard that uses StatCard. */}
      <Card glow glass={glass} className="h-full">
        <div className="flex items-start justify-between">
          <div>
            {/* Fixed label area: min-h-10 reserves exactly two
                text-sm lines, so a one-line title and a wrapped
                two-line title start their numbers at the same y.
                The label text itself never changes. */}
            <p className="text-muted text-sm min-h-10">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {typeof value === 'number' ? (
                <CountUp to={value} decimal={decimal} prefix={prefix} suffix={suffix} />
              ) : (
                value
              )}
            </p>
            {/* Subtext line reserved on every card: the slot always
                renders (a non-breaking space when there is no
                subtitle), so a card with a subtitle and a card
                without one keep the same internal rhythm and the
                same height. */}
            <p className="text-muted text-xs mt-1 min-h-4">{subtitle ?? '\u00A0'}</p>
            {trend && (
              // V32-EXACT: the video's change line — ArrowUpRight /
              // ArrowDownRight (lucide, like the video's own snippet)
              // + % in emerald-400 / red-400. Only real computed
              // deltas are ever passed; no trend = no line.
              <p className={cn('mt-2 flex items-center gap-1 text-xs font-medium', trend.value >= 0 ? 'text-green-400' : 'text-red-400')}>
                {trend.value >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(trend.value)}% {trend.label}
              </p>
            )}
            {href && (
              <Link href={href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline">
                View more <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <div className={cn('p-3 rounded-xl', colors[color])}>
            {icon}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
