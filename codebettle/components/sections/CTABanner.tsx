'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, GraduationCap } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function CTABanner() {
  return (
    <section className="py-24 bg-dark-card border-y border-dark-border relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5" />
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/10 rounded-full blur-[80px]" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-[80px]" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 text-primary mb-6">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-6">
            Ready to Start Your <span className="gradient-text">Coding Journey?</span>
          </h2>
          <p className="text-muted text-lg mb-10 max-w-2xl mx-auto">
            Join over 1,500 students already learning at CodeBettle. Sign up today and access your first course for free.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/register">
              <Button size="lg" variant="primary" className="group">
                Get Started Free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/become-instructor">
              <Button size="lg" variant="outline">Teach on CodeBettle</Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
