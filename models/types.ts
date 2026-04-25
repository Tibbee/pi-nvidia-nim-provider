/**
 * NVIDIA NIM Model type for internal use.
 *
 * Extends the provider-facing ProviderModelConfig with fields
 * used only during model registration and event handling.
 * These internal fields are stripped before passing to pi.registerProvider().
 */
export interface NimModelConfig {
  /** Model ID as used by the NVIDIA NIM API (e.g., "deepseek-ai/deepseek-v4-flash"). */
  id: string;
  /** Display name shown in pi's model picker. */
  name: string;
  /** API type override (optional — inherits from provider). */
  api?: string;
  /** Whether the model supports extended thinking/reasoning. */
  reasoning: boolean;
  /** Supported input modalities. */
  input: ("text" | "image")[];
  /** Cost per million tokens. All zero for NVIDIA NIM free tier. */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  /** Maximum context window in tokens. */
  contextWindow: number;
  /** Maximum output tokens. */
  maxTokens: number;
  /** Custom headers for this specific model (optional). */
  headers?: Record<string, string>;
  /** OpenAI compatibility settings. */
  compat?: Record<string, unknown>;
}

/**
 * Thinking format classification for NVIDIA NIM models.
 *
 * NVIDIA NIM models use different `chat_template_kwargs` structures
 * for controlling reasoning/thinking. These are NOT the same as pi's
 * built-in thinkingFormat values — they describe which custom handler
 * logic to apply in before_provider_request.
 *
 * - "qwen-chat-template" — pi handles natively via thinkingFormat, no custom handler needed
 * - "deepseek-v4" — chat_template_kwargs: { reasoning_effort: "none"|"high"|"max" }
 * - "deepseek-nim" — chat_template_kwargs: { thinking: true|false }
 * - "stepfun-parallel" — chat_template_kwargs: { parallel_reasoning_mode: "none"|"low"|"medium"|"heavy" }
 * - "minimax-inline" — always thinks inline with antha tags, no kwargs control
 * - "reasoning-effort" — standard OpenAI reasoning_effort (with optional mapping)
 * - "none" — no thinking/reasoning support
 */
export type NimThinkingFormat =
  | "qwen-chat-template"
  | "deepseek-v4"
  | "deepseek-nim"
  | "stepfun-parallel"
  | "minimax-inline"
  | "reasoning-effort"
  | "none";
