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
import { MAX_LAYOUT_ELEMENTS, type NimImageLayoutElement } from "../lib/image-layout";
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
  layout?: NimImageLayoutElement[];
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
  promptLayout?: { format: "bfl-caption-json"; elementCount: number };
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
      description: "Text prompt describing the image to generate. Non-empty; FLUX 3 maximum 2,000 characters, FLUX.2 maximum 800 per current hosted validation.",
    },
    model: {
      type: "string",
      enum: Array.from(NIM_IMAGE_MODEL_IDS),
      description: `Image model ID. Omit for ${DEFAULT_NIM_IMAGE_MODEL_ID}; select black-forest-labs/flux.2-klein-4b for FLUX.2. Each model uses its own defaults and validation; no automatic model fallback.`,
    },
    width: {
      type: "integer",
      description: "Image width in pixels. Both Klein models: 512-1568 inclusive, multiples of 16, and width*height <=1062400 pixels. Defaults to 1024; omit when using aspect_ratio. No rounding or resizing.",
    },
    height: {
      type: "integer",
      description: "Image height in pixels. Both Klein models: 512-1568 inclusive, multiples of 16, and width*height <=1062400 pixels. Defaults to 1024; omit when using aspect_ratio.",
    },
    aspect_ratio: {
      type: "string",
      description: "Width:height ratio mapped locally to the hosted dimension grid. FLUX 3: 1:1 (1024x1024), 4:3 (1024x768), 16:9 landscape (1344x768), 9:16 portrait (768x1344), 21:9 (1568x672). Some ratios are approximate. Conflicting explicit dimensions are rejected.",
    },
    inputImage: {
      type: "string",
      description: "Local reference-image path relative to the session workspace, or absolute. Both registered Klein hosted previews have no verified arbitrary-image editing; inputImage is disabled and fails locally without reading/uploading the file. No URLs or inline base64.",
    },
    layout: {
      type: "array", minItems: 1, maxItems: MAX_LAYOUT_ELEMENTS,
      description: "FLUX 3 only: optional approximate layout guidance. Name every element in prompt as <id>. Rows compile to JSON inside prompt, never a provider body field. bbox is [top,left,bottom,right] in 0-1000 coordinates. Placement and shapes are not guaranteed; this is not a mask. Caption plus rows must fit the 2000-character prompt limit. Maximum 20 rows is a local tool limit.",
      items: {
        type: "object", additionalProperties: false, required: ["id", "bbox", "desc"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9_]{0,63}$", description: "Unique lowercase identifier also named in prompt as <id>." },
          bbox: { type: "array", minItems: 4, maxItems: 4, items: { type: "integer", minimum: 0, maximum: 1000 }, description: "[top,left,bottom,right]; top < bottom, left < right." },
          desc: { type: "string", minLength: 1, description: "Appearance of this element; preserved verbatim in the compiled prompt." },
        },
      },
    },
    seed: {
      type: "integer",
      description: "Sampling seed. Klein accepts 0-4294967295; omitted or 0 means random. Model bounds are validated locally.",
    },
    steps: {
      type: "integer",
      description: "Sampling steps, validated per model. FLUX 3: 1-50, default 50. FLUX.2: 1-4, default 4. Omit to use the selected model's default.",
    },
    cfg_scale: {
      type: "number",
      description:
        "Guidance scale. FLUX 3: >1 through 20, default 3.5 (schema bounds). FLUX.2: >=1, default 1, upper bound unknown. Omit to use the selected model's default. Both defaults tested live.",
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
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    model: { type: "string" },
    operation: { type: "string", enum: ["generate", "edit"] },
    isError: { type: "boolean" },
    settings: { type: "object" },
    promptLayout: { type: "object", properties: { format: { type: "string" }, elementCount: { type: "integer" } } },
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
  // Direct callers must fail closed too, rather than silently ignoring removed settings.
  for (const key of Object.keys(params)) {
    if (!Object.hasOwn(PARAMETERS.properties, key)) throw new Error(`Unsupported parameter \`${key}\`.`);
  }
  const modelId = params.model ?? DEFAULT_NIM_IMAGE_MODEL_ID;
  if (!NIM_IMAGE_MODEL_IDS.has(modelId)) {
    throw new Error(
      `Unknown image model "${modelId}". Available: ${Array.from(NIM_IMAGE_MODEL_IDS).join(", ")}.`,
    );
  }
  const capability = getNimImageCapability(modelId)!;
  const promptResolution = resolveImagePrompt(capability, [{ type: "text", text: params.prompt }], params.layout);
  if (!promptResolution.ok) throw new Error(promptResolution.error);

  const settingsResolution = resolveImageSettings(capability, {
    width: params.width,
    height: params.height,
    aspect_ratio: params.aspect_ratio,
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

  // Layout is validated above, then compiled exactly once by the shared adapter
  // from metadata. Retain the original caption here for native/tool parity.
  const input: ImagesContext["input"] = [{ type: "text", text: params.prompt.trim() }];
  const operation = params.inputImage === undefined ? "generate" : "edit";
  if (params.inputImage !== undefined) {
    input.push(await readNimReferenceImage(params.inputImage, ctx.cwd, capability, signal));
  }

  // Dispatch through Pi, not just its key getter: resolve model-aware auth,
  // configured headers, header-only credentials, and auth endpoint overrides.
  const result = await ctx.modelRegistry.generateImages(
    model,
    { input },
    { signal, metadata: { ...settings, ...(params.layout !== undefined ? { layout: params.layout } : {}) } },
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
    ...(params.layout ? { promptLayout: { format: "bfl-caption-json" as const, elementCount: params.layout.length } } : {}),
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
    ...(details.promptLayout ? { promptLayout: details.promptLayout } : {}),
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
        (params.layout ? ` Requested approximate layout guidance for ${params.layout.length} element(s).` : "") +
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
    "Generate images with NVIDIA NIM. FLUX 3 Image Klein is the default; optionally select black-forest-labs/flux.2-klein-4b. Settings/defaults are resolved independently for the selected model; no automatic model fallback. " +
    "Available aspect_ratio mappings: 1:1 (1024x1024), 4:3 (1024x768), 16:9 landscape (1344x768), 9:16 portrait (768x1344), " +
    "21:9 (1568x672). Both models: each dimension 512-1568 in multiples of 16 AND width*height <=1062400 pixels; no rounding/resizing. Square and 800x1328 boundary outputs were pixel-verified for both. Not every combination has been generated. FLUX 3 supports optional layout rows {id,bbox,desc} compiled into prompt; caption must name each <id>. This is approximate positioning, not a mask or exact shape guarantee. FLUX.2 layout swaps were unreliable and its structured layout is disabled. FLUX 3: prompt including layout maximum 2000 characters, steps 1-50/default 50, cfg_scale >1 through 20/default 3.5. FLUX.2: prompt maximum 800 characters, steps 1-4/default 4, cfg_scale >=1/default 1 (upper bound unknown). " +
    "seed 0-4294967295 (0 or omitted = random), one image per call. inputImage uploads remain disabled for Klein and fail locally. Negative prompts and " +
    "output-format selection are not supported. Nothing is written to disk unless saveDir is given; " +
    "saving never overwrites existing files. Requires an NVIDIA API key for the nvidia-nim provider. " +
    "NVIDIA returns no usage or cost information for image generation.",
  parameters: PARAMETERS as unknown as TSchema,
  outputSchema: OUTPUT_SCHEMA,
  // Deferred: callable from codemode scripts and discoverable via
  // searchTools()/describeTool()/ALL_TOOLS, but not listed in the codemode
  // description. tool_search or explicit activation can declare it.
  exposure: "deferred",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  execute: async (toolCallId, params, signal, onUpdate, ctx) =>
    runNimImageTool(params as unknown as NimImageToolParams, ctx, signal),
};
