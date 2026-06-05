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
const fetchCards = process.argv.includes("--cards");
const fullMode = process.argv.includes("--full");
const resumeMode = process.argv.includes("--resume");
const singleModel = process.argv
  .find(arg => arg.startsWith("--model=") || arg.startsWith("-m=") || arg.startsWith("--model-name="))
  ?.replace(/^--?model[=-]?/, "");
const outputFile = process.argv
  .find(arg => arg.startsWith("--output=") || arg.startsWith("-o="))
  ?.replace(/^--?output[=-]?/, "") || OUTPUT_FILE;

const BATCH_SIZE = getNumericArg(["--batch-size="], DEFAULT_BATCH_SIZE);
const DELAY_MS   = getNumericArg(["--delay="], DEFAULT_DELAY_MS);

// Scraper data shape — only fields actually used by the extension at runtime.
type ModelCategory = "chat" | "code" | "reasoning" | "embedding" | "vision" | "guard" | "other";
type ToolCallFormat = "openai" | "hermes" | "mistral" | "llama" | "other";

interface ModelMetadata {
  id: string;
  owned_by: string;

  contextWindow?: number;
  maxOutputTokens?: number;

  inputModalities: string[];       // e.g. ["text"] | ["text","image"]
  supportsVision?: boolean;        // Derived from inputModalities

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

// Intermediate scraping artifacts — never written to metadata.json.
const INTERNAL_SCRAPE_KEYS = new Set([
  "discovered_at",
  "card_fetched",
  "build_fetched",
  "supportsSystemPrompt",
  "supportsFIM",
  "fimTokens",
  "supportsParallelToolCalls",
  "isMoE",
  "speedTier",
  "totalParams",
  "activeParams",
  "recommendedTopK",
  "labels",
  "description",
  "shortDescription",
]);

// Fields present in ModelMetadata but never consumed by the extension or pi at runtime.
// Stripped by default; preserved with --full flag for debugging/inspection.
const EXTRA_FULL_MODE_FIELDS = new Set([
  "owned_by",
  "inputModalities",
  "modelCategory",
  "supportsToolCalling",
  "toolCallFormat",
  "supportsStructuredOutput",
  "recommendedTemperature",
  "recommendedTopP",
  "reasoningEffortDefault",
]);

function stripUnusedFields(results: ModelMetadata[]): ModelMetadata[] {
  for (const entry of results) {
    for (const key of INTERNAL_SCRAPE_KEYS) {
      delete (entry as any)[key];
    }
    if (!fullMode) {
      for (const key of EXTRA_FULL_MODE_FIELDS) {
        delete (entry as any)[key];
      }
    }
  }
  return results;
}

// Map build page label names to model categories.
// Priority order: first match wins (embedding > guard > vision > code > reasoning > chat).
const LABEL_CATEGORY_PRIORITY: [RegExp, ModelCategory][] = [
  [/\b(?:embed|rerank|retriev)\b/i, "embedding"],
  [/\b(?:guard|safety|jailbreak|content.safety|pii)\b/i, "guard"],
  [/\b(?:vision assistant|visual question answering|image-to-text|image captioning|vlm|vision language model|visual grounding|visual qa|omni)\b/i, "vision"],
  [/\b(?:reasoning|advanced reasoning|thinking budget)\b/i, "reasoning"],
  [/\b(?:code generation|coding|coder|codestral|starcoder|devstral|deepseek-coder|text-to-code|agentic coding)\b/i, "code"],
  [/\b(?:language generation|chat|text generation|text-to-text|conversational|instruction following|function calling|tool calling|tool use|math|multilingual|long context|large language model|slm)\b/i, "chat"],
];

// Extract plain (non-prefixed) use-case labels from the build page JSON data.
// Labels are found in the model artifact JSON inside the Next.js RSC payload,
// anchored right after "shortDescription": the JSON is string-escaped
// as: \"labels\":[\"value1\",\"value2\",...]
function parseBuildPageLabels(buildHtml: string): string[] {
  const plainLabels = new Set<string>();
  // Anchor on shortDescription to find the model-specific artifact labels
  // (the build page contains many labels arrays from catalog listings;
  //  the model-specific one is right after shortDescription)
  const sdIdx = buildHtml.indexOf('shortDescription');
  if (sdIdx === -1) return [];
  
  // Search within a window after shortDescription (max 3000 chars)
  const searchEnd = Math.min(sdIdx + 3000, buildHtml.length);
  const window = buildHtml.substring(sdIdx, searchEnd);
  
  // Find the escaped labels array: \"labels\":[\"...\",\"...\"]
  const labelArrayRe = /\\"labels\\"\s*:\s*\[(.*?)\]/;
  const match = labelArrayRe.exec(window);
  if (!match) return [];
  
  const raw = match[1];
  // Extract individual items: \"value\"
  const itemRe = /\\"([^"\\]+?)\\"/g;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRe.exec(raw)) !== null) {
    const val = itemMatch[1];
    // Only collect plain labels (no colons — those are prefixed metadata like
    // cloudPartnerType:endpoint:cloud_partner_type_bitdeer)
    if (!val.includes(":")) {
      plainLabels.add(val);
    }
  }
  return Array.from(plainLabels);
}

