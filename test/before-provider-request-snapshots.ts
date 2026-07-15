import assert from "node:assert/strict";
import { handleBeforeProviderRequest } from "../index";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function run(provider: string, payload: Record<string, unknown>) {
  const result = handleBeforeProviderRequest(
    { payload: deepClone(payload) },
    { model: { provider } as any },
  );
  return result ? deepClone(result as Record<string, unknown>) : undefined;
}

const cases = [
  {
    name: "deepseek-v4-flash rewrites to chat_template_kwargs",
    provider: "nvidia-nim",
    payload: {
      model: "deepseek-ai/deepseek-v4-flash",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "deepseek-ai/deepseek-v4-flash",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: {
        thinking: true,
        reasoning_effort: "high",
      },
      max_tokens: 16384,
    },
  },
  {
    name: "seed-oss injects top-level thinking_budget",
    provider: "nvidia-nim",
    payload: {
      model: "bytedance/seed-oss-36b-instruct",
      thinking: { type: "enabled" },
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "bytedance/seed-oss-36b-instruct",
      messages: [{ role: "user", content: "hello" }],
      thinking_budget: 16384,
      max_tokens: 32768,
    },
  },
  {
    name: "glm-5.2 injects clear_thinking with thinking enabled",
    provider: "nvidia-nim",
    payload: {
      model: "z-ai/glm-5.2",
      chat_template_kwargs: { enable_thinking: true },
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "z-ai/glm-5.2",
      chat_template_kwargs: { enable_thinking: true, clear_thinking: false },
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 32768,
    },
  },
  {
    name: "glm-5.2 disables thinking with clear_thinking:true",
    provider: "nvidia-nim",
    payload: {
      model: "z-ai/glm-5.2",
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "z-ai/glm-5.2",
      chat_template_kwargs: { enable_thinking: false, clear_thinking: true },
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 32768,
    },
  },
  {
    name: "nvidia-nemotron-nano-9b-v2 injects system think mode",
    provider: "nvidia-nim",
    payload: {
      model: "nvidia/nvidia-nemotron-nano-9b-v2",
      reasoning_effort: "high",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "nvidia/nvidia-nemotron-nano-9b-v2",
      messages: [
        { role: "system", content: "/think" },
        { role: "user", content: "hello" },
      ],
      min_thinking_tokens: 1024,
      max_thinking_tokens: 4096,
      max_tokens: 8192,
    },
  },
  {
    name: "gpt-oss injects max_tokens",
    provider: "nvidia-nim",
    payload: {
      model: "openai/gpt-oss-120b",
      reasoning_effort: "low",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "openai/gpt-oss-120b",
      reasoning_effort: "low",
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 4096,
    },
  },
  {
    name: "non-NIM models are untouched",
    provider: "openrouter",
    payload: {
      model: "openai/gpt-4o",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: undefined,
  },
  {
    name: "known NIM model is untouched for another provider",
    provider: "openrouter",
    payload: {
      model: "z-ai/glm-5.2",
      chat_template_kwargs: { enable_thinking: true },
      messages: [{ role: "user", content: "hello" }],
    },
    expected: undefined,
  },
  {
    name: "minimax-m3 with thinking enabled (no effort) sets thinking_mode:adaptive",
    provider: "nvidia-nim",
    payload: {
      model: "minimaxai/minimax-m3",
      thinking: { type: "enabled" },
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "minimaxai/minimax-m3",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: { thinking_mode: "adaptive" },
      max_tokens: 16384,
    },
  },
  {
    name: "minimax-m3 with xhigh reasoning_effort sets thinking_mode:enabled",
    provider: "nvidia-nim",
    payload: {
      model: "minimaxai/minimax-m3",
      reasoning_effort: "xhigh",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "minimaxai/minimax-m3",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: { thinking_mode: "enabled" },
      max_tokens: 16384,
    },
  },
  {
    name: "minimax-m3 with thinking disabled sets thinking_mode:disabled",
    provider: "nvidia-nim",
    payload: {
      model: "minimaxai/minimax-m3",
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "minimaxai/minimax-m3",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: { thinking_mode: "disabled" },
      max_tokens: 16384,
    },
  },
] as const;

for (const testCase of cases) {
  const actual = run(testCase.provider, testCase.payload as Record<string, unknown>);
  assert.deepEqual(actual, testCase.expected, testCase.name);
}

console.log("before_provider_request snapshots passed");
