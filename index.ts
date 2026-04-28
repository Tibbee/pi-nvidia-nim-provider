/**
 * NVIDIA NIM Provider Extension for Pi
 *
 * Registers the "nvidia-nim" provider with 50+ curated models from
 * NVIDIA's NIM platform (build.nvidia.com), using their OpenAI-compatible
 * API endpoint.
 *
 * ## Key Design Decisions
 *
 * - Uses `api: "openai-completions"` -- no custom streamSimple.
 *   This avoids the bug where custom streaming broke other providers.
 *
 * - Models use `compat.maxTokensField: "max_tokens"` universally
 *   (NVIDIA NIM uses max_tokens, not max_completion_tokens).
 *
 * - Models use `compat.supportsDeveloperRole: false` universally
 *   (NVIDIA NIM models expect "system" role, not "developer").
 *
 * - Thinking/reasoning is handled via different mechanisms per model family:
 *
 *   1. **qwen-chat-template** (Qwen3, GLM, Phi-4-Mini-Flash, Magistral, Seed,
 *      Nemotron-Nano-9B): Pi's built-in thinkingFormat handles this natively.
 *      Pi injects `chat_template_kwargs: { enable_thinking: true/false,
 *      preserve_thinking: true }`. No custom handler needed.
 *
 *   2. **deepseek-v4** (V4 Flash/Pro): Pi's thinkingFormat: "deepseek" sends
 *      `params.thinking = { type: "enabled" }` and `params.reasoning_effort`.
 *      NIM requires `chat_template_kwargs: { thinking: true/false,
 *      reasoning_effort: "none"|"high"|"max" }` instead.
 *      The before_provider_request handler converts the pi format to NIM format.
 *
 *   3. **deepseek-nim** (V3.x, R1, Kimi-K2-Thinking, K2.5, Nemotron-Ultra/Super):
 *      Pi's thinkingFormat: "deepseek" sends `params.thinking = { type: "enabled" }`
 *      and `params.reasoning_effort`. NIM expects `chat_template_kwargs:
 *      { thinking: true/false }` only (no reasoning_effort).
 *      The handler converts the pi format to NIM format.
 *
 *   4. **stepfun-parallel** (Step 3.5 Flash): Uses `chat_template_kwargs:
 *      { parallel_reasoning_mode: "none"|"low"|"medium"|"heavy" }`.
 *      The handler maps pi's reasoning_effort to parallel_reasoning_mode
 *      and removes the top-level `reasoning_effort`.
 *
 *   5. **minimax-inline** (MiniMax M2.x): Always thinks inline with
 *      `<antha>` tags. No kwargs control. `requiresThinkingAsText: true`
 *      prevents tag leakage in conversation history.
 *
 *   6. **reasoning-effort** (GPT-OSS): Uses standard OpenAI reasoning_effort
 *      with mapping (`minimal` -> `low`). Pi handles this natively.
 *
 * ## Bug Fixes from Previous Extension (nvidiaNim.ts)
 *
 * - before_provider_request handler now correctly matches `payload.model`
 *   (raw model ID like "deepseek-ai/deepseek-v4-flash", NOT "nvidia-nim/...")
 * - Removed fake `requiresMistralToolIds` compat field
 * - DeepSeek V4 handler now injects BOTH `thinking: true` AND
 *   `reasoning_effort` into chat_template_kwargs (verified from official NIM snippet)
 * - Top-level `thinking` and `reasoning_effort` are removed after conversion
 * - No debug console.log in production code
 *
 * ## Environment Variables
 *
 * - `NVIDIA_API_KEY` -- Required. Your NVIDIA NIM API key.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { STATIC_MODELS, classifyThinkingFormat } from "./models/registry";
import { NIM_BASE_URL, NIM_API_KEY_ENV } from "./config/defaults";

// -- Thinking Format Handlers -----------------------------------------------

/**
 * Map pi reasoning_effort levels to DeepSeek V4 NIM values.
 * Pi levels: minimal, low, medium, high, xhigh
 * NIM values: none, high, max
 */
