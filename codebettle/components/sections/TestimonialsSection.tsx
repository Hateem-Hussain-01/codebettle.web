'use client';
import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';
import StarRating from '@/components/ui/StarRating';
import type { Testimonial } from '@/lib/db/types';

export default function TestimonialsSection({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-primary-text text-sm font-semibold uppercase tracking-wider">Testimonials</span>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground mt-2">
            What Our <span className="gradient-text">Students Say</span>
          </h2>
          <p className="text-muted mt-3 max-w-xl mx-auto">Real stories from real students who transformed their careers with CodeBettle.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-dark-card border border-dark-border rounded-xl p-6 hover:border-primary/30 transition-all duration-300 flex flex-col"
            >
              <Quote className="w-6 h-6 text-primary-text/40 mb-4" />
              <p className="text-muted text-sm leading-relaxed flex-1 mb-6">"{t.comment}"</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={t.studentAvatar} alt={t.studentName} className="w-10 h-10 rounded-full border-2 border-primary/30" />
                  <div>
                    <p className="text-foreground text-sm font-medium">{t.studentName}</p>
                    <p className="text-muted text-xs">{t.courseTitle}</p>
                  </div>
                </div>
                <StarRating rating={t.rating} size="sm" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
