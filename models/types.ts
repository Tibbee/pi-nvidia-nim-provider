import type { OpenAICompletionsCompat } from "@earendil-works/pi-ai";

// Internal model shape used while building the provider list.
export type NimModelCompat = OpenAICompletionsCompat;

export interface NimModelConfig {
  id: string;
  name: string;
  api?: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  reasoningBudget?: number;
  thinkingLevelMap?: Partial<Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", string | null>>;
  headers?: Record<string, string>;
  compat?: NimModelCompat;
  exampleRequestExtra?: Record<string, unknown>;
}

// Internal labels for NIM thinking routing.
export type NimThinkingFormat =
  | "qwen-chat-template"
  | "deepseek-v4"
  | "deepseek-nim"
  | "minimax-inline"
  | "reasoning-effort"
  | "thinking-budget"          // Top-level thinking_budget param (Seed OSS)
  | "nemotron-3-super-effort"  // enable_thinking + low_effort + reasoning_budget (Nemotron 3 Super 120B)
  | "nemotron-system-detailed" // System msg "detailed thinking on/off" (Llama 3.3 Nemotron Super 49B v1)
  | "nemotron-system-think"    // System msg /think or /no_think (Nemotron Super v1.5, Nemotron Nano 9B v2)
  | "none";