function mapDeepSeekV4Effort(effort: string): string {
  const map: Record<string, string> = {
    minimal: "high",
    low: "high",
    medium: "high",
    high: "max",
    xhigh: "max",
  };
  return map[effort] ?? "high";
}

/**
 * Map pi reasoning_effort levels to StepFun parallel_reasoning_mode values.
 * Pi levels: minimal, low, medium, high, xhigh
 * NIM values: none, low, medium, heavy
 */
function mapStepfunEffort(effort: string): string {
  const map: Record<string, string> = {
    minimal: "low",
    low: "low",
    medium: "medium",
    high: "heavy",
    xhigh: "heavy",
  };
  return map[effort] ?? "medium";
}

/**
 * Check if pi's thinkingFormat: "deepseek" has enabled reasoning.
 * Pi sends `params.thinking = { type: "enabled"|"disabled" }`.
 * Returns true if thinking is enabled.
 */
function isDeepSeekThinkingEnabled(payload: Record<string, unknown>): boolean {
  const thinking = payload.thinking as { type?: string } | undefined;
  if (thinking && thinking.type === "enabled") return true;
  // Fallback: check reasoning_effort (shouldn't happen with thinkingFormat: "deepseek",
  // but handles edge cases)
  const effort = payload.reasoning_effort as string | undefined;
  return !!effort && effort !== "off" && effort !== "none";
}

/**
 * Get the reasoning_effort value from the payload.
 * With thinkingFormat: "deepseek", pi sends reasoning_effort alongside thinking.
 * Returns the effort value string, or undefined if not present.
 */
function getReasoningEffort(
  payload: Record<string, unknown>
): string | undefined {
  const effort = payload.reasoning_effort as string | undefined;
  if (effort && effort !== "off" && effort !== "none") {
    return effort;
  }
  return undefined;
}

/**
 * Process the payload for a model with a custom thinking format.
 * Converts pi's native format into NIM's chat_template_kwargs format.
 * Mutates the payload in place and returns it (or undefined if no changes).
 *
 * Key operations per format:
 *
 * deepseek-v4:
 *   pi sends:   { thinking: { type: "enabled" }, reasoning_effort: "high" }
 *   NIM needs:  { chat_template_kwargs: { thinking: true, reasoning_effort: "high" } }
 *   Must remove top-level thinking and reasoning_effort.
 *
 * deepseek-nim:
 *   pi sends:   { thinking: { type: "enabled" }, reasoning_effort: "high" }
 *   NIM needs:  { chat_template_kwargs: { thinking: true } }
 *   Must remove top-level thinking and reasoning_effort.
 *
 * stepfun-parallel:
 *   pi sends:   { reasoning_effort: "high" }
 *   NIM needs:  { chat_template_kwargs: { parallel_reasoning_mode: "heavy" } }
 *   Must remove top-level reasoning_effort.
 */
