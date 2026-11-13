import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import HeroSection from '@/components/sections/HeroSection';
import StatsSection from '@/components/sections/StatsSection';
import FeaturedCourses from '@/components/sections/FeaturedCourses';
import ReviewsCarousel from '@/components/sections/ReviewsCarousel';
import HowItWorks from '@/components/sections/HowItWorks';
import TestimonialsSection from '@/components/sections/TestimonialsSection';
import BlogPreview from '@/components/sections/BlogPreview';
import CTABanner from '@/components/sections/CTABanner';
import { getSession } from '@/lib/auth';
import { listTestimonials } from '@/lib/db/testimonials';
import { listEnabledStudentReviews } from '@/lib/db/student-reviews';

export default async function Home() {
  const session = await getSession();
  const testimonials = await listTestimonials();
  // Home reviews carousel (PR #32): enabled admin-managed reviews
  // only. Empty (or the migration not run yet) = the section hides
  // itself; no fake reviews are ever seeded.
  const reviews = await listEnabledStudentReviews();

  return (
    <>
      <Navbar session={session} />
      <main>
        <HeroSection />
        <StatsSection />
        <FeaturedCourses />
        <ReviewsCarousel reviews={reviews} />
        <HowItWorks />
        <TestimonialsSection testimonials={testimonials} />
        <BlogPreview />
        <CTABanner />
      </main>
      <Footer />
    </>
  );
}
