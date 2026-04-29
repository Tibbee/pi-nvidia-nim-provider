/**
 * Model Registry — combines all model categories, applies family compat,
 * and merges in metadata from scraped metadata.json.
 */
import type { NimModelConfig } from "./types";
import { CHAT_MODELS } from "./chat-models";
import { CODING_MODELS } from "./coding-models";
import { REASONING_MODELS } from "./reasoning-models";
import { VISION_MODELS } from "./vision-models";
import { applyFamilyCompat, classifyThinkingFormat } from "../config/model-families";
import { applyMetadataToModels, hasMetadata } from "./metadata";

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
const MODELS_WITH_FAMILY_COMPAT = applyFamilyCompat(deduplicate(ALL_MODELS));

/**
 * Final model list with metadata merged in.
 * Metadata values override static values where present.
 */
export const STATIC_MODELS = applyMetadataToModels(MODELS_WITH_FAMILY_COMPAT);

/**
 * Get the thinking format classification for a model.
 * Used by before_provider_request to determine which handler logic to apply.
 * 
 * Note: classifyThinkingFormat now uses metadata.thinkingFormat when available,
 * falling back to family-based classification.
 */
export { classifyThinkingFormat, hasMetadata };

function deduplicate(models: NimModelConfig[]): NimModelConfig[] {
  const seen = new Set<string>();
  return models.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}
