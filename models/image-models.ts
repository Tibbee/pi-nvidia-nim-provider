// Image-generation capability records and catalog entries for hosted NIM.
//
// Image models are a separate operation from chat: they are registered with
// an explicit `type: "image"` discriminant and dispatched through the
// `nvidia-nim-images` API implementation (lib/nim-images.ts), never through
// chat/completions or the before_provider_request chat transforms.
//
// Capabilities are evidence-aware, like models/capabilities.ts: only what a
// live request or NVIDIA's own schema establishes is advertised. Adding a
// model means adding one capability record and one catalog entry; request
// logic lives entirely in the shared client.

/** Image API identifier used as the ProviderConfig.images key and model.api. */
export const NIM_IMAGES_API = "nvidia-nim-images";

/** The one model whose hosted endpoint is verified (2026-10-02). */
export const DEFAULT_NIM_IMAGE_MODEL_ID = "black-forest-labs/flux.2-klein-4b";

export interface NimImageNumberBounds {
  /** Omitted bounds are unknown, not invented provider limits. */
  min?: number;
  max?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  allowed?: readonly number[];
  multipleOf?: number;
}

export interface NimImageChoiceBounds extends NimImageNumberBounds {
  allowed: readonly number[];
  default: number;
}

export interface NimImageRangeBounds extends NimImageNumberBounds {
  default: number;
}

export interface NimImageModelCapability {
  modelId: string;
  name: string;
  /** Hosted API, container API, and live observations are distinct evidence. */
  evidence: {
    hostedSchema: string;
    generationVerifiedAt?: string;
    editingVerifiedAt?: string;
    notes: readonly string[];
  };
  /** POST target; the model is identified by the URL, not by a body field. */
  endpoint: string;
  /** Non-text transports require a dedicated implementation before registration. */
  inputTransport: "none" | "base64" | "asset-id" | "preset-only" | "data-url-array" | "data-url-string";
  /** Required for implemented image transports; limits are validated before upload. */
  imageInputLimits?: { maxImages: number; maxBytes: number; mimeTypes: readonly string[] };
  promptMaxLength?: number;
  /** Request body fields this model accepts (NVIDIA's schema is extra_forbidden). */
  allowedRequestFields: readonly string[];
  /** Fields that must never be sent, with the reason (verified rejections). */
  rejectedRequestFields: Readonly<Record<string, string>>;
  /** Fields that must be present after defaults and user settings are resolved. */
  requiredRequestFields?: readonly string[];
  width: NimImageRangeBounds;
  height: NimImageRangeBounds;
  dimensionPairs?: readonly (readonly [number, number])[];
  /** Human-facing labels, always width:height; these are not NVIDIA body fields. */
  aspectRatios?: Readonly<Record<string, readonly [number, number]>>;
  steps: NimImageRangeBounds;
  samples: NimImageRangeBounds;
  cfgScale: NimImageRangeBounds;
  seed: NimImageNumberBounds & { default?: number; randomWhenZero: boolean };
  /** MIME types the response sniffer recognizes for this model's artifacts. */
  sniffableMimeTypes: readonly string[];
}

/**
 * FLUX.2 Klein 4B hosted-NIM observation (verified 2026-10-02 against
 * POST https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b):
 *
 * - Request: { prompt, width, height, seed, steps, samples, cfg_scale }.
 *   The live schema is extra_forbidden: `mode` (advertised by the published
 *   docs as "Image Generation") is rejected with HTTP 422, and `cfg_scale`
 *   must be >= 1 even though the published schema says "0 to 0, default 0"
 *   (cfg_scale: 1 succeeded; the upper limit is unverified).
 * - Dimensions: live RGB JPEG decoding verified 1024x1024, 1344x768,
 *   768x1344, 1568x672, 1024x768, and 1008x752. Hosted descriptions claiming 1024-only are stale.
 *   Playground ratio labels reverse width/height; our labels use conventional
 *   orientation. Hosted validation independently enumerated width and height
 *   from 512 through 1568 in increments of 16. Generation uses these grids;
 *   no additional combined-size limits are inferred or guaranteed.
 * - steps: documented 1-4 (default 4), 4 tested. samples: documented 1 only
 *   (default 1), 1 tested. seed: documented uint32 (default 0 = random), 42 tested
 *   and echoed per artifact.
 * - Response: { artifacts: [{ base64, finishReason, seed }] }. The successful
 *   artifact carried finishReason "SUCCESS"; no usage or cost information is
 *   returned. Uploaded JPEG data-URL arrays and PNG data-URL strings both
 *   received HTTP 422; the PNG rejection mentions example_id and base64.
 *   Preset 0 array editing succeeded and visually turned the source frog red,
 *   with its pose/scene largely preserved. This is historical diagnostic evidence;
 *   preset editing is not a supported feature. Generic image input stays text-only.
 *   Arbitrary-image editing remains disabled. Negative prompts, output-format
 *   selection, compression controls, and seamless generation are unverified.
 *
 * References:
 * - https://build.nvidia.com/black-forest-labs/flux_2-klein-4b
 * - https://docs.api.nvidia.com/nim/reference/black-forest-labs-flux_2-klein-4b-infer
 */
