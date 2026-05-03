import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import metadataJson from "../models/metadata.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DEV_URL = "https://models.dev/api.json";
const DEFAULT_RAW_OUTPUT = path.join(__dirname, "./output/modelsdev-nvidia-raw.json");
const DEFAULT_PARSED_OUTPUT = path.join(__dirname, "./output/modelsdev-nvidia-parsed.json");
const DEFAULT_COMPARE_OUTPUT = path.join(__dirname, "./output/modelsdev-nvidia-compare.json");

const verbose = process.argv.includes("--verbose");
const compare = process.argv.includes("--compare");

function getArgValue(prefixes: string[]): string | undefined {
  const arg = process.argv.find(a => prefixes.some(p => a.startsWith(p)));
  if (!arg) return undefined;
  const idx = arg.indexOf("=");
  return idx >= 0 ? arg.slice(idx + 1) : undefined;
}

const rawOutput = getArgValue(["--raw-output=", "-r="]) || DEFAULT_RAW_OUTPUT;
const parsedOutput = getArgValue(["--parsed-output=", "-o="]) || DEFAULT_PARSED_OUTPUT;
const compareOutput = getArgValue(["--compare-output="]) || DEFAULT_COMPARE_OUTPUT;

type ModelsDevProvider = {
  id: string;
  name?: string;
  api?: string;
  doc?: string;
  npm?: string;
  env?: string[];
  models: Record<string, ModelsDevModel>;
};

type ModelsDevModel = {
  id: string;
  name?: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  modalities?: { input?: string[]; output?: string[] };
  open_weights?: boolean;
  cost?: { input?: number; output?: number };
  limit?: { context?: number; output?: number };
  [key: string]: unknown;
};

type ParsedModelKind = "chat" | "code" | "reasoning" | "vision" | "image-generation" | "embedding" | "guard" | "other";

type ParsedModel = {
  id: string;
  name: string;
  family?: string;
  kind: ParsedModelKind;
  supportsReasoning: boolean;
  supportsToolCalling: boolean;
  supportsStructuredOutput: boolean;
  supportsAttachment: boolean;
  supportsTemperature: boolean;
  supportsVision: boolean;
  inputModalities: string[];
  outputModalities: string[];
  openWeights?: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  costInput?: number;
  costOutput?: number;
  knowledge?: string;
  releaseDate?: string;
  lastUpdated?: string;
  recommendedThinkingFormat?: string;
  extensionCandidate: boolean;
};

type CompareDiff = {
  id: string;
  modelsDev: Partial<ParsedModel>;
  extension: Record<string, unknown>;
};

function fetchJson(url: string): Promise<any> {
  return fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30000),
  }).then(async res => {
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    return res.json();
  });
}

function hasAny(patterns: RegExp[], value: string): boolean {
  return patterns.some(re => re.test(value));
}

function inferKind(model: ModelsDevModel): ParsedModelKind {
  const id = model.id.toLowerCase();
  const input = model.modalities?.input ?? [];
  const output = model.modalities?.output ?? [];

  if (id.includes("embed") || id.includes("rerank") || id.includes("embedding")) return "embedding";
  if (hasAny([/guard/, /safety/, /jailbreak/, /pii/], id)) return "guard";
  if (output.includes("image")) return "image-generation";
  if (hasAny([/coder/, /codestral/, /starcoder/, /devstral/, /deepseek-coder/], id)) return "code";
  if (model.reasoning) return "reasoning";
  if (input.some(x => x === "image" || x === "video")) return "vision";
  return "chat";
}

function isExtensionCandidate(kind: ParsedModelKind): boolean {
  return kind === "chat" || kind === "code" || kind === "reasoning" || kind === "vision";
}

