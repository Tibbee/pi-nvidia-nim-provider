import assert from "node:assert/strict";
import { handleAfterProviderResponse, handleBeforeProviderRequest } from "../index";
import { classifyThinkingFormat, mapThinkingFormatToCompat, STATIC_MODELS, STATIC_MODEL_MAP } from "../models/registry";
import { applyFamilyCompat } from "../config/model-families";
import type { NimModelConfig } from "../models/types";

function baseModel(id: string): NimModelConfig {
  return {
    id,
    name: id,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    compat: {},
  };
}

// 1) Regression: reasoning-effort must only enable supported compat.
assert.deepEqual(mapThinkingFormatToCompat("reasoning-effort"), {
  supportsReasoningEffort: true,
});

// 2) Families that add thinking should surface reasoning=true.
const stepfun = applyFamilyCompat([baseModel("stepfun-ai/step-3.5-flash")])[0];
assert.equal(stepfun.reasoning, true);

const deepseek = applyFamilyCompat([baseModel("deepseek-ai/deepseek-v3-test")])[0];
assert.equal(deepseek.reasoning, true);

const minimax = applyFamilyCompat([baseModel("minimaxai/minimax-m2.7")])[0];
assert.equal(minimax.reasoning, true);

// 3) Model filter should exclude known embedding-only models.
assert.equal(STATIC_MODELS.some((model) => model.id === "baai/bge-m3"), false);

// 4) Known models should still classify as expected.
assert.equal(
  classifyThinkingFormat("deepseek-ai/deepseek-v4-flash"),
  "deepseek-v4"
);
assert.equal(
  classifyThinkingFormat("openai/gpt-oss-120b"),
  "none"
);
assert.equal(STATIC_MODEL_MAP.get("stepfun-ai/step-3.5-flash")?.reasoning, true);

// 5) before_provider_request should skip models not in the NIM registry.
assert.equal(
  handleBeforeProviderRequest({ provider: "openrouter", payload: { model: "openai/gpt-4o" } }),
  undefined
);

// 6) after_provider_response should only warn for NVIDIA rate limits.
// The function returns void and calls ctx.ui.notify(), so we mock the context.
function mockCtx(provider: string) {
  const notifications: Array<{ msg: string; level: string }> = [];
  return {
    model: { provider } as any,
    ui: { notify: (msg: string, level: string) => { notifications.push({ msg, level }); } },
    notifications,
  };
}

const ctx1 = mockCtx("openrouter");
handleAfterProviderResponse({ status: 429, headers: { "retry-after": "3" } }, ctx1 as any);
assert.equal(ctx1.notifications.length, 0, "non-nvidia-nim should not notify");

const ctx2 = mockCtx("nvidia-nim");
handleAfterProviderResponse({ status: 200, headers: { "retry-after": "3" } }, ctx2 as any);
assert.equal(ctx2.notifications.length, 0, "status 200 should not notify");

const ctx3 = mockCtx("nvidia-nim");
handleAfterProviderResponse({ status: 429, headers: { "retry-after": "3" } }, ctx3 as any);
assert.equal(ctx3.notifications.length, 1, "status 429 should notify");
assert.equal(ctx3.notifications[0].msg, "NVIDIA NIM rate-limited. Retry after 3.");
assert.equal(ctx3.notifications[0].level, "warning");

const ctx4 = mockCtx("nvidia-nim");
handleAfterProviderResponse({ status: 429, headers: {} }, ctx4 as any);
assert.equal(ctx4.notifications.length, 1, "429 without retry-after should notify");
assert.equal(ctx4.notifications[0].msg, "NVIDIA NIM rate-limited.");

// Also handle undefined ctx gracefully.
handleAfterProviderResponse({ status: 429, headers: {} }, undefined as any);

// 7) DeepSeek V4 rewrite should move thinking fields into chat_template_kwargs.
const deepseekPayload = {
  model: "deepseek-ai/deepseek-v4-flash",
  thinking: { type: "enabled" },
  reasoning_effort: "high",
  messages: [],
};
const rewritten = handleBeforeProviderRequest({ provider: "nvidia-nim", payload: deepseekPayload }) as Record<string, unknown>;
assert.ok(rewritten);
assert.equal("thinking" in rewritten, false);
assert.equal("reasoning_effort" in rewritten, false);
assert.deepEqual(rewritten.chat_template_kwargs, {
  thinking: true,
  reasoning_effort: "high",
});

console.log("refactor checks passed");
