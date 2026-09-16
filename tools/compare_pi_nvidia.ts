import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STATIC_MODELS } from "../models/registry";

const DEFAULT_OFFICIAL_PROVIDER = "@earendil-works/pi-ai/providers/nvidia";

type InputModality = "text" | "image";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ComparableModel {
  id: string;
  api?: string;
  provider?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  reasoning?: boolean;
  input?: InputModality[];
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  reasoningBudget?: number;
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
  compat?: Record<string, unknown>;
  exampleRequestExtra?: Record<string, unknown>;
}

const PARAMETER_FIELDS = [
  "headers",
  "reasoning",
  "input",
  "cost",
  "contextWindow",
  "maxTokens",
  "reasoningBudget",
  "thinkingLevelMap",
  "exampleRequestExtra",
] as const;

type ParameterField = (typeof PARAMETER_FIELDS)[number];

interface CompatDifference {
  officialOnly: Record<string, unknown>;
  extensionOnly: Record<string, unknown>;
  changed: Record<string, { official: unknown; extension: unknown }>;
}

interface ModelDifference {
  parameters: Partial<
    Record<ParameterField, { official: unknown; extension: unknown }>
  >;
  compat: CompatDifference;
}

interface SharedModelComparison {
  id: string;
  officialParameters: Partial<Record<ParameterField, unknown>>;
  extensionParameters: Partial<Record<ParameterField, unknown>>;
  parameterDifferences: ModelDifference["parameters"];
  officialCompat: Record<string, unknown>;
  extensionCompat: Record<string, unknown>;
  compatDifferences: CompatDifference;
}

export interface ProviderComparisonReport {
  officialProviderId: string;
  extensionProviderId: string;
  officialProviderSource: string;
  counts: {
    official: number;
    extension: number;
    shared: number;
    officialOnly: number;
    extensionOnly: number;
    differingShared: number;
  };
  sharedModelIds: string[];
  officialOnlyModels: string[];
  extensionOnlyModels: string[];
  sharedModels: SharedModelComparison[];
}

interface NvidiaProviderModule {
  nvidiaProvider?: () => {
    id: string;
    getModels: () => readonly ComparableModel[];
  };
}

