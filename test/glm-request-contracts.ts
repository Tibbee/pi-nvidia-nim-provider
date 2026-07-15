import assert from "node:assert/strict";
import { handleBeforeProviderRequest } from "../index";

const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

function buildPiPayload(level: (typeof levels)[number]) {
  return {
    model: "z-ai/glm-5.2",
    messages: [{ role: "user", content: "hello" }],
    chat_template_kwargs: {
      enable_thinking: level !== "off",
      preserve_thinking: true,
    },
    tools: [{
      type: "function",
      function: {
        name: "read_file",
        description: "Read a file.",
        parameters: { type: "object", properties: {} },
      },
    }],
    tool_choice: "auto",
    response_format: { type: "json_object" },
    seed: 42,
    temperature: 0,
  };
}

for (const level of levels) {
  const payload = buildPiPayload(level);
  const result = handleBeforeProviderRequest(
    { payload },
    { model: { provider: "nvidia-nim" } as any },
  ) as Record<string, any>;

  assert.ok(result, `${level} should produce a transformed payload`);
  assert.equal(result.chat_template_kwargs.enable_thinking, level !== "off", level);
  assert.equal(result.chat_template_kwargs.clear_thinking, level === "off", level);
  assert.equal("preserve_thinking" in result.chat_template_kwargs, false, level);
  assert.equal("reasoning_effort" in result, false, level);
  assert.deepEqual(result.tools, payload.tools, level);
  assert.equal(result.tool_choice, "auto", level);
  assert.deepEqual(result.response_format, { type: "json_object" }, level);
  assert.equal(result.seed, 42, level);
  assert.equal(result.temperature, 0, level);
  assert.equal(result.max_tokens, 32768, level);
}

const candidateEffortPayload = {
  model: "z-ai/glm-5.2",
  thinking: { type: "enabled" },
  reasoning_effort: "high",
  messages: [{ role: "user", content: "hello" }],
};
const candidateResult = handleBeforeProviderRequest(
  { payload: candidateEffortPayload },
  { model: { provider: "nvidia-nim" } as any },
) as Record<string, any>;
assert.equal("reasoning_effort" in candidateResult, false);
assert.equal("reasoning_effort" in candidateResult.chat_template_kwargs, false);

console.log("GLM request contracts passed");
