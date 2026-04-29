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
const OUTPUT_FILE = path.join(__dirname, "../models/metadata.json");

const BATCH_SIZE = 5;
const DELAY_MS = 300;

const verbose = process.argv.includes("--verbose");
const fetchCards = process.argv.includes("--cards");
const singleModel = process.argv.find(arg => 
  arg.startsWith("--model=") || arg.startsWith("-m=") || arg.startsWith("--model-name=")
)?.replace(/^--?model[=-]?/, "");
const outputFile = process.argv.find(arg => 
  arg.startsWith("--output=") || arg.startsWith("-o=")
)?.replace(/^--?output[=-]?/, "") || OUTPUT_FILE;

// Add a test mode - can run on a single model for debugging
// Usage: --model=stepfun-ai/step-3.5-flash or -m=stepfun-ai/step-3.5-flash

// ── Metadata types ─────────────────────────────────────────────────────────

interface ModelMetadata {
  id: string;
  owned_by: string;

  // Extracted from model card AND static inference endpoints
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  thinkingFormat?: string;
  labels?: string[];
  description?: string;
  shortDescription?: string;

  // Meta
  discovered_at: string;
  card_fetched?: boolean;
}

function getYardstickFallback(modelId: string): { contextWindow?: number, maxOutputTokens?: number } {
  const families: { re: RegExp, ctx?: number, out?: number }[] = [
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
    { re: /minimax/i, ctx: 131072, out: 16384 },
    { re: /gpt-oss/i, ctx: 131072, out: 4096 },
    { re: /zamba/i, ctx: 4096, out: 4096 },
  ];

  for (const f of families) {
    if (f.re.test(modelId)) return { contextWindow: f.ctx, maxOutputTokens: f.out };
  }
  return {};
}

const FALLBACK_LIMITS_MAP: Record<string, { contextWindow?: number, maxOutputTokens?: number }> = {
  "google/gemma-2-2b-it": { contextWindow: 8192, maxOutputTokens: 4096 },
  "google/gemma-2b": { contextWindow: 8192, maxOutputTokens: 8192 },
  "deepseek-ai/deepseek-coder-6.7b-instruct": { contextWindow: 16384, maxOutputTokens: 4096 },
};

// ── Step 1: Fetch model IDs from /v1/models ────────────────────────────────

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
  return data.data.map((m: any) => ({
    id: m.id,
    owned_by: m.owned_by,
  }));
}

// ── Step 2: Extract data from Documentation Reference ───────────────────────

