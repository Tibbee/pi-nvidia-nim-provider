// Two model choices share transport without sharing defaults, bounds or endpoints.
import assert from "node:assert/strict";
import { NIM_IMAGE_MODELS, DEFAULT_NIM_IMAGE_MODEL_ID } from "../models/image-models";
import { generateNimImages } from "../lib/nim-images";
import { NIM_IMAGE_TOOL, runNimImageTool } from "../handlers/image-tool";
import { handleBeforeProviderRequest } from "../index";
import { JPEG_BYTES } from "./fixtures/image-bytes";

const oldId = "black-forest-labs/flux.2-klein-4b";
assert.deepEqual((NIM_IMAGE_TOOL.parameters as any).properties.model.enum, [DEFAULT_NIM_IMAGE_MODEL_ID, oldId]);
const models = NIM_IMAGE_MODELS.map(m => ({ ...m, provider: "nvidia-nim" }));
const calls: Array<{ url: string; payload: any }> = [];
const fetch = (async (url: unknown, init?: RequestInit) => {
  calls.push({ url: String(url), payload: JSON.parse(String(init?.body)) });
  return new Response(JSON.stringify({ artifacts: [{ base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 42 }] }));
}) as typeof globalThis.fetch;
const ctx = { cwd: process.cwd(), modelRegistry: {
  getModelOfType: (_type: string, _provider: string, id: string) => models.find(m => m.id === id),
  generateImages: (m: any, c: any, o: any) => generateNimImages(m, c, { ...o, apiKey: "dummy", fetch }),
} };
const defaultResult = await runNimImageTool({ prompt: "p" }, ctx);
assert.equal(defaultResult.isError, false);
assert.equal((defaultResult.structuredContent as any).model, DEFAULT_NIM_IMAGE_MODEL_ID);
assert.equal(calls.at(-1)?.url, "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein");
assert.equal(calls.at(-1)?.payload.steps, 50);
assert.equal(calls.at(-1)?.payload.cfg_scale, 3.5);

const oldResult = await runNimImageTool({ model: oldId, prompt: "p".repeat(800) }, ctx);
assert.equal(oldResult.isError, false);
assert.equal((oldResult.structuredContent as any).model, oldId);
assert.equal(calls.at(-1)?.url, "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b");
assert.equal(calls.at(-1)?.payload.steps, 4);
assert.equal(calls.at(-1)?.payload.cfg_scale, 1);
for (const call of calls) for (const key of ["mode", "model", "aspect_ratio"]) assert.equal(key in call.payload, false);
const before = calls.length;
for (const params of [
  { model: oldId, prompt: "p".repeat(801) },
  { model: oldId, prompt: "p", steps: 50 },
  { model: oldId, prompt: "p", cfg_scale: 0 },
  { prompt: "p", cfg_scale: 1 },
  { model: "unknown", prompt: "p" },
]) await assert.rejects(runNimImageTool(params, ctx));
assert.equal(calls.length, before, "invalid settings never dispatch or fall back to a different model");
await runNimImageTool({ prompt: "p".repeat(2000) }, ctx);
assert.equal(calls.at(-1)?.payload.prompt.length, 2000, "FLUX.2's limit does not leak into FLUX 3");
for (const model of models) {
  assert.equal(handleBeforeProviderRequest({ payload: { model: model.id, prompt: "p" } }, { model: { provider: "nvidia-nim" } as any }), undefined);
}
const oldModel = models.find(m => m.id === oldId)!;
let failedCalls = 0;
const failed = await generateNimImages(oldModel as any, { input: [{ type: "text", text: "p" }] }, {
  apiKey: "dummy", fetch: (async () => { failedCalls++; return new Response("", { status: 503 }); }) as typeof fetch,
});
assert.equal(failed.stopReason, "error");
assert.equal(failedCalls, 1, "a failed old-model request is not retried through FLUX 3");
console.log("image model coexistence tests passed");
