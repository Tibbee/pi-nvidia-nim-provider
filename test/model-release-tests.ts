import assert from "node:assert/strict";
import { STATIC_MODEL_MAP, getAllMetadata } from "../models/registry";
import { classifyThinkingFormat, findFamily } from "../config/model-families";
import { PROVIDER_MODEL_CONFIGS, handleBeforeProviderRequest } from "../index";
import { DEFAULT_NIM_IMAGE_MODEL_ID, NIM_IMAGE_MODELS, getNimImageCapability } from "../models/image-models";
import { getReasoningCapability } from "../models/capabilities";
import { classifyAvailability } from "../tools/probe_shipped_alive";

for (const id of ["mistralai/mistral-nemotron", "moonshotai/kimi-k3"]) {
  assert.equal(STATIC_MODEL_MAP.has(id), false);
  assert.equal(getAllMetadata().some(m => m.id === id), false, "retired rows cannot re-enter the generated catalog");
}
// Scheduled retirement is future-dated on 2026-10-17, so keep GLM 5.3.
assert.ok(STATIC_MODEL_MAP.has("z-ai/glm-5.3"));
const step = STATIC_MODEL_MAP.get("stepfun-ai/step-5-preview")!;
assert.ok(step);
assert.deepEqual(step.input, ["text", "image"]);
assert.equal(step.contextWindow, 1048576);
assert.equal(step.maxTokens, 4096);
assert.equal(step.reasoning, true);
assert.equal(step.compat?.supportsReasoningEffort, false);
assert.equal(step.compat?.requiresReasoningContentOnAssistantMessages, true);
assert.deepEqual(step.thinkingLevelMap, { off: null, minimal: null, low: null, medium: null, high: "high", xhigh: null, max: null });
assert.equal(getReasoningCapability(step.id)?.semantics.canDisable, false);
assert.equal(classifyThinkingFormat(step.id), "none");

const vl = STATIC_MODEL_MAP.get("nvidia/nemotron-3.5-super-vl-120b-a12b")!;
assert.ok(vl);
assert.deepEqual(vl.input, ["text", "image"]);
assert.equal(vl.contextWindow, 262144, "hosted configuration wins over the upstream 1M architecture");
assert.equal(vl.maxTokens, 131072);
assert.equal(vl.reasoningBudget, undefined, "do not inherit generic Nemotron's undocumented budget");
assert.equal(findFamily(vl.id)?.name, "nemotron-3.5-super-vl");
assert.equal(classifyThinkingFormat(vl.id), "nemotron-3-super-effort");
assert.deepEqual(vl.thinkingLevelMap, { off: "none", minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: null });
assert.equal(vl.compat?.requiresReasoningContentOnAssistantMessages, true);
// Switching from low back to high removes stale low_effort.
const payload = { model: vl.id, reasoning_effort: "high", chat_template_kwargs: { low_effort: true }, max_tokens: 128 };
handleBeforeProviderRequest({ payload }, { model: { provider: "nvidia-nim" } as never });
assert.deepEqual(payload.chat_template_kwargs, { enable_thinking: true });

assert.equal(DEFAULT_NIM_IMAGE_MODEL_ID, "black-forest-labs/flux-3-image-klein");
assert.deepEqual(NIM_IMAGE_MODELS.map(m => m.id), [DEFAULT_NIM_IMAGE_MODEL_ID, "black-forest-labs/flux.2-klein-4b"]);
assert.equal(PROVIDER_MODEL_CONFIGS.some(m => m.id === "black-forest-labs/flux.2-klein-4b"), true);
assert.equal(getNimImageCapability("black-forest-labs/flux.2-klein-4b")?.promptMaxLength, 800);
assert.equal(getNimImageCapability(DEFAULT_NIM_IMAGE_MODEL_ID)?.endpoint,
  "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein");

assert.equal(classifyAvailability(410, "This model has reached its end of life"), "retired");
for (const status of [undefined, 400, 401, 402, 403, 404, 422, 429, 500, 503, 504]) {
  assert.equal(classifyAvailability(status, "Function not found for account"), "inconclusive");
}
assert.equal(classifyAvailability(410, "unknown gateway response"), "inconclusive");
assert.equal(classifyAvailability(200), "responding");
console.log("model release and retirement-policy tests passed");
