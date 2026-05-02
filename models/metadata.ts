/**
 * Metadata loader — merges scraped metadata.json into model configs.
 * 
 * The metadata.json contains:
 * - id, contextWindow, maxOutputTokens
 * - supportsVision, supportsReasoning
 * - reasoningBudget (for Nemotron-style reasoning caps)
 * - reasoningEffortValues / reasoningEffortDefault (for reasoning-effort models)
 * - thinkingFormat (from the scraper)
 */
import type { NimModelConfig } from "./types";

interface MetadataEntry {
  id: string;
  owned_by: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  reasoningBudget?: number;
  reasoningEffortValues?: string[];
  reasoningEffortDefault?: string;
  thinkingFormat?: string;
  discovered_at: string;
  card_fetched?: boolean;
}

// Load metadata at build time
import metadataJson from "./metadata.json";

const METADATA_MAP: Map<string, MetadataEntry> = new Map(
  metadataJson.map((m: MetadataEntry) => [m.id, m])
);

/**
 * Map metadata's thinkingFormat to pi's compat.thinkingFormat.
 * 
 * IMPORTANT: We preserve the metadata format here because classifyThinkingFormat()
 * in model-families.ts uses compat.thinkingFormat to determine the handler.
 * 
 * Metadata format → compat.thinkingFormat:
 * - "qwen-chat-template" → "qwen-chat-template" (native in pi)
 * - "deepseek-v4" → "deepseek" (pi sends thinking+effort, we convert in before_provider_request)
 * - "deepseek-nim" → "deepseek" (same as above)
 * - "stepfun-parallel" → "stepfun-parallel" (family pattern + before_provider_request)
 * - "minimax-inline" → "minimax-inline" (family pattern + requiresThinkingAsText)
 * - "reasoning-effort" → "reasoning-effort" (family pattern)
 * - "none" or undefined → undefined (no thinking)
 */
export function mapThinkingFormatToCompat(
  thinkingFormat: string | undefined
): { thinkingFormat?: string; requiresThinkingAsText?: boolean; supportsReasoningEffort?: boolean } {
  switch (thinkingFormat) {
    case "qwen-chat-template":
      return { thinkingFormat: "qwen-chat-template" };

    case "deepseek-v4":
    case "deepseek-nim":
      // Pi's "deepseek" format sends thinking + reasoning_effort
      // before_provider_request converts to NIM's chat_template_kwargs
      return { thinkingFormat: "deepseek" };

    case "stepfun-parallel":
      // StepFun: set thinkingFormat so classifyThinkingFormat can identify it
      return { thinkingFormat: "stepfun-parallel" };

    case "minimax-inline":
      // MiniMax always thinks inline - set both flags
      return { thinkingFormat: "minimax-inline", requiresThinkingAsText: true };

    case "reasoning-effort":
      // Standard reasoning_effort with mapping
      return { thinkingFormat: "reasoning-effort", supportsReasoningEffort: true };

    case "none":
    case undefined:
    default:
      return {};
  }
}

const REASONING_EFFORT_ORDER = ["none", "low", "medium", "high", "max"] as const;

function reasoningEffortRank(value: string): number | undefined {
  const idx = REASONING_EFFORT_ORDER.indexOf(value as (typeof REASONING_EFFORT_ORDER)[number]);
  return idx === -1 ? undefined : idx;
}

/**
 * Build a pi thinkingLevelMap from allowed reasoning_effort values.
 * Chooses the nearest supported provider value at or above the requested pi level.
 */
export function buildReasoningEffortThinkingLevelMap(
  values?: string[]
): NimModelConfig["thinkingLevelMap"] | undefined {
  if (!values?.length) return undefined;

  const uniqueValues = Array.from(
    new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))
  );
  const supported = uniqueValues
    .filter((v): v is (typeof REASONING_EFFORT_ORDER)[number] =>
      reasoningEffortRank(v) !== undefined
    )
    .sort((a, b) => (reasoningEffortRank(a)! - reasoningEffortRank(b)!));

  if (supported.length === 0) return undefined;

  const pick = (desiredRank: number): string | null => {
    const candidate = supported.find((value) => reasoningEffortRank(value)! >= desiredRank);
    return candidate ?? supported[supported.length - 1] ?? null;
  };

  const map: Partial<Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh", string | null>> = {};
  map.off = supported.includes("none") ? "none" : null;
  map.minimal = pick(1);
  map.low = pick(1);
  map.medium = pick(2);
  map.high = pick(3);
  map.xhigh = pick(4);
  return map;
}

/**
 * Merge metadata into a model config.
 * Metadata values override static values (but static values are fallback).
 * 
 * Priority: model config → metadata (metadata wins if present)
 */
export function applyMetadata(
  model: NimModelConfig,
  metadata: MetadataEntry | undefined
): NimModelConfig {
  if (!metadata) return model;

  const thinkingCompat = mapThinkingFormatToCompat(metadata.thinkingFormat);
  const reasoningThinkingMap =
    metadata.thinkingFormat === "reasoning-effort"
      ? buildReasoningEffortThinkingLevelMap(metadata.reasoningEffortValues)
      : undefined;

  // Determine input modalities from metadata
  const input: ("text" | "image")[] = ["text"];
  if (metadata.supportsVision) {
    input.push("image");
  }

  // Merge compat flags: family compat → thinking mapping → model-level
  const compat = {
    ...(model.compat ?? {}),
    ...thinkingCompat,
    // Preserve any model-level overrides
  };

  return {
    ...model,
    // Use metadata values if available, otherwise keep model value
    contextWindow: metadata.contextWindow ?? model.contextWindow,
    maxTokens: metadata.maxOutputTokens ?? model.maxTokens,
    reasoningBudget: metadata.reasoningBudget ?? model.reasoningBudget,
    reasoning: metadata.supportsReasoning ?? model.reasoning,
    thinkingLevelMap: reasoningThinkingMap ?? model.thinkingLevelMap,
    input,
    compat,
  };
}

/**
 * Apply metadata to all models in the registry.
 */
export function applyMetadataToModels(
  models: NimModelConfig[]
): NimModelConfig[] {
  return models.map((model) => {
    const metadata = METADATA_MAP.get(model.id);
    return applyMetadata(model, metadata);
  });
}

/**
 * Get metadata for a specific model (for debugging/logging).
 */
export function getModelMetadata(modelId: string): MetadataEntry | undefined {
  return METADATA_MAP.get(modelId);
}

/**
 * Get all metadata entries (for summary/debugging).
 */
export function getAllMetadata(): MetadataEntry[] {
  return Array.from(METADATA_MAP.values());
}

/**
 * Check if metadata is available for a model.
 */
export function hasMetadata(modelId: string): boolean {
  return METADATA_MAP.has(modelId);
}