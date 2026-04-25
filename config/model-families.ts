/**
 * A model family groups related NVIDIA NIM models that share
 * the same compat flags and thinking format handling.
 */
import type { NimModelConfig } from "../models/types";

export interface ModelFamily {
  /** Unique family name. */
  name: string;
  /** Regex tested against model ID (e.g., "deepseek-ai/deepseek-v4-flash"). */
  pattern: RegExp;
  /** Compat flags applied to all models in this family. */
  compat: NonNullable<NimModelConfig["compat"]>;
}

/**
 * All supported NVIDIA NIM model families, ordered by specificity
 * (more specific patterns first to avoid partial matches).
 *
 * Key insights from real NIM API testing:
 *
 * - NVIDIA NIM does NOT use the standard OpenAI/DeepSeek thinking formats.
 *   Instead, thinking is controlled via chat_template_kwargs with different
 *   structures per model family.
 *
 * - pi's built-in thinkingFormat: "qwen-chat-template" natively injects
 *   chat_template_kwargs: { enable_thinking: true/false, preserve_thinking: true }
 *   which works for Qwen, GLM, Phi, and Magistral models on NIM.
 *
 * - pi's built-in thinkingFormat: "deepseek" sends:
 *   params.thinking = { type: "enabled"/"disabled" }
 *   params.reasoning_effort = mapped_value
 *   NIM expects these inside chat_template_kwargs instead, so
 *   before_provider_request converts them.
 *
 * - DeepSeek V4 on NIM requires BOTH chat_template_kwargs fields:
 *   { thinking: true/false, reasoning_effort: "none"|"high"|"max" }
 *   This is different from the standard DeepSeek API format.
 *
 * - DeepSeek V3/Kimi/Nemotron use chat_template_kwargs: { thinking: true/false }
 *   Also NOT covered by pi, handled via before_provider_request.
 *
 * - StepFun uses chat_template_kwargs: { parallel_reasoning_mode: "none"|"low"|"medium"|"heavy" }
 *   Custom format, handled via before_provider_request.
 *
 * - MiniMax M2 always thinks inline with <antha> tags in content.
 *   No kwargs control. requiresThinkingAsText prevents tag leakage.
 *
 * - GPT-OSS supports standard reasoning_effort with mapping (minimal->low).
 */
