// Provider entry + request hook.
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { NIM_API_KEY_REF, NIM_BASE_URL } from "./config/defaults";
import { applyCustomThinkingFormat, hasEnabledThinking } from "./handlers/thinking";
import type { TransformResult } from "./handlers/thinking";
import { STATIC_MODELS, STATIC_MODEL_MAP, classifyThinkingFormat } from "./models/registry";

const NIM_DEBUG_LOG = join(homedir(), ".pi", "nim-debug.log");

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
  if (modelConfig.reasoningBudget != null && thinkingEnabledAfterTransform) {
    const budgetParamName = format === "thinking-budget" ? "thinking_budget" : "reasoning_budget";
    payload[budgetParamName] = modelConfig.reasoningBudget;
    modified = true;
  }

  // Ensure max_tokens is always set — some NIM models reject requests without it.
  if (payload.max_tokens == null && payload.max_completion_tokens == null) {
    payload.max_tokens = modelConfig.maxTokens;
    modified = true;
  }

  // Debug: log the final payload for troubleshooting.
  // Set NIM_DEBUG=1 to log to ~/.pi/nim-debug.log
  if (typeof process !== "undefined" && process.env.NIM_DEBUG) {
    try {
      appendFileSync(NIM_DEBUG_LOG,
        `--- ${new Date().toISOString()} ${modelId} ---\n` +
        JSON.stringify(payload, null, 2) + "\n"
      );
    } catch { /* ignore write errors */ }
  }

  return modified ? payload : undefined;
}

export function handleAfterProviderResponse(
  event: { status: number; headers?: Record<string, string | undefined> },
  ctx: ExtensionContext,
): void {
  if (ctx?.model?.provider !== "nvidia-nim") return;

  if (event.status === 429) {
    const retryAfter = event.headers?.["retry-after"];
    const notice = retryAfter
      ? `NVIDIA NIM rate-limited. Retry after ${retryAfter}.`
      : "NVIDIA NIM rate-limited.";
    ctx.ui.notify(notice, "warning");
    return;
  }

  if (event.status >= 500) {
    const requestId = event.headers?.["x-request-id"] ?? event.headers?.["x-nvca-request-id"];
    const notice = requestId
      ? `NVIDIA NIM server error (${event.status}). Request ID: ${requestId}`
      : `NVIDIA NIM server error (${event.status}).`;
    ctx.ui.notify(notice, "error");
  }
}

// Older/smaller NIM models (e.g. solar, baichuan, falcon) reject
// multipart content arrays and require plain strings. Normalize text-only
// arrays inline so multi-modal messages with images are left untouched.
function normalizeContentArrays(payload: Record<string, unknown>): void {
  const messages = payload.messages as Array<Record<string, unknown>> | undefined;
  if (!messages) return;
  for (const msg of messages) {
    const content = msg.content;
    if (Array.isArray(content)) {
      const allText = content.every(
        (part) => (part as Record<string, unknown>).type === "text",
      );
      if (allText) {
        msg.content = content
          .map((part) => (part as Record<string, unknown>).text as string)
          .join("\n");
      }
    }
  }
}

export default async function (pi: ExtensionAPI) {
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
