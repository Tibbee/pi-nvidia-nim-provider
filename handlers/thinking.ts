// Converts pi thinking payloads into NIM-specific kwargs.
type Payload = Record<string, unknown>;

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
  return getReasoningEffort(payload) != null;
}

export function applyCustomThinkingFormat(
  payload: Payload,
  format: string
): boolean {
  switch (format) {
    case "deepseek-v4": {
      // DeepSeek V4 needs thinking + effort in chat_template_kwargs.
      const thinking = isDeepSeekThinkingEnabled(payload);
      const effort = getReasoningEffort(payload);
      const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;

      delete payload.thinking;
      delete payload.reasoning_effort;

      payload.chat_template_kwargs = {
        ...(kwargs ?? {}),
        thinking,
        reasoning_effort: thinking ? (effort ?? "high") : "none",
      };
      return true;
    }

    case "deepseek-nim": {
      // DeepSeek/Nemotron/Kimi only need chat_template_kwargs.thinking.
      const thinking = isDeepSeekThinkingEnabled(payload);
      const kwargs = payload.chat_template_kwargs as Record<string, unknown> | undefined;

      delete payload.thinking;
      delete payload.reasoning_effort;

      payload.chat_template_kwargs = {
        ...(kwargs ?? {}),
        thinking,
      };
      return true;
    }

    case "qwen-chat-template":
    case "minimax-inline":
    case "reasoning-effort":
    case "none":
    default:
      return false;
  }
}
