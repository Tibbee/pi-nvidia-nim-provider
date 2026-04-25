/**
 * NVIDIA NIM Model Metadata Fetcher
 *
 * Fetches comprehensive model metadata from NVIDIA NIM:
 * 1. Model IDs from /v1/models API (fast, reliable)
 * 2. Model cards from build.nvidia.com (context window, reasoning info, thinking hints)
 *
 * Outputs a JSON file with all discovered metadata that can be used to
 * generate or update the static model definition files.
 *
 * Usage:
 *   npx tsx tools/fetch_nim_metadata.ts [--output models/metadata.json] [--verbose]
 *   npx tsx tools/fetch_nim_metadata.ts --models-only  # Just list model IDs from API
 *   npx tsx tools/fetch_nim_metadata.ts --cards        # Also fetch model cards (slow, many requests)
 *
 * Environment:
 *   NVIDIA_API_KEY - Required for /v1/models API
 *   TAVILY_API_KEY - Required for model card extraction (--cards mode)
 */

import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const TAVILY_EXTRACT_SCRIPT =
  "C:/Users/StriderTibe/.pi/agent/skills/tavily-extract/scripts/extract.sh";

// ── Model filtering ────────────────────────────────────────────────────────

const LLM_PATTERNS: RegExp[] = [
  /^deepseek-ai\//,
  /^qwen\//,
  /^z-ai\//,
  /^meta\/llama/,
  /^mistralai\//,
  /^minimaxai\//,
  /^moonshotai\//,
  /^openai\/gpt-oss/,
  /^google\/gemma/,
  /^microsoft\/phi/,
  /^bytedance\//,
  /^stepfun-ai\//,
  /^abacusai\//,
  /^sarvamai\//,
  /^upstage\//,
  /^stockmark\//,
  /^writer\//,
  /^ibm\/granite/,
  /^ai21labs\//,
  /^01-ai\//,
  /^nvidia\/llama-3\.\d-nemotron/,
  /^nvidia\/nvidia-nemotron-nano/,
  /^nvidia\/nemotron-4-340b-instruct/,
  /^nvidia\/nemotron-3-super/,
  /^nvidia\/nemotron-mini/,
  /^nvidia\/llama3-chatqa/,
  /^nvidia\/nemotron-nano-12b/,
  /^nvidia\/llama-3\.1-nemotron-nano-vl/,
  /^nv-mistralai\//,
  /^databricks\//,
  /^zyphra\//,
  /^baichuan-inc\//,
  /^thudm\//,
  /^tiiuae\//,
  /^aisingapore\//,
  /^mediatek\//,
  /^snowflake\//,
];

const EXCLUDE_PATTERNS: RegExp[] = [
  /guard/i, /safety/i, /jailbreak/i, /pii/i, /content-safety/i,
  /embed/i, /rerank/i,
  /asr/i, /tts/i, /parakeet/i, /conformer/i, /whisper/i,
  /canary/i, /magpie/i, /riva-translate/i, /voicechat/i, /studiovoice/i,
  /nemoretriever/i, /nemotron-parse/i, /nemotron-ocr/i, /paddleocr/i,
  /page-elements/i, /table-structure/i, /graphic-elements/i,
  /FLUX/i, /stable-diffusion/i, /cosmos-transfer/i, /cosmos-predict/i,
  /TRELLIS/i, /fuyu/i, /kosmos/i, /deplot/i, /paligemma/i, /neva/i,
  /shieldgemma/i,
  /alphafold/i, /esm/i, /protein/i, /rfdiffusion/i, /openfold/i,
  /boltz/i, /diffdock/i, /genmol/i, /molmim/i, /msa-search/i, /evo/i,
  /bevformer/i, /sparsedrive/i, /streampetr/i,
  /cosmos-reason/i, /synthetic-video/i, /LipSync/i, /eyecontact/i,
  /vista-3d/i, /nvclip/i, /video/i, /ising/i, /fourcastnet/i,
  /cuopt/i, /usdcode/i, /usdvalidate/i,
  /starcoder/i, /codegemma/i, /recurrentgemma/i, /codellama/i,
  /reward/i, /arctic-embed/i,
  /granite-34b-code/i, /granite-8b-code/i, /granite-3\.0-3b/i,
  /sea-lion/i, /Active Speaker/i,
];

