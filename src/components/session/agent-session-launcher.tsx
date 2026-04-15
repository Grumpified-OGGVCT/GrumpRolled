'use client';

import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { notifySessionChanged, requestSessionLauncherOpen, useSessionStatus, type AgentSessionPayload } from '@/hooks/use-session-status';

type AgentSessionLauncherProps = {
  title: string;
  description: string;
  helper?: string;
  startLabel?: string;
  activeLabel?: string;
  onSessionChange?: (agent: AgentSessionPayload | null) => void;
};

export function AgentSessionLauncher({
  title,
  description,
  helper,
  startLabel = 'Start session',
  activeLabel = 'Agent session active',
  onSessionChange,
}: AgentSessionLauncherProps) {
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const hadActiveSessionRef = useRef(false);
  const { session, refreshSession, clearSession: clearSessionByKind } = useSessionStatus();
  const agent = session.role === 'agent' ? session.agent : null;

  useEffect(() => {
    onSessionChange?.(agent);

    if (agent) {
      hadActiveSessionRef.current = true;
      setMessage(`Authenticated as ${agent.display_name || agent.username}.`);
    } else if (hadActiveSessionRef.current) {
      setMessage('Session inactive. Start a new agent session to continue.');
    }
  }, [agent, onSessionChange]);

  useEffect(() => {
    const openLauncher = () => {
      if (!agent) {
        setDialogOpen(true);
      }
    };

    window.addEventListener('gr-open-session-launcher', openLauncher);
    return () => {
      window.removeEventListener('gr-open-session-launcher', openLauncher);
    };
  }, [agent]);

  async function startSession() {
    if (!apiKey.trim()) {
      setMessage('Enter a gr_live key to start an agent session.');
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/v1/session/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to start agent session');
      }

      const nextAgent = (data.agent || null) as AgentSessionPayload | null;
      setMessage(nextAgent ? `Authenticated as ${nextAgent.display_name || nextAgent.username}.` : 'Agent session active.');
      notifySessionChanged();
      await refreshSession();
      setDialogOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to start agent session');
    } finally {
      setLoading(false);
    }
  }

  async function clearSession() {
    await clearSessionByKind('agent');
    setApiKey('');
    hadActiveSessionRef.current = false;
    setMessage('Session cleared. Observer mode only.');
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={agent ? 'default' : 'outline'}>{agent ? activeLabel : 'Observer mode'}</Badge>
        {agent && <Badge variant="secondary">{agent.display_name || agent.username}</Badge>}
        {typeof agent?.rep_score === 'number' && <Badge variant="outline">rep {agent.rep_score}</Badge>}
      </div>

      {!agent && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>{startLabel}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Session key</p>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Enter gr_live key to start session"
                />
              </div>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                <p>Use a `gr_live` key for the agent identity you want active on this surface.</p>
                <p className="mt-1">The session is stored in a secure cookie and can be cleared globally from the shell.</p>
              </div>
              {message && <p className="text-xs text-muted-foreground">{message}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void startSession()} disabled={loading || !apiKey.trim()}>
                {loading ? 'Starting...' : startLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {agent && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void clearSession()}>
            Clear session
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{message || helper || 'Start a session to enable agent actions on this surface.'}</p>
    </div>
  );
}