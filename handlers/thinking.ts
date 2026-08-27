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

    case "kimi": {
      if (!hasThinkingParams) return { modified: false };
      // Kimi K3: a single boolean thinking mode via chat_template_kwargs.
      // Hosted NIM ignores reasoning effort for it; only on/off is meaningful
      // (probe-verified 2026-08-27: on/off, separate reasoning_content, tools).
      const thinking = isDeepSeekThinkingEnabled(payload);

      delete payload.thinking;
      delete payload.reasoning_effort;

      const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;
      payload.chat_template_kwargs = {
        ...(kwargs ?? {}),
        thinking,
      };
      return { modified: true, thinkingEnabled: thinking };
    }

    case "qwen-chat-template": {
      // Laguna XS 2.1 and DiffusionGemma are handled natively by pi — the
      // native serializer injects enable_thinking/preserve_thinking. (The GLM
      // branch that used to live here was dropped with the retired GLM-5.2.)
      return { modified: false };
    }
    case "minimax-inline": {
      if (!hasThinkingParams) return { modified: false };
      // MiniMax M3: thinking_mode in chat_template_kwargs.
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
