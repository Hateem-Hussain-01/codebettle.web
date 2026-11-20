'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
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
  const colors = {
    yellow: 'text-primary-text bg-primary/10',
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    red: 'text-red-400 bg-red-400/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card hover glow glass={glass}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted text-sm">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {typeof value === 'number' ? (
                <CountUp to={value} decimal={decimal} prefix={prefix} suffix={suffix} />
              ) : (
                value
              )}
            </p>
            {subtitle && <p className="text-muted text-xs mt-1">{subtitle}</p>}
            {trend && (
              <p className={cn('text-xs mt-2 font-medium', trend.value >= 0 ? 'text-green-400' : 'text-red-400')}>
                {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
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
