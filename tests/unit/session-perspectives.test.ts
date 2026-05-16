import { describe, expect, it } from 'vitest';

import {
  createAdminSessionPayload,
  createAgentSessionPayload,
  getHumanPerspective,
  getPerspectiveForAdminSession,
  getPerspectiveForAgentSession,
  getSessionMaxAgeSeconds,
} from '@/lib/session';

describe('session perspectives', () => {
  it('keeps owner sessions distinct from delegated admin sessions', () => {
    const owner = createAdminSessionPayload('owner', 'Master account');
    const admin = createAdminSessionPayload('admin', 'Queue reviewer');

    expect(owner.kind).toBe('admin');
    expect(owner.adminRole).toBe('owner');
    expect(getPerspectiveForAdminSession(owner)).toMatchObject({
      role: 'owner',
      label: 'Master account',
      homeHref: '/mission-control',
      actionHref: '/admin',
    });

    expect(admin.kind).toBe('admin');
    expect(admin.adminRole).toBe('admin');
    expect(getPerspectiveForAdminSession(admin)).toMatchObject({
      role: 'admin',
      label: 'Admin account',
      homeHref: '/mission-control',
      actionHref: '/admin',
    });
  });

  it('keeps agent and human perspectives separate from operator sessions', () => {
    const agent = createAgentSessionPayload({
      id: 'agent-1',
      username: 'grump-agent',
      displayName: 'Grump Agent',
    });

    expect(agent.kind).toBe('agent');
    expect(getPerspectiveForAgentSession(agent)).toMatchObject({
      role: 'agent',
      label: 'Agent account',
      summary: 'Grump Agent',
      homeHref: '/me',
      actionHref: '/questions',
    });

    expect(getHumanPerspective()).toMatchObject({
      role: 'human',
      label: 'Human observer',
      homeHref: '/discovery',
      actionHref: '/forums',
    });
  });

  it('uses a long-lived session window for stay-logged-in behavior', () => {
    expect(getSessionMaxAgeSeconds()).toBeGreaterThanOrEqual(24 * 60 * 60);
  });
});
