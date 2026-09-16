/**
 * Evidence-aware reasoning capabilities.
 *
 * Model semantics describe what the upstream model claims to support. NIM
 * transport describes the wire shape we may need at NVIDIA's hosted endpoint.
 * These are intentionally separate because an upstream capability does not
 * prove that the hosted endpoint exposes the same request fields.
 */
export type VerificationState =
  | "claimed"
  | "documented"
  | "probe-passed"
  | "probe-failed"
  | "unknown";

export interface ReasoningSemantics {
  defaultEnabled: boolean;
  canDisable: boolean;
  supportsEffort: boolean;
  acceptedEfforts: readonly string[];
  effectiveEffortMapping: Readonly<Record<string, string>>;
  supportsInterleavedThinking: boolean | "unknown";
  supportsPreservedThinking: boolean | "unknown";
  responseField: "reasoning_content" | "reasoning" | "inline";
}

export interface NimReasoningTransport {
  requestEncoding:
    | "top-level-thinking"
    | "chat-template-kwargs"
    | "chat-template-kwargs+reasoning-effort"
    | "reasoning-effort"
    | "system-prompt"
    | "unknown";
  responseEncoding:
    | "reasoning_content"
    | "reasoning"
    | "inline-tags"
    | "content"
    | "unknown";
}

export interface ReasoningVerification {
  semantics: VerificationState;
  requestTransport: VerificationState;
  responseTransport: VerificationState;
  streaming: VerificationState;
  tools: VerificationState;
  preservedThinking: VerificationState;
}

export interface ReasoningCapability {
  modelId: string;
  semantics: ReasoningSemantics;
  nimTransport: NimReasoningTransport;
  verification: ReasoningVerification;
}

/**
 * DeepSeek V4 Flash hosted-NIM observation. The NVIDIA model page documents
 * non-think, high, and max modes. Live requests using the production handler's
 * chat_template_kwargs shape returned content-only non-think responses and
 * separate reasoning_content for high/max.
 *
 * The unsuffixed deepseek-v4-flash and deepseek-v4-pro endpoints reached end
 * of life on 2026-08-07; NVIDIA replaced them with deepseek-v4-flash-0731.
 * The same transport was re-verified against the new endpoint.
 *
 * References:
 * - https://build.nvidia.com/deepseek-ai/deepseek-v4-flash-0731
 * - https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash
 */
export const DEEPSEEK_V4_FLASH_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "deepseek-ai/deepseek-v4-flash-0731",
  semantics: {
    defaultEnabled: false,
    canDisable: true,
    supportsEffort: true,
    acceptedEfforts: ["none", "high", "max"],
    effectiveEffortMapping: {
      off: "none",
      high: "high",
      max: "max",
    },
    supportsInterleavedThinking: "unknown",
    supportsPreservedThinking: "unknown",
    responseField: "reasoning_content",
  },
  nimTransport: {
    requestEncoding: "chat-template-kwargs",
    responseEncoding: "reasoning_content",
  },
  verification: {
    semantics: "documented",
    requestTransport: "probe-passed",
    responseTransport: "probe-passed",
    streaming: "probe-passed",
    tools: "documented",
    preservedThinking: "unknown",
  },
};

/**
 * Poolside Laguna XS 2.1 hosted-NIM observation. The endpoint switches
 * reasoning with chat_template_kwargs.enable_thinking and returns separate
 * reasoning_content when enabled.
 *
 * References:
 * - https://build.nvidia.com/poolside/laguna-xs-2.1
 * - https://huggingface.co/poolside/Laguna-XS-2.1
 */
export const LAGUNA_XS_21_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "poolside/laguna-xs-2.1",
  semantics: {
    defaultEnabled: false,
    canDisable: true,
    supportsEffort: false,
    acceptedEfforts: [],
    effectiveEffortMapping: {
      off: "disabled",
      minimal: "enabled",
      low: "enabled",
      medium: "enabled",
      high: "enabled",
      xhigh: "enabled",
    },
    supportsInterleavedThinking: "unknown",
    supportsPreservedThinking: "unknown",
    responseField: "reasoning_content",
  },
  nimTransport: {
    requestEncoding: "chat-template-kwargs",
    responseEncoding: "reasoning_content",
  },
  verification: {
    semantics: "documented",
    requestTransport: "probe-passed",
    responseTransport: "probe-passed",
    streaming: "probe-passed",
    tools: "unknown",
    preservedThinking: "unknown",
  },
};

/**
 * Muse Glimmer hosted-NIM observation. NVIDIA documents text/image input,
 * a 131,072-token context, top-level reasoning_effort, tool requests, and
 * separate reasoning_content. Live probes confirmed streaming, usage, and
 * reasoning_content; the hosted endpoint still emitted reasoning for `none`,
 * so disabling reasoning is not treated as verified.
 *
 * References:
 * - https://build.nvidia.com/meta/muse-glimmer-30b
 * - https://docs.api.nvidia.com/nim/reference/meta-muse-glimmer-30b
 * - https://docs.api.nvidia.com/nim/reference/meta-muse-glimmer-30b-infer
 */
