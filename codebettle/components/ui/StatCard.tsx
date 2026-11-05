'use client';
import { motion } from 'framer-motion';
import Card from './Card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: 'yellow' | 'blue' | 'green' | 'purple' | 'red';
  trend?: { value: number; label: string };
}

export default function StatCard({ title, value, subtitle, icon, color = 'yellow', trend }: StatCardProps) {
  const colors = {
    yellow: 'text-primary bg-primary/10',
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    red: 'text-red-400 bg-red-400/10',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card hover glow>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted text-sm">{title}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
            {subtitle && <p className="text-muted text-xs mt-1">{subtitle}</p>}
            {trend && (
              <p className={cn('text-xs mt-2 font-medium', trend.value >= 0 ? 'text-green-400' : 'text-red-400')}>
                {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
              </p>
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
