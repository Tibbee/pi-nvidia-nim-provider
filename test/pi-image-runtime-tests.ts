// Optional installed-Pi integration test. No network or real credential reads.
// PI_NODE_MODULES can point to the host's node_modules when peers are not installed locally.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import registerExtension from "../index";
import { NIM_IMAGE_TOOL, runNimImageTool } from "../handlers/image-tool";
import { DEFAULT_NIM_IMAGE_MODEL_ID } from "../models/image-models";
import { JPEG_BYTES, PNG_BYTES, WEBP_BYTES } from "./fixtures/image-bytes";
import { loadPixelDecoder } from "../tools/probe_nim_images";

async function host(name: string) {
  const root = process.env.PI_NODE_MODULES;
  return root ? import(pathToFileURL(join(root, name, "dist/index.js")).href) : import(name);
}
const originalFetch = globalThis.fetch;
const dir = mkdtempSync(join(tmpdir(), "nim-pi-runtime-"));
const calls: Array<{ url: string; headers: Headers; payload: any }> = [];
try {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    // Fail closed: even runtime initialization cannot touch the real network.
    assert.equal(init?.method, "POST");
    assert.ok(["https://proxy.example.test/images", "https://model.example.test/images"].includes(String(url)));
    calls.push({ url: String(url), headers: new Headers(init?.headers), payload: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ artifacts: [
      { base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 42 }, null,
    ] }));
  }) as typeof fetch;
  const decode = loadPixelDecoder();
  for (const fixture of [JPEG_BYTES, PNG_BYTES, WEBP_BYTES]) {
    assert.deepEqual(decode(fixture), { width: 1, height: 1 }, "fixtures fully pixel-decode");
  }
  const ai = await host("@earendil-works/pi-ai");
  const { ModelRuntime, ModelRegistry } = await host("@earendil-works/pi-coding-agent");
  const modelsPath = join(dir, "models.json");
  writeFileSync(modelsPath, JSON.stringify({ providers: { "nvidia-nim": {
    headers: { "X-Provider": "configured" },
  } } }));
  const runtime = await ModelRuntime.create({
    authPath: join(dir, "auth.json"), modelsPath, modelsStorePath: join(dir, "catalog.json"),
    refreshOnCreate: false, allowModelNetwork: false,
  });
  await registerExtension({
    registerProvider: (name: string, config: any) => runtime.registerProvider(name, {
      ...config, apiKey: "dummy-test-key", models: config.models.map((m: any) => m.type === "image"
        ? { ...m, baseUrl: "https://model.example.test/images", headers: { "X-Model": "configured" } } : m),
    }),
    registerTool: () => {}, on: () => () => {},
  } as never);
  const registry = new ModelRegistry(runtime);
  const painter = registry.getModelOfType("image", "nvidia-nim", DEFAULT_NIM_IMAGE_MODEL_ID);
  assert.ok(painter);
  assert.equal(painter.baseUrl, "https://model.example.test/images");
  assert.equal(registry.getModelsOfType("image", "nvidia-nim").length, 2);
  assert.equal(registry.getModelsOfType("chat", "nvidia-nim").length, 16);

  // Exercise Pi's actual argument validator, not just the tool execute function.
  const validate = (args: unknown) => ai.validateToolArguments(NIM_IMAGE_TOOL, {
    type: "toolCall", id: "test", name: NIM_IMAGE_TOOL.name, arguments: args,
  });
  validate({ prompt: "p", cfg_scale: 0, steps: 50 }); // model-specific validation happens later
  validate({ prompt: "p", aspect_ratio: "16:9", inputImage: "reference.jpg" });
  assert.equal(validate({ prompt: "p", aspect_ratio: 16 }).aspect_ratio, "16", "Pi coerces scalar strings; model validation still rejects unknown ratios");
  assert.throws(() => validate({ prompt: "p", steps: 1.2 }));
  assert.throws(() => validate({ prompt: "p", unknown: true }));
  const ctx = { cwd: dir, modelRegistry: registry };
  await assert.rejects(runNimImageTool(validate({ prompt: "p", aspect_ratio: 16 }), ctx), /Unsupported aspect_ratio/);
  await assert.rejects(runNimImageTool(validate({ prompt: "p", cfg_scale: 0 }), ctx), /cfg_scale/);
  for (const key of ["width", "height", "seed", "steps", "samples", "cfg_scale", "aspect_ratio", "preset_example"]) {
    const invalid = await registry.generateImages(painter, { input: [{ type: "text", text: "p" }] }, { metadata: { [key]: null } });
    assert.equal(invalid.stopReason, "error", `${key}: native runtime rejects null`);
  }
  assert.equal(calls.length, 0, "native null metadata fails before fetch");
  const native = await registry.generateImages(painter, { input: [{ type: "text", text: "p" }] });
  assert.equal(native.stopReason, "stop", native.errorMessage);
  assert.equal(native.output.filter((b: any) => b.type === "image").length, 1);
  assert.equal(calls[0].headers.get("authorization"), "Bearer dummy-test-key");
  assert.equal(calls[0].headers.get("x-model"), "configured");
  assert.equal(calls[0].headers.get("x-provider"), "configured");

  // Real native auth resolver supplies header-only credentials and an endpoint override.
  const provider = runtime.getProvider("nvidia-nim");
  const registeredCatalog = [
    ...registry.getModelsOfType("chat", "nvidia-nim"),
    ...registry.getModelsOfType("image", "nvidia-nim").map((m: any) => ({ ...m, headers: { "X-Model": "configured" } })),
  ];
  runtime.unregisterProvider("nvidia-nim");
  runtime.registerNativeProvider({ ...provider, getModels: () => [], getAllModels: () => registeredCatalog, auth: { apiKey: {
    name: "Test auth", resolve: async () => ({ auth: {
      headers: { "X-Api-Key": "header-only-dummy", authorization: null }, baseUrl: "https://proxy.example.test/images",
    } }),
  } } });
  const tool = await runNimImageTool(validate({ prompt: "p", seed: 42, aspect_ratio: "16:9" }), ctx);
  assert.equal(tool.isError, false, (tool.structuredContent as any).errorMessage);
  const structured = tool.structuredContent as any;
  assert.equal(structured.images[0].seed, 42);
  assert.equal(structured.droppedArtifacts.length, 1);
  const call = calls.at(-1)!;
  assert.equal(call.url, "https://proxy.example.test/images");
  assert.equal(call.headers.get("x-api-key"), "header-only-dummy");
  assert.equal(call.headers.get("authorization"), null);
  assert.equal(call.headers.get("x-model"), "configured");
  assert.equal(call.payload.seed, 42);
  assert.equal(call.payload.width, 1344);
  assert.equal(call.payload.height, 768);
  assert.equal("aspect_ratio" in call.payload, false);
  assert.equal(structured.operation, "generate");
  await assert.rejects(runNimImageTool(validate({ prompt: "p", inputImage: "private-missing-file.jpg" }), ctx), /editing.*not supported/);
  await assert.rejects(runNimImageTool(validate({ prompt: "p", aspect_ratio: "16:9", height: 1024 }), ctx), /conflicts/);
  const deniedNative = await registry.generateImages(painter, { input: [
    { type: "text", text: "p" }, { type: "image", data: PNG_BYTES.toString("base64"), mimeType: "image/png" },
  ] });
  assert.equal(deniedNative.stopReason, "error");
  assert.match(deniedNative.errorMessage!, /editing.*not supported/);
  assert.equal(calls.length, 2, "invalid arguments and disabled editing never dispatch or consume quota");
  assert.throws(() => validate({ prompt: "p", preset_example: 0 }));
  const removedPreset = await registry.generateImages(painter, { input: [{ type: "text", text: "p" }] }, { metadata: { preset_example: 0 } });
  assert.equal(removedPreset.stopReason, "error");
  assert.match(removedPreset.errorMessage!, /Unsupported parameter/);
  assert.equal(calls.length, 2, "removed presets never dispatch");
  const fourThree = await runNimImageTool(validate({ prompt: "p", aspect_ratio: "4:3" }), ctx);
  assert.equal(fourThree.isError, false);
  assert.equal(calls.at(-1)!.payload.width, 1024);
  assert.equal(calls.at(-1)!.payload.height, 768);
  assert.equal(calls.length, 3);
  const custom = await runNimImageTool(validate({ prompt: "p", width: 1536, height: 672 }), ctx);
  assert.equal(custom.isError, false);
  assert.equal(calls.at(-1)!.payload.width, 1536);
  assert.equal(calls.at(-1)!.payload.height, 672);
  await assert.rejects(runNimImageTool(validate({ prompt: "p", height: 750 }), ctx), /multiple of 16/);
  assert.equal(calls.length, 4);
  // Explicit FLUX.2 selection uses the same authenticated Pi runtime, with
  // its own defaults and the currently observed 800-character prompt limit.
  const oldId = "black-forest-labs/flux.2-klein-4b";
  const oldPainter = registry.getModelOfType("image", "nvidia-nim", oldId);
  assert.ok(oldPainter);
  const oldNative = await registry.generateImages(oldPainter, { input: [{ type: "text", text: "p" }] });
  assert.equal(oldNative.stopReason, "stop", oldNative.errorMessage);
  assert.equal(calls.at(-1)!.payload.steps, 4);
  assert.equal(calls.at(-1)!.payload.cfg_scale, 1);
  const oldTool = await runNimImageTool(validate({ model: oldId, prompt: "p".repeat(800) }), ctx);
  assert.equal(oldTool.isError, false);
  assert.equal((oldTool.structuredContent as any).model, oldId);
  assert.equal(calls.at(-1)!.payload.steps, 4);
  const beforeOldRejections = calls.length;
  await assert.rejects(runNimImageTool(validate({ model: oldId, prompt: "p".repeat(801) }), ctx), /800/);
  await assert.rejects(runNimImageTool(validate({ model: oldId, prompt: "p", steps: 50 }), ctx), /between 1 and 4/);
  assert.equal(calls.length, beforeOldRejections);
  assert.throws(() => validate({ model: "unknown", prompt: "p" }));
  const caption = "A red square <square> on white.";
  const layout = [{ id: "square", bbox: [200, 100, 800, 400], desc: "One red square." }];
  const layoutTool = await runNimImageTool(validate({ prompt: caption, layout }), ctx);
  assert.equal(layoutTool.isError, false);
  assert.equal(calls.at(-1)!.payload.prompt, `${caption} ${JSON.stringify(layout)}`);
  assert.equal("layout" in calls.at(-1)!.payload, false, "layout compiles to prompt through installed Pi");
  const layoutNative = await registry.generateImages(painter, { input: [{ type: "text", text: caption }] }, { metadata: { layout } });
  assert.equal(layoutNative.stopReason, "stop", layoutNative.errorMessage);
  assert.equal(calls.at(-1)!.payload.prompt, `${caption} ${JSON.stringify(layout)}`);
  const beforeLayoutRejections = calls.length;
  await assert.rejects(runNimImageTool(validate({ prompt: caption, layout: [{ ...layout[0], bbox: [900, 0, 100, 1000] }] }), ctx), /top < bottom/);
  await assert.rejects(runNimImageTool(validate({ model: oldId, prompt: caption, layout }), ctx), /not verified/);
  for (const selected of [painter, oldPainter]) {
    const tooLarge = await registry.generateImages(selected, { input: [{ type: "text", text: "p" }] }, { metadata: { width: 1568, height: 1568 } });
    assert.equal(tooLarge.stopReason, "error");
    assert.match(tooLarge.errorMessage!, /1062400/);
  }
  assert.equal(calls.length, beforeLayoutRejections, "bad layouts and combined area never dispatch");
  console.log("Pi image runtime integration tests passed");
} finally {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
}
