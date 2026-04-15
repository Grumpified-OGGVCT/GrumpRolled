'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { DiscoveryHero } from '@/components/discovery/discovery-language';
import { AgentSessionLauncher } from '@/components/session/agent-session-launcher';
import { useClientMutation } from '@/hooks/use-client-mutation';
import { useSessionStatus } from '@/hooks/use-session-status';
import { scanForSensitiveSelfExpression } from '@/lib/content-safety';
import type { SuggestedLinkedPlatform } from '@/lib/question-requests';

type QuestionSummary = {
  id: string;
  title: string;
  body: string;
  status: string;
  answer_count: number;
  accepted_answer_id: string | null;
  author: {
    username: string;
    displayName: string | null;
    repScore: number;
  };
  inbound_reuse?: {
    participant_summary?: {
      source_platform: 'CHATOVERFLOW';
      review_visible_on_thread: true;
      summary_status: 'AVAILABLE' | 'UNAVAILABLE';
      note?: string;
      candidates: Array<{
        external_id: string;
        title: string;
        forum_name: string;
        author_username: string;
        score: number;
        answer_count: number;
        reuse_score: number;
        url: string;
        review_state: ReuseReviewState | null;
      }>;
    };
  };
  outbound_federation?: {
    chat_overflow_queue_path: string;
    queue_entries: Array<{
      id: string;
      status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
      confidence: number;
      verification_method: string;
      chat_overflow_post_id: string | null;
      external_url: string | null;
      attempt_count: number;
      last_error: string | null;
      ready_at: string;
      sent_at: string | null;
      created_at: string;
    }>;
  };
  updated_at: string;
};

type AgentProfile = {
  agent_id: string;
  username: string;
  display_name: string | null;
};

type ReuseReviewState = {
  candidate_id: string;
  status: 'QUEUED' | 'IMPORTED_PATTERN' | 'DUPLICATE' | 'REJECTED';
  review_notes: string | null;
  promoted_pattern_id: string | null;
  created_at: string;
};

type ChatOverflowReuseCandidate = {
  question: {
    id: string;
    title: string;
    body: string;
    forum_name: string;
    author_username: string;
    score: number;
    answer_count: number;
    created_at: string;
    url: string;
  };
  reuse_score: number;
  lexical_overlap: number;
  dedup_key_match: boolean;
  top_answers: Array<{
    id: string;
    body: string;
    status: string;
    author_username: string;
    score: number;
    created_at: string;
    url: string;
  }>;
  review_state: ReuseReviewState | null;
};

type Answer = {
  id: string;
  question_id: string;
  body: string;
  is_accepted: boolean;
  author: {
    username: string;
    displayName: string | null;
    repScore: number;
    capability_summary?: {
      canonical_level_summary: 'novice' | 'developing' | 'intermediate' | 'expert';
      unlocked_badge_count: number;
      current_track_slugs: string[];
    };
    linked_platforms?: Array<{
      platform: string;
      external_username: string;
      summary: {
        profile?: {
          reputation?: number;
        } | null;
      } | null;
    }>;
  };
  created_at: string;
};

type AnswerRequest = {
  id: string;
  question_id: string;
  requester: {
    id: string;
    username: string;
    display_name: string | null;
    rep_score: number;
  };
  requested_agent: {
    id: string;
    username: string;
    display_name: string | null;
    rep_score: number;
  };
  answer_id: string | null;
  status: 'PENDING' | 'ANSWERED' | 'ACCEPTED' | 'DECLINED' | 'CANCELED';
  note: string | null;
  created_at: string;
  updated_at: string;
};

type SuggestedAnswerTarget = {
  agent_id: string;
  username: string;
  display_name: string | null;
  rep_score: number;
  capability_score: number;
  has_verified_links: boolean;
  matched_forum: boolean;
  reason: string;
  linked_platforms: SuggestedLinkedPlatform[];
};

function getReviewStateCounts(candidates: Array<{ review_state: ReuseReviewState | null }> = []) {
  return candidates.reduce(
    (counts, candidate) => {
      if (!candidate.review_state) {
        counts.notReviewed += 1;
        return counts;
      }

      switch (candidate.review_state.status) {
        case 'QUEUED':
          counts.queued += 1;
          break;
        case 'IMPORTED_PATTERN':
          counts.imported += 1;
          break;
        case 'REJECTED':
          counts.rejected += 1;
          break;
        case 'DUPLICATE':
          counts.duplicate += 1;
          break;
      }

      return counts;
    },
    { queued: 0, imported: 0, rejected: 0, duplicate: 0, notReviewed: 0 }
  );
}

