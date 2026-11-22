'use client';
import { useState, useMemo } from 'react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import CourseCard from '@/components/ui/CourseCard';
import FadeIn from '@/components/ui/FadeIn';
import PublicPageBackdrop from '@/components/ui/PublicPageBackdrop';
import PageAccentScene from '@/components/ui/PageAccentScene';
import TiltCard from '@/components/ui/TiltCard';
import { Search, SlidersHorizontal } from 'lucide-react';
import { BarChart3, Code, Globe, GraduationCap, Palette, Server, Smartphone, type LucideIcon } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useWishlist } from '@/hooks/use-wishlist';
import type { PublicCourse } from '@/lib/db/types';

const CATEGORIES = ['All', 'Web Development', 'Mobile Development', 'Data Science', 'UI/UX Design', 'DevOps', 'Programming'];
const LEVELS = ['All', 'beginner', 'intermediate', 'advanced'];

// Icons for the hero's 3D category chips (decorative only — the
// filter bar below stays the only way to filter).
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Web Development': Globe,
  'Mobile Development': Smartphone,
  'Data Science': BarChart3,
  'UI/UX Design': Palette,
  DevOps: Server,
  Programming: Code,
};

interface CoursesClientProps {
  courses: PublicCourse[];
  instructorNames: Record<string, string>;
}

export default function CoursesClient({ courses: allCourses, instructorNames }: CoursesClientProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [level, setLevel] = useState('All');
  const [priceFilter, setPriceFilter] = useState('All');
  const [sort, setSort] = useState('popular');
  // Signed-in students get a working heart on every card; signed-out
  // visitors see no heart at all (Phase 0d).
  const { wishlistedIds, signedIn, loaded, toggle } = useWishlist();

  const filtered = useMemo(() => {
    let result = [...allCourses];
    if (search) result = result.filter(c => c.title.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase()));
    if (category !== 'All') result = result.filter(c => c.category === category);
    if (level !== 'All') result = result.filter(c => c.level === level);
    if (priceFilter === 'free') result = result.filter(c => c.isFree);
    if (priceFilter === 'paid') result = result.filter(c => !c.isFree);

    if (sort === 'popular') result.sort((a, b) => b.enrolledCount - a.enrolledCount);
    if (sort === 'rating') result.sort((a, b) => b.rating - a.rating);
    if (sort === 'newest') result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sort === 'price-low') result.sort((a, b) => a.price - b.price);
    if (sort === 'price-high') result.sort((a, b) => b.price - a.price);
    return result;
  }, [search, category, level, priceFilter, sort, allCourses]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        {/* Hero — the same 3D treatment as the other public pages
            (About / Success Stories, PR #72; Eman, 22 Nov 2026):
            shared backdrop + floating gold orbs + accent scene
            (gold 3D shapes at the hero edge) + 3D-tilted glass
            chips for the six categories. The count line is the same
            real numbers as the old plain header; search, filters and
            the grid below are untouched. */}
        <div className="relative py-16 sm:py-20 bg-dark-card border-b border-dark-border text-center overflow-hidden">
          {/* Shared public-page backdrop: static grid + glows, plus
              a slow gold particle field on desktop/WebGL. */}
          <PublicPageBackdrop variant="hero" />
          {/* Floating gold orbs — pure decoration, slow drift. */}
          <div aria-hidden="true" className="absolute top-10 left-[12%] w-20 h-20 rounded-full bg-primary/10 blur-2xl pointer-events-none animate-float-slow hidden md:block" />
          <div aria-hidden="true" className="absolute bottom-8 right-[10%] w-28 h-28 rounded-full bg-primary/[0.07] blur-2xl pointer-events-none animate-float-slower hidden md:block" />
          {/* Floating gold shapes at the left edge — the same world
              as the Home hero scene, at a whisper. */}
          <PageAccentScene layout="left" />
          <FadeIn className="relative max-w-3xl mx-auto px-4">
            <span className="inline-flex items-center gap-2 text-primary-text text-sm font-semibold uppercase tracking-wider">
              <GraduationCap className="w-4 h-4" /> Explore Courses
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-foreground mt-3 mb-4">
              Find your course. <span className="gradient-text">Build your future.</span>
            </h1>
            <p className="text-muted text-lg leading-relaxed">
              Explore {allCourses.length} expert-led courses across {CATEGORIES.length - 1} categories
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {CATEGORIES.slice(1).map((c) => {
                const Icon = CATEGORY_ICONS[c] ?? Code;
                return (
                  <TiltCard key={c} max={6}>
                    <div className="glass-card flex items-center gap-2 px-4 py-2 rounded-full border border-dark-border text-sm font-semibold text-foreground">
                      <Icon className="w-4 h-4 text-primary-text" />
                      {c}
                    </div>
                  </TiltCard>
                );
              })}
            </div>
          </FadeIn>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Filters */}
          <FadeIn delay={0.05} className="bg-dark-card border border-dark-border rounded-xl p-4 mb-8 flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search courses..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Select
                value={category}
                onChange={e => setCategory(e.target.value)}
                options={CATEGORIES.map(c => ({ value: c, label: c }))}
                className="min-w-[160px]"
              />
              <Select
                value={level}
                onChange={e => setLevel(e.target.value)}
                options={LEVELS.map(l => ({ value: l, label: l === 'All' ? 'All Levels' : l.charAt(0).toUpperCase() + l.slice(1) }))}
                className="min-w-[140px]"
              />
              <Select
                value={priceFilter}
                onChange={e => setPriceFilter(e.target.value)}
                options={[{ value: 'All', label: 'All Prices' }, { value: 'free', label: 'Free' }, { value: 'paid', label: 'Paid' }]}
                className="min-w-[130px]"
              />
              <Select
                value={sort}
                onChange={e => setSort(e.target.value)}
                options={[
                  { value: 'popular', label: 'Most Popular' },
                  { value: 'rating', label: 'Top Rated' },
                  { value: 'newest', label: 'Newest' },
                  { value: 'price-low', label: 'Price: Low to High' },
                  { value: 'price-high', label: 'Price: High to Low' },
                ]}
                className="min-w-[170px]"
              />
            </div>
          </FadeIn>

          {/* Results */}
          <p className="text-muted text-sm mb-6">{filtered.length} course{filtered.length !== 1 ? 's' : ''} found</p>

          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((course, i) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  instructorName={instructorNames[course.instructorId] ?? 'Instructor'}
                  index={i}
                  isWishlisted={wishlistedIds.has(course.id)}
                  onWishlist={signedIn && loaded ? toggle : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-24">
              <SlidersHorizontal className="w-12 h-12 text-muted mx-auto mb-4" />
              <p className="text-foreground font-semibold mb-2">No courses found</p>
              <p className="text-muted text-sm">Try adjusting your filters or search term</p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
