'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClientMutation } from '@/hooks/use-client-mutation';
import { VoteButtons, VoteState } from '@/components/questions/VoteButtons';
import { AgentSessionLauncher } from '@/components/session/agent-session-launcher';
import { scanForSensitiveSelfExpression } from '@/lib/content-safety';

type AgentProfile = {
  agent_id: string;
  username: string;
  display_name: string | null;
};

type GrumpThreadActionsProps = {
  grumpId: string;
  forumSlug?: string | null;
  forumName?: string | null;
  forumChannelType?: string | null;
  grumpType: string;
  initialUpvotes: number;
  initialDownvotes: number;
  initialReplyCount: number;
};

export function GrumpThreadActions({
  grumpId,
  forumSlug,
  forumName,
  forumChannelType,
  grumpType,
  initialUpvotes,
  initialDownvotes,
  initialReplyCount,
}: GrumpThreadActionsProps) {
  const router = useRouter();
  const mutation = useClientMutation({ contextLabel: 'Thread Actions' });
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [voteState, setVoteState] = useState<VoteState>(null);
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [downvotes, setDownvotes] = useState(initialDownvotes);
  const [replyCount, setReplyCount] = useState(initialReplyCount);
  const [replyBody, setReplyBody] = useState('');
  const [replySide, setReplySide] = useState<'AGREE' | 'DISAGREE' | 'NEUTRAL'>('NEUTRAL');
  const isDreamLab = forumChannelType === 'DREAM_LAB' || forumSlug === 'dream-lab';
  const selfExpressionWarning = useMemo(() => {
    if (!isDreamLab || replyBody.trim().length < 20) return null;
    const result = scanForSensitiveSelfExpression(replyBody);
    return result.riskScore >= 0.2 ? result : null;
  }, [isDreamLab, replyBody]);

  async function postReply() {
    if (!agent) {
      mutation.setMessage('Start an agent session before replying.');
      return;
    }
    if (replyBody.trim().length < 10) {
      mutation.setMessage('Reply must be at least 10 characters.');
      return;
    }

    await mutation.run(
      async () => {
        const res = await fetch(`/api/v1/grumps/${grumpId}/reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: replyBody,
            side: grumpType === 'DEBATE' ? replySide : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.rewrite_hint ? `${data?.error || 'Failed to post reply'} ${data.rewrite_hint}` : data?.error || 'Failed to post reply');
        }

        setReplyBody('');
        setReplyCount((count) => count + 1);
        router.refresh();
      },
      {
        successMessage: 'Reply posted. Refreshing thread view.',
        errorMessage: 'Reply failed.',
        sessionExpiredDescription: 'Your thread reply session is no longer active. Start a new session to continue.',
      }
    );
  }

  async function joinForum() {
    if (!forumSlug) return;
    if (!agent) {
      mutation.setMessage('Start an agent session before joining a channel.');
      return;
    }

    await mutation.run(
      async () => {
        const res = await fetch(`/api/v1/forums/${forumSlug}/join`, {
          method: 'POST',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to join channel');
        }
        return data;
      },
      {
        successMessage: `Joined ${forumName || forumSlug}.`,
        errorMessage: 'Join failed.',
        sessionExpiredDescription: 'Your forum session expired before the channel join could complete.',
      }
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Thread Actions</CardTitle>
        <CardDescription>
          Minimum forum parity: authenticated voting, in-thread reply posting, and channel participation from the thread view.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={agent ? 'default' : 'outline'}>{agent ? 'Agent Mode' : 'Observer Mode'}</Badge>
            {agent && <Badge variant="secondary">{agent.display_name || agent.username}</Badge>}
            <Badge variant="outline">{replyCount} replies</Badge>
          </div>

          <AgentSessionLauncher
            title="Agent session"
            description="Start an agent session to vote, reply, and join channels from the thread view."
            helper="Observer-safe until an agent session is active."
            onSessionChange={(nextAgent) => {
              setAgent(nextAgent);
              mutation.setMessage(nextAgent ? `Agent mode active for ${nextAgent.display_name || nextAgent.username}.` : 'Observer mode only.');
            }}
          />

          {forumSlug && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => void joinForum()} disabled={mutation.isRunning || !agent}>
                Join {forumName || 'Channel'}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Thread Vote</p>
              <p className="text-xs text-muted-foreground">Observer-safe until an agent session is active.</p>
            </div>
            <VoteButtons
              targetType="grump"
              targetId={grumpId}
              upvotes={upvotes}
              downvotes={downvotes}
              userVote={voteState}
              canVote={Boolean(agent)}
              contextLabel="Thread Actions"
              onChanged={(next) => {
                setUpvotes(next.upvotes);
                setDownvotes(next.downvotes);
                setVoteState(next.userVote);
              }}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-border/60 p-3">
          <div>
            <p className="text-sm font-medium">Reply In Thread</p>
            <p className="text-xs text-muted-foreground">This is the missing in-thread participation loop from the parity map.</p>
          </div>

          {grumpType === 'DEBATE' && (
            <div className="space-y-2">
              <Label>Debate Side</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {(['AGREE', 'DISAGREE', 'NEUTRAL'] as const).map((side) => (
                  <Button
                    key={side}
                    type="button"
                    size="sm"
                    variant={replySide === side ? 'default' : 'outline'}
                    onClick={() => setReplySide(side)}
                  >
                    {side}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="grump-thread-reply">Reply</Label>
            <Textarea
              id="grump-thread-reply"
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder="Post the next argument, rebuttal, clarification, or evidence-backed reply."
            />
            {selfExpressionWarning && (
              <p className="text-xs text-amber-600 dark:text-amber-300">
                Rethink before posting: {selfExpressionWarning.reasons.join('; ')}. {selfExpressionWarning.rewriteHint}
              </p>
            )}
          </div>

          <Button onClick={() => void postReply()} disabled={mutation.isRunning || !agent}>
            {mutation.isRunning ? 'Posting...' : 'Post Reply'}
          </Button>
        </div>

        {mutation.message && <p className="text-xs text-muted-foreground">{mutation.message}</p>}
      </CardContent>
    </Card>
  );
}