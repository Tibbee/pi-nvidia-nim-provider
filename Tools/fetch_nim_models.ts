#!/usr/bin/env node
/**
 * NVIDIA NIM Model Fetcher
 *
 * Fetches the list of available models from the NVIDIA NIM API,
 * filters to LLM-relevant models, and outputs a JSON file with
 * model metadata suitable for use in the extension.
 *
 * Usage:
 *   npx tsx tools/fetch_nim_models.ts [--output models/discovered.json] [--verbose]
 *
 * Environment:
 *   NVIDIA_API_KEY - Required. Your NVIDIA NIM API key.
 */

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
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
];

const EXCLUDE_PATTERNS: RegExp[] = [
  /guard/i, /safety/i, /jailbreak/i, /pii/i, /content-safety/i,
  /embed/i, /rerank/i,
  /asr/i, /tts/i, /parakeet/i, /conformer/i, /whisper/i, /canary/i,
  /magpie/i, /riva-translate/i, /voicechat/i, /studiovoice/i,
  /nemoretriever/i, /nemotron-parse/i, /nemotron-ocr/i, /paddleocr/i,
  /page-elements/i, /table-structure/i, /graphic-elements/i,
  /FLUX/i, /stable-diffusion/i, /cosmos-transfer/i, /cosmos-predict/i,
  /TRELLIS/i, /fuyu/i, /kosmos/i, /deplot/i, /paligemma/i, /neva/i,
  /alphafold/i, /esm/i, /protein/i, /rfdiffusion/i, /openfold/i,
  /boltz/i, /diffdock/i, /genmol/i, /molmim/i, /msa-search/i, /evo/i,
  /bevformer/i, /sparsedrive/i, /streampetr/i,
  /cosmos-reason/i, /synthetic-video/i, /LipSync/i, /Background Noise/i,
  /eyecontact/i, /vista-3d/i, /nvclip/i, /video/i,
  /ising/i, /fourcastnet/i, /cuopt/i, /usdcode/i, /usdvalidate/i,
  /nv-embed/i, /embedqa/i, /embedcode/i,
  /starcoder/i, /codegemma/i, /recurrentgemma/i, /codellama/i,
  /dbrx/i, /zamba/i, /reward/i, /arctic-embed/i,
  /granite-34b-code/i, /granite-8b-code/i, /granite-3.0-3b/i,
  /sea-lion/i, /Active Speaker/i,
];

interface DiscoveredModel {
  id: string;
  owned_by: string;
  discovered_at: string;
}

function isLLM(modelId: string): boolean {
  const matchesInclude = LLM_PATTERNS.some((p) => p.test(modelId));
  if (!matchesInclude) return false;
  const matchesExclude = EXCLUDE_PATTERNS.some((p) => p.test(modelId));
  return !matchesExclude;
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const outputIdx = args.indexOf("--output");
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("Error: NVIDIA_API_KEY environment variable is not set.");
    process.exit(1);
  }

  console.log("Fetching models from NVIDIA NIM API...");
  const response = await fetch(`${NIM_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    console.error(`Error: API returned ${response.status} ${response.statusText}`);
    const text = await response.text();
    if (verbose) console.error(text);
    process.exit(1);
  }

  const data = (await response.json()) as { data: Array<{ id: string; owned_by: string }> };
  console.log(`Total models from API: ${data.data.length}`);

  // Filter to LLMs
  const llmModels = data.data.filter((m) => isLLM(m.id));
  console.log(`LLM models after filtering: ${llmModels.length}`);

  // Deduplicate by ID
  const seen = new Set<string>();
  const unique = llmModels.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
  console.log(`Unique LLM models: ${unique.length}`);

  // Sort by ID
  unique.sort((a, b) => a.id.localeCompare(b.id));

  // Build output
  const discovered: DiscoveredModel[] = unique.map((m) => ({
    id: m.id,
    owned_by: m.owned_by,
    discovered_at: new Date().toISOString(),
  }));

  if (verbose) {
    console.log("\nDiscovered LLM models:");
    for (const m of discovered) {
      console.log(`  ${m.id} (${m.owned_by})`);
    }
  }

  // Output as JSON
  const json = JSON.stringify(discovered, null, 2);
  if (outputPath) {
    const fs = await import("node:fs");
    const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
    if (dir) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    await fs.promises.writeFile(outputPath, json, "utf-8");
    console.log(`\nWritten to: ${outputPath}`);
  } else {
    console.log("\n" + json);
  }

  // Summary
  const byOwner: Record<string, number> = {};
  for (const m of discovered) {
    byOwner[m.owned_by] = (byOwner[m.owned_by] || 0) + 1;
  }
  console.log("\nModels by owner:");
  for (const [owner, count] of Object.entries(byOwner).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${owner}: ${count}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