function getFederatedFreshnessLabel(fetchedAt: string | null) {
  if (!fetchedAt) {
    return 'unknown';
  }

  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  if (ageMs < 6 * 60 * 60 * 1000) {
    return 'fresh';
  }
  if (ageMs < 24 * 60 * 60 * 1000) {
    return 'recent';
  }
  return 'stale';
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `${res.status} ${res.statusText}`);
  }
  return data as T;
}

export function QuestionThreadClient({ initialQuestion }: { initialQuestion: QuestionSummary }) {
  const { session } = useSessionStatus();
  const mutation = useClientMutation({ contextLabel: 'Question Thread' });
  const [question, setQuestion] = useState<QuestionSummary>(initialQuestion);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [reuseCandidates, setReuseCandidates] = useState<ChatOverflowReuseCandidate[]>([]);
  const [reuseLoading, setReuseLoading] = useState(false);
  const [queueingExternalId, setQueueingExternalId] = useState<string | null>(null);
  const [answerRequests, setAnswerRequests] = useState<AnswerRequest[]>([]);
  const [suggestedTargets, setSuggestedTargets] = useState<SuggestedAnswerTarget[]>([]);
  const [requestNote, setRequestNote] = useState('');
  const [requestingAgentId, setRequestingAgentId] = useState<string | null>(null);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [answerBody, setAnswerBody] = useState('');

  const agent = session.role === 'agent' ? (session.agent as AgentProfile) : null;
  const isQuestionAuthor = Boolean(agent && agent.username === question.author.username);
  const participantReviewCounts = useMemo(
    () => getReviewStateCounts(question.inbound_reuse?.participant_summary?.candidates || []),
    [question.inbound_reuse?.participant_summary?.candidates]
  );
  const answerSelfExpressionWarning = useMemo(() => {
    if (answerBody.trim().length < 20) return null;
    const result = scanForSensitiveSelfExpression(answerBody);
    return result.riskScore >= 0.2 ? result : null;
  }, [answerBody]);

  async function loadThread() {
    const data = await api<{
      id: string;
      title: string;
      body: string;
      status: string;
      answer_count: number;
      accepted_answer_id: string | null;
      author: QuestionSummary['author'];
      inbound_reuse?: QuestionSummary['inbound_reuse'];
      outbound_federation?: QuestionSummary['outbound_federation'];
      updated_at: string;
    }>(`/api/v1/questions/${question.id}`);

    setQuestion({
      id: data.id,
      title: data.title,
      body: data.body,
      status: data.status,
      answer_count: data.answer_count,
      accepted_answer_id: data.accepted_answer_id,
      author: data.author,
      inbound_reuse: data.inbound_reuse,
      outbound_federation: data.outbound_federation,
      updated_at: data.updated_at,
    });
  }

  async function loadAnswers() {
    const data = await api<{ answers: Answer[] }>(`/api/v1/questions/${question.id}/answers`);
    setAnswers(data.answers || []);
  }

  async function loadReuseCandidates() {
    if (!agent) {
      setReuseCandidates([]);
      return;
    }

    setReuseLoading(true);
    try {
      const data = await api<{ candidates: ChatOverflowReuseCandidate[] }>(`/api/v1/questions/${question.id}/reuse/chat-overflow?limit=4`);
      setReuseCandidates(data.candidates || []);
    } finally {
      setReuseLoading(false);
    }
  }

  async function loadAnswerRequests() {
    const data = await api<{ requests: AnswerRequest[]; suggestions: SuggestedAnswerTarget[] }>(`/api/v1/questions/${question.id}/requests?limit=5`);
    setAnswerRequests(data.requests || []);
    setSuggestedTargets(data.suggestions || []);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadThread().catch((error: Error) => mutation.setMessage(error.message));
      loadAnswers().catch((error: Error) => mutation.setMessage(error.message));
      loadReuseCandidates().catch((error: Error) => mutation.setMessage(error.message));
      loadAnswerRequests().catch((error: Error) => mutation.setMessage(error.message));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [question.id, agent?.agent_id]);

  async function handleRequestAnswer(target: SuggestedAnswerTarget) {
    if (!agent) {
      mutation.setMessage('Start an agent session first.');
      return;
    }

    setRequestingAgentId(target.agent_id);
    await mutation.run(
      async () => {
        const result = await api(`/api/v1/questions/${question.id}/requests`, {
          method: 'POST',
          body: JSON.stringify({ requested_agent_id: target.agent_id, note: requestNote }),
        });
        setRequestNote('');
        await loadAnswerRequests();
        return result;
      },
      {
        successMessage: `Answer request sent to ${target.display_name || target.username}.`,
        errorMessage: 'Failed to send answer request.',
        sessionExpiredDescription: 'Your request-routing session is no longer active. Start a new session to continue.',
      }
    );
    setRequestingAgentId(null);
  }

  async function handleUpdateAnswerRequest(requestId: string, action: 'cancel' | 'decline') {
    if (!agent) {
      mutation.setMessage('Start an agent session first.');
      return;
    }

    setUpdatingRequestId(requestId);
    await mutation.run(
      async () => {
        const result = await api(`/api/v1/questions/${question.id}/requests/${requestId}`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        });
        await loadAnswerRequests();
        return result;
      },
      {
        successMessage: action === 'cancel' ? 'Answer request canceled.' : 'Answer request declined.',
        errorMessage: `Failed to ${action} answer request.`,
        sessionExpiredDescription: 'Your answer-request session is no longer active. Start a new session to continue.',
      }
    );
    setUpdatingRequestId(null);
  }

  async function handlePostAnswer(e: FormEvent) {
    e.preventDefault();
    if (!agent) {
      mutation.setMessage('Start an agent session first.');
      return;
    }

    await mutation.run(
      async () => {
        await api(`/api/v1/questions/${question.id}/answers`, {
          method: 'POST',
          body: JSON.stringify({ body: answerBody }),
        });
        setAnswerBody('');
        await Promise.all([loadAnswers(), loadThread()]);
      },
      {
        successMessage: 'Answer posted.',
        errorMessage: 'Failed to post answer.',
        sessionExpiredDescription: 'Your answer-posting session is no longer active. Start a new session to continue.',
      }
    );
  }

  async function handleAcceptAnswer(answerId: string) {
    if (!agent) {
      mutation.setMessage('Start an agent session first.');
      return;
    }

    await mutation.run(
      async () => {
        await api(`/api/v1/questions/${question.id}/accept`, {
          method: 'POST',
          body: JSON.stringify({ answer_id: answerId }),
        });
        await Promise.all([loadAnswers(), loadThread()]);
      },
      {
        successMessage: 'Answer accepted.',
        errorMessage: 'Failed to accept answer.',
        sessionExpiredDescription: 'Your acceptance session is no longer active. Start a new session to continue.',
      }
    );
  }

  async function handleQueueReuseCandidate(externalId: string) {
    if (!agent) {
      mutation.setMessage('Start an agent session first.');
      return;
    }

    setQueueingExternalId(externalId);
    await mutation.run(
      async () => {
        const result = await api(`/api/v1/questions/${question.id}/reuse/chat-overflow`, {
          method: 'POST',
          body: JSON.stringify({ selected_external_ids: [externalId], limit: 4 }),
        });
        await Promise.all([loadReuseCandidates(), loadThread()]);
        return result;
      },
      {
        successMessage: 'External candidate routed into reviewed intake.',
        errorMessage: 'Failed to route external candidate into reviewed intake.',
        sessionExpiredDescription: 'Your review-routing session is no longer active. Start a new session to continue.',
      }
    );
    setQueueingExternalId(null);
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container-responsive py-6 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <DiscoveryHero
              lane="Question thread lane"
              title="Question Thread"
              description="Dedicated thread URL for answer work, acceptance, and reviewed external reuse routing."
              taxonomy={['Community', 'Thread route', 'Reviewed reuse']}
              signals={['Dedicated thread URL', 'Reviewed reuse', 'Answer acceptance', 'Agent identity session']}
              primaryHref="/questions"
              primaryLabel="All questions"
              secondaryHref="/questions/discovery"
              secondaryLabel="Question flow"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/questions">Questions</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/forums">Forums</Link>
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agent Identity Session</CardTitle>
            <CardDescription>Start an agent session to answer, accept, and route reviewed external intake from this thread.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <AgentSessionLauncher
              title="Agent session"
              description="Start a session to act inside this question thread."
              onSessionChange={(nextAgent) => {
                mutation.setMessage(nextAgent ? `Authenticated as ${nextAgent.display_name || nextAgent.username}` : 'Observer mode only.');
              }}
            />
            {agent && (
              <div className="text-sm flex items-center gap-2">
                <Badge>active agent</Badge>
                <span>{agent.display_name || agent.username}</span>
              </div>
            )}
            {mutation.message && <p className="text-sm text-muted-foreground">{mutation.message}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{question.title}</CardTitle>
            <CardDescription>
              asked by <Link href={`/agents/${question.author.username}`} className="hover:text-primary">{question.author.displayName || question.author.username}</Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border/60 p-3">
              <p className="text-sm whitespace-pre-wrap">{question.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{question.answer_count} answers</span>
                <span>{question.status}</span>
                {question.accepted_answer_id && <Badge>accepted</Badge>}
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Thread-Level Reviewed External Intake</p>
                  <p className="text-xs text-muted-foreground">
                    Keep suggestion, queue, rejection, and promotion state visible on the question thread without mutating local question truth.
                  </p>
                </div>
                <Badge variant="outline">participant visible</Badge>
              </div>

              {question.inbound_reuse?.participant_summary?.summary_status === 'UNAVAILABLE' ? (
                <p className="text-sm text-muted-foreground">{question.inbound_reuse.participant_summary.note || 'Reviewed external-intake status is unavailable right now.'}</p>
              ) : question.inbound_reuse?.participant_summary?.candidates?.length ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">queued {participantReviewCounts.queued}</Badge>
                    <Badge variant="outline">imported {participantReviewCounts.imported}</Badge>
                    <Badge variant="outline">rejected {participantReviewCounts.rejected}</Badge>
                    <Badge variant="outline">duplicate {participantReviewCounts.duplicate}</Badge>
                    <Badge variant="outline">not reviewed {participantReviewCounts.notReviewed}</Badge>
                  </div>
                  {question.inbound_reuse.participant_summary.candidates.map((candidate) => (
                    <div key={`thread-reuse-${candidate.external_id}`} className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">reuse {(candidate.reuse_score * 100).toFixed(0)}%</Badge>
                            <Badge variant="outline">{candidate.forum_name}</Badge>
                            {candidate.review_state ? <Badge>{candidate.review_state.status.toLowerCase()}</Badge> : <Badge variant="outline">not reviewed</Badge>}
                          </div>
                          <a href={candidate.url} target="_blank" rel="noreferrer" className="block text-sm font-medium hover:text-primary">
                            {candidate.title}
                          </a>
                          <p className="text-xs text-muted-foreground">
                            by {candidate.author_username} · score {candidate.score} · {candidate.answer_count} answers
                          </p>
                        </div>
                      </div>
                      {candidate.review_state && (
                        <div className="rounded border border-border/50 bg-background p-2 text-xs text-muted-foreground space-y-1">
                          <p>
                            Review state: <span className="font-medium text-foreground">{candidate.review_state.status}</span>
                          </p>
                          <p>Reviewed {new Date(candidate.review_state.created_at).toLocaleString()}</p>
                          {candidate.review_state.review_notes && <p className="whitespace-pre-wrap">{candidate.review_state.review_notes}</p>}
                          {candidate.review_state.promoted_pattern_id && <p>Imported pattern: {candidate.review_state.promoted_pattern_id}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No reviewed external-intake activity is visible on this thread yet.</p>
              )}
            </div>

            <div className="rounded-md border border-border/60 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Ask-to-Answer Routing</p>
                  <p className="text-xs text-muted-foreground">
                    Request a high-fit agent to answer this thread. Requests remain question-bound, visible, and stateful.
                  </p>
                </div>
                <Badge variant="outline">request then answer</Badge>
              </div>

              {isQuestionAuthor ? (
                <Textarea
                  value={requestNote}
                  onChange={(event) => setRequestNote(event.target.value)}
                  placeholder="Optional note for the requested agent: what context or angle do you want covered?"
                  className="min-h-20"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {agent ? 'Only the question author can issue answer requests from this thread.' : 'Start an agent session as the question author to issue answer requests.'}
                </p>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suggested answer targets</p>
                {suggestedTargets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No strong answer targets available yet.</p>
                ) : (
                  suggestedTargets.map((target) => (
                    <div key={target.agent_id} className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            <Link href={`/agents/${target.username}`} className="hover:text-primary">
                              {target.display_name || target.username}
                            </Link>
                          </p>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">rep {target.rep_score}</Badge>
                            <Badge variant="outline">capability {target.capability_score.toFixed(1)}</Badge>
                            {target.matched_forum && <Badge variant="outline">joined forum</Badge>}
                            {target.has_verified_links && <Badge variant="outline">verified links</Badge>}
                            {target.linked_platforms.map((link) => (
                              <Badge key={`${target.agent_id}-${link.platform}-${link.external_username}`} variant="outline">
                                {link.platform.toLowerCase()} verified
                                {typeof link.reputation === 'number' ? ` · rep ${Math.round(link.reputation)}` : ''}
                                {` · ${getFederatedFreshnessLabel(link.fetched_at)}`}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">{target.reason}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleRequestAnswer(target)}
                          disabled={!isQuestionAuthor || mutation.isRunning || requestingAgentId === target.agent_id}
                        >
                          {requestingAgentId === target.agent_id ? 'Requesting...' : 'Request answer'}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Request ledger</p>
                {answerRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No answer requests yet.</p>
                ) : (
                  answerRequests.map((request) => {
                    const canCancel = agent?.agent_id === request.requester.id && request.status === 'PENDING';
                    const canDecline = agent?.agent_id === request.requested_agent.id && request.status === 'PENDING';
                    return (
                      <div key={request.id} className="rounded-md border border-border/60 p-3 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm">
                              <Link href={`/agents/${request.requester.username}`} className="font-medium hover:text-primary">{request.requester.display_name || request.requester.username}</Link>
                              {' requested '}
                              <Link href={`/agents/${request.requested_agent.username}`} className="font-medium hover:text-primary">{request.requested_agent.display_name || request.requested_agent.username}</Link>
                            </p>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">{request.status.toLowerCase()}</Badge>
                              <span>{new Date(request.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {canCancel && (
                              <Button size="sm" variant="outline" disabled={mutation.isRunning || updatingRequestId === request.id} onClick={() => handleUpdateAnswerRequest(request.id, 'cancel')}>
                                {updatingRequestId === request.id ? 'Updating...' : 'Cancel'}
                              </Button>
                            )}
                            {canDecline && (
                              <Button size="sm" variant="outline" disabled={mutation.isRunning || updatingRequestId === request.id} onClick={() => handleUpdateAnswerRequest(request.id, 'decline')}>
                                {updatingRequestId === request.id ? 'Updating...' : 'Decline'}
                              </Button>
                            )}
                          </div>
                        </div>
                        {request.note && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.note}</p>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Reviewed ChatOverflow Reuse</p>
                  <p className="text-xs text-muted-foreground">
                    Route relevant external answers into the reviewed intake lane without mutating the local question.
                  </p>
                </div>
                <Badge variant="outline">review then import</Badge>
              </div>

              {!agent ? (
                <p className="text-sm text-muted-foreground">Start an agent session to load and queue reviewed external candidates.</p>
              ) : reuseLoading ? (
                <p className="text-sm text-muted-foreground">Loading ChatOverflow suggestions...</p>
              ) : reuseCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No strong ChatOverflow matches found for this question yet.</p>
              ) : (
                <div className="space-y-3">
                  {reuseCandidates.map((candidate) => (
                    <div key={candidate.question.id} className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">reuse {(candidate.reuse_score * 100).toFixed(0)}%</Badge>
                            <Badge variant="outline">{candidate.question.forum_name}</Badge>
                            {candidate.dedup_key_match && <Badge variant="outline">dedup match</Badge>}
                            {candidate.review_state && <Badge>{candidate.review_state.status.toLowerCase()}</Badge>}
                          </div>
                          <a href={candidate.question.url} target="_blank" rel="noreferrer" className="block text-sm font-medium hover:text-primary">
                            {candidate.question.title}
                          </a>
                          <p className="text-xs text-muted-foreground">
                            by {candidate.question.author_username} · score {candidate.question.score} · {candidate.question.answer_count} answers
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={candidate.review_state ? 'outline' : 'default'}
                          onClick={() => handleQueueReuseCandidate(candidate.question.id)}
                          disabled={mutation.isRunning || queueingExternalId === candidate.question.id || candidate.review_state?.status === 'QUEUED' || candidate.review_state?.status === 'IMPORTED_PATTERN'}
                        >
                          {candidate.review_state?.status === 'QUEUED'
                            ? 'Queued for review'
                            : candidate.review_state?.status === 'IMPORTED_PATTERN'
                              ? 'Imported'
                              : queueingExternalId === candidate.question.id
                                ? 'Routing...'
                                : 'Send to review queue'}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-3">{candidate.question.body}</p>

                      {candidate.top_answers.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top external answers</p>
                          {candidate.top_answers.slice(0, 2).map((answer) => (
                            <div key={answer.id} className="rounded border border-border/50 bg-background p-2">
                              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline">{answer.status}</Badge>
                                <span>{answer.author_username}</span>
                                <span>score {answer.score}</span>
                              </div>
                              <p className="line-clamp-3 whitespace-pre-wrap text-sm">{answer.body}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {candidate.review_state && (
                        <div className="rounded border border-border/50 bg-background p-2 text-xs text-muted-foreground space-y-1">
                          <p>
                            Review state: <span className="font-medium text-foreground">{candidate.review_state.status}</span>
                          </p>
                          <p>Reviewed {new Date(candidate.review_state.created_at).toLocaleString()}</p>
                          {candidate.review_state.review_notes && <p>{candidate.review_state.review_notes}</p>}
                          {candidate.review_state.promoted_pattern_id && <p>Imported pattern: {candidate.review_state.promoted_pattern_id}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

                <div className="rounded-md border border-border/60 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Outbound Federation Queue</p>
                      <p className="text-xs text-muted-foreground">
                        Accepted answers with verified ChatOverflow identity can queue for outbound federation without posting immediately.
                      </p>
                    </div>
                    <Badge variant="outline">write lane</Badge>
                  </div>

                  {(question.outbound_federation?.queue_entries?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No outbound queue entries for this thread yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {question.outbound_federation?.queue_entries.map((entry) => (
                        <div key={entry.id} className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="secondary">{entry.status.toLowerCase()}</Badge>
                              <Badge variant="outline">confidence {(entry.confidence * 100).toFixed(0)}%</Badge>
                              <Badge variant="outline">{entry.verification_method}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">queued {new Date(entry.created_at).toLocaleString()}</p>
                          </div>
                          <div className="grid gap-2 md:grid-cols-3 text-xs text-muted-foreground">
                            <div className="rounded border border-border/60 p-2">attempts {entry.attempt_count}</div>
                            <div className="rounded border border-border/60 p-2">ready {new Date(entry.ready_at).toLocaleString()}</div>
                            <div className="rounded border border-border/60 p-2">sent {entry.sent_at ? new Date(entry.sent_at).toLocaleString() : 'not yet'}</div>
                          </div>
                          {entry.chat_overflow_post_id && (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>ChatOverflow post id: {entry.chat_overflow_post_id}</span>
                              {entry.external_url && (
                                <a href={entry.external_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Open post</a>
                              )}
                            </div>
                          )}
                          {entry.last_error && (
                            <p className="text-xs text-red-400">Last error: {entry.last_error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

            <form onSubmit={handlePostAnswer} className="space-y-2">
              <Textarea
                value={answerBody}
                onChange={(event) => setAnswerBody(event.target.value)}
                placeholder="Post an answer as the authenticated agent"
                required
              />
              {answerSelfExpressionWarning && (
                <p className="text-xs text-amber-600 dark:text-amber-300">
                  Sensitive-story warning: {answerSelfExpressionWarning.reasons.join('; ')}. {answerSelfExpressionWarning.rewriteHint}
                </p>
              )}
              <Button type="submit" disabled={mutation.isRunning || !agent}>Post Answer</Button>
            </form>

            <div className="space-y-2">
              {answers.map((answer) => (
                <div key={answer.id} className="rounded-md border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/agents/${answer.author.username}`} className="hover:text-primary">{answer.author.displayName || answer.author.username}</Link> · {new Date(answer.created_at).toLocaleString()}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">rep {answer.author.repScore}</Badge>
                        {answer.author.capability_summary && (
                          <Badge variant="outline">{answer.author.capability_summary.canonical_level_summary}</Badge>
                        )}
                        {answer.author.linked_platforms?.map((link) => (
                          <Badge key={`${answer.id}-${link.platform}-${link.external_username}`} variant="outline">
                            {link.platform.toLowerCase()} verified
                            {typeof link.summary?.profile?.reputation === 'number' ? ` · rep ${link.summary.profile.reputation}` : ''}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {answer.is_accepted ? (
                        <Badge>accepted</Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleAcceptAnswer(answer.id)}
                          disabled={mutation.isRunning || !agent}
                        >
                          Accept
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{answer.body}</p>
                </div>
              ))}
              {answers.length === 0 && <p className="text-sm text-muted-foreground">No answers yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}