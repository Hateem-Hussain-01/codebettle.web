'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { ArrowLeft, Upload, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface ValidRow {
  line?: number;
  name: string;
  email: string;
  role: 'student' | 'instructor';
  phone?: string;
}

interface InvalidRow {
  line: number;
  row: { name: string; email: string; role: string; phone: string };
  errors: string[];
}

interface Preview {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  valid: ValidRow[];
  invalid: InvalidRow[];
}

interface ImportResult {
  importedCount: number;
  skippedCount: number;
  imported: Array<{ id: string; email: string }>;
}

const SAMPLE_CSV = 'name,email,role,phone\nAli Khan,ali@example.com,student,03001234567\nSara Ahmed,sara@example.com,instructor,';

/**
 * Admin CSV user import — preview/review first, confirm imports only the
 * valid rows. Imported users get an unusable password (a bcrypt hash of a
 * random value) and cannot sign in until an admin sets a password via the
 * existing reset/setup flow. Admin accounts can never be imported.
 */
export default function StudentsImportClient() {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPreview = async () => {
    if (!csv.trim()) { toast.error('Paste CSV text or choose a .csv file first'); return; }
    setPreviewing(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/admin/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not preview the CSV');
      setPreview(data as Preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not preview the CSV');
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || preview.valid.length === 0) return;
    setImporting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, confirm: true, valid: preview.valid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not import users');
      setResult(data as ImportResult);
      setPreview(null);
      setCsv('');
      toast.success(`Imported ${data.importedCount} user(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import users');
    } finally {
      setImporting(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
    setResult(null);
    setError('');
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center gap-3">
        <Link href="/admin/students" className="text-muted hover:text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-white">Import Users (CSV)</h1>
          <p className="text-muted text-sm mt-1">
            Columns: name, email, role, phone (phone optional). Role must be student or instructor — admin accounts are never importable.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={0.08} className="bg-dark-card border border-dark-border rounded-xl p-4 space-y-4">
        <Textarea
          label="CSV text"
          placeholder={SAMPLE_CSV}
          value={csv}
          onChange={e => { setCsv(e.target.value); setPreview(null); setResult(null); }}
          rows={8}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => void onFile(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4" />Choose .csv file
          </Button>
          <Button onClick={() => void loadPreview()} loading={previewing}>Preview</Button>
          <p className="text-muted text-xs">Preview first — nothing is written until you confirm the import.</p>
        </div>
        <p className="text-muted text-xs">
          Imported users cannot sign in until an admin sets a password for them (existing reset/setup flow). No password column is accepted in the CSV.
        </p>
      </FadeIn>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">{error}</div>
      )}

      {preview && (
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-dark-border">
            <p className="text-sm text-white font-medium">
              Preview: {preview.totalRows} rows •{' '}
              <span className="text-green-400">{preview.validCount} valid</span> •{' '}
              <span className="text-red-400">{preview.invalidCount} invalid</span>
            </p>
            <Button onClick={() => void confirmImport()} loading={importing} disabled={preview.valid.length === 0}>
              <CheckCircle className="w-4 h-4" />Confirm Import ({preview.validCount} valid)
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border bg-dark-border/20">
                  {['Line', 'Name', 'Email', 'Role', 'Phone', 'Status'].map(h => (
                    <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.valid.map(row => (
                  <tr key={`valid-${row.line}-${row.email}`} className="border-b border-dark-border/40 last:border-0">
                    <td className="py-3 px-4 text-muted text-xs">{row.line ?? ''}</td>
                    <td className="py-3 px-4 text-white text-xs font-medium">{row.name}</td>
                    <td className="py-3 px-4 text-muted text-xs">{row.email}</td>
                    <td className="py-3 px-4 text-muted text-xs">{row.role}</td>
                    <td className="py-3 px-4 text-muted text-xs">{row.phone ?? ''}</td>
                    <td className="py-3 px-4"><Badge variant="success">Valid</Badge></td>
                  </tr>
                ))}
                {preview.invalid.map(row => (
                  <tr key={`invalid-${row.line}`} className="border-b border-dark-border/40 last:border-0 bg-red-500/5">
                    <td className="py-3 px-4 text-muted text-xs">{row.line}</td>
                    <td className="py-3 px-4 text-white text-xs font-medium">{row.row.name || '—'}</td>
                    <td className="py-3 px-4 text-muted text-xs">{row.row.email || '—'}</td>
                    <td className="py-3 px-4 text-muted text-xs">{row.row.role || '—'}</td>
                    <td className="py-3 px-4 text-muted text-xs">{row.row.phone || ''}</td>
                    <td className="py-3 px-4">
                      <Badge variant="danger">Invalid</Badge>
                      <ul className="mt-1 space-y-0.5">
                        {row.errors.map(e => (
                          <li key={e} className="flex items-start gap-1 text-xs text-red-400">
                            <XCircle className="w-3 h-3 mt-0.5 shrink-0" />{e}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
                {preview.totalRows === 0 && (
                  <tr><td colSpan={6} className="py-8 px-4 text-center text-muted text-sm">No data rows in the CSV.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-sm text-green-400">
          Imported {result.importedCount} user(s)
          {result.skippedCount > 0 ? `, skipped ${result.skippedCount} (already existed or invalid at import time)` : ''}.
          {result.imported.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted">
              {result.imported.map(u => <li key={u.id}>{u.email}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