// Map plain labels to the best model category (highest priority match wins).
// Iterates patterns in priority order (embedding > guard > vision > code > reasoning > chat).
function labelToCategory(plainLabels: string[]): ModelCategory | undefined {
  for (const [pattern, category] of LABEL_CATEGORY_PRIORITY) {
    for (const label of plainLabels) {
      if (pattern.test(label)) return category;
    }
  }
  return undefined;
}

// Check if any plain label indicates reasoning support.
function labelHasReasoning(plainLabels: string[]): boolean {
  return plainLabels.some(l => /\breasoning\b/i.test(l));
}

// Fallback limits when docs are incomplete.
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

/**
 * Fetch wrapper with exponential backoff for 429 / non-OK responses.
 * When verbose is enabled, every non-OK attempt is logged.
 */
async function fetchWithRetry(url: string, options?: RequestInit, retries = 3, backoff = 2000): Promise<Response> {
  // Add browser-like headers to avoid bot detection
  const headers = {
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
    ...(options?.headers || {}),
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
    // Non-429 error; stop retry immediately
    break;
  }
  return fetch(url, options); // return the final response (likely non-OK)
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
      re: /context\s+length(?:\s+up\s+to)?\s*(\d[\d,]*)\s*tokens?/i,
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

function parseReasoningBudget(text: string): number | undefined {
  const re = /reasoning_budget[\s\S]{0,500}?-1\s+to\s+(\d[\d,]*)/gi;
  let maxBudget = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    const val = parseInt(match[1].replace(/,/g, ""), 10);
    if (!isNaN(val) && val > maxBudget) maxBudget = val;
  }
  return maxBudget > 0 ? maxBudget : undefined;
}

function parseReasoningEffortValues(html: string): { values?: string[]; defaultValue?: string } {
  const selectMatch = html.match(/<select[^>]*id="[^"]*reasoning_effort[^"]*"[^>]*>([\s\S]*?)<\/select>/i);
  if (!selectMatch) return {};

  const selectHtml = selectMatch[1];
  const values = Array.from(selectHtml.matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>/gi))
    .map((m) => m[1].trim().toLowerCase())
    .filter(Boolean);
  const uniqueValues = Array.from(new Set(values));
  const selected = selectHtml.match(/<option\b[^>]*value="([^"]*)"[^>]*selected[^>]*>/i)?.[1]?.trim().toLowerCase();

  return {
    values: uniqueValues.length > 0 ? uniqueValues : undefined,
    defaultValue: selected ?? uniqueValues[0],
  };
}

function parseInputModalities(html: string): string[] {
  const m1 = html.match(/<strong>Input Type(?:s|\(s\))?:\s*<\/strong>\s*([^<]+)/i);
  if (m1) return m1[1].split(/[,+]/).map(s => s.trim().toLowerCase()).filter(Boolean);

  const m2 = html.match(/Input Type\(?s\)?:\s*([^\n<]+)/i);
  if (m2) return m2[1].split(/[,+]/).map(s => s.trim().toLowerCase()).filter(Boolean);

  return ["text"]; // safe default
}

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

function detectReasoningSupport(text: string): boolean {
  if (/reasoning\s+model/i.test(text)) return true;
  if (/thinking\s+mode/i.test(text)) return true;
  if (/reasoning_content/i.test(text)) return true;
  if (/chat_template_kwargs/i.test(text)) return true;
  if (/\bthink(?:ing)?\s*(?:mode|trace|step)/i.test(text)) return true;
  if (/reasoning_effort/i.test(text)) return true;
  return false;
}

