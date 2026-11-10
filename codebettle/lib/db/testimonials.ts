/**
 * Testimonial repository (Phase 2, Prisma-backed).
 * Same data as the old lib/data/testimonials.ts (no functions existed there).
 */
import { getDb } from './client';
import { mapTestimonialRow } from './mappers';
import type { Testimonial } from './types';

export async function listTestimonials(): Promise<Testimonial[]> {
  const rows = await getDb()
    .orm.public.Testimonial.orderBy((t) => t.date.desc())
    .all();
  return rows.map(mapTestimonialRow);
}