function getArgValue(prefixes: string[]): string | undefined {
  const arg = process.argv.find((candidate) =>
    prefixes.some((prefix) => candidate.startsWith(prefix)),
  );
  if (!arg) return undefined;

  const separatorIndex = arg.indexOf("=");
  return separatorIndex >= 0 ? arg.slice(separatorIndex + 1) : undefined;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function indexById(models: readonly ComparableModel[]): Map<string, ComparableModel> {
  const indexed = new Map<string, ComparableModel>();
  for (const model of models) {
    if (indexed.has(model.id)) {
      throw new Error(`Duplicate model ID in comparison input: ${model.id}`);
    }
    indexed.set(model.id, model);
  }
  return indexed;
}

function selectParameters(model: ComparableModel) {
  return Object.fromEntries(
    PARAMETER_FIELDS
      .filter((field) => hasOwn(model, field))
      .map((field) => [field, model[field as keyof ComparableModel]]),
  ) as Partial<Record<ParameterField, unknown>>;
}

function compareParameters(
  official: ComparableModel,
  extension: ComparableModel,
): ModelDifference["parameters"] {
  const differences: ModelDifference["parameters"] = {};

  for (const field of PARAMETER_FIELDS) {
    const officialValue = official[field as keyof ComparableModel];
    const extensionValue = extension[field as keyof ComparableModel];
    if (stableStringify(officialValue) !== stableStringify(extensionValue)) {
      differences[field] = { official: officialValue, extension: extensionValue };
    }
  }

  return differences;
}

function compareCompat(
  official: ComparableModel,
  extension: ComparableModel,
): CompatDifference {
  const officialCompat = official.compat ?? {};
  const extensionCompat = extension.compat ?? {};
  const keys = Array.from(
    new Set([...Object.keys(officialCompat), ...Object.keys(extensionCompat)]),
  ).sort();

  const officialOnly: Record<string, unknown> = {};
  const extensionOnly: Record<string, unknown> = {};
  const changed: Record<string, { official: unknown; extension: unknown }> = {};

  for (const key of keys) {
    const officialHasField = hasOwn(officialCompat, key);
    const extensionHasField = hasOwn(extensionCompat, key);
    if (officialHasField && !extensionHasField) {
      officialOnly[key] = officialCompat[key];
    } else if (!officialHasField && extensionHasField) {
      extensionOnly[key] = extensionCompat[key];
    } else if (
      stableStringify(officialCompat[key]) !== stableStringify(extensionCompat[key])
    ) {
      changed[key] = {
        official: officialCompat[key],
        extension: extensionCompat[key],
      };
    }
  }

  return { officialOnly, extensionOnly, changed };
}

function hasDifferences(model: SharedModelComparison): boolean {
  return (
    Object.keys(model.parameterDifferences).length > 0 ||
    Object.keys(model.compatDifferences.officialOnly).length > 0 ||
    Object.keys(model.compatDifferences.extensionOnly).length > 0 ||
    Object.keys(model.compatDifferences.changed).length > 0
  );
}

export function compareOfficialWithExtension(
  officialModels: readonly ComparableModel[],
  extensionModels: readonly ComparableModel[],
  options: {
    officialProviderId?: string;
    extensionProviderId?: string;
    officialProviderSource?: string;
  } = {},
): ProviderComparisonReport {
  const officialById = indexById(officialModels);
  const extensionById = indexById(extensionModels);
  const officialIds = Array.from(officialById.keys()).sort();
  const extensionIds = Array.from(extensionById.keys()).sort();
  const sharedModelIds = officialIds.filter((id) => extensionById.has(id));
  const officialOnlyModels = officialIds.filter((id) => !extensionById.has(id));
  const extensionOnlyModels = extensionIds.filter((id) => !officialById.has(id));

  const sharedModels = sharedModelIds.map((id) => {
    const official = officialById.get(id)!;
    const extension = extensionById.get(id)!;
    return {
      id,
      officialParameters: selectParameters(official),
      extensionParameters: selectParameters(extension),
      parameterDifferences: compareParameters(official, extension),
      officialCompat: { ...(official.compat ?? {}) },
      extensionCompat: { ...(extension.compat ?? {}) },
      compatDifferences: compareCompat(official, extension),
    };
  });

  const differingShared = sharedModels.filter(hasDifferences).length;

  return {
    officialProviderId: options.officialProviderId ?? "nvidia",
    extensionProviderId: options.extensionProviderId ?? "nvidia-nim",
    officialProviderSource:
      options.officialProviderSource ?? DEFAULT_OFFICIAL_PROVIDER,
    counts: {
      official: officialModels.length,
      extension: extensionModels.length,
      shared: sharedModelIds.length,
      officialOnly: officialOnlyModels.length,
      extensionOnly: extensionOnlyModels.length,
      differingShared,
    },
    sharedModelIds,
    officialOnlyModels,
    extensionOnlyModels,
    sharedModels,
  };
}

function markdownCell(value: unknown): string {
  if (value === undefined) return "-";
  if (typeof value === "string") return `\`${value.replace(/`/g, "\\`")}\``;
  return `\`${JSON.stringify(value).replace(/`/g, "\\`")}\``;
}

function listItems(items: readonly string[]): string[] {
  return items.length > 0 ? items.map((item) => `- \`${item}\``) : ["- None"];
}