// Prefer exact IDs; HTML only backs it up.
function detectThinkingFormat(modelId: string, text: string): string | undefined {
  // Known formats with explicit API parameters — checked by model ID.
  if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
  if (/^openai\/gpt-oss/.test(modelId)) return "reasoning-effort";

  // System-message-based thinking (no chat_template_kwargs).
  if (/^nvidia\/llama-3\.3-nemotron-super-49b-v1$/.test(modelId)) return "nemotron-system-detailed";
  if (/^nvidia\/llama-3\.3-nemotron-super-49b-v1\.5/.test(modelId)) return "nemotron-system-think";
  if (/^nvidia\/nvidia-nemotron-nano-9b-v2/.test(modelId)) return "nemotron-system-think";

  // enable_thinking + effort flags + reasoning_budget.
  if (/^nvidia\/nemotron-3-super-120b-a12b/.test(modelId)) return "nemotron-3-super-effort";

  // Top-level thinking_budget param.
  if (/^bytedance\/seed-oss/.test(modelId)) return "thinking-budget";

  // chat_template_kwargs.thinking (toggle-able, deepseek-style).
  if (/^deepseek-ai\/deepseek-(v3|r1)/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.5/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.6/.test(modelId)) return "deepseek-nim";
  if (/^nvidia\/llama-3\.1-nemotron-ultra/.test(modelId)) return "deepseek-nim";

  // qwen-chat-template: only models confirmed to have enable_thinking.
  if (/^z-ai\/glm/.test(modelId)) return "qwen-chat-template";
  if (/^qwen\/qwen3\.5/.test(modelId)) return "qwen-chat-template";  // qwen3.5 series only
  if (/^google\/gemma-4/.test(modelId)) return "qwen-chat-template";
  if (/^nvidia\/nemotron-3-nano/.test(modelId)) return "qwen-chat-template";

  // Models known to have no structured thinking API — skip HTML fallback.
  // These either always think (no toggle) or have no reasoning at all.
  if (/^stepfun-ai\//.test(modelId) ||
      /^mistralai\/magistral/.test(modelId) ||
      /^moonshotai\/kimi-k2-thinking/.test(modelId) ||
      /^moonshotai\/kimi-k2-instruct-0905/.test(modelId) ||
      /^qwen\/qwen3-next/.test(modelId) ||
      /^qwen\/qwen3-coder/.test(modelId) ||
      /^microsoft\/phi-4-mini/.test(modelId) ||
      /^mistralai\/devstral/.test(modelId) ||
      /^sarvamai\//.test(modelId) ||
      /^minimaxai\//.test(modelId) ||
      /^moonshotai\/kimi-k2-instruct$/.test(modelId)) return undefined;

  // Fallback: detect from schema/HTML content.
  if (/parallel_reasoning_mode/.test(text)) return "deepseek-nim";
  if (/chat_template_kwargs.*(?:enable_thinking|clear_thinking)/.test(text)) return "qwen-chat-template";
  if (/chat_template_kwargs.*thinking.*true/.test(text)) return "deepseek-nim";
  if (/reasoning_effort/.test(text)) return "reasoning-effort";
  if (/reasoning_content/.test(text) && !/thinkingFormat/.test(text)) return "deepseek-nim";

  return undefined;
}

