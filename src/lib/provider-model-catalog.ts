export type ServiceHostId = 'siliconflow' | 'deepseek-direct' | 'mistral-direct' | 'groq-openai' | 'openrouter' | 'ollama-cloud';

export type ProviderFamilyId = 'deepseek' | 'mistral' | 'groq' | 'openrouter' | 'ollama' | 'qwen' | 'meta-llama' | 'gemma';

export type ModelCatalogStatus = 'active' | 'inactive' | 'unsupported' | 'approval-required';
export type FreeTierStatusSource = 'authoritative' | 'promotional' | 'heuristic' | 'unknown';

export interface ServiceHostCatalogEntry {
  id: ServiceHostId;
  label: string;
  providerFamilyIds: ProviderFamilyId[];
  chatApiStyle: 'openai-compatible' | 'ollama-native' | 'mixed';
  modelDiscoveryStyle: 'openai-models' | 'ollama-tags-show' | 'mixed' | 'unknown';
  notes?: string;
}

export interface ModelFamilyCatalogEntry {
  id: ProviderFamilyId;
  label: string;
  hostedBy: ServiceHostId[];
  freeTierStatusSource: FreeTierStatusSource;
  routedStatus: ModelCatalogStatus;
  notes?: string;
}

export interface ServiceHostedModelEntry {
  serviceHostId: ServiceHostId;
  providerFamilyId: ProviderFamilyId;
  modelId: string;
  label: string;
  routedStatus: ModelCatalogStatus;
  freeTierEligible: boolean | null;
  freeTierStatusSource: FreeTierStatusSource;
  notes?: string;
}

export const SERVICE_HOST_CATALOG: Record<ServiceHostId, ServiceHostCatalogEntry> = {
  siliconflow: {
    id: 'siliconflow',
    label: 'SiliconFlow',
    providerFamilyIds: ['deepseek', 'qwen', 'meta-llama'],
    chatApiStyle: 'openai-compatible',
    modelDiscoveryStyle: 'openai-models',
    notes: 'Service host distinct from model/provider family identity.',
  },
  'deepseek-direct': {
    id: 'deepseek-direct',
    label: 'DeepSeek Direct',
    providerFamilyIds: ['deepseek'],
    chatApiStyle: 'openai-compatible',
    modelDiscoveryStyle: 'openai-models',
    notes: 'Direct DeepSeek-hosted service semantics may differ from SiliconFlow-hosted DeepSeek.',
  },
  'mistral-direct': {
    id: 'mistral-direct',
    label: 'Mistral Direct',
    providerFamilyIds: ['mistral'],
    chatApiStyle: 'openai-compatible',
    modelDiscoveryStyle: 'openai-models',
  },
  'groq-openai': {
    id: 'groq-openai',
    label: 'Groq OpenAI-Compatible API',
    providerFamilyIds: ['groq', 'meta-llama', 'qwen', 'mistral'],
    chatApiStyle: 'openai-compatible',
    modelDiscoveryStyle: 'openai-models',
    notes: 'Service host exposing multiple model families with provider-specific limits.',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    providerFamilyIds: ['openrouter', 'deepseek', 'mistral', 'meta-llama', 'qwen'],
    chatApiStyle: 'openai-compatible',
    modelDiscoveryStyle: 'openai-models',
    notes: 'Aggregator host; model family and host identity must not be conflated.',
  },
  'ollama-cloud': {
    id: 'ollama-cloud',
    label: 'Ollama Cloud',
    providerFamilyIds: ['ollama', 'gemma'],
    chatApiStyle: 'ollama-native',
    modelDiscoveryStyle: 'ollama-tags-show',
    notes: 'Ollama native /tags, /show, /chat, /web_search semantics; not OpenRouter.',
  },
};

