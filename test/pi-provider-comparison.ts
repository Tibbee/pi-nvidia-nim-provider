import assert from "node:assert/strict";
import {
  compareOfficialWithExtension,
  comparisonToMarkdown,
  type ComparableModel,
} from "../tools/compare_pi_nvidia";

const officialModels: ComparableModel[] = [
  {
    id: "vendor/shared-model",
    api: "openai-completions",
    provider: "nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    headers: { "NVCF-POLL-SECONDS": "3600" },
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.5, output: 2, cacheRead: 0.1, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
      supportsStrictMode: false,
      supportsLongCacheRetention: false,
    },
  },
  {
    id: "vendor/official-only",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  },
];

const extensionModels: ComparableModel[] = [
  {
    id: "vendor/shared-model",
    api: "openai-completions",
    provider: "nvidia-nim",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    headers: { "NVCF-POLL-SECONDS": "3600" },
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 16384,
    reasoningBudget: 32768,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
      supportsStrictMode: false,
      supportsLongCacheRetention: false,
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  {
    id: "vendor/extension-only",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
  },
];

const report = compareOfficialWithExtension(officialModels, extensionModels, {
  officialProviderId: "nvidia",
  extensionProviderId: "nvidia-nim",
  officialProviderSource: "test-provider",
});

assert.deepEqual(report.counts, {
  official: 2,
  extension: 2,
  shared: 1,
  officialOnly: 1,
  extensionOnly: 1,
  differingShared: 1,
});
assert.deepEqual(report.sharedModelIds, ["vendor/shared-model"]);
assert.deepEqual(report.officialOnlyModels, ["vendor/official-only"]);
assert.deepEqual(report.extensionOnlyModels, ["vendor/extension-only"]);

const shared = report.sharedModels[0];
assert.ok(shared);
assert.deepEqual(shared.parameterDifferences.input, {
  official: ["text", "image"],
  extension: ["text"],
});
assert.deepEqual(shared.parameterDifferences.cost, {
  official: { input: 0.5, output: 2, cacheRead: 0.1, cacheWrite: 0 },
  extension: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});
assert.deepEqual(shared.compatDifferences.changed.supportsReasoningEffort, {
  official: false,
  extension: true,
});
assert.deepEqual(shared.compatDifferences.extensionOnly, {
  requiresReasoningContentOnAssistantMessages: true,
});
assert.equal(Object.keys(shared.compatDifferences.officialOnly).length, 0);

const keyOrderReport = compareOfficialWithExtension(
  [
    {
      id: "vendor/key-order",
      exampleRequestExtra: { zebra: true, alpha: 1 },
    },
  ],
  [
    {
      id: "vendor/key-order",
      exampleRequestExtra: { alpha: 1, zebra: true },
    },
  ],
);
assert.equal(Object.keys(keyOrderReport.sharedModels[0]!.parameterDifferences).length, 0);

assert.match(comparisonToMarkdown(report), /vendor\/shared-model/);
assert.match(comparisonToMarkdown(report), /Official-only models/);

console.log("pi provider comparison checks passed");
