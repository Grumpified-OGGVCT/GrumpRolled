'use client';

import Link from 'next/link';
import { useState } from 'react';
import { KeyRound, Loader2, Shield } from 'lucide-react';

import { AgentSessionLauncher } from '@/components/session/agent-session-launcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { notifySessionChanged, useSessionStatus, type SessionStatusPayload } from '@/hooks/use-session-status';

type PerspectiveRole = SessionStatusPayload['role'];

type PerspectiveGuardProps = {
  allow: PerspectiveRole[];
  title: string;
  description: string;
  children: React.ReactNode;
  deniedTitle?: string;
  deniedDescription?: string;
};

function roleIsAllowed(role: PerspectiveRole, allowed: PerspectiveRole[]): boolean {
  return allowed.includes(role);
}

export default function PerspectiveGuard({
  allow,
  title,
  description,
  children,
  deniedTitle = 'Session required',
  deniedDescription = 'This surface is scoped to a different GrumpRolled perspective.',
}: PerspectiveGuardProps) {
  const { session, refreshSession } = useSessionStatus();
  const [adminKey, setAdminKey] = useState('');
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [startingAdmin, setStartingAdmin] = useState(false);

  if (roleIsAllowed(session.role, allow)) {
    return <>{children}</>;
  }

  const ownerAllowed = allow.includes('owner') || allow.includes('admin');
  const agentAllowed = allow.includes('agent');

  async function startOwnerSession() {
    if (!adminKey.trim()) {
      setAdminMessage('Enter the master/admin key to start a secure owner session.');
      return;
    }

    setStartingAdmin(true);
    setAdminMessage(null);
    try {
      const response = await fetch('/api/v1/session/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_key: adminKey.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to start owner session');
      }

      setAdminKey('');
      setAdminMessage('Owner session active.');
      notifySessionChanged();
      await refreshSession();
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Failed to start owner session');
    } finally {
      setStartingAdmin(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container-responsive flex min-h-[70vh] items-center py-10">
        <Card className="mx-auto w-full max-w-2xl">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Current: {session.perspective.label}</Badge>
              {allow.map((role) => (
                <Badge key={role} variant="secondary">Requires {role}</Badge>
              ))}
            </div>
            <CardTitle>{deniedTitle}</CardTitle>
            <CardDescription>{deniedDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{title}</p>
              <p className="mt-1">{description}</p>
            </div>

            {ownerAllowed && (
              <div className="space-y-3 rounded-md border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <Shield className="size-4 text-primary" />
                  <p className="text-sm font-medium">Start owner/admin session</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  The master key is used once to issue a signed HTTP-only session cookie. It is not stored in browser storage.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    value={adminKey}
                    onChange={(event) => setAdminKey(event.target.value)}
                    placeholder="Enter master/admin key"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void startOwnerSession();
                    }}
                  />
                  <Button onClick={() => void startOwnerSession()} disabled={startingAdmin || !adminKey.trim()}>
                    {startingAdmin && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Start session
                  </Button>
                </div>
                {adminMessage && <p className="text-xs text-muted-foreground">{adminMessage}</p>}
              </div>
            )}

            {agentAllowed && (
              <div className="rounded-md border border-border/60 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <KeyRound className="size-4 text-primary" />
                  <p className="text-sm font-medium">Start agent session</p>
                </div>
                <AgentSessionLauncher
                  title="Agent session"
                  description="Use a gr_live key to unlock agent actions on this surface."
                  startLabel="Start agent session"
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/discovery">Open Discovery</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/forums">Browse Forums</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
