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
 * Upstream GLM-5.2 semantics and the current NIM transport hypothesis.
 *
 * Live hosted-NIM probes confirmed the boolean chat_template_kwargs toggle
 * and streaming response shape. Effort-level mappings remain documented
 * semantics rather than independently verified transport behavior.
 *
 * Reference semantics:
 * - https://docs.z.ai/guides/capabilities/thinking-mode
 * - https://recipes.vllm.ai/zai-org/GLM-5.2
 * Hosted NIM references:
 * - https://docs.api.nvidia.com/nim/reference/z-ai-glm-5.2
 * - https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html
 * - https://docs.nvidia.com/nim/large-language-models/1.15.0/reasoning-model.html
 */
export const GLM_52_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "z-ai/glm-5.2",
  semantics: {
    defaultEnabled: true,
    canDisable: true,
    supportsEffort: true,
    acceptedEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    effectiveEffortMapping: {
      none: "none",
      minimal: "none",
      low: "high",
      medium: "high",
      high: "high",
      xhigh: "max",
      max: "max",
    },
    supportsInterleavedThinking: true,
    supportsPreservedThinking: true,
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
    tools: "claimed",
    preservedThinking: "unknown",
  },
};

/**
 * DeepSeek V4 Flash hosted-NIM observation. The NVIDIA model page documents
 * non-think, high, and max modes. Live requests using the production handler's
 * chat_template_kwargs shape returned content-only non-think responses and
 * separate reasoning_content for high/max.
 *
 * References:
 * - https://build.nvidia.com/deepseek-ai/deepseek-v4-flash.md
 * - https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash
 */
export const DEEPSEEK_V4_FLASH_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "deepseek-ai/deepseek-v4-flash",
  semantics: {
    defaultEnabled: false,
    canDisable: true,
    supportsEffort: true,
    acceptedEfforts: ["none", "high", "max"],
    effectiveEffortMapping: {
      off: "none",
      minimal: "none",
      low: "high",
      medium: "high",
      high: "high",
      xhigh: "max",
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
 * Thinking Machines Inkling hosted-NIM observation. The endpoint returned
 * separate reasoning_content without an exposed thinking toggle in live
 * probes; the upstream model is multimodal and always-on for reasoning.
 *
 * References:
 * - https://build.nvidia.com/thinkingmachines/inkling
 * - https://huggingface.co/thinkingmachines/Inkling
 */
export const INKLING_REASONING_CAPABILITY: ReasoningCapability = {
  modelId: "thinkingmachines/inkling",
  semantics: {
    defaultEnabled: true,
    canDisable: false,
    supportsEffort: false,
    acceptedEfforts: [],
    effectiveEffortMapping: { off: "always-on" },
    supportsInterleavedThinking: "unknown",
    supportsPreservedThinking: "unknown",
    responseField: "reasoning_content",
  },
  nimTransport: {
    requestEncoding: "unknown",
    responseEncoding: "reasoning_content",
  },
  verification: {
    semantics: "documented",
    requestTransport: "unknown",
    responseTransport: "probe-passed",
    streaming: "probe-passed",
    tools: "unknown",
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

const CAPABILITIES = new Map<string, ReasoningCapability>([
  [DEEPSEEK_V4_FLASH_REASONING_CAPABILITY.modelId, DEEPSEEK_V4_FLASH_REASONING_CAPABILITY],
  [INKLING_REASONING_CAPABILITY.modelId, INKLING_REASONING_CAPABILITY],
  [LAGUNA_XS_21_REASONING_CAPABILITY.modelId, LAGUNA_XS_21_REASONING_CAPABILITY],
  [GLM_52_REASONING_CAPABILITY.modelId, GLM_52_REASONING_CAPABILITY],
  [MINIMAX_M3_REASONING_CAPABILITY.modelId, MINIMAX_M3_REASONING_CAPABILITY],
  [STEP_37_REASONING_CAPABILITY.modelId, STEP_37_REASONING_CAPABILITY],
]);

export function getReasoningCapability(modelId: string): ReasoningCapability | undefined {
  return CAPABILITIES.get(modelId);
}
