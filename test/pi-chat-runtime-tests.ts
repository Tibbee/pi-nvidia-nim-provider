// Optional installed-Pi serialization/stream parsing test. Fake auth and fetch only.
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { STATIC_MODEL_MAP } from "../models/registry";
import { handleBeforeProviderRequest } from "../index";

const root = process.env.PI_NODE_MODULES;
const ai = root
  ? await import(pathToFileURL(join(root, "@earendil-works/pi-ai/dist/compat.js")).href)
  : await import("@earendil-works/pi-ai/compat");
const originalFetch = globalThis.fetch;
const calls: any[] = [];
const fixture = [
  { choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "Earlier thought." }, finish_reason: null }] },
  { choices: [{ index: 0, delta: { content: "4" }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
].map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
try {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), "https://integrate.api.nvidia.com/v1/chat/completions");
    calls.push(JSON.parse(String(init?.body)));
    return new Response(fixture, { headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  for (const [id, level, expectedKwargs] of [
    ["stepfun-ai/step-5-preview", "high", undefined],
    ["nvidia/nemotron-3.5-super-vl-120b-a12b", undefined, { enable_thinking: false }],
    ["nvidia/nemotron-3.5-super-vl-120b-a12b", "low", { enable_thinking: true, low_effort: true }],
    ["nvidia/nemotron-3.5-super-vl-120b-a12b", "high", { enable_thinking: true }],
  ] as const) {
    const model = { ...STATIC_MODEL_MAP.get(id)!, provider: "nvidia-nim", api: "openai-completions", baseUrl: "https://integrate.api.nvidia.com/v1" };
    const options = { apiKey: "dummy-test-key", reasoning: level, maxTokens: 128,
      onPayload: (payload: any) => handleBeforeProviderRequest({ payload }, { model: model as never }) ?? payload };
    const first = await ai.completeSimple(model, { messages: [{ role: "user", content: "2+2?", timestamp: 1 }] }, options);
    assert.equal(first.stopReason, "stop", first.errorMessage);
    assert.equal(first.content.find((b: any) => b.type === "thinking")?.thinking, "Earlier thought.");
    assert.equal(first.content.find((b: any) => b.type === "text")?.text, "4");
    assert.equal("reasoning_effort" in calls.at(-1), false);
    assert.equal("reasoning_budget" in calls.at(-1), false);
    assert.deepEqual(calls.at(-1).chat_template_kwargs, expectedKwargs);
    const second = await ai.completeSimple(model, { messages: [first,
      { role: "user", content: [{ type: "text", text: "Describe" }, { type: "image", data: "AA==", mimeType: "image/png" }], timestamp: 2 },
    ] }, options);
    assert.equal(second.stopReason, "stop", second.errorMessage);
    const outgoing = calls.at(-1).messages;
    assert.equal(outgoing.find((m: any) => m.role === "assistant").reasoning_content, "Earlier thought.");
    assert.equal(outgoing.at(-1).content[1].type, "image_url", "vision parts survive the hook");
  }
  assert.equal(calls.length, 8);
  console.log("Pi chat runtime serialization and stream tests passed");
} finally {
  globalThis.fetch = originalFetch;
}
