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

// Scraper data shape.
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

  contextWindow?: number;
  maxOutputTokens?: number;

  inputModalities: string[];       // e.g. ["text"] | ["text","image"] | ["text","image","video"]
  supportsVision?: boolean;        // Derived from inputModalities, kept for backward compat

  supportsReasoning?: boolean;
  thinkingFormat?: string;
  reasoningEffortValues?: string[];
  reasoningEffortDefault?: string;

  supportsToolCalling?: boolean;
  supportsParallelToolCalls?: boolean;
  toolCallFormat?: ToolCallFormat;

  supportsStructuredOutput?: boolean;

  supportsFIM?: boolean;
  fimTokens?: FimTokens;

  supportsSystemPrompt: boolean;

  recommendedTemperature?: number;
  recommendedTopP?: number;
  recommendedTopK?: number;

  reasoningBudget?: number;

  totalParams?: number;   // billions
  activeParams?: number;  // billions (MoE active params)
  isMoE?: boolean;

  modelCategory: ModelCategory;
  speedTier?: SpeedTier;

  labels?: string[];
  description?: string;
  shortDescription?: string;

  discovered_at: string;
  card_fetched?: boolean;
  build_fetched?: boolean;
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
  if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
  if (/^deepseek-ai\/deepseek-(v3|r1)/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2-thinking/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.5/.test(modelId)) return "deepseek-nim";
  if (/^nvidia\/llama-3\.\d-nemotron-(ultra|super)/.test(modelId)) return "deepseek-nim";
  if (/^stepfun-ai\//.test(modelId)) return "stepfun-parallel";
  // m2.7 has no thinking; only m2.5 does.
  if (/^minimaxai\/minimax-m2\.5/.test(modelId)) return "minimax-inline";
  if (/^openai\/gpt-oss/.test(modelId)) return "reasoning-effort";
  if (/^z-ai\/glm/.test(modelId)) return "qwen-chat-template";
  if (/^microsoft\/phi-4-mini/.test(modelId)) return "qwen-chat-template";
  if (/^bytedance\/seed-oss/.test(modelId)) return "qwen-chat-template";
  if (/^nvidia\/nemotron-nano-9b/.test(modelId)) return "qwen-chat-template";
  if (/^nvidia\/nemotron-3-super/.test(modelId)) return "qwen-chat-template";
  if (/^qwen\/qwen3/.test(modelId)) return "qwen-chat-template";

  if (/parallel_reasoning_mode/.test(text)) return "stepfun-parallel";
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

function detectParallelToolCalls(html: string): boolean {
  return /parallel_tool_calls/i.test(html);
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

interface RecommendedParams {
  temperature?: number;
  topP?: number;
  topK?: number;
}

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

function detectSpeedTier(activeParams?: number, totalParams?: number): SpeedTier | undefined {
  const params = activeParams ?? totalParams;
  if (params == null) return undefined;
  if (params < 15) return "fast";
  if (params < 75) return "medium";
  return "slow";
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
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { html: "", found: false };
    const html = await res.text();
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

// Merge build/docs/fallback data for one model.
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

  let combinedHtmlStr = "";
  for (const slug of slugVariations) {
    const url = `${DOCS_BASE_URL}/${slug}-infer`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const html = await response.text();
        combinedHtmlStr += html;
        meta.card_fetched = true;

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

                const mtProp = props.max_tokens;
                if (mtProp) {
                  const limit: number =
                    mtProp.maximum ??
                    (mtProp.anyOf as any[])?.find((s: any) => s.maximum != null)?.maximum;
                  if (limit != null && isFinite(limit) && limit >= MIN_REASONABLE_MAX_OUTPUT) {
                    meta.maxOutputTokens = limit;
                  }
                }

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

  const buildData = await fetchBuildPageData(modelId);
  if (buildData.found) {
    meta.build_fetched = true;
    const nextData = extractNextData(buildData.html);
    const buildHtml = buildData.html;
    if (!meta.supportsToolCalling && detectToolCalling(buildHtml, modelId)) {
      meta.supportsToolCalling = true;
    }
    if (!meta.thinkingFormat) {
      meta.thinkingFormat = detectThinkingFormat(modelId, buildHtml);
    }
    void nextData;
  }

  meta.contextWindow = parseContextWindow(combinedHtmlStr);
  const textOutputTokens = parseMaxOutputTokens(combinedHtmlStr);
  if (!meta.maxOutputTokens) meta.maxOutputTokens = textOutputTokens;

  meta.supportsReasoning = detectReasoningSupport(combinedHtmlStr);
  meta.thinkingFormat = meta.thinkingFormat ?? detectThinkingFormat(modelId, combinedHtmlStr);
  if (meta.thinkingFormat) meta.supportsReasoning = true;
  meta.reasoningBudget = parseReasoningBudget(combinedHtmlStr);
  const reasoningEffort = parseReasoningEffortValues(combinedHtmlStr);
  meta.reasoningEffortValues = reasoningEffort.values;
  meta.reasoningEffortDefault = reasoningEffort.defaultValue;

  meta.supportsToolCalling = meta.supportsToolCalling ?? detectToolCalling(combinedHtmlStr, modelId);
  meta.supportsParallelToolCalls = meta.supportsParallelToolCalls ?? detectParallelToolCalls(combinedHtmlStr);
  if (meta.supportsToolCalling) {
    meta.toolCallFormat = detectToolCallFormat(modelId, combinedHtmlStr);
  }

  meta.supportsStructuredOutput = meta.supportsStructuredOutput ?? detectStructuredOutput(combinedHtmlStr, modelId);

  meta.supportsFIM = detectFIM(combinedHtmlStr, modelId);
  if (meta.supportsFIM) meta.fimTokens = parseFimTokens(modelId);

  const modalities = parseInputModalities(structuredHtml);
  const structuredCtx = parseStructuredContextWindow(structuredHtml);
  const structuredVis = parseStructuredVisionSupport(structuredHtml);
  const arch = parseModelArchitecture(structuredHtml);
  const samplingParams = parseRecommendedParams(structuredHtml);

  if (modalities.length > 0 && !(modalities.length === 1 && modalities[0] === "text" && structuredHtml === "")) {
    meta.inputModalities = modalities;
    meta.supportsVision = modalities.some(m => m === "image" || m === "video");
  } else {
    meta.supportsVision = structuredVis ?? detectVisionSupport(combinedHtmlStr, modelId);
    if (meta.supportsVision) meta.inputModalities = ["text", "image"];
    if (!meta.supportsVision && /gemma-3/i.test(modelId)) {
      meta.supportsVision = true;
      meta.inputModalities = ["text", "image"];
    }
  }

  if (structuredCtx !== undefined) meta.contextWindow = structuredCtx;

  if (arch.totalParams != null) meta.totalParams = arch.totalParams;
  if (arch.activeParams != null) meta.activeParams = arch.activeParams;
  if (arch.isMoE) meta.isMoE = true;

  if (samplingParams.temperature != null) meta.recommendedTemperature = samplingParams.temperature;
  if (samplingParams.topP != null) meta.recommendedTopP = samplingParams.topP;
  if (samplingParams.topK != null) meta.recommendedTopK = samplingParams.topK;

  const familyFallback = getYardstickFallback(modelId);
  const manualFallback = FALLBACK_LIMITS_MAP[modelId];

  if (!meta.contextWindow) {
    meta.contextWindow = manualFallback?.contextWindow ?? familyFallback.contextWindow;
  }
  if (meta.maxOutputTokens == null) {
    const fb = manualFallback?.maxOutputTokens ?? familyFallback.maxOutputTokens;
    if (fb != null) meta.maxOutputTokens = fb;
  }

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

// Batch-fetch all live models.
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
      console.log(`  reasoningBudget:         ${meta.reasoningBudget ?? "?"}`);
      console.log(`  reasoningEffort:         ${meta.reasoningEffortValues?.join(", ") ?? "?"}`);
      return;
    }

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
      withReasoningBudget: results.filter(r => r.reasoningBudget != null).length,
      withReasoningEffortValues: results.filter(r => r.reasoningEffortValues?.length).length,
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
    console.log(`With reasoning budget:    ${summary.withReasoningBudget}`);
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
