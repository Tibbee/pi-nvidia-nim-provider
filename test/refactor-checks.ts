import assert from "node:assert/strict";
import { handleAfterProviderResponse, handleBeforeProviderRequest } from "../index";
import { classifyThinkingFormat, mapThinkingFormatToCompat, STATIC_MODELS, STATIC_MODEL_MAP } from "../models/registry";
import { applyFamilyCompat } from "../config/model-families";
import type { NimModelConfig } from "../models/types";
import {
  DEEPSEEK_V4_FLASH_REASONING_CAPABILITY,
  GLM_52_REASONING_CAPABILITY,
  INKLING_REASONING_CAPABILITY,
  LAGUNA_XS_21_REASONING_CAPABILITY,
  MINIMAX_M3_REASONING_CAPABILITY,
  STEP_37_REASONING_CAPABILITY,
  getReasoningCapability,
} from "../models/capabilities";

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

const deepseek = applyFamilyCompat([baseModel("deepseek-ai/deepseek-v4-test")])[0];
assert.equal(deepseek.reasoning, true);

const minimax = applyFamilyCompat([baseModel("minimaxai/minimax-m2.7")])[0];
assert.equal(minimax.reasoning, true);

// NIM must not inherit pi's OpenAI storage default for any family.
const genericNim = applyFamilyCompat([baseModel("meta/llama-3.3-70b-instruct")])[0];
assert.equal(genericNim.compat?.supportsStore, false);

// 3) Model filter should exclude known embedding-only models.
assert.equal(STATIC_MODELS.some((model) => model.id === "baai/bge-m3"), false);

// 4) Known models should still classify as expected.
assert.equal(
  classifyThinkingFormat("deepseek-ai/deepseek-v4-flash"),
  "deepseek-v4"
);
const deepseekV4Levels = {
  off: "none",
  minimal: null,
  low: null,
  medium: null,
  high: "high",
  xhigh: null,
  max: "max",
};
for (const modelId of ["deepseek-ai/deepseek-v4-flash", "deepseek-ai/deepseek-v4-pro"]) {
  const model = STATIC_MODEL_MAP.get(modelId);
  assert.deepEqual(model?.thinkingLevelMap, deepseekV4Levels, modelId);
}
assert.equal(classifyThinkingFormat("moonshotai/kimi-k2.6"), "deepseek-nim");
assert.equal(classifyThinkingFormat("minimaxai/minimax-m2.7"), "minimax-inline");
assert.equal(
  classifyThinkingFormat("openai/gpt-oss-120b"),
  "none"
);
assert.equal(STATIC_MODEL_MAP.get("stepfun-ai/step-3.5-flash")?.reasoning, true);
assert.equal(STATIC_MODEL_MAP.get("poolside/laguna-xs-2.1")?.reasoning, true);
assert.equal(STATIC_MODEL_MAP.get("poolside/laguna-xs-2.1")?.compat?.thinkingFormat, "qwen-chat-template");
assert.equal(STATIC_MODEL_MAP.get("thinkingmachines/inkling")?.reasoning, true);
assert.deepEqual(STATIC_MODEL_MAP.get("thinkingmachines/inkling")?.input, ["text", "image"]);
assert.equal(STATIC_MODEL_MAP.get("thinkingmachines/inkling")?.thinkingLevelMap?.off, null);
const glmModel = STATIC_MODEL_MAP.get("z-ai/glm-5.2");
assert.equal(glmModel?.compat?.thinkingFormat, "zai");
assert.equal(glmModel?.compat?.supportsReasoningEffort, true);
assert.deepEqual(glmModel?.thinkingLevelMap, {
  off: "none",
  minimal: null,
  low: null,
  medium: null,
  high: "high",
  xhigh: null,
  max: "max",
});

// 5) GLM semantics and NIM transport hypotheses remain separate.
assert.equal(getReasoningCapability("z-ai/glm-5.2"), GLM_52_REASONING_CAPABILITY);
assert.equal(GLM_52_REASONING_CAPABILITY.semantics.supportsEffort, true);
assert.equal(GLM_52_REASONING_CAPABILITY.verification.requestTransport, "probe-passed");
assert.equal(GLM_52_REASONING_CAPABILITY.verification.responseTransport, "probe-passed");
assert.equal(GLM_52_REASONING_CAPABILITY.verification.streaming, "probe-passed");
assert.equal(getReasoningCapability("deepseek-ai/deepseek-v4-flash"), DEEPSEEK_V4_FLASH_REASONING_CAPABILITY);
assert.equal(DEEPSEEK_V4_FLASH_REASONING_CAPABILITY.verification.responseTransport, "probe-passed");
assert.equal(getReasoningCapability("thinkingmachines/inkling"), INKLING_REASONING_CAPABILITY);
assert.equal(INKLING_REASONING_CAPABILITY.semantics.canDisable, false);
assert.equal(INKLING_REASONING_CAPABILITY.verification.responseTransport, "probe-passed");
assert.equal(INKLING_REASONING_CAPABILITY.verification.streaming, "probe-passed");
assert.equal(getReasoningCapability("poolside/laguna-xs-2.1"), LAGUNA_XS_21_REASONING_CAPABILITY);
assert.equal(LAGUNA_XS_21_REASONING_CAPABILITY.nimTransport.requestEncoding, "chat-template-kwargs");
assert.equal(LAGUNA_XS_21_REASONING_CAPABILITY.verification.requestTransport, "probe-passed");
assert.equal(LAGUNA_XS_21_REASONING_CAPABILITY.verification.streaming, "probe-passed");
assert.equal(getReasoningCapability("minimaxai/minimax-m3"), MINIMAX_M3_REASONING_CAPABILITY);
assert.equal(MINIMAX_M3_REASONING_CAPABILITY.nimTransport.requestEncoding, "chat-template-kwargs");
assert.equal(MINIMAX_M3_REASONING_CAPABILITY.verification.requestTransport, "probe-passed");
assert.equal(MINIMAX_M3_REASONING_CAPABILITY.verification.responseTransport, "probe-passed");
assert.equal(MINIMAX_M3_REASONING_CAPABILITY.verification.streaming, "probe-passed");
assert.equal(getReasoningCapability("stepfun-ai/step-3.7-flash"), STEP_37_REASONING_CAPABILITY);
assert.equal(STEP_37_REASONING_CAPABILITY.verification.requestTransport, "probe-passed");
assert.equal(STEP_37_REASONING_CAPABILITY.semantics.canDisable, false);


// 6) before_provider_request should skip models not in the NIM registry.
assert.equal(
  handleBeforeProviderRequest(
    { payload: { model: "openai/gpt-4o" } },
    { model: { provider: "openrouter" } as any },
  ),
  undefined
);

// 7) after_provider_response should only warn for NVIDIA rate limits.
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

// 8) DeepSeek V4 rewrite should move thinking fields into chat_template_kwargs.
const deepseekPayload = {
  model: "deepseek-ai/deepseek-v4-flash",
  thinking: { type: "enabled" },
  reasoning_effort: "high",
  messages: [],
};
const rewritten = handleBeforeProviderRequest(
  { payload: deepseekPayload },
  { model: { provider: "nvidia-nim" } as any },
) as Record<string, unknown>;
assert.ok(rewritten);
assert.equal("thinking" in rewritten, false);
assert.equal("reasoning_effort" in rewritten, false);
assert.deepEqual(rewritten.chat_template_kwargs, {
  thinking: true,
  reasoning_effort: "high",
});

console.log("refactor checks passed");
