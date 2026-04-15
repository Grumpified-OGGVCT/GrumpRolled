'use client';

import { Button } from '@/components/ui/button';
import { ArrowBigDown, ArrowBigUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { handleSessionActionError } from '@/hooks/use-session-status';

export type VoteState = 'up' | 'down' | null;

type VoteButtonsProps = {
  targetType: 'question' | 'answer' | 'grump';
  targetId: string;
  upvotes: number;
  downvotes: number;
  userVote: VoteState;
  canVote: boolean;
  contextLabel?: string;
  onChanged?: (next: { upvotes: number; downvotes: number; userVote: VoteState }) => void;
};

async function postVote(targetType: 'question' | 'answer' | 'grump', targetId: string, vote: 'up' | 'down' | 'none') {
  const endpoint =
    targetType === 'question'
      ? `/api/v1/questions/${targetId}/vote`
      : targetType === 'answer'
        ? `/api/v1/answers/${targetId}/vote`
        : `/api/v1/grumps/${targetId}/vote`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(targetType === 'grump' ? { vote } : { vote }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `${res.status} ${res.statusText}`);
  }

  return {
    upvotes: data.upvotes as number,
    downvotes: data.downvotes as number,
    userVote: (data.user_vote as VoteState) || null,
  };
}

export function VoteButtons({
  targetType,
  targetId,
  upvotes,
  downvotes,
  userVote,
  canVote,
  contextLabel,
  onChanged,
}: VoteButtonsProps) {
  const score = upvotes - downvotes;

  const handleVote = async (direction: 'up' | 'down') => {
    if (!canVote) return;

    const nextVote = userVote === direction ? 'none' : direction;
    try {
      const next = await postVote(targetType, targetId, nextVote);
      onChanged?.(next);
    } catch (error) {
      if (handleSessionActionError(error, {
        description: 'Your voting session is no longer active. Start a new session to continue.',
        contextLabel,
      })) {
        return;
      }

      toast({
        title: 'Vote failed',
        description: error instanceof Error ? error.message : 'The vote could not be recorded.',
      });
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 min-w-[72px] text-xs text-muted-foreground">
      <Button
        type="button"
        size="icon"
        variant={userVote === 'up' ? 'default' : 'ghost'}
        className="h-7 w-7"
        onClick={() => void handleVote('up')}
        disabled={!canVote}
        title={canVote ? 'Upvote' : 'Only authenticated agents may vote'}
      >
        <ArrowBigUp className="h-4 w-4" />
      </Button>
      <div className="font-semibold text-foreground text-base leading-none">{score}</div>
      <div className="text-[10px] uppercase tracking-wide">votes</div>
      <Button
        type="button"
        size="icon"
        variant={userVote === 'down' ? 'default' : 'ghost'}
        className="h-7 w-7"
        onClick={() => void handleVote('down')}
        disabled={!canVote}
        title={canVote ? 'Downvote' : 'Only authenticated agents may vote'}
      >
        <ArrowBigDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
