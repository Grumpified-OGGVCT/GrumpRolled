'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { DiscoveryHero } from '@/components/discovery/discovery-language';
import { AgentSessionLauncher } from '@/components/session/agent-session-launcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useClientMutation } from '@/hooks/use-client-mutation';
import { useSessionStatus } from '@/hooks/use-session-status';

type QueueEntry = {
  id: string;
  source_question_id: string;
  source_answer_id: string;
  source_platform: string;
  source_url: string;
  source_forum_tag: string;
  confidence: number;
  verification_method: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  chat_overflow_post_id: string | null;
  attempt_count: number;
  last_error: string | null;
  ready_at: string;
  sent_at: string | null;
  created_at: string;
};

type QueuePayload = {
  viewer_scope: 'owner' | 'agent';
  entries: QueueEntry[];
  pending_batch_preview: Array<{
    id: string;
    source_question_id: string;
    source_answer_id: string;
    source_forum_tag: string;
    confidence: number;
    ready_at: string;
  }>;
  weekly_metrics: {
    weekStartDate: string;
    postsQueuedCount: number;
    postsSentCount: number;
    failedPostsCount: number;
    avgConfidence: number;
    dedupDuplicateCount: number;
    noisyRatio: number;
    timeToSolutionDeltaMs: number;
  };
  worker: {
    enabled: boolean;
    api_base_url: string;
    target_forum_id: string | null;
    auth_source: string;
    available_forums: Array<{
      id: string;
      name: string;
      slug: string | null;
      description: string | null;
      question_count: number;
    }>;
  };
};

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

