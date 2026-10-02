// Advanced image-generation tool for the nvidia-nim provider.
//
// Pi's codemode `models.generateImages()` interface only accepts text/image
// input blocks, so this tool exposes the verified generation settings
// (width, height, seed, steps, cfg_scale) plus explicit file saving. It calls
// the SAME shared client as the native image adapter (lib/nim-images.ts) with
// pi's credential resolution — request logic is not duplicated.
//
// Saving is always explicit (opt-in via saveDir): images are written with
// their original encoded bytes, existing files are never overwritten, and the
// saved path is reported.

import { randomBytes } from "node:crypto";
import { readNimReferenceImage } from "../lib/image-input";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { AssistantImages, ImageModel, ImagesContext, ImagesOptions, ImagesOutputContent } from "@earendil-works/pi-ai";
import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import {
  MIME_EXTENSIONS,
  resolveImageSettings,
  resolveImagePrompt,
  getNimImageRunResult,
  type NimImageDroppedArtifact,
  type NimImageSettings,
} from "../lib/nim-images";
import {
  DEFAULT_NIM_IMAGE_MODEL_ID,
  NIM_IMAGE_MODEL_IDS,
  getNimImageCapability,
} from "../models/image-models";

export const NIM_IMAGE_TOOL_NAME = "nim-generate-image";

export type NimImageToolParams = {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  aspect_ratio?: string;
  inputImage?: string;
  preset_example?: number;
  seed?: number;
  steps?: number;
  cfg_scale?: number;
  saveDir?: string;
  fileName?: string;
};

export type NimImageToolImage = {
  index: number;
  mimeType: string;
  /** Original base64 exactly as returned by NVIDIA. */
  data: string;
  bytes: number;
  seed?: number;
  savedPath?: string;
};

export type NimImageToolDetails = {
  model: string;
  operation: "generate" | "edit";
  settings: NimImageSettings;
  stopReason: "stop" | "error" | "aborted";
  errorMessage?: string;
  images: Array<Omit<NimImageToolImage, "data">>;
  droppedArtifacts: NimImageDroppedArtifact[];
  savedPaths: string[];
  saveError?: string;
};

// Structural slice of ExtensionToolContext, so tests can pass a mock.
export interface NimImageToolContextLike {
  cwd: string;
  modelRegistry: {
    getModelOfType(type: "image", provider: string, modelId: string): unknown;
    generateImages(model: ImageModel<string>, context: ImagesContext, options?: ImagesOptions): Promise<AssistantImages>;
  };
}

const PARAMETERS = {
  type: "object",
  properties: {
    prompt: {
      type: "string",
      description: "Text prompt describing the image to generate or edit. Klein: non-empty, maximum 10,000 characters.",
    },
    model: {
      type: "string",
      description: `Image model ID (default: ${DEFAULT_NIM_IMAGE_MODEL_ID}).`,
    },
    width: {
      type: "integer",
      description: "Image width in pixels. Klein generation: 512-1568 inclusive, multiples of 16. Defaults to 1024; omit when using aspect_ratio. No rounding or resizing.",
    },
    height: {
      type: "integer",
      description: "Image height in pixels. Klein generation: 512-1568 inclusive, multiples of 16. Defaults to 1024; preset 0 remains restricted to 1024x1024.",
    },
    aspect_ratio: {
      type: "string",
      description: "Width:height ratio mapped locally to verified resolutions. Klein: 1:1 (1024x1024), 4:3 (1024x768), 16:9 landscape (1344x768), 9:16 portrait (768x1344), 21:9 (1568x672). Some ratios are approximate. Conflicting explicit dimensions are rejected.",
    },
    preset_example: {
      type: "integer",
      description: "Edit a verified NVIDIA predefined image instead of generating from text alone. Klein: only ID 0 (green frog), at 1024x1024, is verified. Not a file upload; conflicts with inputImage. Omit for generation.",
    },
    inputImage: {
      type: "string",
      description: "Local reference-image path relative to the session workspace, or absolute. Only accepted for models with verified editing transport. Current Klein hosted uploads were rejected with HTTP 422; arbitrary-file editing is disabled and fails locally without reading/uploading the file. No URLs or inline base64.",
    },
    seed: {
      type: "integer",
      description: "Sampling seed. Klein accepts 0-4294967295; omitted or 0 means random. Model bounds are validated locally.",
    },
    steps: {
      type: "integer",
      description: "Sampling steps, validated per model. Klein: documented range 1-4, default 4.",
    },
    cfg_scale: {
      type: "number",
      description:
        "Guidance scale. Must be >= 1: the live endpoint rejects 0 with HTTP 422 even though " +
        "the published schema says 0. Upper limit unverified. Default 1.",
    },
    saveDir: {
      type: "string",
      description:
        "Explicitly save the generated image(s) into this directory. Without this parameter nothing is written to disk.",
    },
    fileName: {
      type: "string",
      description:
        "File name within saveDir. Its extension is corrected to match the actual image format; multi-image suffixes precede the extension. Ignored without saveDir.",
    },
  },
  required: ["prompt"],
  additionalProperties: false,
} as unknown as TSchema;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    model: { type: "string" },
    operation: { type: "string", enum: ["generate", "edit"] },
    isError: { type: "boolean" },
    settings: { type: "object" },
    stopReason: { type: "string", enum: ["stop", "error", "aborted"] },
    errorMessage: { type: "string" },
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          mimeType: { type: "string" },
          data: { type: "string", description: "Base64 image data." },
          bytes: { type: "integer" },
          seed: { type: "integer" },
          savedPath: { type: "string" },
        },
        required: ["index", "mimeType", "data", "bytes"],
      },
    },
    droppedArtifacts: { type: "array", items: { type: "object" } },
    savedPaths: { type: "array", items: { type: "string" } },
    saveError: { type: "string" },
  },
  required: ["model", "isError", "stopReason", "images", "savedPaths"],
} as unknown as TSchema;

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return slug || "image";
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function extensionFor(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType] ?? "bin";
}

