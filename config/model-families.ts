import type { NimModelConfig, NimModelCompat, NimThinkingFormat } from "../models/types";
import { createLogger } from "../lib/logger";

export interface ModelFamily {
  name: string;
  pattern: RegExp;
  compat: NimModelCompat;
  thinkingLevelMap?: NimModelConfig["thinkingLevelMap"];
  reasoningBudget?: number;
}

// Ordered specific → general; first match wins.
export const MODEL_FAMILIES: ModelFamily[] = [
  // DeepSeek V4 needs thinking + effort in chat_template_kwargs.
  {
    name: "deepseek-v4",
    pattern: /^deepseek-ai\/deepseek-v4/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
    },
    // Hosted DeepSeek V4 exposes exactly three named modes. Explicit nulls
    // hide Pi's intermediate levels instead of silently presenting aliases.
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
  },

  // Kimi K3 exposes a single boolean thinking mode via chat_template_kwargs.
  // Hosted NIM ignores reasoning effort for it; only off/on is meaningful
  // (probe-verified 2026-08-27: on/off, separate reasoning_content, tools,
  // vision input). Unlisted on the build page but live on the API.
  {
    name: "kimi",
    pattern: /^moonshotai\/kimi-k3/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
    },
    // Upstream spec (Moonshot/Together): top-level reasoning_effort with
    // low | high | max (default max). Intermediate pi levels are hidden.
    // Boolean on/off is probe-verified on NIM (2026-08-27); effort
    // pass-through follows the upstream API and awaits wire verification
    // (tools/probe_kimi_effort.sh, scheduled 2026-08-28).
    thinkingLevelMap: {
      off: "none",
      low: "low",
      high: "high",
      max: "max",
    },
  },

  // MiniMax M3 uses chat_template_kwargs.thinking_mode (enabled/disabled).
  // It sends reasoning_content in the response — NOT inline <antha> tags.
  {
    name: "minimax-m3",
    pattern: /^minimaxai\/minimax-m3/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStore: false,
      supportsUsageInStreaming: false,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: {
      off: "disabled",
      minimal: "adaptive",
      low: "adaptive",
      medium: "adaptive",
      high: "adaptive",
      xhigh: "enabled",
    },
  },

  // Laguna XS 2.1 uses chat_template_kwargs.enable_thinking. Pi's native
  // qwen-chat-template path handles the boolean toggle and preservation flag.
  {
    name: "laguna-xs-2.1",
    pattern: /^poolside\/laguna-xs-2\.1$/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      thinkingFormat: "qwen-chat-template",
      requiresReasoningContentOnAssistantMessages: true,
      maxTokensField: "max_tokens",
    },
  },

  // GPT-OSS maps minimal → low.
  {
    name: "gpt-oss",
    pattern: /^openai\/gpt-oss/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: { minimal: "low" },
  },

  // Nemotron 3 Super 120B: none/low/high effort + low_effort flag + reasoning_budget.
  {
    name: "nemotron-3-super-effort",
    pattern: /^nvidia\/nemotron-3-super-120b-a12b/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: {
      off: "none",
      minimal: "low",
      low: "low",
      medium: "high",
      high: "high",
      xhigh: "high",
    },
  },

  // Nemotron 3 Ultra 550B: none/medium/high effort + reasoning_budget (no low_effort flag).
  {
    name: "nemotron-3-ultra-effort",
    pattern: /^nvidia\/nemotron-3-ultra-550b-a55b/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: {
      off: "none",
      minimal: "medium",
      low: "medium",
      medium: "medium",
      high: "high",
      xhigh: "high",
    },
  },

  // Nemotron 3.5 Lightning 30B: enable_thinking + reasoning_budget. NVIDIA's
  // API reference documents no reasoning_effort (probes accepted it, but the
  // handler converts pi's levels into enable_thinking + low_effort anyway).
  {
    name: "nemotron-3.5-lightning",
    pattern: /^nvidia\/nemotron-3\.5-lightning/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: {
      off: "none",
      minimal: "low",
      low: "low",
      medium: "high",
      high: "high",
      xhigh: "high",
    },
  },

  // Muse Glimmer is a multimodal reasoning model. Hosted NIM exposes
  // top-level reasoning_effort and streams reasoning_content separately.
  {
    name: "muse-glimmer",
    pattern: /^meta\/muse-glimmer/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      requiresReasoningContentOnAssistantMessages: true,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: {
      off: "none",
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "max",
      max: "max",
    },
  },

  {
    name: "llama",
    pattern: /^meta\/llama/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // Mistral needs tool result names and thinking-as-text.
  {
    name: "mistral",
    pattern: /^mistralai\//,
    compat: {
      supportsDeveloperRole: false,
      requiresToolResultName: true,
      requiresThinkingAsText: true,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "nemotron",
    pattern: /^nvidia\/.*nemotron/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
    reasoningBudget: 32768,
  },

  {
    name: "diffusiongemma",
    pattern: /^google\/diffusiongemma/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "gemma",
    pattern: /^google\/gemma/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "stepfun",
    pattern: /^stepfun-ai\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: {
      off: null, // Cannot disable thinking
      minimal: "low",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "high",
    },
  },

  {
    name: "nvidia-base",
    pattern: /^nvidia\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "default",
    pattern: /.*/,
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      supportsReasoningEffort: false,
      supportsStrictMode: false,
      supportsLongCacheRetention: false,
      maxTokensField: "max_tokens",
    },
  },
];

