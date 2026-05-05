import type { NimModelConfig, NimModelCompat } from "../models/types";

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

  {
    name: "deepseek-v3",
    pattern: /^deepseek-ai\/deepseek-(v3|r1)/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
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
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: { off: null }, // qwen3-next-*-thinking always thinks
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
  },

  // MiniMax M2 always thinks inline via <antha> tags — no toggle.
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
    name: "kimi-k2.5",
    pattern: /^moonshotai\/kimi-k2\.5/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
    },
  },

  {
    name: "kimi-k2.6",
    pattern: /^moonshotai\/kimi-k2\.6/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
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

  // Step 3.5 Flash always thinks on NIM — no toggle, no API params.
  {
    name: "stepfun",
    pattern: /^stepfun-ai\//,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
    thinkingLevelMap: { off: null }, // Cannot disable thinking
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

  // Nemotron Ultra/Super use system-message-based thinking (detailed thinking on/off).
  {
    name: "nemotron-super-detailed",
    pattern: /^nvidia\/llama-3\.3-nemotron-super-49b-v1$/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // Nemotron Super v1.5 and Nemotron Nano 9B v2 use system message /think or /no_think.
  {
    name: "nemotron-system-think",
    pattern: /^nvidia\/llama-3\.3-nemotron-super-49b-v1\.5$|^nvidia\/nvidia-nemotron-nano-9b-v2/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // Nemotron 3 Super 120B uses enable_thinking + low_effort flag + reasoning_budget.
  {
    name: "nemotron-3-super-effort",
    pattern: /^nvidia\/nemotron-3-super-120b-a12b/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
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
    name: "mixtral",
    pattern: /^mistralai\/mixtral/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
      requiresToolResultName: true,
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
      maxTokensField: "max_tokens",
    },
  },
];

// First matching family wins.
export function findFamily(modelId: string): ModelFamily | undefined {
  return MODEL_FAMILIES.find((f) => f.pattern.test(modelId));
}

// Resolve the internal handler format for a model.
export function classifyThinkingFormat(
  modelId: string,
  compat: NimModelCompat | undefined
): string {
  const tf = compat?.thinkingFormat;
  if (tf === "qwen-chat-template") return "qwen-chat-template";
  if (tf === "deepseek") {
    if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
    return "deepseek-nim";
  }

  // New format dispatch — checked by model ID before falling back to compat.
  if (/^bytedance\/seed-oss/.test(modelId)) return "thinking-budget";
  if (/^nvidia\/nemotron-3-super-120b-a12b/.test(modelId)) return "nemotron-3-super-effort";
  if (/^nvidia\/llama-3\.3-nemotron-super-49b-v1$/.test(modelId)) return "nemotron-system-detailed";
  if (/^nvidia\/llama-3\.3-nemotron-super-49b-v1\.5/.test(modelId)) return "nemotron-system-think";
  if (/^nvidia\/nvidia-nemotron-nano-9b-v2/.test(modelId)) return "nemotron-system-think";

  // Deepseek-nim dispatch — models that use chat_template_kwargs.thinking
  if (/^moonshotai\/kimi-k2\.6/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.5/.test(modelId)) return "deepseek-nim";
  if (/^nvidia\/llama-3\.1-nemotron-ultra/.test(modelId)) return "deepseek-nim";

  // Minimax dispatch
  if (/^minimaxai\/minimax-m2/.test(modelId)) {
    // m2.5 and m2.7 always think with inline tags — handled by requiresThinkingAsText in family
    return "none";
  }

  return "none";
}

// Merge family compat into each model.
export function applyFamilyCompat(
  models: NimModelConfig[]
): NimModelConfig[] {
  return models.map((model) => {
    const family = findFamily(model.id);
    const { ...providerModel } = model;
    if (family) {
      providerModel.compat = { ...family.compat, ...model.compat };
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
