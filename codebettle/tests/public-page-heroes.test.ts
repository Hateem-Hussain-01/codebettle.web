// Public-page heroes for Courses + Blog (Eman, 22 Nov 2026 —
// voice note: the two navbar tabs without a proper hero section
// with 3D visuals get one).
//
// Both heroes follow the per-page hero treatment the other public
// pages already have (About / Success Stories, PR #72): shared
// backdrop + floating gold orbs + accent scene (gold 3D shapes at
// the hero edge) + 3D-tilted glass chips. The Courses and Blog
// content below the hero is untouched — search/filter/sort and the
// course grid on Courses, the posts grid on Blog — and no data or
// functionality changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const courses = () => read('app/courses/courses-client.tsx');
const blog = () => read('app/blog/page.tsx');

test('Courses hero: 3D treatment, real count, chips are decorative', () => {
  const src = courses();
  assert.ok(src.includes('<PublicPageBackdrop variant="hero"'), 'courses hero must use the shared backdrop');
  assert.ok(src.includes('<PageAccentScene'), 'courses hero must carry the floating gold 3D shapes');
  assert.ok(src.includes("layout=\"left\""), 'courses accent scene sits at the left edge');
  assert.ok(src.includes('animate-float-slow'), 'courses hero must have the floating gold orbs');
  assert.ok(src.includes('Find your course.'), 'courses hero headline must stay on-brand');
  assert.ok(src.includes('Build your future.'), 'courses hero headline accent must stay on-brand');
  // The count line is the same real numbers as the old plain header.
  assert.ok(src.includes('allCourses.length'), 'courses hero must show the real course count');
  assert.ok(src.includes('CATEGORIES.length - 1'), 'courses hero must show the real category count');
  // The six category chips are 3D-tilted glass, decorative only.
  for (const c of ['Web Development', 'Mobile Development', 'Data Science', 'UI/UX Design', 'DevOps', 'Programming']) {
    assert.ok(src.includes(`'${c}'`), `courses hero must chip the ${c} category`);
  }
  assert.ok(src.includes('<TiltCard'), 'category chips must tilt in 3D');
  assert.ok(src.includes('glass-card'), 'category chips must be glass');
  assert.ok(!src.includes('onClick'), 'chips must not add behaviour — the filter bar below stays the only way to filter');
});

test('Courses content below the hero is untouched: search, filters, grid', () => {
  const src = courses();
  assert.ok(src.includes('placeholder="Search courses..."'), 'course search must stay');
  assert.ok(src.includes("value={category}"), 'category filter must stay');
  assert.ok(src.includes("value={level}"), 'level filter must stay');
  assert.ok(src.includes("value={priceFilter}"), 'price filter must stay');
  assert.ok(src.includes("value={sort}"), 'sort must stay');
  assert.ok(src.includes('<CourseCard'), 'course grid must stay');
  assert.ok(src.includes('{filtered.length} course'), 'results count must stay');
});

test('Blog hero: 3D treatment, title and subtext kept, chips from real categories', () => {
  const src = blog();
  assert.ok(src.includes('<PublicPageBackdrop variant="hero"'), 'blog hero must use the shared backdrop');
  assert.ok(src.includes('<PageAccentScene'), 'blog hero must carry the floating gold 3D shapes');
  assert.ok(src.includes("layout=\"right\""), 'blog accent scene sits at the right edge');
  assert.ok(src.includes('animate-float-slow'), 'blog hero must have the floating gold orbs');
  assert.ok(src.includes('Tech <span className="gradient-text">Insights</span>'), 'blog hero must keep the Tech Insights title');
  assert.ok(src.includes('Articles, tutorials, and tips from our expert instructors.'), 'blog hero must keep its subtext');
  // Chips come from the posts that actually exist — no invented topics.
  assert.ok(src.includes('new Set(posts.map((post) => post.category))'), 'blog chips must derive from real post categories');
  assert.ok(src.includes('<TiltCard'), 'category chips must tilt in 3D');
  assert.ok(src.includes('glass-card'), 'category chips must be glass');
});

test('Blog content below the hero is untouched: posts grid', () => {
  const src = blog();
  assert.ok(src.includes('posts.map((post, i)'), 'posts grid must stay');
  assert.ok(src.includes('href={`/blog/${post.slug}`}'), 'post cards must still link to their pages');
  assert.ok(src.includes('post.thumbnail'), 'post thumbnails must stay');
  assert.ok(src.includes('post.excerpt'), 'post excerpts must stay');
  assert.ok(src.includes('post.readTime'), 'post read times must stay');
});
