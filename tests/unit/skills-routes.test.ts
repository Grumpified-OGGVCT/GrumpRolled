import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateAgentMock = vi.fn();

const dbMock = {
  skill: {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  skillInstall: {
    create: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('@/lib/auth', () => ({
  authenticateAgentRequest: authenticateAgentMock,
}));

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

const now = new Date('2026-05-15T00:00:00.000Z');
const TEST_BASE_URL = 'https://example.test';

function request(url: string, init?: { body?: unknown; authorization?: string }) {
  return {
    url,
    headers: {
      get: (key: string) => (key.toLowerCase() === 'authorization' ? init?.authorization || null : null),
    },
    json: async () => init?.body,
  } as never;
}

describe('/api/v1/skills routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    authenticateAgentMock.mockResolvedValue({ id: 'agent-1', username: 'tester' });
    dbMock.$transaction.mockResolvedValue([]);
  });

  it('creates a skill and returns both id and slug', async () => {
    dbMock.skill.findUnique.mockResolvedValue(null);
    dbMock.skill.create.mockResolvedValue({
      id: 'skill-1',
      name: 'Runtime Skill Helper',
      slug: 'runtime-skill-helper-abc123',
      description: 'A skill description long enough to pass route validation.',
      category: 'AUTOMATION',
      version: '1.0.0',
      createdAt: now,
      author: { username: 'tester', displayName: 'Tester' },
    });

    const { POST } = await import('../../src/app/api/v1/skills/route');
    const response = await POST(
      request(`${TEST_BASE_URL}/api/v1/skills`, {
        authorization: 'Bearer ok',
        body: {
          name: 'Runtime Skill Helper',
          description: 'A skill description long enough to pass route validation.',
          category: 'AUTOMATION',
          install_type: 'PROMPT_TEMPLATE',
          install_data: { prompt: 'Help safely.' },
        },
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe('skill-1');
    expect(body.slug).toBe('runtime-skill-helper-abc123');
    expect(dbMock.skill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: 'agent-1',
          installType: 'PROMPT_TEMPLATE',
        }),
      }),
    );
  });

  it('lists skills using q alias and includes authenticated viewer install state', async () => {
    dbMock.skill.findMany.mockResolvedValue([
      {
        id: 'skill-1',
        name: 'Runtime Skill Helper',
        slug: 'runtime-skill-helper-abc123',
        description: 'A skill description long enough to pass route validation.',
        category: 'AUTOMATION',
        version: '1.0.0',
        installCount: 3,
        upvotes: 7,
        isVerified: true,
        author: { username: 'author', displayName: 'Author', repScore: 42 },
        installs: [{ id: 'install-1' }],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    dbMock.skill.count.mockResolvedValue(1);

    const { GET } = await import('../../src/app/api/v1/skills/route');
    const response = await GET(request(`${TEST_BASE_URL}/api/v1/skills?q=runtime&limit=10`, { authorization: 'Bearer ok' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(dbMock.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: 'runtime', mode: 'insensitive' } },
            { description: { contains: 'runtime', mode: 'insensitive' } },
          ]),
        }),
        include: expect.objectContaining({
          installs: { where: { agentId: 'agent-1' }, select: { id: true } },
        }),
      }),
    );
    expect(body.skills[0].installed_by_viewer).toBe(true);
  });

  it('defaults installed_by_viewer to false when unauthenticated', async () => {
    authenticateAgentMock.mockResolvedValue(null);
    dbMock.skill.findMany.mockResolvedValue([
      {
        id: 'skill-1',
        name: 'Runtime Skill Helper',
        slug: 'runtime-skill-helper-abc123',
        description: 'A skill description long enough to pass route validation.',
        category: 'AUTOMATION',
        version: '1.0.0',
        installCount: 3,
        upvotes: 7,
        isVerified: true,
        author: { username: 'author', displayName: 'Author', repScore: 42 },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    dbMock.skill.count.mockResolvedValue(1);

    const { GET } = await import('../../src/app/api/v1/skills/route');
    const response = await GET(request(`${TEST_BASE_URL}/api/v1/skills?search=runtime`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skills[0].installed_by_viewer).toBe(false);
  });

  it('installs skills by canonical slug', async () => {
    dbMock.skill.findFirst.mockResolvedValue({ id: 'skill-1', name: 'Runtime Skill Helper', slug: 'runtime-skill-helper-abc123' });
    dbMock.skillInstall.findUnique.mockResolvedValue(null);
    dbMock.skillInstall.create.mockResolvedValue({ id: 'install-1' });
    dbMock.skill.update.mockResolvedValue({ id: 'skill-1' });

    const { POST } = await import('../../src/app/api/v1/skills/[slug]/install/route');
    const response = await POST(request(`${TEST_BASE_URL}/api/v1/skills/runtime-skill-helper-abc123/install`, { authorization: 'Bearer ok' }), {
      params: Promise.resolve({ slug: 'runtime-skill-helper-abc123' }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ installed: true, skill: 'runtime-skill-helper-abc123' });
    expect(dbMock.skill.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ slug: 'runtime-skill-helper-abc123' }, { id: 'runtime-skill-helper-abc123' }] },
      select: { id: true, name: true, slug: true },
    });
  });

  it('keeps id install compatibility for older runtime callers', async () => {
    dbMock.skill.findFirst.mockResolvedValue({ id: 'skill-1', name: 'Runtime Skill Helper', slug: 'runtime-skill-helper-abc123' });
    dbMock.skillInstall.findUnique.mockResolvedValue(null);
    dbMock.skillInstall.create.mockResolvedValue({ id: 'install-1' });
    dbMock.skill.update.mockResolvedValue({ id: 'skill-1' });

    const { POST } = await import('../../src/app/api/v1/skills/[slug]/install/route');
    const response = await POST(request(`${TEST_BASE_URL}/api/v1/skills/skill-1/install`, { authorization: 'Bearer ok' }), {
      params: Promise.resolve({ slug: 'skill-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.skill).toBe('runtime-skill-helper-abc123');
  });
});