function parseContextWindow(text: string): number | undefined {
  const patterns: { re: RegExp; transform: (m: RegExpMatchArray) => number }[] = [
    {
      // Match "max_tokens: 1 to 262144" first - this gives us the max output limit
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
      // New: Match "Input Context Length (ISL): 256K" from model card
      re: /Input Context Length(?:\s*\(ISL\))?:\s*(\d+)\s*K/i,
      transform: (m) => parseInt(m[1], 10) * 1024,
    },
    {
      // New: Match "Maximum context length up to 256k tokens"
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
    const globalRe = new RegExp(re.source, 'gi');
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
      // Match: "max_tokens: 1 to 262144" or "max_tokens 1 to 262144" - the HTML parameter table
      re: /max_tokens\s*:\s*\d+\s+to\s+(\d+)/i,
      transform: (m) => parseInt(m[1], 10),
    },
    {
      // Match: "1 to 32768" (appears in infer page parameter descriptions)
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
    const globalRe = new RegExp(re.source, 'gi');
    let match;
    while ((match = globalRe.exec(text)) !== null) {
        const val = transform(match);
        // Accept only reasonable values (>= 256 tokens). 1-255 is almost always wrong.
        if (!isNaN(val) && val >= MIN_REASONABLE_MAX_OUTPUT && val > maxOut) {
            maxOut = val;
        }
    }
  }
  return maxOut > 0 ? maxOut : undefined;
}

function detectVisionSupport(text: string, modelId: string): boolean {
  // Check 1: Model ID contains "image", "vision", or "omni"
  if (/ image /i.test(modelId) || /vision/i.test(modelId) || /omni/i.test(modelId)) return true;

  // Check 2: Look for explicit JSON-like type declaration in API spec
  // (e.g. "type": "image" in OpenAPI schema). Avoids matching CSS like
  // Input[type=search] or sidebar nav cross-references to other models.
  if (/"type"s*:s*"image"/i.test(text)) return true;

  // The structured Input Types section from the non-infer page (parsed separately)
  // is more reliable and takes priority over this fallback heuristic.

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

function detectThinkingFormat(modelId: string, text: string): string | undefined {
  if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
  if (/^deepseek-ai\/deepseek-(v3|r1)/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2-thinking/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.5/.test(modelId)) return "deepseek-nim";
  if (/^nvidia\/llama-3\.\d-nemotron-(ultra|super)/.test(modelId)) return "deepseek-nim";
  if (/^stepfun-ai\//.test(modelId)) return "stepfun-parallel";
  if (/^minimaxai\/minimax-m2/.test(modelId)) return "minimax-inline";
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

// ── Parsers for structured Input/Output sections (non-infer pages) ───────────

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
 * Parse the structured Input section from a non-infer docs page.
 * Matches multiple formats:
 *   <strong>Input Type(s):</strong> Text, Image, Video<br/>
 *   Input Types: Text, Image
 *   Input Type(s): Text, Text+Image
 *   Input Types: Text, Text+Image, Video
 * Returns whether Image or Video is listed.
 */
function parseStructuredVisionSupport(html: string): boolean | undefined {
  // Try HTML-tagged format
  const m1 = html.match(/<strong>Input Type(?:s|\(s\))?:\s*<\/strong>\s*([^<]+)/i);
  if (m1 && /Image|Video/i.test(m1[1])) return true;

  // Try plain text format: "Input Types: Text, Image" or "Input Type(s): Text, Text+Image"
  const m2 = html.match(/Input Type\(?s\)?:\s*([^\n<]+)/i);
  if (m2 && /Image|Video/i.test(m2[1])) return true;

  return undefined;
}

/**
 * Parse the Input Context Length from the structured Input section.
 * Handles multiple formats:
 *   <strong>Input Context Length (ISL):</strong> 256K
 *   Input Context Length (ISL): 262,144 (256k)
 *   Maximum context length up to 256k tokens
 */
function parseStructuredContextWindow(html: string): number | undefined {
  // Primary: <strong> label with K suffix
  const m1 = html.match(/<strong>Input Context Length(?:\s*\(ISL\))?:<\/strong>\s*(\d+)\s*K/i);
  if (m1) return parseKtoNumber(m1[1] + "K");

  // Format: "Input Context Length (ISL): 262,144 (256k)"
  const m2 = html.match(/Input Context Length(?:\s*\(ISL\))?:\s*(\d[\d,]*)\s*\(([^)]+)\)/i);
  if (m2) {
    // Try to extract number from the parenthetical like "(256k)"
    const parenthetical = m2[2];
    const kMatch = parenthetical.match(/(\d+(?:\.\d+)?)\s*k/i);
    if (kMatch) return parseKtoNumber(kMatch[1] + "K");
    // Fallback: use the main number without comma
    const mainNum = parseInt(m2[1].replace(/,/g, ""), 10);
    if (!isNaN(mainNum)) return mainNum;
  }

  // Format: "Input Context Length (ISL): 262144" (no comma, no parenthetical)
  const m3 = html.match(/Input Context Length(?:\s*\(ISL\))?:\s*(\d{5,})/i);
  if (m3) return parseInt(m3[1], 10);

  // Secondary: "Maximum context length up to Xk tokens"
  const m4 = html.match(/Maximum context length(?: up to)?\s*(\d+(?:\.\d+)?\s*[kK]?)\s*tokens?/i);
  if (m4) return parseKtoNumber(m4[1]);

  return undefined;
}

async function fetchModelData(modelId: string, owned_by: string): Promise<ModelMetadata> {
  const meta: ModelMetadata = {
    id: modelId,
    owned_by,
    discovered_at: new Date().toISOString(),
  };

  if (fetchCards) {
    const baseSlug = modelId.replace(/\//g, "-").toLowerCase();
    
    // NVIDIA Slug Discovery Fallbacks
    const slugVariations = [
      baseSlug,
      baseSlug.replace(/\./g, "-"),
      baseSlug.replace(/\./g, "_"),
      // Special GLM Case: dash before version removed (z-ai-glm-5.1 -> z-ai-glm5.1)
      baseSlug.replace(/-(\d)/g, "$1"),
      // Alternative - replace dots only between org/model parts
      baseSlug.replace(/\./g, (match, offset, string) => offset < string.indexOf('/') ? "-" : "_"),
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

          // Attempt to extract precise limits from SSR-Props JSON payload (OpenAPI spec)
          const ssrStart = html.indexOf('id="ssr-props"');
          if (ssrStart !== -1) {
             const jsonStart = html.indexOf('>', ssrStart) + 1;
             const jsonEnd = html.indexOf('</script>', jsonStart);
             const jsonStr = html.substring(jsonStart, jsonEnd);
             try {
                const ssrProps = JSON.parse(jsonStr);
                
                // Deep search for openapi components
                function findSchemas(obj: any): any {
                  if (!obj || typeof obj !== 'object') return null;
                  if (obj.components && obj.components.schemas) return obj.components.schemas;
                  for (const k in obj) {
                    const found = findSchemas(obj[k]);
                    if (found) return found;
                  }
                  return null;
                }
                
const schemas = findSchemas(ssrProps);
                 if (schemas) {
                   for (const schema of Object.values(schemas) as any[]) {
                     const mtProp = schema?.properties?.max_tokens;
                     if (!mtProp) continue;
                     const limit: number = mtProp.maximum ?? (mtProp.anyOf as any[])?.find((s: any) => s.maximum != null)?.maximum;
                     // Reject suspiciously low values - they're almost always wrong ( schema artifact )
                     // Accept only values >= 256 (most LLMs should generate at least 256 tokens)
                     if (limit != null && isFinite(limit) && limit >= MIN_REASONABLE_MAX_OUTPUT) {
                       meta.maxOutputTokens = limit;
                     }
                   }
                 }
             } catch(e) {}
          }
          break; // Found working page
        }
      } catch (e) {}
    }

    // ── Also try the non-infer page for structured Input/Output sections ──
    // This page (e.g. .../google-gemma-4-31b-it) contains labelled fields like:
    //   <strong>Input Types:</strong> Text, Image, Video<br/>
    //   <strong>Input Context Length (ISL):</strong> 256K
    // These are more reliable than regex heuristics on the -infer page.
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
      } catch (e) {}
    }

    // Parse structured Input/Output sections (non-infer page)
    const structuredVision = parseStructuredVisionSupport(structuredHtml);
    const structuredCtx = parseStructuredContextWindow(structuredHtml);

    // Regex-based parsing from -infer page (existing behavior)
    meta.contextWindow = parseContextWindow(combinedHtmlStr);
    const textOutputTokens = parseMaxOutputTokens(combinedHtmlStr);
    if (!meta.maxOutputTokens) meta.maxOutputTokens = textOutputTokens;

    meta.supportsVision = detectVisionSupport(combinedHtmlStr, modelId);
    meta.supportsReasoning = detectReasoningSupport(combinedHtmlStr);
    meta.thinkingFormat = detectThinkingFormat(modelId, combinedHtmlStr);

    // If a thinking format was identified (via ID or HTML), the model implicitly supports reasoning
    if (meta.thinkingFormat) {
      meta.supportsReasoning = true;
    }

    // Structured data from non-infer page takes priority where available
    if (structuredVision !== undefined) meta.supportsVision = structuredVision;
    if (structuredCtx !== undefined) meta.contextWindow = structuredCtx;

    // Gemma 3 family supports vision (Text+Image input) - set if not detected from HTML
    // Use !meta.supportsVision (covers undefined, false, null) since HTML parser sometimes returns false
    if (!meta.supportsVision && /gemma-3/i.test(modelId)) {
      meta.supportsVision = true;
    }

    // Apply fallbacks - only if no value was set
    const familyFallback = getYardstickFallback(modelId);
    const manualFallback = FALLBACK_LIMITS_MAP[modelId];

    if (meta.contextWindow == null || meta.contextWindow === 0) {
      meta.contextWindow = manualFallback?.contextWindow ?? familyFallback.contextWindow;
    }
    
    if (meta.maxOutputTokens == null) {
       // Only apply fallback if we have no value at all
       const fallbackValue = manualFallback?.maxOutputTokens ?? familyFallback.maxOutputTokens;
       if (fallbackValue != null) meta.maxOutputTokens = fallbackValue;
    }
    // Note: We no longer reject high maxOutputTokens - new regex captures up to 262144 correctly

    if (verbose) {
       console.log(`  ✓ ${modelId}: ctx=${meta.contextWindow ?? "?"} maxOut=${meta.maxOutputTokens ?? "?"} reason=${meta.supportsReasoning} format=${meta.thinkingFormat ?? "none"}`);
    }
  }

  return meta;
}

