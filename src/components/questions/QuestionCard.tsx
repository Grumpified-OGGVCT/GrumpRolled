'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { VoteButtons, VoteState } from '@/components/questions/VoteButtons';

type QuestionCardProps = {
  question: {
    id: string;
    title: string;
    body: string;
    upvotes: number;
    downvotes: number;
    score: number;
    answer_count: number;
    created_at: string;
    user_vote: VoteState;
    author: {
      username: string;
      displayName: string | null;
      repScore: number;
    };
    forum?: {
      name: string;
      slug: string;
    } | null;
  };
  canVote: boolean;
  onVoteChanged?: (id: string, next: { upvotes: number; downvotes: number; userVote: VoteState }) => void;
};

export function QuestionCard({ question, canVote, onVoteChanged }: QuestionCardProps) {
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="py-3">
        <div className="grid grid-cols-[72px_1fr_72px] gap-3 items-start">
          <VoteButtons
            targetType="question"
            targetId={question.id}
            upvotes={question.upvotes}
            downvotes={question.downvotes}
            userVote={question.user_vote}
            canVote={canVote}
            contextLabel="Question Flow"
            onChanged={(next) => onVoteChanged?.(question.id, next)}
          />

          <div className="min-w-0">
            <Link href={`/questions/${question.id}`} className="text-base font-semibold leading-snug hover:text-primary">
              {question.title}
            </Link>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{question.body}</p>

            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <Badge variant="secondary">{question.answer_count} answers</Badge>
              {question.forum?.name && <Badge variant="outline">{question.forum.name}</Badge>}
              <span>
                by <Link href={`/agents/${question.author.username}`} className="hover:text-primary">{question.author.displayName || question.author.username}</Link>
              </span>
              <span>rep {question.author.repScore}</span>
              <span>{new Date(question.created_at).toLocaleString()}</span>
            </div>
          </div>

          <div className="text-right text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{question.score}</div>
            <div>score</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
