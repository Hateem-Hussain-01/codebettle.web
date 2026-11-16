'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { formatDateShort } from '@/lib/utils';
import type { TeamFile } from '@/lib/db/types';

/**
 * Team files list + upload (client). Upload posts multipart/form-data
 * to /api/team/files; download opens a signed URL from
 * /api/team/files/[id]. The server enforces the team gate, the file
 * type/size rules and the storage setup — errors come back as plain
 * messages, never stack traces.
 */
export default function TeamFilesClient({ files, myId }: { files: TeamFile[]; myId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('Choose a file first');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/team/files', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Upload failed');
        return;
      }
      toast.success('File uploaded');
      e.currentTarget.reset();
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function download(file: TeamFile) {
    setDownloadingId(file.id);
    try {
      const res = await fetch(`/api/team/files/${file.id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not open the file');
        return;
      }
      window.open(data.url, '_blank', 'noopener');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={upload} className="flex flex-col sm:flex-row gap-3">
        <input
          ref={fileRef}
          type="file"
          aria-label="Choose a file to upload"
          className="flex-1 min-w-0 rounded-lg border border-dark-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-ink"
        />
        <Button type="submit" loading={uploading}>
          Upload
        </Button>
      </form>
      <p className="text-xs text-muted -mt-3">Images, PDF, Office documents, text/CSV or ZIP — 10 MB max.</p>
      {files.length === 0 ? (
        <p className="text-sm text-muted">No files shared yet.</p>
      ) : (
        <ul className="space-y-3">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 border border-dark-border rounded-xl p-4">
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{f.fileName}</p>
                <p className="text-xs text-muted mt-1">
                  {Math.max(1, Math.round(f.size / 1024))} KB · {formatDateShort(f.createdAt)}
                  {f.uploadedBy === myId ? ' · uploaded by you' : ''}
                </p>
              </div>
              <Button size="sm" variant="outline" loading={downloadingId === f.id} onClick={() => download(f)}>
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
