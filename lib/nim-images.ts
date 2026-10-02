// Shared NVIDIA NIM image-generation client.
//
// Both the native pi image adapter (ProviderConfig.images) and the advanced
// `nim-generate-image` tool go through this module, so request translation,
// validation, and error handling exist exactly once. Image requests never
// touch chat/completions or the before_provider_request chat transforms.
//
// Logging policy: never log prompts, base64 image data, authorization
// headers, or complete provider payloads — only model IDs, status codes, and
// artifact counts.

import type {
  AssistantImages,
  ImageModel,
  ImagesContext,
  ImagesInputContent,
  ImagesOptions,
  ImagesOutputContent,
  ProviderResponse,
} from "@earendil-works/pi-ai";
import { createLogger } from "./logger";
import { decodeImageBase64, hasCompleteImageStructure, detectImageMime, MIME_EXTENSIONS } from "./image-bytes";
export { decodeImageBase64, hasCompleteImageStructure, detectImageMime, MIME_EXTENSIONS } from "./image-bytes";
import { validateNimReferenceImage } from "./image-input";
import {
  getNimImageCapability,
  getNimImageEditingError,
  type NimImageModelCapability,
  type NimImageNumberBounds,
} from "../models/image-models";

const log = createLogger("nim-images");

/** Default client-side timeout. Image generation can take minutes; 5 minutes bounds hangs. */
export const DEFAULT_IMAGE_TIMEOUT_MS = 300_000;

const MAX_ERROR_DETAIL_CHARS = 400;

/** Validated request settings. Provider field names, since the body is extra_forbidden. */
export type NimImageSettings = {
  /** Local selector, never sent as a NVIDIA field. */
  preset_example?: number;
  width?: number;
  height?: number;
  steps?: number;
  samples?: number;
  cfg_scale?: number;
  seed?: number;
};

export type NimImageResolution<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface NimImageArtifact {
  index: number;
  /** Original base64 exactly as returned by NVIDIA. */
  data: string;
  mimeType: string;
  bytes: Buffer;
  seed?: number;
  finishReason: string;
}

export type NimImageDroppedArtifact = {
  index: number;
  reason: string;
  finishReason?: string;
};

export interface NimImageRunResult {
  result: AssistantImages;
  artifacts: NimImageArtifact[];
  dropped: NimImageDroppedArtifact[];
}

// Keep artifact metadata out of the public ImagesResult wire contract. Weak keys
// avoid retaining generated image data and isolate concurrent runtime calls.
const imageRuns = new WeakMap<AssistantImages, NimImageRunResult>();

/** Recover adapter detail after Pi's authenticated runtime dispatch. */
export function getNimImageRunResult(result: AssistantImages): NimImageRunResult {
  const known = imageRuns.get(result);
  if (known) return known;
  const run: NimImageRunResult = { result: { ...result, output: [] }, artifacts: [], dropped: [] };
  if (result.stopReason !== "stop") return run; // Includes runtime/auth errors.
  // Also preserve valid output if a user replaced the provider image adapter.
  return parseArtifacts(run, { artifacts: result.output.filter((b) => b.type === "image").map(
    (b) => ({ base64: b.data, finishReason: "SUCCESS" }),
  ) });
}

// ---------------------------------------------------------------------------
// Input translation
// ---------------------------------------------------------------------------

export type NimImageInputs = { prompt: string; images: string[] };