export function comparisonToMarkdown(report: ProviderComparisonReport): string {
  const lines = [
    "# Pi NVIDIA provider comparison",
    "",
    `Official provider: \`${report.officialProviderId}\` (${report.officialProviderSource})`,
    `Extension provider: \`${report.extensionProviderId}\``,
    "",
    "## Counts",
    "",
    "| Official | Extension | Shared | Official-only | Extension-only | Shared with differences |",
    "|---:|---:|---:|---:|---:|---:|",
    `| ${report.counts.official} | ${report.counts.extension} | ${report.counts.shared} | ${report.counts.officialOnly} | ${report.counts.extensionOnly} | ${report.counts.differingShared} |`,
    "",
    "## Official-only models",
    "",
    ...listItems(report.officialOnlyModels),
    "",
    "## Extension-only models",
    "",
    ...listItems(report.extensionOnlyModels),
    "",
    "## Shared model parameters",
    "",
    "| Model | Reasoning | Input | Context | Max output | Reasoning budget | Thinking levels |",
    "|---|---|---|---:|---:|---:|---|",
  ];

  for (const model of report.sharedModels) {
    lines.push(
      ["|",
        `\`${model.id}\``,
        markdownCell(model.officialParameters.reasoning),
        markdownCell(model.officialParameters.input),
        markdownCell(model.officialParameters.contextWindow),
        markdownCell(model.officialParameters.maxTokens),
        markdownCell(model.officialParameters.reasoningBudget),
        markdownCell(model.officialParameters.thinkingLevelMap),
        "|",
      ].join(" "),
    );
  }

  lines.push(
    "",
    "## Shared model compatibility",
    "",
    "| Model | Official compat | Extension compat |",
    "|---|---|---|",
  );
  for (const model of report.sharedModels) {
    lines.push(
      ["|",
        `\`${model.id}\``,
        markdownCell(model.officialCompat),
        markdownCell(model.extensionCompat),
        "|",
      ].join(" "),
    );
  }

  lines.push("", "## Parameter differences", "");
  let differenceCount = 0;
  for (const model of report.sharedModels) {
    for (const [field, difference] of Object.entries(model.parameterDifferences)) {
      differenceCount += 1;
      lines.push(
        `### \`${model.id}\` - \`${field}\``,
        "",
        `- Official: ${markdownCell(difference.official)}`,
        `- Extension: ${markdownCell(difference.extension)}`,
        "",
      );
    }
  }
  if (differenceCount === 0) {
    lines.push("- None", "");
  }

  lines.push("## Compatibility differences", "");
  let compatDifferenceCount = 0;
  for (const model of report.sharedModels) {
    const { officialOnly, extensionOnly, changed } = model.compatDifferences;
    for (const [field, value] of Object.entries(officialOnly)) {
      compatDifferenceCount += 1;
      lines.push(
        `- \`${model.id}\` - \`${field}\`: official-only ${markdownCell(value)}`,
      );
    }
    for (const [field, value] of Object.entries(extensionOnly)) {
      compatDifferenceCount += 1;
      lines.push(
        `- \`${model.id}\` - \`${field}\`: extension-only ${markdownCell(value)}`,
      );
    }
    for (const [field, value] of Object.entries(changed)) {
      compatDifferenceCount += 1;
      lines.push(
        `- \`${model.id}\` - \`${field}\`: official ${markdownCell(value.official)}; extension ${markdownCell(value.extension)}`,
      );
    }
  }
  if (compatDifferenceCount === 0) {
    lines.push("- None");
  }

  return `${lines.join("\n")}\n`;
}

function findOfficialProviderSource(): string {
  const configured =
    process.env.PI_AI_NVIDIA_PROVIDER ?? process.env.PI_NVIDIA_PROVIDER;
  if (configured) return configured;

  const moduleRelativePath = "@earendil-works/pi-ai/dist/providers/nvidia.js";
  const roots = [
    process.env.PI_PACKAGE_DIR,
    process.env.PI_CODING_AGENT_DIR,
    process.env.PI_CODING_AGENT_DIR
      ? path.join(path.dirname(process.env.PI_CODING_AGENT_DIR), "node_modules")
      : undefined,
    process.env.PI_CODING_AGENT_DIR
      ? path.join(path.dirname(path.dirname(process.env.PI_CODING_AGENT_DIR)), "node_modules")
      : undefined,
    path.join(process.cwd(), "node_modules"),
  ].filter((root): root is string => Boolean(root));

  for (const root of roots) {
    const candidate = path.join(root, moduleRelativePath);
    if (fs.existsSync(candidate)) return pathToFileURL(candidate).href;
  }

  return DEFAULT_OFFICIAL_PROVIDER;
}

async function loadOfficialProvider(
  providerSource: string,
): Promise<{ providerId: string; models: ComparableModel[] }> {
  let module: NvidiaProviderModule;
  try {
    module = (await import(providerSource)) as NvidiaProviderModule;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not import official NVIDIA provider from "${providerSource}": ${detail}\n` +
        `Install the Pi peer dependencies or pass --provider=<absolute file URL>.`,
      { cause: error },
    );
  }

  if (!module.nvidiaProvider) {
    throw new Error(
      `Official provider module "${providerSource}" does not export nvidiaProvider().`,
    );
  }

  const provider = module.nvidiaProvider();
  return {
    providerId: provider.id,
    models: provider.getModels().map((model) => ({ ...model })),
  };
}

function writeText(outputPath: string, content: string): void {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
}

export async function runComparison(): Promise<ProviderComparisonReport> {
  const providerSource =
    getArgValue(["--provider=", "--pi-provider="]) ??
    findOfficialProviderSource();
  const jsonOutput = getArgValue(["--json-output=", "--output="]);
  const markdownOutput = getArgValue(["--markdown-output=", "--markdown="]);

  const official = await loadOfficialProvider(providerSource);
  const report = compareOfficialWithExtension(official.models, STATIC_MODELS, {
    officialProviderId: official.providerId,
    officialProviderSource: providerSource,
  });

  if (jsonOutput) {
    writeText(jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (markdownOutput) {
    writeText(markdownOutput, comparisonToMarkdown(report));
  }
  if (!jsonOutput && !markdownOutput) {
    process.stdout.write(comparisonToMarkdown(report));
  }

  return report;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  runComparison().catch((error) => {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  });
}
