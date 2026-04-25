/**
 * Model Registry — combines all model categories, applies family compat,
 * and exports the final ProviderModelConfig array.
 */
import type { NimModelConfig } from "./types";
import { CHAT_MODELS } from "./chat-models";
import { CODING_MODELS } from "./coding-models";
import { REASONING_MODELS } from "./reasoning-models";
import { VISION_MODELS } from "./vision-models";
import { applyFamilyCompat, classifyThinkingFormat } from "../config/model-families";

/** All models combined before family compat is applied. */
const ALL_MODELS: NimModelConfig[] = [
  ...CHAT_MODELS,
  ...CODING_MODELS,
  ...REASONING_MODELS,
  ...VISION_MODELS,
];

/**
 * Static model list with family compat applied.
 * Deduplicated by model ID (first occurrence wins).
 */
export const STATIC_MODELS = applyFamilyCompat(deduplicate(ALL_MODELS));

/**
 * Get the thinking format classification for a model.
 * Used by before_provider_request to determine which handler logic to apply.
 */
export { classifyThinkingFormat };

function deduplicate(models: NimModelConfig[]): NimModelConfig[] {
  const seen = new Set<string>();
  return models.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}
