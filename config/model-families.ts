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
    thinkingLevelMap: {
      off: "none",
      minimal: "high",
      low: "high",
      medium: "high",
      high: "high",
      xhigh: "max",
    },
  },

  // Qwen/GLM use qwen-chat-template natively.
  {
    name: "qwen3-coder",
    pattern: /^qwen\/qwen3-coder/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "qwen3-next",
    pattern: /^qwen\/qwen3-next/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "qwen3.5",
    pattern: /^qwen\/qwen3\.5/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "qwen3",
    pattern: /^qwen\/qwen3-/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "qwq",
    pattern: /^qwen\/qwq/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "qwen2.5-coder",
    pattern: /^qwen\/qwen2\.5-coder/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "qwen2",
    pattern: /^qwen\/qwen2/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // GLM-5.1 also needs clear_thinking: false.
  {
    name: "glm",
    pattern: /^z-ai\/glm/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: {
      off: "none",
      minimal: "high",
      low: "high",
      medium: "high",
      high: "high",
      xhigh: "max",
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

  // MiniMax M2.x think inline via <antha> tags — no toggle, no kwargs.
  // Thinking conversion is handled by the extension's before_provider_request
  // handler (minimax-inline), not by pi's native thinkingFormat.
  {
    name: "minimax-m2",
    pattern: /^minimaxai\/minimax-m2/,
    compat: {
      supportsDeveloperRole: false,
      requiresThinkingAsText: true,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: { off: null }, // Cannot disable thinking
  },

  // Magistral always thinks — no toggle, no params.
  {
    name: "magistral",
    pattern: /^mistralai\/magistral/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: { off: null }, // Cannot disable thinking
  },

  // Inkling's hosted endpoint always returns reasoning content and ignores
  // top-level and chat-template thinking toggles. Do not send unsupported
  // thinking controls; expose it as always-on reasoning instead.
  {
    name: "inkling",
    pattern: /^thinkingmachines\/inkling$/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: { off: null },
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

  // Kimi/Nemotron deepseek-style thinking.
  // kimi-k2-thinking always thinks — no toggle, no params.
  {
    name: "kimi-k2-thinking",
    pattern: /^moonshotai\/kimi-k2-thinking/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: { off: null }, // Cannot disable thinking
  },

  {
    name: "kimi-k2.6",
    pattern: /^moonshotai\/kimi-k2\.6/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      requiresReasoningContentOnAssistantMessages: true,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "kimi",
    pattern: /^moonshotai\/kimi/,
    compat: {
      supportsDeveloperRole: false,
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

  // Seed OSS uses top-level thinking_budget.
  {
    name: "seed-oss",
    pattern: /^bytedance\/seed-oss/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "seed",
    pattern: /^bytedance\//,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // Nemotron Nano (non-v2 variants) — no structured thinking parameters.
  {
    name: "nvidia-nemotron-nano-vl",
    pattern: /^nvidia\/nvidia-nemotron-nano-vl/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // Nemotron Super v1 uses system-message-based thinking ("detailed thinking on/off").
  // supportsReasoningEffort: true causes pi to send reasoning_effort, which the
  // handler then converts into a system message.
  {
    name: "nemotron-super-detailed",
    pattern: /^nvidia\/llama-3\.3-nemotron-super-49b-v1$/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: {
      off: "none",
      minimal: "high",
      low: "high",
      medium: "high",
      high: "high",
      xhigh: "high",
    },
  },

  // Nemotron Super v1.5 and Nemotron Nano 9B v2 use system message /think or /no_think.
  // supportsReasoningEffort: true causes pi to send reasoning_effort, which the
  // handler then converts into a system message.
  {
    name: "nemotron-system-think",
    pattern: /^nvidia\/llama-3\.3-nemotron-super-49b-v1\.5$|^nvidia\/nvidia-nemotron-nano-9b-v2/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: {
      off: "none",
      minimal: "high",
      low: "high",
      medium: "high",
      high: "high",
      xhigh: "high",
    },
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

  // Nemotron Ultra (unsuffixed) — deprecated/legacy, use deepseek-style as fallback.
  {
    name: "nemotron-ultra-deprecated",
    pattern: /^nvidia\/llama-3\.1-nemotron-ultra/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
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

  // Mixtral — before generic mistral catch-all (order matters: first match wins).
  {
    name: "mixtral",
    pattern: /^mistralai\/mixtral/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
      requiresToolResultName: true,
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
    name: "phi",
    pattern: /^microsoft\/phi/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "dracarys",
    pattern: /^abacusai\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "sarvam",
    pattern: /^sarvamai\//,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "solar",
    pattern: /^upstage\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "stockmark",
    pattern: /^stockmark\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "writer",
    pattern: /^writer\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "granite",
    pattern: /^ibm\/granite/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "jamba",
    pattern: /^ai21labs\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "yi",
    pattern: /^01-ai\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "dbrx",
    pattern: /^databricks\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "zamba",
    pattern: /^zyphra\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // StepFun models use reasoning_effort directly (low/medium/high).
  // Thinking is always on — cannot be disabled.
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
  "kimi-k2.6": "deepseek-nim",
  "minimax-m2": "minimax-inline",
  "minimax-m3": "minimax-inline",
  "nemotron-super-detailed": "nemotron-system-detailed",
  "nemotron-system-think": "nemotron-system-think",
  "nemotron-3-super-effort": "nemotron-3-super-effort",
  "nemotron-3-ultra-effort": "nemotron-3-super-effort",
  "seed-oss": "thinking-budget",
  "nemotron-ultra-deprecated": "deepseek-nim",
  "glm": "qwen-chat-template",
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
