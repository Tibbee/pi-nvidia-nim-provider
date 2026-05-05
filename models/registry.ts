// Builds the static NIM model list from metadata + family compat.
import type { NimModelConfig, NimModelCompat } from "./types";
import metadataJson from "./metadata.json";
import { applyFamilyCompat, classifyThinkingFormat } from "../config/model-families";

interface MetadataEntry {
  id: string;
  owned_by: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  reasoningBudget?: number;
  reasoningEffortValues?: string[];
  thinkingFormat?: string;
  exampleRequestExtra?: Record<string, unknown>;
}

const REASONING_EFFORT_ORDER = ["none", "low", "medium", "high", "max"] as const;
type ReasoningEffort = (typeof REASONING_EFFORT_ORDER)[number];

function reasoningEffortRank(value: string): number | undefined {
  const idx = REASONING_EFFORT_ORDER.indexOf(value as ReasoningEffort);
  return idx === -1 ? undefined : idx;
}

// Map scraper thinking labels to pi compat flags.
export function mapThinkingFormatToCompat(
  thinkingFormat: string | undefined
): NimModelCompat {
  switch (thinkingFormat) {
    case "qwen-chat-template":
      return { thinkingFormat: "qwen-chat-template" };
    case "deepseek-v4":
    case "deepseek-nim":
      return { thinkingFormat: "deepseek" };
    case "minimax-inline":
      return { requiresThinkingAsText: true };
    case "thinking-budget":
      return {}; // Handled by before_provider_request handler
    case "nemotron-3-super-effort":
      return { supportsReasoningEffort: true }; // Pi sends reasoning_effort, handler converts to enable_thinking + low_effort
    case "nemotron-system-detailed":
      return {}; // Handled by before_provider_request handler (system message injection)
    case "nemotron-system-think":
      return {}; // Handled by before_provider_request handler (system message injection)
    case "reasoning-effort":
      return { supportsReasoningEffort: true };
    case "none":
    case undefined:
    default:
      return {};
  }
}

// Convert allowed provider effort values into pi thinking levels.
export function buildReasoningEffortThinkingLevelMap(
  values?: string[]
): NimModelConfig["thinkingLevelMap"] | undefined {
  if (!values?.length) return undefined;

  const supported = Array.from(
    new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))
  )
    .filter((value): value is ReasoningEffort => reasoningEffortRank(value) !== undefined)
    .sort((a, b) => reasoningEffortRank(a)! - reasoningEffortRank(b)!);

  if (supported.length === 0) return undefined;

  const pick = (desiredRank: number): string | null => {
    const candidate = supported.find((value) => reasoningEffortRank(value)! >= desiredRank);
    return candidate ?? supported[supported.length - 1] ?? null;
  };

  return {
    off: supported.includes("none") ? "none" : null,
    minimal: pick(1),
    low: pick(1),
    medium: pick(2),
    high: pick(3),
    xhigh: pick(4),
  };
}

// One metadata row → one provider model.
function metadataToModelConfig(entry: MetadataEntry): NimModelConfig {
  const compat = mapThinkingFormatToCompat(entry.thinkingFormat);
  const thinkingLevelMap =
    entry.thinkingFormat === "reasoning-effort"
      ? buildReasoningEffortThinkingLevelMap(entry.reasoningEffortValues)
      : undefined;

  return {
    id: entry.id,
    name: makeDisplayName(entry.id),
    reasoning: entry.supportsReasoning ?? false,
    input: entry.supportsVision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: entry.contextWindow ?? 131072,
    maxTokens: entry.maxOutputTokens ?? 4096,
    reasoningBudget: entry.reasoningBudget,
    thinkingLevelMap,
    compat,
    exampleRequestExtra: entry.exampleRequestExtra,
  };
}

function makeDisplayName(id: string): string {
  const name = id.split("/").pop() || id;
  return name
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Filter out non-chat model families.
function isLLMModel(entry: MetadataEntry): boolean {
  const id = entry.id.toLowerCase();
  return (
    !/embed|rerank|asr|tts|whisper|parakeet|conformer|transcribe|voice/i.test(id) &&
    !/^baai\/bge(?:-|$)/i.test(id) &&
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
    !/nvidia\/llama3-chatqa|granite-.*-code/i.test(id)
  );
}

const entries = metadataJson as MetadataEntry[];
const llmEntries = entries.filter(isLLMModel);

const seen = new Set<string>();
const uniqueEntries: MetadataEntry[] = [];
for (const entry of llmEntries) {
  if (seen.has(entry.id)) continue;
  seen.add(entry.id);
  uniqueEntries.push(entry);
}

const MODELS_FROM_METADATA: NimModelConfig[] = uniqueEntries.map(metadataToModelConfig);

// Load, dedupe, convert, then merge family compat.
export const STATIC_MODELS = applyFamilyCompat(MODELS_FROM_METADATA);
export const STATIC_MODEL_MAP = new Map(STATIC_MODELS.map((model) => [model.id, model]));

export { classifyThinkingFormat };

const metadataMap = new Map(entries.map((entry) => [entry.id, entry]));

export function getModelMetadata(modelId: string): MetadataEntry | undefined {
  return metadataMap.get(modelId);
}

export function getAllMetadata(): MetadataEntry[] {
  return Array.from(metadataMap.values());
}

export function hasMetadata(modelId: string): boolean {
  return metadataMap.has(modelId);
}

export function applyMetadata(
  model: NimModelConfig,
  metadata: MetadataEntry | undefined
): NimModelConfig {
  if (!metadata) return model;

  const compat = {
    ...(model.compat ?? {}),
    ...mapThinkingFormatToCompat(metadata.thinkingFormat),
  };

  const input: ("text" | "image")[] = ["text"];
  if (metadata.supportsVision) input.push("image");

  return {
    ...model,
    contextWindow: metadata.contextWindow ?? model.contextWindow,
    maxTokens: metadata.maxOutputTokens ?? model.maxTokens,
    reasoningBudget: metadata.reasoningBudget ?? model.reasoningBudget,
    reasoning: metadata.supportsReasoning ?? model.reasoning,
    thinkingLevelMap:
      metadata.thinkingFormat === "reasoning-effort"
        ? buildReasoningEffortThinkingLevelMap(metadata.reasoningEffortValues)
        : model.thinkingLevelMap,
    input,
    compat,
    exampleRequestExtra: metadata.exampleRequestExtra ?? model.exampleRequestExtra,
  };
}

export function applyMetadataToModels(models: NimModelConfig[]): NimModelConfig[] {
  return models.map((model) => applyMetadata(model, metadataMap.get(model.id)));
}
