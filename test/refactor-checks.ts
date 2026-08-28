import assert from "node:assert/strict";
import { handleAfterProviderResponse, handleBeforeProviderRequest } from "../index";
import {
  buildReasoningEffortThinkingLevelMap,
  classifyThinkingFormat,
  mapThinkingFormatToCompat,
  STATIC_MODELS,
  STATIC_MODEL_MAP,
} from "../models/registry";
import { applyFamilyCompat } from "../config/model-families";
import type { NimModelConfig } from "../models/types";
import {
  DEEPSEEK_V4_FLASH_REASONING_CAPABILITY,
  KIMI_K3_REASONING_CAPABILITY,
  LAGUNA_XS_21_REASONING_CAPABILITY,
  MINIMAX_M3_REASONING_CAPABILITY,
  MUSE_GLIMMER_30B_REASONING_CAPABILITY,
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
assert.deepEqual(
  buildReasoningEffortThinkingLevelMap(["none", "minimal", "low", "medium", "high", "max"]),
  {
    off: "none",
    minimal: "minimal",
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "max",
    max: "max",
  },
);

// 2) Families that add thinking should surface reasoning=true.
const stepfun = applyFamilyCompat([baseModel("stepfun-ai/step-3.7-flash")])[0];
assert.equal(stepfun.reasoning, true);

const deepseek = applyFamilyCompat([baseModel("deepseek-ai/deepseek-v4-test")])[0];
assert.equal(deepseek.reasoning, true);

const minimax = applyFamilyCompat([baseModel("minimaxai/minimax-m3")])[0];
assert.equal(minimax.reasoning, true);

// NIM must not inherit pi's OpenAI storage default for any family.
const genericNim = applyFamilyCompat([baseModel("meta/llama-3.3-70b-instruct")])[0];
assert.equal(genericNim.compat?.supportsStore, false);

// 3) Model filter should exclude known embedding-only models.
assert.equal(STATIC_MODELS.some((model) => model.id === "baai/bge-m3"), false);

// Retired DeepSeek V4 endpoints must not resurface in the static list.
assert.equal(STATIC_MODELS.some((model) => model.id === "deepseek-ai/deepseek-v4-flash"), false);
assert.equal(STATIC_MODELS.some((model) => model.id === "deepseek-ai/deepseek-v4-pro"), false);
assert.equal(STATIC_MODEL_MAP.has("deepseek-ai/deepseek-v4-flash-0731"), true);

// Retired 2026-07/08 (HTTP 410 Gone). Must not be re-added by future scraper runs.
const RETIRED_2026 = [
  "microsoft/phi-4-mini-instruct",
  "microsoft/phi-4-multimodal-instruct",
  "nvidia/nemotron-3-content-safety",
  "nvidia/nemotron-content-safety-reasoning-4b",
  "stockmark/stockmark-2-100b-instruct",
  "qwen/qwen3.5-122b-a10b",
  "mistralai/mistral-large-3-675b-instruct-2512",
  "abacusai/dracarys-llama-3.1-70b-instruct",
  "bytedance/seed-oss-36b-instruct",
  "google/gemma-2-2b-it",
  "google/gemma-3n-e2b-it",
  "google/gemma-3n-e4b-it",
  "meta/llama-4-maverick-17b-128e-instruct",
  "minimaxai/minimax-m2.7",
  "mistralai/ministral-14b-instruct-2512",
  "mistralai/mistral-small-4-119b-2603",
  "mistralai/mixtral-8x7b-instruct-v0.1",
  "nvidia/gliner-pii",
  "nvidia/ising-calibration-1-35b-a3b",
  "qwen/qwen3-next-80b-a3b-instruct",
  "qwen/qwen3.5-397b-a17b",
  "sarvamai/sarvam-m",
  "stepfun-ai/step-3.5-flash",
  "upstage/solar-10.7b-instruct",
  "mistralai/mistral-medium-3.5-128b",
];
for (const id of RETIRED_2026) {
  assert.equal(STATIC_MODEL_MAP.has(id), false, id);
}

// Ghost 2026-08: listed in the catalog but chat requests 404
// "Function not found for account" (dead routing, not EOL-announced).
const GHOST_2026_08 = [
  "01-ai/yi-large",
  "ai21labs/jamba-1.5-large-instruct",
  "databricks/dbrx-instruct",
  "deepseek-ai/deepseek-coder-6.7b-instruct",
  "google/gemma-2b",
  "google/gemma-3-12b-it",
  "google/gemma-3-4b-it",
  "ibm/granite-3.0-3b-a800m-instruct",
  "ibm/granite-3.0-8b-instruct",
  "meta/codellama-70b",
  "meta/llama2-70b",
  "microsoft/phi-3-vision-128k-instruct",
  "microsoft/phi-3.5-moe-instruct",
  "mistralai/codestral-22b-instruct-v0.1",
  "mistralai/mistral-7b-instruct-v0.3",
  "mistralai/mistral-large",
  "mistralai/mistral-large-2-instruct",
  "mistralai/mixtral-8x22b-v0.1",
  "moonshotai/kimi-k2.6",
  "nv-mistralai/mistral-nemo-12b-instruct",
  "nvidia/llama-3.1-nemotron-51b-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/mistral-nemo-minitron-8b-8k-instruct",
  "nvidia/nemotron-4-340b-instruct",
  "nvidia/nemotron-nano-3-30b-a3b",
  "nvidia/vila",
  // Retired 2026-08-27 sweep (HTTP 410): Llama 3.x base generation,
  // Nemotron Super v1/v1.5 + Nano VL/Nano 9B v2 + Mini 4B, Inkling, GLM-5.2.
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.2-1b-instruct",
  "meta/llama-3.2-3b-instruct",
  "meta/llama-3.3-70b-instruct",
  "nvidia/llama-3.1-nemotron-nano-8b-v1",
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/nemotron-mini-4b-instruct",
  "nvidia/nemotron-nano-12b-v2-vl",
  "nvidia/nvidia-nemotron-nano-9b-v2",
  "thinkingmachines/inkling",
  "z-ai/glm-5.2",
  "writer/palmyra-creative-122b",
  "writer/palmyra-fin-70b-32k",
  "writer/palmyra-med-70b",
  "writer/palmyra-med-70b-32k",
  "zyphra/zamba2-7b-instruct",
];
for (const id of GHOST_2026_08) {
  assert.equal(STATIC_MODEL_MAP.has(id), false, id);
}

// 4) Known models should still classify as expected.
assert.equal(
  classifyThinkingFormat("deepseek-ai/deepseek-v4-flash-0731"),
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
for (const modelId of ["deepseek-ai/deepseek-v4-flash-0731"]) {
  const model = STATIC_MODEL_MAP.get(modelId);
  assert.deepEqual(model?.thinkingLevelMap, deepseekV4Levels, modelId);
}
assert.equal(classifyThinkingFormat("minimaxai/minimax-m3"), "minimax-inline");
assert.equal(
  classifyThinkingFormat("openai/gpt-oss-120b"),
  "none"
);
assert.equal(STATIC_MODEL_MAP.get("stepfun-ai/step-3.7-flash")?.reasoning, true);
assert.equal(STATIC_MODEL_MAP.get("poolside/laguna-xs-2.1")?.reasoning, true);
assert.equal(STATIC_MODEL_MAP.get("poolside/laguna-xs-2.1")?.compat?.thinkingFormat, "qwen-chat-template");
assert.equal(STATIC_MODEL_MAP.get("moonshotai/kimi-k3")?.reasoning, true);
assert.deepEqual(STATIC_MODEL_MAP.get("moonshotai/kimi-k3")?.input, ["text", "image"]);
assert.equal(STATIC_MODEL_MAP.get("moonshotai/kimi-k3")?.contextWindow, 1048576); // official build-card value (2026-08-28)
assert.equal(STATIC_MODEL_MAP.get("moonshotai/kimi-k3")?.maxTokens, 65536);
assert.equal(classifyThinkingFormat("moonshotai/kimi-k3"), "kimi");
assert.deepEqual(STATIC_MODEL_MAP.get("moonshotai/kimi-k3")?.thinkingLevelMap, {
  off: "none",
  low: "low",
  high: "high",
  max: "max",
});
const museGlimmer = STATIC_MODEL_MAP.get("meta/muse-glimmer-30b");
assert.ok(museGlimmer);
assert.equal(museGlimmer.reasoning, true);
assert.deepEqual(museGlimmer.input, ["text", "image"]);
assert.equal(museGlimmer.contextWindow, 131072);
assert.equal(museGlimmer.maxTokens, 131072);
assert.equal(museGlimmer.compat?.supportsReasoningEffort, true);
assert.equal(museGlimmer.compat?.requiresReasoningContentOnAssistantMessages, true);
assert.deepEqual(museGlimmer.thinkingLevelMap, {
  off: "none",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "max",
  max: "max",
});

// Nemotron 3.5 Lightning 30B: nemotron-3-super-effort handler transport
// (enable_thinking + reasoning_budget), text-only, 1M context.
const nemotron35Lightning = STATIC_MODEL_MAP.get("nvidia/nemotron-3.5-lightning-30b-a3b");
assert.ok(nemotron35Lightning);
assert.equal(nemotron35Lightning.reasoning, true);
assert.deepEqual(nemotron35Lightning.input, ["text"]);
assert.equal(nemotron35Lightning.contextWindow, 1048576);
assert.equal(nemotron35Lightning.maxTokens, 32768);
assert.equal(nemotron35Lightning.reasoningBudget, 32768);
assert.equal(nemotron35Lightning.compat?.supportsReasoningEffort, true);
assert.equal(nemotron35Lightning.compat?.maxTokensField, "max_tokens");
assert.equal(classifyThinkingFormat("nvidia/nemotron-3.5-lightning-30b-a3b"), "nemotron-3-super-effort");
assert.deepEqual(nemotron35Lightning.thinkingLevelMap, {
  off: "none",
  minimal: "low",
  low: "low",
  medium: "high",
  high: "high",
  xhigh: "high",
});

// 5) Kimi K3 semantics and NIM transport remain separately recorded.
assert.equal(getReasoningCapability("moonshotai/kimi-k3"), KIMI_K3_REASONING_CAPABILITY);
assert.equal(KIMI_K3_REASONING_CAPABILITY.semantics.supportsEffort, true);
assert.deepEqual(KIMI_K3_REASONING_CAPABILITY.semantics.acceptedEfforts, ["low", "high", "max"]);
assert.equal(KIMI_K3_REASONING_CAPABILITY.verification.requestTransport, "probe-passed");
assert.equal(KIMI_K3_REASONING_CAPABILITY.verification.tools, "probe-passed");
assert.equal(KIMI_K3_REASONING_CAPABILITY.verification.streaming, "probe-passed");
assert.equal(getReasoningCapability("deepseek-ai/deepseek-v4-flash-0731"), DEEPSEEK_V4_FLASH_REASONING_CAPABILITY);
assert.equal(DEEPSEEK_V4_FLASH_REASONING_CAPABILITY.verification.responseTransport, "probe-passed");
assert.equal(getReasoningCapability("poolside/laguna-xs-2.1"), LAGUNA_XS_21_REASONING_CAPABILITY);
assert.equal(LAGUNA_XS_21_REASONING_CAPABILITY.nimTransport.requestEncoding, "chat-template-kwargs");
assert.equal(LAGUNA_XS_21_REASONING_CAPABILITY.verification.requestTransport, "probe-passed");
assert.equal(LAGUNA_XS_21_REASONING_CAPABILITY.verification.streaming, "probe-passed");
assert.equal(getReasoningCapability("minimaxai/minimax-m3"), MINIMAX_M3_REASONING_CAPABILITY);
assert.equal(MINIMAX_M3_REASONING_CAPABILITY.nimTransport.requestEncoding, "chat-template-kwargs");
assert.equal(MINIMAX_M3_REASONING_CAPABILITY.verification.requestTransport, "probe-passed");
assert.equal(MINIMAX_M3_REASONING_CAPABILITY.verification.responseTransport, "probe-passed");
assert.equal(MINIMAX_M3_REASONING_CAPABILITY.verification.streaming, "probe-passed");
assert.equal(getReasoningCapability("meta/muse-glimmer-30b"), MUSE_GLIMMER_30B_REASONING_CAPABILITY);
assert.equal(MUSE_GLIMMER_30B_REASONING_CAPABILITY.nimTransport.requestEncoding, "reasoning-effort");
assert.equal(MUSE_GLIMMER_30B_REASONING_CAPABILITY.verification.streaming, "probe-passed");
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
  model: "deepseek-ai/deepseek-v4-flash-0731",
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
