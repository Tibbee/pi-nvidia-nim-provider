import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
if (!NVIDIA_API_KEY) {
  console.error("Error: NVIDIA_API_KEY environment variable is not set.");
  process.exit(1);
}

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const BUILD_BASE_URL = "https://build.nvidia.com";
const OUTPUT_FILE = path.join(__dirname, "../models/metadata.json");

const DEFAULT_BATCH_SIZE = 3;
const DEFAULT_DELAY_MS = 800;

const getNumericArg = (prefixes: string[], def: number): number => {
  for (const p of prefixes) {
    const arg = process.argv.find(a => a.startsWith(p));
    if (arg) {
      const val = arg.split("=")[1]?.trim();
      const n = val ? parseInt(val, 10) : NaN;
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return def;
};

const verbose = process.argv.includes("--verbose");

// Deprecated flags — kept as no-ops for backward compatibility
if (process.argv.includes("--cards")) {
  console.warn("Note: --cards is no longer supported (NVIDIA docs site changed). Using modelcard pages instead.");
}
const _resumeMode = process.argv.includes("--resume");
const fullMode = process.argv.includes("--full");

const singleModel = process.argv
  .find(arg => arg.startsWith("--model=") || arg.startsWith("-m=") || arg.startsWith("--model-name="))
  ?.replace(/^--?model[=-]?/, "");
const explicitOutput = process.argv
  .find(arg => arg.startsWith("--output=") || arg.startsWith("-o="));
const outputFile = explicitOutput
  ? explicitOutput.replace(/^--?output[=-]?/, "")
  : singleModel
    ? `test-${singleModel.replace(/\//g, "-")}.json`
    : OUTPUT_FILE;

const BATCH_SIZE = getNumericArg(["--batch-size="], DEFAULT_BATCH_SIZE);
const DELAY_MS   = getNumericArg(["--delay="], DEFAULT_DELAY_MS);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type ModelCategory = "chat" | "code" | "reasoning" | "embedding" | "vision" | "guard" | "other";
type ToolCallFormat = "openai" | "hermes" | "mistral" | "llama" | "other";

interface ModelMetadata {
  id: string;
  owned_by: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputModalities: string[];
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  thinkingFormat?: string;
  reasoningEffortValues?: string[];
  reasoningEffortDefault?: string;
  reasoningBudget?: number;
  supportsToolCalling?: boolean;
  toolCallFormat?: ToolCallFormat;
  supportsStructuredOutput?: boolean;
  recommendedTemperature?: number;
  recommendedTopP?: number;
  exampleRequestExtra?: Record<string, unknown>;
  modelCategory: ModelCategory;
}

const INTERNAL_SCRAPE_KEYS = new Set([
  "discovered_at", "card_fetched", "build_fetched",
  "supportsSystemPrompt", "supportsFIM", "fimTokens",
  "supportsParallelToolCalls", "isMoE", "speedTier",
  "totalParams", "activeParams", "recommendedTopK",
  "labels", "description", "shortDescription",
]);

const EXTRA_FULL_MODE_FIELDS = new Set([
  "owned_by", "inputModalities", "modelCategory",
  "supportsToolCalling", "toolCallFormat",
  "supportsStructuredOutput", "recommendedTemperature", "recommendedTopP",
  "reasoningEffortDefault",
]);

function stripUnusedFields(results: ModelMetadata[]): ModelMetadata[] {
  for (const entry of results) {
    for (const key of INTERNAL_SCRAPE_KEYS) delete (entry as any)[key];
    if (!fullMode) {
      for (const key of EXTRA_FULL_MODE_FIELDS) {
        delete (entry as any)[key];
      }
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// Fallback limits (unchanged)
// ─────────────────────────────────────────────────────────────

function getYardstickFallback(modelId: string): { contextWindow?: number; maxOutputTokens?: number } {
  const families: { re: RegExp; ctx?: number; out?: number }[] = [
    { re: /llama-3\.[123]/i, ctx: 131072, out: 8192 },
    { re: /llama-4/i, ctx: 131072, out: 8192 },
    { re: /llama-3\.3/i, ctx: 131072, out: 8192 },
    { re: /llama3/i, ctx: 131072, out: 8192 },
    { re: /llama2/i, ctx: 4096, out: 4096 },
    { re: /gemma-3/i, ctx: 131072, out: 8192 },
    { re: /gemma-4/i, ctx: 131072, out: 8192 },
    { re: /phi-4/i, ctx: 131072, out: 4096 },
    { re: /phi-3\.5/i, ctx: 131072, out: 4096 },
    { re: /phi-3.*128k/i, ctx: 131072, out: 4096 },
    { re: /mistral-medium-3\.5-128b/i, ctx: 262144, out: 32768 },
    { re: /mistral-medium-3/i, ctx: 131072, out: 32768 },
    { re: /mistral-small/i, ctx: 131072, out: 8192 },
    { re: /devstral/i, ctx: 262144, out: 16384 },
    { re: /magistral/i, ctx: 131072, out: 8192 },
    { re: /mistral-large/i, ctx: 131072, out: 8192 },
    { re: /mistral-nemo/i, ctx: 131072, out: 8192 },
    { re: /ministral/i, ctx: 131072, out: 8192 },
    { re: /codestral/i, ctx: 32768, out: 4096 },
    { re: /mixtral-8x22b/i, ctx: 65536, out: 4096 },
    { re: /mixtral-8x7b/i, ctx: 32768, out: 4096 },
    { re: /mistral-7b/i, ctx: 32768, out: 8192 },
    { re: /deepseek-v3/i, ctx: 131072, out: 16384 },
    { re: /deepseek-v4/i, ctx: 1000000, out: 16384 },
    { re: /deepseek-r1/i, ctx: 131072, out: 16384 },
    { re: /kimi-k2/i, ctx: 204800, out: 16384 },
    { re: /jamba-1\.5/i, ctx: 262144, out: 8192 },
    { re: /granite-3/i, ctx: 131072, out: 8192 },
    { re: /qwen3/i, ctx: 262144, out: 8192 },
    // Inkling's upstream config declares a 1M-token context window.
    { re: /thinkingmachines\/inkling/i, ctx: 1048576, out: 16384 },
    { re: /qwen2\.5-coder/i, ctx: 131072, out: 4096 },
    { re: /qwen2/i, ctx: 32768, out: 4096 },
    { re: /glm-5/i, ctx: 200000, out: 32768 },
    { re: /glm/i, ctx: 128000, out: 8192 },
    { re: /stockmark/i, ctx: 32768, out: 8192 },
    { re: /palmyra/i, ctx: 32768, out: 4096 },
    { re: /nemotron-4-340b/i, ctx: 4096, out: 4096 },
    { re: /nemotron-3-super/i, ctx: 1000000, out: 32768 },
    { re: /nemotron-mini/i, ctx: 4096, out: 4096 },
    { re: /nemotron-nano/i, ctx: 4096, out: 4096 },
    { re: /yi-large/i, ctx: 32768, out: 4096 },
    { re: /dbrx/i, ctx: 32768, out: 4096 },
    { re: /solar-10\.7b/i, ctx: 4096, out: 4096 },
    { re: /seed-oss/i, ctx: 131072, out: 8192 },
    { re: /step-3\.5|step-3\.7/i, ctx: 256000, out: 262144 },
    { re: /nemotron-3-ultra-550b/i, ctx: 1000000, out: 32768 },
    { re: /minimax-m3/i, ctx: 1000000, out: 16384 },
    { re: /minimax-m2\.[6-9]/i, ctx: 204800, out: 16384 },
    { re: /minimax/i, ctx: 131072, out: 16384 },
    { re: /gpt-oss/i, ctx: 131072, out: 4096 },
    { re: /zamba/i, ctx: 4096, out: 4096 },
  ];

  for (const f of families) {
    if (f.re.test(modelId)) return { contextWindow: f.ctx, maxOutputTokens: f.out };
  }
  return {};
}

const FALLBACK_LIMITS_MAP: Record<string, { contextWindow?: number; maxOutputTokens?: number }> = {
  "google/gemma-2-2b-it": { contextWindow: 8192, maxOutputTokens: 4096 },
  "google/gemma-2b": { contextWindow: 8192, maxOutputTokens: 8192 },
  "deepseek-ai/deepseek-coder-6.7b-instruct": { contextWindow: 16384, maxOutputTokens: 4096 },
};

// ─────────────────────────────────────────────────────────────
// Fetch utilities
// ─────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, options?: RequestInit, retries = 3, backoff = 2000): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "max-age=0",
    ...(options?.headers as Record<string, string> || {}),
  };

  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { ...options, headers });
    if (res.ok) return res;
    if (verbose) {
      console.log(`  ⚠ fetch attempt ${i + 1}/${retries} failed: ${url} → ${res.status} ${res.statusText}`);
    }
    if (res.status === 429 && i < retries - 1) {
      const delay = backoff * (i + 1);
      if (verbose) console.log(`  ⏳ backing off ${delay}ms before retry…`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    break;
  }
  return fetch(url, options);
}

async function fetchModelIds(apiKey: string): Promise<{ id: string; owned_by: string }[]> {
  console.log("Fetching model IDs from NVIDIA NIM API...");
  const response = await fetch(`${NIM_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
  }
  const data = await response.json() as any;
  return data.data.map((m: any) => ({ id: m.id, owned_by: m.owned_by }));
}

// ─────────────────────────────────────────────────────────────
// OpenAPI spec extraction from Next.js App Router RSC payload
// ─────────────────────────────────────────────────────────────

/**
 * Extract the full OpenAPI spec JSON from a build.nvidia.com modelcard page.
 *
 * The modelcard page uses Next.js App Router which embeds data via
 * `self.__next_f.push([1,"...escaped JSON..."])`. The OpenAPI spec is
 * nested inside the RSC payload as `"openAPISpec":{...}`.
 *
 * We find the marker in the raw HTML, locate the start of the JSON value,
 * and carefully track brace depth to extract the complete object.
 */
function extractOpenApiSpec(html: string): any | null {
  // Look for `"openAPISpec":{` in the RSC payload.
  // In the raw HTML, property names appear as: \"openAPISpec\"
  const marker = '\\"openAPISpec\\"';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  // Find the value start: the `{` after `"openAPISpec":`
  const colonPos = html.indexOf(":", idx + marker.length);
  if (colonPos === -1) return null;
  const valueStart = html.indexOf("{", colonPos);
  if (valueStart === -1) return null;

  // Walk through the HTML tracking brace depth.
  // The payload uses escaped quotes \" for JSON strings, so we must
  // skip braces inside string values.
  let depth = 0;
  let inStr = false;
  let end = valueStart;

  for (let i = valueStart; i < html.length; i++) {
    const c = html[i];

    // Handle escape sequences: \\ or \"
    if (inStr && c === "\\") {
      // Skip the next character (it's escaped)
      i++;
      continue;
    }

    // Toggle string state on unescaped quotes
    if (c === '"') {
      // In the RSC payload, JSON string content uses \" not plain "
      // But object boundaries use unescaped { }
      // So a bare " toggles string state only when NOT preceded by \
      if (i === 0 || html[i - 1] !== "\\") {
        inStr = !inStr;
      }
      continue;
    }

    if (inStr) continue;

    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (depth !== 0) return null;

  const raw = html.substring(valueStart, end);

  // The extracted JSON may have escaped quotes \" that need to be unescaped
  // for valid JSON parsing
  try {
    return JSON.parse(raw);
  } catch {
    // If parsing fails, try unescaping first
    try {
      const unescaped = raw.replace(/\\(["\\/])/g, "$1");
      return JSON.parse(unescaped);
    } catch {
      return null;
    }
  }
}

/**
 * Extract context window size from modelcard page text.
 * Patterns observed across NVIDIA build.nvidia.com modelcard pages:
 *   - "Input context length: 131,072 tokens"
 *   - "long context support up to 512K"
 *   - "Context Length (ISL): 256K"
 *   - "Context Length: 256k"
 *   - "1M-token context" / "1M context"
 *   - "context length up to 128K"
 *   - "maximum context length is 8192"
 */
function extractContextFromPageText(html: string): number | undefined {
  // Strip script/style content to avoid noise
  const text = html
    .replace(/<script[^>]*>[^<]*<\/script>/gi, " ")
    .replace(/<style[^>]*>[^<]*<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ");

  // Priority-ordered patterns — K-suffixed patterns first to avoid
  // matching bare numbers that are actually K values
  const patterns: { re: RegExp; multiplier: number }[] = [
    // Most explicit patterns first — labeled context length fields
    // "Input context length: 131,072 tokens" — explicit number with commas
    { re: /Input context length:\s*([\d,]+)\s*tokens/i, multiplier: 1 },
    // "Context Length (ISL): 256K" / "Context Length: 256k"
    { re: /Context Length\s*(?:\(ISL\))?:\s*([\d,]+)\s*[Kk]/i, multiplier: 1024 },
    // "Context Length (ISL): 1M"
    { re: /Context Length\s*(?:\(ISL\))?:\s*([\d,]+)\s*M\b/i, multiplier: 1024 * 1024 },
    // "Context Length (ISL): 262,144" — with comma (no K suffix)
    { re: /Context Length\s*(?:\(ISL\))?:\s*([\d,]+)(?:\s*\(\d+k?\))?/i, multiplier: 1 },
    // "context length up to 128K" / "long context support up to 512K"
    { re: /(?:long\s+)?context\s+(?:length|support|window|size).{0,30}?up\s+to\s+(\d+)\s*[Kk]/i, multiplier: 1024 },
    // "max sequence length: 8192" (embedding models)
    { re: /max(?:imum)?\s+sequence\s+length:\s*(\d+)/i, multiplier: 1 },
    // "maximum context length is 8192"
    { re: /maximum\s+context\s+length\s+is\s+(\d+)/i, multiplier: 1 },
    // Less explicit: "1M-token context" / "1M context"
    { re: /(\d+)\s*M\s*(?:token\s+)?context/i, multiplier: 1024 * 1024 },
    { re: /(\d+)\s*M-token\s+context/i, multiplier: 1024 * 1024 },
    // "512K token context"
    { re: /(\d+)\s*K\s*(?:token\s+)?context/i, multiplier: 1024 },
    { re: /(\d+)\s*K-token\s+context/i, multiplier: 1024 },
  ];

  for (const { re, multiplier } of patterns) {
    const match = text.match(re);
    if (match) {
      const raw = match[1].replace(/,/g, "");
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num > 0 && isFinite(num)) {
        const result = num * multiplier;
        // Ignore results that are implausibly small (< 1024) —
        // likely false positives from benchmark names or table rows
        if (result >= 1024) {
          return result;
        }
      }
    }
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────
// Metadata extraction from OpenAPI spec
// ─────────────────────────────────────────────────────────────

const STANDARD_OPENAI_PARAMS = new Set([
  "model", "messages", "temperature", "top_p", "max_tokens",
  "max_completion_tokens", "seed", "stream", "stop", "n",
  "presence_penalty", "frequency_penalty", "logit_bias", "user",
  "top_k", "repetition_penalty", "response_format", "tools", "tool_choice",
]);

const MIN_REASONABLE_MAX_OUTPUT = 256;

/**
 * Extract all metadata from an OpenAPI spec object (output of extractOpenApiSpec).
 */
function parseMetadataFromSpec(meta: ModelMetadata, spec: any): void {
  const schemas = spec?.components?.schemas;
  if (!schemas) return;

  // Find the chat request schema — look for one with "messages" + "model" props
  let chatReqProps: Record<string, any> | null = null;
  for (const schema of Object.values(schemas) as any[]) {
    const props = schema?.properties;
    if (!props) continue;
    const keys = Object.keys(props);
    if (keys.includes("model") && keys.includes("messages") &&
        (keys.includes("max_tokens") || keys.includes("max_completion_tokens"))) {
      chatReqProps = props;
      break;
    }
  }
  if (!chatReqProps) return;

  // ── max output tokens ──
  const mtProp = chatReqProps.max_tokens ?? chatReqProps.max_completion_tokens;
  if (mtProp) {
    const limit: number =
      mtProp.maximum ??
      (mtProp.anyOf as any[])?.find((s: any) => s.maximum != null)?.maximum ??
      mtProp.default;
    if (limit != null && isFinite(limit) && limit >= MIN_REASONABLE_MAX_OUTPUT) {
      meta.maxOutputTokens = limit;
    }
  }

  // ── recommended sampling params ──
  if (chatReqProps.temperature?.default != null) meta.recommendedTemperature = chatReqProps.temperature.default;
  if (chatReqProps.top_p?.default != null) meta.recommendedTopP = chatReqProps.top_p.default;

  // ── tool calling ──
  if (chatReqProps.tools) meta.supportsToolCalling = true;
  if (chatReqProps.tool_choice) meta.supportsToolCalling = true;

  // ── structured output ──
  if (chatReqProps.response_format) meta.supportsStructuredOutput = true;

  // ── vision support from schema names (VLM content types) ──
  if (Object.keys(schemas).some(n => /ContentPartImage|ContentPartVideo/i.test(n))) {
    meta.supportsVision = true;
    meta.inputModalities = ["text", "image"];
  }

  // ── reasoning support ──
  const hasReasoningContent = !!(schemas.Message?.properties?.reasoning_content);
  const ctkw = chatReqProps.chat_template_kwargs;
  const ctkwDesc = (ctkw?.description ?? "").toLowerCase();
  const hasThinkingDesc = /\b(?:thinking|reasoning)\b/.test(ctkwDesc);

  if (hasReasoningContent || hasThinkingDesc) {
    meta.supportsReasoning = true;
  }

  // ── reasoning/thinking budget ──
  const budgetProp = chatReqProps.thinking_budget ?? chatReqProps.reasoning_budget;
  if (budgetProp) {
    meta.reasoningBudget = budgetProp.maximum ?? budgetProp.default;
  }

  // ── chat_template_kwargs → exampleRequestExtra ──
  if (ctkw?.default && typeof ctkw.default === "object") {
    meta.exampleRequestExtra = {
      chat_template_kwargs: ctkw.default,
      ...(meta.exampleRequestExtra ?? {}),
    };
  }

  // ── reasoning_effort enum → reasoningEffortValues ──
  const reProp = chatReqProps.reasoning_effort;
  if (reProp?.enum && Array.isArray(reProp.enum) && reProp.enum.length > 0) {
    meta.reasoningEffortValues = reProp.enum.map((v: any) => String(v));
    if (reProp.default != null) {
      meta.reasoningEffortDefault = String(reProp.default);
    }
  }

  // ── Extract example request extras from x-nvai-meta ──
  // Scan ALL examples and pick the one with the most non-standard params.
  // The first example is often basic; later examples may have thinking/chat_template_kwargs.
  try {
    const pathKey = Object.keys(spec.paths || {})[0];
    const path = spec.paths?.[pathKey];
    const examples = path?.post?.["x-nvai-meta"]?.examples;
    if (examples?.length) {
      let bestExtras: Record<string, any> | null = null;
      let bestScore = 0;

      for (const ex of examples) {
        if (!ex.requestJson) continue;
        try {
          const parsed = JSON.parse(ex.requestJson);
          const extras: Record<string, any> = {};
          for (const [k, v] of Object.entries(parsed)) {
            // Skip standard OpenAI params and budget params
            // (budget is handled by dedicated reasoningBudget metadata field)
            if (!STANDARD_OPENAI_PARAMS.has(k) &&
                !["thinking_budget", "reasoning_budget"].includes(k)) {
              extras[k] = v;
            }
          }
          const count = Object.keys(extras).length;
          // Score: prefer examples with chat_template_kwargs or thinking-related params
          const hasThinking = Object.keys(extras).some(k =>
            /chat_template_kwargs|thinking|reasoning_budget/i.test(k)
          );
          const score = count + (hasThinking ? 10 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestExtras = extras;
          }
        } catch {}
      }

      if (bestExtras && Object.keys(bestExtras).length > 0) {
        meta.exampleRequestExtra = {
          ...bestExtras,
          ...(meta.exampleRequestExtra ?? {}),
        };
      }
    }
  } catch {
    // Example JSON parsing is best-effort
  }

  // ── tool calling from broader schema scan ──
  for (const schema of Object.values(schemas) as any[]) {
    const props = schema?.properties;
    if (!props) continue;
    if (props.tools) meta.supportsToolCalling = true;
    if (props.response_format) meta.supportsStructuredOutput = true;
  }
}

// ─────────────────────────────────────────────────────────────
// Model-ID-based heuristics (unchanged fallbacks)
// ─────────────────────────────────────────────────────────────

function detectThinkingFormat(modelId: string, _text?: string): string | undefined {
  if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
  if (/^openai\/gpt-oss/.test(modelId)) return "reasoning-effort";
  if (/^poolside\/laguna-xs-2\.1$/.test(modelId)) return "qwen-chat-template";

  if (/^mistralai\/mistral-(medium|small)/.test(modelId)) return "reasoning-effort";

  if (/^nvidia\/llama-3\.3-nemotron-super-49b-v1$/.test(modelId)) return "nemotron-system-detailed";
  if (/^nvidia\/llama-3\.3-nemotron-super-49b-v1\.5/.test(modelId)) return "nemotron-system-think";
  if (/^nvidia\/nvidia-nemotron-nano-9b-v2/.test(modelId)) return "nemotron-system-think";
  if (/^nvidia\/nemotron-3-super-120b-a12b/.test(modelId)) return "nemotron-3-super-effort";
  if (/^nvidia\/nemotron-3-ultra-550b/.test(modelId)) return "nemotron-3-super-effort";
  if (/^bytedance\/seed-oss/.test(modelId)) return "thinking-budget";

  if (/^deepseek-ai\/deepseek-(v3|r1)/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.5/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.6/.test(modelId)) return "deepseek-nim";
  if (/^nvidia\/llama-3\.1-nemotron-ultra/.test(modelId)) return "deepseek-nim";

  if (/^stepfun-ai\//.test(modelId)) return "reasoning-effort";

  if (/^z-ai\/glm/.test(modelId)) return "zai";
  if (/^qwen\/qwen3\.5/.test(modelId)) return "qwen-chat-template";
  if (/^google\/gemma-4/.test(modelId)) return "qwen-chat-template";
  if (/^nvidia\/nemotron-3-nano/.test(modelId)) return "qwen-chat-template";

  return undefined;
}

function detectToolCalling(_html: string, modelId: string): boolean {
  if (/llama-3\.[1-9]/i.test(modelId)) return true;
  if (/llama-4/i.test(modelId)) return true;
  if (/mistral(?!-7b)/i.test(modelId)) return true;
  if (/qwen[23]/i.test(modelId)) return true;
  if (/gemma-[34]/i.test(modelId)) return true;
  if (/phi-4/i.test(modelId)) return true;
  if (/kimi-k2/i.test(modelId)) return true;
  if (/deepseek-v3|deepseek-v4/i.test(modelId)) return true;
  if (/nemotron-(ultra|super)/i.test(modelId)) return true;
  return false;
}

function detectToolCallFormat(modelId: string): ToolCallFormat | undefined {
  if (/llama2|gemma-2|codestral|starcoder|fim/i.test(modelId)) return undefined;
  if (/mistral|mixtral|devstral|magistral|ministral/i.test(modelId)) return "mistral";
  if (/llama/i.test(modelId)) return "llama";
  if (/qwen|glm|phi|deepseek|kimi|moonshot|gemma|minimax/i.test(modelId)) return "openai";
  return undefined;
}

function detectStructuredOutput(modelId: string): boolean {
  if (/response_format/i.test(modelId)) return true;
  if (/llama-3\.[1-9]|llama-4/i.test(modelId)) return true;
  if (/mistral|mixtral/i.test(modelId)) return true;
  if (/qwen[23]/i.test(modelId)) return true;
  return false;
}

function detectReasoningSupport(text: string): boolean {
  if (/reasoning\s+model/i.test(text)) return true;
  if (/thinking\s+mode/i.test(text)) return true;
  if (/reasoning_content/i.test(text)) return true;
  if (/chat_template_kwargs/i.test(text)) return true;
  if (/\bthink(?:ing)?\s*(?:mode|trace|step)/i.test(text)) return true;
  if (/reasoning_effort/i.test(text)) return true;
  return false;
}

function detectModelCategory(modelId: string, supportsReasoning: boolean): ModelCategory {
  const id = modelId.toLowerCase();
  if (/embed|rerank|retriev/i.test(id)) return "embedding";
  if (/guard|safety|jailbreak|content.safety|pii/i.test(id)) return "guard";
  if (/stable.diffusion|flux\.|dalle|imagen|vista|vila|nv-clip|\bvl\b/i.test(id)) return "vision";
  if (/coder|codestral|starcoder|devstral|deepseek-coder/i.test(id)) return "code";
  if (supportsReasoning) return "reasoning";
  return "chat";
}

// ─────────────────────────────────────────────────────────────
// Per-model data fetching
// ─────────────────────────────────────────────────────────────

async function fetchModelData(modelId: string, owned_by: string): Promise<ModelMetadata> {
  const meta: ModelMetadata = {
    id: modelId,
    owned_by,
    inputModalities: ["text"],
    modelCategory: "chat",
  };

  // ── 1. Fetch the modelcard page for OpenAPI spec data ──
  try {
    const cardUrl = `${BUILD_BASE_URL}/${modelId}/modelcard`;
    const res = await fetchWithRetry(cardUrl, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const html = await res.text();
      const spec = extractOpenApiSpec(html);
      if (spec) {
        parseMetadataFromSpec(meta, spec);
        if (verbose) console.log(`  ✓ extracted spec for ${modelId}`);
      } else if (verbose) {
        console.log(`  ⚠ no OpenAPI spec found in modelcard for ${modelId}`);
      }

      // Fallback: detect reasoning support from raw page text
      if (!meta.supportsReasoning && detectReasoningSupport(html)) {
        meta.supportsReasoning = true;
      }

      // Fallback: extract context window from page text
      if (!meta.contextWindow) {
        const textCtx = extractContextFromPageText(html);
        if (textCtx != null) {
          meta.contextWindow = textCtx;
          if (verbose) console.log(`  ✓ context from page text: ${textCtx}`);
        }
      }
    }
  } catch {
    // Modelcard fetch failed — will use fallbacks
  }

  // Inkling's hosted model card describes text/image/audio input, while its
  // OpenAPI schema currently exposes only the text request shape.
  if (/^thinkingmachines\/inkling$/.test(modelId) && !meta.supportsVision) {
    meta.supportsVision = true;
    meta.inputModalities = ["text", "image"];
  }

  // ── 2. Apply model-ID-based heuristics for fields still missing ──
  if (!meta.thinkingFormat) {
    meta.thinkingFormat = detectThinkingFormat(modelId);
  }
  if (meta.thinkingFormat) meta.supportsReasoning = true;

  if (!meta.supportsToolCalling) {
    // Use a minimal check — empty string is fine for model-ID-based detection
    meta.supportsToolCalling = detectToolCalling("", modelId);
  }
  if (meta.supportsToolCalling && !meta.toolCallFormat) {
    meta.toolCallFormat = detectToolCallFormat(modelId);
  }

  if (meta.supportsStructuredOutput == null) {
    meta.supportsStructuredOutput = detectStructuredOutput(modelId);
  }

  // ── 3. Apply yardstick / manual fallbacks for numeric limits ──
  const familyFallback = getYardstickFallback(modelId);
  const manualFallback = FALLBACK_LIMITS_MAP[modelId];

  if (!meta.contextWindow) {
    meta.contextWindow = manualFallback?.contextWindow ?? familyFallback.contextWindow;
  }
  if (meta.maxOutputTokens == null) {
    const fb = manualFallback?.maxOutputTokens ?? familyFallback.maxOutputTokens;
    if (fb != null) meta.maxOutputTokens = fb;
  }

  // ── 4. Model category ──
  if (meta.modelCategory === "chat") {
    const idCat = detectModelCategory(modelId, !!meta.supportsReasoning);
    if (idCat !== "chat") meta.modelCategory = idCat;
  }

  // ── 5. Set explicit false for fields that were explicitly false before ──
  if (meta.supportsReasoning == null) meta.supportsReasoning = false;
  if (meta.supportsVision == null) meta.supportsVision = false;

  // ── 6. Vision: ensure inputModalities reflects supportsVision ──
  if (meta.supportsVision && meta.inputModalities.length === 1 && meta.inputModalities[0] === "text") {
    meta.inputModalities = ["text", "image"];
  }

  if (verbose) {
    console.log(
      `  ✓ ${modelId}: ctx=${meta.contextWindow ?? "?"} maxOut=${meta.maxOutputTokens ?? "?"} ` +
      `tools=${meta.supportsToolCalling} vision=${meta.supportsVision} ` +
      `reason=${meta.supportsReasoning} ` +
      `format=${meta.thinkingFormat ?? "none"} cat=${meta.modelCategory}`
    );
  }

  return meta;
}

// ─────────────────────────────────────────────────────────────
// Batch processing (unchanged structure)
// ─────────────────────────────────────────────────────────────

async function main() {
  try {
    let models: { id: string; owned_by: string }[];

    if (singleModel) {
      console.log(`Testing single model: ${singleModel}`);
      const org = singleModel.split("/")[0];
      models = [{ id: singleModel, owned_by: org }];

      const meta = await fetchModelData(singleModel, org);

      const debug = {
        contextWindow: meta.contextWindow,
        maxOutputTokens: meta.maxOutputTokens,
        inputModalities: meta.inputModalities,
        supportsToolCalling: meta.supportsToolCalling,
        toolCallFormat: meta.toolCallFormat,
        supportsStructuredOutput: meta.supportsStructuredOutput,
        supportsReasoning: meta.supportsReasoning,
        thinkingFormat: meta.thinkingFormat,
        modelCategory: meta.modelCategory,
        recommendedTemperature: meta.recommendedTemperature,
        recommendedTopP: meta.recommendedTopP,
        reasoningBudget: meta.reasoningBudget,
        reasoningEffortValues: meta.reasoningEffortValues,
        exampleRequestExtra: meta.exampleRequestExtra,
      };

      const outPath = outputFile;
      stripUnusedFields([meta]);
      fs.writeFileSync(outPath, JSON.stringify([meta], null, 2));
      console.log(`\nWritten to: ${outPath}`);
      console.log(`  contextWindow:           ${debug.contextWindow ?? "?"}`);
      console.log(`  maxOutputTokens:         ${debug.maxOutputTokens ?? "?"}`);
      console.log(`  inputModalities:         ${debug.inputModalities?.join(", ") ?? "?"}`);
      console.log(`  supportsToolCalling:     ${debug.supportsToolCalling ?? "?"}`);
      console.log(`  toolCallFormat:          ${debug.toolCallFormat ?? "none"}`);
      console.log(`  supportsStructuredOut:   ${debug.supportsStructuredOutput ?? "?"}`);
      console.log(`  supportsReasoning:       ${debug.supportsReasoning}`);
      console.log(`  thinkingFormat:          ${debug.thinkingFormat ?? "none"}`);
      console.log(`  modelCategory:           ${debug.modelCategory}`);
      console.log(`  recommendedTemperature:  ${debug.recommendedTemperature ?? "?"}`);
      console.log(`  recommendedTopP:         ${debug.recommendedTopP ?? "?"}`);
      console.log(`  reasoningBudget:         ${debug.reasoningBudget ?? "?"}`);
      console.log(`  reasoningEffort:         ${debug.reasoningEffortValues?.join(", ") ?? "?"}`);
      console.log(`  exampleRequestExtra:     ${debug.exampleRequestExtra ? JSON.stringify(debug.exampleRequestExtra) : "?"}`);
      return;
    }

    const rawModels = await fetchModelIds(NVIDIA_API_KEY!);
    const modelMap = new Map<string, { id: string; owned_by: string }>();
    for (const m of rawModels) modelMap.set(m.id, m);
    const allModels = Array.from(modelMap.values());

    console.log(`Fetching ${allModels.length} models (batchSize=${BATCH_SIZE}, delay=${DELAY_MS}ms)...`);

    const results: ModelMetadata[] = [];
    for (let i = 0; i < allModels.length; i += BATCH_SIZE) {
      const batch = allModels.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allModels.length / BATCH_SIZE);
      console.log(
        `Processing batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + BATCH_SIZE, allModels.length)} of ${allModels.length})...`
      );

      try {
        const batchResults = await Promise.all(
          batch.map(m => fetchModelData(m.id, m.owned_by))
        );
        results.push(...batchResults);

        if (i + BATCH_SIZE < allModels.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      } catch (error) {
        console.error(`\nBatch ${batchNum} failed:`, error);
        throw error;
      }
    }

    stripUnusedFields(results);
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\nWritten ${results.length} models to: ${outputFile}`);

    const summary = {
      total: results.length,
      withContext: results.filter(r => r.contextWindow).length,
      withToolCalling: results.filter(r => r.supportsToolCalling).length,
      withStructuredOut: results.filter(r => r.supportsStructuredOutput).length,
      withReasoning: results.filter(r => r.supportsReasoning).length,
      withVision: results.filter(r => r.supportsVision).length,
      withThinking: results.filter(r => r.thinkingFormat).length,
      withReasoningBudget: results.filter(r => r.reasoningBudget != null).length,
      withReasoningEffortValues: results.filter(r => r.reasoningEffortValues?.length).length,
    };

    console.log("\n=== Summary ===");
    console.log(`Total models:            ${summary.total}`);
    console.log(`With context window:     ${summary.withContext}`);
    console.log(`With tool calling:       ${summary.withToolCalling}`);
    console.log(`With structured output:  ${summary.withStructuredOut}`);
    console.log(`With reasoning:          ${summary.withReasoning}`);
    console.log(`With vision:             ${summary.withVision}`);
    console.log(`With thinking format:    ${summary.withThinking}`);
    console.log(`With reasoning budget:    ${summary.withReasoningBudget}`);

    console.log("\nCategory distribution:");
    const categories = results.reduce((acc, r) => {
      acc[r.modelCategory] = (acc[r.modelCategory] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`));

    console.log("\nThinking format distribution:");
    const formats = results.reduce((acc, r) => {
      if (r.thinkingFormat) acc[r.thinkingFormat] = (acc[r.thinkingFormat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    Object.entries(formats).forEach(([f, count]) => console.log(`  ${f}: ${count} models`));

    const missingCtx = results.filter(r => !r.contextWindow).map(r => r.id);
    if (missingCtx.length > 0) {
      console.log(`\nMissing context window (${missingCtx.length} models):`);
      missingCtx.forEach(id => console.log(`  - ${id}`));
    }

  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
