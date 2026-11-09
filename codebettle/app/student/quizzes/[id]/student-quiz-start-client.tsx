'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function StudentQuizStartClient({
  quizId,
  attemptsLeft,
  inProgressAttemptId,
}: {
  quizId: string;
  attemptsLeft: number;
  inProgressAttemptId?: string;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/student/quizzes/${quizId}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not start the quiz');
        return;
      }
      router.push(`/student/quizzes/${quizId}/attempts/${data.attempt.id}`);
    } finally {
      setStarting(false);
    }
  };

  if (inProgressAttemptId) {
    return (
      <Button
        onClick={() => router.push(`/student/quizzes/${quizId}/attempts/${inProgressAttemptId}`)}
      >
        Resume attempt
      </Button>
    );
  }
  if (attemptsLeft <= 0) {
    return <p className="text-muted text-sm">You have used all attempts for this quiz.</p>;
  }
  return (
    <Button neon onClick={() => void handleStart()} disabled={starting}>
      {starting ? 'Starting…' : 'Start quiz'}
    </Button>
  );
}
