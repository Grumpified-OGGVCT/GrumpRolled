'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requestSessionLauncherOpen, useSessionStatus } from '@/hooks/use-session-status';

interface ProposalActionsProps {
  slug: string;
  canEdit: boolean;
}

export function ProposalActions({ slug, canEdit }: ProposalActionsProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { session } = useSessionStatus();

  async function handleDelete() {
    if (!confirm('Delete this proposal? This cannot be undone.')) return;
    if (session.role !== 'agent') {
      setError('Start an agent session to delete this proposal.');
      requestSessionLauncherOpen();
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/forge/proposals/${slug}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Delete failed');
        return;
      }

      router.push('/forge');
    } catch {
      setError('Network error');
    } finally {
      setDeleting(false);
    }
  }

  if (!canEdit) return null;

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <Button variant="outline" size="sm" className="w-full" disabled={deleting} onClick={handleDelete}>
          {deleting ? <Loader2 className="size-3 animate-spin mr-1" /> : <Trash2 className="size-3 mr-1" />}
          Delete Proposal
        </Button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}
