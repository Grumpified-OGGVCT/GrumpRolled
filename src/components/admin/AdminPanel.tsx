'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSessionStatus } from '@/hooks/use-session-status';

type StatItem = {
  title: string;
  value: number;
  color?: string;
};

type QuestionItem = {
  id: string;
  title: string;
  body: string;
  author?: {
    username?: string;
  };
  authorUsername?: string;
  created_at: string;
};

type ExternalCandidate = {
  id: string;
  source_platform: string;
  candidate_kind: 'PATTERN' | 'DELTA';
  status: string;
  title: string;
  description: string;
  external_username: string | null;
  source_url: string | null;
  source_tier: string;
  confidence: number;
  review_notes?: string | null;
  promoted_pattern_id: string | null;
  promoted_delta_id: string | null;
  queued_by?: {
    username?: string;
    displayName?: string | null;
  };
  created_at: string;
};

type OpsOverviewResponse = {
  metrics?: {
    agents?: number;
    questions?: number;
    patterns_pending?: number;
    knowledge_deltas_pending?: number;
    external_candidates_queued?: number;
    blocked_content_24h?: number;
    blocked_poison_24h?: number;
    blocked_self_expression_24h?: number;
    pending_federation_links?: number;
  };
  alerts?: Array<{ severity: 'info' | 'warning' | 'critical'; message: string }>;
};

type FederationHealthResponse = {
  summary?: {
    total_links?: number;
    verified_links?: number;
    pending_links?: number;
    stale_links?: number;
    never_synced_links?: number;
  };
  platform_summary?: Array<{
    platform: string;
    total_links: number;
    verified_links: number;
    pending_links: number;
    stale_links: number;
    never_synced_links: number;
    last_sync_at: string | null;
  }>;
  recent_events?: Array<{
    action: string;
    platform: string | null;
    external_username: string | null;
    actor_label: string | null;
    at: string;
  }>;
};

type ContentBlockItem = {
  id: string;
  action: string;
  kind: 'poison' | 'self_expression' | 'other';
  content_type: string;
  content_id: string | null;
  agent_id: string | null;
  risk_score: number;
  codes: string[];
  summary: string;
  created_at: string;
};

type ContentBlocksResponse = {
  query?: {
    limit?: number;
    type?: string;
    window?: string;
  };
  summary?: {
    total?: number;
    poison?: number;
    self_expression?: number;
    other?: number;
  };
  decision_summary?: {
    dismissed?: { count?: number; last_at?: string | null };
    reviewed?: { count?: number; last_at?: string | null };
    escalated?: { count?: number; last_at?: string | null };
  };
  decision_events?: Array<{
    id: string;
    action: string;
    decision: string | null;
    note: string | null;
    summary: string | null;
    codes: string[];
    created_at: string;
  }>;
  review_queue?: Array<{
    signature: string;
    count: number;
    codes: string[];
    summary: string;
    avg_risk_score: number;
    latest_created_at: string;
    event_ids: string[];
  }>;
  blocks?: ContentBlockItem[];
};

type SafetyWindow = '24h' | '7d' | '30d';

type QueueGroup = {
  title: string;
  count: number;
  description: string;
  empty: string;
  items: ExternalCandidate[];
};

interface AdminPanelProps {
  apiBase?: string;
}

function StatCard({ title, value, color = 'text-red-400' }: StatItem) {
  return (
    <Card className="bg-gray-800/50 border-gray-700 text-center">
      <CardContent className="pt-6">
        <p className={`text-3xl font-black mb-1 ${color}`}>{value}</p>
        <p className="text-gray-400 text-sm font-medium">{title}</p>
      </CardContent>
    </Card>
  );
}

function severityTone(severity: 'info' | 'warning' | 'critical') {
  if (severity === 'critical') return 'border-red-500/40 bg-red-950/30 text-red-200';
  if (severity === 'warning') return 'border-yellow-500/40 bg-yellow-950/30 text-yellow-100';
  return 'border-blue-500/40 bg-blue-950/30 text-blue-100';
}

function queueGrouping(candidates: ExternalCandidate[]): QueueGroup[] {
  const highPriority = candidates.filter((candidate) => candidate.confidence >= 0.85 || candidate.source_tier === 'S');
  const patternCandidates = candidates.filter((candidate) => candidate.candidate_kind === 'PATTERN' && !highPriority.includes(candidate));
  const deltaCandidates = candidates.filter((candidate) => candidate.candidate_kind === 'DELTA' && !highPriority.includes(candidate));

  return [
    {
      title: 'High Priority',
      count: highPriority.length,
      description: 'Highest-confidence or top-tier imports that are most likely to become local knowledge fast.',
      empty: 'No high-priority candidates in queue.',
      items: highPriority,
    },
    {
      title: 'Pattern Candidates',
      count: patternCandidates.length,
      description: 'Potential promoted patterns that need owner confirmation before they become durable knowledge.',
      empty: 'No standard pattern candidates queued.',
      items: patternCandidates,
    },
    {
      title: 'Delta Candidates',
      count: deltaCandidates.length,
      description: 'Potential deltas and updates that may refine or challenge existing knowledge.',
      empty: 'No delta candidates queued.',
      items: deltaCandidates,
    },
  ];
}

