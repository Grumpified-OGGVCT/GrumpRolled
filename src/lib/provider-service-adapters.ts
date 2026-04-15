import type { ServiceHostId } from '@/lib/provider-model-catalog';

type ChatMessageLike = {
  role: string;
  content: string;
};

export interface ProviderServiceAdapter {
  serviceHostId: ServiceHostId;
  chatPath: string;
  modelDiscoveryPath: string;
  buildChatRequest: (modelId: string, messages: ChatMessageLike[]) => unknown;
  parseChatResponse: (payload: unknown) => string;
  parseModelDiscoveryResponse: (payload: unknown) => string[];
}

function extractModelIds(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          return typeof record.id === 'string'
            ? record.id
            : typeof record.model === 'string'
              ? record.model
              : typeof record.name === 'string'
                ? record.name
                : null;
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return extractModelIds(record.data);
    if (Array.isArray(record.models)) return extractModelIds(record.models);
  }

  return [];
}

function parseOpenAICompatibleContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = record.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const value = entry as Record<string, unknown>;
          return typeof value.text === 'string' ? value.text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

export const PROVIDER_SERVICE_ADAPTERS: Record<ServiceHostId, ProviderServiceAdapter> = {
  siliconflow: {
    serviceHostId: 'siliconflow',
    chatPath: '/chat/completions',
    modelDiscoveryPath: '/models',
    buildChatRequest: (modelId, messages) => ({ model: modelId, messages, stream: false }),
    parseChatResponse: parseOpenAICompatibleContent,
    parseModelDiscoveryResponse: extractModelIds,
  },
  'deepseek-direct': {
    serviceHostId: 'deepseek-direct',
    chatPath: '/chat/completions',
    modelDiscoveryPath: '/models',
    buildChatRequest: (modelId, messages) => ({ model: modelId, messages, stream: false }),
    parseChatResponse: parseOpenAICompatibleContent,
    parseModelDiscoveryResponse: extractModelIds,
  },
  'mistral-direct': {
    serviceHostId: 'mistral-direct',
    chatPath: '/chat/completions',
    modelDiscoveryPath: '/models',
    buildChatRequest: (modelId, messages) => ({ model: modelId, messages, stream: false }),
    parseChatResponse: parseOpenAICompatibleContent,
    parseModelDiscoveryResponse: extractModelIds,
  },
  'groq-openai': {
    serviceHostId: 'groq-openai',
    chatPath: '/chat/completions',
    modelDiscoveryPath: '/models',
    buildChatRequest: (modelId, messages) => ({ model: modelId, messages, stream: false }),
    parseChatResponse: parseOpenAICompatibleContent,
    parseModelDiscoveryResponse: extractModelIds,
  },
  openrouter: {
    serviceHostId: 'openrouter',
    chatPath: '/chat/completions',
    modelDiscoveryPath: '/models',
    buildChatRequest: (modelId, messages) => ({ model: modelId, messages, stream: false }),
    parseChatResponse: parseOpenAICompatibleContent,
    parseModelDiscoveryResponse: extractModelIds,
  },
  'ollama-cloud': {
    serviceHostId: 'ollama-cloud',
    chatPath: '/chat',
    modelDiscoveryPath: '/tags',
    buildChatRequest: (modelId, messages) => ({ model: modelId, messages, stream: false }),
    parseChatResponse: (payload) => {
      if (!payload || typeof payload !== 'object') return '';
      const record = payload as { message?: { content?: unknown } };
      return typeof record.message?.content === 'string' ? record.message.content.trim() : '';
    },
    parseModelDiscoveryResponse: extractModelIds,
  },
};

export function getProviderServiceAdapter(serviceHostId: ServiceHostId): ProviderServiceAdapter {
  return PROVIDER_SERVICE_ADAPTERS[serviceHostId];
}
