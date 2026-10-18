import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { FLUX_3_IMAGE_KLEIN_CAPABILITY as cap, FLUX_2_KLEIN_4B_CAPABILITY as old, capabilityToModelConfig } from "../models/image-models";
import { compileNimImageLayout, type NimImageLayoutElement } from "../lib/image-layout";
import { resolveImagePrompt, resolveImageSettings, generateNimImages } from "../lib/nim-images";
import { runNimImageTool, NIM_IMAGE_TOOL } from "../handlers/image-tool";
import { JPEG_BYTES } from "./fixtures/image-bytes";
import { parseImageProbeArgs, probeNimImage } from "../tools/probe_nim_images";

const caption = "A red square <red_square> and a blue circle <blue_circle> on white.";
const layout: NimImageLayoutElement[] = [
  { id: "red_square", bbox: [200, 75, 800, 400], desc: "One red square." },
  { id: "blue_circle", bbox: [200, 600, 800, 925], desc: "One blue circle." },
];
const before = JSON.stringify(layout);
const compiled = `${caption} ${JSON.stringify(layout)}`;
assert.deepEqual(compileNimImageLayout(cap, caption, layout), { ok: true, value: compiled });
assert.equal(JSON.stringify(layout), before, "compiling never mutates the caller's rows");
assert.deepEqual(compileNimImageLayout(cap, caption, undefined), { ok: true, value: caption });
for (const value of [null, {}, "[]", [], Array(21).fill(layout[0]), [layout[0], layout[0]],
  [{ ...layout[0], extra: true }], [{ ...layout[0], id: "Bad" }], [{ ...layout[0], id: "absent" }],
  [{ ...layout[0], desc: "  " }], [{ ...layout[0], desc: 1 }]]) {
  assert.equal(compileNimImageLayout(cap, caption, value).ok, false);
}
for (const bbox of [[0, 0, 0, 1000], [1000, 0, 0, 1000], [0, 1000, 1000, 1000],
  [-1, 0, 1000, 1000], [0, 0, 1001, 1000], [0, 0, 1000.5, 1000], ["0", 0, 1000, 1000],
  [0, 0, 1000], [0, 0, 1000, 1000, 1], [0, NaN, 1000, 1000], [0, , 1000, 1000]]) {
  assert.equal(compileNimImageLayout(cap, caption, [{ ...layout[0], bbox }]).ok, false);
}
assert.equal(compileNimImageLayout(old, caption, layout).ok, false, "no unverified layout capability for FLUX.2");
assert.equal(resolveImagePrompt(cap, [{ type: "text", text: caption }], [{ ...layout[0], desc: "x".repeat(2000) }]).ok, false, "combined prompt budget includes serialized rows");

const model = { ...capabilityToModelConfig(cap), provider: "nvidia-nim" } as any;
const calls: any[] = [];
const fetch = (async (_url: unknown, init?: RequestInit) => {
  calls.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ artifacts: [{ base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS" }] }));
}) as typeof globalThis.fetch;
const ctx = { cwd: process.cwd(), modelRegistry: {
  getModelOfType: (_type: string, _provider: string, id: string) => id === old.modelId
    ? { ...capabilityToModelConfig(old), provider: "nvidia-nim" } : model,
  generateImages: (m: any, c: any, o: any) => generateNimImages(m, c, { ...o, apiKey: "dummy", fetch }),
} };
const native = await generateNimImages(model, { input: [{ type: "text", text: caption }] }, { apiKey: "dummy", fetch, metadata: { layout } });
assert.equal(native.stopReason, "stop", native.errorMessage);
assert.equal(calls.at(-1).prompt, compiled);
const tool = await runNimImageTool({ prompt: caption, layout }, ctx);
assert.equal(tool.isError, false);
assert.equal(calls.at(-1).prompt, compiled, "tool compiles exactly once through the shared native adapter");
assert.deepEqual(calls[0], calls[1], "native and tool requests agree");
assert.deepEqual((tool.structuredContent as any).promptLayout, { format: "bfl-caption-json", elementCount: 2 });
for (const key of ["layout", "bbox", "mode", "model"]) assert.equal(key in calls[1], false);
assert.ok((NIM_IMAGE_TOOL.parameters as any).properties.layout);
const count = calls.length;
for (const invalid of [null, [], [{ ...layout[0], bbox: [1000, 0, 0, 1000] }]]) {
  const result = await generateNimImages(model, { input: [{ type: "text", text: caption }] }, { apiKey: "dummy", fetch, metadata: { layout: invalid } });
  assert.equal(result.stopReason, "error");
}
await assert.rejects(runNimImageTool({ model: old.modelId, prompt: caption, layout }, ctx), /not verified/);
await assert.rejects(runNimImageTool({ prompt: "No tags", layout }, ctx), /<red_square>/);
await assert.rejects(runNimImageTool({ prompt: caption, layout: [{ ...layout[0], desc: "x".repeat(2000) }] }, ctx), /2000-character/);
for (const capability of [cap, old]) {
  assert.equal(resolveImageSettings(capability, { width: 800, height: 1328 }).ok, true);
  assert.equal(resolveImageSettings(capability, { width: 1568, height: 1568 }).ok, false);
  assert.equal(resolveImageSettings(capability, { width: 800, height: 1344 }).ok, false);
  const result = await ctx.modelRegistry.generateImages({ ...capabilityToModelConfig(capability), provider: "nvidia-nim" }, { input: [{ type: "text", text: "p" }] }, { metadata: { width: 1568, height: 1568 } });
  assert.equal(result.stopReason, "error");
  assert.match(result.errorMessage!, /1062400/);
}
assert.equal(calls.length, count, "unsupported layout and oversized dimensions fail without dispatch");
const dir = mkdtempSync(join(tmpdir(), "nim-layout-probe-"));
try {
  const source = join(dir, "SECRET_LAYOUT.json");
  writeFileSync(source, JSON.stringify([{ ...layout[0], desc: "SECRET_DESCRIPTION" }]));
  let fetches = 0;
  const dry = await probeNimImage(parseImageProbeArgs([`--layout-file=${source}`, "--prompt=SECRET_PROMPT <red_square>"]), {
    fetch: (async () => { fetches++; throw new Error("must not dispatch"); }) as typeof fetch,
  });
  assert.equal(fetches, 0);
  assert.equal(dry.requests, 0);
  assert.equal(dry.promptLayout?.elementCount, 1);
  assert.doesNotMatch(JSON.stringify(dry), /SECRET/);
  await assert.rejects(probeNimImage(parseImageProbeArgs([`--model=${old.modelId}`, "--layout-file=missing-private.json"])), /not verified/);
  assert.throws(() => parseImageProbeArgs(["--layout-file="]));
} finally {
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
  rmSync(dir, { recursive: true, force: true });
}
console.log("image layout and combined-area tests passed");
