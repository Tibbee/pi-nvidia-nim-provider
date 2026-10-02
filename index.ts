// Provider entry + request hook.
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  NIM_API_KEY_REF,
  NIM_BASE_URL,
} from "./config/defaults";
import { applyCustomThinkingFormat, hasEnabledThinking } from "./handlers/thinking";
import type { TransformResult } from "./handlers/thinking";
import { NIM_IMAGE_TOOL } from "./handlers/image-tool";
import { generateNimImages } from "./lib/nim-images";
import {
  NIM_IMAGES_API,
  NIM_IMAGE_MODELS,
  NIM_IMAGE_MODEL_IDS,
  type NimImageModelConfig,
} from "./models/image-models";
import { STATIC_MODELS, STATIC_MODEL_MAP, classifyThinkingFormat } from "./models/registry";

// Mixed-operation catalog: chat models (implicit type "chat") plus explicit
// image models. Anything that replaces the provider's live model list (a
// future refreshModels path included) must rebuild this combined list — an
// image-only or chat-only list would drop the other operation.
export type ProviderModelEntry =
  | (typeof STATIC_MODELS)[number]
  | NimImageModelConfig;

export const PROVIDER_MODEL_CONFIGS: ProviderModelEntry[] = [
  ...STATIC_MODELS,
  ...NIM_IMAGE_MODELS,
];

const NIM_DEBUG_LOG = join(homedir(), ".pi", "nim-debug.log");

// Gate: pi v0.73.0 BeforeProviderRequestEvent has no `provider` field,
// so we identify NIM requests by checking whether payload.model is in our registry.
export function handleBeforeProviderRequest(
  event: { payload: unknown },
  ctx: Pick<ExtensionContext, "model">,
) {
  if (ctx.model?.provider !== "nvidia-nim") return;

  const payload = event.payload as Record<string, unknown>;
  // payload.model is the raw NIM model ID, not a provider-prefixed ID.
  const modelId = payload.model as string | undefined;
  if (!modelId || !STATIC_MODEL_MAP.has(modelId)) return;
  // Image models run through the nvidia-nim-images adapter, never through
  // chat/completions. Chat payload transforms must not touch them even if a
  // future payload carries their ID.
  if (NIM_IMAGE_MODEL_IDS.has(modelId)) return;
  // Some NIM models reject [{type:"text", text:"..."}] content arrays and
  // require a plain string. Normalize here so all models receive a
  // universally-accepted payload without needing a custom streamSimple.
  normalizeContentArrays(payload);

  const modelConfig = STATIC_MODEL_MAP.get(modelId)!;

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
  if (modelConfig.reasoningBudget != null && thinkingEnabledAfterTransform) {
    payload.reasoning_budget = modelConfig.reasoningBudget;
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

// Some NIM models reject multipart content arrays and require plain strings.
// Normalize text-only arrays inline so multi-modal messages with images are
// left untouched.
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
    name: "NVIDIA NIM",
    baseUrl: NIM_BASE_URL,
    apiKey: NIM_API_KEY_REF,
    api: "openai-completions",
    models: PROVIDER_MODEL_CONFIGS,
    // Image-generation implementations keyed by the image API identifier.
    // Chat models keep the provider-level `api: "openai-completions"`; image
    // models override it per model with `api: NIM_IMAGES_API`.
    images: {
      [NIM_IMAGES_API]: { generateImages: generateNimImages },
    },
  });

  pi.registerTool(NIM_IMAGE_TOOL);

  pi.on("before_provider_request", (event, ctx) =>
    handleBeforeProviderRequest(event as { payload: unknown }, ctx),
  );
  pi.on("after_provider_response", (event, ctx) => handleAfterProviderResponse(
    event as { status: number; headers?: Record<string, string | undefined> },
    ctx,
  ));
}