export function buildSaveFileName(
  params: { fileName?: string },
  prompt: string,
  mimeType: string,
  index: number,
  total: number,
  randomHex: string,
): string {
  const name = params.fileName ? basename(params.fileName) : `${slugify(prompt)}-${timestamp()}-${randomHex}`;
  const suppliedExtension = extname(name);
  const stem = suppliedExtension ? name.slice(0, -suppliedExtension.length) : name;
  const detectedExtension = extensionFor(mimeType);
  const extension = mimeType === "image/jpeg" && suppliedExtension.toLowerCase() === ".jpeg"
    ? "jpeg" : detectedExtension;
  return `${stem}${total > 1 ? `-${index + 1}` : ""}.${extension}`;
}

/**
 * Core tool execution. Exported separately from the ToolDefinition so tests
 * can drive it with a mock context. Saving never overwrites: files are
 * created with the exclusive `wx` flag and an existing target is an error.
 */
export async function runNimImageTool(
  params: NimImageToolParams,
  ctx: NimImageToolContextLike,
  signal?: AbortSignal,
): Promise<AgentToolResult<NimImageToolDetails | undefined>> {
  if (params.preset_example !== undefined && params.inputImage !== undefined) {
    throw new Error("preset_example conflicts with inputImage; presets are not file uploads.");
  }
  const modelId = params.model ?? DEFAULT_NIM_IMAGE_MODEL_ID;
  if (!NIM_IMAGE_MODEL_IDS.has(modelId)) {
    throw new Error(
      `Unknown image model "${modelId}". Available: ${Array.from(NIM_IMAGE_MODEL_IDS).join(", ")}.`,
    );
  }
  const capability = getNimImageCapability(modelId)!;
  const promptResolution = resolveImagePrompt(capability, [{ type: "text", text: params.prompt }]);
  if (!promptResolution.ok) throw new Error(promptResolution.error);

  const settingsResolution = resolveImageSettings(capability, {
    width: params.width,
    height: params.height,
    aspect_ratio: params.aspect_ratio,
    preset_example: params.preset_example,
    seed: params.seed,
    steps: params.steps,
    cfg_scale: params.cfg_scale,
  });
  if (!settingsResolution.ok) {
    throw new Error(settingsResolution.error);
  }
  const settings: NimImageSettings = settingsResolution.value;

  const model = ctx.modelRegistry.getModelOfType("image", "nvidia-nim", modelId) as
    | ImageModel<string>
    | undefined;
  if (!model) {
    throw new Error(`Image model "${modelId}" is not registered on the nvidia-nim provider.`);
  }

  const input: ImagesContext["input"] = [{ type: "text", text: promptResolution.value }];
  const operation = params.inputImage === undefined && params.preset_example === undefined ? "generate" : "edit";
  if (params.inputImage !== undefined) {
    input.push(await readNimReferenceImage(params.inputImage, ctx.cwd, capability, signal));
  }

  // Dispatch through Pi, not just its key getter: resolve model-aware auth,
  // configured headers, header-only credentials, and auth endpoint overrides.
  const result = await ctx.modelRegistry.generateImages(
    model,
    { input },
    { signal, metadata: { ...settings } },
  );
  const run = getNimImageRunResult(result);

  const images: NimImageToolImage[] = run.artifacts.map((artifact) => ({
    index: artifact.index,
    mimeType: artifact.mimeType,
    data: artifact.data,
    bytes: artifact.bytes.length,
    seed: artifact.seed,
  }));

  const savedPaths: string[] = [];
  let saveError: string | undefined;

  if (params.saveDir && run.artifacts.length > 0) {
    const saveDir = resolve(ctx.cwd, params.saveDir);
    let target = saveDir;
    try {
      // Directory creation can fail too. Preserve generated images and report
      // all filesystem failures as saveError instead of throwing them away.
      mkdirSync(saveDir, { recursive: true });
      const randomHex = randomBytes(4).toString("hex");
      for (const [ordinal, image] of images.entries()) {
        const name = buildSaveFileName(
          params,
          params.prompt,
          image.mimeType,
          ordinal,
          images.length,
          randomHex,
        );
        target = join(saveDir, name);
        if (existsSync(target)) {
          throw new Error(`refusing to overwrite existing file: ${target}`);
        }
        // Write the original encoded bytes; no re-encoding or transformation.
        writeFileSync(target, image.data, { encoding: "base64", flag: "wx" });
        image.savedPath = target;
        savedPaths.push(target);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      saveError = message.includes("refusing to overwrite")
        ? message
        : `failed to save ${target}: ${message}`;
    }
  }

  const details: NimImageToolDetails = {
    model: modelId,
    operation,
    settings,
    stopReason: run.result.stopReason,
    errorMessage: run.result.errorMessage,
    images: images.map(({ data: _data, ...rest }) => rest),
    droppedArtifacts: run.dropped,
    savedPaths,
    saveError,
  };

  const isError = run.result.stopReason !== "stop" || saveError !== undefined;
  const structuredContent = {
    model: modelId,
    operation,
    isError,
    settings: details.settings,
    stopReason: run.result.stopReason,
    ...(run.result.errorMessage ? { errorMessage: run.result.errorMessage } : {}),
    images,
    droppedArtifacts: run.dropped,
    savedPaths,
    ...(saveError ? { saveError } : {}),
  };

  const content: ImagesOutputContent[] = [];
  const settingsText = Object.entries(details.settings)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  if (run.result.stopReason === "stop") {
    content.push({
      type: "text",
      text:
        `${operation === "edit" ? "Edited" : "Generated"} ${images.length} image(s) with ${modelId} (${settingsText}).` +
        (savedPaths.length > 0 ? ` Saved to ${savedPaths.join(", ")}.` : " Not saved to disk."),
    });
  } else {
    content.push({
      type: "text",
      text: `Image ${operation === "edit" ? "editing" : "generation"} ${run.result.stopReason === "aborted" ? "aborted" : "failed"}: ${run.result.errorMessage ?? "unknown error"}`,
    });
  }
  if (run.dropped.length > 0) {
    content.push({ type: "text", text: `Dropped ${run.dropped.length} artifact(s): ${run.dropped.map(
      (artifact) => `artifact ${artifact.index + 1} (${artifact.reason})`,
    ).join(", ")}.` });
  }
  if (saveError) {
    content.push({ type: "text", text: `Save error: ${saveError}` });
  }
  for (const image of images) {
    content.push({ type: "image", mimeType: image.mimeType, data: image.data });
  }

  return {
    content,
    details,
    structuredContent,
    isError,
  };
}

export const NIM_IMAGE_TOOL: ToolDefinition = {
  name: NIM_IMAGE_TOOL_NAME,
  label: "NVIDIA NIM images",
  description:
    "Generate images or edit a verified NVIDIA preset with NVIDIA NIM (FLUX.2 Klein 4B). " +
    "Verified aspect_ratio values: 1:1 (1024x1024), 4:3 (1024x768), 16:9 landscape (1344x768), 9:16 portrait (768x1344), " +
    "21:9 (1568x672). Generation width and height independently accept 512-1568 inclusive in multiples of 16; no silent rounding/resizing. Not every combination has been generated; additional server constraints may apply. Steps 1-4 (default 4), cfg_scale >= 1 (default 1), " +
    "seed 0-4294967295 (0 or omitted = random), one image per call. preset_example: 0 edits NVIDIA's predefined green frog at 1024x1024; " +
    "omit for generation. Other preset IDs are unverified. inputImage uploads remain disabled for Klein and fail locally. Negative prompts and " +
    "output-format selection are not supported. Nothing is written to disk unless saveDir is given; " +
    "saving never overwrites existing files. Requires an NVIDIA API key for the nvidia-nim provider. " +
    "NVIDIA returns no usage or cost information for image generation.",
  parameters: PARAMETERS,
  outputSchema: OUTPUT_SCHEMA,
  exposure: "codemode",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  execute: async (toolCallId, params, signal, onUpdate, ctx) =>
    runNimImageTool(params as unknown as NimImageToolParams, ctx, signal),
};