function handleCustomThinkingFormat(
  payload: Record<string, unknown>,
  modelId: string,
  format: string
): Record<string, unknown> | undefined {
  switch (format) {
    case "deepseek-v4": {
      const isThinkingOn = isDeepSeekThinkingEnabled(payload);
      const effort = getReasoningEffort(payload);

      // Remove pi's top-level fields -- NIM doesn't use them
      delete payload.thinking;
      delete payload.reasoning_effort;

      // Inject NIM's chat_template_kwargs format
      // V4 requires BOTH thinking: true/false AND reasoning_effort
      const existingKwargs =
        payload.chat_template_kwargs as Record<string, unknown> | undefined;
      payload.chat_template_kwargs = {
        ...(existingKwargs ?? {}),
        thinking: isThinkingOn,
        reasoning_effort: isThinkingOn
          ? mapDeepSeekV4Effort(effort ?? "high")
          : "none",
      };
      return payload;
    }

    case "deepseek-nim": {
      const isThinkingOn = isDeepSeekThinkingEnabled(payload);

      // Remove pi's top-level fields
      delete payload.thinking;
      delete payload.reasoning_effort;

      // Inject NIM's chat_template_kwargs: { thinking: true/false }
      const existingKwargs =
        payload.chat_template_kwargs as Record<string, unknown> | undefined;
      payload.chat_template_kwargs = {
        ...(existingKwargs ?? {}),
        thinking: isThinkingOn,
      };
      return payload;
    }

    case "stepfun-parallel": {
      const effort = getReasoningEffort(payload);
      const isThinkingOn = !!effort;

      // Remove top-level reasoning_effort
      delete payload.reasoning_effort;

      const existingKwargs =
        payload.chat_template_kwargs as Record<string, unknown> | undefined;
      if (isThinkingOn) {
        payload.chat_template_kwargs = {
          ...(existingKwargs ?? {}),
          parallel_reasoning_mode: mapStepfunEffort(effort!),
        };
      } else {
        payload.chat_template_kwargs = {
          ...(existingKwargs ?? {}),
          parallel_reasoning_mode: "none",
        };
      }
      return payload;
    }

    case "qwen-chat-template":
    case "minimax-inline":
    case "reasoning-effort":
    case "none":
      // No custom handling needed -- pi handles these natively
      return undefined;

    default:
      return undefined;
  }
}

// -- Extension Entry Point --------------------------------------------------

export default async function (pi: ExtensionAPI) {
  // Register the provider with static model list
  pi.registerProvider("nvidia-nim", {
    baseUrl: NIM_BASE_URL,
    apiKey: NIM_API_KEY_ENV,
    api: "openai-completions",
    authHeader: true,
    models: STATIC_MODELS,
  });

  // -- before_provider_request handler ------------------------------------
  //
  // Handles custom thinking formats that need conversion from pi's
  // native format to NVIDIA NIM's chat_template_kwargs format:
  //
  // - deepseek-v4: thinking + reasoning_effort -> chat_template_kwargs
  // - deepseek-nim: thinking -> chat_template_kwargs.thinking
  // - stepfun-parallel: reasoning_effort -> chat_template_kwargs.parallel_reasoning_mode
  //
  // Also handles GLM-5.1's extra `clear_thinking: false` field.
  //
  // CRITICAL: payload.model is the raw model ID (e.g., "deepseek-ai/deepseek-v4-flash"),
  // NOT "nvidia-nim/deepseek-ai/deepseek-v4-flash". The previous extension
  // had a bug where it checked for a "nvidia-nim/" prefix that never existed.
  pi.on("before_provider_request", (event) => {
    const payload = event.payload as Record<string, unknown>;
    const modelId = payload.model as string | undefined;

    if (!modelId) return;

    // Find the model in our list to get its compat
    const modelConfig = STATIC_MODELS.find((m) => m.id === modelId);
    if (!modelConfig) return; // Not a nvidia-nim model

    // Classify the thinking format for this model
    const format = classifyThinkingFormat(
      modelId,
      modelConfig.compat as Record<string, unknown> | undefined
    );

    // Handle custom thinking formats
    const result = handleCustomThinkingFormat(payload, modelId, format);
    if (result) return result;

    // -- GLM-5.1 extra: clear_thinking: false --------------------------------
    // Pi's qwen-chat-template already injects chat_template_kwargs.enable_thinking
    // and preserve_thinking. GLM-5.1 additionally needs clear_thinking: false.
    // We deep-merge it into the existing chat_template_kwargs.
    if (/^z-ai\/glm/.test(modelId)) {
      const kwargs = payload.chat_template_kwargs as
        | Record<string, unknown>
        | undefined;
      if (kwargs && kwargs.enable_thinking === true) {
        payload.chat_template_kwargs = {
          ...kwargs,
          clear_thinking: false,
        };
        return payload;
      }
    }

    // No modifications needed
    return undefined;
  });
}