// Schema hints first, family heuristics second.
function detectToolCalling(html: string, modelId: string): boolean {
  if (/\btools\b.*array/i.test(html)) return true;
  if (/tool_choice/i.test(html)) return true;
  if (/function.{0,30}calling/i.test(html)) return true;
  if (/tool.{0,20}use/i.test(html)) return true;

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

// Map tool calling to native provider formats.
function detectToolCallFormat(modelId: string, html: string): ToolCallFormat | undefined {
  if (/llama2|gemma-2|codestral|starcoder|fim/i.test(modelId)) return undefined;
  if (/mistral|mixtral|devstral|magistral|ministral/i.test(modelId)) return "mistral";
  if (/llama/i.test(modelId)) return "llama";
  if (/qwen|glm|phi|deepseek|kimi|moonshot|gemma/i.test(modelId)) return "openai";
  if (detectToolCalling(html, modelId)) return "openai";
  return undefined;
}

// Response-format support is partly inferred.
function detectStructuredOutput(html: string, modelId: string): boolean {
  if (/response_format/i.test(html)) return true;
  if (/json.{0,20}mode/i.test(html)) return true;
  if (/structured.{0,20}output/i.test(html)) return true;
  if (/llama-3\.[1-9]|llama-4/i.test(modelId)) return true;
  if (/mistral|mixtral/i.test(modelId)) return true;
  if (/qwen[23]/i.test(modelId)) return true;
  return false;
}

interface RecommendedParams {
  temperature?: number;
  topP?: number;
}

function parseRecommendedParams(html: string): RecommendedParams {
  const result: RecommendedParams = {};
  const tempMatch = html.match(/temperature[=:\s]+(\d+(?:\.\d+)?)/i);
  if (tempMatch) result.temperature = parseFloat(tempMatch[1]);
  const topPMatch = html.match(/top_p[=:\s]+(\d+(?:\.\d+)?)/i);
  if (topPMatch) result.topP = parseFloat(topPMatch[1]);
  return result;
}

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

// Handle comma-grouped numbers too.
function parseStructuredContextWindow(html: string): number | undefined {
  const m1 = html.match(/<strong>Input Context Length(?:\s*\(ISL\))?:<\/strong>\s*(\d+)\s*K/i);
  if (m1) return parseKtoNumber(m1[1] + "K");

  const m2 = html.match(/Input Context Length(?:\s*\(ISL\))?:\s*(\d[\d,]*)\s*\(([^)]+)\)/i);
  if (m2) {
    const kMatch = m2[2].match(/(\d+(?:\.\d+)?)\s*k/i);
    if (kMatch) return parseKtoNumber(kMatch[1] + "K");
    const mainNum = parseInt(m2[1].replace(/,/g, ""), 10);
    if (!isNaN(mainNum)) return mainNum;
  }

  const m3 = html.match(/Input Context Length(?:\s*\(ISL\))?:\s*(\d[\d,]{4,})/i);
  if (m3) return parseInt(m3[1].replace(/,/g, ""), 10);

  const m4 = html.match(/Context length(?: up to)?\s*(\d[\d,]*)\s*tokens?/i);
  if (m4) return parseInt(m4[1].replace(/,/g, ""), 10);

  const m5 = html.match(/Maximum context length(?: up to)?\s*(\d+(?:\.\d+)?\s*[kK]?)\s*tokens?/i);
  if (m5) return parseKtoNumber(m5[1]);

  return undefined;
}

