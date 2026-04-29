/**
 * Model Registry — loads models directly from metadata.json
 * and applies family compat for thinking format handling.
 */
import type { NimModelConfig } from "./types";
import metadataJson from "./metadata.json";
import { applyFamilyCompat, classifyThinkingFormat } from "../config/model-families";
import { mapThinkingFormatToCompat } from "./metadata";

interface MetadataEntry {
  id: string;
  owned_by: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  thinkingFormat?: string;
  discovered_at: string;
  card_fetched?: boolean;
}

/**
 * Convert a metadata entry to NimModelConfig.
 * Uses metadata values and applies thinking format mapping.
 */
function metadataToModelConfig(entry: MetadataEntry): NimModelConfig {
  const thinkingCompat = mapThinkingFormatToCompat(entry.thinkingFormat);
  
  const input: ("text" | "image")[] = ["text"];
  if (entry.supportsVision) {
    input.push("image");
  }

  return {
    id: entry.id,
    name: makeDisplayName(entry.id),
    reasoning: entry.supportsReasoning ?? false,
    input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: entry.contextWindow ?? 131072,
    maxTokens: entry.maxOutputTokens ?? 4096,
    compat: {
      ...thinkingCompat,
    },
  };
}

/**
 * Create a display name from model ID.
 * "deepseek-ai/deepseek-v4-flash" → "DeepSeek V4 Flash"
 */
function makeDisplayName(id: string): string {
  const name = id.split('/').pop() || id;
  return name
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Filter to only LLM models (exclude embeddings, ASR, TTS, etc.)
 */
function isLLMModel(entry: MetadataEntry): boolean {
  const id = entry.id.toLowerCase();
  return !/embed|rerank|asr|tts|whisper|parakeet|conformer|transcribe|voice/i.test(id) &&
         !/guard|safety|jailbreak|pii|content-safety/i.test(id) &&
         !/fuyu|kosmos|deplot|neva|nvclip/i.test(id) &&
         !/reward|arctic-embed/i.test(id) &&
         !/boltz|diffdock|genmol|molmim|esm|alphafold|rdfusion/i.test(id) &&
         !/cuopt|usdcode|usdvalidate/i.test(id) &&
         !/starcoder|codegemma|recurrentgemma/i.test(id) &&
         !/riva-translate|nemotron-parse|nemoretriever/i.test(id) &&
         !/synthetic-video|cosmos-reason|lip-sync|eyecontact/i.test(id) &&
         !/ising|fourcastnet|vista-3d/i.test(id) &&
         !/gliner-pii|embed-qa/i.test(id) &&
         !/nvidia\/llama3-chatqa|granite-.*-code/i.test(id);
}

// Load and convert all models from metadata.json
const entries = metadataJson as MetadataEntry[];
const llmEntries = entries.filter(isLLMModel);

// Deduplicate by model ID (first occurrence wins)
const seen = new Set<string>();
const uniqueEntries: MetadataEntry[] = [];
for (const entry of llmEntries) {
  if (!seen.has(entry.id)) {
    seen.add(entry.id);
    uniqueEntries.push(entry);
  }
}

const MODELS_FROM_METADATA: NimModelConfig[] = uniqueEntries.map(entry => 
  metadataToModelConfig(entry)
);

// Apply family compat (adds any missing compat flags, thinking format override)
export const STATIC_MODELS = applyFamilyCompat(MODELS_FROM_METADATA);

// Re-export classifyThinkingFormat for use in index.ts
export { classifyThinkingFormat };

// Helper to check if a model has metadata
const metadataMap = new Map(
  entries.map(e => [e.id, e])
);
export function hasMetadata(modelId: string): boolean {
  return metadataMap.has(modelId);
}