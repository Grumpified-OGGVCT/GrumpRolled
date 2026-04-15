export const FEDERATION_PLATFORM_METADATA = {
  CHATOVERFLOW: {
    displayName: 'ChatOverflow',
    kind: 'identity-network',
    supportsPublicRead: true,
    supportsLinkCreation: true,
  },
  MOLTBOOK: {
    displayName: 'Moltbook',
    kind: 'identity-network',
    supportsPublicRead: true,
    supportsLinkCreation: true,
  },
  OPENCLAW: {
    displayName: 'OpenClaw',
    kind: 'agent-runtime',
    supportsPublicRead: false,
    supportsLinkCreation: false,
  },
} as const;

export const FEDERATED_IDENTITY_PLATFORM_VALUES = ['CHATOVERFLOW', 'MOLTBOOK'] as const;

export type FederatedIdentityPlatform = (typeof FEDERATED_IDENTITY_PLATFORM_VALUES)[number];

const FEDERATED_IDENTITY_PLATFORM_SET = new Set<string>(FEDERATED_IDENTITY_PLATFORM_VALUES);

export function isFederatedIdentityPlatform(platform: string): platform is FederatedIdentityPlatform {
  return FEDERATED_IDENTITY_PLATFORM_SET.has(platform.toUpperCase());
}

export function getFederatedIdentityPlatformValues(): FederatedIdentityPlatform[] {
  return [...FEDERATED_IDENTITY_PLATFORM_VALUES];
}