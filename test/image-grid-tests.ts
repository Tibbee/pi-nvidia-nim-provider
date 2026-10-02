// Offline regression: exercises every client-admitted combination, not live generation.
import assert from "node:assert/strict";
import type { ImageModel, ImagesContext, ImagesOptions } from "@earendil-works/pi-ai";
import { FLUX_2_KLEIN_4B_CAPABILITY as cap, capabilityToModelConfig } from "../models/image-models";
import { resolveImageSettings, generateNimImages, runNimImageGeneration } from "../lib/nim-images";
import { runNimImageTool } from "../handlers/image-tool";
import { getImageProbeCapability } from "../tools/probe_nim_images";
import { JPEG_BYTES } from "./fixtures/image-bytes";

const grid = Array.from({ length: 67 }, (_, i) => 512 + i * 16);
assert.deepEqual(cap.width, { min: 512, max: 1568, multipleOf: 16, default: 1024 });
assert.deepEqual(cap.height, cap.width);
assert.equal(cap.dimensionPairs, undefined);
for (const width of grid) for (const height of grid) {
  const resolution = resolveImageSettings(cap, { width, height });
  assert.ok(resolution.ok);
  assert.equal(resolution.value.width, width);
  assert.equal(resolution.value.height, height);
}
for (const field of ["width", "height"]) {
  for (const invalid of [0, -16, 496, 1584, 511, 513, 1000, 750, 1024.5, NaN, Infinity, "1024", true]) {
    assert.equal(resolveImageSettings(cap, { [field]: invalid }).ok, false);
  }
}
const defaults = resolveImageSettings(cap, {});
assert.ok(defaults.ok);
assert.equal(defaults.value.width, 1024);
assert.equal(defaults.value.height, 1024);
for (const [ratio, [width, height]] of Object.entries(cap.aspectRatios!)) {
  const result = resolveImageSettings(cap, { aspect_ratio: ratio });
  assert.ok(result.ok);
  assert.equal(result.value.width, width);
  assert.equal(result.value.height, height);
  assert.equal(resolveImageSettings(cap, { aspect_ratio: ratio, width: width === 512 ? 528 : 512 }).ok, false);
}
assert.equal(resolveImageSettings(cap, { preset_example: 0, width: 512, height: 512 }).ok, false);
for (const id of ["black-forest-labs/flux.1-dev", "black-forest-labs/flux.1-schnell"]) {
  assert.equal(resolveImageSettings(getImageProbeCapability(id), { width: 512 }).ok, false);
}
const model = { ...capabilityToModelConfig(cap), provider: "nvidia-nim" } as ImageModel<string>;
const calls: any[] = [];
const fetch = (async (_url: unknown, init?: RequestInit) => {
  calls.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ artifacts: [{ base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS" }] }));
}) as typeof globalThis.fetch;
const ctx = { cwd: process.cwd(), modelRegistry: {
  getModelOfType: () => model,
  generateImages: (m: ImageModel<string>, c: ImagesContext, o?: ImagesOptions) => generateNimImages(m, c, { ...o, apiKey: "dummy", fetch }),
} };
for (const [width, height] of [[512, 1568], [1568, 512], [1536, 864], [688, 1504]]) {
  const tool = await runNimImageTool({ prompt: "p", width, height }, ctx);
  assert.equal(tool.isError, false);
  assert.equal(calls.at(-1).width, width);
  assert.equal(calls.at(-1).height, height);
  for (const key of ["aspect_ratio", "mode", "resize_response_image"]) assert.equal(key in calls.at(-1), false);
}
const count = calls.length;
await assert.rejects(runNimImageTool({ prompt: "p", width: 1000 }, ctx), /multiple of 16/);
await assert.rejects(runNimImageTool({ prompt: "p", height: 1584 }, ctx), /between/);
assert.equal(calls.length, count, "invalid dimensions never dispatch");
const failed = await runNimImageGeneration(model, { input: [{ type: "text", text: "p" }] }, {
  apiKey: "dummy", metadata: { width: 1568, height: 1568 },
  fetch: (async () => new Response(JSON.stringify({ detail: "Combination not supported" }), { status: 422 })) as typeof globalThis.fetch,
});
assert.equal(failed.result.stopReason, "error");
assert.match(failed.result.errorMessage!, /HTTP 422/);
console.log("image grid tests passed");