/** Native Pi input blocks become prompt plus capability-approved data URLs. */
export function resolveImageInputs(
  capability: NimImageModelCapability,
  input: readonly ImagesInputContent[],
  /** Only explicit capability overrides in opt-in probes may bypass evidence gating. */
  allowUnverifiedEditing = false,
): NimImageResolution<NimImageInputs> {
  const blocks = input.filter((block) => block.type === "image");
  if (capability.inputTransport !== "none" || blocks.length) {
    const error = getNimImageEditingError(capability, allowUnverifiedEditing);
    if (error) return { ok: false, error };
  }
  const prompt = input.filter((block) => block.type === "text")
    .map((block) => typeof block.text === "string" ? block.text : "").join("\n\n").trim();
  if (!prompt) return { ok: false, error: "A non-empty text prompt is required." };
  if (capability.promptMaxLength !== undefined) {
    let characters = 0;
    // JSON Schema maxLength counts Unicode characters, not UTF-16 code units.
    for (const _character of prompt) {
      if (++characters > capability.promptMaxLength) {
        return { ok: false, error: `Prompt exceeds the model's ${capability.promptMaxLength}-character limit.` };
      }
    }
  }
  if (blocks.length > (capability.imageInputLimits?.maxImages ?? 0)) {
    return { ok: false, error: "Too many reference images for this model." };
  }
  const images: string[] = [];
  for (const block of blocks) {
    const error = validateNimReferenceImage(block, capability);
    if (error) return { ok: false, error };
    images.push(`data:${block.mimeType};base64,${block.data}`);
  }
  return { ok: true, value: { prompt, images } };
}

/** Kept for callers that only need prompt validation. */
export function resolveImagePrompt(capability: NimImageModelCapability, input: readonly ImagesInputContent[]): NimImageResolution<string> {
  const resolution = resolveImageInputs(capability, input);
  return resolution.ok ? { ok: true, value: resolution.value.prompt } : resolution;
}

const SETTING_BOUNDS = {
  width: "width", height: "height", steps: "steps", samples: "samples",
  cfg_scale: "cfgScale", seed: "seed",
} as const;

export function validateImageNumber(
  name: string,
  value: unknown,
  bounds: NimImageNumberBounds,
  integer = true,
): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      (integer && !Number.isSafeInteger(value))) {
    return `\`${name}\` must be a ${integer ? "safe integer" : "finite number"}.`;
  }
  if (bounds.allowed && !bounds.allowed.includes(value)) {
    return `Unsupported ${name} ${value}: only ${bounds.allowed.join(", ")} is established for this model.`;
  }
  if (bounds.min !== undefined && bounds.max !== undefined &&
      (value < bounds.min || value > bounds.max)) {
    return `\`${name}\` must be between ${bounds.min} and ${bounds.max} for this model.`;
  }
  if (bounds.min !== undefined && value < bounds.min) return `\`${name}\` must be >= ${bounds.min}.`;
  if (bounds.max !== undefined && value > bounds.max) return `\`${name}\` must be <= ${bounds.max}.`;
  if (bounds.exclusiveMinimum !== undefined && value <= bounds.exclusiveMinimum) {
    return `\`${name}\` must be > ${bounds.exclusiveMinimum}.`;
  }
  if (bounds.exclusiveMaximum !== undefined && value >= bounds.exclusiveMaximum) {
    return `\`${name}\` must be < ${bounds.exclusiveMaximum}.`;
  }
  if (bounds.multipleOf !== undefined && value % bounds.multipleOf !== 0) {
    return `\`${name}\` must be a multiple of ${bounds.multipleOf}.`;
  }
  return undefined;
}

/** A preset ID never substitutes for arbitrary uploaded image bytes. */
export function resolveNimPresetExample(capability: NimImageModelCapability, id: unknown): NimImageResolution<string | undefined> {
  if (id === undefined) return { ok: true, value: undefined };
  const preset = capability.presetEditing;
  const example = typeof id === "number" && Number.isSafeInteger(id) && id >= 0
    ? preset?.examples.find((e) => e.id === id && !!e.verifiedAt) : undefined;
  if (!example || preset?.transport !== "example-id-array" || !capability.allowedRequestFields.includes("image")) {
    return { ok: false, error: `Unsupported preset_example for ${capability.modelId}: verified IDs are ${preset?.examples.filter((e) => e.verifiedAt).map((e) => e.id).join(", ") || "none"}.` };
  }
  return { ok: true, value: `data:image/png;example_id,${example.id}` };
}

