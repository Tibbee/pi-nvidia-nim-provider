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
const DOCS_BASE_URL = "https://docs.api.nvidia.com/nim/reference";
const BUILD_BASE_URL = "https://build.nvidia.com";
const OUTPUT_FILE = path.join(__dirname, "../models/metadata.json");

const BATCH_SIZE = 5;
const DELAY_MS = 300;

const verbose = process.argv.includes("--verbose");
const fetchCards = process.argv.includes("--cards");
const singleModel = process.argv
  .find(arg => arg.startsWith("--model=") || arg.startsWith("-m=") || arg.startsWith("--model-name="))
  ?.replace(/^--?model[=-]?/, "");
const outputFile = process.argv
  .find(arg => arg.startsWith("--output=") || arg.startsWith("-o="))
  ?.replace(/^--?output[=-]?/, "") || OUTPUT_FILE;

// ── Types ──────────────────────────────────────────────────────────────────

type ModelCategory = "chat" | "code" | "reasoning" | "embedding" | "vision" | "guard" | "other";
type SpeedTier = "fast" | "medium" | "slow";
type ToolCallFormat = "openai" | "hermes" | "mistral" | "llama" | "other";

interface FimTokens {
  prefix: string;
  suffix: string;
  middle: string;
}

interface ModelMetadata {
  id: string;
  owned_by: string;

  // Core limits
  contextWindow?: number;
  maxOutputTokens?: number;

  // Modalities
  inputModalities: string[];       // e.g. ["text"] | ["text","image"] | ["text","image","video"]
  supportsVision?: boolean;        // Derived from inputModalities, kept for backward compat

  // Reasoning / thinking
  supportsReasoning?: boolean;
  thinkingFormat?: string;

  // Tool calling
  supportsToolCalling?: boolean;
  supportsParallelToolCalls?: boolean;
  toolCallFormat?: ToolCallFormat;

  // Structured output (response_format / JSON mode)
  supportsStructuredOutput?: boolean;

  // Fill-in-the-Middle code completion
  supportsFIM?: boolean;
  fimTokens?: FimTokens;

  // Prompt features
  supportsSystemPrompt: boolean;

  // Recommended sampling (from modelcard)
  recommendedTemperature?: number;
  recommendedTopP?: number;
  recommendedTopK?: number;

  // Architecture
  totalParams?: number;   // billions
  activeParams?: number;  // billions (MoE active params)
  isMoE?: boolean;

  // Routing / classification
  modelCategory: ModelCategory;
  speedTier?: SpeedTier;

  // Labels / descriptions
  labels?: string[];
  description?: string;
  shortDescription?: string;

  // Meta
  discovered_at: string;
  card_fetched?: boolean;
  build_fetched?: boolean;
}

// ── Fallback tables ────────────────────────────────────────────────────────

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
    { re: /step-3\.5/i, ctx: 256000, out: 262144 },
    // FIX: m2.7 ISL is 204,800 — split from older minimax models
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

// ── Step 1: Fetch model list ───────────────────────────────────────────────

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

// ── Parsers: limits ────────────────────────────────────────────────────────

