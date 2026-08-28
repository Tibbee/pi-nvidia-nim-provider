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
      model: "deepseek-ai/deepseek-v4-flash-0731",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "deepseek-ai/deepseek-v4-flash-0731",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: {
        thinking: true,
        reasoning_effort: "high",
      },
      max_tokens: 16384,
    },
  },
  {
    name: "kimi-k3 passes reasoning_effort through when enabled",
    provider: "nvidia-nim",
    payload: {
      model: "moonshotai/kimi-k3",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "moonshotai/kimi-k3",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: {
        thinking: true,
      },
      reasoning_effort: "high",
      max_tokens: 65536,
    },
  },
  {
    name: "kimi-k3 max effort passes through top-level",
    provider: "nvidia-nim",
    payload: {
      model: "moonshotai/kimi-k3",
      thinking: { type: "enabled" },
      reasoning_effort: "max",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "moonshotai/kimi-k3",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: {
        thinking: true,
      },
      reasoning_effort: "max",
      max_tokens: 65536,
    },
  },
  {
    name: "kimi-k3 low effort passes through top-level",
    provider: "nvidia-nim",
    payload: {
      model: "moonshotai/kimi-k3",
      thinking: { type: "enabled" },
      reasoning_effort: "low",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "moonshotai/kimi-k3",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: {
        thinking: true,
      },
      reasoning_effort: "low",
      max_tokens: 65536,
    },
  },
  {
    name: "kimi-k3 enabled without effort defaults to high",
    provider: "nvidia-nim",
    payload: {
      model: "moonshotai/kimi-k3",
      thinking: { type: "enabled" },
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "moonshotai/kimi-k3",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: {
        thinking: true,
      },
      reasoning_effort: "high",
      max_tokens: 65536,
    },
  },
  {
    name: "kimi-k3 disables thinking boolean-only",
    provider: "nvidia-nim",
    payload: {
      model: "moonshotai/kimi-k3",
      thinking: { type: "disabled" },
      reasoning_effort: "none",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "moonshotai/kimi-k3",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: {
        thinking: false,
      },
      max_tokens: 65536,
    },
  },
  {
    name: "kimi-k3 without thinking params only gets max_tokens default",
    provider: "nvidia-nim",
    payload: {
      model: "moonshotai/kimi-k3",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "moonshotai/kimi-k3",
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 65536,
    },
  },
  {
    name: "nemotron 3 super maps low effort and budget",
    provider: "nvidia-nim",
    payload: {
      model: "nvidia/nemotron-3-super-120b-a12b",
      reasoning_effort: "low",
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "nvidia/nemotron-3-super-120b-a12b",
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: { enable_thinking: true, low_effort: true },
      reasoning_budget: 32768,
      max_tokens: 32768,
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
    name: "laguna xs 2.1 uses chat-template thinking",
    provider: "nvidia-nim",
    payload: {
      model: "poolside/laguna-xs-2.1",
      chat_template_kwargs: { enable_thinking: true, preserve_thinking: true },
      messages: [{ role: "user", content: "hello" }],
    },
    expected: {
      model: "poolside/laguna-xs-2.1",
      chat_template_kwargs: { enable_thinking: true, preserve_thinking: true },
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 16384,
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
      model: "moonshotai/kimi-k3",
      thinking: { type: "enabled" },
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