/** Validate both defaults and overrides; never silently forward unknown fields. */
export function resolveImageSettings(
  capability: NimImageModelCapability,
  raw: Record<string, unknown> | undefined,
): NimImageResolution<NimImageSettings> {
  const preset = resolveNimPresetExample(capability, raw?.preset_example);
  if (!preset.ok) return preset;
  let resolvedRaw = raw;
  if (raw?.aspect_ratio !== undefined) {
    const ratio = raw.aspect_ratio;
    const pair = typeof ratio === "string" && Object.hasOwn(capability.aspectRatios ?? {}, ratio)
      ? capability.aspectRatios![ratio] : undefined;
    if (!pair) return { ok: false, error: `Unsupported aspect_ratio: available ratios are ${Object.keys(capability.aspectRatios ?? {}).join(", ") || "none"}.` };
    if ((raw.width !== undefined && raw.width !== pair[0]) ||
        (raw.height !== undefined && raw.height !== pair[1])) {
      return { ok: false, error: "aspect_ratio conflicts with explicit width/height." };
    }
    resolvedRaw = { ...raw, width: pair[0], height: pair[1] };
  }
  for (const [key, value] of Object.entries(resolvedRaw ?? {})) {
    if (value === undefined || key === "aspect_ratio" || key === "preset_example") continue;
    const reason = Object.hasOwn(capability.rejectedRequestFields, key) ? capability.rejectedRequestFields[key] : undefined;
    if (reason) return { ok: false, error: `\`${key}\` is not accepted: ${reason}.` };
    if (key === "prompt") return { ok: false, error: "`prompt` is not a request setting; pass it as text input." };
    if (!Object.hasOwn(SETTING_BOUNDS, key) || !capability.allowedRequestFields.includes(key)) {
      return { ok: false, error: `Unsupported parameter \`${key}\` for ${capability.modelId}.` };
    }
  }
  const settings: NimImageSettings = preset.value === undefined ? {} : { preset_example: raw!.preset_example as number };
  for (const key of Object.keys(SETTING_BOUNDS) as Array<keyof typeof SETTING_BOUNDS>) {
    if (!capability.allowedRequestFields.includes(key)) continue;
    const bounds = capability[SETTING_BOUNDS[key]];
    const override = resolvedRaw?.[key];
    const value = override === undefined ? bounds.default : override;
    if (value === undefined) continue;
    const error = validateImageNumber(key, value, bounds, key !== "cfg_scale");
    if (error) return { ok: false, error };
    settings[key] = value as number;
  }
  if (capability.dimensionPairs && (settings.width !== undefined || settings.height !== undefined) && !capability.dimensionPairs.some(
    ([width, height]) => width === settings.width && height === settings.height,
  )) {
    return { ok: false, error: `Unsupported dimension combination for ${capability.modelId}: allowed pairs are ${capability.dimensionPairs.map(([w, h]) => `${w}x${h}`).join(", ")}.` };
  }
  if (settings.preset_example !== undefined) {
    const pairs = capability.presetEditing?.examples.find((e) => e.id === settings.preset_example)?.dimensionPairs;
    if (!pairs?.some(([w, h]) => settings.width === w && settings.height === h)) {
      return { ok: false, error: "preset_example requires its verified dimensions (Klein preset 0: 1024x1024)." };
    }
  }
  for (const key of capability.requiredRequestFields ?? []) {
    if (!capability.allowedRequestFields.includes(key)) {
      return { ok: false, error: `Required field \`${key}\` is not allowed by the capability record.` };
    }
    if (key !== "prompt" && !Object.hasOwn(settings, key)) {
      return { ok: false, error: `Missing required setting \`${key}\` for ${capability.modelId}.` };
    }
  }
  return { ok: true, value: settings };
}

/** The endpoint identifies the model; only capability-approved fields are sent. */
export function buildImageRequest(
  capability: NimImageModelCapability,
  prompt: string,
  settings: NimImageSettings,
  images: readonly string[] = [],
): Record<string, unknown> {
  const preset = resolveNimPresetExample(capability, settings.preset_example);
  if (!preset.ok) throw new Error(preset.error);
  if (preset.value !== undefined && images.length) throw new Error("preset_example conflicts with reference-image input.");
  const image = preset.value !== undefined ? [preset.value] : images.length && ["data-url-array", "data-url-string"].includes(capability.inputTransport)
    ? (capability.inputTransport === "data-url-array" ? images : images[0]) : undefined;
  const { preset_example: _preset, ...numericSettings } = settings;
  return Object.fromEntries(Object.entries({ prompt, ...numericSettings, image }).filter(
    ([key, value]) => value !== undefined && (key === "prompt" || key === "image" || Object.hasOwn(SETTING_BOUNDS, key)) &&
      capability.allowedRequestFields.includes(key),
  ));
}

