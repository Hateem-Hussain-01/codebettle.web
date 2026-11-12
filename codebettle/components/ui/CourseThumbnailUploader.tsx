'use client';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import CourseThumbnail from '@/components/ui/CourseThumbnail';
import { ALLOWED_COURSE_IMAGE_TYPES, MAX_COURSE_IMAGE_BYTES, isValidThumbnailUrl } from '@/lib/thumbnail';

interface CourseThumbnailUploaderProps {
  /** Upload endpoint — the edit page posts to its course's thumbnail route, the create form to the standalone upload route. */
  uploadUrl: string;
  /** Thumbnail to preview initially (the course's current one, or '' on create). */
  initialUrl?: string;
  /** Called with the storage URL + path once the upload succeeds. */
  onUploaded: (url: string, path: string) => void;
  /** Reported so a parent form can block saving mid-upload. */
  onUploadingChange?: (uploading: boolean) => void;
}

/**
 * Shared course-thumbnail upload control (Phase 4, Module 2): file
 * picker + live preview of the current thumbnail. The file is posted
 * as multipart/form-data (`thumbnail` field) to `uploadUrl`; the route
 * stores it in the public `course-images` bucket and returns the public
 * URL, which the parent saves (edit route saves it directly; the create
 * form sends it with the create call). No URL text field and no stock
 * fallback — the thumbnail comes from an uploaded image only.
 */
export default function CourseThumbnailUploader({ uploadUrl, initialUrl = '', onUploaded, onUploadingChange }: CourseThumbnailUploaderProps) {
  const [preview, setPreview] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setUploadingState = (value: boolean) => {
    setUploading(value);
    onUploadingChange?.(value);
  };

  const uploadFile = async (file: File) => {
    if (!(ALLOWED_COURSE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      toast.error('Only JPG, PNG, WebP or GIF images are allowed');
      return;
    }
    if (file.size > MAX_COURSE_IMAGE_BYTES) {
      toast.error('Image must be 5 MB or smaller');
      return;
    }
    const data = new FormData();
    data.append('thumbnail', file);
    setUploadingState(true);
    try {
      const res = await fetch(uploadUrl, { method: 'POST', body: data });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || 'Thumbnail upload failed');
        return;
      }
      if (!isValidThumbnailUrl(body.url)) {
        toast.error('Thumbnail upload failed — the server returned an invalid image URL');
        return;
      }
      setPreview(body.url);
      onUploaded(body.url, body.path);
      toast.success('Thumbnail uploaded');
    } catch {
      toast.error('Thumbnail upload failed — check your connection and try again');
    } finally {
      setUploadingState(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        {preview ? (
          <CourseThumbnail src={preview} alt="Course thumbnail preview" className="w-40 h-24 rounded-lg object-cover border border-dark-border flex-shrink-0" />
        ) : (
          <div className="w-40 h-24 rounded-lg border-2 border-dashed border-dark-border flex items-center justify-center flex-shrink-0">
            <span className="text-muted text-xs text-center px-2">No thumbnail yet</span>
          </div>
        )}
        <div className="text-xs text-muted space-y-1">
          <p>Shown on the course card, course page and student portal.</p>
          <p>JPG, PNG, WebP or GIF, max 5 MB.</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_COURSE_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void uploadFile(file);
        }}
      />
      <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={uploading}>
        {preview ? 'Change thumbnail' : 'Upload thumbnail'}
      </Button>
    </div>
  );
}
