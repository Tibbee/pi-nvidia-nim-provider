/**
 * Vision / Multimodal Models on NVIDIA NIM
 *
 * Models that accept image input in addition to text.
 */
import type { NimModelConfig } from "./types";

export const VISION_MODELS: NimModelConfig[] = [
  // ── Meta Llama Vision ───────────────────────────────────────────────────
  {
    id: "meta/llama-3.2-11b-vision-instruct",
    name: "Llama 3.2 11B Vision",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 4096,
  },
  {
    id: "meta/llama-3.2-90b-vision-instruct",
    name: "Llama 3.2 90B Vision",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 4096,
  },

  // ── Google Gemma Vision ─────────────────────────────────────────────────
  {
    id: "google/gemma-3-27b-it",
    name: "Gemma 3 27B Vision",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
  },

  // ── Microsoft Phi Multimodal ────────────────────────────────────────────
  {
    id: "microsoft/phi-4-multimodal-instruct",
    name: "Phi-4 Multimodal",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: "microsoft/phi-3-vision-128k-instruct",
    name: "Phi-3 Vision 128K",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 4096,
  },

  // ── NVIDIA Nemotron Vision ──────────────────────────────────────────────
  {
    id: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
    name: "Nemotron Nano VL 8B",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 4096,
  },
  {
    id: "nvidia/nemotron-nano-12b-v2-vl",
    name: "Nemotron Nano 12B VL",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 4096,
  },
];