// ---------------------------------------------------------------------------
// Response normalization
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function truncate(text: string, max = MAX_ERROR_DETAIL_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Extract a short human-readable detail from a NIM error body. */
export function describeErrorBody(bodyText: string): string | undefined {
  const trimmed = bodyText.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown; message?: unknown };
    const detail = parsed.detail ?? parsed.message;
    if (typeof detail === "string") return truncate(detail);
    if (Array.isArray(detail)) {
      // Pydantic-style validation errors: [{ type, loc, msg, input }]
      const parts = detail.map((item) => {
        const entry = item as { loc?: unknown; msg?: unknown };
        const loc = Array.isArray(entry.loc) ? entry.loc.join(".") : undefined;
        return loc && typeof entry.msg === "string" ? `${loc}: ${entry.msg}` : String(entry.msg ?? item);
      });
      return truncate(parts.join("; "));
    }
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return truncate(trimmed);
}

export function describeHttpError(
  status: number,
  bodyText: string,
  headers?: Record<string, string>,
): string {
  const detail = describeErrorBody(bodyText);
  const detailSuffix = detail ? `: ${detail}` : "";
  if (status === 401 || status === 403) {
    return `Authentication failed (HTTP ${status}). Check the NVIDIA API key for the nvidia-nim provider.`;
  }
  if (status === 410) {
    return `Model retired (HTTP 410)${detailSuffix}`;
  }
  if (status === 422) {
    return `Invalid request (HTTP 422)${detailSuffix}`;
  }
  if (status === 429) {
    const retryAfter = headers?.["retry-after"];
    return (
      `Rate limited (HTTP 429)${retryAfter ? `, retry after ${retryAfter}` : ""}. ` +
      "NVIDIA NIM free-tier quotas are per minute and per month."
    );
  }
  if (status >= 500) {
    const requestId = headers?.["x-request-id"] ?? headers?.["x-nvca-request-id"];
    return `NVIDIA NIM server error (HTTP ${status})${requestId ? `, request ID ${requestId}` : ""}${detailSuffix}`;
  }
  return `Unexpected response (HTTP ${status})${detailSuffix}`;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function mergeHeaders(
  apiKey: string | undefined,
  model: ImageModel<string>,
  extra: ImagesOptions["headers"],
): Record<string, string> {
  // HTTP header names are case-insensitive. Keep one entry per logical header.
  const headers = new Map<string, [string, string]>();
  const set = (key: string, value: string | null | undefined) => {
    if (value === null) headers.delete(key.toLowerCase());
    else if (value !== undefined) headers.set(key.toLowerCase(), [key, value]);
  };
  set("Content-Type", "application/json");
  set("Accept", "application/json");
  if (apiKey) set("Authorization", `Bearer ${apiKey}`);
  for (const [key, value] of Object.entries(model.headers ?? {})) set(key, value);
  for (const [key, value] of Object.entries(extra ?? {})) set(key, value);
  return Object.fromEntries(headers.values());
}

/** Settle even when a hook or custom fetch ignores cancellation; handle late rejections. */
export function awaitImageOperation<T>(
  work: () => T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return work();
    }).then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

/**
 * Full generation run with artifact-level detail (seeds, finish reasons) for
 * callers that need it — the advanced tool uses this. `result` is the pi
 * ImagesResult contract used by the native adapter.
 */