export const FLUX_2_KLEIN_4B_CAPABILITY: NimImageModelCapability = {
  modelId: "black-forest-labs/flux.2-klein-4b",
  name: "FLUX.2 Klein 4B",
  evidence: {
    hostedSchema: "https://build.nvidia.com/black-forest-labs/flux_2-klein-4b",
    generationVerifiedAt: "2026-10-02",
    notes: [
      "Hosted schema guidance 0 conflicts with live rejection; 1 succeeded, upper bound unknown.",
      "2026-10-02: full pixel decoding confirmed 1344x768, 768x1344, and 1568x672; 1024-only descriptions contradict live behavior.",
      "Playground ratio labels reverse width/height. Our 16:9 maps to landscape 1344x768 (approximate ratio), 9:16 to portrait 768x1344.",
      "Dimension admission comes from live hosted validation, not model-card presets or container bounds. Not every valid combination has been generated.",
      "2026-10-02: JPEG data-URL array and PNG data-URL string reference uploads received HTTP 422; the latter contains a preset example_id hint. No successful arbitrary-image editing established.",
      "2026-10-02: decoded 1024x768 and 1008x752 outputs matched requests; existing aspect-ratio aliases retain their mappings.",
      "2026-10-02: separate hosted width and height validation responses each enumerated 512..1568 inclusive in steps of 16. Generation accepts that grid without rounding; additional combined-size restrictions are unknown.",
      "Historical diagnostic: preset 0 array reference edited NVIDIA's green frog to red; no mode field. Preset editing was removed in 1.14.2 because it does not support users' own images.",
      "Seed uint32 bound is hosted-schema evidence; only seed 42 was tested live.",
    ],
  },
  endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b",
  inputTransport: "none",
  promptMaxLength: 10_000,

  requiredRequestFields: ["prompt"],
  allowedRequestFields: ["prompt", "width", "height", "seed", "steps", "samples", "cfg_scale"],
  rejectedRequestFields: {
    mode: "the live endpoint rejects `mode` as an extra field (HTTP 422, extra_forbidden); omit it",
  },
  width: { min: 512, max: 1568, multipleOf: 16, default: 1024 },
  height: { min: 512, max: 1568, multipleOf: 16, default: 1024 },
  aspectRatios: { "1:1": [1024, 1024], "16:9": [1344, 768], "9:16": [768, 1344], "21:9": [1568, 672], "4:3": [1024, 768] },
  steps: { min: 1, max: 4, default: 4 },
  samples: { min: 1, max: 1, default: 1 },
  cfgScale: { min: 1, default: 1 },
  seed: { min: 0, max: 4_294_967_295, randomWhenZero: true },
  sniffableMimeTypes: ["image/jpeg", "image/png", "image/webp"],
};

const CAPABILITIES: ReadonlyMap<string, NimImageModelCapability> = new Map([
  [FLUX_2_KLEIN_4B_CAPABILITY.modelId, FLUX_2_KLEIN_4B_CAPABILITY],
]);

export function getNimImageCapability(modelId: string): NimImageModelCapability | undefined {
  return CAPABILITIES.get(modelId);
}

export function getAllNimImageCapabilities(): readonly NimImageModelCapability[] {
  return Array.from(CAPABILITIES.values());
}

// Structural shape of pi's ProviderImageModelConfig (legacy ProviderConfig
// form). Typed locally so tests load this module without pi installed.
export interface NimImageModelConfig {
  type: "image";
  id: string;
  name: string;
  api: string;
  /** Model-level baseUrl takes precedence over the provider endpoint. */
  baseUrl: string;
  input: ("text" | "image")[];
  output: ("text" | "image")[];
  // Pi requires cost metadata for every catalog entry. All zeros mean
  // UNREPORTED PRICING, not free inference: NVIDIA publishes no per-image
  // price for this endpoint and the verified response returned no usage.
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/** Fail closed: implemented encoding is not evidence that hosted editing works. */
export function getNimImageEditingError(capability: NimImageModelCapability, allowUnverifiedEditing = false): string | undefined {
  if (!["data-url-array", "data-url-string"].includes(capability.inputTransport)) {
    return `Image input / arbitrary-image editing is not supported for ${capability.modelId}: transport ${capability.inputTransport} is not implemented or verified.`;
  }
  const limits = capability.imageInputLimits;
  if ((!allowUnverifiedEditing && !capability.evidence.editingVerifiedAt) || !capability.allowedRequestFields.includes("image") ||
      !limits || !Number.isSafeInteger(limits.maxImages) || limits.maxImages < 1 ||
      !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1 || !limits.mimeTypes.length ||
      !limits.mimeTypes.every((mime) => ["image/jpeg", "image/png", "image/webp"].includes(mime)) ||
      (capability.inputTransport === "data-url-string" && limits.maxImages !== 1)) {
    return `Arbitrary-image editing is not verified or configured for ${capability.modelId}.`;
  }
  return undefined;
}

export function capabilityToModelConfig(capability: NimImageModelCapability): NimImageModelConfig {
  if (!capability.evidence.generationVerifiedAt) {
    throw new Error(`No verified hosted generation for ${capability.modelId}; keep it in probe candidates.`);
  }
  if (capability.inputTransport !== "none") {
    const error = getNimImageEditingError(capability);
    if (error) throw new Error(error);
  }
  return {
    type: "image",
    id: capability.modelId,
    name: capability.name,
    api: NIM_IMAGES_API,
    baseUrl: capability.endpoint,
    input: capability.inputTransport === "none" ? ["text"] : ["text", "image"],
    output: ["image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

// Static image catalog. This list is intentionally NOT driven by
// models/metadata.json (which is generated chat-model data): metadata
// refreshes cannot add or remove image models, and any future refreshModels
// path must merge this list back in alongside the chat models.
export const NIM_IMAGE_MODELS: readonly NimImageModelConfig[] =
  getAllNimImageCapabilities().map(capabilityToModelConfig);

export const NIM_IMAGE_MODEL_IDS: ReadonlySet<string> = new Set(
  NIM_IMAGE_MODELS.map((model) => model.id),
);
