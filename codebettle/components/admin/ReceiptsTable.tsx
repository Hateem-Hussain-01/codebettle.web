import { Check, CheckCheck } from 'lucide-react';
import Card from '@/components/ui/Card';
import { TICK_LABELS, receiptStatusOf, type DeliveryStatus, type ReceiptRecipient } from '@/app/admin/communications/communications-helpers';

/**
 * Read receipts table (Phase 3, Module 14).
 *
 * One row per recipient: name, email, delivery status. The tick visuals
 * follow the spec's language — single tick = delivered, double tick =
 * read, yellow double tick = acknowledged — shown as both icon and text
 * so the state never depends on colour alone. Name/email are null for
 * recipients deleted after fan-out (the receipts endpoint keeps their
 * rows so totals reconcile); those render as "Deleted user".
 */
export function ReceiptStatusTick({ status }: { status: DeliveryStatus }) {
  const { label, ticks } = TICK_LABELS[status];
  if (status === 'acknowledged') {
    return (
      <span className="inline-flex items-center gap-1 text-yellow-400 text-xs font-medium" title={label}>
        <CheckCheck className="w-4 h-4" aria-label={label} />
        <span aria-hidden="true">{ticks}</span> {label}
      </span>
    );
  }
  if (status === 'read') {
    return (
      <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium" title={label}>
        <CheckCheck className="w-4 h-4" aria-label={label} />
        <span aria-hidden="true">{ticks}</span> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted text-xs" title={label}>
      <Check className="w-4 h-4" aria-label={label} />
      <span aria-hidden="true">{ticks}</span> {label}
    </span>
  );
}

interface ReceiptsTableProps {
  recipients: ReceiptRecipient[];
  loading?: boolean;
  /** The receipts endpoint is not there yet (Worker A still building it). */
  unavailable?: boolean;
}

export default function ReceiptsTable({ recipients, loading, unavailable }: ReceiptsTableProps) {
  if (loading) return <p className="text-muted text-sm">Loading receipts…</p>;
  if (unavailable) {
    return (
      <Card className="py-6 text-center">
        <p className="text-foreground font-semibold text-sm mb-1">Read receipts are not available yet</p>
        <p className="text-muted text-xs">
          The per-announcement receipts endpoint (GET /api/admin/announcements/[id]/receipts) is still being built, or
          the signed-in admin lacks the announcements area that endpoint requires — this table will fill in
          automatically once it lands. Recipient counts above come from enrolments, not receipts.
        </p>
      </Card>
    );
  }
  if (recipients.length === 0) {
    return <p className="text-muted text-sm">No recipients for this announcement.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted text-xs border-b border-dark-border">
            <th className="py-2 pr-3 font-medium">Recipient</th>
            <th className="py-2 pr-3 font-medium">Email</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((recipient) => (
            <tr key={recipient.userId} className="border-b border-dark-border/50 last:border-0">
              <td className="py-2 pr-3 text-foreground">{recipient.name ?? 'Deleted user'}</td>
              <td className="py-2 pr-3 text-muted">{recipient.email ?? '—'}</td>
              <td className="py-2">
                <ReceiptStatusTick status={receiptStatusOf(recipient)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
