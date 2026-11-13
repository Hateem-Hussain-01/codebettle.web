'use client';
import { useRef } from 'react';
import {
  Bold, Italic, Underline, Heading2, Heading3, List, ListOrdered,
  Link2, Eraser, MousePointerClick, ImagePlus,
} from 'lucide-react';
import { sanitizeEmailHtml } from '@/lib/sanitize';

/**
 * Lightweight dependency-free rich-text editor for email bodies.
 * A contentEditable area with a small execCommand toolbar — the same
 * pattern as the blog editor (app/admin/blog/blog-client.tsx), no
 * editor library installed and none added.
 *
 * Tools: bold, italic, underline, headings, bullet/numbered lists,
 * link, gold CTA button, image insert, clear formatting. The image
 * insert embeds the file as a base64 data URI (self-contained emails
 * — no external image URLs, nothing to save or host); images over
 * 200 KB are refused with a message, so emails stay small.
 * Placeholders ({{STUDENT_NAME}} …) are inserted at the caret via the
 * optional placeholders row.
 *
 * The HTML produced is sanitized on save (email-template service) and
 * again on render (renderEmailTemplate); the editor itself sanitizes
 * the initial HTML the same way the blog editor does.
 */
export interface RichTextEditorPlaceholder {
  key: string;
  description: string;
}

const MAX_IMAGE_BYTES = 200 * 1024;

const BUTTON_STYLE =
  'display:inline-block;background-color:#F5C518;color:#0A0A0A;' +
  'font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;' +
  'line-height:1;text-decoration:none;padding:14px 32px;border-radius:8px;';

interface RichTextEditorProps {
  label?: string;
  initialHtml: string;
  onChange: (html: string) => void;
  placeholders?: readonly RichTextEditorPlaceholder[];
  disabled?: boolean;
}

export default function RichTextEditor({
  label = 'Email body',
  initialHtml,
  onChange,
  placeholders,
  disabled,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const insertAtCaret = (html: string) => {
    ref.current?.focus();
    document.execCommand('insertHTML', false, html);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const insertPlaceholder = (key: string) => {
    ref.current?.focus();
    document.execCommand('insertText', false, `{{${key}}}`);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const addLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (!url) return;
    run('createLink', url);
  };

  const addButton = () => {
    const buttonLabel = window.prompt('Button text', 'Open CodeBettle');
    if (!buttonLabel) return;
    const url = window.prompt('Button link (https://…)');
    if (!url) return;
    const safeLabel = buttonLabel.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeUrl = url.replace(/"/g, '%22');
    insertAtCaret(`<p><a href="${safeUrl}" style="${BUTTON_STYLE}">${safeLabel}</a></p>`);
  };

  const addImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      window.alert('Please choose an image file (PNG or JPEG).');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert(
        `That image is ${(file.size / 1024).toFixed(0)} KB — images embedded in emails must be 200 KB or smaller. Please compress it first.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      if (!dataUrl.startsWith('data:image/')) return;
      ref.current?.focus();
      document.execCommand('insertImage', false, dataUrl);
      // Constrain the inserted image to the editor/email width.
      if (ref.current) {
        ref.current.querySelectorAll('img').forEach((img) => {
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
        });
        onChange(ref.current.innerHTML);
      }
    };
    reader.readAsDataURL(file);
  };

  const tools: { label: string; title: string; action: () => void; icon: typeof Bold }[] = [
    { label: 'B', title: 'Bold', action: () => run('bold'), icon: Bold },
    { label: 'I', title: 'Italic', action: () => run('italic'), icon: Italic },
    { label: 'U', title: 'Underline', action: () => run('underline'), icon: Underline },
    { label: 'H2', title: 'Heading 2', action: () => run('formatBlock', 'h2'), icon: Heading2 },
    { label: 'H3', title: 'Heading 3', action: () => run('formatBlock', 'h3'), icon: Heading3 },
    { label: '• List', title: 'Bullet list', action: () => run('insertUnorderedList'), icon: List },
    { label: '1. List', title: 'Numbered list', action: () => run('insertOrderedList'), icon: ListOrdered },
    { label: 'Link', title: 'Insert link', action: addLink, icon: Link2 },
    { label: 'Button', title: 'Insert a gold button', action: addButton, icon: MousePointerClick },
    { label: 'Image', title: 'Insert an image (embedded in the email)', action: () => fileRef.current?.click(), icon: ImagePlus },
    { label: 'Clear', title: 'Clear formatting', action: () => run('removeFormat'), icon: Eraser },
  ];

  return (
    <div>
      <span className="text-sm font-medium text-foreground/80 block mb-1.5">{label}</span>
      <div className="flex flex-wrap gap-1 mb-1 p-1 bg-dark-border/30 border border-dark-border rounded-lg">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.title}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={tool.action}
              className="flex items-center gap-1 px-2 py-1 text-xs text-foreground/80 hover:text-foreground hover:bg-dark-border rounded cursor-pointer disabled:opacity-50"
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tool.label}</span>
            </button>
          );
        })}
      </div>
      {placeholders && placeholders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-xs text-muted mr-1">Insert placeholder:</span>
          {placeholders.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.description}
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertPlaceholder(p.key)}
              className="text-xs font-mono bg-dark-card border border-dark-border text-primary-text rounded-md px-2 py-1 hover:border-primary/60 transition-colors cursor-pointer disabled:opacity-50"
            >
              {`{{${p.key}}}`}
            </button>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Insert an image into the email"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) addImage(file);
          e.target.value = '';
        }}
      />
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(initialHtml) }}
        onInput={() => {
          if (ref.current) onChange(ref.current.innerHTML);
        }}
        className="min-h-[220px] w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary-text [&_a]:underline [&_img]:max-w-full [&_img]:h-auto"
      />
      <p className="text-xs text-muted mt-1.5">
        Formatting is saved as HTML. Images are embedded in the email itself (max 200 KB each) —
        no external image links. Placeholders are replaced with each recipient&apos;s own data
        when sending; unknown placeholders are left as-is.
      </p>
    </div>
  );
}