// First matching family wins.
export function findFamily(modelId: string): ModelFamily | undefined {
  return MODEL_FAMILIES.find((f) => f.pattern.test(modelId));
}

// Maps family name → internal handler format.
// Add new entries here whenever you add a family that needs custom
// before_provider_request transformation (e.g., new system-message-based
// thinking, new kwarg structures).
const FAMILY_HANDLER_FORMATS: Partial<Record<string, NimThinkingFormat>> = {
  "deepseek-v4": "deepseek-v4",
  "kimi": "kimi",
  "minimax-m3": "minimax-inline",
  "nemotron-3-super-effort": "nemotron-3-super-effort",
  "nemotron-3-ultra-effort": "nemotron-3-super-effort",
  "nemotron-3.5-lightning": "nemotron-3-super-effort",
};

// Init-time safety check: every family that sets thinkingFormat: "deepseek"
// MUST have a FAMILY_HANDLER_FORMATS entry, because pi's native deepseek
// format uses top-level params (`thinking` + `reasoning_effort`) that NIM
// doesn't understand without the extension's chat_template_kwargs conversion.
const FAMILIES_MISSING_HANDLER = MODEL_FAMILIES
  .filter((f) => f.compat?.thinkingFormat === "deepseek" && !FAMILY_HANDLER_FORMATS[f.name])
  .map((f) => f.name);
if (FAMILIES_MISSING_HANDLER.length > 0) {
  const log = createLogger("model-families");
  log.warn(
    "families with thinkingFormat=deepseek missing from FAMILY_HANDLER_FORMATS:",
    FAMILIES_MISSING_HANDLER.join(", ")
  );
}

// Resolve the internal handler format for a model.
export function classifyThinkingFormat(modelId: string): NimThinkingFormat {
  return FAMILY_HANDLER_FORMATS[findFamily(modelId)?.name ?? ""] ?? "none";
}

// Merge family compat into each model.
export function applyFamilyCompat(
  models: NimModelConfig[]
): NimModelConfig[] {
  return models.map((model) => {
    const family = findFamily(model.id);
    const { ...providerModel } = model;
    if (family) {
      // NIM is not an OpenAI storage provider. Apply this at the registry
      // merge point so every family gets the safe default, while preserving
      // an explicit model-level override if one is ever added.
      providerModel.compat = {
        supportsStore: false,
        ...family.compat,
        ...model.compat,
      };
      if (family.thinkingLevelMap || model.thinkingLevelMap) {
        providerModel.thinkingLevelMap = {
          ...(family.thinkingLevelMap ?? {}),
          ...(model.thinkingLevelMap ?? {}),
        };
      }
      if (family.reasoningBudget != null || model.reasoningBudget != null) {
        providerModel.reasoningBudget = model.reasoningBudget ?? family.reasoningBudget;
      }
      const familyEnablesReasoning = Boolean(
        family.compat?.thinkingFormat ||
          family.compat?.supportsReasoningEffort ||
          family.compat?.requiresThinkingAsText ||
          family.reasoningBudget != null ||
          family.thinkingLevelMap ||
          model.thinkingLevelMap
      );
      if (familyEnablesReasoning) {
        providerModel.reasoning = true;
      }
    }
    return providerModel;
  });
}
