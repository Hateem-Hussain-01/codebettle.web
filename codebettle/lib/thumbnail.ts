/**
 * Course thumbnail helpers — shared by the admin upload clients, the
 * course-image storage service, and the render sites.
 *
 * Client-safe: pure string functions only, no node imports, so both
 * server code and 'use client' components can import this file.
 */

/** Image types the course-thumbnail upload accepts (same set as avatars). */
export const ALLOWED_COURSE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** 5 MB, same cap as the avatar upload. */
export const MAX_COURSE_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * A thumbnail URL is valid only when it is an absolute http(s) URL.
 * Rejects relative paths, javascript:/data: URLs, ftp:, and anything
 * that does not parse as a URL at all.
 */
export function isValidThumbnailUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Broken-image fallback: a self-contained dark/gold SVG placeholder
 * (no external asset, no invented stock photo). Render sites swap to
 * this when the stored thumbnail fails to load.
 */
const FALLBACK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">' +
  '<rect width="800" height="450" fill="#0A0A0A"/>' +
  '<text x="400" y="225" font-family="sans-serif" font-size="42" font-weight="bold" fill="#F5C518" text-anchor="middle">CodeBettle</text>' +
  '</svg>';

export const COURSE_THUMBNAIL_FALLBACK = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(FALLBACK_SVG)}`;
