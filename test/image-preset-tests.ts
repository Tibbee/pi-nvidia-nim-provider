// Offline only: no real keys, network, or NVIDIA quota.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImageModel, ImagesContext, ImagesOptions } from "@earendil-works/pi-ai";
import { FLUX_2_KLEIN_4B_CAPABILITY as cap, capabilityToModelConfig } from "../models/image-models";
import { buildImageRequest, resolveImageSettings, runNimImageGeneration, generateNimImages } from "../lib/nim-images";
import { runNimImageTool } from "../handlers/image-tool";
import { JPEG_BYTES, PNG_BYTES } from "./fixtures/image-bytes";
import { getImageProbeCapability, parseImageProbeArgs, probeNimImage } from "../tools/probe_nim_images";

const model = { ...capabilityToModelConfig(cap), provider: "nvidia-nim" } as ImageModel<string>;
const input = [{ type: "text" as const, text: "p" }];
const calls: Array<{ body: any; headers: Headers }> = [];
const fetch = (async (_url: unknown, init?: RequestInit) => {
  calls.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
  return new Response(JSON.stringify({ artifacts: [{ base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 42 }] }));
}) as typeof globalThis.fetch;
const dir = mkdtempSync(join(tmpdir(), "nim-preset-tests-"));
try {
  assert.deepEqual(model.input, ["text"], "preset editing never advertises arbitrary image blocks");
  assert.equal(cap.evidence.editingVerifiedAt, undefined, "upload evidence is separate from preset evidence");
  for (const id of ["black-forest-labs/flux.1-dev", "black-forest-labs/flux.1-schnell"]) {
    const candidate = getImageProbeCapability(id);
    assert.equal(candidate.presetEditing, undefined);
    assert.equal(candidate.allowedRequestFields.includes("image"), false);
    assert.equal(resolveImageSettings(candidate, { preset_example: 0 }).ok, false);
  }
  for (const pair of [[1024, 768], [1008, 752]]) {
    assert.ok(resolveImageSettings(cap, { width: pair[0], height: pair[1] }).ok);
  }
  assert.ok(resolveImageSettings(cap, { aspect_ratio: "4:3" }).ok);
  for (const width of [496, 1000, 1584]) assert.equal(resolveImageSettings(cap, { width }).ok, false);
  assert.equal(resolveImageSettings(cap, { width: 512, height: 768 }).ok, true, "both hosted grids are established; generation is not limited to preset pairs");
  for (const id of [1, 2, 3, -1, 0.5, NaN, "0", null, {}, Infinity]) {
    assert.equal(resolveImageSettings(cap, { preset_example: id }).ok, false);
  }
  assert.equal(resolveImageSettings({ ...cap, presetEditing: undefined }, { preset_example: 0 }).ok, false);
  assert.throws(() => capabilityToModelConfig({ ...cap, presetEditing: { ...cap.presetEditing!, examples: [{ ...cap.presetEditing!.examples[0], verifiedAt: "" }] } }), /not verified/);
  assert.throws(() => capabilityToModelConfig({ ...cap, presetEditing: { ...cap.presetEditing!, examples: [...cap.presetEditing!.examples, ...cap.presetEditing!.examples] } }), /not verified/);
  assert.equal(resolveImageSettings(cap, { preset_example: 0, aspect_ratio: "16:9" }).ok, false);
  const settings = resolveImageSettings(cap, { preset_example: 0, seed: 42 });
  assert.ok(settings.ok);
  const payload = buildImageRequest(cap, "p", settings.value);
  assert.deepEqual(payload.image, ["data:image/png;example_id,0"]);
  for (const key of ["preset_example", "mode", "model", "aspect_ratio"]) assert.equal(key in payload, false);
  assert.throws(() => buildImageRequest(cap, "p", { preset_example: 3 }), /Unsupported/);
  assert.throws(() => buildImageRequest(cap, "p", settings.value, ["image"]), /conflicts/);
  const dry = await probeNimImage(parseImageProbeArgs(["--preset_example=0", "--prompt=SECRET_PROMPT"]), { fetch });
  assert.equal(dry.operation, "edit");
  assert.equal(dry.requests, 0);
  assert.equal(calls.length, 0);
  assert.doesNotMatch(JSON.stringify(dry), /SECRET_PROMPT|base64/);
  assert.throws(() => parseImageProbeArgs(["--preset_example=0", "--input-image=missing"]), /conflicts/);
  await assert.rejects(probeNimImage(parseImageProbeArgs(["--preset_example=1"]), { fetch }), /Unsupported/);
  const generated = await runNimImageGeneration(model, { input }, { apiKey: "dummy", fetch });
  assert.equal(generated.result.stopReason, "stop");
  assert.equal("image" in calls.at(-1)!.body, false);
  const edited = await runNimImageGeneration(model, { input }, { apiKey: "dummy", fetch, metadata: { preset_example: 0, seed: 42 } });
  assert.equal(edited.result.stopReason, "stop");
  assert.deepEqual(calls.at(-1)!.body.image, ["data:image/png;example_id,0"]);
  assert.equal(calls.at(-1)!.headers.get("authorization"), "Bearer dummy");
  const before = calls.length;
  for (const metadata of [{ preset_example: 1 }, { preset_example: 0, aspect_ratio: "16:9" }, { image: "data:image/png;example_id,0" }]) {
    assert.equal((await runNimImageGeneration(model, { input }, { apiKey: "dummy", fetch, metadata })).result.stopReason, "error");
  }
  const block = { type: "image" as const, mimeType: "image/png", data: PNG_BYTES.toString("base64") };
  assert.equal((await runNimImageGeneration(model, { input: [...input, block] }, { apiKey: "dummy", fetch, metadata: { preset_example: 0 } })).result.stopReason, "error");
  const ctx = { cwd: dir, modelRegistry: {
    getModelOfType: () => model,
    generateImages: (m: ImageModel<string>, c: ImagesContext, o?: ImagesOptions) => generateNimImages(m, c, { ...o, apiKey: "dummy", fetch }),
  } };
  await assert.rejects(runNimImageTool({ prompt: "p", preset_example: 0, inputImage: "missing-private-file" }, ctx), /conflicts/);
  await assert.rejects(runNimImageTool({ prompt: "p", inputImage: "missing-private-file" }, ctx), /not supported/);
  await assert.rejects(runNimImageTool({ prompt: "p", preset_example: 1 }, ctx), /Unsupported/);
  assert.equal(calls.length, before, "invalid selectors and conflicts never dispatch");
  const tool = await runNimImageTool({ prompt: "p", preset_example: 0, seed: 42, saveDir: dir, fileName: "frog.png" }, ctx);
  const result = tool.structuredContent as any;
  assert.equal(result.operation, "edit");
  assert.equal(result.settings.preset_example, 0);
  assert.equal(result.isError, false);
  assert.deepEqual(readFileSync(result.savedPaths[0]), JPEG_BYTES);
  assert.match(result.savedPaths[0], /frog\.jpg$/);
  const second = await runNimImageTool({ prompt: "p", preset_example: 0, saveDir: dir, fileName: "frog.jpg" }, ctx);
  assert.equal(second.isError, true);
  assert.equal((second.structuredContent as any).images.length, 1, "keep edited images on save failure");
  const controller = new AbortController(); controller.abort();
  const count = calls.length;
  assert.equal((await runNimImageGeneration(model, { input }, { apiKey: "dummy", fetch, signal: controller.signal, metadata: { preset_example: 0 } })).result.stopReason, "aborted");
  assert.equal(calls.length, count);
  console.log("image preset tests passed");
} finally { rmSync(dir, { recursive: true, force: true }); }