// Ignore tiny placeholder build pages.
async function fetchBuildPageData(modelId: string): Promise<{ html: string; found: boolean }> {
  const url = `${BUILD_BASE_URL}/${modelId}`;
  try {
    const res = await fetchWithRetry(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { html: "", found: false };
    const html = await res.text();
    const hasData = html.length > 5000;
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

// Find the request schema by content, not name.
// Works for ChatRequest, NIMLLMChatCompletionRequest, and any future variant.
function findRequestSchema(schemas: Record<string, any>): Record<string, any> | null {
  for (const schema of Object.values(schemas) as any[]) {
    const props: Record<string, any> | undefined = schema?.properties;
    if (!props) continue;
    const keys = Object.keys(props);
    if (keys.includes("model") && keys.includes("messages") &&
        (keys.includes("max_tokens") || keys.includes("max_completion_tokens"))) {
      return props;
    }
  }
  return null;
}

// Classify thinking format from schema clues.
// Checks reasoning_effort + chat_template_kwargs descriptions before
// falling back to model-ID heuristics.
function classifyThinkingFromSchema(
  modelId: string,
  props: Record<string, any>
): string | undefined {
  // ── Models known to have no structured thinking API (always-on or no reasoning) ──
  if (/^stepfun-ai\//.test(modelId)) return undefined;
  if (/^mistralai\/magistral/.test(modelId)) return undefined;
  if (/^moonshotai\/kimi-k2-thinking/.test(modelId)) return undefined;
  if (/^moonshotai\/kimi-k2-instruct-0905/.test(modelId)) return undefined;
  if (/^qwen\/qwen3-next/.test(modelId)) return undefined;
  if (/^qwen\/qwen3-coder/.test(modelId)) return undefined;
  if (/^microsoft\/phi-4-mini/.test(modelId)) return undefined;
  if (/^mistralai\/devstral/.test(modelId)) return undefined;
  if (/^sarvamai\//.test(modelId)) return undefined;
  if (/^minimaxai\//.test(modelId)) return undefined;
  if (/^moonshotai\/kimi-k2-instruct$/.test(modelId)) return undefined;

  // ── Known special formats ──
  // Nemotron 3 Super 120B: enable_thinking + low_effort + reasoning_budget
  if (/^nvidia\/nemotron-3-super-120b-a12b/.test(modelId)) return "nemotron-3-super-effort";

  // reasoning_effort with "chat_template_kwargs" in description → deepseek family
  const re = props.reasoning_effort;
  if (re?.description && /chat_template_kwargs/.test(re.description)) {
    if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
    return "deepseek-nim";
  }

  // chat_template_kwargs property itself
  const ctkw = props.chat_template_kwargs;
  if (ctkw) {
    const combined = (ctkw.description ?? "") + " " + JSON.stringify(ctkw.example ?? "");
    if (/enable_thinking/.test(combined)) return "qwen-chat-template";
    if (/parallel_reasoning_mode/.test(combined)) return "deepseek-nim";
    if (/\bthinking\b/.test(combined)) return "deepseek-nim";
  }

  return undefined;
}

// Standard OpenAI params — everything else in requestJson is model-specific.
const STANDARD_OPENAI_PARAMS = new Set([
  "model", "messages", "temperature", "top_p", "max_tokens",
  "max_completion_tokens", "seed", "stream", "stop", "n",
  "presence_penalty", "frequency_penalty", "logit_bias", "user",
  "top_k", "repetition_penalty", "response_format", "tools", "tool_choice",
]);

// Find ALL named example request bodies in SSR props.
// Returns the one with thinking enabled (most complete kwargs), falling back to any.
function findBestRequestJson(obj: any): string | null {
  const examples: Array<{ name?: string; rj: string }> = [];
  
  function collect(o: any) {
    if (!o || typeof o !== "object") return;
    if (typeof o.name === "string" && typeof o.requestJson === "string") {
      examples.push({ name: o.name, rj: o.requestJson });
    }
    // Also catch unnamed requestJson at any level
    if (typeof o.requestJson === "string" && !o.name) {
      examples.push({ rj: o.requestJson });
    }
    for (const k in o) collect(o[k]);
  }
  collect(obj);
  
  if (examples.length === 0) return null;
  
  // Prefer the example with thinking ENABLED (reveals complete kwargs structure)
  for (const ex of examples) {
    try {
      const parsed = JSON.parse(ex.rj);
      const ctkw = parsed.chat_template_kwargs;
      if (ctkw && typeof ctkw === "object") {
        const hasThinking = Object.entries(ctkw).some(
          ([k, v]) => (k === "enable_thinking" || k === "thinking") && v === true
        );
        if (hasThinking) return ex.rj;
      }
    } catch {}
  }
  
  // Fallback: first example (disabled/default state)
  return examples[0].rj;
}

// Merge build/docs/fallback data for one model.
async function fetchModelData(modelId: string, owned_by: string): Promise<ModelMetadata> {
  const meta: ModelMetadata = {
    id: modelId,
    owned_by,
    inputModalities: ["text"],
    modelCategory: "chat",
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

  let combinedHtmlStr = "";
  for (let slugIdx = 0; slugIdx < slugVariations.length; slugIdx++) {
    const slug = slugVariations[slugIdx];
    // Delay between slug variations to avoid rate limiting
    if (slugIdx > 0) await new Promise(r => setTimeout(r, 1500));
    const url = `${DOCS_BASE_URL}/${slug}-infer`;
    try {
      const response = await fetchWithRetry(url);
      if (response.ok) {
        const html = await response.text();
        combinedHtmlStr += html;

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
              // Primary: extract everything from the request schema
              const reqProps = findRequestSchema(schemas);
              if (reqProps) {
                // ---- max output tokens ----
                const mtProp = reqProps.max_tokens ?? reqProps.max_completion_tokens;
                if (mtProp) {
                  const limit: number =
                    mtProp.maximum ??
                    (mtProp.anyOf as any[])?.find((s: any) => s.maximum != null)?.maximum ??
                    mtProp.default;
                  if (limit != null && isFinite(limit) && limit >= MIN_REASONABLE_MAX_OUTPUT) {
                    meta.maxOutputTokens = limit;
                  }
                }

                // ---- recommended sampling params ----
                if (reqProps.temperature?.default != null) meta.recommendedTemperature = reqProps.temperature.default;
                if (reqProps.top_p?.default != null) meta.recommendedTopP = reqProps.top_p.default;

                // ---- tool calling ----
                if (reqProps.tools) meta.supportsToolCalling = true;
                if (reqProps.tool_choice) meta.supportsToolCalling = true;

                // ---- structured output ----
                if (reqProps.response_format) meta.supportsStructuredOutput = true;

                // ---- reasoning effort ----
                const reProp = reqProps.reasoning_effort;
                if (reProp) {
                  meta.supportsReasoning = true;
                  if (reProp.enum) meta.reasoningEffortValues = reProp.enum;
                  if (reProp.default != null) meta.reasoningEffortDefault = reProp.default;
                }

                // ---- reasoning/thinking budget ----
                // Different model families use different names for the same concept
                const rbProp = reqProps.reasoning_budget ?? reqProps.thinking_budget;
                if (rbProp) {
                  meta.reasoningBudget = rbProp.maximum ?? rbProp.default;
                }

                // ---- thinking format from schema clues ----
                const schemaFormat = classifyThinkingFromSchema(modelId, reqProps);
                if (schemaFormat) {
                  meta.thinkingFormat = schemaFormat;
                  meta.supportsReasoning = true;
                }
              }

              // Secondary: scan ALL schemas for tools/response_format signals
              // (in case they appear on a different schema, e.g. ChatCompletionResponse)
              for (const schema of Object.values(schemas) as any[]) {
                const props = schema?.properties;
                if (!props) continue;
                if (props.tools) meta.supportsToolCalling = true;
                if (props.response_format) meta.supportsStructuredOutput = true;
              }

              // ---- vision support from schema names ----
              // VLM models expose NIMVLMChatCompletionContentPartImage in their schemas
              if (!meta.supportsVision) {
                if (Object.keys(schemas).some(n => /NIMVLMChatCompletionContentPartImage/i.test(n))) {
                  meta.supportsVision = true;
                }
              }

              // ---- extract ALL non-standard params from the THINKING-ENABLED example ----
              // Picks the requestJson where thinking=true (e.g. "Which number is larger…"),
              // which reveals the complete chat_template_kwargs structure including
              // model-specific keys like clear_thinking, low_effort, etc.
              const rj = findBestRequestJson(ssrProps);
              if (rj) {
                try {
                  const example = JSON.parse(rj);
                  const extra: Record<string, unknown> = {};
                  for (const [key, value] of Object.entries(example)) {
                    if (!STANDARD_OPENAI_PARAMS.has(key)) {
                      extra[key] = value;
                    }
                  }
                  if (Object.keys(extra).length > 0) {
                    meta.exampleRequestExtra = extra;
                  }
                } catch {}
              }
              // Extract chat_template_kwargs defaults from schema — always merge
              // because the schema is authoritative for the complete default object,
              // even when requestJson provides partial thinking examples
              if (reqProps?.chat_template_kwargs) {
                const ctkw = reqProps.chat_template_kwargs;
                // Prefer the parent-level .default (e.g. {"enable_thinking": true})
                if (ctkw.default && typeof ctkw.default === "object") {
                  meta.exampleRequestExtra = {
                    chat_template_kwargs: ctkw.default,
                    ...(meta.exampleRequestExtra ?? {}),
                  };
                }
              }
            }
          } catch { }
        }
        break;
      }
    } catch { }
  }

  let structuredHtml = "";
  for (let slugIdx = 0; slugIdx < slugVariations.length; slugIdx++) {
    const slug = slugVariations[slugIdx];
    // Delay between slug variations to avoid rate limiting
    if (slugIdx > 0) await new Promise(r => setTimeout(r, 1500));
    const url = `${DOCS_BASE_URL}/${slug}`;
    try {
      const response = await fetchWithRetry(url);
      if (response.ok) {
        structuredHtml = await response.text();
        break;
      }
    } catch { }
  }

  const buildData = await fetchBuildPageData(modelId);
  const plainLabels: string[] = [];
  if (buildData.found) {
    const nextData = extractNextData(buildData.html);
    const buildHtml = buildData.html;
    if (!meta.supportsToolCalling && detectToolCalling(buildHtml, modelId)) {
      meta.supportsToolCalling = true;
    }
    if (!meta.thinkingFormat) {
      meta.thinkingFormat = detectThinkingFormat(modelId, buildHtml);
    }
    // Parse plain use-case labels from the build page JSON data
    // (e.g., "coding", "reasoning", "Language Generation", "Vision Assistant")
    plainLabels.push(...parseBuildPageLabels(buildHtml));
    if (plainLabels.length > 0 && verbose) {
      console.log(`    labels: ${plainLabels.join(", ")}`);
    }

    // Set modelCategory from labels if we have them (more precise than ID heuristics)
    const labelCategory = labelToCategory(plainLabels);
    if (labelCategory) {
      meta.modelCategory = labelCategory;
      if (verbose) console.log(`    → modelCategory from label: ${labelCategory}`);
    }

    // Fallback: use "reasoning" label to set supportsReasoning
    // (catches models like MiniMax M2.7 that have reasoning in their labels but no reasoning params in schema)
    if (!meta.supportsReasoning && labelHasReasoning(plainLabels)) {
      meta.supportsReasoning = true;
      if (verbose) console.log(`    → supportsReasoning from label`);
    }
    void nextData;
  }

  meta.contextWindow = parseContextWindow(combinedHtmlStr);
  const textOutputTokens = parseMaxOutputTokens(combinedHtmlStr);
  if (!meta.maxOutputTokens) meta.maxOutputTokens = textOutputTokens;

  if (!meta.supportsReasoning) meta.supportsReasoning = detectReasoningSupport(combinedHtmlStr);
  meta.thinkingFormat = meta.thinkingFormat ?? detectThinkingFormat(modelId, combinedHtmlStr);
  if (meta.thinkingFormat) meta.supportsReasoning = true;

  // Override: known models that should NOT have reasoning despite label/schema detection.
  if (/^mistralai\/devstral/.test(modelId) ||
      /^moonshotai\/kimi-k2-instruct$/.test(modelId) ||
      /^moonshotai\/kimi-k2-instruct-0905/.test(modelId) ||
      /^qwen\/qwen3-next-80b-a3b-instruct$/.test(modelId) ||
      /^sarvamai\//.test(modelId)) {
    meta.supportsReasoning = false;
    if (meta.thinkingFormat) {
      if (verbose) console.log(`    → clearing thinkingFormat (was ${meta.thinkingFormat}) — model has no reasoning`);
      meta.thinkingFormat = undefined;
    }
    if (meta.reasoningBudget != null) {
      if (verbose) console.log(`    → clearing reasoningBudget — model has no reasoning`);
      delete meta.reasoningBudget;
    }
    if (meta.reasoningEffortValues) {
      if (verbose) console.log(`    → clearing reasoningEffortValues — model has no reasoning`);
      delete meta.reasoningEffortValues;
    }
    if (meta.exampleRequestExtra) {
      if (verbose) console.log(`    → clearing exampleRequestExtra — model has no reasoning`);
      delete meta.exampleRequestExtra;
    }
  }
  const htmlBudget = parseReasoningBudget(combinedHtmlStr);
  if (htmlBudget != null) {
    meta.reasoningBudget = meta.reasoningBudget != null
      ? Math.max(meta.reasoningBudget, htmlBudget)
      : htmlBudget;
  }
  if (!meta.reasoningEffortValues) {
    const reasoningEffort = parseReasoningEffortValues(combinedHtmlStr);
    meta.reasoningEffortValues = reasoningEffort.values;
    meta.reasoningEffortDefault = reasoningEffort.defaultValue;
  }

  meta.supportsToolCalling = meta.supportsToolCalling ?? detectToolCalling(combinedHtmlStr, modelId);
  if (meta.supportsToolCalling) {
    meta.toolCallFormat = detectToolCallFormat(modelId, combinedHtmlStr);
  }

  meta.supportsStructuredOutput = meta.supportsStructuredOutput ?? detectStructuredOutput(combinedHtmlStr, modelId);

  const modalities = parseInputModalities(structuredHtml);
  const structuredCtx = parseStructuredContextWindow(structuredHtml);
  const structuredVis = parseStructuredVisionSupport(structuredHtml);
  const samplingParams = parseRecommendedParams(structuredHtml);

  if (modalities.length > 0 && !(modalities.length === 1 && modalities[0] === "text" && structuredHtml === "")) {
    meta.inputModalities = modalities;
    if (!meta.supportsVision) meta.supportsVision = modalities.some(m => m === "image" || m === "video");
  } else {
    if (!meta.supportsVision) meta.supportsVision = structuredVis ?? detectVisionSupport(combinedHtmlStr, modelId);
    if (meta.supportsVision && meta.inputModalities.length === 1 && meta.inputModalities[0] === "text") meta.inputModalities = ["text", "image"];
    if (!meta.supportsVision && /gemma-3/i.test(modelId)) {
      meta.supportsVision = true;
      meta.inputModalities = ["text", "image"];
    }
  }

  if (structuredCtx !== undefined) meta.contextWindow = structuredCtx;

  if (meta.recommendedTemperature == null && samplingParams.temperature != null) meta.recommendedTemperature = samplingParams.temperature;
  if (meta.recommendedTopP == null && samplingParams.topP != null) meta.recommendedTopP = samplingParams.topP;

  const familyFallback = getYardstickFallback(modelId);
  const manualFallback = FALLBACK_LIMITS_MAP[modelId];

  if (!meta.contextWindow) {
    meta.contextWindow = manualFallback?.contextWindow ?? familyFallback.contextWindow;
  }
  if (meta.maxOutputTokens == null) {
    const fb = manualFallback?.maxOutputTokens ?? familyFallback.maxOutputTokens;
    if (fb != null) meta.maxOutputTokens = fb;
  }

  // Build page labels take precedence; fall back to ID heuristics only if labels gave no match.
  if (meta.modelCategory === "chat") {
    const labelCat = labelToCategory(plainLabels);
    if (!labelCat || labelCat === "chat") {
      const idCat = detectModelCategory(modelId, combinedHtmlStr + structuredHtml, !!meta.supportsReasoning);
      if (idCat !== "chat") meta.modelCategory = idCat;
    }
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

// Batch-fetch all live models.
async function main() {
  try {
    let models: { id: string; owned_by: string }[];

    if (singleModel) {
      console.log(`Testing single model: ${singleModel}`);
      const org = singleModel.split("/")[0];
      models = [{ id: singleModel, owned_by: org }];

      const meta = await fetchModelData(singleModel, org);

      // Capture debug values before stripUnusedFields may remove them.
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

      const output = outputFile.includes(".json")
        ? outputFile
        : `test-${singleModel.replace(/\//g, "-")}.json`;
      stripUnusedFields([meta]);
      fs.writeFileSync(output, JSON.stringify([meta], null, 2));
      console.log(`\nWritten to: ${output}`);
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

    // Load existing metadata if resuming
    let existingResults: ModelMetadata[] = [];
    let modelsToFetch = allModels;
    
    if (resumeMode && fs.existsSync(outputFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(outputFile, "utf8"));
        existingResults = existing as ModelMetadata[];
        const existingIds = new Set(existingResults.map(r => r.id));
        modelsToFetch = allModels.filter(m => !existingIds.has(m.id));
        console.log(`Resume mode: ${existingResults.length} models already cached, ${modelsToFetch.length} to fetch`);
      } catch (e) {
        console.warn("Failed to load existing metadata, starting fresh");
      }
    }

    if (modelsToFetch.length === 0) {
      console.log("All models already cached. Use without --resume to refetch.");
      return;
    }

    console.log(`Fetching ${modelsToFetch.length} models (batchSize=${BATCH_SIZE}, delay=${DELAY_MS}ms)...`);

    const newResults: ModelMetadata[] = [];
    for (let i = 0; i < modelsToFetch.length; i += BATCH_SIZE) {
      const batch = modelsToFetch.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(modelsToFetch.length / BATCH_SIZE);
      console.log(
        `Processing batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + BATCH_SIZE, modelsToFetch.length)} of ${modelsToFetch.length})...`
      );
      
      try {
        const batchResults = await Promise.all(
          batch.map(m => fetchModelData(m.id, m.owned_by))
        );
        newResults.push(...batchResults);
        
        // Save progress after each batch in resume mode
        if (resumeMode) {
          const combined = [...existingResults, ...newResults];
          const stripped = [...combined];
          stripUnusedFields(stripped);
          fs.writeFileSync(outputFile, JSON.stringify(stripped, null, 2));
          console.log(`  ✓ Saved progress: ${stripped.length} models total`);
        }
        
        if (i + BATCH_SIZE < modelsToFetch.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      } catch (error) {
        console.error(`\nBatch ${batchNum} failed:`, error);
        if (resumeMode) {
          console.log(`Progress saved. Resume with: npm run fetch -- --resume`);
          const combined = [...existingResults, ...newResults];
          const stripped = [...combined];
          stripUnusedFields(stripped);
          fs.writeFileSync(outputFile, JSON.stringify(stripped, null, 2));
        }
        throw error;
      }
    }

    const results = [...existingResults, ...newResults];
    stripUnusedFields(results);
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\nWritten ${results.length} models to: ${outputFile}`);
    if (resumeMode && newResults.length > 0) {
      console.log(`  (${newResults.length} new, ${existingResults.length} existing)`);
    }

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
