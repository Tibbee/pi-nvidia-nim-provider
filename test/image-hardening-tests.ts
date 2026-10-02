import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ImageModel, ImagesContext, ImagesOptions } from "@earendil-works/pi-ai";
import { JPEG_BYTES, PNG_BYTES, WEBP_BYTES } from "./fixtures/image-bytes";
import {
  runNimImageGeneration, generateNimImages, resolveImageSettings, resolveImagePrompt,
  buildImageRequest, decodeImageBase64, hasCompleteImageStructure,
} from "../lib/nim-images";
import { FLUX_2_KLEIN_4B_CAPABILITY as klein, capabilityToModelConfig, NIM_IMAGE_MODELS } from "../models/image-models";
import { buildSaveFileName, runNimImageTool, NIM_IMAGE_TOOL } from "../handlers/image-tool";

const model = { ...capabilityToModelConfig(klein), provider: "nvidia-nim" } as ImageModel<string>;
const input = { input: [{ type: "text" as const, text: "p" }] };
const good = { base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 42 };
const respond = (body: unknown) => async () => new Response(JSON.stringify(body));
const run = (body: unknown, options?: ImagesOptions) => runNimImageGeneration(model, input, {
  apiKey: "test-key", fetch: respond(body) as typeof fetch, ...options,
});

// Independent malformed siblings never erase successes, regardless of their order.
for (const artifacts of [[good, null, 3, [], {}, "bad"], [null, good]]) {
  const result = await run({ artifacts });
  assert.equal(result.result.stopReason, "stop");
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.result.output.filter((b) => b.type === "image").length, 1);
  assert.equal(result.dropped.length, artifacts.length - 1);
}
for (const body of [null, false, [], { artifacts: [null, 1, {}] }]) {
  assert.equal((await run(body)).result.stopReason, "error");
}
for (const data of ["!!!" + good.base64, good.base64 + "\n", "AAAA===", "A", "AB=="]) {
  assert.equal(decodeImageBase64(data), undefined);
  assert.equal((await run({ artifacts: [{ ...good, base64: data }] })).artifacts.length, 0);
}
assert.ok(decodeImageBase64(good.base64.replace(/=+$/, "")), "canonical unpadded base64 works");
for (const [bytes, mime] of [[JPEG_BYTES, "image/jpeg"], [PNG_BYTES, "image/png"], [WEBP_BYTES, "image/webp"]] as const) {
  assert.equal(hasCompleteImageStructure(bytes, mime), true);
  for (const truncated of [bytes.subarray(0, 8), bytes.subarray(0, bytes.length - 1)]) {
    assert.equal(hasCompleteImageStructure(truncated, mime), false);
    assert.equal((await run({ artifacts: [{ ...good, base64: truncated.toString("base64") }] })).artifacts.length, 0);
  }
}
assert.equal((await run({ artifacts: [{ base64: good.base64 }] })).artifacts.length, 0, "SUCCESS is required");
const restricted = await runNimImageGeneration(model, input, { apiKey: "test-key", fetch: respond({ artifacts: [good] }) as typeof fetch }, {
  ...klein, sniffableMimeTypes: ["image/png"],
});
assert.equal(restricted.artifacts.length, 0, "per-model MIME allowlist is enforced");

// Explicit null never means omitted, including native untyped metadata and ratios.
let nullRequests = 0;
for (const key of ["width", "height", "seed", "steps", "samples", "cfg_scale", "aspect_ratio", "preset_example", "mode", "unknown"]) {
  assert.equal(resolveImageSettings(klein, { [key]: null }).ok, false, `${key}: null rejected locally`);
  const rejected = await run({ artifacts: [good] }, { metadata: { [key]: null }, fetch: (async () => {
    nullRequests++;
    return new Response(JSON.stringify({ artifacts: [good] }));
  }) as typeof fetch });
  assert.equal(rejected.result.stopReason, "error", `${key}: native request fails`);
}
assert.equal(nullRequests, 0, "null settings never consume quota");
for (const field of ["width", "height"]) {
  assert.equal(resolveImageSettings(klein, { aspect_ratio: "16:9", [field]: null }).ok, false);
}
assert.equal(resolveImageSettings(klein, { width: undefined, aspect_ratio: undefined }).ok, true);

// Declared runtime baseline and docs must agree; comparison counts are historical.
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
for (const name of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent"]) {
  assert.equal(pkg.peerDependencies[name], ">=1.0.0");
}
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
assert.match(readme, /Requires Pi 1\.0\.0 or later/);
assert.match(readme, /historical comparison snapshot/i);
assert.doesNotMatch(readme, /All cost fields are.*because NVIDIA NIM is free tier/);
assert.deepEqual(capabilityToModelConfig(klein).output, ["image"], "Klein is not a text-generating model");