export const MUSE_GLIMMER_30B_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "meta/muse-glimmer-30b",
  semantics: {
    defaultEnabled: true,
    canDisable: false,
    supportsEffort: true,
    acceptedEfforts: ["none", "minimal", "low", "medium", "high", "max"],
    effectiveEffortMapping: {
      off: "none (accepted, but reasoning still observed)",
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "max",
      max: "max",
    },
    supportsInterleavedThinking: "unknown",
    supportsPreservedThinking: "unknown",
    responseField: "reasoning_content",
  },
  nimTransport: {
    requestEncoding: "reasoning-effort",
    responseEncoding: "reasoning_content",
  },
  verification: {
    semantics: "documented",
    requestTransport: "probe-passed",
    responseTransport: "probe-passed",
    streaming: "probe-passed",
    tools: "documented",
    preservedThinking: "unknown",
  },
};

/**
 * Moonshot Kimi K3 hosted-NIM observation. The model is live on the API
 * (moonshotai/kimi-k3) but unlisted from the build page's catalog and the
 * API reference does not cover it, so the evidence below comes from live
 * probes against the hosted endpoint (2026-08-27): the boolean
 * chat_template_kwargs thinking toggle, separate reasoning_content,
 * streaming, OpenAI-format tool calls, and image input. Thinking effort
 * follows NVIDIA's own build-card documentation (2026-08-28):
 * reasoningEffortValues low | high | max, and the card's canonical
 * example sends top-level reasoning_effort with no kwargs — confirmed
 * running clean on the hosted endpoint. The depth difference between
 * levels is not yet measured under the free tier's capacity limits. Context is the 1M
 * spec Moonshot ships upstream (NVIDIA does not host reduced context
 * windows); max output is a lineage estimate from Kimi K2.6. Practical
 * caveat: probe latency ranged 1-46 s; treat the endpoint as
 * capacity-constrained and expect intermittent slowness.
 *
 * References:
 * - https://build.nvidia.com/moonshotai/kimi-k3 (card reachable but unlisted)
 * - https://platform.moonshot.ai (upstream Kimi K3 spec)
 */
export const KIMI_K3_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "moonshotai/kimi-k3",
  semantics: {
    defaultEnabled: true,
    canDisable: true,
    supportsEffort: true,
    acceptedEfforts: ["low", "high", "max"],
    effectiveEffortMapping: {
      off: "none",
      low: "low",
      high: "high",
      max: "max",
    },
    supportsInterleavedThinking: "unknown",
    supportsPreservedThinking: "unknown",
    responseField: "reasoning_content",
  },
  nimTransport: {
    requestEncoding: "chat-template-kwargs",
    responseEncoding: "reasoning_content",
  },
  verification: {
    semantics: "probe-passed",
    requestTransport: "probe-passed",
    responseTransport: "probe-passed",
    streaming: "probe-passed",
    tools: "probe-passed",
    preservedThinking: "unknown",
  },
};

/**
 * GLM 5.3 hosted-NIM observation.
 *
 * Thinking is always on: NVIDIA's card states that the generation prompt opens
 * a think block unconditionally, and live requests with `enable_thinking: false`
 * or `thinking: {type: "disabled"}` still produced separate reasoning_content.
 * The effort ladder is documented as low/high/max (default max; any other value
 * falls back to max) and live probes on the hosted endpoint confirmed the depth
 * ordering (low 11 / max 477 reasoning chars on the same prompt). `clear_thinking`
 * defaults to false in the chat template, so chat scenarios pass true explicitly
 * through chat_template_kwargs. The build-page slug is `z-ai/glm-5-3`, not the
 * dotted API ID.
 *
 * References:
 * - https://build.nvidia.com/z-ai/glm-5-3 (card)
 * - https://recipes.vllm.ai/zai-org/GLM-5.3
 * - https://huggingface.co/zai-org/GLM-5.3
 */
export const GLM_53_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "z-ai/glm-5.3",
  semantics: {
    defaultEnabled: true,
    canDisable: false,
    supportsEffort: true,
    acceptedEfforts: ["low", "high", "max"],
    effectiveEffortMapping: {
      low: "low",
      high: "high",
      max: "max",
    },
    supportsInterleavedThinking: "unknown",
    supportsPreservedThinking: false,
    responseField: "reasoning_content",
  },
  nimTransport: {
    requestEncoding: "reasoning-effort",
    responseEncoding: "reasoning_content",
  },
  verification: {
    semantics: "documented",
    requestTransport: "probe-passed",
    responseTransport: "probe-passed",
    streaming: "probe-passed",
    tools: "probe-passed",
    preservedThinking: "documented",
  },
};

const CAPABILITIES = new Map<string, ReasoningCapability>([
  [DEEPSEEK_V4_FLASH_REASONING_CAPABILITY.modelId, DEEPSEEK_V4_FLASH_REASONING_CAPABILITY],
  [GLM_53_REASONING_CAPABILITY.modelId, GLM_53_REASONING_CAPABILITY],
  [KIMI_K3_REASONING_CAPABILITY.modelId, KIMI_K3_REASONING_CAPABILITY],
  [LAGUNA_XS_21_REASONING_CAPABILITY.modelId, LAGUNA_XS_21_REASONING_CAPABILITY],
  [MUSE_GLIMMER_30B_REASONING_CAPABILITY.modelId, MUSE_GLIMMER_30B_REASONING_CAPABILITY],
]);

export function getReasoningCapability(modelId: string): ReasoningCapability | undefined {
  return CAPABILITIES.get(modelId);
}
