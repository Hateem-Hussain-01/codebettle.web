import Link from 'next/link';
import { Mail, Phone, MapPin, Globe, Share2, Image, Code } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-dark-card border-t border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl font-black gradient-text">CodeBettle</span>
            </div>
            <p className="text-muted text-sm leading-relaxed mb-6">
              Pakistan's premier digital institute. We empower students and professionals with industry-relevant tech skills through expert-led courses.
            </p>
            <div className="flex items-center gap-3">
              {[
                { icon: <Code className="w-4 h-4" />, href: '#' },
                { icon: <span className="text-xs font-bold">𝕏</span>, href: '#' },
                { icon: <Share2 className="w-4 h-4" />, href: '#' },
                { icon: <Image className="w-4 h-4" />, href: '#' },
              ].map((s, i) => (
                <a key={i} href={s.href} className="w-9 h-9 rounded-lg bg-dark-border flex items-center justify-center text-muted hover:text-primary hover:bg-primary/10 transition-all">
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2.5">
              {[['/', 'Home'], ['/courses', 'All Courses'], ['/instructors', 'Instructors'], ['/blog', 'Blog'], ['/about', 'About Us'], ['/become-instructor', 'Become Instructor']].map(([href, label]) => (
                <li key={href}><Link href={href} className="text-muted text-sm hover:text-primary transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-white font-semibold mb-4">Categories</h4>
            <ul className="space-y-2.5">
              {['Web Development', 'Mobile Development', 'Data Science', 'UI/UX Design', 'DevOps', 'Programming'].map(cat => (
                <li key={cat}><Link href={`/courses?category=${encodeURIComponent(cat)}`} className="text-muted text-sm hover:text-primary transition-colors">{cat}</Link></li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-semibold mb-4">Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-muted text-sm"><Mail className="w-4 h-4 text-primary flex-shrink-0" />info@codebettle.com</li>
              <li className="flex items-center gap-3 text-muted text-sm"><Phone className="w-4 h-4 text-primary flex-shrink-0" />+92 300 1234567</li>
              <li className="flex items-start gap-3 text-muted text-sm"><MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />Lahore, Punjab, Pakistan</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-dark-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-muted text-sm">© {new Date().getFullYear()} CodeBettle. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-muted text-sm hover:text-primary transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-muted text-sm hover:text-primary transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
