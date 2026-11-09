import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import HeroSection from '@/components/sections/HeroSection';
import StatsSection from '@/components/sections/StatsSection';
import FeaturedCourses from '@/components/sections/FeaturedCourses';
import HowItWorks from '@/components/sections/HowItWorks';
import TestimonialsSection from '@/components/sections/TestimonialsSection';
import BlogPreview from '@/components/sections/BlogPreview';
import CTABanner from '@/components/sections/CTABanner';
import { getSession } from '@/lib/auth';
import { listTestimonials } from '@/lib/db/testimonials';

export default async function Home() {
  const session = await getSession();
  const testimonials = await listTestimonials();

  return (
    <>
      <Navbar session={session} />
      <main>
        <HeroSection />
        <StatsSection />
        <FeaturedCourses />
        <HowItWorks />
        <TestimonialsSection testimonials={testimonials} />
        <BlogPreview />
        <CTABanner />
      </main>
      <Footer />
    </>
  );
}