export const MODEL_FAMILY_CATALOG: Record<ProviderFamilyId, ModelFamilyCatalogEntry> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    hostedBy: ['siliconflow', 'deepseek-direct', 'openrouter'],
    freeTierStatusSource: 'promotional',
    routedStatus: 'active',
    notes: 'Free or cheap access varies by host and promotion, not just by family.',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    hostedBy: ['mistral-direct', 'groq-openai', 'openrouter'],
    freeTierStatusSource: 'unknown',
    routedStatus: 'active',
  },
  groq: {
    id: 'groq',
    label: 'Groq Service',
    hostedBy: ['groq-openai'],
    freeTierStatusSource: 'authoritative',
    routedStatus: 'active',
    notes: 'Free access depends on Groq account and model limits, not universal free primacy.',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter Aggregator',
    hostedBy: ['openrouter'],
    freeTierStatusSource: 'heuristic',
    routedStatus: 'active',
    notes: 'Free eligibility is model-specific and should not be inferred only from provider-level status.',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    hostedBy: ['ollama-cloud'],
    freeTierStatusSource: 'unknown',
    routedStatus: 'approval-required',
    notes: 'Current repo uses Ollama as sidecar/runtime surface, not routed provider host.',
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    hostedBy: ['siliconflow', 'groq-openai', 'openrouter'],
    freeTierStatusSource: 'unknown',
    routedStatus: 'unsupported',
    notes: 'Cataloged truth only for now; explicit routed activation still requires adapter and model review.',
  },
  'meta-llama': {
    id: 'meta-llama',
    label: 'Meta Llama',
    hostedBy: ['siliconflow', 'groq-openai', 'openrouter'],
    freeTierStatusSource: 'heuristic',
    routedStatus: 'active',
  },
  gemma: {
    id: 'gemma',
    label: 'Gemma',
    hostedBy: ['ollama-cloud'],
    freeTierStatusSource: 'unknown',
    routedStatus: 'approval-required',
    notes: 'Cataloged on the Ollama sidecar/runtime surface for evaluation first; not activated as a routed provider family by default.',
  },
};

export const SERVICE_HOSTED_MODELS: ServiceHostedModelEntry[] = [
  {
    serviceHostId: 'siliconflow',
    providerFamilyId: 'deepseek',
    modelId: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    routedStatus: 'active',
    freeTierEligible: true,
    freeTierStatusSource: 'promotional',
  },
  {
    serviceHostId: 'siliconflow',
    providerFamilyId: 'deepseek',
    modelId: 'deepseek-coder-v1.5',
    label: 'DeepSeek Coder v1.5',
    routedStatus: 'active',
    freeTierEligible: true,
    freeTierStatusSource: 'promotional',
  },
  {
    serviceHostId: 'mistral-direct',
    providerFamilyId: 'mistral',
    modelId: 'mistral-large-latest',
    label: 'Mistral Large Latest',
    routedStatus: 'active',
    freeTierEligible: false,
    freeTierStatusSource: 'authoritative',
  },
  {
    serviceHostId: 'mistral-direct',
    providerFamilyId: 'mistral',
    modelId: 'mistral-medium-latest',
    label: 'Mistral Medium Latest',
    routedStatus: 'active',
    freeTierEligible: false,
    freeTierStatusSource: 'authoritative',
  },
  {
    serviceHostId: 'groq-openai',
    providerFamilyId: 'mistral',
    modelId: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B 32K',
    routedStatus: 'active',
    freeTierEligible: true,
    freeTierStatusSource: 'authoritative',
  },
  {
    serviceHostId: 'openrouter',
    providerFamilyId: 'meta-llama',
    modelId: 'meta-llama/llama-3.1-405b-instruct',
    label: 'Llama 3.1 405B Instruct',
    routedStatus: 'active',
    freeTierEligible: false,
    freeTierStatusSource: 'authoritative',
  },
  {
    serviceHostId: 'openrouter',
    providerFamilyId: 'meta-llama',
    modelId: 'meta-llama/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B Instruct',
    routedStatus: 'active',
    freeTierEligible: true,
    freeTierStatusSource: 'heuristic',
  },
  {
    serviceHostId: 'siliconflow',
    providerFamilyId: 'qwen',
    modelId: 'Qwen/QwQ-32B',
    label: 'Qwen QwQ 32B',
    routedStatus: 'unsupported',
    freeTierEligible: null,
    freeTierStatusSource: 'unknown',
    notes: 'Cataloged because model-family truth matters even before routed support exists.',
  },
  {
    serviceHostId: 'openrouter',
    providerFamilyId: 'qwen',
    modelId: 'qwen/qwen-2.5-72b-instruct',
    label: 'Qwen 2.5 72B Instruct',
    routedStatus: 'unsupported',
    freeTierEligible: null,
    freeTierStatusSource: 'unknown',
  },
  {
    serviceHostId: 'ollama-cloud',
    providerFamilyId: 'ollama',
    modelId: 'ollama-native-runtime',
    label: 'Ollama Native Runtime',
    routedStatus: 'approval-required',
    freeTierEligible: null,
    freeTierStatusSource: 'unknown',
    notes: 'Sidecar/runtime surface; not equivalent to OpenRouter host identity.',
  },
  {
    serviceHostId: 'ollama-cloud',
    providerFamilyId: 'gemma',
    modelId: 'gemma4:latest',
    label: 'Gemma 4 Latest',
    routedStatus: 'approval-required',
    freeTierEligible: null,
    freeTierStatusSource: 'unknown',
    notes: 'Cataloged Gemma 4 default variant on Ollama for evaluation before any routed activation claims.',
  },
  {
    serviceHostId: 'ollama-cloud',
    providerFamilyId: 'gemma',
    modelId: 'gemma4:e2b',
    label: 'Gemma 4 E2B',
    routedStatus: 'approval-required',
    freeTierEligible: null,
    freeTierStatusSource: 'unknown',
    notes: 'Small multimodal Gemma tier suitable only for explicit low-cost classification or triage evaluation lanes.',
  },
  {
    serviceHostId: 'ollama-cloud',
    providerFamilyId: 'gemma',
    modelId: 'gemma4:e4b',
    label: 'Gemma 4 E4B',
    routedStatus: 'approval-required',
    freeTierEligible: null,
    freeTierStatusSource: 'unknown',
    notes: 'Edge-tier Gemma candidate for bounded orchestration support tasks, not default answer generation.',
  },
  {
    serviceHostId: 'ollama-cloud',
    providerFamilyId: 'gemma',
    modelId: 'gemma4:26b',
    label: 'Gemma 4 26B',
    routedStatus: 'approval-required',
    freeTierEligible: null,
    freeTierStatusSource: 'unknown',
    notes: 'Most plausible Gemma 4 operational-intelligence candidate for GrumpRolled evaluation.',
  },
  {
    serviceHostId: 'ollama-cloud',
    providerFamilyId: 'gemma',
    modelId: 'gemma4:31b',
    label: 'Gemma 4 31B',
    routedStatus: 'approval-required',
    freeTierEligible: null,
    freeTierStatusSource: 'unknown',
    notes: 'Dense Gemma 4 workstation model for sovereign/local high-context reasoning evaluation.',
  },
];

