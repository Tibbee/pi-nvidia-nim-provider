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

    // GLM-5.1 also needs clear_thinking: false.
    if (/^z-ai\/glm/.test(modelId)) {
      const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;
      if (kwargs?.enable_thinking === true) {
        payload.chat_template_kwargs = {
          ...kwargs,
          clear_thinking: false,
        };
        modified = true;
      }
    }

    // Nemotron exposes an internal reasoning budget.
    if (modelConfig.reasoningBudget != null && hasEnabledThinking(payload)) {
      payload.reasoning_budget = modelConfig.reasoningBudget;
      modified = true;
    }

    return modified ? payload : undefined;
  });
}
