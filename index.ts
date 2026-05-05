// Provider entry + request hook.
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { NIM_API_KEY_ENV, NIM_BASE_URL } from "./config/defaults";
import { applyCustomThinkingFormat, hasEnabledThinking } from "./handlers/thinking";
import { STATIC_MODELS, STATIC_MODEL_MAP, classifyThinkingFormat } from "./models/registry";

interface BeforeProviderRequestEventLike {
  provider?: string;
  payload: unknown;
}

interface AfterProviderResponseEventLike {
  provider?: string;
  status: number;
  headers?: Record<string, string | undefined>;
}

export function handleBeforeProviderRequest(event: BeforeProviderRequestEventLike) {
  if (event.provider !== "nvidia-nim") return;

  const payload = event.payload as Record<string, unknown>;
  // payload.model is the raw NIM model ID.
  const modelId = payload.model as string | undefined;
  if (!modelId) return;

  const modelConfig = STATIC_MODEL_MAP.get(modelId);
  if (!modelConfig) return;

  const thinkingEnabledBeforeTransform = hasEnabledThinking(payload);
  const format = classifyThinkingFormat(modelId);
  let modified = applyCustomThinkingFormat(payload, format);

  // Inject model-specific extra kwargs from metadata
  // (e.g. GLM clear_thinking, or any future model with unique kwargs)
  if (modelConfig.exampleRequestExtra && hasEnabledThinking(payload)) {
    const exampleKwargs = modelConfig.exampleRequestExtra.chat_template_kwargs as Record<string, unknown> | undefined;
    if (exampleKwargs) {
      const kwargs = (payload.chat_template_kwargs as Record<string, unknown>) || {};
      let injected = false;
      for (const [key, value] of Object.entries(exampleKwargs)) {
        // Only inject keys not already set by pi or applyCustomThinkingFormat
        if (!(key in kwargs)) {
          kwargs[key] = value;
          injected = true;
        }
      }
      if (injected) {
        payload.chat_template_kwargs = kwargs;
        modified = true;
      }
    }
  }

  // Expose reasoning/thinking budget when available (schema-extracted).
  // Different models use different parameter names for the same concept.
  if (modelConfig.reasoningBudget != null && thinkingEnabledBeforeTransform) {
    const budgetParamName = format === "thinking-budget" ? "thinking_budget" : "reasoning_budget";
    payload[budgetParamName] = modelConfig.reasoningBudget;
    modified = true;
  }

  // Clean up internal flags that must not reach the API.
  delete (payload as any)._systemThinkingEnabled;

  return modified ? payload : undefined;
}

export function handleAfterProviderResponse(event: AfterProviderResponseEventLike): string | undefined {
  if (event.provider !== "nvidia-nim") return undefined;
  if (event.status !== 429) return undefined;

  const retryAfter = event.headers?.["retry-after"];
  return retryAfter
    ? `NVIDIA NIM rate-limited. Retry after ${retryAfter}.`
    : "NVIDIA NIM rate-limited.";
}

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("nvidia-nim", {
    baseUrl: NIM_BASE_URL,
    apiKey: NIM_API_KEY_ENV,
    api: "openai-completions",
    authHeader: true,
    models: STATIC_MODELS,
  });

  pi.on("before_provider_request", (event) => handleBeforeProviderRequest(event as BeforeProviderRequestEventLike));
  pi.on("after_provider_response", (event, ctx) => {
    const notice = handleAfterProviderResponse(event as AfterProviderResponseEventLike);
    if (notice) ctx.ui.notify(notice, "warning");
  });
}