function parseContextWindow(text: string): number | undefined {
  const patterns: { re: RegExp; transform: (m: RegExpMatchArray) => number }[] = [
    {
      re: /max_tokens\s*:\s*(\d+)\s+to/i,
      transform: (m) => parseInt(m[1], 10),
    },
    {
      re: /input\s+context\s+length\s*[:=]?\s*(\d[\d,]*)\s*tokens?/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
    {
      re: /context\s+window\s*(?:size)?\s*[:=]?\s*(\d[\d,]*)\s*tokens?/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
    {
      re: /(\d[\d,]*)-token\s+context/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
    {
      re: /Input Context Length(?:\s*\(ISL\))?:\s*(\d+)\s*K/i,
      transform: (m) => parseInt(m[1], 10) * 1024,
    },
    {
      re: /Maximum context length(?: up to)?\s*(\d+(?:\.\d+)?)\s*[kKmMgG]?\s*tokens?/i,
      transform: (m) => {
        const num = parseFloat(m[1]);
        if (/[mM]/.test(m[0])) return Math.round(num * 1024 * 1024);
        if (/[kK]/.test(m[0])) return Math.round(num * 1024);
        return Math.round(num);
      },
    },
  ];

  let maxCtx = 0;
  for (const { re, transform } of patterns) {
    const globalRe = new RegExp(re.source, "gi");
    let match;
    while ((match = globalRe.exec(text)) !== null) {
      const val = transform(match);
      if (!isNaN(val) && val > maxCtx) maxCtx = val;
    }
  }
  return maxCtx > 0 ? maxCtx : undefined;
}

const MIN_REASONABLE_MAX_OUTPUT = 256;

function parseMaxOutputTokens(text: string): number | undefined {
  const patterns: { re: RegExp; transform: (m: RegExpMatchArray) => number }[] = [
    {
      re: /max_tokens\s*:\s*\d+\s+to\s+(\d+)/i,
      transform: (m) => parseInt(m[1], 10),
    },
    {
      re: /max_tokens.*?(\d+)\s+to\s+(\d+)/i,
      transform: (m) => parseInt(m[2], 10),
    },
    {
      re: /max_tokens.*?maximum.*?(\d+)/i,
      transform: (m) => parseInt(m[1], 10),
    },
    {
      re: /output\s+context\s+length\s*[:=]?\s*(\d[\d,]*)\s*tokens?/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
    {
      re: /practical\s+limit[^]*?(\d[\d,]*)\s*tokens?/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
  ];

  let maxOut = 0;
  for (const { re, transform } of patterns) {
    const globalRe = new RegExp(re.source, "gi");
    let match;
    while ((match = globalRe.exec(text)) !== null) {
      const val = transform(match);
      if (!isNaN(val) && val >= MIN_REASONABLE_MAX_OUTPUT && val > maxOut) {
        maxOut = val;
      }
    }
  }
  return maxOut > 0 ? maxOut : undefined;
}

// ── Parsers: modalities ────────────────────────────────────────────────────

/**
 * Parse the "Input Types" field from the modelcard page into a modality array.
 * Returns e.g. ["text"], ["text", "image"], ["text", "image", "video"]
 * Handles both <strong>-tagged HTML and plain-text formats.
 */
function parseInputModalities(html: string): string[] {
  const m1 = html.match(/<strong>Input Type(?:s|\(s\))?:\s*<\/strong>\s*([^<]+)/i);
  if (m1) return m1[1].split(/[,+]/).map(s => s.trim().toLowerCase()).filter(Boolean);

  const m2 = html.match(/Input Type\(?s\)?:\s*([^\n<]+)/i);
  if (m2) return m2[1].split(/[,+]/).map(s => s.trim().toLowerCase()).filter(Boolean);

  return ["text"]; // safe default
}

// Kept for backward compat — derived from inputModalities
// FIX: original regex on line 240 was "type"s*:s*"image" (missing backslashes on \s*)
function detectVisionSupport(text: string, modelId: string): boolean {
  if (/vision/i.test(modelId) || /omni/i.test(modelId)) return true;
  if (/"type"\s*:\s*"image"/i.test(text)) return true;
  return false;
}

function parseStructuredVisionSupport(html: string): boolean | undefined {
  const m1 = html.match(/<strong>Input Type(?:s|\(s\))?:\s*<\/strong>\s*([^<]+)/i);
  if (m1) return /image|video/i.test(m1[1]) ? true : false;
  const m2 = html.match(/Input Type\(?s\)?:\s*([^\n<]+)/i);
  if (m2) return /image|video/i.test(m2[1]) ? true : false;
  return undefined;
}

// ── Parsers: reasoning / thinking ─────────────────────────────────────────

function detectReasoningSupport(text: string): boolean {
  if (/reasoning\s+model/i.test(text)) return true;
  if (/thinking\s+mode/i.test(text)) return true;
  if (/reasoning_content/i.test(text)) return true;
  if (/chat_template_kwargs/i.test(text)) return true;
  if (/\bthink(?:ing)?\s*(?:mode|trace|step)/i.test(text)) return true;
  if (/reasoning_effort/i.test(text)) return true;
  return false;
}

function detectThinkingFormat(modelId: string, text: string): string | undefined {
  // Exact model-ID prefix rules (most reliable, checked first)
  if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
  if (/^deepseek-ai\/deepseek-(v3|r1)/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2-thinking/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.5/.test(modelId)) return "deepseek-nim";
  if (/^nvidia\/llama-3\.\d-nemotron-(ultra|super)/.test(modelId)) return "deepseek-nim";
  if (/^stepfun-ai\//.test(modelId)) return "stepfun-parallel";
  // FIX: m2.7 has no thinking — only m2.5 uses minimax-inline
  if (/^minimaxai\/minimax-m2\.5/.test(modelId)) return "minimax-inline";
  if (/^openai\/gpt-oss/.test(modelId)) return "reasoning-effort";
  if (/^z-ai\/glm/.test(modelId)) return "qwen-chat-template";
  if (/^microsoft\/phi-4-mini/.test(modelId)) return "qwen-chat-template";
  if (/^bytedance\/seed-oss/.test(modelId)) return "qwen-chat-template";
  if (/^nvidia\/nemotron-nano-9b/.test(modelId)) return "qwen-chat-template";
  if (/^nvidia\/nemotron-3-super/.test(modelId)) return "qwen-chat-template";
  if (/^qwen\/qwen3/.test(modelId)) return "qwen-chat-template";

  // HTML-based fallbacks (less reliable, checked last)
  if (/parallel_reasoning_mode/.test(text)) return "stepfun-parallel";
  if (/chat_template_kwargs.*(?:enable_thinking|clear_thinking)/.test(text)) return "qwen-chat-template";
  if (/chat_template_kwargs.*thinking.*true/.test(text)) return "deepseek-nim";
  if (/reasoning_effort/.test(text)) return "reasoning-effort";
  if (/reasoning_content/.test(text) && !/thinkingFormat/.test(text)) return "deepseek-nim";

  return undefined;
}

// ── Parsers: tool calling ──────────────────────────────────────────────────

function detectToolCalling(html: string, modelId: string): boolean {
  // Infer-page schema signals
  if (/\btools\b.*array/i.test(html)) return true;
  if (/tool_choice/i.test(html)) return true;
  if (/function.{0,30}calling/i.test(html)) return true;
  if (/tool.{0,20}use/i.test(html)) return true;

  // Well-known tool-capable families on NVIDIA NIM
  if (/llama-3\.[1-9]/i.test(modelId)) return true;
  if (/llama-4/i.test(modelId)) return true;
  if (/mistral(?!-7b)/i.test(modelId)) return true; // mistral-small and up support tools
  if (/qwen[23]/i.test(modelId)) return true;
  if (/gemma-[34]/i.test(modelId)) return true;
  if (/phi-4/i.test(modelId)) return true;
  if (/kimi-k2/i.test(modelId)) return true;
  if (/deepseek-v3|deepseek-v4/i.test(modelId)) return true;
  if (/nemotron-(ultra|super)/i.test(modelId)) return true;
  return false;
}

function detectParallelToolCalls(html: string): boolean {
  return /parallel_tool_calls/i.test(html);
}

function detectToolCallFormat(modelId: string, html: string): ToolCallFormat | undefined {
  // Not a tool calling model
  if (/llama2|gemma-2|codestral|starcoder|fim/i.test(modelId)) return undefined;
  // Mistral family uses its own native tool format
  if (/mistral|mixtral|devstral|magistral|ministral/i.test(modelId)) return "mistral";
  // Llama models served via NIM use OpenAI-compatible with llama tool schema
  if (/llama/i.test(modelId)) return "llama";
  // These all use standard OpenAI-compatible format via NIM
  if (/qwen|glm|phi|deepseek|kimi|moonshot|gemma/i.test(modelId)) return "openai";
  // Generic fallback if tools were detected at all
  if (detectToolCalling(html, modelId)) return "openai";
  return undefined;
}

// ── Parsers: structured output ─────────────────────────────────────────────

function detectStructuredOutput(html: string, modelId: string): boolean {
  if (/response_format/i.test(html)) return true;
  if (/json.{0,20}mode/i.test(html)) return true;
  if (/structured.{0,20}output/i.test(html)) return true;
  // Models known to support response_format on NIM even when not in docs
  if (/llama-3\.[1-9]|llama-4/i.test(modelId)) return true;
  if (/mistral|mixtral/i.test(modelId)) return true;
  if (/qwen[23]/i.test(modelId)) return true;
  return false;
}

// ── Parsers: FIM (fill-in-the-middle) ─────────────────────────────────────

const FIM_TOKEN_MAP: Record<string, FimTokens> = {
  "codestral": { prefix: "[SUFFIX]", suffix: "[PREFIX]", middle: "[MIDDLE]" },
  "starcoder": { prefix: "<fim_prefix>", suffix: "<fim_suffix>", middle: "<fim_middle>" },
  "deepseek-coder": { prefix: "<｜fim▁begin｜>", suffix: "<｜fim▁hole｜>", middle: "<｜fim▁end｜>" },
};

function detectFIM(html: string, modelId: string): boolean {
  if (/fill.in.the.middle|\bfim\b/i.test(html)) return true;
  if (/codestral|starcoder|deepseek-coder/i.test(modelId)) return true;
  return false;
}

function parseFimTokens(modelId: string): FimTokens | undefined {
  for (const [key, tokens] of Object.entries(FIM_TOKEN_MAP)) {
    if (new RegExp(key, "i").test(modelId)) return tokens;
  }
  return undefined;
}

// ── Parsers: recommended sampling params ──────────────────────────────────

interface RecommendedParams {
  temperature?: number;
  topP?: number;
  topK?: number;
}

/**
 * Extract recommended sampling settings from modelcard prose.
 * Handles formats like: temperature=1.0, top_p=0.95, top_k=40
 * or: temperature: 1.0 / top_p: 0.95
 */
function parseRecommendedParams(html: string): RecommendedParams {
  const result: RecommendedParams = {};
  const tempMatch = html.match(/temperature[=:\s]+(\d+(?:\.\d+)?)/i);
  if (tempMatch) result.temperature = parseFloat(tempMatch[1]);
  const topPMatch = html.match(/top_p[=:\s]+(\d+(?:\.\d+)?)/i);
  if (topPMatch) result.topP = parseFloat(topPMatch[1]);
  const topKMatch = html.match(/top_k[=:\s]+(\d+)/i);
  if (topKMatch) result.topK = parseInt(topKMatch[1], 10);
  return result;
}

// ── Parsers: architecture ──────────────────────────────────────────────────

interface ArchitectureInfo {
  totalParams?: number;  // billions
  activeParams?: number; // billions (MoE)
  isMoE?: boolean;
}

function parseBillions(value: string, unit: string): number {
  const num = parseFloat(value);
  const u = unit.toUpperCase();
  if (u === "T") return num * 1000;
  if (u === "B") return num;
  if (u === "M") return num / 1000;
  return num;
}

/**
 * Extract model architecture info from modelcard HTML.
 * Parses fields like:
 *   Total Parameters: 230B
 *   Active Parameters: 10B
 *   Network Architecture: Sparse Mixture-of-Experts (MoE)
 */
function parseModelArchitecture(html: string): ArchitectureInfo {
  const result: ArchitectureInfo = {};
  const totalMatch = html.match(/Total Parameters:\s*([\d.]+)\s*([TMB])/i);
  if (totalMatch) result.totalParams = parseBillions(totalMatch[1], totalMatch[2]);
  const activeMatch = html.match(/Active Parameters:\s*([\d.]+)\s*([TMB])/i);
  if (activeMatch) {
    result.activeParams = parseBillions(activeMatch[1], activeMatch[2]);
    result.isMoE = true;
  }
  if (/Mixture.of.Experts|MoE/i.test(html)) result.isMoE = true;
  return result;
}

// ── Parsers: model category ────────────────────────────────────────────────

function detectModelCategory(
  modelId: string,
  html: string,
  supportsReasoning: boolean
): ModelCategory {
  const id = modelId.toLowerCase();
  if (/embed|rerank|retriev/i.test(id)) return "embedding";
  if (/guard|safety|jailbreak|content.safety|pii/i.test(id)) return "guard";
  if (/stable.diffusion|flux\.|dalle|imagen|vista|vila|nv-clip|\bvl\b/i.test(id)) return "vision";
  if (/coder|codestral|starcoder|devstral|deepseek-coder/i.test(id)) return "code";
  if (supportsReasoning) return "reasoning";
  return "chat";
}

// ── Parsers: speed tier ────────────────────────────────────────────────────

function detectSpeedTier(activeParams?: number, totalParams?: number): SpeedTier | undefined {
  const params = activeParams ?? totalParams;
  if (params == null) return undefined;
  if (params < 15) return "fast";
  if (params < 75) return "medium";
  return "slow";
}

// ── Parsers: structured context window from modelcard page ────────────────

function parseKtoNumber(value: string): number | undefined {
  const trimmed = value.trim();
  const mK = trimmed.match(/^(\d+(?:\.\d+)?)\s*K$/i);
  if (mK) return Math.round(parseFloat(mK[1]) * 1024);
  const mM = trimmed.match(/^(\d+(?:\.\d+)?)\s*M$/i);
  if (mM) return Math.round(parseFloat(mM[1]) * 1024 * 1024);
  const mNum = trimmed.match(/^(\d+)$/);
  if (mNum) return parseInt(mNum[1], 10);
  return undefined;
}

/**
 * Parse context window from the structured modelcard page (non-infer).
 * Handles multiple formats:
 *   <strong>Input Context Length (ISL):</strong> 256K
 *   Input Context Length (ISL): 262,144 (256k)
 *   Input Context Length (ISL): 204,800          ← FIX: now handles comma numbers
 *   Maximum context length up to 256k tokens
 */
function parseStructuredContextWindow(html: string): number | undefined {
  // Format 1: <strong> label with bare K suffix — e.g. "256K"
  const m1 = html.match(/<strong>Input Context Length(?:\s*\(ISL\))?:<\/strong>\s*(\d+)\s*K/i);
  if (m1) return parseKtoNumber(m1[1] + "K");

  // Format 2: plain label with parenthetical — e.g. "262,144 (256k)"
  const m2 = html.match(/Input Context Length(?:\s*\(ISL\))?:\s*(\d[\d,]*)\s*\(([^)]+)\)/i);
  if (m2) {
    const kMatch = m2[2].match(/(\d+(?:\.\d+)?)\s*k/i);
    if (kMatch) return parseKtoNumber(kMatch[1] + "K");
    const mainNum = parseInt(m2[1].replace(/,/g, ""), 10);
    if (!isNaN(mainNum)) return mainNum;
  }

  // Format 3: plain number (with or without commas) — e.g. "204,800"
  // FIX: old pattern /(\d{5,})/ never matched comma-grouped numbers like "204,800"
  // New pattern captures comma-grouped numbers then strips commas before parsing
  const m3 = html.match(/Input Context Length(?:\s*\(ISL\))?:\s*(\d[\d,]{4,})/i);
  if (m3) return parseInt(m3[1].replace(/,/g, ""), 10);

  // Format 4: prose — "Maximum context length up to 256k tokens"
  const m4 = html.match(/Maximum context length(?: up to)?\s*(\d+(?:\.\d+)?\s*[kK]?)\s*tokens?/i);
  if (m4) return parseKtoNumber(m4[1]);

  return undefined;
}

// ── Step 2: Fetch build.nvidia.com (__NEXT_DATA__) ────────────────────────

async function fetchBuildPageData(modelId: string): Promise<{ html: string; found: boolean }> {
  const url = `${BUILD_BASE_URL}/${modelId}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { html: "", found: false };
    const html = await res.text();
    // Only treat as a successful fetch if we have meaningful content
    const hasData = html.includes("__NEXT_DATA__") && html.length > 5000;
    return { html: hasData ? html : "", found: hasData };
  } catch {
    return { html: "", found: false };
  }
}

function extractNextData(html: string): any | null {
  const start = html.indexOf('<script id="__NEXT_DATA__"');
  if (start === -1) return null;
  const jsonStart = html.indexOf(">", start) + 1;
  const jsonEnd = html.indexOf("</script>", jsonStart);
  try {
    return JSON.parse(html.substring(jsonStart, jsonEnd));
  } catch {
    return null;
  }
}

// ── Step 3: Fetch and assemble metadata for one model ─────────────────────

async function fetchModelData(modelId: string, owned_by: string): Promise<ModelMetadata> {
  const meta: ModelMetadata = {
    id: modelId,
    owned_by,
    inputModalities: ["text"],
    supportsSystemPrompt: true,
    modelCategory: "chat",
    discovered_at: new Date().toISOString(),
  };

  if (!fetchCards) return meta;

  const baseSlug = modelId.replace(/\//g, "-").toLowerCase();
  const slugVariations = [
    baseSlug,
    baseSlug.replace(/\./g, "-"),
    baseSlug.replace(/\./g, "_"),
    baseSlug.replace(/-(\d)/g, "$1"),
    baseSlug.replace(/\./g, (match, offset, string) =>
      offset < string.indexOf("/") ? "-" : "_"
    ),
  ];

  // ── Infer page: API schema, limits, tool params ──────────────────────────
  let combinedHtmlStr = "";
  for (const slug of slugVariations) {
    const url = `${DOCS_BASE_URL}/${slug}-infer`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const html = await response.text();
        combinedHtmlStr += html;
        meta.card_fetched = true;

        // Extract precise limits and capability flags from SSR-Props JSON (OpenAPI schema)
        const ssrStart = html.indexOf('id="ssr-props"');
        if (ssrStart !== -1) {
          const jsonStart = html.indexOf(">", ssrStart) + 1;
          const jsonEnd = html.indexOf("</script>", jsonStart);
          try {
            const ssrProps = JSON.parse(html.substring(jsonStart, jsonEnd));

            function findSchemas(obj: any): any {
              if (!obj || typeof obj !== "object") return null;
              if (obj.components?.schemas) return obj.components.schemas;
              for (const k in obj) {
                const found = findSchemas(obj[k]);
                if (found) return found;
              }
              return null;
            }

            const schemas = findSchemas(ssrProps);
            if (schemas) {
              for (const schema of Object.values(schemas) as any[]) {
                const props = schema?.properties;
                if (!props) continue;

                // Max output tokens
                const mtProp = props.max_tokens;
                if (mtProp) {
                  const limit: number =
                    mtProp.maximum ??
                    (mtProp.anyOf as any[])?.find((s: any) => s.maximum != null)?.maximum;
                  if (limit != null && isFinite(limit) && limit >= MIN_REASONABLE_MAX_OUTPUT) {
                    meta.maxOutputTokens = limit;
                  }
                }

                // Tool calling — presence of "tools" property in schema
                if (props.tools) meta.supportsToolCalling = true;
                if (props.parallel_tool_calls) meta.supportsParallelToolCalls = true;
                if (props.response_format) meta.supportsStructuredOutput = true;
              }
            }
          } catch { }
        }
        break;
      }
    } catch { }
  }

  // ── Modelcard page: structured Input/Output fields, architecture, sampling ─
  let structuredHtml = "";
  for (const slug of slugVariations) {
    const url = `${DOCS_BASE_URL}/${slug}`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        structuredHtml = await response.text();
        meta.card_fetched = true;
        break;
      }
    } catch { }
  }

  // ── build.nvidia.com: __NEXT_DATA__ for view-code snippets and extra params ─
  const buildData = await fetchBuildPageData(modelId);
  if (buildData.found) {
    meta.build_fetched = true;
    const nextData = extractNextData(buildData.html);
    const buildHtml = buildData.html;
    // nextData.props.pageProps contains model info and code examples.
    // Tool calling and thinking params sometimes appear only in the "view code"
    // snippets on this page but not on the docs infer page.
    if (!meta.supportsToolCalling && detectToolCalling(buildHtml, modelId)) {
      meta.supportsToolCalling = true;
    }
    if (!meta.thinkingFormat) {
      meta.thinkingFormat = detectThinkingFormat(modelId, buildHtml);
    }
    // Future: walk nextData.props.pageProps.codeSnippets for chat_template_kwargs,
    // reasoning_effort, parallel_reasoning_mode, etc.
    void nextData;
  }

  // ── Context window & max output (regex over infer page) ───────────────────
  meta.contextWindow = parseContextWindow(combinedHtmlStr);
  const textOutputTokens = parseMaxOutputTokens(combinedHtmlStr);
  if (!meta.maxOutputTokens) meta.maxOutputTokens = textOutputTokens;

  // ── Reasoning / thinking ──────────────────────────────────────────────────
  meta.supportsReasoning = detectReasoningSupport(combinedHtmlStr);
  meta.thinkingFormat = meta.thinkingFormat ?? detectThinkingFormat(modelId, combinedHtmlStr);
  if (meta.thinkingFormat) meta.supportsReasoning = true;

  // ── Tool calling (HTML fallback if schema didn't set it) ──────────────────
  meta.supportsToolCalling = meta.supportsToolCalling ?? detectToolCalling(combinedHtmlStr, modelId);
  meta.supportsParallelToolCalls = meta.supportsParallelToolCalls ?? detectParallelToolCalls(combinedHtmlStr);
  if (meta.supportsToolCalling) {
    meta.toolCallFormat = detectToolCallFormat(modelId, combinedHtmlStr);
  }

  // ── Structured output (HTML fallback) ─────────────────────────────────────
  meta.supportsStructuredOutput = meta.supportsStructuredOutput ?? detectStructuredOutput(combinedHtmlStr, modelId);

  // ── FIM ───────────────────────────────────────────────────────────────────
  meta.supportsFIM = detectFIM(combinedHtmlStr, modelId);
  if (meta.supportsFIM) meta.fimTokens = parseFimTokens(modelId);

  // ── Structured data from modelcard page (higher priority than regex) ───────
  const modalities = parseInputModalities(structuredHtml);
  const structuredCtx = parseStructuredContextWindow(structuredHtml);
  const structuredVis = parseStructuredVisionSupport(structuredHtml);
  const arch = parseModelArchitecture(structuredHtml);
  const samplingParams = parseRecommendedParams(structuredHtml);

  // Modalities: use structured data if we got more than the default ["text"]
  if (modalities.length > 0 && !(modalities.length === 1 && modalities[0] === "text" && structuredHtml === "")) {
    meta.inputModalities = modalities;
    meta.supportsVision = modalities.some(m => m === "image" || m === "video");
  } else {
    // Fall back to vision heuristics
    meta.supportsVision = structuredVis ?? detectVisionSupport(combinedHtmlStr, modelId);
    if (meta.supportsVision) meta.inputModalities = ["text", "image"];
    // Gemma 3 is multimodal even when docs don't say so explicitly
    if (!meta.supportsVision && /gemma-3/i.test(modelId)) {
      meta.supportsVision = true;
      meta.inputModalities = ["text", "image"];
    }
  }

  // Context window: structured field takes priority over regex
  if (structuredCtx !== undefined) meta.contextWindow = structuredCtx;

  // Architecture
  if (arch.totalParams != null) meta.totalParams = arch.totalParams;
  if (arch.activeParams != null) meta.activeParams = arch.activeParams;
  if (arch.isMoE) meta.isMoE = true;

  // Recommended sampling
  if (samplingParams.temperature != null) meta.recommendedTemperature = samplingParams.temperature;
  if (samplingParams.topP != null) meta.recommendedTopP = samplingParams.topP;
  if (samplingParams.topK != null) meta.recommendedTopK = samplingParams.topK;

  // ── Fallbacks (only applied where still missing) ──────────────────────────
  const familyFallback = getYardstickFallback(modelId);
  const manualFallback = FALLBACK_LIMITS_MAP[modelId];

  if (!meta.contextWindow) {
    meta.contextWindow = manualFallback?.contextWindow ?? familyFallback.contextWindow;
  }
  if (meta.maxOutputTokens == null) {
    const fb = manualFallback?.maxOutputTokens ?? familyFallback.maxOutputTokens;
    if (fb != null) meta.maxOutputTokens = fb;
  }

  // ── Classification ────────────────────────────────────────────────────────
  meta.modelCategory = detectModelCategory(
    modelId,
    combinedHtmlStr + structuredHtml,
    !!meta.supportsReasoning
  );
  meta.speedTier = detectSpeedTier(meta.activeParams, meta.totalParams);

  if (verbose) {
    console.log(
      `  ✓ ${modelId}: ctx=${meta.contextWindow ?? "?"} maxOut=${meta.maxOutputTokens ?? "?"} ` +
      `tools=${meta.supportsToolCalling} vision=${meta.supportsVision} ` +
      `fim=${meta.supportsFIM} reason=${meta.supportsReasoning} ` +
      `format=${meta.thinkingFormat ?? "none"} cat=${meta.modelCategory} ` +
      `speed=${meta.speedTier ?? "?"}`
    );
  }

  return meta;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  try {
    let models: { id: string; owned_by: string }[];

    if (singleModel) {
      console.log(`Testing single model: ${singleModel}`);
      const org = singleModel.split("/")[0];
      models = [{ id: singleModel, owned_by: org }];

      const meta = await fetchModelData(singleModel, org);

      const output = outputFile.includes(".json")
        ? outputFile
        : `test-${singleModel.replace(/\//g, "-")}.json`;
      fs.writeFileSync(output, JSON.stringify([meta], null, 2));
      console.log(`\nWritten to: ${output}`);
      console.log(`  contextWindow:           ${meta.contextWindow ?? "?"}`);
      console.log(`  maxOutputTokens:         ${meta.maxOutputTokens ?? "?"}`);
      console.log(`  inputModalities:         ${meta.inputModalities.join(", ")}`);
      console.log(`  supportsToolCalling:     ${meta.supportsToolCalling}`);
      console.log(`  toolCallFormat:          ${meta.toolCallFormat ?? "none"}`);
      console.log(`  supportsParallelTools:   ${meta.supportsParallelToolCalls}`);
      console.log(`  supportsStructuredOut:   ${meta.supportsStructuredOutput}`);
      console.log(`  supportsFIM:             ${meta.supportsFIM}`);
      console.log(`  supportsReasoning:       ${meta.supportsReasoning}`);
      console.log(`  thinkingFormat:          ${meta.thinkingFormat ?? "none"}`);
      console.log(`  modelCategory:           ${meta.modelCategory}`);
      console.log(`  speedTier:               ${meta.speedTier ?? "?"}`);
      console.log(`  totalParams:             ${meta.totalParams != null ? meta.totalParams + "B" : "?"}`);
      console.log(`  activeParams:            ${meta.activeParams != null ? meta.activeParams + "B" : "?"}`);
      console.log(`  isMoE:                   ${meta.isMoE ?? false}`);
      console.log(`  recommendedTemperature:  ${meta.recommendedTemperature ?? "?"}`);
      console.log(`  recommendedTopP:         ${meta.recommendedTopP ?? "?"}`);
      console.log(`  recommendedTopK:         ${meta.recommendedTopK ?? "?"}`);
      return;
    }

    // ── Full batch mode ────────────────────────────────────────────────────
    const rawModels = await fetchModelIds(NVIDIA_API_KEY!);
    const modelMap = new Map<string, { id: string; owned_by: string }>();
    for (const m of rawModels) modelMap.set(m.id, m);
    models = Array.from(modelMap.values());

    console.log(`Found ${models.length} unique models. Fetching technical metadata...`);

    const results: ModelMetadata[] = [];
    for (let i = 0; i < models.length; i += BATCH_SIZE) {
      const batch = models.slice(i, i + BATCH_SIZE);
      console.log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(models.length / BATCH_SIZE)}...`
      );
      const batchResults = await Promise.all(
        batch.map(m => fetchModelData(m.id, m.owned_by))
      );
      results.push(...batchResults);
      if (i + BATCH_SIZE < models.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\nWritten ${results.length} models to: ${outputFile}`);

    // ── Summary ───────────────────────────────────────────────────────────
    const summary = {
      total: results.length,
      withCards: results.filter(r => r.card_fetched).length,
      withBuildData: results.filter(r => r.build_fetched).length,
      withContext: results.filter(r => r.contextWindow).length,
      withToolCalling: results.filter(r => r.supportsToolCalling).length,
      withStructuredOut: results.filter(r => r.supportsStructuredOutput).length,
      withFIM: results.filter(r => r.supportsFIM).length,
      withReasoning: results.filter(r => r.supportsReasoning).length,
      withVision: results.filter(r => r.supportsVision).length,
      withThinking: results.filter(r => r.thinkingFormat).length,
      isMoE: results.filter(r => r.isMoE).length,
    };

    console.log("\n=== Summary ===");
    console.log(`Total models:            ${summary.total}`);
    console.log(`Static data fetched:     ${summary.withCards}`);
    console.log(`Build data fetched:      ${summary.withBuildData}`);
    console.log(`With context window:     ${summary.withContext}`);
    console.log(`With tool calling:       ${summary.withToolCalling}`);
    console.log(`With structured output:  ${summary.withStructuredOut}`);
    console.log(`With FIM support:        ${summary.withFIM}`);
    console.log(`With reasoning:          ${summary.withReasoning}`);
    console.log(`With vision:             ${summary.withVision}`);
    console.log(`With thinking format:    ${summary.withThinking}`);
    console.log(`MoE models:              ${summary.isMoE}`);

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