export async function runNimImageGeneration(
  model: ImageModel<string>,
  context: ImagesContext,
  options?: ImagesOptions,
  /** Explicit capability injection for offline tests and opt-in candidate probes only. */
  capabilityOverride?: NimImageModelCapability,
): Promise<NimImageRunResult> {
  const result: AssistantImages = {
    api: model.api,
    provider: model.provider,
    model: model.id,
    output: [],
    stopReason: "stop",
    timestamp: Date.now(),
  };
  const run: NimImageRunResult = { result, artifacts: [], dropped: [] };

  const fail = (
    message: string,
    stopReason: "error" | "aborted" = "error",
    status?: number,
  ): NimImageRunResult => {
    result.stopReason = stopReason;
    result.errorMessage = message;
    // Provider/hook errors may echo prompts or credentials. Keep details in
    // the caller-facing result, never in the persistent diagnostic log.
    log.warn("image generation failed", {
      model: model.id,
      stopReason,
      ...(status !== undefined ? { status } : {}),
    });
    return run;
  };

  const capability = capabilityOverride ?? getNimImageCapability(model.id);
  if (!capability || capability.modelId !== model.id) {
    return fail(`No image capability record for model ${model.id}.`);
  }

  if (options?.metadata?.preset_example !== undefined && context.input?.some((b) => b.type === "image")) {
    return fail("preset_example conflicts with reference-image input.");
  }
  const inputResolution = resolveImageInputs(capability, context.input ?? [], capabilityOverride !== undefined);
  if (!inputResolution.ok) return fail(inputResolution.error);

  // The metadata channel carries advanced settings (ImagesOptions.metadata),
  // which the codemode generateImages() interface cannot express.
  const settingsResolution = resolveImageSettings(capability, options?.metadata);
  if (!settingsResolution.ok) return fail(settingsResolution.error);
  const settings = settingsResolution.value;

  const apiKey = options?.apiKey;
  // Runtime authentication can be header-only (e.g. a proxy). Pi owns auth resolution.
  const headers = mergeHeaders(apiKey, model, options?.headers);
  if (!apiKey && !Object.keys(headers).some((key) => !["content-type", "accept"].includes(key.toLowerCase()))) {
    return fail(`No API key or authentication headers for provider: ${model.provider}`);
  }

  const externalSignal = options?.signal;
  if (externalSignal?.aborted) {
    return fail("Image generation aborted.", "aborted");
  }

  let payload: Record<string, unknown> = buildImageRequest(
    capability,
    inputResolution.value.prompt,
    settings,
    inputResolution.value.images,
  );
  const timeoutMs = options?.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    return fail("`timeoutMs` must be an integer between 1 and 2147483647.");
  }
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    if (options?.onPayload) {
      const replacement = await awaitImageOperation(() => options.onPayload!(payload, model), controller.signal);
      if (replacement !== undefined) payload = replacement as Record<string, unknown>;
    }
    // Cancellation may have arrived while the asynchronous hook was running.
    // Do not send a request (and consume quota) after that cancellation.
    controller.signal.throwIfAborted();

    const fetchImpl = options?.fetch ?? globalThis.fetch;
    const response = await awaitImageOperation(() => fetchImpl(model.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    }), controller.signal);

    const responseInfo: ProviderResponse = {
      status: response.status,
      headers: headersToRecord(response.headers),
    };
    try {
      await awaitImageOperation(() => options?.onResponse?.(responseInfo, model), controller.signal);
    } catch (error) {
      // A stalled hook must not leave an unread response streaming indefinitely.
      void response.body?.cancel().catch(() => {});
      throw error;
    }

    const bodyText = await awaitImageOperation(() => response.text(), controller.signal);
    controller.signal.throwIfAborted();
    if (!response.ok) {
      return fail(describeHttpError(response.status, bodyText, responseInfo.headers), "error", response.status);
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText) as unknown;
    } catch {
      return fail("Malformed response: body is not valid JSON.");
    }
    return parseArtifacts(run, body, capability.sniffableMimeTypes);
  } catch (error) {
    if (externalSignal?.aborted) {
      return fail("Image generation aborted.", "aborted");
    }
    if (timedOut) {
      return fail(`Image generation timed out after ${timeoutMs} ms.`);
    }
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Image generation request failed: ${truncate(message)}`);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

export function parseArtifacts(
  run: NimImageRunResult,
  body: unknown,
  allowedMimeTypes: readonly string[] = Object.keys(MIME_EXTENSIONS),
): NimImageRunResult {
  const { result } = run;
  const artifacts = body && typeof body === "object" ? (body as { artifacts?: unknown }).artifacts : undefined;
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    result.stopReason = "error";
    result.errorMessage = "Malformed response: no `artifacts` array returned.";
    log.warn("image generation returned no artifacts", { model: result.model });
    return run;
  }

  artifacts.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      run.dropped.push({ index, reason: "malformed artifact (expected an object)" });
      return;
    }
    const artifact = raw as {
      base64?: unknown;
      finishReason?: unknown;
      finish_reason?: unknown;
      seed?: unknown;
    };
    const finishReasonRaw = artifact.finishReason ?? artifact.finish_reason;
    const finishReason = typeof finishReasonRaw === "string" ? finishReasonRaw : undefined;
    const seed = typeof artifact.seed === "number" && Number.isSafeInteger(artifact.seed) &&
      artifact.seed >= 0 && artifact.seed <= 4_294_967_295 ? artifact.seed : undefined;

    if (finishReason !== "SUCCESS") {
      // Report the provider's own value verbatim; do not guess its semantics.
      run.dropped.push({ index, reason: finishReason === undefined ? "missing finishReason" : `finishReason=${finishReason}`, finishReason });
      return;
    }
    if (typeof artifact.base64 !== "string" || artifact.base64.length === 0) {
      run.dropped.push({ index, reason: "missing base64 image data", finishReason });
      return;
    }

    const bytes = decodeImageBase64(artifact.base64);
    if (!bytes) {
      run.dropped.push({ index, reason: "invalid base64 image data", finishReason });
      return;
    }
    const mimeType = detectImageMime(bytes);
    if (!mimeType) {
      run.dropped.push({ index, reason: "unrecognized image format", finishReason });
      return;
    }
    if (!allowedMimeTypes.includes(mimeType)) {
      run.dropped.push({ index, reason: `unsupported image format ${mimeType}`, finishReason });
      return;
    }
    if (!hasCompleteImageStructure(bytes, mimeType)) {
      run.dropped.push({ index, reason: "truncated or malformed image structure", finishReason });
      return;
    }
    run.artifacts.push({
      index,
      data: artifact.base64,
      mimeType,
      bytes,
      seed,
      finishReason: finishReason ?? "SUCCESS",
    });
  });

  if (run.artifacts.length === 0) {
    result.stopReason = "error";
    result.errorMessage =
      "No usable images in the response" +
      (run.dropped.length > 0
        ? `: ${run.dropped.map((d) => `artifact ${d.index + 1} (${d.reason})`).join(", ")}`
        : ".");
    log.warn("image generation produced no usable artifacts", {
      model: result.model,
      dropped: run.dropped.length,
    });
    return run;
  }

  const output: ImagesOutputContent[] = [];
  for (const artifact of run.artifacts) {
    output.push({ type: "image", mimeType: artifact.mimeType, data: artifact.data });
  }
  // Artifact metadata (seeds) keeps generations reproducible. Text blocks are
  // part of the ImagesResult contract ("text blocks for models that also
  // return text"); image data itself is never echoed as text.
  for (const artifact of run.artifacts) {
    if (artifact.seed !== undefined) {
      output.push({ type: "text", text: `artifact ${artifact.index + 1}: seed=${artifact.seed}` });
    }
  }
  if (run.dropped.length > 0) {
    output.push({
      type: "text",
      text:
        `dropped ${run.dropped.length} artifact(s): ` +
        run.dropped.map((d) => `artifact ${d.index + 1} (${d.reason})`).join(", "),
    });
  }
  result.output = output;
  // Usage stays undefined: NVIDIA returns no token or cost information for
  // image generation and none is fabricated.
  log.info("image generation succeeded", {
    model: result.model,
    images: run.artifacts.length,
    dropped: run.dropped.length,
  });
  return run;
}

/** pi image-adapter entry point (ProviderConfig.images / codemode generateImages). */
export async function generateNimImages(
  model: ImageModel<string>,
  context: ImagesContext,
  options?: ImagesOptions,
): Promise<AssistantImages> {
  const run = await runNimImageGeneration(model, context, options);
  imageRuns.set(run.result, run);
  return run.result;
}