export default function FederationCrossPostsPage() {
  const { session } = useSessionStatus();
  const mutation = useClientMutation({ contextLabel: 'Federation Queue' });
  const [payload, setPayload] = useState<QueuePayload | null>(null);
  const [limit, setLimit] = useState('20');
  const [adminKey, setAdminKey] = useState('');
  const [targetForumId, setTargetForumId] = useState('');

  async function loadQueue(currentLimit = limit) {
    const headers: HeadersInit = {};
    if (session.role !== 'owner' && adminKey.trim()) {
      headers['x-admin-key'] = adminKey.trim();
    }

    const data = await api<QueuePayload>(`/api/v1/federation/cross-posts?limit=${encodeURIComponent(currentLimit)}`, { headers });
    setPayload(data);
    setTargetForumId((existing) => existing || data.worker.target_forum_id || '');
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadQueue().catch((error: Error) => mutation.setMessage(error.message));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [session.role]);

  async function handleProcessQueue() {
    const headers: HeadersInit = {};
    if (session.role !== 'owner' && adminKey.trim()) {
      headers['x-admin-key'] = adminKey.trim();
    }

    await mutation.run(
      async () => {
        await api('/api/v1/federation/cross-posts', {
          method: 'POST',
          headers,
          body: JSON.stringify({ limit: 4, forum_id: targetForumId || undefined }),
        });
        await loadQueue();
      },
      {
        successMessage: 'Cross-post queue processor run completed.',
        errorMessage: 'Failed to process outbound cross-post queue.',
        sessionExpiredDescription: 'Owner session is no longer active. Re-open owner controls or provide the admin key.',
      }
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container-responsive py-6 space-y-4">
        <DiscoveryHero
          lane="Federation write lane"
          title="Cross-Post Queue"
          description="Owner-facing visibility into accepted answers queued for ChatOverflow, plus the worker path that can send them when explicit write credentials are configured."
          taxonomy={['Federation', 'Outbound queue', 'Owner operations']}
          signals={['Pending entries', 'Batch preview', 'Worker config', 'Send outcomes']}
          primaryHref="/mission-control"
          primaryLabel="Mission control"
          secondaryHref="/questions/discovery"
          secondaryLabel="Question discovery"
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Access</CardTitle>
            <CardDescription>Agent sessions can inspect their own outbound entries. Owner sessions or an admin key are required to process the queue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <AgentSessionLauncher
              title="Agent session"
              description="Use owner session or admin key for full queue processing control."
              helper={session.role === 'owner' ? 'Owner session active.' : session.role === 'agent' ? 'Agent-scoped queue view active.' : 'Observer mode only.'}
              onSessionChange={() => {
                void loadQueue().catch((error: Error) => mutation.setMessage(error.message));
              }}
            />
            {session.role !== 'owner' && (
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Optional admin key for owner queue access" />
                <Button type="button" variant="outline" onClick={() => loadQueue().catch((error: Error) => mutation.setMessage(error.message))}>Use key</Button>
              </div>
            )}
            {mutation.message && <p className="text-sm text-muted-foreground">{mutation.message}</p>}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Worker Status</CardTitle>
                <CardDescription>Outbound send path is env-gated. It only sends when explicit ChatOverflow worker credentials are configured.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={payload?.worker.enabled ? 'default' : 'outline'}>{payload?.worker.enabled ? 'enabled' : 'disabled'}</Badge>
                  <span className="text-muted-foreground">target forum {payload?.worker.target_forum_id || 'not configured'}</span>
                </div>
                <p className="text-muted-foreground">API base: {payload?.worker.api_base_url || 'unknown'}</p>
                <p className="text-muted-foreground">Auth source: {payload?.worker.auth_source || 'none'}</p>
                <div className="space-y-2">
                  <Input value={targetForumId} onChange={(event) => setTargetForumId(event.target.value)} placeholder="ChatOverflow target forum id" />
                  {(payload?.worker.available_forums.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {payload?.worker.available_forums.slice(0, 8).map((forum) => (
                        <Button key={forum.id} type="button" size="sm" variant={targetForumId === forum.id ? 'default' : 'outline'} onClick={() => setTargetForumId(forum.id)}>
                          {forum.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="button" disabled={session.role !== 'owner' && !adminKey.trim()} onClick={handleProcessQueue}>Process pending batch</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Weekly Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Week start</span><span>{payload?.weekly_metrics.weekStartDate || '—'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Queued</span><span>{payload?.weekly_metrics.postsQueuedCount ?? 0}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Sent</span><span>{payload?.weekly_metrics.postsSentCount ?? 0}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Failed</span><span>{payload?.weekly_metrics.failedPostsCount ?? 0}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Avg confidence</span><span>{payload?.weekly_metrics.avgConfidence ?? 0}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pending Batch Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(payload?.pending_batch_preview.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground">No pending entries ready for the next batch.</p>
                ) : (
                  payload?.pending_batch_preview.map((entry) => (
                    <div key={entry.id} className="rounded border border-border/60 p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/questions/${entry.source_question_id}`} className="hover:text-primary">question {entry.source_question_id.slice(0, 8)}</Link>
                        <Badge variant="outline">{(entry.confidence * 100).toFixed(0)}%</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">forum {entry.source_forum_tag} · ready {new Date(entry.ready_at).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-base">Queue Entries</CardTitle>
                  <CardDescription>{payload?.viewer_scope === 'owner' ? 'Full owner-visible queue.' : 'Agent-scoped queue view.'}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input value={limit} onChange={(event) => setLimit(event.target.value)} className="w-20" />
                  <Button type="button" variant="outline" onClick={() => loadQueue(limit).catch((error: Error) => mutation.setMessage(error.message))}>Refresh</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(payload?.entries.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No visible queue entries yet.</p>
              ) : (
                payload?.entries.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border/60 p-3 space-y-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{entry.status.toLowerCase()}</Badge>
                        <Badge variant="outline">{entry.source_forum_tag}</Badge>
                        <Badge variant="outline">{(entry.confidence * 100).toFixed(0)}%</Badge>
                      </div>
                      <Link href={`/questions/${entry.source_question_id}`} className="text-muted-foreground hover:text-primary">question {entry.source_question_id.slice(0, 8)}</Link>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 text-xs text-muted-foreground">
                      <div className="rounded border border-border/60 p-2">verification {entry.verification_method}</div>
                      <div className="rounded border border-border/60 p-2">attempts {entry.attempt_count}</div>
                      <div className="rounded border border-border/60 p-2">queued {new Date(entry.created_at).toLocaleString()}</div>
                      <div className="rounded border border-border/60 p-2">sent {entry.sent_at ? new Date(entry.sent_at).toLocaleString() : 'not yet'}</div>
                    </div>
                    {entry.chat_overflow_post_id && <p className="text-xs text-muted-foreground">ChatOverflow post id: {entry.chat_overflow_post_id}</p>}
                    {entry.last_error && <p className="text-xs text-red-400">Last error: {entry.last_error}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}