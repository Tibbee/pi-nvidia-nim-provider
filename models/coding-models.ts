/**
 * Coding / Agentic Models on NVIDIA NIM
 *
 * Models designed for code generation, agentic coding, and tool-calling.
 * Reasoning models here use various thinking formats handled by
 * before_provider_request (NOT pi's built-in thinkingFormat).
 */
import type { NimModelConfig } from "./types";

export const CODING_MODELS: NimModelConfig[] = [
  // ── DeepSeek V4 (flagship coding models) ────────────────────────────────
  // Thinking: chat_template_kwargs: { reasoning_effort: "none"|"high"|"max" }
  // Handled by before_provider_request — NOT thinkingFormat: "deepseek"
  {
    id: "deepseek-ai/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 32768,
  },
  {
    id: "deepseek-ai/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 32768,
  },

  // ── Qwen Coder ─────────────────────────────────────────────────────────
  // Qwen3 Coder: thinkingFormat: "qwen-chat-template" (pi handles natively)
  {
    id: "qwen/qwen3-coder-480b-a35b-instruct",
    name: "Qwen3 Coder 480B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    name: "Qwen2.5 Coder 32B",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── Mistral Devstral / Codestral ────────────────────────────────────────
  {
    id: "mistralai/devstral-2-123b-instruct-2512",
    name: "Devstral 2 123B",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "mistralai/codestral-22b-instruct-v0.1",
    name: "Codestral 22B",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 8192,
  },
  {
    id: "mistralai/mistral-small-4-119b-2603",
    name: "Mistral Small 4 119B",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 8192,
  },

  // ── Mistral Magistral (reasoning via qwen-chat-template) ────────────────
  {
    id: "mistralai/magistral-small-2506",
    name: "Magistral Small",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
    // Override family compat — Magistral uses qwen-chat-template, not the
    // generic Mistral family which has no thinkingFormat
    compat: {
      thinkingFormat: "qwen-chat-template",
    },
  },

  // ── Google Gemma 4 (coding-tuned) ───────────────────────────────────────
  {
    id: "google/gemma-4-31b-it",
    name: "Gemma 4 31B",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── Kimi K2 (non-thinking variants) ─────────────────────────────────────
  {
    id: "moonshotai/kimi-k2-instruct",
    name: "Kimi K2",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "moonshotai/kimi-k2-instruct-0905",
    name: "Kimi K2 (0905)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },

  // ── MiniMax M2 (always thinks inline, no kwargs control) ────────────────
  {
    id: "minimaxai/minimax-m2.7",
    name: "MiniMax M2.7",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 16384,
  },
  {
    id: "minimaxai/minimax-m2.5",
    name: "MiniMax M2.5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 16384,
  },
  {
    id: "minimaxai/minimax-m2.1",
    name: "MiniMax M2.1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 16384,
  },
  {
    id: "minimaxai/minimax-m2",
    name: "MiniMax M2",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 16384,
  },

  // ── GLM (Zhipu AI) ──────────────────────────────────────────────────────
  // thinkingFormat: "qwen-chat-template" (pi handles natively)
  {
    id: "z-ai/glm-5.1",
    name: "GLM-5.1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "z-ai/glm5",
    name: "GLM-5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "z-ai/glm4.7",
    name: "GLM-4.7",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },

  // ── StepFun (Parallel Thinking / PaCoRe) ────────────────────────────────
  // Thinking: chat_template_kwargs: { parallel_reasoning_mode: "none"|"low"|"medium"|"heavy" }
  // Handled by before_provider_request
  {
    id: "stepfun-ai/step-3.5-flash",
    name: "Step 3.5 Flash",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 262144,
  },

  // ── ByteDance Seed ──────────────────────────────────────────────────────
  // thinkingFormat: "qwen-chat-template" (pi handles natively)
  {
    id: "bytedance/seed-oss-36b-instruct",
    name: "Seed OSS 36B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── Abacus AI (Dracarys) ────────────────────────────────────────────────
  {
    id: "abacusai/dracarys-llama-3.1-70b-instruct",
    name: "Dracarys Llama 3.1 70B",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },

  // ── Sarvam AI ───────────────────────────────────────────────────────────
  {
    id: "sarvamai/sarvam-m",
    name: "Sarvam M",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 4096,
  },
];
