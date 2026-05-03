// Internal model shape used while building the provider list.
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
  reasoningEffortValues?: string[];
  reasoningEffortDefault?: string;
  thinkingLevelMap?: Partial<Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh", string | null>>;
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
  exampleRequestExtra?: Record<string, unknown>;
}

// Internal labels for NIM thinking routing.
export type NimThinkingFormat =
  | "qwen-chat-template"
  | "deepseek-v4"
  | "deepseek-nim"
  | "stepfun-parallel"
  | "minimax-inline"
  | "reasoning-effort"
  | "none";
