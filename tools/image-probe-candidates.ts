// Probe-only candidates: deliberately absent from the registered image catalog.
// These are hosted-preview bounds, NOT downloadable container bounds.
import { FLUX_2_KLEIN_4B_CAPABILITY as klein, type NimImageModelCapability } from "../models/image-models";

// Upstream model-card dimensions, not automatically hosted-preview evidence.
export const KLEIN_MODEL_CARD_DIMENSION_PAIRS = [
  [672, 1568], [688, 1504], [720, 1456], [752, 1392], [800, 1328], [832, 1248],
  [880, 1184], [944, 1104], [1024, 1024], [1104, 944], [1184, 880], [1248, 832],
  [1328, 800], [1392, 752], [1456, 720], [1504, 688], [1568, 672],
] as const;
export const KLEIN_PLAYGROUND_DIMENSION_PAIRS = [
  [1024, 1024], [1344, 768], [768, 1344], [1152, 896], [896, 1152], [1216, 832], [832, 1216],
] as const;

// Do not inherit newly verified Klein dimensions/editing into unrelated models.
const textOnly1024: NimImageModelCapability = {
  ...klein, inputTransport: "none", imageInputLimits: undefined, promptMaxLength: undefined,
  allowedRequestFields: klein.allowedRequestFields.filter((field) => field !== "image"),
  width: { allowed: [1024], default: 1024 }, height: { allowed: [1024], default: 1024 },
  dimensionPairs: [[1024, 1024]], aspectRatios: { "1:1": [1024, 1024] },
};

export const IMAGE_PROBE_CANDIDATES: readonly NimImageModelCapability[] = [
  {
    ...textOnly1024,
    modelId: "black-forest-labs/flux.1-dev",
    name: "FLUX.1 Dev (unverified candidate)",
    endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
    steps: { min: 5, max: 100, default: 50 },
    cfgScale: { exclusiveMinimum: 1, max: 9, default: 5 },
    rejectedRequestFields: { mode: "candidate probes support text-to-image only and omit mode" },
    evidence: {
      hostedSchema: "https://build.nvidia.com/black-forest-labs/flux_1-dev",
      notes: [
        "Hosted schema inspected 2026-10-02; descriptions restrict dimensions to 1024 despite broader enums.",
        "Prior probe: empty-body HTTP 504 after 302.05 seconds; no successful generation established.",
        "Preview image references are predefined examples, not general image upload.",
      ],
    },
  },
  {
    ...textOnly1024,
    modelId: "black-forest-labs/flux.1-schnell",
    name: "FLUX.1 Schnell (unverified candidate)",
    endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
    cfgScale: { min: 0, max: 0, default: 0 },
    rejectedRequestFields: { mode: "candidate probes support text-to-image only and omit mode" },
    evidence: {
      hostedSchema: "https://build.nvidia.com/black-forest-labs/flux_1-schnell",
      notes: [
        "Hosted schema inspected 2026-10-02; guidance is exactly 0, also supported by live 422 evidence.",
        "Prior probe: empty-body HTTP 504 after 302.20 seconds; no successful generation established.",
        "No general image input is supported; dimensions conservatively restricted to 1024.",
      ],
    },
  },
];
