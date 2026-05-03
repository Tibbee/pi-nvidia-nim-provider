// Provider entry + request hook.
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { NIM_API_KEY_ENV, NIM_BASE_URL } from "./config/defaults";
import { applyCustomThinkingFormat, hasEnabledThinking } from "./handlers/thinking";
import { STATIC_MODELS, STATIC_MODEL_MAP, classifyThinkingFormat } from "./models/registry";

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("nvidia-nim", {
    baseUrl: NIM_BASE_URL,
    apiKey: NIM_API_KEY_ENV,
    api: "openai-completions",
    authHeader: true,
    models: STATIC_MODELS,
  });

  pi.on("before_provider_request", (event) => {
    if (event.provider !== "nvidia-nim") return;

    const payload = event.payload as Record<string, unknown>;
    // payload.model is the raw NIM model ID.
    const modelId = payload.model as string | undefined;
    if (!modelId) return;

    const modelConfig = STATIC_MODEL_MAP.get(modelId);
    if (!modelConfig) return;

    const format = classifyThinkingFormat(modelId, modelConfig.compat);
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

    // Expose reasoning/thinking budget when available (schema-extracted)
    if (modelConfig.reasoningBudget != null && hasEnabledThinking(payload)) {
      payload.reasoning_budget = modelConfig.reasoningBudget;
      modified = true;
    }

    return modified ? payload : undefined;
  });
}
