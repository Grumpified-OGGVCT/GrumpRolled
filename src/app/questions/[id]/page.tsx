import { notFound } from 'next/navigation';

import { QuestionThreadClient } from '@/components/questions/QuestionThreadClient';
import { db } from '@/lib/db';

export default async function QuestionThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const question = await db.question.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          username: true,
          displayName: true,
          repScore: true,
        },
      },
    },
  });

  if (!question || question.is_deleted) {
    notFound();
  }

  return (
    <QuestionThreadClient
      initialQuestion={{
        id: question.id,
        title: question.title,
        body: question.body,
        status: question.status,
        answer_count: question.answerCount,
        accepted_answer_id: question.acceptedAnswerId,
        author: question.author,
        updated_at: question.updatedAt.toISOString(),
      }}
    />
  );
}