function isLLM(modelId: string): boolean {
  if (!LLM_PATTERNS.some((p) => p.test(modelId))) return false;
  if (EXCLUDE_PATTERNS.some((p) => p.test(modelId))) return false;
  return true;
}

// ── Metadata types ─────────────────────────────────────────────────────────

interface ModelMetadata {
  id: string;
  owned_by: string;

  // Extracted from model card (may be undefined if card not fetched)
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

// ── Step 1: Fetch model IDs from /v1/models ────────────────────────────────

async function fetchModelIds(apiKey: string): Promise<{ id: string; owned_by: string }[]> {
  console.log("Fetching model IDs from NVIDIA NIM API...");
  const response = await fetch(`${NIM_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`NIM API returned ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    data: { id: string; object: string; owned_by: string }[];
  };

  // Filter to LLMs and deduplicate
  const seen = new Set<string>();
  const llmModels = data.data
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return isLLM(m.id);
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  console.log(`Total models from API: ${data.data.length}`);
  console.log(`LLM models after filtering: ${llmModels.length}`);

  return llmModels.map((m) => ({ id: m.id, owned_by: m.owned_by }));
}

// ── Step 2: Extract metadata from model cards ─────────────────────────────

function parseContextWindow(text: string): number | undefined {
  // Patterns found in model cards:
  // "Maximum context length of 1 million tokens"
  // "Context Length: 262,144 tokens"
  // "Input Context Length (ISL): 256K"
  // "Input context length: 131,072 tokens"
  // "Context Length: 128k"

  const patterns: { re: RegExp; transform: (m: RegExpMatchArray) => number }[] = [
    {
      re: /(?:context\s+length|context\s+window)\s*[:=]?\s*(\d[\d,]*)\s*tokens?/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
    {
      re: /(?:context\s+length|context\s+window)\s*[:=]?\s*(\d+)\s*[Kk]/i,
      transform: (m) => parseInt(m[1]) * 1024,
    },
    {
      re: /(\d[\d,]*)\s*tokens?\s*(?:native\s+)?context/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
    {
      re: /maximum\s+context\s+length\s+of\s+(\d+)\s+million\s+tokens/i,
      transform: (m) => parseInt(m[1]) * 1_000_000,
    },
    {
      re: /1[,.]?0?[Mm]\s*(?:token|context)/i,
      transform: () => 1_048_576,
    },
    {
      re: /(?:ISL|input\s+context\s+length)\s*[:=]?\s*(\d+)\s*[Kk]/i,
      transform: (m) => parseInt(m[1]) * 1024,
    },
    {
      re: /(?:ISL|input\s+context\s+length)\s*[:=]?\s*(\d[\d,]*)/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
  ];

  for (const { re, transform } of patterns) {
    const match = text.match(re);
    if (match) return transform(match);
  }
  return undefined;
}

function parseMaxOutputTokens(text: string): number | undefined {
  const patterns: { re: RegExp; transform: (m: RegExpMatchArray) => number }[] = [
    {
      re: /max.*?output.*?(\d[\d,]*)\s*tokens?/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
    {
      re: /practical\s+limit[^]*?(\d[\d,]*)\s*tokens?/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
    {
      re: /output\s+context\s+length\s*[:=]?\s*(\d[\d,]*)\s*tokens?/i,
      transform: (m) => parseInt(m[1].replace(/,/g, ""), 10),
    },
  ];

  for (const { re, transform } of patterns) {
    const match = text.match(re);
    if (match) return transform(match);
  }
  return undefined;
}

function detectVisionSupport(text: string, modelId: string): boolean {
  if (/\bimage\b/i.test(modelId) || /vision/i.test(modelId)) return true;
  if (/input\s+type.*?image/i.test(text)) return true;
  if (/\bmultimodal\b/i.test(text) && !/not\s+multimodal/i.test(text)) return true;
  return false;
}

function detectReasoningSupport(text: string, labels: string[]): boolean {
  if (labels.some((l) => /reasoning/i.test(l))) return true;
  if (/reasoning\s+model/i.test(text)) return true;
  if (/thinking\s+mode/i.test(text)) return true;
  if (/reasoning_content/i.test(text)) return true;
  if (/\bthink(?:ing)?\s*(?:mode|trace|step)/i.test(text)) return true;
  return false;
}

function detectThinkingFormat(modelId: string, text: string): string | undefined {
  // Based on known model families + code snippet hints
  if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
  if (/^deepseek-ai\/deepseek-(v3|r1)/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2-thinking/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.5/.test(modelId)) return "deepseek-nim";
  if (/^nvidia\/llama-3\.\d-nemotron-(ultra|super)/.test(modelId)) return "deepseek-nim";
  if (/^stepfun-ai\//.test(modelId)) return "stepfun-parallel";
  if (/^minimaxai\/minimax-m2/.test(modelId)) return "minimax-inline";
  // Code snippet hints
  if (/chat_template_kwargs.*enable_thinking/.test(text)) return "qwen-chat-template";
  if (/chat_template_kwargs.*thinking.*true/.test(text)) return "deepseek-nim";
  if (/reasoning_content/.test(text) && !/thinkingFormat/.test(text)) return "deepseek-nim";
  return undefined;
}

function extractLabels(text: string): string[] {
  // Labels appear in model card as tag links
  const labelPattern = /\[([^\]]+)\]\(https:\/\/build\.nvidia\.com\/models\?[^)]*label=([^\)]+)\)/g;
  const labels: string[] = [];
  let match;
  while ((match = labelPattern.exec(text)) !== null) {
    labels.push(match[2].replace(/\+/g, " ").replace(/%20/g, " "));
  }
  return [...new Set(labels)];
}

async function fetchModelCards(
  models: { id: string; owned_by: string }[],
  verbose: boolean
): Promise<Map<string, ModelMetadata>> {
  console.log(`\nFetching model cards for ${models.length} models...`);
  console.log("(Using tavily-extract in batches of 20 URLs)");

  const metadata = new Map<string, ModelMetadata>();

  // Batch into groups of 20 (tavily limit)
  const batchSize = 20;
  for (let i = 0; i < models.length; i += batchSize) {
    const batch = models.slice(i, i + batchSize);
    const urls = batch.map((m) => `https://build.nvidia.com/${m.id}/modelcard`);

    console.log(
      `  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(models.length / batchSize)}: ` +
        `fetching ${urls.length} model cards...`
    );

    const payload = JSON.stringify({
      urls,
      query: "context window max tokens parameters reasoning thinking input output",
      chunks_per_source: 3,
      extract_depth: "advanced",
      timeout: 30,
    });

    try {
      const result = execSync(`bash '${TAVILY_EXTRACT_SCRIPT}' '${payload.replace(/'/g, "'\\''")}'`, {
        encoding: "utf-8",
        timeout: 60000,
        maxBuffer: 50 * 1024 * 1024,
      });

      // Parse the response to extract per-URL content
      const urlSections = result.split(/---\s*URL:\s*/);
      for (const section of urlSections) {
        if (!section.startsWith("http")) continue;

        const urlMatch = section.match(/^(https:\/\/[^\s]+)/);
        if (!urlMatch) continue;

        const cardUrl = urlMatch[1];
        const modelId = cardUrl
          .replace("https://build.nvidia.com/", "")
          .replace("/modelcard", "");

        const model = batch.find((m) => m.id === modelId);
        if (!model) continue;

        const text = section;
        const labels = extractLabels(text);

        const entry: ModelMetadata = {
          id: modelId,
          owned_by: model.owned_by,
          contextWindow: parseContextWindow(text),
          maxOutputTokens: parseMaxOutputTokens(text),
          supportsVision: detectVisionSupport(text, modelId),
          supportsReasoning: detectReasoningSupport(text, labels),
          thinkingFormat: detectThinkingFormat(modelId, text),
          labels: labels.length > 0 ? labels : undefined,
          discovered_at: new Date().toISOString(),
          card_fetched: true,
        };

        // Extract short description
        const descMatch = text.match(/(?:short\s+description|shortDescription)[:\s]+([^\n]{10,200})/i);
        if (descMatch) entry.shortDescription = descMatch[1].trim();

        metadata.set(modelId, entry);

        if (verbose) {
          console.log(
            `  ✓ ${modelId}: ctx=${entry.contextWindow ?? "?"} ` +
              `maxOut=${entry.maxOutputTokens ?? "?"} ` +
              `vision=${entry.supportsVision} ` +
              `reasoning=${entry.supportsReasoning} ` +
              `thinking=${entry.thinkingFormat ?? "none"}`
          );
        }
      }
    } catch (err) {
      console.error(`  ✗ Batch failed: ${err}`);
      // Add entries without card data
      for (const model of batch) {
        if (!metadata.has(model.id)) {
          metadata.set(model.id, {
            id: model.id,
            owned_by: model.owned_by,
            discovered_at: new Date().toISOString(),
            card_fetched: false,
          });
        }
      }
    }

    // Small delay between batches to be nice to the API
    if (i + batchSize < models.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return metadata;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const modelsOnly = args.includes("--models-only");
  const fetchCards = args.includes("--cards") && !modelsOnly;
  const outputIdx = args.indexOf("--output");
  const outputPath =
    outputIdx >= 0 ? args[outputIdx + 1] : "models/metadata.json";

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("Error: NVIDIA_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // Step 1: Fetch model IDs
  const modelIds = await fetchModelIds(apiKey);

  if (modelsOnly) {
    console.log("\nModel IDs (models-only mode):");
    for (const m of modelIds) {
      console.log(`  ${m.id} (${m.owned_by})`);
    }
    return;
  }

  // Step 2: Fetch model cards (if --cards)
  const allMetadata = new Map<string, ModelMetadata>();

  // Initialize with basic data from API
  for (const m of modelIds) {
    allMetadata.set(m.id, {
      id: m.id,
      owned_by: m.owned_by,
      discovered_at: new Date().toISOString(),
      card_fetched: false,
    });
  }

  if (fetchCards) {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!tavilyKey) {
      console.error(
        "Error: TAVILY_API_KEY environment variable is not set (needed for --cards mode)."
      );
      console.error("Set it with: export TAVILY_API_KEY=tvly-your-key");
      process.exit(1);
    }

    const cardMetadata = await fetchModelCards(modelIds, verbose);
    // Merge card data into allMetadata
    for (const [id, data] of cardMetadata) {
      allMetadata.set(id, data);
    }
  }

  // Step 3: Output
  const results = Array.from(allMetadata.values()).sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  const json = JSON.stringify(results, null, 2);
  const absPath = resolve(outputPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, json, "utf-8");
  console.log(`\nWritten ${results.length} models to: ${absPath}`);

  // Summary
  const withContext = results.filter((m) => m.contextWindow != null).length;
  const withReasoning = results.filter((m) => m.supportsReasoning).length;
  const withVision = results.filter((m) => m.supportsVision).length;
  const withThinking = results.filter((m) => m.thinkingFormat != null).length;
  const cardsFetched = results.filter((m) => m.card_fetched).length;

  console.log("\n=== Summary ===");
  console.log(`Total LLM models:     ${results.length}`);
  console.log(`Cards fetched:        ${cardsFetched}`);
  console.log(`With context window:  ${withContext}`);
  console.log(`With reasoning:       ${withReasoning}`);
  console.log(`With vision:          ${withVision}`);
  console.log(`With thinking format: ${withThinking}`);

  // Group by thinking format
  const byThinking: Record<string, string[]> = {};
  for (const m of results) {
    const fmt = m.thinkingFormat ?? "unknown";
    if (!byThinking[fmt]) byThinking[fmt] = [];
    byThinking[fmt].push(m.id);
  }
  console.log("\nThinking format distribution:");
  for (const [fmt, ids] of Object.entries(byThinking).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${fmt}: ${ids.length} models`);
    if (verbose) ids.forEach((id) => console.log(`    - ${id}`));
  }

  // Models missing context window
  const missingContext = results.filter((m) => m.contextWindow == null);
  if (missingContext.length > 0) {
    console.log(`\nMissing context window (${missingContext.length} models):`);
    missingContext.forEach((m) => console.log(`  - ${m.id}`));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
