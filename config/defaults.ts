// Provider defaults.
export const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Primary env var name for the NVIDIA NIM API key. */
export const NIM_NIM_API_KEY_ENV = "NVIDIA_NIM_API_KEY";

/** Fallback env var name for backward compatibility. */
export const NIM_API_KEY_ENV = "NVIDIA_API_KEY";

/**
 * Resolves the primary API key env var name at startup.
 * Prefers `NVIDIA_NIM_API_KEY` when present, otherwise falls back to `NVIDIA_API_KEY`.
 */
export function getPrimaryNimApiKeyEnv(): string {
  return process.env.NVIDIA_NIM_API_KEY !== undefined
    ? NIM_NIM_API_KEY_ENV
    : NIM_API_KEY_ENV;
}

/** pi references this env var name to resolve the API key at request time. */
export const NIM_API_KEY_REF = `$${getPrimaryNimApiKeyEnv()}`;