// ── Main Controller ────────────────────────────────────────────────────────

async function main() {
  try {
    let models: { id: string; owned_by: string }[];
    
    if (singleModel) {
      // Test mode: fetch just ONE model
      console.log(`Testing single model: ${singleModel}`);
      const org = singleModel.split('/')[0];
      models = [{ id: singleModel, owned_by: org }];
      console.log(`Found 1 unique model. Fetching technical metadata...`);
      
      const meta = await fetchModelData(singleModel, org);
      
      // Write single result
      const output = outputFile.includes('.json') 
        ? outputFile 
        : `test-${singleModel.replace(/\//g, '-')}.json`;
      fs.writeFileSync(output, JSON.stringify([meta], null, 2));
      console.log(`\nWritten to: ${output}`);
      console.log(`  contextWindow: ${meta.contextWindow ?? '?'}`);
      console.log(`  maxOutputTokens: ${meta.maxOutputTokens ?? '?'}`);
      console.log(`  supportsReasoning: ${meta.supportsReasoning}`);
      console.log(`  thinkingFormat: ${meta.thinkingFormat ?? 'none'}`);
      return;
    }
    
    // Full fetch mode
    const rawModels = await fetchModelIds(NVIDIA_API_KEY!);
    
    // Deduplicate models by ID
    const modelMap = new Map();
    for (const m of rawModels) {
      modelMap.set(m.id, m);
    }
    models = Array.from(modelMap.values());

    console.log(`Found ${models.length} unique models. Fetching technical metadata...`);

    const results: ModelMetadata[] = [];
    for (let i = 0; i < models.length; i += BATCH_SIZE) {
      const batch = models.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(models.length / BATCH_SIZE)}...`);
      
      const batchResults = await Promise.all(
        batch.map(m => fetchModelData(m.id, m.owned_by))
      );
      results.push(...batchResults);
      
      if (i + BATCH_SIZE < models.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\nWritten ${results.length} models to: ${OUTPUT_FILE}`);

    // Summary
    const summary = {
      total: results.length,
      withCards: results.filter(r => r.card_fetched).length,
      withContext: results.filter(r => r.contextWindow).length,
      withReasoning: results.filter(r => r.supportsReasoning).length,
      withVision: results.filter(r => r.supportsVision).length,
      withThinking: results.filter(r => r.thinkingFormat).length,
    };
    
    console.log("\n=== Summary ===");
    console.log(`Total LLM models:     ${summary.total}`);
    console.log(`Static data fetched:  ${summary.withCards}`);
    console.log(`With context window:  ${summary.withContext}`);
    console.log(`With reasoning:       ${summary.withReasoning}`);
    console.log(`With vision:          ${summary.withVision}`);
    console.log(`With thinking format: ${summary.withThinking}`);
    
    const formats = results.reduce((acc, r) => {
      if (r.thinkingFormat) acc[r.thinkingFormat] = (acc[r.thinkingFormat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log("\nThinking format distribution:");
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
