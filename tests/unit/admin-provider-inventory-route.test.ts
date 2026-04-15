import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequestMock = vi.fn();
const reconcileProviderInventoryMock = vi.fn();

vi.mock('@/lib/admin', () => ({
  isAdminRequest: isAdminRequestMock,
}));

vi.mock('@/lib/provider-inventory-reconciliation', () => ({
  reconcileProviderInventory: reconcileProviderInventoryMock,
}));

describe('/api/v1/admin/provider-inventory route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects non-admin requests', async () => {
    isAdminRequestMock.mockReturnValue(false);

    const { GET } = await import('../../src/app/api/v1/admin/provider-inventory/route');
    const response = await GET({ headers: new Headers() } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(reconcileProviderInventoryMock).not.toHaveBeenCalled();
  });

  it('returns the safe provider inventory snapshot for admin requests', async () => {
    isAdminRequestMock.mockReturnValue(true);
    reconcileProviderInventoryMock.mockReturnValue({
      reconciled_at: '2026-04-01T00:00:00.000Z',
      routed_inventory: [
        {
          provider_id: 'deepseek',
          provider_name: 'DeepSeek',
          adapter_status: 'supported-active',
          configured: true,
          configured_account_count: 1,
          uses_fallback_config_account: false,
          configured_env_names: ['SILICONFLOW_API_KEY'],
          candidate_env_names: ['SILICONFLOW_API_KEY'],
          static_model_count: 2,
          discovered_model_count: 0,
          base_url: 'https://api.siliconflow.cn/v1',
          health_path: '/models',
          supports_chat_completions: true,
          supports_model_discovery: true,
          supports_multi_account: true,
          recommended: true,
          allocation_percent: 90,
          free_tier_available: true,
        },
      ],
      broader_inventory: [
        {
          inventory_key: 'deepseek',
          provider_name: 'DeepSeek',
          status: 'routed-active',
          source: 'router',
          configured: true,
          configured_account_count: 1,
          configured_env_names: ['SILICONFLOW_API_KEY'],
          candidate_env_names: ['SILICONFLOW_API_KEY'],
          routed_provider_id: 'deepseek',
          approval_required: false,
          notes: [],
        },
      ],
      approval_required: [],
      mismatch_warnings: [],
    });

    const { GET } = await import('../../src/app/api/v1/admin/provider-inventory/route');
    const response = await GET({ headers: new Headers([['x-admin-key', 'ok']]) } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scope).toBe('admin-provider-inventory');
    expect(body.snapshot.routed_inventory[0].provider_id).toBe('deepseek');
    expect(body.approval_boundary.human_approved_only).toContain('Provider activation');
    expect(reconcileProviderInventoryMock).toHaveBeenCalledTimes(1);
  });
});
