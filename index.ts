// Provider entry + request hook.
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { NIM_API_KEY_REF, NIM_BASE_URL } from "./config/defaults";
import { applyCustomThinkingFormat, hasEnabledThinking } from "./handlers/thinking";
import type { TransformResult } from "./handlers/thinking";
import { STATIC_MODELS, STATIC_MODEL_MAP, classifyThinkingFormat } from "./models/registry";

// Gate: pi v0.73.0 BeforeProviderRequestEvent has no `provider` field,
// so we identify NIM requests by checking whether payload.model is in our registry.
export function handleBeforeProviderRequest(event: { payload: unknown }) {
  const payload = event.payload as Record<string, unknown>;
  // payload.model is the raw NIM model ID.
  const modelId = payload.model as string | undefined;
  if (!modelId || !STATIC_MODEL_MAP.has(modelId)) return;
  // Older/smaller NIM models (e.g. solar, baichuan, falcon) reject
  // [{type:"text", text:"..."}] content arrays and require a plain
  // string. Normalize here so all models receive a universally-accepted
  // payload without needing a custom streamSimple.
  normalizeContentArrays(payload);

  const modelConfig = STATIC_MODEL_MAP.get(modelId)!;

  const thinkingEnabledBeforeTransform = hasEnabledThinking(payload);
  const format = classifyThinkingFormat(modelId);
  const result: TransformResult = applyCustomThinkingFormat(payload, format);
  let modified = result.modified;

  // Use the post-transform thinking state if the handler provides it
  // (for cases where top-level thinking params were deleted and replaced).
  const thinkingEnabledAfterTransform =
    result.thinkingEnabled !== undefined ? result.thinkingEnabled : hasEnabledThinking(payload);

  // Inject model-specific extra kwargs from metadata
  // (e.g. GLM clear_thinking, or any future model with unique kwargs)
  if (modelConfig.exampleRequestExtra && thinkingEnabledAfterTransform) {
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

  return modified ? payload : undefined;
}

export function handleAfterProviderResponse(
  event: { status: number; headers?: Record<string, string | undefined> },
  ctx: ExtensionContext,
): void {
  if (ctx.model?.provider !== "nvidia-nim") return;
  if (event.status !== 429) return;

  const retryAfter = event.headers?.["retry-after"];
  const notice = retryAfter
    ? `NVIDIA NIM rate-limited. Retry after ${retryAfter}.`
    : "NVIDIA NIM rate-limited.";
  ctx.ui.notify(notice, "warning");
}

// Older/smaller NIM models (solar, baichuan, falcon, etc.) reject // multipart content arrays and require plain strings. Normalize text-only // arrays inline so multi-modal messages with images are left untouched. function normalizeContentArrays(payload: Record<string, unknown>): void { const messages = payload.messages as Array<Record<string, unknown>> | undefined; if (!messages) return; for (const msg of messages) { const content = msg.content; if (Array.isArray(content)) { const allText = content.every((part) => (part as Record<string, unknown>).type === "text"); if (allText) { msg.content = content.map((part) => (part as Record<string, unknown>).text as string).join("\n"); } } } } export default async function (pi: ExtensionAPI) {
  pi.registerProvider("nvidia-nim", {
    baseUrl: NIM_BASE_URL,
    apiKey: NIM_API_KEY_REF,
    api: "openai-completions",
    models: STATIC_MODELS,
  });

  pi.on("before_provider_request", (event) => handleBeforeProviderRequest(event as { payload: unknown }));
  pi.on("after_provider_response", (event, ctx) => handleAfterProviderResponse(
    event as { status: number; headers?: Record<string, string | undefined> },
    ctx,
  ));
}