export const MODEL_FAMILIES: ModelFamily[] = [
  // -- DeepSeek V4 (Flash/Pro) ---------------------------------------------
  // Uses: chat_template_kwargs: { thinking: true/false, reasoning_effort: "none"|"high"|"max" }
  // BOTH fields are required on NIM (verified from official NIM Python snippet).
  // We use thinkingFormat: "deepseek" so pi sends thinking + reasoning_effort,
  // then before_provider_request converts all of it into chat_template_kwargs.
  {
    name: "deepseek-v4",
    pattern: /^deepseek-ai\/deepseek-v4/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      reasoningEffortMap: {
        minimal: "high",
        low: "high",
        medium: "high",
        high: "max",
      },
      maxTokensField: "max_tokens",
    },
  },

  // -- DeepSeek V3 / R1 ----------------------------------------------------
  // Uses: chat_template_kwargs: { thinking: true/false }
  // We use thinkingFormat: "deepseek" so pi sends thinking + reasoning_effort,
  // then before_provider_request converts them into chat_template_kwargs.thinking
  {
    name: "deepseek-v3",
    pattern: /^deepseek-ai\/deepseek-(v3|r1)/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
    },
  },

  // -- Qwen3 Coder ---------------------------------------------------------
  // Uses: chat_template_kwargs: { enable_thinking: true/false }
  // Pi's "qwen-chat-template" handles this natively.
  {
    name: "qwen3-coder",
    pattern: /^qwen\/qwen3-coder/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  // -- Qwen3 Next ----------------------------------------------------------
  {
    name: "qwen3-next",
    pattern: /^qwen\/qwen3-next/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  // -- Qwen3.5 -------------------------------------------------------------
  {
    name: "qwen3.5",
    pattern: /^qwen\/qwen3\.5/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  // -- Qwen3 base ----------------------------------------------------------
  {
    name: "qwen3",
    pattern: /^qwen\/qwen3-/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  // -- Qwen QwQ ------------------------------------------------------------
  {
    name: "qwq",
    pattern: /^qwen\/qwq/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  // -- Qwen2.5 Coder -------------------------------------------------------
  // Non-reasoning code completion model
  {
    name: "qwen2.5-coder",
    pattern: /^qwen\/qwen2\.5-coder/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Qwen2 ---------------------------------------------------------------
  {
    name: "qwen2",
    pattern: /^qwen\/qwen2/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- GLM (Zhipu AI) ------------------------------------------------------
  // Uses: chat_template_kwargs: { enable_thinking: true/false }
  // Pi's "qwen-chat-template" handles this natively.
  // Note: GLM-5.1 also needs clear_thinking: false, handled via before_provider_request.
  {
    name: "glm",
    pattern: /^z-ai\/glm/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  // -- MiniMax M2 ----------------------------------------------------------
  // Always thinks inline with <antha> tags in content field.
  // No chat_template_kwargs to control it.
  // requiresThinkingAsText prevents raw tags in conversation history.
  {
    name: "minimax-m2",
    pattern: /^minimaxai\/minimax-m2/,
    compat: {
      supportsDeveloperRole: false,
      requiresThinkingAsText: true,
      maxTokensField: "max_tokens",
    },
  },

  // -- Kimi K2 Thinking ----------------------------------------------------
  // Uses: chat_template_kwargs: { thinking: true/false }
  // Same format as DeepSeek V3 on NIM. Handled via before_provider_request.
  {
    name: "kimi-thinking",
    pattern: /^moonshotai\/kimi-k2-thinking/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
    },
  },

  // -- Kimi K2.5 -----------------------------------------------------------
  // Uses: chat_template_kwargs: { thinking: true/false }
  {
    name: "kimi-k2.5",
    pattern: /^moonshotai\/kimi-k2\.5/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
    },
  },

  // -- Kimi K2 (non-thinking) ----------------------------------------------
  {
    name: "kimi",
    pattern: /^moonshotai\/kimi/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- GPT-OSS (OpenAI open-source) ----------------------------------------
  // Supports standard reasoning_effort but NIM rejects "minimal".
  {
    name: "gpt-oss",
    pattern: /^openai\/gpt-oss/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      reasoningEffortMap: { minimal: "low" },
      maxTokensField: "max_tokens",
    },
  },

  // -- StepFun (Parallel Thinking / PaCoRe) --------------------------------
  // Uses: chat_template_kwargs: { parallel_reasoning_mode: "none"|"low"|"medium"|"heavy" }
  // Custom format, NOT covered by pi. before_provider_request remaps reasoning_effort.
  {
    name: "stepfun",
    pattern: /^stepfun-ai\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
    },
  },

  // -- ByteDance Seed ------------------------------------------------------
  {
    name: "seed",
    pattern: /^bytedance\//,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  // -- NVIDIA Nemotron thinking (Nano 9B) ----------------------------------
  // Uses: chat_template_kwargs: { enable_thinking: true/false }
  {
    name: "nvidia-nemotron-nano-thinking",
    pattern: /^nvidia\/nvidia-nemotron-nano/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
    },
  },

  // -- NVIDIA Nemotron (Ultra/Super - thinking via chat_template_kwargs) ---
  // Nemotron Ultra/Super use chat_template_kwargs: { thinking: true/false }
  {
    name: "nemotron-thinking",
    pattern: /^nvidia\/llama-3\.\d-nemotron-(ultra|super)/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
    },
  },

  // -- Meta Llama ----------------------------------------------------------
  {
    name: "llama",
    pattern: /^meta\/llama/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Mistral family ------------------------------------------------------
  // requiresToolResultName: Mistral API requires tool result messages to have a name field
  // requiresThinkingAsText: prevents mirroring of thinking blocks back to Mistral
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

  // -- NVIDIA Nemotron (non-reasoning) -------------------------------------
  {
    name: "nemotron",
    pattern: /^nvidia\/.*nemotron/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Google Gemma --------------------------------------------------------
  {
    name: "gemma",
    pattern: /^google\/gemma/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Microsoft Phi -------------------------------------------------------
  {
    name: "phi",
    pattern: /^microsoft\/phi/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Abacus AI (Dracarys) ------------------------------------------------
  {
    name: "dracarys",
    pattern: /^abacusai\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Sarvam AI -----------------------------------------------------------
  {
    name: "sarvam",
    pattern: /^sarvamai\//,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Upstage Solar -------------------------------------------------------
  {
    name: "solar",
    pattern: /^upstage\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Stockmark -----------------------------------------------------------
  {
    name: "stockmark",
    pattern: /^stockmark\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Writer (Palmyra) ----------------------------------------------------
  {
    name: "writer",
    pattern: /^writer\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- IBM Granite ---------------------------------------------------------
  {
    name: "granite",
    pattern: /^ibm\/granite/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- AI21 Jamba ----------------------------------------------------------
  {
    name: "jamba",
    pattern: /^ai21labs\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- 01.AI Yi ------------------------------------------------------------
  {
    name: "yi",
    pattern: /^01-ai\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Mixtral -------------------------------------------------------------
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

  // -- Databricks DBRX -----------------------------------------------------
  {
    name: "dbrx",
    pattern: /^databricks\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Zamba ---------------------------------------------------------------
  {
    name: "zamba",
    pattern: /^zyphra\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- NVIDIA base (chatQA, etc.) ------------------------------------------
  {
    name: "nvidia-base",
    pattern: /^nvidia\//,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },

  // -- Catch-all for unmatched LLMs ----------------------------------------
  {
    name: "default",
    pattern: /.*/,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
];

/**
 * Find the first matching model family for a given model ID.
 * Families are checked in order -- first match wins.
 */
export function findFamily(modelId: string): ModelFamily | undefined {
  return MODEL_FAMILIES.find((f) => f.pattern.test(modelId));
}

/**
 * Classify a model's thinking format based on its family.
 * Used by before_provider_request to determine handler logic.
 */
export function classifyThinkingFormat(
  modelId: string,
  compat: Record<string, unknown> | undefined
): string {
  // Check explicit thinkingFormat from compat (set by family or per-model)
  const tf = compat?.thinkingFormat as string | undefined;
  if (tf === "qwen-chat-template") return "qwen-chat-template";
  if (tf === "deepseek") {
    // Distinguish between V4 (needs thinking + reasoning_effort) and V3 (needs thinking only)
    if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
    return "deepseek-nim";
  }

  // Family-based classification for models without explicit thinkingFormat
  if (/^moonshotai\/kimi-k2-thinking/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.5/.test(modelId)) return "deepseek-nim";
  if (/^nvidia\/llama-3\.\d-nemotron-(ultra|super)/.test(modelId))
    return "deepseek-nim";
  if (/^stepfun-ai\//.test(modelId)) return "stepfun-parallel";
  if (/^minimaxai\/minimax-m2/.test(modelId)) return "minimax-inline";
  return "none";
}

/**
 * Apply family-based compat to a list of models.
 * Merges family compat with any model-level compat (model-level wins on conflict).
 * Strips internal fields from the output.
 */
export function applyFamilyCompat(
  models: NimModelConfig[]
): NimModelConfig[] {
  return models.map((model) => {
    const family = findFamily(model.id);
    const { ...providerModel } = model;
    if (family) {
      providerModel.compat = { ...family.compat, ...model.compat };
    }
    return providerModel;
  });
}
