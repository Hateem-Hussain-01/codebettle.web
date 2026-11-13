'use client';

import Button from '@/components/ui/Button';
import { Download } from 'lucide-react';

/**
 * Download the current page URL as a .txt file (PR #33).
 *
 * The admin sign-in page lives at a secret URL that is not linked
 * anywhere public and cannot be found by searching — so the page
 * offers a one-click way to save it. The file contains the full URL
 * plus the save-this-link note. Uses the browser's current URL, so
 * it works on the secret path and in local dev alike.
 */
export default function SavePortalLinkButton() {
  function download() {
    const url = window.location.href;
    const text = `CodeBettle admin sign-in link\n${url}\n\nSave this link — you cannot find it by searching.\n`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = 'codebettle-admin-link.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <Button variant="outline" size="sm" onClick={download}>
      <Download className="w-4 h-4" /> Download the link (.txt)
    </Button>
  );
}
