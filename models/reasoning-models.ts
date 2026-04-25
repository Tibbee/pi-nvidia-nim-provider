/**
 * Reasoning / Thinking Models on NVIDIA NIM
 *
 * Models designed for complex reasoning and long-context understanding.
 * Many use custom thinking formats handled by before_provider_request.
 */
import type { NimModelConfig } from "./types";

export const REASONING_MODELS: NimModelConfig[] = [
  // ── DeepSeek V3 (reasoning via chat_template_kwargs.thinking) ───────────
  // Thinking: chat_template_kwargs: { thinking: true/false }
  // Handled by before_provider_request — NOT thinkingFormat: "deepseek"
  {
    id: "deepseek-ai/deepseek-v3.1",
    name: "DeepSeek V3.1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: "deepseek-ai/deepseek-v3.1-terminus",
    name: "DeepSeek V3.1 Terminus",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: "deepseek-ai/deepseek-v3.2",
    name: "DeepSeek V3.2",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── DeepSeek R1 Distills ────────────────────────────────────────────────
  // Same thinking format as V3: chat_template_kwargs: { thinking: true/false }
  {
    id: "deepseek-ai/deepseek-r1-distill-qwen-32b",
    name: "DeepSeek R1 Distill Qwen 32B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "deepseek-ai/deepseek-r1-distill-qwen-14b",
    name: "DeepSeek R1 Distill Qwen 14B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "deepseek-ai/deepseek-r1-distill-qwen-7b",
    name: "DeepSeek R1 Distill Qwen 7B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: "deepseek-ai/deepseek-r1-distill-llama-8b",
    name: "DeepSeek R1 Distill Llama 8B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── OpenAI GPT-OSS ──────────────────────────────────────────────────────
  // Supports standard reasoning_effort with mapping (minimal → low)
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── Qwen3 Next (reasoning via qwen-chat-template) ───────────────────────
  {
    id: "qwen/qwen3-next-80b-a3b-instruct",
    name: "Qwen3 Next 80B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: "qwen/qwen3-next-80b-a3b-thinking",
    name: "Qwen3 Next 80B Thinking",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── Qwen3.5 ─────────────────────────────────────────────────────────────
  {
    id: "qwen/qwen3.5-122b-a10b",
    name: "Qwen3.5 122B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "qwen/qwen3.5-397b-a17b",
    name: "Qwen3.5 397B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 32768,
  },

  // ── Qwen3 base ──────────────────────────────────────────────────────────
  {
    id: "qwen/qwen3-235b-a22b",
    name: "Qwen3 235B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── Qwen QwQ ────────────────────────────────────────────────────────────
  {
    id: "qwen/qwq-32b",
    name: "QwQ 32B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── Kimi K2 Thinking / K2.5 ─────────────────────────────────────────────
  // Thinking: chat_template_kwargs: { thinking: true/false }
  // Handled by before_provider_request
  {
    id: "moonshotai/kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 32768,
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 32768,
  },

  // ── Microsoft Phi-4 Mini Flash Reasoning ────────────────────────────────
  // thinkingFormat: "qwen-chat-template" (pi handles natively)
  {
    id: "microsoft/phi-4-mini-flash-reasoning",
    name: "Phi-4 Mini Flash Reasoning",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
    // Override family compat — Phi reasoning uses qwen-chat-template
    compat: {
      thinkingFormat: "qwen-chat-template",
    },
  },

  // ── NVIDIA Nemotron thinking models ─────────────────────────────────────
  // Nemotron Nano: thinkingFormat: "qwen-chat-template" (pi handles natively)
  {
    id: "nvidia/nvidia-nemotron-nano-9b-v2",
    name: "Nemotron Nano 9B Thinking",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
  // Nemotron Ultra/Super: chat_template_kwargs: { thinking: true/false }
  // Handled by before_provider_request
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    name: "Nemotron Ultra 253B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1",
    name: "Nemotron Super 49B v1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    name: "Nemotron Super 49B v1.5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── Mistral Large 3 ─────────────────────────────────────────────────────
  {
    id: "mistralai/mistral-large-3-675b-instruct-2512",
    name: "Mistral Large 3 675B",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
];
