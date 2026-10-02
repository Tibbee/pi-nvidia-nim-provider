// Offline regression suite: no real credentials or live network calls.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImageModel, ImagesContext, ImagesOptions } from "@earendil-works/pi-ai";
import { JPEG_BYTES, PNG_BYTES, WEBP_BYTES } from "./fixtures/image-bytes";
import {
  FLUX_2_KLEIN_4B_CAPABILITY as klein, NIM_IMAGE_MODELS, capabilityToModelConfig,
  getNimImageEditingError, type NimImageModelCapability,
} from "../models/image-models";
import { resolveImageSettings, resolveImageInputs, buildImageRequest, runNimImageGeneration, generateNimImages } from "../lib/nim-images";
import { readNimReferenceImage, validateNimReferenceImage, MAX_NIM_REFERENCE_IMAGE_BYTES } from "../lib/image-input";
import { runNimImageTool, NIM_IMAGE_TOOL } from "../handlers/image-tool";
import { getImageProbeCapability, parseImageProbeArgs, probeNimImage } from "../tools/probe_nim_images";
import { KLEIN_MODEL_CARD_DIMENSION_PAIRS } from "../tools/image-probe-candidates";

const prompt = { type: "text" as const, text: "p" };
const block = { type: "image" as const, data: PNG_BYTES.toString("base64"), mimeType: "image/png" };
const success = { artifacts: [{ base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 42 }] };
const model = { ...capabilityToModelConfig(klein), provider: "nvidia-nim" } as ImageModel<string>;
const originalFetch = globalThis.fetch;
let requests = 0;
const calls: Array<{ url: string; body: any; headers: Headers }> = [];
const mockFetch = (async (url: unknown, init?: RequestInit) => {
  requests++;
  calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
  return new Response(JSON.stringify(success));
}) as typeof fetch;
const dir = mkdtempSync(join(tmpdir(), "nim-aspect-edit-"));
try {
  globalThis.fetch = mockFetch;
  for (const [ratio, pair] of Object.entries(klein.aspectRatios!)) {
    const settings = resolveImageSettings(klein, { aspect_ratio: ratio, seed: 42 });
    assert.ok(settings.ok);
    assert.deepEqual([settings.value.width, settings.value.height], pair);
    const payload = buildImageRequest(klein, "p", settings.value);
    for (const key of ["aspect_ratio", "ratio", "mode", "model", "image"]) assert.equal(key in payload, false);
    assert.ok(resolveImageSettings(klein, { aspect_ratio: ratio, width: pair[0], height: pair[1] }).ok);
  }
  for (const ratio of ["3:4", "toString", "__proto__", "", 16, {}]) assert.equal(resolveImageSettings(klein, { aspect_ratio: ratio }).ok, false);
  assert.equal(resolveImageSettings(klein, { aspect_ratio: "16:9", width: 768 }).ok, false);
  assert.equal(resolveImageSettings(klein, { aspect_ratio: "16:9", height: 1024 }).ok, false);
  assert.equal(resolveImageSettings(klein, { width: 1344, height: 1344 }).ok, true);
  assert.equal(resolveImageSettings(klein, { width: 688, height: 1504 }).ok, true, "hosted grid validation admits this size independently of model-card presets");
  assert.deepEqual(resolveImageSettings(klein, {}).ok && [klein.width.default, klein.height.default], [1024, 1024]);
  assert.equal(resolveImageInputs(klein, [{ type: "text", text: "p".repeat(10_001) }]).ok, false);
  assert.equal(resolveImageInputs(klein, [{ type: "text", text: "p".repeat(10_000) }]).ok, true);
  assert.equal(resolveImageInputs(klein, [{ type: "text", text: "🌲".repeat(10_000) }]).ok, true);
  assert.equal(resolveImageInputs(klein, [{ type: "text", text: "🌲".repeat(10_001) }]).ok, false);

  const ctx = { cwd: dir, modelRegistry: {
    getModelOfType: () => model,
    generateImages: (m: ImageModel<string>, c: ImagesContext, o?: ImagesOptions) => generateNimImages(m, c, { ...o, apiKey: "dummy" }),
  } };
  const tool = await runNimImageTool({ prompt: "p", aspect_ratio: "16:9" }, ctx);
  assert.equal(tool.isError, false);
  assert.equal((tool.structuredContent as any).operation, "generate");
  assert.equal(calls.at(-1)!.body.width, 1344);
  assert.equal(calls.at(-1)!.body.height, 768);
  assert.equal("aspect_ratio" in calls.at(-1)!.body, false);
  const before = requests;
  await assert.rejects(runNimImageTool({ prompt: "p", aspect_ratio: "16:9", width: 768 }, ctx), /conflicts/);
  await assert.rejects(runNimImageTool({ prompt: "p", inputImage: "missing-private-file.jpg" }, ctx), /editing.*not supported/);
  assert.equal(requests, before, "unsupported editing and conflicting settings consume no quota");
  assert.deepEqual(NIM_IMAGE_MODELS[0].input, ["text"], "Klein does not falsely advertise editing");
  assert.equal(klein.evidence.editingVerifiedAt, undefined);
  assert.ok((NIM_IMAGE_TOOL.parameters as any).properties.inputImage.description.includes("disabled"));

  const editing: NimImageModelCapability = {
    ...klein, inputTransport: "data-url-array", allowedRequestFields: [...klein.allowedRequestFields, "image"],
    imageInputLimits: { maxImages: 1, maxBytes: 4096, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
    evidence: { ...klein.evidence, editingVerifiedAt: "synthetic-offline-test-only" },
  };
  assert.deepEqual(capabilityToModelConfig(editing).input, ["text", "image"]);
  assert.throws(() => capabilityToModelConfig({ ...editing, evidence: { ...editing.evidence, editingVerifiedAt: undefined } }), /not verified/);
  assert.throws(() => capabilityToModelConfig({ ...editing, imageInputLimits: undefined }), /not verified/);
  assert.throws(() => capabilityToModelConfig({ ...editing, imageInputLimits: { ...editing.imageInputLimits!, mimeTypes: ["image/gif"] } }), /not verified/);
  assert.throws(() => capabilityToModelConfig({ ...editing, inputTransport: "data-url-string", imageInputLimits: { ...editing.imageInputLimits!, maxImages: 2 } }), /not verified/);
  assert.equal(getNimImageEditingError(editing), undefined);
  const input = resolveImageInputs(editing, [prompt, block]);
  assert.ok(input.ok);
  const settings = resolveImageSettings(editing, {});
  assert.ok(settings.ok);
  const payload = buildImageRequest(editing, input.value.prompt, settings.value, input.value.images);
  assert.deepEqual(payload.image, [`data:image/png;base64,${block.data}`]);
  assert.equal("mode" in payload, false);
  const stringEditing = { ...editing, inputTransport: "data-url-string" as const };
  assert.equal(buildImageRequest(stringEditing, "p", settings.value, input.value.images).image, `data:image/png;base64,${block.data}`);
  assert.equal("image" in buildImageRequest(editing, "p", settings.value), false, "generation still works on an edit-capable model");
  assert.equal(resolveImageInputs(editing, [prompt, block, block]).ok, false);
  assert.equal(resolveImageInputs(editing, [prompt, { ...block, mimeType: "image/jpeg" }]).ok, false);
  assert.equal(resolveImageInputs(editing, [prompt, { ...block, data: "!!!" }]).ok, false);
  assert.equal(resolveImageInputs(editing, [prompt, { ...block, data: PNG_BYTES.subarray(0, 20).toString("base64") }]).ok, false);
  assert.equal(resolveImageInputs({ ...editing, imageInputLimits: { ...editing.imageInputLimits!, maxBytes: 10 } }, [prompt, block]).ok, false);
  for (const [bytes, mimeType] of [[JPEG_BYTES, "image/jpeg"], [PNG_BYTES, "image/png"], [WEBP_BYTES, "image/webp"]] as const) {
    assert.equal(validateNimReferenceImage({ type: "image", data: bytes.toString("base64"), mimeType }, editing), undefined);
  }

  const source = join(dir, "reference.wrong-extension");
  writeFileSync(source, new Uint8Array(PNG_BYTES));
  const loaded = await readNimReferenceImage("reference.wrong-extension", dir, editing);
  assert.deepEqual(loaded, block);
  for (const path of ["https://example.test/private.png", "file:///private.png", "data:image/png;base64,AAAA", ""]) {
    await assert.rejects(readNimReferenceImage(path, dir, editing), /local file path/);
  }
  await assert.rejects(readNimReferenceImage(dir, dir, editing), /regular file/);
  const oversized = join(dir, "large.bin");
  writeFileSync(oversized, new Uint8Array(4097));
  await assert.rejects(readNimReferenceImage(oversized, dir, editing), /byte limit/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readNimReferenceImage(source, dir, editing, controller.signal), /abort/i);
  assert.equal(MAX_NIM_REFERENCE_IMAGE_BYTES, 10 * 1024 * 1024);

  const native = await runNimImageGeneration(model, { input: [prompt, loaded] }, { apiKey: "dummy", fetch: mockFetch }, editing);
  assert.equal(native.result.stopReason, "stop");
  assert.deepEqual(calls.at(-1)!.body.image, [`data:image/png;base64,${block.data}`]);
  assert.equal(calls.at(-1)!.headers.get("authorization"), "Bearer dummy");
  assert.deepEqual(readFileSync(source), PNG_BYTES, "reference source remains unchanged");
  const beforeRejectedNative = requests;
  const denied = await runNimImageGeneration(model, { input: [prompt, loaded] }, { apiKey: "dummy", fetch: mockFetch });
  assert.equal(denied.result.stopReason, "error");
  assert.equal(requests, beforeRejectedNative);

  const candidate = getImageProbeCapability(klein.modelId, { candidateDimensions: true });
  for (const [width, height] of KLEIN_MODEL_CARD_DIMENSION_PAIRS) assert.ok(resolveImageSettings(candidate, { width, height }).ok);
  assert.deepEqual(getImageProbeCapability("black-forest-labs/flux.1-dev").width.allowed, [1024]);
  assert.equal(resolveImageSettings(getImageProbeCapability("black-forest-labs/flux.1-schnell"), { aspect_ratio: "16:9" }).ok, false);
  assert.throws(() => getImageProbeCapability("black-forest-labs/flux.1-dev", { candidateDimensions: true }), /Klein only/);
  assert.throws(() => parseImageProbeArgs(["--image-transport=data-url-array"]));
  assert.throws(() => parseImageProbeArgs(["--input-image=x", "--image-transport=unknown"]));
  assert.throws(() => parseImageProbeArgs(["--input-image="]));
  const probe = parseImageProbeArgs([`--input-image=${source}`, "--image-transport=data-url-string", "--aspect_ratio=16:9", "--prompt=SECRET_PROMPT"]);
  const beforeDry = requests;
  const dry = await probeNimImage(probe, { fetch: mockFetch });
  assert.equal(dry.operation, "edit");
  assert.equal(dry.requests, 0);
  assert.equal(requests, beforeDry);
  assert.equal(dry.settings.width, 1344);
  assert.doesNotMatch(JSON.stringify(dry), /SECRET_PROMPT|reference\.wrong-extension|base64/);
  const editCandidate = getImageProbeCapability(klein.modelId, probe);
  assert.throws(() => capabilityToModelConfig(editCandidate), /not verified/);
  const rejection = await probeNimImage({ ...probe, live: true }, {
    apiKey: "SECRET_KEY", decode: () => undefined,
    fetch: (async () => new Response(JSON.stringify({ detail: "Expected example_id, got base64 SECRET_KEY SECRET_PROMPT" }), { status: 422 })) as typeof fetch,
  });
  assert.equal(rejection.generationVerified, false);
  assert.ok("failureHints" in rejection);
  assert.deepEqual(rejection.failureHints, ["PRESET_REFERENCE_HINT"]);
  assert.doesNotMatch(JSON.stringify(rejection), /SECRET|base64|reference\.wrong-extension/);
  assert.equal(NIM_IMAGE_MODELS.length, 1);
  assert.deepEqual(klein.width, { min: 512, max: 1568, multipleOf: 16, default: 1024 }, "probe overrides do not mutate the registered record");
  console.log("image aspect/edit tests passed");
} finally {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
}
