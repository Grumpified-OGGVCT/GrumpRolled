export const DEFAULT_CLOUD_FALLBACK_MODELS = [
  'deepseek-v4-pro:cloud',
  'kimi-k2.6:cloud',
  'deepseek-v4-flash:cloud',
] as const;

export type CloudFallbackModel = typeof DEFAULT_CLOUD_FALLBACK_MODELS[number];

export function cloudModelsOnly(): boolean {
  return process.env.GRUMPROLLED_CLOUD_MODELS_ONLY !== 'false';
}

export function isCloudModel(model: string): boolean {
  return model.trim().toLowerCase().endsWith(':cloud');
}

export function assertCloudModel(model: string): void {
  if (!isCloudModel(model)) {
    throw new Error(`Blocked local Ollama model in cloud-only mode: ${model}`);
  }
}

export function getCloudFallbackModels(): string[] {
  const configured = process.env.GRUMPROLLED_CLOUD_FALLBACK_MODELS
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  const models = configured?.length ? configured : [...DEFAULT_CLOUD_FALLBACK_MODELS];

  for (const model of models) {
    assertCloudModel(model);
  }

  return models;
}

export function getPrimaryCloudFallbackModel(): string {
  return getCloudFallbackModels()[0] ?? DEFAULT_CLOUD_FALLBACK_MODELS[0];
}