// All capability defaults and bounds are model-specific, including exclusive limits.
assert.equal(resolveImageSettings(klein, { seed: 4_294_967_295 }).ok, true);
for (const seed of [-1, 4_294_967_296, 1.1, NaN, Infinity]) assert.equal(resolveImageSettings(klein, { seed }).ok, false);
assert.equal(klein.cfgScale.max, undefined, "unknown guidance maximum remains unknown");
assert.equal(resolveImageSettings(klein, { cfg_scale: 100 }).ok, true);
const schnell = { ...klein, modelId: "test/schnell", name: "Synthetic Schnell", cfgScale: { min: 0, max: 0, default: 0 } };
assert.equal(resolveImageSettings(schnell, { cfg_scale: 0 }).ok, true);
assert.equal(resolveImageSettings(schnell, { cfg_scale: 1 }).ok, false);
assert.equal(capabilityToModelConfig(schnell).name, "Synthetic Schnell");
const dev = { ...klein, modelId: "test/dev", steps: { min: 5, max: 100, default: 50 }, cfgScale: { exclusiveMinimum: 1, max: 9, default: 5 } };
assert.equal(resolveImageSettings(dev, { steps: 50, cfg_scale: 1 }).ok, false);
assert.equal(resolveImageSettings(dev, { steps: 50, cfg_scale: 1.01 }).ok, true);
const enumerated = { ...dev, steps: { allowed: [10, 20, 30], default: 20 } };
assert.equal(resolveImageSettings(enumerated, { steps: 25 }).ok, false);
const rangeDimensions = { ...dev, width: { min: 512, max: 1024, multipleOf: 64, default: 512 },
  height: { min: 512, max: 1024, default: 1024 }, dimensionPairs: [[512, 1024], [1024, 512]] as const };
assert.equal(resolveImageSettings(rangeDimensions, {}).ok, true);
assert.equal(resolveImageSettings(rangeDimensions, { width: 513 }).ok, false);
assert.equal(resolveImageSettings(rangeDimensions, { width: 1024 }).ok, false);
const optional = { ...schnell, allowedRequestFields: ["prompt", "steps"] };
const settings = resolveImageSettings(optional, {});
assert.ok(settings.ok);
assert.deepEqual(buildImageRequest(optional, "p", settings.value), { prompt: "p", steps: 4 });
assert.equal(resolveImageSettings({ ...optional, requiredRequestFields: ["seed"] }, {}).ok, false);
assert.equal(resolveImageSettings({ ...dev, cfgScale: { min: 0, max: 0, default: 1 } }, {}).ok, false, "bad defaults fail locally");
for (const inputTransport of ["base64", "asset-id", "preset-only"] as const) {
  const capability = { ...klein, inputTransport };
  assert.equal(resolveImagePrompt(capability, input.input).ok, false);
  assert.throws(() => capabilityToModelConfig(capability), /not implemented/);
}
assert.equal(NIM_IMAGE_MODELS.length, 1, "synthetic and unverified candidates are never registered");
const schema = NIM_IMAGE_TOOL.parameters as any;
assert.equal(schema.properties.cfg_scale.minimum, undefined, "tool schema must not block Schnell");
assert.equal(schema.properties.steps.maximum, undefined, "tool schema must not block Dev");

// Case-insensitive merging includes suppression of defaults and avoids duplicates.
let sentHeaders: Headers | undefined;
const captureFetch = (async (_url: unknown, init?: RequestInit) => {
  sentHeaders = new Headers(init?.headers);
  assert.equal(Object.keys(init?.headers as object).filter((k) => k.toLowerCase() === "authorization").length, 1);
  return new Response(JSON.stringify({ artifacts: [good] }));
}) as typeof fetch;
await run({ artifacts: [good] }, { fetch: captureFetch, headers: { authorization: "Custom test", ACCEPT: "image/*" } });
assert.equal(sentHeaders!.get("authorization"), "Custom test");
assert.equal(sentHeaders!.get("accept"), "image/*");
await run({ artifacts: [good] }, { fetch: (async (_url, init) => {
  assert.equal(new Headers(init?.headers).get("authorization"), null);
  return new Response(JSON.stringify({ artifacts: [good] }));
}) as typeof fetch, headers: { authorization: null } });