export function getServiceHostCatalog(): ServiceHostCatalogEntry[] {
  return Object.values(SERVICE_HOST_CATALOG);
}

export function getModelFamilyCatalog(): ModelFamilyCatalogEntry[] {
  return Object.values(MODEL_FAMILY_CATALOG);
}

export function getHostedModelsForService(serviceHostId: ServiceHostId): ServiceHostedModelEntry[] {
  return SERVICE_HOSTED_MODELS.filter((entry) => entry.serviceHostId === serviceHostId);
}

export function getHostedModelsForFamily(providerFamilyId: ProviderFamilyId): ServiceHostedModelEntry[] {
  return SERVICE_HOSTED_MODELS.filter((entry) => entry.providerFamilyId === providerFamilyId);
}

export function findHostedModelEntry(serviceHostId: ServiceHostId, modelId: string): ServiceHostedModelEntry | null {
  return SERVICE_HOSTED_MODELS.find(
    (entry) => entry.serviceHostId === serviceHostId && entry.modelId.toLowerCase() === modelId.toLowerCase(),
  ) || null;
}

export function inferProviderFamilyForHostedModel(
  serviceHostId: ServiceHostId,
  modelId: string,
): ProviderFamilyId | null {
  const exact = findHostedModelEntry(serviceHostId, modelId);
  if (exact) {
    return exact.providerFamilyId;
  }

  const normalized = modelId.toLowerCase();
  const serviceHost = SERVICE_HOST_CATALOG[serviceHostId];

  if (/(^|[/:_-])qwen|qwq/i.test(normalized) && serviceHost.providerFamilyIds.includes('qwen')) {
    return 'qwen';
  }

  if (/(^|[/:_-])deepseek|reasoner|coder/i.test(normalized) && serviceHost.providerFamilyIds.includes('deepseek')) {
    return 'deepseek';
  }

  if (/(^|[/:_-])mistral|mixtral|ministral/i.test(normalized) && serviceHost.providerFamilyIds.includes('mistral')) {
    return 'mistral';
  }

  if (/(^|[/:_-])llama|meta-llama/i.test(normalized) && serviceHost.providerFamilyIds.includes('meta-llama')) {
    return 'meta-llama';
  }

  if (/(^|[/:_-])gemma/i.test(normalized) && serviceHost.providerFamilyIds.includes('gemma')) {
    return 'gemma';
  }

  return null;
}
