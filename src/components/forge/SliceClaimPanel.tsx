'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requestSessionLauncherOpen, useSessionStatus } from '@/hooks/use-session-status';

interface Slice {
  index: number;
  title: string;
  description: string;
  role: string;
  status: string;
}

interface GateInfo {
  eligible: boolean;
  role_required: string;
  details: {
    rep_score: number;
    has_domain_proof: boolean;
    accepted_contributions: number;
    required_contributions: number;
  } | null;
  reason?: string | null;
}

interface CheckGateResult {
  slice_index: number;
  eligible: boolean;
  role_required: string;
  reason?: string | null;
  details?: GateInfo['details'] | null;
  error?: string;
}

interface SliceClaimPanelProps {
  slug: string;
  slices: Slice[];
  category: string;
}

export function SliceClaimPanel({ slug, slices, category }: SliceClaimPanelProps) {
  const [claimingIdx, setClaimingIdx] = useState<number | null>(null);
  const [gateInfo, setGateInfo] = useState<Record<number, GateInfo>>({});
  const [prefetching, setPrefetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Set<number>>(new Set());
  const { session } = useSessionStatus();
  const hasAgentSession = session.role === 'agent';

  // Pre-fetch gate eligibility on mount for all open slices
  useEffect(() => {
    if (!hasAgentSession) {
      setPrefetching(false);
      return;
    }

    const openIndices = slices.filter((s) => s.status === 'OPEN').map((s) => s.index);
    if (openIndices.length === 0) {
      setPrefetching(false);
      return;
    }

    fetch(
      `/api/v1/forge/proposals/${slug}/check-gate?slice_indices=${openIndices.join(',')}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.results) {
          const info: Record<number, GateInfo> = {};
          for (const r of data.results as CheckGateResult[]) {
            if (r.error) continue;
            info[r.slice_index] = {
              eligible: r.eligible,
              role_required: r.role_required,
              details: r.details || null,
              reason: r.reason || null,
            };
          }
          setGateInfo(info);
        }
      })
      .catch(() => {})
      .finally(() => setPrefetching(false));
  }, [slug, slices, hasAgentSession]);

  async function handleClaim(idx: number) {
    if (!hasAgentSession) {
      setError('Start an agent session to claim a slice.');
      requestSessionLauncherOpen();
      return;
    }

    setClaimingIdx(idx);
    setError(null);

    try {
      const res = await fetch(`/api/v1/forge/proposals/${slug}/contribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slice_index: idx, submission_notes: 'Opting into slice' }),
      });

      const data = await res.json();

      if (res.ok) {
        setClaimed((prev) => new Set(prev).add(idx));
      } else {
        setError(data.error || 'Failed to claim slice');
      }
    } catch {
      setError('Network error');
    } finally {
      setClaimingIdx(null);
    }
  }

  function eligibilityBadge(info: GateInfo) {
    if (info.eligible) {
      return (
        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">
          <ShieldCheck className="size-3 mr-0.5" /> Eligible
        </Badge>
      );
    }
    if (!info.details) {
      return (
        <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20">
          <AlertTriangle className="size-3 mr-0.5" /> Not eligible
        </Badge>
      );
    }
    if (!info.details.has_domain_proof) {
      return (
        <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
          <ShieldAlert className="size-3 mr-0.5" /> Domain proof needed
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
        <ShieldAlert className="size-3 mr-0.5" /> {info.details.accepted_contributions}/{info.details.required_contributions} accepted
      </Badge>
    );
  }

  const openSlices = slices.filter((s) => s.status === 'OPEN' && !claimed.has(s.index));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Available Slices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prefetching && openSlices.length > 0 && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground ml-2">Checking eligibility...</span>
          </div>
        )}

        {!prefetching && openSlices.length === 0 && (
          <p className="text-sm text-muted-foreground">No open slices available.</p>
        )}

        {openSlices.map((slice) => {
          const info = gateInfo[slice.index];
          return (
            <div key={slice.index} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{slice.title}</span>
                <div className="flex items-center gap-1">
                  {info ? eligibilityBadge(info) : (
                    <Badge variant="secondary" className="text-[10px]">{slice.role}</Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{slice.description}</p>

              {info && !info.eligible && info.reason && (
                <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-2 space-y-1 text-xs">
                  <div className="flex items-center gap-1 text-yellow-400 font-medium">
                    <ShieldAlert className="size-3" />
                    Trust gate not met
                  </div>
                  <p className="text-yellow-400/80">{info.reason}</p>
                  {info.details && (
                    <div className="text-yellow-400/60">
                      Rep: {info.details.rep_score} | Domain proof: {info.details.has_domain_proof ? 'Yes' : 'No'}
                      {info.details.required_contributions > 0 && (
                        <> | Accepted: {info.details.accepted_contributions}/{info.details.required_contributions}</>
                      )}
                    </div>
                  )}
                </div>
              )}

              <Button
                size="sm"
                variant={info?.eligible ? 'default' : 'outline'}
                className={info?.eligible ? 'w-full bg-yellow-400 text-slate-950 hover:bg-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.18)]' : 'w-full'}
                disabled={claimingIdx === slice.index || (info && !info.eligible)}
                onClick={() => handleClaim(slice.index)}
              >
                {claimingIdx === slice.index ? (
                  <Loader2 className="size-3 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="size-3 mr-1" />
                )}
                {info && !info.eligible ? 'Not eligible' : 'Claim Slice'}
              </Button>
            </div>
          );
        })}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}
