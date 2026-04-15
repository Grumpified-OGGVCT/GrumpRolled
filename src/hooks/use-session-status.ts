'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { ToastAction } from '@/components/ui/toast';
import { toast as showToast } from '@/hooks/use-toast';

export type AgentSessionPayload = {
  agent_id: string;
  username: string;
  display_name: string | null;
  rep_score?: number;
};

export type SessionStatusPayload = {
  role: 'owner' | 'agent' | 'observer';
  admin: { active: boolean } | null;
  agent: AgentSessionPayload | null;
};

export const defaultSessionStatus: SessionStatusPayload = {
  role: 'observer',
  admin: null,
  agent: null,
};

export function notifySessionChanged() {
  window.dispatchEvent(new Event('gr-session-changed'));
}

export function requestSessionLauncherOpen() {
  window.dispatchEvent(new Event('gr-open-session-launcher'));
}

export function getActionErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallbackMessage;
}

export function isSessionUnauthorizedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /(^401\b|unauthorized|forbidden)/i.test(error.message);
}

type SessionToastOptions = {
  description?: string;
  contextLabel?: string;
};

export function showSessionInactiveToast({
  description = 'Your session is no longer active. Start a new session to continue.',
  contextLabel,
}: SessionToastOptions = {}) {
  showToast({
    title: contextLabel ? `${contextLabel} session inactive` : 'Session inactive',
    description,
    action: React.createElement(
      ToastAction,
      {
        altText: 'Start session',
        onClick: () => requestSessionLauncherOpen(),
      },
      'Start session'
    ),
  });
}

type SessionActionErrorOptions = {
  description: string;
  contextLabel?: string;
  onExpired?: () => void;
};

export function handleSessionActionError(error: unknown, options: SessionActionErrorOptions) {
  if (!isSessionUnauthorizedError(error)) {
    return false;
  }

  options.onExpired?.();
  notifySessionChanged();
  showSessionInactiveToast({
    description: options.description,
    contextLabel: options.contextLabel,
  });
  return true;
}

export function useSessionStatus() {
  const [session, setSession] = useState<SessionStatusPayload>(defaultSessionStatus);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/session', { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as Partial<SessionStatusPayload> & { role?: string };

      if (!response.ok) {
        setSession(defaultSessionStatus);
        return defaultSessionStatus;
      }

      const nextSession: SessionStatusPayload = {
        role: data.role === 'owner' || data.role === 'agent' ? data.role : 'observer',
        admin: data.admin || null,
        agent: data.agent || null,
      };
      setSession(nextSession);
      return nextSession;
    } catch {
      setSession(defaultSessionStatus);
      return defaultSessionStatus;
    }
  }, []);

  useEffect(() => {
    const handleChange = () => {
      void refreshSession();
    };

    const timeoutId = window.setTimeout(() => {
      void refreshSession();
    }, 0);
    window.addEventListener('gr-session-changed', handleChange);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('gr-session-changed', handleChange);
    };
  }, [refreshSession]);

  const clearSession = useCallback(async (kind: 'owner' | 'agent') => {
    await fetch(kind === 'owner' ? '/api/v1/session/admin' : '/api/v1/session/agent', {
      method: 'DELETE',
    });
    setSession(defaultSessionStatus);
    notifySessionChanged();
  }, []);

  const reportExpiredSession = useCallback(
    (description = 'Your session is no longer active. Start a new session to continue.', contextLabel?: string) => {
      setSession(defaultSessionStatus);
      notifySessionChanged();
      showSessionInactiveToast({ description, contextLabel });
    },
    []
  );

  return {
    session,
    refreshSession,
    clearSession,
    reportExpiredSession,
  };
}