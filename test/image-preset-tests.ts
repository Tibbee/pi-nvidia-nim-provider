// Offline regression for removed preset support: never silently generate instead.
import assert from "node:assert/strict";
import type { ImageModel, ImagesContext, ImagesOptions } from "@earendil-works/pi-ai";
import { FLUX_2_KLEIN_4B_CAPABILITY as cap, capabilityToModelConfig } from "../models/image-models";
import { resolveImageSettings, runNimImageGeneration, generateNimImages, buildImageRequest } from "../lib/nim-images";
import { NIM_IMAGE_TOOL, runNimImageTool } from "../handlers/image-tool";
import { JPEG_BYTES, PNG_BYTES } from "./fixtures/image-bytes";
import { getImageProbeCapability, parseImageProbeArgs, probeNimImage } from "../tools/probe_nim_images";

const model = { ...capabilityToModelConfig(cap), provider: "nvidia-nim" } as ImageModel<string>;
const input = [{ type: "text" as const, text: "p" }];
const calls: any[] = [];
const fetch = (async (_url: unknown, init?: RequestInit) => {
  calls.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ artifacts: [{ base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 42 }] }));
}) as typeof globalThis.fetch;
const ctx = { cwd: process.cwd(), modelRegistry: {
  getModelOfType: () => model,
  generateImages: (m: ImageModel<string>, c: ImagesContext, o?: ImagesOptions) => generateNimImages(m, c, { ...o, apiKey: "dummy", fetch }),
} };
assert.deepEqual(model.input, ["text"]);
assert.equal(Object.hasOwn(cap, "presetEditing"), false);
assert.equal(cap.allowedRequestFields.includes("image"), false);
assert.equal(Object.hasOwn((NIM_IMAGE_TOOL.parameters as any).properties, "preset_example"), false);
assert.doesNotMatch(NIM_IMAGE_TOOL.description!, /preset|predefined/i);
for (const candidate of [cap, getImageProbeCapability("black-forest-labs/flux.1-dev"), getImageProbeCapability("black-forest-labs/flux.1-schnell")]) {
  assert.equal(Object.hasOwn(candidate, "presetEditing"), false);
  for (const value of [0, 1, 3, -1, 0.5, "0", null, {}, NaN, Infinity]) {
    assert.equal(resolveImageSettings(candidate, { preset_example: value }).ok, false);
  }
}
for (const value of [0, 1, null]) {
  const native = await runNimImageGeneration(model, { input }, { apiKey: "dummy", fetch, metadata: { preset_example: value } });
  assert.equal(native.result.stopReason, "error");
  assert.match(native.result.errorMessage!, /Unsupported parameter `preset_example`/);
  await assert.rejects(runNimImageTool({ prompt: "p", preset_example: value } as any, ctx), /Unsupported parameter/);
}
await assert.rejects(runNimImageTool({ prompt: "p", preset_example: 0, inputImage: "missing-private-file" } as any, ctx), /Unsupported parameter/);
await assert.rejects(runNimImageTool({ prompt: "p", inputImage: "missing-private-file" }, ctx), /not supported/);
const block = { type: "image" as const, mimeType: "image/png", data: PNG_BYTES.toString("base64") };
assert.equal((await runNimImageGeneration(model, { input: [...input, block] }, { apiKey: "dummy", fetch })).result.stopReason, "error");
assert.equal((await runNimImageGeneration(model, { input }, { apiKey: "dummy", fetch, metadata: { image: "data:image/png;example_id,0" } })).result.stopReason, "error");
for (const flag of ["--preset_example=0", "--preset_example=1"]) {
  assert.throws(() => parseImageProbeArgs([flag]), /Unsupported probe option/);
  assert.throws(() => parseImageProbeArgs(["--live", flag]), /Unsupported probe option/);
}
await assert.rejects(probeNimImage({ ...parseImageProbeArgs([]), settings: { preset_example: 0 } }, { fetch }), /Unsupported parameter/);
assert.equal(calls.length, 0, "removed preset selectors and disabled uploads never dispatch");
const settings = resolveImageSettings(cap, { width: 1536, height: 864, seed: 42 });
assert.ok(settings.ok);
const payload = buildImageRequest(cap, "p", settings.value);
assert.equal(Object.hasOwn(payload, "image"), false);
assert.equal(Object.hasOwn(payload, "preset_example"), false);
const tool = await runNimImageTool({ prompt: "p", width: 1536, height: 864, seed: 42 }, ctx);
assert.equal(tool.isError, false);
assert.equal((tool.structuredContent as any).operation, "generate");
assert.equal(calls.length, 1);
assert.equal(calls[0].width, 1536);
assert.equal(calls[0].height, 864);
assert.equal(Object.hasOwn(calls[0], "image"), false);
console.log("image preset-removal tests passed");