// Timeout/cancellation races settle even for non-cooperative hooks/fetch/body readers.
const never = () => new Promise<never>(() => {});
async function settles<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("operation did not settle")), 500);
    })]);
  } finally { clearTimeout(timer!); }
}
let requests = 0;
const countedFetch = (async () => { requests++; return new Response(JSON.stringify({ artifacts: [good] })); }) as typeof fetch;
for (const options of [{ onPayload: never, fetch: countedFetch }, { onResponse: never }, { fetch: never as typeof fetch }, {
  fetch: (async () => new Response(new ReadableStream({ start() {} }))) as typeof fetch,
}]) {
  const result = await settles(run({ artifacts: [good] }, { ...options, timeoutMs: 10 }));
  assert.match(result.result.errorMessage!, /timed out after 10 ms/);
}
assert.equal(requests, 0, "stalled payload hook never consumes quota");
for (const hook of ["onPayload", "onResponse"] as const) {
  const controller = new AbortController();
  const resultPromise = run({ artifacts: [good] }, { [hook]: never, signal: controller.signal });
  const abortTimer = setTimeout(() => controller.abort(), 10);
  const result = await settles(resultPromise);
  clearTimeout(abortTimer);
  assert.equal(result.result.stopReason, "aborted");
}
for (const timeoutMs of [NaN, Infinity, 0, -1, 1.5, 2_147_483_648]) {
  assert.match((await run({ artifacts: [good] }, { timeoutMs })).result.errorMessage!, /timeoutMs/);
}
let rejectLate: (error: Error) => void;
const late = new Promise<never>((_, reject) => { rejectLate = reject; });
await settles(run({ artifacts: [good] }, { timeoutMs: 10, onPayload: () => late }));
rejectLate!(new Error("late rejection is handled"));
await new Promise((resolve) => setTimeout(resolve, 0));

// Filenames always reflect actual format; numbered suffix precedes extension.
assert.equal(buildSaveFileName({ fileName: "shot.jpg" }, "p", "image/jpeg", 0, 2, "abc"), "shot-1.jpg");
assert.equal(buildSaveFileName({ fileName: "shot.png" }, "p", "image/jpeg", 1, 2, "abc"), "shot-2.jpg");
assert.equal(buildSaveFileName({ fileName: "shot.jpeg" }, "p", "image/jpeg", 0, 1, "abc"), "shot.jpeg");
assert.equal(buildSaveFileName({ fileName: "../shot.png" }, "p", "image/webp", 0, 1, "abc"), "shot.webp");

// Tool calls runtime dispatch, retaining adapter detail per concurrent result.
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = respond({ artifacts: [good, null] }) as typeof fetch;
  let dispatches = 0;
  const ctx = { cwd: process.cwd(), modelRegistry: {
    getModelOfType: () => model,
    generateImages: async (m: ImageModel<string>, c: ImagesContext, options?: ImagesOptions) => {
      dispatches++;
      return generateNimImages({ ...m, baseUrl: "https://proxy.example.test/images" }, c, {
        ...options, apiKey: undefined, headers: { "X-Api-Key": "dummy" },
      });
    },
  } };
  const results = await Promise.all([runNimImageTool({ prompt: "a" }, ctx), runNimImageTool({ prompt: "b" }, ctx)]);
  assert.equal(dispatches, 2);
  for (const result of results) {
    assert.equal(result.isError, false);
    assert.equal((result.structuredContent as any).images[0].seed, 42);
    assert.equal((result.structuredContent as any).droppedArtifacts.length, 1);
    assert.ok(result.content.some((b) => b.type === "text" && b.text.includes("Dropped 1")));
  }
} finally { globalThis.fetch = originalFetch; }

// Number saved successes contiguously, but retain the original artifact indices.
const saveDir = mkdtempSync(join(tmpdir(), "nim-sibling-save-"));
try {
  const ctx = { cwd: saveDir, modelRegistry: {
    getModelOfType: () => model,
    generateImages: (m: ImageModel<string>, c: ImagesContext, options?: ImagesOptions) => generateNimImages(m, c, {
      ...options, apiKey: "dummy", fetch: respond({ artifacts: [good, null, { ...good, seed: 84 }] }) as typeof fetch,
    }),
  } };
  const tool = await runNimImageTool({ prompt: "p", saveDir, fileName: "shot.jpg" }, ctx);
  const details = tool.structuredContent as any;
  assert.equal(tool.isError, false);
  assert.deepEqual(details.savedPaths.map((p: string) => basename(p)), ["shot-1.jpg", "shot-2.jpg"]);
  assert.deepEqual(details.images.map((i: any) => i.index), [0, 2]);
  assert.deepEqual(details.images.map((i: any) => i.seed), [42, 84]);
  assert.equal(details.droppedArtifacts.length, 1);
  for (const path of details.savedPaths) assert.deepEqual(readFileSync(path), JPEG_BYTES);
} finally { rmSync(saveDir, { recursive: true, force: true }); }
console.log("image hardening tests passed");
