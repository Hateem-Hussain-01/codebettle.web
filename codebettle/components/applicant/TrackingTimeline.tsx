import { Check, Clock, ArrowRight, Bell } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { formatDateShort } from '@/lib/utils';

export interface TrackingViewShape {
  application: { id: string; status: string; createdAt: string };
  currentStage: { name: string; instructions?: string };
  completedStages: string[];
  nextStage: { name: string; instructions?: string } | null;
  latestUpdate: { action: string; stageName: string; note?: string; createdAt: string } | null;
  notifications: Array<{ id: string; title: string; body: string; createdAt: string }>;
}

/**
 * Applicant tracking timeline (Phase 2, Module 20).
 *
 * Renders ONLY what the tracking API returns: the current stage,
 * the completed stages, the single next stage, the admin's
 * instructions for the current stage, the latest update and the
 * applicant's own notifications. The future pipeline is never
 * rendered because it is never sent — this component cannot leak
 * what it does not receive.
 */
export default function TrackingTimeline({ tracking }: { tracking: TrackingViewShape }) {
  const { application, currentStage, completedStages, nextStage, latestUpdate, notifications } = tracking;
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-muted text-xs">Application ID</p>
            <p className="text-white text-sm font-mono break-all">{application.id}</p>
            <p className="text-muted text-xs mt-2">Submitted {formatDateShort(application.createdAt)}</p>
          </div>
          <Badge variant={application.status === 'approved' ? 'success' : application.status === 'rejected' ? 'danger' : 'warning'}>
            {application.status}
          </Badge>
        </div>
      </Card>

      <Card>
        <h2 className="text-white font-semibold mb-1">Current stage</h2>
        <p className="text-primary font-semibold">{currentStage.name}</p>
        {currentStage.instructions && (
          <p className="text-muted text-sm mt-2">
            <span className="text-white">What to do next: </span>
            {currentStage.instructions}
          </p>
        )}
        {nextStage && (
          <p className="text-muted text-sm mt-3 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-primary" />
            Next step: <span className="text-white">{nextStage.name}</span>
            {nextStage.instructions ? ` — ${nextStage.instructions}` : ''}
          </p>
        )}
        {!nextStage && (
          <p className="text-muted text-sm mt-3">This application has reached its final step.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-white font-semibold mb-4">Progress</h2>
        <ol className="space-y-3">
          {completedStages.map((stage) => (
            <li key={stage} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-black flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5" />
              </span>
              <span className="text-white text-sm">{stage}</span>
              {stage === currentStage.name && <Badge variant="warning">current</Badge>}
            </li>
          ))}
          {nextStage && (
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full border border-dark-border text-muted flex items-center justify-center flex-shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </span>
              <span className="text-muted text-sm">{nextStage.name} (next)</span>
            </li>
          )}
        </ol>
        {latestUpdate && (
          <p className="text-muted text-xs mt-4 border-t border-dark-border pt-3">
            Latest update: {latestUpdate.stageName} — {latestUpdate.action.replaceAll('_', ' ')}
            {latestUpdate.note ? ` — “${latestUpdate.note}”` : ''} · {formatDateShort(latestUpdate.createdAt)}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" /> Notifications
        </h2>
        {notifications.length === 0 ? (
          <p className="text-muted text-sm">No updates yet. We will notify you here when your application moves forward.</p>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li key={n.id} className="border-b border-dark-border pb-3 last:border-0 last:pb-0">
                <p className="text-white text-sm font-medium">{n.title}</p>
                <p className="text-muted text-xs mt-0.5">{n.body}</p>
                <p className="text-muted text-xs mt-1">{formatDateShort(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
