import assert from "node:assert/strict";
import { handleBeforeProviderRequest } from "../index";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function run(provider: string, payload: Record<string, unknown>) {
  const result = handleBeforeProviderRequest({ provider, payload: deepClone(payload) });
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
    },
  },
  {
    name: "glm-5.1 injects clear_thinking into chat_template_kwargs",
    provider: "nvidia-nim",
    payload: {
      model: "z-ai/glm-5.1",
      chat_template_kwargs: { enable_thinking: true },
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "z-ai/glm-5.1",
      chat_template_kwargs: { enable_thinking: true, clear_thinking: false },
      messages: [{ role: "user", content: "hello" }],
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
    },
  },
  {
    name: "gpt-oss remains a no-op",
    provider: "nvidia-nim",
    payload: {
      model: "openai/gpt-oss-120b",
      reasoning_effort: "low",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: undefined,
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
] as const;

for (const testCase of cases) {
  const actual = run(testCase.provider, testCase.payload as Record<string, unknown>);
  assert.deepEqual(actual, testCase.expected, testCase.name);
}

console.log("before_provider_request snapshots passed");
