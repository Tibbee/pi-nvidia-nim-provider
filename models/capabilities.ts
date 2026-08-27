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
 * MiniMax-M3 NIM model-card capability. The model page's OpenAPI schema
 * explicitly documents chat_template_kwargs.thinking_mode and the separate
 * reasoning_content response field. Live probes confirmed disabled
 * content-only responses and adaptive/enabled reasoning_content streaming.
 *
 * Reference:
 * - https://build.nvidia.com/minimaxai/minimax-m3.md
 */
export const MINIMAX_M3_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "minimaxai/minimax-m3",
  semantics: {
    defaultEnabled: false,
    canDisable: true,
    supportsEffort: false,
    acceptedEfforts: [],
    effectiveEffortMapping: {
      off: "disabled",
      minimal: "adaptive",
      low: "adaptive",
      medium: "adaptive",
      high: "adaptive",
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
    tools: "documented",
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
 * Step-3.7 Flash hosted-NIM observation. NVIDIA's model page documents
 * low/medium/high effort and the live endpoint returned reasoning_content for
 * top-level and nested reasoning_effort requests. The hosted endpoint did not
 * honor the standard enable_thinking=false switch in this probe.
 *
 * References:
 * - https://build.nvidia.com/stepfun-ai/step-3.7-flash.md
 * - https://platform.stepfun.ai/docs/en/guides/models/step-3.7-flash
 * - https://huggingface.co/stepfun-ai/Step-3.7-Flash/discussions/14
 */
export const STEP_37_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "stepfun-ai/step-3.7-flash",
  semantics: {
    defaultEnabled: true,
    canDisable: false,
    supportsEffort: true,
    acceptedEfforts: ["low", "medium", "high"],
    effectiveEffortMapping: {
      low: "low",
      medium: "medium",
      high: "high",
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
    tools: "claimed",
    preservedThinking: "unknown",
  },
};

/**
 * Moonshot Kimi K3 hosted-NIM observation. The model is live on the API
 * (moonshotai/kimi-k3) but unlisted from the build page's catalog and the
 * API reference does not cover it, so the evidence below comes from live
 * probes against the hosted endpoint (2026-08-27): the boolean
 * chat_template_kwargs thinking toggle, separate reasoning_content,
 * streaming, OpenAI-format tool calls, and image input. Context is the 1M
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
    supportsEffort: false,
    acceptedEfforts: [],
    effectiveEffortMapping: {
      off: "disabled",
      minimal: "enabled",
      low: "enabled",
      medium: "enabled",
      high: "enabled",
      xhigh: "enabled",
      max: "enabled",
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

const CAPABILITIES = new Map<string, ReasoningCapability>([
  [DEEPSEEK_V4_FLASH_REASONING_CAPABILITY.modelId, DEEPSEEK_V4_FLASH_REASONING_CAPABILITY],
  [KIMI_K3_REASONING_CAPABILITY.modelId, KIMI_K3_REASONING_CAPABILITY],
  [LAGUNA_XS_21_REASONING_CAPABILITY.modelId, LAGUNA_XS_21_REASONING_CAPABILITY],
  [MINIMAX_M3_REASONING_CAPABILITY.modelId, MINIMAX_M3_REASONING_CAPABILITY],
  [MUSE_GLIMMER_30B_REASONING_CAPABILITY.modelId, MUSE_GLIMMER_30B_REASONING_CAPABILITY],
  [STEP_37_REASONING_CAPABILITY.modelId, STEP_37_REASONING_CAPABILITY],
]);

export function getReasoningCapability(modelId: string): ReasoningCapability | undefined {
  return CAPABILITIES.get(modelId);
}
