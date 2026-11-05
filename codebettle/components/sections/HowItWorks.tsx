'use client';
import { motion } from 'framer-motion';
import { UserPlus, Search, BookOpen, Award } from 'lucide-react';

const steps = [
  { icon: <UserPlus className="w-7 h-7" />, step: '01', title: 'Create Your Account', description: 'Sign up for free and set up your student profile in under a minute.' },
  { icon: <Search className="w-7 h-7" />, step: '02', title: 'Browse & Enroll', description: 'Explore our catalog of expert-led courses and enroll in the ones that match your goals.' },
  { icon: <BookOpen className="w-7 h-7" />, step: '03', title: 'Learn at Your Pace', description: 'Access recorded lessons, download materials, and learn whenever and wherever you want.' },
  { icon: <Award className="w-7 h-7" />, step: '04', title: 'Earn Your Certificate', description: 'Complete a course and receive a verified certificate to showcase your new skills.' },
];

export default function HowItWorks() {
  return (
    <section className="py-24 bg-dark-card border-y border-dark-border relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(rgba(245,197,24,1) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-primary text-sm font-semibold uppercase tracking-wider">How It Works</span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-2">
            Your Learning <span className="gradient-text">Journey</span>
          </h2>
          <p className="text-muted mt-3 max-w-xl mx-auto">Four simple steps to transform your career with CodeBettle.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {/* Connecting line */}
          <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[calc(100%-120px)] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent hidden lg:block" />

          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="text-center"
            >
              <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-6 group-hover:bg-primary/20 transition-colors">
                {step.icon}
                <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-dark text-xs font-black flex items-center justify-center">
                  {step.step}
                </span>
              </div>
              <h3 className="text-white font-bold mb-3">{step.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