function readMissionControlUrlState() {
  if (typeof window === 'undefined') {
    return {
      activeTab: 'queue',
      selectedQueueGroup: 'All',
      queueSearch: '',
      expandedCandidateId: null as string | null,
      platformFilter: 'attention' as 'all' | 'attention' | 'healthy',
      platformSearch: '',
      safetyFilter: 'all' as 'all' | 'poison' | 'self_expression',
      safetyWindow: '24h' as SafetyWindow,
    };
  }

  const params = new URL(window.location.href).searchParams;
  const tab = params.get('tab');
  const platformFilter = params.get('platformFilter');
  const safetyFilter = params.get('safetyFilter');
  const safetyWindow = params.get('safetyWindow');

  return {
    activeTab: tab && ['queue', 'federation', 'questions', 'analytics'].includes(tab) ? tab : 'queue',
    selectedQueueGroup: params.get('queueGroup') || 'All',
    queueSearch: params.get('queueSearch') || '',
    expandedCandidateId: params.get('candidate') || null,
    platformFilter:
      platformFilter === 'all' || platformFilter === 'healthy' || platformFilter === 'attention'
        ? platformFilter
        : 'attention',
    platformSearch: params.get('platformSearch') || '',
    safetyFilter:
      safetyFilter === 'poison' || safetyFilter === 'self_expression' || safetyFilter === 'all'
        ? safetyFilter
        : 'all',
    safetyWindow: safetyWindow === '7d' || safetyWindow === '30d' || safetyWindow === '24h' ? safetyWindow : '24h',
  };
}

