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
  supportsInterleavedThinking: boolean;
  supportsPreservedThinking: boolean;
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
 * The request transport remains unverified against the hosted endpoint. The
 * current production handler intentionally emits only the boolean
 * chat_template_kwargs toggle until a live NIM probe proves effort support.
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
    requestTransport: "unknown",
    responseTransport: "unknown",
    tools: "claimed",
    preservedThinking: "unknown",
  },
};

const CAPABILITIES = new Map<string, ReasoningCapability>([
  [GLM_52_REASONING_CAPABILITY.modelId, GLM_52_REASONING_CAPABILITY],
]);

export function getReasoningCapability(modelId: string): ReasoningCapability | undefined {
  return CAPABILITIES.get(modelId);
}
