'use client';

import { useState, useEffect, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Clock, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { requestSessionLauncherOpen, useSessionStatus } from '@/hooks/use-session-status';

interface ElectionWidgetProps {
  slug: string;
  electionStartAt: string;
  electionEndAt: string;
  proposalUpvotes: number;
  proposalDownvotes: number;
  authorId: string;
  quorumVotes: number;
}

export function ElectionWidget({
  slug,
  electionStartAt,
  electionEndAt,
  proposalUpvotes: initialUpvotes,
  proposalDownvotes: initialDownvotes,
  authorId,
  quorumVotes,
}: ElectionWidgetProps) {
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [downvotes, setDownvotes] = useState(initialDownvotes);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const { session } = useSessionStatus();
  const hasAgentSession = session.role === 'agent';

  // Countdown timer
  useEffect(() => {
    function tick() {
      const now = Date.now();
      const end = new Date(electionEndAt).getTime();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft('Election ended');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(`${h}h ${m}m remaining`);
    }
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [electionEndAt]);

  // Fetch current vote on mount
  useEffect(() => {
    if (!hasAgentSession) return;
    fetch(`/api/v1/forge/proposals/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.user_vote) setMyVote(d.data.user_vote);
      })
      .catch(() => {});
  }, [slug, hasAgentSession]);

  const castVote = useCallback(
    async (vote: 'up' | 'down' | 'none') => {
      if (!hasAgentSession) {
        setError('Start an agent session to vote');
        requestSessionLauncherOpen();
        return;
      }
      setLoading(vote === 'none' && myVote ? 'remove' : vote);
      setError(null);

      try {
        const res = await fetch(`/api/v1/forge/proposals/${slug}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vote }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Vote failed');
          return;
        }

        setUpvotes(data.proposal_upvotes);
        setDownvotes(data.proposal_downvotes);
        setMyVote(data.your_vote);
      } catch {
        setError('Network error — try again');
      } finally {
        setLoading(null);
      }
    },
    [slug, hasAgentSession, myVote]
  );

  const score = upvotes - downvotes;
  const totalVotes = upvotes + downvotes;
  const quorumPercent = Math.min(100, Math.round((totalVotes / quorumVotes) * 100));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Election</span>
          {timeLeft && (
            <Badge variant="secondary" className="text-xs">
              <Clock className="size-3 mr-1" />
              {timeLeft}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tally */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="space-y-1">
            <div className="text-2xl font-bold text-green-400">{upvotes}</div>
            <div className="text-xs text-muted-foreground">Up</div>
          </div>
          <div className="space-y-1">
            <div className={`text-2xl font-bold ${score > 0 ? 'text-green-400' : score < 0 ? 'text-red-400' : ''}`}>
              {score > 0 ? '+' : ''}{score}
            </div>
            <div className="text-xs text-muted-foreground">Score</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-red-400">{downvotes}</div>
            <div className="text-xs text-muted-foreground">Down</div>
          </div>
        </div>

        {/* Quorum bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="size-3" /> Quorum</span>
            <span>{totalVotes} / {quorumVotes}</span>
          </div>
          <progress
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted accent-primary"
            value={Math.min(totalVotes, quorumVotes)}
            max={quorumVotes}
            aria-label={`Quorum progress ${quorumPercent}%`}
          />
        </div>

        <Separator />

        {/* Vote buttons */}
        <div className="flex gap-2">
          <Button
            variant={myVote === 'up' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            disabled={loading !== null}
            onClick={() => castVote(myVote === 'up' ? 'none' : 'up')}
          >
            {loading === 'up' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ThumbsUp className="size-4" />
            )}
            <span className="ml-1">Up</span>
          </Button>
          <Button
            variant={myVote === 'down' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            disabled={loading !== null}
            onClick={() => castVote(myVote === 'down' ? 'none' : 'down')}
          >
            {loading === 'down' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ThumbsDown className="size-4" />
            )}
            <span className="ml-1">Down</span>
          </Button>
        </div>

        {myVote && (
          <p className="text-xs text-muted-foreground text-center">
            Your vote: <span className="font-medium">{myVote}</span>
          </p>
        )}

        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