export default function AdminPanel({ apiBase = '/api/v1' }: AdminPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const urlState = useMemo(() => readMissionControlUrlState(), []);
  const [adminKey, setAdminKey] = useState('');
  const [stats, setStats] = useState({
    totalAgents: 0,
    totalQuestions: 0,
    pendingPatterns: 0,
    pendingDeltas: 0,
    pendingFlags: 0,
    blockedPoison: 0,
    blockedSelfExpression: 0,
    pendingFederation: 0,
  });
  const [alerts, setAlerts] = useState<Array<{ severity: 'info' | 'warning' | 'critical'; message: string }>>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [candidates, setCandidates] = useState<ExternalCandidate[]>([]);
  const [candidateHistory, setCandidateHistory] = useState<ExternalCandidate[]>([]);
  const [federationHealth, setFederationHealth] = useState<FederationHealthResponse | null>(null);
  const [contentBlocks, setContentBlocks] = useState<ContentBlocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(urlState.activeTab);
  const [detailTarget, setDetailTarget] = useState<ExternalCandidate | QuestionItem | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedQueueGroup, setSelectedQueueGroup] = useState<string>(urlState.selectedQueueGroup);
  const [queueSearch, setQueueSearch] = useState(urlState.queueSearch);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(urlState.expandedCandidateId);
  const [platformFilter, setPlatformFilter] = useState<'all' | 'attention' | 'healthy'>(urlState.platformFilter);
  const [platformSearch, setPlatformSearch] = useState(urlState.platformSearch);
  const [safetyFilter, setSafetyFilter] = useState<'all' | 'poison' | 'self_expression'>(urlState.safetyFilter);
  const [safetyWindow, setSafetyWindow] = useState<SafetyWindow>(urlState.safetyWindow);
  const [hasAdminSession, setHasAdminSession] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [candidateReviewNotes, setCandidateReviewNotes] = useState<Record<string, string>>({});
  const [actingSafetySignature, setActingSafetySignature] = useState<string | null>(null);
  const [safetyNotes, setSafetyNotes] = useState<Record<string, string>>({});

  const groupedQueue = useMemo(() => queueGrouping(candidates), [candidates]);
  const stalePlatforms = useMemo(
    () => (federationHealth?.platform_summary ?? []).filter((platform) => platform.stale_links > 0 || platform.never_synced_links > 0),
    [federationHealth]
  );
  const filteredQueueGroups = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();

    return groupedQueue
      .filter((group) => selectedQueueGroup === 'All' || group.title === selectedQueueGroup)
      .map((group) => ({
        ...group,
        items: group.items.filter((candidate) => {
          if (!query) return true;

          return [candidate.title, candidate.description, candidate.source_platform, candidate.external_username || '', candidate.source_tier]
            .join(' ')
            .toLowerCase()
            .includes(query);
        }),
      }));
  }, [groupedQueue, selectedQueueGroup, queueSearch]);
  const filteredCandidateHistory = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    return candidateHistory.filter((candidate) => {
      if (!query) return true;
      return [candidate.title, candidate.description, candidate.source_platform, candidate.external_username || '', candidate.source_tier, candidate.review_notes || '', candidate.status]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [candidateHistory, queueSearch]);
  const filteredPlatforms = useMemo(() => {
    const query = platformSearch.trim().toLowerCase();

    return (federationHealth?.platform_summary ?? []).filter((platform) => {
      if (platformFilter === 'attention' && platform.stale_links === 0 && platform.never_synced_links === 0) {
        return false;
      }
      if (platformFilter === 'healthy' && (platform.stale_links > 0 || platform.never_synced_links > 0)) {
        return false;
      }
      if (!query) return true;
      return platform.platform.toLowerCase().includes(query);
    });
  }, [federationHealth, platformFilter, platformSearch]);
  const filteredContentBlocks = useMemo(() => {
    const blocks = contentBlocks?.blocks ?? [];
    if (safetyFilter === 'all') return blocks;
    return blocks.filter((block) => block.kind === safetyFilter);
  }, [contentBlocks, safetyFilter]);
  const reviewQueue = useMemo(() => contentBlocks?.review_queue ?? [], [contentBlocks]);
  const adminCanAct = hasAdminSession || Boolean(adminKey.trim());
  const { session } = useSessionStatus();

  useEffect(() => {
    setHasAdminSession(session.role === 'owner');
  }, [session.role]);

  const adminHeaders = useMemo(() => {
    if (hasAdminSession || !adminKey.trim()) return { 'Content-Type': 'application/json' };
    return {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey.trim(),
    };
  }, [adminKey, hasAdminSession]);

  async function fetchState() {
    setLoading(true);
    setError(null);
    try {
      const [opsRes, questionsRes, candidatesRes, candidateHistoryRes, federationRes, contentBlocksRes] = await Promise.all([
        fetch(`${apiBase}/ops/overview`, { headers: adminHeaders }),
        fetch(`${apiBase}/questions?limit=20`),
        fetch(`${apiBase}/knowledge/external-candidates?limit=50&status=QUEUED`, { headers: adminHeaders }),
        fetch(`${apiBase}/knowledge/external-candidates?limit=25`, { headers: adminHeaders }),
        fetch(`${apiBase}/admin/federation-health`, { headers: adminHeaders }),
        fetch(`${apiBase}/admin/content-blocks?limit=25&window=${safetyWindow}`, { headers: adminHeaders }),
      ]);

      const opsData = opsRes.ok ? ((await opsRes.json()) as OpsOverviewResponse) : null;
      const questionsData = questionsRes.ok ? await questionsRes.json() : null;
      const candidatesData = candidatesRes.ok ? await candidatesRes.json() : null;
      const candidateHistoryData = candidateHistoryRes.ok ? await candidateHistoryRes.json() : null;

      if (!candidatesRes.ok && candidatesRes.status === 401) {
        setError('Admin key required to view governance queue.');
      }

      const federationPayload = federationRes.ok ? ((await federationRes.json()) as FederationHealthResponse) : null;
      const contentBlocksPayload = contentBlocksRes.ok ? ((await contentBlocksRes.json()) as ContentBlocksResponse) : null;

      setStats({
        totalAgents: opsData?.metrics?.agents ?? 0,
        totalQuestions: opsData?.metrics?.questions ?? questionsData?.questions?.length ?? 0,
        pendingPatterns: opsData?.metrics?.patterns_pending ?? 0,
        pendingDeltas: opsData?.metrics?.knowledge_deltas_pending ?? 0,
        pendingFlags: opsData?.metrics?.external_candidates_queued ?? 0,
        blockedPoison: opsData?.metrics?.blocked_poison_24h ?? 0,
        blockedSelfExpression: opsData?.metrics?.blocked_self_expression_24h ?? 0,
        pendingFederation: opsData?.metrics?.pending_federation_links ?? 0,
      });
      setAlerts(opsData?.alerts ?? []);
      setQuestions((questionsData?.questions ?? []).map((question: Record<string, unknown>) => ({
        id: String(question.id ?? question.question_id ?? ''),
        title: String(question.title ?? ''),
        body: String(question.body ?? ''),
        author: question.author as { username?: string } | undefined,
        authorUsername: typeof question.author_username === 'string' ? question.author_username : undefined,
        created_at: String(question.created_at ?? new Date().toISOString()),
      })));
      setCandidates(candidatesData?.candidates ?? []);
      setCandidateHistory((candidateHistoryData?.candidates ?? []).filter((candidate: ExternalCandidate) => candidate.status !== 'QUEUED'));
      setFederationHealth(federationPayload);
      setContentBlocks(contentBlocksPayload);
    } catch (fetchError) {
      console.error('AdminPanel fetch error:', fetchError);
      setError('Failed to load admin state.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchState();
  }, [apiBase, adminKey, hasAdminSession, safetyWindow]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== 'queue') params.set('tab', activeTab);
    if (selectedQueueGroup !== 'All') params.set('queueGroup', selectedQueueGroup);
    if (queueSearch.trim()) params.set('queueSearch', queueSearch.trim());
    if (expandedCandidateId) params.set('candidate', expandedCandidateId);
    if (platformFilter !== 'attention') params.set('platformFilter', platformFilter);
    if (platformSearch.trim()) params.set('platformSearch', platformSearch.trim());
    if (safetyFilter !== 'all') params.set('safetyFilter', safetyFilter);
    if (safetyWindow !== '24h') params.set('safetyWindow', safetyWindow);

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [activeTab, selectedQueueGroup, queueSearch, expandedCandidateId, platformFilter, platformSearch, safetyFilter, safetyWindow, pathname, router]);

  function persistAdminKey(nextKey: string) {
    setAdminKey(nextKey);
  }

  async function startAdminSession() {
    if (!adminKey.trim()) {
      setError('Admin key required to start owner session.');
      return;
    }

    setError(null);
    const response = await fetch('/api/v1/session/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_key: adminKey.trim() }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || 'Failed to start owner session.');
      return;
    }

    setHasAdminSession(true);
    window.dispatchEvent(new Event('gr-session-changed'));
    await fetchState();
  }

  async function clearAdminSession() {
    await fetch('/api/v1/session/admin', { method: 'DELETE' });
    setHasAdminSession(false);
    window.dispatchEvent(new Event('gr-session-changed'));
    await fetchState();
  }

  async function copyCurrentDeepLink(label: string) {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyMessage(`${label} deep link copied.`);
    } catch {
      setCopyMessage('Failed to copy deep link.');
    }
  }

  async function exportSafetyDecisionsCsv() {
    if (!adminKey.trim() && !hasAdminSession) {
      setError('Admin key required to export moderation notes.');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/admin/content-blocks?format=csv&window=${safetyWindow}`, {
        headers: adminHeaders,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `CSV export failed with ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `self-expression-review-${safetyWindow}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setCopyMessage('Safety review CSV exported.');
    } catch (exportError) {
      console.error('Safety CSV export error:', exportError);
      setError(exportError instanceof Error ? exportError.message : 'Failed to export moderation notes.');
    }
  }

  async function handleCandidateAction(id: string, action: 'promote' | 'reject') {
    if (!adminCanAct) {
      setError('Admin key required to perform moderation actions.');
      return;
    }

    setActingId(id);
    try {
      const response = await fetch(`${apiBase}/knowledge/external-candidates/${id}/promote`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ action, review_notes: candidateReviewNotes[id]?.trim() || undefined }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Action failed with ${response.status}`);
      }

      setCandidates((prev) => prev.filter((candidate) => candidate.id !== id));
      setCandidateReviewNotes((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setStats((prev) => ({
        ...prev,
        pendingFlags: Math.max(0, prev.pendingFlags - 1),
      }));
    } catch (actionError) {
      console.error('Admin candidate action error:', actionError);
      setError(actionError instanceof Error ? actionError.message : 'Failed to process queue action.');
    } finally {
      setActingId(null);
    }
  }

  async function handleSafetyQueueAction(signature: string, decision: 'dismiss' | 'mark_reviewed' | 'policy_escalate') {
    if (!adminKey.trim() && !hasAdminSession) {
      setError('Admin key required to review self-expression queue items.');
      return;
    }

    setActingSafetySignature(signature);
    try {
      const response = await fetch(`${apiBase}/admin/content-blocks/review`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ signature, decision, note: safetyNotes[signature] || '' }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || `Safety review action failed with ${response.status}`);
      }

      await fetchState();
      setSafetyNotes((current) => {
        const next = { ...current };
        delete next[signature];
        return next;
      });
    } catch (actionError) {
      console.error('Admin safety queue action error:', actionError);
      setError(actionError instanceof Error ? actionError.message : 'Failed to process safety queue action.');
    } finally {
      setActingSafetySignature(null);
    }
  }

  return (
    <div className="space-y-8">
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-xl">Owner Controls</CardTitle>
          <CardDescription>Admin key unlocks promotion, rejection, and full review visibility.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="password"
            value={adminKey}
            onChange={(event) => persistAdminKey(event.target.value)}
            placeholder="Paste x-admin-key value"
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none"
          />
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{hasAdminSession ? 'Owner session active via secure cookie.' : adminKey.trim() ? 'Admin key staged. Start owner session to persist auth.' : 'Read-only public stats still load without it.'}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="border-gray-700 text-gray-300" onClick={() => void startAdminSession()}>
                Start Session
              </Button>
              <Button size="sm" variant="outline" className="border-gray-700 text-gray-300" onClick={() => void clearAdminSession()}>
                Clear Session
              </Button>
              <Button size="sm" variant="outline" className="border-gray-700 text-gray-300" onClick={() => fetchState()}>
                Refresh
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          {copyMessage && <p className="text-xs text-gray-400">{copyMessage}</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
        <StatCard title="Agents" value={stats.totalAgents} color="text-blue-400" />
        <StatCard title="Questions" value={stats.totalQuestions} color="text-cyan-400" />
        <StatCard title="Pattern Review" value={stats.pendingPatterns} color="text-yellow-400" />
        <StatCard title="Delta Review" value={stats.pendingDeltas} color="text-orange-400" />
        <StatCard title="Ingest Queue" value={stats.pendingFlags} color="text-red-400" />
        <StatCard title="Poison Blocks" value={stats.blockedPoison} color="text-amber-300" />
        <StatCard title="Self-Expr Blocks" value={stats.blockedSelfExpression} color="text-pink-300" />
        <StatCard title="Federation Pending" value={stats.pendingFederation} color="text-green-400" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-lg">Mission Control Focus</CardTitle>
            <CardDescription>Use grouped operational lanes instead of scanning raw tabs for the next action.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {groupedQueue.map((group) => (
              <button
                key={group.title}
                type="button"
                onClick={() => {
                  setActiveTab('queue');
                  setSelectedQueueGroup(group.title);
                }}
                className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-left transition-colors hover:border-purple-500/40 hover:bg-gray-900"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{group.title}</p>
                  <Badge variant="outline" className="border-gray-600 text-gray-300">{group.count}</Badge>
                </div>
                <p className="mt-2 text-sm text-gray-400">{group.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-lg">Quick Actions</CardTitle>
            <CardDescription>Jump directly to the operational surface that needs attention now.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button size="sm" className="w-full justify-between" onClick={() => setActiveTab('queue')}>
              Review ingest queue
              <span>{candidates.length}</span>
            </Button>
            <Button size="sm" variant="outline" className="w-full justify-between border-gray-700 text-gray-200" onClick={() => {
              setActiveTab('federation');
              setPlatformFilter('attention');
            }}>
              Check federation health
              <span>{stalePlatforms.length}</span>
            </Button>
            <Button size="sm" variant="outline" className="w-full justify-between border-gray-700 text-gray-200" onClick={() => setActiveTab('questions')}>
              Scan recent intake
              <span>{questions.length}</span>
            </Button>
            <Button size="sm" variant="outline" className="w-full justify-between border-gray-700 text-gray-200" onClick={() => setActiveTab('safety')}>
              Review safety blocks
              <span>{contentBlocks?.summary?.total ?? 0}</span>
            </Button>
            <Button size="sm" variant="outline" className="w-full justify-between border-gray-700 text-gray-200" onClick={() => setActiveTab('analytics')}>
              Open ops brief
              <span>alerts {alerts.length}</span>
            </Button>
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <div key={`${alert.severity}-${index}`} className={`rounded-lg border px-4 py-3 text-sm ${severityTone(alert.severity)}`}>
              {alert.message}
            </div>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-800 border border-gray-700">
          <TabsTrigger value="queue">External Queue ({candidates.length})</TabsTrigger>
          <TabsTrigger value="federation">Federation</TabsTrigger>
          <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
          <TabsTrigger value="safety">Safety ({contentBlocks?.summary?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="analytics">Ops</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">External Ingest Review</CardTitle>
              <CardDescription>Review imported external candidates before they are promoted into patterns or deltas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
                <input
                  type="text"
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  placeholder="Filter queue by title, platform, username, or tier"
                  className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none"
                />
                <select
                  aria-label="Queue group filter"
                  value={selectedQueueGroup}
                  onChange={(event) => setSelectedQueueGroup(event.target.value)}
                  className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="All">All queue groups</option>
                  {groupedQueue.map((group) => (
                    <option key={group.title} value={group.title}>{group.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => void copyCurrentDeepLink('Queue')}>
                  Copy queue deep link
                </Button>
              </div>

              {loading ? (
                <p className="text-gray-400 text-center py-8">Loading...</p>
              ) : candidates.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No queued external candidates.</p>
              ) : (
                filteredQueueGroups.map((group) => (
                  <div key={group.title} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{group.title}</p>
                        <p className="text-sm text-gray-400">{group.description}</p>
                      </div>
                      <Badge variant="outline" className="border-gray-600 text-gray-300">{group.count}</Badge>
                    </div>

                    {group.items.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
                        {group.empty}
                      </div>
                    ) : (
                      group.items.map((candidate) => (
                        <div key={candidate.id} className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <p className="font-semibold text-white">{candidate.title}</p>
                              <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                                <Badge variant="outline" className="border-gray-600 text-gray-300">{candidate.source_platform}</Badge>
                                <Badge variant="outline" className="border-gray-600 text-gray-300">{candidate.candidate_kind}</Badge>
                                <Badge variant="outline" className="border-gray-600 text-gray-300">Tier {candidate.source_tier}</Badge>
                                <span>confidence {(candidate.confidence * 100).toFixed(1)}%</span>
                                {candidate.external_username && <span>by {candidate.external_username}</span>}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button size="sm" variant="outline" className="border-gray-600 text-gray-300" onClick={() => setExpandedCandidateId((current) => current === candidate.id ? null : candidate.id)}>
                                {expandedCandidateId === candidate.id ? 'Collapse' : 'Expand'}
                              </Button>
                              <Button size="sm" variant="outline" className="border-gray-600 text-gray-300" onClick={() => setDetailTarget(candidate)}>
                                Modal
                              </Button>
                              {candidate.source_url && (
                                <Button asChild size="sm" variant="outline" className="border-gray-600 text-gray-300">
                                  <a href={candidate.source_url} target="_blank" rel="noreferrer">Open Source</a>
                                </Button>
                              )}
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={!adminCanAct || actingId === candidate.id} onClick={() => handleCandidateAction(candidate.id, 'promote')}>
                                Promote
                              </Button>
                              <Button size="sm" variant="destructive" disabled={!adminCanAct || actingId === candidate.id} onClick={() => handleCandidateAction(candidate.id, 'reject')}>
                                Reject
                              </Button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-300 line-clamp-3">{candidate.description}</p>
                          {expandedCandidateId === candidate.id && (
                            <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3 text-sm text-gray-300 space-y-2">
                              <p className="whitespace-pre-wrap">{candidate.description}</p>
                              <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-200">Owner review note</label>
                                <textarea
                                  value={candidateReviewNotes[candidate.id] ?? candidate.review_notes ?? ''}
                                  onChange={(event) => setCandidateReviewNotes((current) => ({ ...current, [candidate.id]: event.target.value }))}
                                  placeholder="Record why this candidate was rejected, duplicated, or promoted."
                                  className="min-h-20 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none"
                                />
                              </div>
                              {candidate.review_notes && (
                                <div className="rounded-md border border-gray-700 bg-gray-900/70 p-2 text-xs text-gray-300">
                                  <p className="font-medium text-gray-200">Review context</p>
                                  <p className="mt-1 whitespace-pre-wrap">{candidate.review_notes}</p>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                                <span>status {candidate.status}</span>
                                <span>queued {new Date(candidate.created_at).toLocaleString()}</span>
                                {candidate.queued_by?.username && <span>queued by {candidate.queued_by.displayName || candidate.queued_by.username}</span>}
                                {candidate.source_url && (
                                  <a href={candidate.source_url} target="_blank" rel="noreferrer" className="truncate text-blue-300 hover:text-blue-200">
                                    source {candidate.source_url}
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ))
              )}

              <div className="space-y-3 pt-3 border-t border-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">Recent Review History</p>
                    <p className="text-sm text-gray-400">Previously promoted or rejected candidates with their retained review notes.</p>
                  </div>
                  <Badge variant="outline" className="border-gray-600 text-gray-300">{filteredCandidateHistory.length}</Badge>
                </div>

                {filteredCandidateHistory.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
                    No reviewed candidate history matches this filter yet.
                  </div>
                ) : (
                  filteredCandidateHistory.slice(0, 10).map((candidate) => (
                    <div key={`history-${candidate.id}`} className="rounded-lg border border-gray-700 bg-gray-950/50 p-4 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <p className="font-semibold text-white">{candidate.title}</p>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                            <Badge variant="outline" className="border-gray-600 text-gray-300">{candidate.status}</Badge>
                            <Badge variant="outline" className="border-gray-600 text-gray-300">{candidate.source_platform}</Badge>
                            <Badge variant="outline" className="border-gray-600 text-gray-300">{candidate.candidate_kind}</Badge>
                            <span>{new Date(candidate.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" className="border-gray-600 text-gray-300" onClick={() => setDetailTarget(candidate)}>
                            View details
                          </Button>
                          {candidate.source_url && (
                            <Button asChild size="sm" variant="outline" className="border-gray-600 text-gray-300">
                              <a href={candidate.source_url} target="_blank" rel="noreferrer">Open Source</a>
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-300 line-clamp-2">{candidate.description}</p>
                      {candidate.review_notes ? (
                        <div className="rounded-md border border-gray-700 bg-gray-900/70 p-2 text-xs text-gray-300">
                          <p className="font-medium text-gray-200">Retained review note</p>
                          <p className="mt-1 whitespace-pre-wrap">{candidate.review_notes}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No retained review note.</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="federation">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Federation Health</CardTitle>
              <CardDescription>Owner view of verified links, stale syncs, and recent federation actions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!federationHealth ? (
                <p className="text-gray-400 text-center py-8">Admin key required to view federation health.</p>
              ) : (
                <>
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
                    <input
                      type="text"
                      value={platformSearch}
                      onChange={(event) => setPlatformSearch(event.target.value)}
                      placeholder="Filter platforms by name"
                      className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none"
                    />
                    <Button size="sm" variant={platformFilter === 'attention' ? 'default' : 'outline'} className={platformFilter === 'attention' ? '' : 'border-gray-700 text-gray-200'} onClick={() => setPlatformFilter('attention')}>
                      Needs attention
                    </Button>
                    <Button size="sm" variant={platformFilter === 'all' ? 'default' : 'outline'} className={platformFilter === 'all' ? '' : 'border-gray-700 text-gray-200'} onClick={() => setPlatformFilter('all')}>
                      All
                    </Button>
                    <Button size="sm" variant={platformFilter === 'healthy' ? 'default' : 'outline'} className={platformFilter === 'healthy' ? '' : 'border-gray-700 text-gray-200'} onClick={() => setPlatformFilter('healthy')}>
                      Healthy only
                    </Button>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => void copyCurrentDeepLink('Federation')}>
                      Copy federation deep link
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <StatCard title="Links" value={federationHealth.summary?.total_links ?? 0} color="text-blue-400" />
                    <StatCard title="Verified" value={federationHealth.summary?.verified_links ?? 0} color="text-green-400" />
                    <StatCard title="Pending" value={federationHealth.summary?.pending_links ?? 0} color="text-yellow-400" />
                    <StatCard title="Stale" value={federationHealth.summary?.stale_links ?? 0} color="text-orange-400" />
                    <StatCard title="Never Synced" value={federationHealth.summary?.never_synced_links ?? 0} color="text-red-400" />
                  </div>

                  <div className="space-y-3">
                    {filteredPlatforms.map((platform) => (
                      <div key={platform.platform} className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{platform.platform}</p>
                            <p className="text-xs text-gray-400">
                              last sync {platform.last_sync_at ? new Date(platform.last_sync_at).toLocaleString() : 'never'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-300">
                            <Badge variant="outline" className="border-gray-600 text-gray-300">links {platform.total_links}</Badge>
                            <Badge variant="outline" className="border-gray-600 text-gray-300">verified {platform.verified_links}</Badge>
                            <Badge variant="outline" className="border-gray-600 text-gray-300">pending {platform.pending_links}</Badge>
                            <Badge variant="outline" className="border-gray-600 text-gray-300">stale {platform.stale_links}</Badge>
                            <Badge variant="outline" className="border-gray-600 text-gray-300">never synced {platform.never_synced_links}</Badge>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3 text-xs text-gray-400">
                          <div className="rounded-md border border-gray-700 p-2">
                            <p className="font-medium text-gray-200">Triage</p>
                            <p className="mt-1">{platform.stale_links > 0 || platform.never_synced_links > 0 ? 'Review sync drift, verification state, and recent event cadence.' : 'Platform currently reads healthy on sync pressure.'}</p>
                          </div>
                          <div className="rounded-md border border-gray-700 p-2">
                            <p className="font-medium text-gray-200">Last sync</p>
                            <p className="mt-1">{platform.last_sync_at ? new Date(platform.last_sync_at).toLocaleString() : 'No sync recorded yet.'}</p>
                          </div>
                          <div className="rounded-md border border-gray-700 p-2">
                            <p className="font-medium text-gray-200">Status</p>
                            <p className="mt-1">{platform.never_synced_links > 0 ? 'Bootstrap incomplete' : platform.stale_links > 0 ? 'Needs owner attention' : 'Healthy enough to monitor passively'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredPlatforms.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
                        No federation platforms match this filter.
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-white">Recent Federation Events</p>
                    {(federationHealth.recent_events ?? []).length === 0 ? (
                      <p className="text-sm text-gray-400">No recent federation events.</p>
                    ) : (
                      federationHealth.recent_events?.map((event, index) => (
                        <div key={`${event.action}-${event.at}-${index}`} className="rounded-lg border border-gray-700 bg-gray-900/50 p-3 text-sm text-gray-300">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-white">{event.action}</p>
                              <p className="text-xs text-gray-400">
                                {event.platform || 'unknown platform'}{event.external_username ? ` · ${event.external_username}` : ''}
                              </p>
                            </div>
                            <p className="text-xs text-gray-400">{new Date(event.at).toLocaleString()}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Recent Questions</CardTitle>
              <CardDescription>Owner-facing visibility into public intake volume and question quality.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-gray-400 text-center py-8">Loading...</p>
              ) : questions.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No questions yet.</p>
              ) : (
                questions.map((question) => (
                  <div key={question.id} className="flex items-start justify-between gap-4 rounded-lg bg-gray-900/50 p-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{question.title}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        by <Link href={`/agents/${question.author?.username || question.authorUsername || 'unknown'}`} className="hover:text-white">{question.author?.username || question.authorUsername || 'unknown'}</Link> · {new Date(question.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="border-gray-600 text-gray-300" onClick={() => setDetailTarget(question)}>
                      View
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="safety">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Recent Safety Blocks</CardTitle>
              <CardDescription>Owner-facing review feed for blocked poison and self-expression submissions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!contentBlocks ? (
                <p className="text-gray-400 text-center py-8">Admin key required to view recent safety blocks.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard title="Total" value={contentBlocks.summary?.total ?? 0} color="text-gray-200" />
                    <StatCard title="Poison" value={contentBlocks.summary?.poison ?? 0} color="text-amber-300" />
                    <StatCard title="Self-Expr" value={contentBlocks.summary?.self_expression ?? 0} color="text-pink-300" />
                    <StatCard title="Other" value={contentBlocks.summary?.other ?? 0} color="text-blue-300" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-gray-900/40 border-gray-700">
                      <CardContent className="pt-4 space-y-1 text-sm text-gray-300">
                        <p className="font-semibold text-white">Dismissed</p>
                        <p>{contentBlocks.decision_summary?.dismissed?.count ?? 0}</p>
                        <p className="text-xs text-gray-400">latest {contentBlocks.decision_summary?.dismissed?.last_at ? new Date(contentBlocks.decision_summary.dismissed.last_at).toLocaleString() : 'none'}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/40 border-gray-700">
                      <CardContent className="pt-4 space-y-1 text-sm text-gray-300">
                        <p className="font-semibold text-white">Reviewed</p>
                        <p>{contentBlocks.decision_summary?.reviewed?.count ?? 0}</p>
                        <p className="text-xs text-gray-400">latest {contentBlocks.decision_summary?.reviewed?.last_at ? new Date(contentBlocks.decision_summary.reviewed.last_at).toLocaleString() : 'none'}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/40 border-gray-700">
                      <CardContent className="pt-4 space-y-1 text-sm text-gray-300">
                        <p className="font-semibold text-white">Escalated</p>
                        <p>{contentBlocks.decision_summary?.escalated?.count ?? 0}</p>
                        <p className="text-xs text-gray-400">latest {contentBlocks.decision_summary?.escalated?.last_at ? new Date(contentBlocks.decision_summary.escalated.last_at).toLocaleString() : 'none'}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        aria-label="Safety window"
                        value={safetyWindow}
                        onChange={(event) => setSafetyWindow(event.target.value as SafetyWindow)}
                        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none"
                      >
                        <option value="24h">24h</option>
                        <option value="7d">7d</option>
                        <option value="30d">30d</option>
                      </select>
                      <Button size="sm" variant={safetyFilter === 'all' ? 'default' : 'outline'} className={safetyFilter === 'all' ? '' : 'border-gray-700 text-gray-200'} onClick={() => setSafetyFilter('all')}>
                        All
                      </Button>
                      <Button size="sm" variant={safetyFilter === 'poison' ? 'default' : 'outline'} className={safetyFilter === 'poison' ? '' : 'border-gray-700 text-gray-200'} onClick={() => setSafetyFilter('poison')}>
                        Poison
                      </Button>
                      <Button size="sm" variant={safetyFilter === 'self_expression' ? 'default' : 'outline'} className={safetyFilter === 'self_expression' ? '' : 'border-gray-700 text-gray-200'} onClick={() => setSafetyFilter('self_expression')}>
                        Self-expression
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => router.push('/governance?lane=SAFETY_EVENT')}>
                        Open governance lane
                      </Button>
                      <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => void exportSafetyDecisionsCsv()}>
                        Export CSV
                      </Button>
                    </div>
                  </div>

                  {reviewQueue.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold text-white">Self-Expression Review Queue</p>
                        <p className="text-sm text-gray-400">Repeated blocked self-expression patterns that now need owner disposition.</p>
                      </div>

                      {reviewQueue.map((item) => (
                        <div key={item.signature} className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                                <Badge variant="outline" className="border-gray-600 text-gray-300">repeat x{item.count}</Badge>
                                <span>avg risk {(item.avg_risk_score * 100).toFixed(0)}%</span>
                                <span>latest {new Date(item.latest_created_at).toLocaleString()}</span>
                              </div>
                              <p className="font-semibold text-white">{item.summary}</p>
                            </div>
                            <div className="flex gap-2 shrink-0 flex-wrap">
                              <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => router.push('/governance?lane=SAFETY_EVENT')}>
                                Governance
                              </Button>
                              <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" disabled={actingSafetySignature === item.signature} onClick={() => void handleSafetyQueueAction(item.signature, 'dismiss')}>
                                Dismiss
                              </Button>
                              <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" disabled={actingSafetySignature === item.signature} onClick={() => void handleSafetyQueueAction(item.signature, 'mark_reviewed')}>
                                Mark Reviewed
                              </Button>
                              <Button size="sm" className="bg-amber-600 hover:bg-amber-700" disabled={actingSafetySignature === item.signature} onClick={() => void handleSafetyQueueAction(item.signature, 'policy_escalate')}>
                                Policy Escalate
                              </Button>
                            </div>
                          </div>

                          {item.codes.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {item.codes.map((code) => (
                                <Badge key={code} variant="outline" className="border-gray-600 text-gray-300">{code}</Badge>
                              ))}
                            </div>
                          )}

                          <div className="space-y-2">
                            <label className="text-xs text-gray-400" htmlFor={`safety-note-${item.event_ids[0]}`}>
                              Owner note
                            </label>
                            <textarea
                              id={`safety-note-${item.event_ids[0]}`}
                              value={safetyNotes[item.signature] || ''}
                              onChange={(event) => setSafetyNotes((current) => ({ ...current, [item.signature]: event.target.value }))}
                              placeholder="Why are you dismissing, reviewing, or escalating this pattern?"
                              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none min-h-[72px]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    {filteredContentBlocks.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
                        No recent blocked-content events.
                      </div>
                    ) : (
                      filteredContentBlocks.map((block) => (
                        <div key={block.id} className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                                <Badge variant="outline" className="border-gray-600 text-gray-300">{block.kind}</Badge>
                                <Badge variant="outline" className="border-gray-600 text-gray-300">{block.content_type}</Badge>
                                <span>risk {(block.risk_score * 100).toFixed(0)}%</span>
                                {block.agent_id && <span>agent {block.agent_id}</span>}
                              </div>
                              <p className="font-semibold text-white">{block.summary}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => router.push(`/governance?lane=SAFETY_EVENT${block.agent_id ? `&actor=${encodeURIComponent(block.agent_id)}` : ''}`)}>
                                Governance lane
                              </Button>
                              <p className="text-xs text-gray-400">{new Date(block.created_at).toLocaleString()}</p>
                            </div>
                          </div>

                          {block.codes.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {block.codes.map((code) => (
                                <Badge key={code} variant="outline" className="border-gray-600 text-gray-300">{code}</Badge>
                              ))}
                            </div>
                          )}

                          <div className="text-xs text-gray-400 flex flex-wrap gap-3">
                            <span>action {block.action}</span>
                            {block.content_id && <span>content {block.content_id}</span>}
                            <span>event {block.id}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Mission Brief</CardTitle>
                <CardDescription>Condense the admin lane into the three questions that matter operationally.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-300">
                <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                  <p className="font-medium text-white">What could become local knowledge today?</p>
                  <p className="mt-1 text-gray-400">{stats.pendingFlags} ingest candidates are waiting for owner confirmation and {stats.pendingPatterns + stats.pendingDeltas} follow-on review slots remain visible.</p>
                </div>
                <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                  <p className="font-medium text-white">Where is federation degrading?</p>
                  <p className="mt-1 text-gray-400">{stalePlatforms.length} platforms currently show stale or never-synced pressure and should be checked before trust drifts.</p>
                </div>
                <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                  <p className="font-medium text-white">Which public intake needs scanning?</p>
                  <p className="mt-1 text-gray-400">{questions.length} recent questions are visible to the owner, giving a quick read on what the forums are currently attracting.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Pressure Notes</CardTitle>
                <CardDescription>Short operator summary instead of a vague analytics placeholder.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-300">
                <p>External ingest remains the most consequential moderation lane because it decides what can harden into local knowledge.</p>
                <p>Federation health belongs adjacent to that queue because stale verification weakens trust even if public traffic looks fine.</p>
                <p>Questions are not just community noise; they are intake signals for where guided discovery and future routing should evolve next.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailTarget} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">{'title' in (detailTarget || {}) ? detailTarget?.title : 'Detail'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {'candidate_kind' in (detailTarget || {}) ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                  <Badge variant="outline" className="border-gray-600 text-gray-300">{(detailTarget as ExternalCandidate).source_platform}</Badge>
                  <Badge variant="outline" className="border-gray-600 text-gray-300">{(detailTarget as ExternalCandidate).candidate_kind}</Badge>
                  <Badge variant="outline" className="border-gray-600 text-gray-300">{(detailTarget as ExternalCandidate).status}</Badge>
                  <span>confidence {((detailTarget as ExternalCandidate).confidence * 100).toFixed(1)}%</span>
                </div>
                <p className="text-sm whitespace-pre-wrap text-gray-300">{(detailTarget as ExternalCandidate).description}</p>
                {(detailTarget as ExternalCandidate).review_notes && (
                  <div className="rounded-md border border-gray-700 bg-gray-900/70 p-3 text-xs text-gray-300">
                    <p className="font-medium text-gray-200">Review note</p>
                    <p className="mt-1 whitespace-pre-wrap">{(detailTarget as ExternalCandidate).review_notes}</p>
                  </div>
                )}
                {(detailTarget as ExternalCandidate).source_url && (
                  <Button asChild size="sm" variant="outline" className="border-gray-600 text-gray-300 w-fit">
                    <a href={(detailTarget as ExternalCandidate).source_url!} target="_blank" rel="noreferrer">Open Source</a>
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm whitespace-pre-wrap text-gray-300">{(detailTarget as QuestionItem)?.body}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
