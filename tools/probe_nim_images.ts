// Dry-run-first, single-request image probe. No raw payload/error/credential logging.
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ImageModel, ImagesOptions } from "@earendil-works/pi-ai";
import { getAllNimImageCapabilities, DEFAULT_NIM_IMAGE_MODEL_ID, type NimImageModelCapability } from "../models/image-models";
import { resolveImageSettings, resolveImageInputs, runNimImageGeneration } from "../lib/nim-images";
import { readNimReferenceImage, MAX_NIM_REFERENCE_IMAGE_BYTES } from "../lib/image-input";
import { IMAGE_PROBE_CANDIDATES, KLEIN_MODEL_CARD_DIMENSION_PAIRS, KLEIN_PLAYGROUND_DIMENSION_PAIRS } from "./image-probe-candidates";

export type ImageProbeOptions = {
  model: string;
  live: boolean;
  prompt: string;
  settings: Record<string, unknown>;
  timeoutMs: number;
  output?: string;
  candidateDimensions?: boolean;
  inputImage?: string;
  imageTransport?: "data-url-array" | "data-url-string";
};
export type ImageProbeDecoder = (bytes: Buffer) => { width: number; height: number } | undefined;

export function parseImageProbeArgs(args: string[]): ImageProbeOptions {
  const options: ImageProbeOptions = {
    model: DEFAULT_NIM_IMAGE_MODEL_ID, live: false,
    prompt: "A red cube on a white background.", settings: {}, timeoutMs: 325_000,
  };
  for (const arg of args) {
    if (arg === "--live") { options.live = true; continue; }
    if (arg === "--dry-run") continue;
    if (arg === "--candidate-dimensions") { options.candidateDimensions = true; continue; }
    const match = /^--([a-z_-]+)=(.*)$/s.exec(arg);
    if (!match) throw new Error("Use --live, --candidate-dimensions, or --name=value options.");
    const [, name, value] = match;
    if (["width", "height", "steps", "samples", "cfg_scale", "seed"].includes(name)) {
      if (!value.trim()) throw new Error("Numeric probe options require a value.");
      options.settings[name] = Number(value);
    } else if (name === "aspect_ratio") options.settings.aspect_ratio = value;
    else if (name === "input-image") options.inputImage = value;
    else if (name === "image-transport") {
      if (value !== "data-url-array" && value !== "data-url-string") throw new Error("Unsupported image probe transport.");
      options.imageTransport = value;
    } else if (name === "model") options.model = value;
    else if (name === "prompt") options.prompt = value;
    else if (name === "output") options.output = value;
    else if (name === "timeout-ms") options.timeoutMs = Number(value);
    else throw new Error("Unsupported probe option.");
  }
  if (args.includes("--live") && args.includes("--dry-run")) throw new Error("Choose either --live or --dry-run.");
  if (!options.prompt.trim()) throw new Error("A non-empty prompt is required.");
  if (options.imageTransport && !options.inputImage) throw new Error("--image-transport requires --input-image.");
  if (options.inputImage !== undefined && !options.inputImage.trim()) throw new Error("A reference-image file path is required.");
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 2_147_483_647) {
    throw new Error("Invalid probe timeout.");
  }
  return options;
}

