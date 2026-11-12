'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Upload } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import toast from 'react-hot-toast';
import type { PaymentAccount } from '@/lib/db/types';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollmentId: string;
  coursePrice: number;
  /** Called after a successful submission so the page flips to "Waiting for Approval". */
  onSubmitted: () => void;
}

function formatAccountDetails(account: PaymentAccount, amountPkr: number): string {
  const lines = [
    'CodeBettle — Payment Details',
    `Account: ${account.label}`,
    `Account Holder: ${account.accountHolder}`,
    account.bankName ? `Bank / Service: ${account.bankName}` : `Method: ${account.method}`,
    account.accountNumber ? `Account Number: ${account.accountNumber}` : null,
    account.iban ? `IBAN: ${account.iban}` : null,
    account.walletNumber ? `Wallet Number: ${account.walletNumber}` : null,
    `Amount: PKR ${amountPkr.toLocaleString()}`,
  ];
  if (account.instructions) lines.push(`Instructions: ${account.instructions}`);
  return lines.filter((l): l is string => l !== null).join('\n');
}

/**
 * "Complete Payment" modal (Phase 1b).
 *
 * Fetches the ACTIVE payment accounts from GET /api/student/payment-
 * accounts (never hardcoded) and shows each with holder, bank/service,
 * account number/IBAN/wallet, instructions and a "Copy Account Details"
 * button. Below, the student picks the account they paid into, enters
 * the amount and transaction ID/reference, uploads the transaction
 * screenshot/receipt (private `payment-proofs` bucket via
 * POST /api/student/payments/upload), and submits. The submission goes
 * to POST /api/student/payments — a second submission while one is
 * pending review is refused with 409.
 */
export default function PaymentModal({
  isOpen,
  onClose,
  enrollmentId,
  coursePrice,
  onSubmitted,
}: PaymentModalProps) {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [amount, setAmount] = useState(String(coursePrice));
  const [transactionRef, setTransactionRef] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [copiedId, setCopiedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingAccounts(true);
    (async () => {
      try {
        const res = await fetch('/api/student/payment-accounts');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load payment accounts');
        if (!cancelled) {
          setAccounts(data.accounts ?? []);
          if (data.accounts?.length > 0) setSelectedAccountId(data.accounts[0].id);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load payment accounts');
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const copyDetails = async (account: PaymentAccount) => {
    const text = formatAccountDetails(account, coursePrice);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable (old browser / non-secure context) — fallback.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(account.id);
    toast.success('Account details copied');
    window.setTimeout(() => setCopiedId((id) => (id === account.id ? '' : id)), 2000);
  };

  const submit = async () => {
    const amountPkr = Math.floor(Number(amount));
    if (!selectedAccountId) { toast.error('Choose the account you paid into'); return; }
    if (!Number.isInteger(amountPkr) || amountPkr <= 0) { toast.error('Enter a valid amount in PKR'); return; }
    if (!transactionRef.trim()) { toast.error('Enter the transaction ID / reference'); return; }
    if (!file) { toast.error('Upload your transaction screenshot or receipt'); return; }
    setSubmitting(true);
    try {
      // 1. Upload the proof to the private bucket — returns a storage path.
      const form = new FormData();
      form.append('file', file);
      const uploadRes = await fetch('/api/student/payments/upload', { method: 'POST', body: form });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Could not upload the payment proof');
      // 2. Submit the transaction.
      const res = await fetch('/api/student/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentId,
          paymentAccountId: selectedAccountId,
          amountPkr,
          transactionRef: transactionRef.trim(),
          proofPath: uploadData.path,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit your payment');
      toast.success('Payment submitted — waiting for admin approval');
      onSubmitted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit your payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Complete Payment" size="lg">
      <div className="space-y-5">
        <p className="text-muted text-sm">
          Pay <span className="text-foreground font-semibold">PKR {coursePrice.toLocaleString()}</span> into one of
          the accounts below, then submit your transaction details. An admin verifies it and unlocks the
          full course.
        </p>

        {loadingAccounts ? (
          <p className="text-muted text-sm">Loading payment accounts…</p>
        ) : accounts.length === 0 ? (
          <p className="text-muted text-sm">
            No payment accounts are available right now — please contact the admin.
          </p>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <label
                key={account.id}
                className={`block rounded-xl border p-4 cursor-pointer transition-colors ${
                  selectedAccountId === account.id
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-dark-border bg-dark-border/20 hover:border-dark-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="payment-account"
                    checked={selectedAccountId === account.id}
                    onChange={() => setSelectedAccountId(account.id)}
                    className="mt-1 accent-yellow-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-semibold text-sm">{account.label}</p>
                    <div className="text-xs text-muted mt-1 space-y-0.5">
                      <p>Account Holder: <span className="text-foreground">{account.accountHolder}</span></p>
                      {account.bankName && <p>Bank / Service: <span className="text-foreground">{account.bankName}</span></p>}
                      {account.accountNumber && <p>Account Number: <span className="text-foreground font-mono">{account.accountNumber}</span></p>}
                      {account.iban && <p>IBAN: <span className="text-foreground font-mono">{account.iban}</span></p>}
                      {account.walletNumber && <p>Wallet Number: <span className="text-foreground font-mono">{account.walletNumber}</span></p>}
                      {account.instructions && <p className="italic">{account.instructions}</p>}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => { e.preventDefault(); copyDetails(account); }}
                  >
                    {copiedId === account.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedId === account.id ? 'Copied' : 'Copy Account Details'}
                  </Button>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="space-y-3 border-t border-dark-border pt-4">
          <h4 className="text-foreground font-semibold text-sm">Submit your transaction</h4>
          <div>
            <label className="text-xs text-muted block mb-1.5">Amount paid (PKR)</label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`PKR ${coursePrice.toLocaleString()}`}
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Transaction ID / Reference</label>
            <Input
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="e.g. 1234567890 or the transfer reference"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Transaction screenshot / receipt (PNG, JPG, WebP or PDF, max 5 MB)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4" />
              {file ? file.name : 'Choose file'}
            </Button>
          </div>
          <Button onClick={submit} disabled={submitting || accounts.length === 0} fullWidth>
            {submitting ? 'Submitting…' : 'Submit Transaction'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
