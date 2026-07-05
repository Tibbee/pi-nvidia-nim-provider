// Converts pi thinking payloads into NIM-specific kwargs.
type Payload = Record<string, unknown>;

export interface TransformResult {
  modified: boolean;
  // Set by cases where hasEnabledThinking(payload) would lose the thinking
  // state after transformation (e.g. system-message-based models that delete
  // top-level thinking/reasoning_effort params).
  thinkingEnabled?: boolean;
}

function isDeepSeekThinkingEnabled(payload: Payload): boolean {
  const thinking = payload.thinking as { type?: string } | undefined;
  if (thinking?.type === "enabled") return true;

  const effort = payload.reasoning_effort as string | undefined;
  return !!effort && effort !== "off" && effort !== "none";
}

function getReasoningEffort(payload: Payload): string | undefined {
  const effort = payload.reasoning_effort as string | undefined;
  return effort && effort !== "off" && effort !== "none" ? effort : undefined;
}

export function hasEnabledThinking(payload: Payload): boolean {
  const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;
  if (kwargs?.enable_thinking === true) return true;
  if (kwargs?.thinking === true) return true;
  if (isDeepSeekThinkingEnabled(payload)) return true;
  if (getReasoningEffort(payload) != null) return true;
  return false;
}

export function applyCustomThinkingFormat(
  payload: Payload,
  format: string
): TransformResult {
  // Guard: only transform when there are thinking params to convert.
  // If pi didn't send thinking/reasoning_effort, the API defaults to no thinking.
  // Exception: qwen-chat-template for GLM needs explicit disabling (handled below).
  const hasThinkingParams =
    payload.thinking !== undefined ||
    payload.reasoning_effort !== undefined;

  switch (format) {
    case "deepseek-v4": {
      if (!hasThinkingParams) return { modified: false };
      // DeepSeek V4: thinking + reasoning_effort in chat_template_kwargs.
      // When thinking is off, only set thinking: false (no reasoning_effort).
      const thinking = isDeepSeekThinkingEnabled(payload);
      const effort = getReasoningEffort(payload);
      const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;

      delete payload.thinking;
      delete payload.reasoning_effort;

      payload.chat_template_kwargs = {
        ...(kwargs ?? {}),
        thinking,
      };

      if (thinking) {
        payload.chat_template_kwargs.reasoning_effort = effort ?? "high";
      }
      return { modified: true, thinkingEnabled: thinking };
    }

    case "deepseek-nim": {
      if (!hasThinkingParams) return { modified: false };
      // DeepSeek/Nemotron/Kimi only need chat_template_kwargs.thinking.
      const thinking = isDeepSeekThinkingEnabled(payload);
      const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;

      delete payload.thinking;
      delete payload.reasoning_effort;

      payload.chat_template_kwargs = {
        ...(kwargs ?? {}),
        thinking,
      };
      return { modified: true, thinkingEnabled: thinking };
    }

    case "thinking-budget": {
      if (!hasThinkingParams) return { modified: false };
      // Always-on thinking with top-level thinking_budget param (Seed OSS).
      // Clean up any pi-injected params; the budget is injected by index.ts.
      delete payload.thinking;
      delete payload.reasoning_effort;
      return { modified: true, thinkingEnabled: true };
    }

    case "nemotron-3-super-effort": {
      if (!hasThinkingParams) return { modified: false };
      // Nemotron 3 Super 120B: enable_thinking + low_effort + reasoning_budget.
      // Pi sends reasoning_effort (none/low/high); convert to kwargs.
      const effort = getReasoningEffort(payload);
      const thinking = !!effort;
      const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;

      delete payload.thinking;
      delete payload.reasoning_effort;

      payload.chat_template_kwargs = {
        ...(kwargs ?? {}),
        enable_thinking: thinking,
      };

      // Set low_effort flag only when effort is "low".
      if (thinking && effort === "low") {
        payload.chat_template_kwargs.low_effort = true;
      } else {
        delete (payload.chat_template_kwargs as Record<string, unknown>).low_effort;
      }

      return { modified: true, thinkingEnabled: thinking };
    }

    case "nemotron-system-detailed": {
      if (!hasThinkingParams) return { modified: false };
      // Llama 3.3 Nemotron Super 49B v1: system message "detailed thinking on/off".
      const thinking = getReasoningEffort(payload) != null;

      delete payload.thinking;
      delete payload.reasoning_effort;

      const messages = (payload.messages as any[]) || [];
      // Remove any existing "detailed thinking" system messages.
      const filtered = messages.filter((m: any) =>
        !(m.role === "system" && typeof m.content === "string" &&
          (m.content.includes("detailed thinking on") || m.content.includes("detailed thinking off")))
      );
      // Inject the appropriate system message at the beginning.
      filtered.unshift({
        role: "system",
        content: thinking ? "detailed thinking on" : "detailed thinking off",
      });
      payload.messages = filtered;
      return { modified: true, thinkingEnabled: thinking };
    }

    case "nemotron-system-think": {
      if (!hasThinkingParams) return { modified: false };
      // Nemotron Super v1.5 / Nano 9B v2: system message /think or /no_think.
      const thinking = getReasoningEffort(payload) != null;

      delete payload.thinking;
      delete payload.reasoning_effort;

      const messages = (payload.messages as any[]) || [];
      // Remove any existing /think or /no_think system messages.
      const filtered = messages.filter((m: any) =>
        !(m.role === "system" && typeof m.content === "string" &&
          (m.content === "/think" || m.content === "/no_think"))
      );
      // Inject the appropriate system message at the beginning.
      filtered.unshift({
        role: "system",
        content: thinking ? "/think" : "/no_think",
      });
      payload.messages = filtered;

      // For Nano 9B v2: inject min/max_thinking_tokens when thinking is on.
      if (thinking && /nvidia-nemotron-nano-9b-v2/.test(payload.model as string || "")) {
        payload.min_thinking_tokens = 1024;
        payload.max_thinking_tokens = 4096;
      }

      return { modified: true, thinkingEnabled: thinking };
    }

    case "qwen-chat-template": {
      // GLM models think by default; explicitly disable when reasoning is off.
      // See also: https://recipes.vllm.ai/zai-org/GLM-5.2
      const modelId = (payload.model as string | undefined) || "";
      if (/^z-ai\/glm/.test(modelId)) {
        const enabled = hasEnabledThinking(payload);
        // Capture reasoning_effort before deletion and map to GLM effort levels.
        // GLM-5.2 accepts "high" (balanced) or "max" (deep, default when omitted).
        const rawEffort = payload.reasoning_effort as string | undefined;
        const mappedEffort =
          rawEffort && !["off", "none", "minimal"].includes(rawEffort)
            ? ["xhigh", "max"].includes(rawEffort) ? "max" : "high"
            : undefined;
        const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;
        delete payload.thinking;
        delete payload.reasoning_effort;
        // Strip preserve_thinking if pi's native handler set it — GLM uses clear_thinking instead.
        const { preserve_thinking: _, ...base } = kwargs ?? {};
        if (enabled) {
          payload.chat_template_kwargs = {
            ...base,
            enable_thinking: true,
            clear_thinking: false,
            ...(mappedEffort ? { reasoning_effort: mappedEffort } : {}),
          };
          return { modified: true, thinkingEnabled: true };
        } else {
          payload.chat_template_kwargs = {
            ...base,
            enable_thinking: false,
            clear_thinking: true,
          };
          return { modified: true, thinkingEnabled: false };
        }
      }
      // Other qwen-chat-template models are handled natively by pi.
      return { modified: false };
    }
    case "minimax-inline": {
      if (!hasThinkingParams) return { modified: false };
      // MiniMax M2/M3: thinking_mode in chat_template_kwargs.
      // Maps pi thinking levels to 3 NIM modes:
      //   "disabled" — no thinking
      //   "adaptive" — model decides when to think (native MiniMax default)
      //   "enabled"  — always think at full strength (NIM-specific override)
      const thinkingOn = hasEnabledThinking(payload);
      const effort = getReasoningEffort(payload);
      const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;

      delete payload.thinking;
      delete payload.reasoning_effort;

      let thinkingMode: string;
      if (!thinkingOn) {
        thinkingMode = "disabled";
      } else if (effort && ["xhigh", "max"].includes(effort)) {
        thinkingMode = "enabled";
      } else {
        thinkingMode = "adaptive";
      }

      payload.chat_template_kwargs = {
        ...(kwargs ?? {}),
        thinking_mode: thinkingMode,
      };
      return { modified: true, thinkingEnabled: thinkingMode !== "disabled" };
    }
    case "reasoning-effort": case "none": default: return { modified: false };
  }
}