export function getImageProbeCapability(
  modelId: string,
  options?: Pick<ImageProbeOptions, "candidateDimensions" | "inputImage" | "imageTransport">,
): NimImageModelCapability {
  let capability = [...getAllNimImageCapabilities(), ...IMAGE_PROBE_CANDIDATES].find((c) => c.modelId === modelId);
  if (!capability) throw new Error("Model is not an approved image probe candidate (Kontext preset-only preview is excluded).");
  if ((options?.candidateDimensions || options?.inputImage) && modelId !== DEFAULT_NIM_IMAGE_MODEL_ID) {
    throw new Error("Resolution/reference-image candidate probes are currently scoped to Klein only.");
  }
  if (options?.candidateDimensions) {
    const pairs = [...KLEIN_MODEL_CARD_DIMENSION_PAIRS, ...KLEIN_PLAYGROUND_DIMENSION_PAIRS];
    capability = { ...capability, dimensionPairs: pairs,
      width: { allowed: [...new Set(pairs.map(([w]) => w))], default: 1024 },
      height: { allowed: [...new Set(pairs.map(([, h]) => h))], default: 1024 },
      evidence: { ...capability.evidence, notes: [...capability.evidence.notes,
        "Curated model-card/playground pairs: grid admission is established, but not every pair has successful decoded generation evidence."] },
    };
  }
  if (options?.inputImage) {
    capability = { ...capability, inputTransport: options.imageTransport ?? "data-url-array",
      imageInputLimits: { maxImages: 1, maxBytes: MAX_NIM_REFERENCE_IMAGE_BYTES, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
      allowedRequestFields: [...capability.allowedRequestFields, "image"],
      evidence: { ...capability.evidence, editingVerifiedAt: undefined,
        notes: [...capability.evidence.notes, "Unverified reference-image transport: opt-in probe only, never registered. Byte budget is local safety policy, not a NVIDIA limit."] },
    };
  }
  return capability;
}

/** Successful artifacts and decoding qualify generation, not semantic edit fidelity. */
export async function probeNimImage(
  options: ImageProbeOptions,
  dependencies: { apiKey?: string; fetch?: typeof fetch; decode?: ImageProbeDecoder; signal?: AbortSignal } = {},
) {
  const capability = getImageProbeCapability(options.model, options);
  const settings = resolveImageSettings(capability, options.settings);
  if (!settings.ok) throw new Error(settings.error);
  if (options.live && !dependencies.apiKey) throw new Error("NVIDIA_NIM_API_KEY or NVIDIA_API_KEY is required for --live.");
  if (options.live && !dependencies.decode) throw new Error("A pixel decoder is required before spending quota on --live.");
  const reference = options.inputImage
    ? await readNimReferenceImage(options.inputImage, process.cwd(), capability, dependencies.signal, true) : undefined;
  const input = [{ type: "text" as const, text: options.prompt }, ...(reference ? [reference] : [])];
  const resolution = resolveImageInputs(capability, input, true);
  if (!resolution.ok) throw new Error(resolution.error);
  const base = {
    operation: reference ? "edit" : "generate",
    ...(reference ? { referenceInput: { mimeType: reference.mimeType, bytes: Buffer.from(reference.data, "base64").length } } : {}),
    model: capability.modelId, endpoint: capability.endpoint,
    evidence: { ...capability.evidence, scope: "NVIDIA hosted preview", containerSchemaUsed: false },
    settings: settings.value,
  };
  if (!options.live) return { ...base, dryRun: true, requests: 0, generationVerified: false, editingSemanticsReviewed: false };
  let status: number | undefined;
  let requests = 0;
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const requestOptions: ImagesOptions = {
    apiKey: dependencies.apiKey, signal: dependencies.signal,
    fetch: (url, init) => { requests++; return fetchImpl(url, init); },
    timeoutMs: options.timeoutMs,
    metadata: options.settings, onResponse: (response) => { status = response.status; },
  };
  const model = {
    type: "image", id: capability.modelId, name: capability.name, api: "nvidia-nim-images",
    provider: "nvidia-nim", baseUrl: capability.endpoint, input: reference ? ["text", "image"] : ["text"], output: ["image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  } as ImageModel<string>;
  const started = Date.now();
  const run = await runNimImageGeneration(model, { input }, requestOptions, capability);
  const images = run.artifacts.map((artifact) => {
    let dimensions: ReturnType<ImageProbeDecoder>;
    try { dimensions = dependencies.decode!(artifact.bytes); } catch { /* Only safe metadata is reported. */ }
    const dimensionsMatch = dimensions !== undefined &&
      (settings.value.width === undefined || dimensions.width === settings.value.width) &&
      (settings.value.height === undefined || dimensions.height === settings.value.height);
    return { index: artifact.index, mimeType: artifact.mimeType, bytes: artifact.bytes.length, seed: artifact.seed,
      pixelDecoded: dimensions !== undefined, dimensions, dimensionsMatch };
  });
  const generationVerified = status === 200 && run.result.stopReason === "stop" &&
    images.length > 0 && images.every((image) => image.pixelDecoded && image.dimensionsMatch);
  return {
    ...base, dryRun: false, requests, observedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
    status, stopReason: run.result.stopReason, artifactCount: images.length, droppedCount: run.dropped.length,
    images, generationVerified,
    // A usable artifact does not establish semantic editing; review source/result separately.
    editingSemanticsReviewed: false,
    ...(run.result.errorMessage?.includes("example_id") ? { failureHints: ["PRESET_REFERENCE_HINT"] } : {}),
    // Never persist error details, prompts, keys, paths, response bodies, or image data.
    failureCategory: generationVerified ? undefined : run.result.stopReason === "stop" ? "DECODE_OR_DIMENSIONS"
      : run.result.stopReason === "aborted" ? "ABORTED"
      : run.result.errorMessage?.startsWith("Image generation timed out") ? "CLIENT_TIMEOUT"
      : status !== undefined && status >= 400 ? `HTTP_${status}`
      : status === 200 ? "UNUSABLE_RESPONSE" : "REQUEST_ERROR",
  };
}

export function writeImageProbeReport(path: string, report: unknown): string {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  return target;
}

export function loadPixelDecoder(): ImageProbeDecoder {
  const require = createRequire(process.env.PI_NODE_MODULES
    ? pathToFileURL(join(process.env.PI_NODE_MODULES, "image-probe.cjs")) : import.meta.url);
  let photon: any;
  try { photon = require("@silvia-odwyer/photon-node"); }
  catch { throw new Error("Install the optional Photon decoder or set PI_NODE_MODULES to Pi's node_modules directory."); }
  return (bytes) => {
    const image = photon.PhotonImage.new_from_byteslice(new Uint8Array(bytes));
    try { return { width: image.get_width(), height: image.get_height() }; }
    finally { image.free(); }
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Dry-run by default. Options: --live, --model=ID, --prompt=TEXT, --steps=N, --cfg_scale=N, --seed=N, --width=N, --height=N, --samples=N, --aspect_ratio=RATIO, --candidate-dimensions, --input-image=LOCAL_FILE, --image-transport=data-url-array|data-url-string, --timeout-ms=N, --output=NEW_FILE.json. Candidates never register models. Live uses one request, requires a pixel decoder, and never saves image bytes or raw errors.");
    return;
  }
  const options = parseImageProbeArgs(process.argv.slice(2));
  const report = await probeNimImage(options, options.live ? {
    apiKey: process.env.NVIDIA_NIM_API_KEY ?? process.env.NVIDIA_API_KEY,
    decode: loadPixelDecoder(),
  } : {});
  if (options.live || options.output) {
    const target = options.output ?? join("tools/output/images", `${options.model.replace(/[^a-zA-Z0-9-]/g, "-")}-${Date.now()}-${randomBytes(4).toString("hex")}.json`);
    console.log(`Evidence: ${writeImageProbeReport(target, report)}`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (options.live && !report.generationVerified) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error("Image probe failed. Check arguments, decoder, credentials, and output-file permissions; existing reports are never overwritten.");
    process.exitCode = 1;
  });
}
