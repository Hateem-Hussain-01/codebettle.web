'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { formatDateShort } from '@/lib/utils';
import type { TeamTask, TeamTaskStatus } from '@/lib/db/types';

const STATUS_LABEL: Record<TeamTaskStatus, string> = { todo: 'To do', doing: 'Doing', done: 'Done' };
const STATUS_VARIANT: Record<TeamTaskStatus, 'muted' | 'primary' | 'success'> = {
  todo: 'muted',
  doing: 'primary',
  done: 'success',
};
const NEXT_ACTION: Partial<Record<TeamTaskStatus, { next: TeamTaskStatus; label: string }>> = {
  todo: { next: 'doing', label: 'Start' },
  doing: { next: 'done', label: 'Mark done' },
};

/**
 * Team tasks list (client). The move button shows only for the
 * assignee, only one step forward — the server re-checks both, so a
 * forged request still gets a 403.
 */
export default function TeamTasksClient({ tasks, myEmail }: { tasks: TeamTask[]; myEmail: string }) {
  const router = useRouter();
  const [movingId, setMovingId] = useState<string | null>(null);

  async function move(task: TeamTask, next: TeamTaskStatus) {
    setMovingId(task.id);
    try {
      const res = await fetch(`/api/team/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not update the task');
        return;
      }
      toast.success(`Task moved to ${STATUS_LABEL[next]}`);
      router.refresh();
    } finally {
      setMovingId(null);
    }
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-muted">No tasks yet — the admin will assign tasks here.</p>;
  }

  return (
    <ul className="space-y-4">
      {tasks.map((task) => {
        const mine = task.assigneeEmail.toLowerCase() === myEmail.toLowerCase();
        const action = NEXT_ACTION[task.status];
        return (
          <li key={task.id} className="border border-dark-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{task.title}</p>
                {task.description && <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{task.description}</p>}
                <p className="text-xs text-muted mt-2">
                  Assigned to {mine ? 'you' : task.assigneeEmail}
                  {task.dueDate ? ` · Due ${formatDateShort(task.dueDate)}` : ''}
                  {` · Created ${formatDateShort(task.createdAt)}`}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[task.status]}>{STATUS_LABEL[task.status]}</Badge>
            </div>
            {mine && action && (
              <div className="mt-3">
                <Button size="sm" loading={movingId === task.id} onClick={() => move(task, action.next)}>
                  {action.label}
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