function recommendedThinkingFormat(modelId: string): string | undefined {
  if (/^deepseek-ai\/deepseek-v4/.test(modelId)) return "deepseek-v4";
  if (/^deepseek-ai\/deepseek-(v3|r1)/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2-thinking/.test(modelId)) return "deepseek-nim";
  if (/^moonshotai\/kimi-k2\.5/.test(modelId)) return "deepseek-nim";
  if (/^nvidia\/llama-3\.\d-nemotron-(ultra|super)/.test(modelId)) return "deepseek-nim";
  if (/^stepfun-ai\//.test(modelId)) return "deepseek-nim";
  if (/^minimaxai\/minimax-m2\.5/.test(modelId)) return "minimax-inline";
  if (/^openai\/gpt-oss/.test(modelId)) return "reasoning-effort";
  if (/^z-ai\/glm/.test(modelId)) return "qwen-chat-template";
  if (/^microsoft\/phi-4-mini/.test(modelId)) return "qwen-chat-template";
  if (/^bytedance\/seed-oss/.test(modelId)) return "qwen-chat-template";
  if (/^nvidia\/(nvidia-)?nemotron-nano-9b/.test(modelId)) return "qwen-chat-template";
  if (/^nvidia\/llama-3\.\d-nemotron-(ultra|super)/.test(modelId)) return "deepseek-nim";
  if (/^qwen\/qwen3/.test(modelId)) return "qwen-chat-template";
  return undefined;
}

function parseProvider(provider: ModelsDevProvider): ParsedModel[] {
  return Object.values(provider.models)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((model) => {
      const inputModalities = model.modalities?.input ?? ["text"];
      const outputModalities = model.modalities?.output ?? ["text"];
      const supportsVision = inputModalities.some(m => m === "image" || m === "video");
      const kind = inferKind(model);

      return {
        id: model.id,
        name: model.name ?? model.id,
        family: model.family,
        kind,
        supportsReasoning: !!model.reasoning,
        supportsToolCalling: !!model.tool_call,
        supportsStructuredOutput: !!model.structured_output,
        supportsAttachment: !!model.attachment,
        supportsTemperature: !!model.temperature,
        supportsVision,
        inputModalities,
        outputModalities,
        openWeights: model.open_weights,
        contextWindow: model.limit?.context,
        maxOutputTokens: model.limit?.output,
        costInput: model.cost?.input,
        costOutput: model.cost?.output,
        knowledge: model.knowledge,
        releaseDate: model.release_date,
        lastUpdated: model.last_updated,
        recommendedThinkingFormat: recommendedThinkingFormat(model.id),
        extensionCandidate: isExtensionCandidate(kind),
      } satisfies ParsedModel;
    });
}

function summarize(models: ParsedModel[]) {
  const counts = {
    total: models.length,
    extensionCandidate: models.filter(m => m.extensionCandidate).length,
    reasoning: models.filter(m => m.supportsReasoning).length,
    toolCalling: models.filter(m => m.supportsToolCalling).length,
    structuredOutput: models.filter(m => m.supportsStructuredOutput).length,
    vision: models.filter(m => m.supportsVision).length,
    imageGeneration: models.filter(m => m.kind === "image-generation").length,
    code: models.filter(m => m.kind === "code").length,
    chat: models.filter(m => m.kind === "chat").length,
  };

  const thinkingFormats = models.reduce((acc, m) => {
    if (!m.recommendedThinkingFormat) return acc;
    acc[m.recommendedThinkingFormat] = (acc[m.recommendedThinkingFormat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return { counts, thinkingFormats };
}

function compareWithExtension(models: ParsedModel[]) {
  const extensionEntries = metadataJson as any[];
  const extensionMap = new Map<string, any>(extensionEntries.map(e => [e.id, e]));
  const missingInExtension: string[] = [];
  const extraInExtension: string[] = [];
  const diffs: CompareDiff[] = [];

  for (const model of models) {
    const ext = extensionMap.get(model.id);
    if (!ext) {
      missingInExtension.push(model.id);
      continue;
    }

    const changes: Record<string, unknown> = {};
    const compareFields: Array<[keyof ParsedModel, string]> = [
      ["contextWindow", "contextWindow"],
      ["maxOutputTokens", "maxOutputTokens"],
      ["supportsReasoning", "supportsReasoning"],
      ["supportsToolCalling", "supportsToolCalling"],
      ["supportsStructuredOutput", "supportsStructuredOutput"],
      ["supportsVision", "supportsVision"],
    ];

    for (const [parsedKey, extKey] of compareFields) {
      const parsedValue = model[parsedKey];
      const extValue = ext[extKey];
      if (parsedValue !== undefined && parsedValue !== extValue) {
        changes[extKey] = { modelsDev: parsedValue, extension: extValue };
      }
    }

    const extThinking = ext.thinkingFormat ?? "none";
    if ((model.recommendedThinkingFormat ?? "none") !== extThinking) {
      changes.thinkingFormat = {
        modelsDev: model.recommendedThinkingFormat ?? "none",
        extension: extThinking,
      };
    }

    if (Object.keys(changes).length > 0) {
      diffs.push({ id: model.id, modelsDev: model, extension: changes });
    }
  }

  for (const entry of extensionEntries) {
    if (!models.some(m => m.id === entry.id)) {
      extraInExtension.push(entry.id);
    }
  }

  return {
    counts: {
      modelsDev: models.length,
      extension: extensionEntries.length,
      overlap: models.length - missingInExtension.length,
      missingInExtension: missingInExtension.length,
      extraInExtension: extraInExtension.length,
      differingModels: diffs.length,
    },
    missingInExtension,
    extraInExtension,
    diffs,
  };
}

async function main() {
  const api = await fetchJson(MODELS_DEV_URL) as Record<string, ModelsDevProvider>;
  const provider = api.nvidia;
  if (!provider) {
    throw new Error("Could not find provider 'nvidia' in models.dev api.json");
  }

  const parsed = parseProvider(provider);
  const summary = summarize(parsed);

  fs.mkdirSync(path.dirname(rawOutput), { recursive: true });
  fs.mkdirSync(path.dirname(parsedOutput), { recursive: true });
  fs.writeFileSync(rawOutput, JSON.stringify(provider, null, 2) + "\n");
  fs.writeFileSync(parsedOutput, JSON.stringify({ provider: { id: provider.id, name: provider.name, modelCount: parsed.length }, models: parsed }, null, 2) + "\n");

  console.log(`models.dev provider: ${provider.id} (${provider.name ?? "?"})`);
  console.log(`models: ${parsed.length}`);
  console.log(`wrote raw: ${rawOutput}`);
  console.log(`wrote parsed: ${parsedOutput}`);
  console.log(`candidate models: ${summary.counts.extensionCandidate}`);
  console.log(`reasoning: ${summary.counts.reasoning}, tool calling: ${summary.counts.toolCalling}, structured output: ${summary.counts.structuredOutput}, vision: ${summary.counts.vision}`);

  if (verbose) {
    console.log("thinking formats:");
    for (const [fmt, count] of Object.entries(summary.thinkingFormats).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${fmt}: ${count}`);
    }
  }

  if (compare) {
    const report = compareWithExtension(parsed);
    fs.mkdirSync(path.dirname(compareOutput), { recursive: true });
    fs.writeFileSync(compareOutput, JSON.stringify(report, null, 2) + "\n");

    console.log(`wrote compare: ${compareOutput}`);
    console.log(`overlap with extension metadata: ${report.counts.overlap}`);
    console.log(`missing in extension: ${report.counts.missingInExtension}`);
    console.log(`extra in extension: ${report.counts.extraInExtension}`);
    console.log(`models with field differences: ${report.counts.differingModels}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
