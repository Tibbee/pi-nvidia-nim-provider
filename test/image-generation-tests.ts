// Mocked tests for native image generation and the advanced image tool.
// No live requests: fetch is injected or stubbed, and no credentials are read.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { logger } from "../lib/logger";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerExtension, {
  PROVIDER_MODEL_CONFIGS,
  handleBeforeProviderRequest,
} from "../index";
import {
  detectImageMime,
  generateNimImages,
  runNimImageGeneration,
  describeErrorBody,
} from "../lib/nim-images";
import {
  NIM_IMAGES_API,
  NIM_IMAGE_MODELS,
  NIM_IMAGE_MODEL_IDS,
  DEFAULT_NIM_IMAGE_MODEL_ID,
  FLUX_2_KLEIN_4B_CAPABILITY,
  getNimImageCapability,
} from "../models/image-models";
import { STATIC_MODELS, STATIC_MODEL_MAP } from "../models/registry";
import {
  NIM_IMAGE_TOOL,
  NIM_IMAGE_TOOL_NAME,
  runNimImageTool,
  type NimImageToolContextLike,
} from "../handlers/image-tool";
import type { ImageModel, ImagesContext, ImagesOptions } from "@earendil-works/pi-ai";

const ENDPOINT = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b";

import { JPEG_BYTES, PNG_BYTES, WEBP_BYTES } from "./fixtures/image-bytes";
const JUNK_BYTES = Buffer.from("definitely-not-an-image");

const fakeImageModel = {
  type: "image",
  id: DEFAULT_NIM_IMAGE_MODEL_ID,
  name: "FLUX.2 Klein 4B",
  api: NIM_IMAGES_API,
  provider: "nvidia-nim",
  baseUrl: ENDPOINT,
  input: ["text"],
  output: ["image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  headers: undefined,
} as unknown as ImageModel<string>;

interface RecordedCall {
  url: string;
  init: RequestInit & { headers?: Record<string, string> };
}

function mockFetch(
  respond: (call: RecordedCall) => Response | Promise<Response>,
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn = (async (url: unknown, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(url),
      init: {
        ...init,
        headers: { ...(init?.headers as Record<string, string>) },
      },
    };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function successBody(bytes: Buffer, seed?: number, finishReason = "SUCCESS"): unknown {
  return {
    artifacts: [
      {
        base64: bytes.toString("base64"),
        finishReason,
        seed: seed ?? 42,
      },
    ],
  };
}

async function generate(
  context: ImagesContext,
  options?: ImagesOptions,
  model: ImageModel<string> = fakeImageModel,
) {
  return runNimImageGeneration(model, context, { apiKey: "test-key", ...options });
}

// ---------------------------------------------------------------------------
// 1) Native image-model registration and catalog visibility
// ---------------------------------------------------------------------------

const providers: Array<{ name: string; config: any }> = [];
const tools: any[] = [];
const events: string[] = [];
await registerExtension({
  registerProvider: (name: string, config: unknown) => providers.push({ name, config }),
  registerTool: (tool: unknown) => tools.push(tool),
  on: (event: string) => {
    events.push(event);
    return () => {};
  },
} as never);

assert.equal(providers.length, 1, "exactly one provider registered");
assert.equal(providers[0]!.name, "nvidia-nim");
const config = providers[0]!.config;
assert.equal(config.api, "openai-completions");

const imageEntries = (config.models as Array<any>).filter((m) => m.type === "image");
assert.equal(imageEntries.length, 1, "one image model registered");
const imageEntry = imageEntries[0]!;
assert.equal(imageEntry.id, DEFAULT_NIM_IMAGE_MODEL_ID);
assert.equal(imageEntry.api, NIM_IMAGES_API, "image model uses the separate image API identifier");
assert.equal(imageEntry.baseUrl, ENDPOINT);
assert.deepEqual(imageEntry.input, ["text"]);
assert.deepEqual(imageEntry.output, ["image"]);

// The mixed-operation catalog keeps every chat model alongside the image model.
assert.equal(config.models.length, STATIC_MODELS.length + NIM_IMAGE_MODELS.length);
for (const chatModel of STATIC_MODELS) {
  const entry = (config.models as Array<any>).find(
    (m) => m.id === chatModel.id && m.type !== "image",
  );
  assert.ok(entry, `chat model preserved: ${chatModel.id}`);
}
assert.equal(
  (config.models as Array<any>).some((m) => m.id === "deepseek-ai/deepseek-v4.1-flash"),
  true,
);
assert.equal(PROVIDER_MODEL_CONFIGS.length, config.models.length);

// The images adapter is keyed by the image API and IS the shared client.
assert.ok(config.images, "images adapter registered");
assert.equal(config.images[NIM_IMAGES_API].generateImages, generateNimImages);

// Catalog visibility through the image-model set.
assert.equal(NIM_IMAGE_MODEL_IDS.has(DEFAULT_NIM_IMAGE_MODEL_ID), true);
assert.ok(getNimImageCapability(DEFAULT_NIM_IMAGE_MODEL_ID));

// Zero cost metadata means UNREPORTED PRICING, not free inference. The
// verified response carried no usage; nothing is fabricated.
for (const entry of NIM_IMAGE_MODELS) {
  assert.deepEqual(entry.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
}

// The advanced tool is registered and stays out of the default loadout.
assert.equal(tools.length, 1, "one tool registered");
assert.equal(tools[0].name, NIM_IMAGE_TOOL_NAME);
assert.equal(tools[0].exposure, "codemode");
assert.ok(events.includes("before_provider_request"));
assert.ok(events.includes("after_provider_response"));

// ---------------------------------------------------------------------------
// 2) Existing chat models and hooks remain functional
// ---------------------------------------------------------------------------

const chatRewrite = handleBeforeProviderRequest(
  {
    payload: {
      model: "deepseek-ai/deepseek-v4.1-flash",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      messages: [{ role: "user", content: "hello" }],
    },
  },
  { model: { provider: "nvidia-nim" } } as never,
) as Record<string, unknown>;
assert.ok(chatRewrite, "chat hook still transforms NIM chat payloads");
assert.deepEqual(chatRewrite.chat_template_kwargs, { thinking: true, reasoning_effort: "high" });
assert.equal(chatRewrite.max_tokens, 262144);

// Image payloads are never chat-transformed.
assert.equal(
  handleBeforeProviderRequest(
    { payload: { model: DEFAULT_NIM_IMAGE_MODEL_ID, prompt: "a red fox" } },
    { model: { provider: "nvidia-nim" } } as never,
  ),
  undefined,
  "image operations bypass chat payload transforms",
);

// ---------------------------------------------------------------------------
// 3) Exact endpoint, authentication, and request translation
// ---------------------------------------------------------------------------

{
  const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES, 42)));
  const run = await generate(
    { input: [{ type: "text", text: "a red fox" }] },
    { fetch, metadata: { seed: 42 } },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, ENDPOINT, "POSTs to the verified genai endpoint");
  assert.equal(calls[0]!.init.method, "POST");
  const headers = calls[0]!.init.headers!;
  assert.equal(headers["Authorization"], "Bearer test-key");
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["Accept"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
    prompt: "a red fox",
    width: 1024,
    height: 1024,
    steps: 4,
    samples: 1,
    cfg_scale: 1,
    seed: 42,
  });
  assert.equal(run.result.stopReason, "stop");
  assert.equal(run.artifacts.length, 1);
  assert.equal(run.artifacts[0]!.seed, 42);
}

// Pi's resolved model endpoint takes precedence over the capability's default.
{
  const endpoint = "https://proxy.example.test/nim/image";
  const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  const run = await generate(
    { input: [{ type: "text", text: "p" }] },
    { fetch },
    { ...fakeImageModel, baseUrl: endpoint },
  );
  assert.equal(calls[0]!.url, endpoint, "model endpoint/proxy overrides are honored");
  assert.equal(run.result.stopReason, "stop");
}

// 4) Omission of the rejected `mode` field (and of a body `model` field).
{
  const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
  assert.equal("mode" in body, false, "mode must never be sent (live endpoint: extra_forbidden)");
  assert.equal("model" in body, false, "the model is identified by the URL, not a body field");
  assert.equal("seed" in body, false, "seed is omitted unless requested");
}

// Header merging: model headers plus overrides, null suppresses.
{
  const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  await runNimImageGeneration(
    { ...fakeImageModel, headers: { "X-Model": "m", "X-Both": "model" } } as ImageModel<string>,
    { input: [{ type: "text", text: "p" }] },
    {
      apiKey: "test-key",
      fetch,
      headers: { "X-Both": "caller", "X-Model": null, "X-Extra": "e" } as never,
    },
  );
  const headers = calls[0]!.init.headers!;
  assert.equal(headers["X-Model"], undefined, "null suppresses provider headers");
  assert.equal(headers["X-Both"], "caller", "caller headers override");
  assert.equal(headers["X-Extra"], "e");
}

// Instrumentation hooks: onPayload can replace the payload; onResponse sees
// status/headers before the body is consumed.
{
  const seen: Array<{ status: number; keys: string[] }> = [];
  const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  const run = await generate(
    { input: [{ type: "text", text: "p" }] },
    {
      fetch,
      onPayload: (payload) => ({ ...(payload as Record<string, unknown>), steps: 2 }),
      onResponse: (response) => {
        seen.push({ status: response.status, keys: Object.keys(response.headers) });
      },
    },
  );
  const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
  assert.equal(body.steps, 2, "onPayload replacement is what is sent");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.status, 200);
  assert.ok(seen[0]!.keys.includes("content-type"));
  assert.equal(run.result.stopReason, "stop");
}

// ---------------------------------------------------------------------------
// 5) Input and capability validation (all local, no request made)
// ---------------------------------------------------------------------------

async function expectFailure(
  context: ImagesContext,
  options: ImagesOptions | undefined,
  pattern: RegExp,
  label: string,
) {
  const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  const run = await generate(context, { fetch, ...options });
  assert.equal(run.result.stopReason, "error", label);
  assert.match(run.result.errorMessage ?? "", pattern, label);
  assert.equal(calls.length, 0, `${label}: must fail locally without a request`);
}

await expectFailure(
  { input: [{ type: "text", text: "p" }, { type: "image", data: "AAA", mimeType: "image/png" }] },
  undefined,
  /image input|text prompts only/i,
  "image input rejected",
);
await expectFailure({ input: [{ type: "text", text: "   " }] }, undefined, /non-empty/, "empty prompt");
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { width: 1000 } },
  /multiple of 16/,
  "unaligned width rejected",
);
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { height: 496 } },
  /between 512 and 1568/,
  "height below grid rejected",
);
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { steps: 5 } },
  /between 1 and 4/,
  "steps 5 rejected",
);
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { steps: 0 } },
  /between 1 and 4/,
  "steps 0 rejected",
);
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { samples: 2 } },
  /between 1 and 1/,
  "samples 2 rejected (documented: 1 only)",
);
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { cfg_scale: 0 } },
  /cfg_scale.*>= 1/,
  "cfg_scale 0 rejected like the live endpoint",
);
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { seed: -1 } },
  /seed/,
  "negative seed rejected",
);
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { mode: "Image Generation" } },
  /mode/,
  "mode rejected locally (live endpoint: extra_forbidden)",
);
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { negative_prompt: "blurry" } },
  /Unsupported parameter/,
  "unverified parameters rejected locally",
);
await expectFailure(
  { input: [{ type: "text", text: "p" }] },
  { metadata: { prompt: "sneaky" } },
  /prompt/,
  "prompt is not a setting",
);

// ---------------------------------------------------------------------------
// 6) JPEG / PNG / WebP MIME detection
// ---------------------------------------------------------------------------

assert.equal(detectImageMime(JPEG_BYTES), "image/jpeg");
assert.equal(detectImageMime(PNG_BYTES), "image/png");
assert.equal(detectImageMime(WEBP_BYTES), "image/webp");
assert.equal(detectImageMime(JUNK_BYTES), undefined);

{
  const { fetch } = mockFetch(() =>
    jsonResponse(200, {
      artifacts: [
        { base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 1 },
        { base64: PNG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 2 },
        { base64: WEBP_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 3 },
      ],
    }),
  );
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.deepEqual(
    run.artifacts.map((a) => a.mimeType),
    ["image/jpeg", "image/png", "image/webp"],
  );
  assert.deepEqual(
    run.result.output.filter((b) => b.type === "image").map((b) => (b as { mimeType: string }).mimeType),
    ["image/jpeg", "image/png", "image/webp"],
  );
}

// ---------------------------------------------------------------------------
// 7) Successful, missing, malformed, and filtered artifacts
// ---------------------------------------------------------------------------

// Successful artifact echoes its seed as a text block (reproducibility).
{
  const { fetch } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES, 42)));
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.equal(run.result.stopReason, "stop");
  const texts = run.result.output.filter((b) => b.type === "text") as Array<{ text: string }>;
  assert.ok(
    texts.some((b) => b.text.includes("seed=42")),
    "artifact seed is reported",
  );
}

// Missing artifacts array.
{
  const { fetch } = mockFetch(() => jsonResponse(200, { status: "ok" }));
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.equal(run.result.stopReason, "error");
  assert.match(run.result.errorMessage ?? "", /no `artifacts`/);
}

// Malformed JSON body with HTTP 200.
{
  const { fetch } = mockFetch(() => jsonResponse(200, "this is not json"));
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.equal(run.result.stopReason, "error");
  assert.match(run.result.errorMessage ?? "", /not valid JSON/);
}

// Artifact without base64 data.
{
  const { fetch } = mockFetch(() => jsonResponse(200, { artifacts: [{ finishReason: "SUCCESS" }] }));
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.equal(run.result.stopReason, "error");
  assert.match(run.result.errorMessage ?? "", /missing base64/);
}

// Unrecognized image format is dropped, and a run without any usable image errors.
{
  const { fetch } = mockFetch(() => jsonResponse(200, successBody(JUNK_BYTES)));
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.equal(run.result.stopReason, "error");
  assert.match(run.result.errorMessage ?? "", /unrecognized image format/);
}

// Filtered artifact only: the provider's finishReason is reported verbatim.
{
  const { fetch } = mockFetch(() =>
    jsonResponse(200, successBody(JPEG_BYTES, 42, "CONTENT_FILTERED")),
  );
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.equal(run.result.stopReason, "error");
  assert.match(run.result.errorMessage ?? "", /CONTENT_FILTERED/);
  assert.equal(run.artifacts.length, 0);
  assert.equal(run.dropped[0]!.finishReason, "CONTENT_FILTERED");
}

// Partial: one success and one filtered artifact.
{
  const { fetch } = mockFetch(() =>
    jsonResponse(200, {
      artifacts: [
        { base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 7 },
        { base64: JPEG_BYTES.toString("base64"), finishReason: "CONTENT_FILTERED", seed: 8 },
      ],
    }),
  );
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.equal(run.result.stopReason, "stop");
  assert.equal(run.artifacts.length, 1);
  assert.equal(run.dropped.length, 1);
  const texts = run.result.output.filter((b) => b.type === "text") as Array<{ text: string }>;
  assert.ok(texts.some((b) => b.text.includes("artifact 2") && b.text.includes("CONTENT_FILTERED")));
}

// `finish_reason` (snake case) is also accepted.
{
  const { fetch } = mockFetch(() =>
    jsonResponse(200, {
      artifacts: [{ base64: PNG_BYTES.toString("base64"), finish_reason: "SUCCESS", seed: 5 }],
    }),
  );
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.equal(run.artifacts.length, 1);
}

// ---------------------------------------------------------------------------
// 8) HTTP 401 / 403 / 422 / 429 / server errors
// ---------------------------------------------------------------------------

async function expectHttpError(
  status: number,
  body: unknown,
  headers: Record<string, string>,
  pattern: RegExp,
  label: string,
) {
  const { fetch } = mockFetch(() => jsonResponse(status, body, headers));
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  assert.equal(run.result.stopReason, "error", label);
  assert.match(run.result.errorMessage ?? "", pattern, label);
}

await expectHttpError(401, { detail: " unauthorized " }, {}, /Authentication failed \(HTTP 401\)/, "401");
await expectHttpError(403, {}, {}, /Authentication failed \(HTTP 403\)/, "403");
// The real 422 body shape from the live endpoint (Pydantic detail list).
await expectHttpError(
  422,
  {
    detail: [
      {
        type: "greater_than_equal",
        loc: ["body", "cfg_scale"],
        msg: "Input should be greater than or equal to 1",
        input: 0,
        ctx: { ge: 1.0 },
      },
      { type: "extra_forbidden", loc: ["body", "mode"], msg: "Extra inputs are not permitted", input: "x" },
    ],
  },
  {},
  /Invalid request \(HTTP 422\).*cfg_scale.*greater than or equal to 1/,
  "422 carries the validation detail",
);
await expectHttpError(429, { detail: "slow down" }, { "retry-after": "12" }, /Rate limited \(HTTP 429\).*retry after 12/, "429 with retry-after");
await expectHttpError(429, {}, {}, /Rate limited \(HTTP 429\)/, "429 without retry-after");
await expectHttpError(
  500,
  { detail: "boom" },
  { "x-request-id": "req-1" },
  /server error \(HTTP 500\), request ID req-1/,
  "500 with request ID",
);
await expectHttpError(503, {}, {}, /server error \(HTTP 503\)/, "503");

assert.equal(describeErrorBody("plain text body"), "plain text body");
assert.equal(describeErrorBody(""), undefined);

// Caller-facing errors retain detail, but diagnostic logs never echo it.
{
  const warnings: Array<{ message: string; data?: Record<string, unknown> }> = [];
  const originalWarn = logger.warn;
  logger.warn = (_namespace, message, data) => { warnings.push({ message, data }); };
  const sensitive = "SECRET_PROMPT Bearer SECRET_KEY BASE64_IMAGE";
  try {
    const { fetch } = mockFetch(() => jsonResponse(422, { detail: sensitive }));
    const run = await generate({ input: [{ type: "text", text: sensitive }] }, { fetch });
    assert.match(run.result.errorMessage ?? "", /SECRET_PROMPT/);
    assert.equal(warnings[0]!.data!.status, 422, "safe HTTP status is retained in logs");
    await generate(
      { input: [{ type: "text", text: sensitive }] },
      { fetch: (async () => { throw new Error(sensitive); }) as typeof globalThis.fetch },
    );
    await generate(
      { input: [{ type: "text", text: "p" }] },
      { metadata: { SECRET_FIELD: sensitive } },
    );
    assert.equal(warnings.length, 3);
    assert.doesNotMatch(JSON.stringify(warnings), /SECRET|BASE64_IMAGE|Bearer/);
    for (const warning of warnings) {
      assert.ok(Object.keys(warning.data!).every((key) => ["model", "stopReason", "status"].includes(key)));
    }
  } finally {
    logger.warn = originalWarn;
  }
}

// ---------------------------------------------------------------------------
// 9) Abort and timeout behavior
// ---------------------------------------------------------------------------

const hangingFetch = ((_: unknown, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    const abortError = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal?.aborted) return abortError();
    signal?.addEventListener("abort", abortError, { once: true });
  })) as unknown as typeof fetch;

// Pre-aborted signal: fails immediately without a request.
{
  const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  const controller = new AbortController();
  controller.abort();
  const run = await generate(
    { input: [{ type: "text", text: "p" }] },
    { fetch, signal: controller.signal },
  );
  assert.equal(run.result.stopReason, "aborted");
  assert.equal(calls.length, 0);
}

// Cancellation during an awaited payload hook must not send a request.
{
  const controller = new AbortController();
  const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  const run = await generate(
    { input: [{ type: "text", text: "p" }] },
    {
      fetch,
      signal: controller.signal,
      onPayload: async () => {
        await Promise.resolve();
        controller.abort();
      },
    },
  );
  assert.equal(run.result.stopReason, "aborted");
  assert.equal(calls.length, 0, "no quota-consuming request after cancellation");
}

// Hook exceptions are normalized and do not escape the image result contract.
{
  const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  const run = await generate(
    { input: [{ type: "text", text: "p" }] },
    { fetch, onPayload: async () => { throw new Error("hook failed"); } },
  );
  assert.equal(run.result.stopReason, "error");
  assert.match(run.result.errorMessage ?? "", /hook failed/);
  assert.equal(calls.length, 0);
}

// Even a mocked fetch/body reader cannot turn cancellation in onResponse into success.
{
  const controller = new AbortController();
  const { fetch } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  const run = await generate(
    { input: [{ type: "text", text: "p" }] },
    { fetch, signal: controller.signal, onResponse: () => { controller.abort(); } },
  );
  assert.equal(run.result.stopReason, "aborted");
  assert.deepEqual(run.artifacts, []);
}

// Mid-flight abort.
{
  const controller = new AbortController();
  const runPromise = generate(
    { input: [{ type: "text", text: "p" }] },
    { fetch: hangingFetch, signal: controller.signal },
  );
  controller.abort();
  const run = await runPromise;
  assert.equal(run.result.stopReason, "aborted");
  assert.match(run.result.errorMessage ?? "", /aborted/i);
}

// Timeout is distinct from cancellation.
{
  const run = await generate(
    { input: [{ type: "text", text: "p" }] },
    { fetch: hangingFetch, timeoutMs: 5 },
  );
  assert.equal(run.result.stopReason, "error");
  assert.match(run.result.errorMessage ?? "", /timed out after 5 ms/);
}

// ---------------------------------------------------------------------------
// 10) Unknown usage / cost handling
// ---------------------------------------------------------------------------

{
  const { fetch } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  const run = await generate({ input: [{ type: "text", text: "p" }] }, { fetch });
  // NVIDIA reports no usage for image generation; none is fabricated.
  assert.equal(run.result.usage, undefined);
}
{
  // The native adapter passes the same result through unchanged.
  const { fetch } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES)));
  const result = await generateNimImages(
    fakeImageModel,
    { input: [{ type: "text", text: "p" }] },
    { apiKey: "test-key", fetch },
  );
  assert.equal(result.usage, undefined);
  assert.equal(result.stopReason, "stop");
}

// ---------------------------------------------------------------------------
// 11) Advanced tool: settings, explicit saving, overwrite protection
// ---------------------------------------------------------------------------

const scratchRoot = process.env.COMMANDCODE_SCRATCHPAD ?? tmpdir();
const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = mkdtempSync(join(scratchRoot, "nim-image-test-"));
  tempDirs.push(dir);
  return dir;
}

function mockToolCtx(overrides?: Partial<NimImageToolContextLike["modelRegistry"]>): NimImageToolContextLike {
  return {
    cwd: process.cwd(),
    modelRegistry: {
      getModelOfType: (type, provider, id) =>
        type === "image" && provider === "nvidia-nim" && id === DEFAULT_NIM_IMAGE_MODEL_ID
          ? fakeImageModel
          : undefined,
      generateImages: (model, context, options) => generateNimImages(model, context, { apiKey: "test-key", ...options }),
      ...overrides,
    },
  };
}

const originalFetch = globalThis.fetch;
try {
  // Tool reuses the same client: request translation identical (no mode field).
  {
    const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES, 42)));
    globalThis.fetch = fetch;
    const result = await runNimImageTool(
      { prompt: "a red fox", seed: 42, steps: 3, cfg_scale: 2 },
      mockToolCtx(),
    );
    assert.equal(result.isError, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, ENDPOINT);
    assert.equal(calls[0]!.init.headers!["Authorization"], "Bearer test-key");
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
      prompt: "a red fox",
      width: 1024,
      height: 1024,
      steps: 3,
      samples: 1,
      cfg_scale: 2,
      seed: 42,
    });
    const structured = result.structuredContent as any;
    assert.equal(structured.isError, false, "codemode receives the success flag");
    assert.equal(structured.images.length, 1);
    assert.equal(structured.images[0].seed, 42);
    assert.deepEqual(structured.savedPaths, []);
  }

  // No saveDir: nothing is written to disk.
  {
    const dir = makeTempDir();
    const { fetch } = mockFetch(() => jsonResponse(200, successBody(PNG_BYTES, 1)));
    globalThis.fetch = fetch;
    const result = await runNimImageTool({ prompt: "a blue bird" }, mockToolCtx());
    assert.equal(result.isError, false);
    assert.deepEqual((result.structuredContent as any).savedPaths, []);
    assert.equal(
      result.content.some((b) => b.type === "text" && (b as { text: string }).text.includes("Not saved")),
      true,
    );
    assert.deepEqual(readdirSync(dir), [], "no files without explicit saveDir");
  }

  // Explicit saving: original bytes preserved, path reported.
  {
    const dir = makeTempDir();
    const { fetch } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES, 42)));
    globalThis.fetch = fetch;
    const result = await runNimImageTool(
      { prompt: "Sneakers product shot", seed: 42, saveDir: dir },
      mockToolCtx(),
    );
    assert.equal(result.isError, false);
    const structured = result.structuredContent as any;
    assert.equal(structured.savedPaths.length, 1);
    const savedPath = structured.images[0].savedPath as string;
    assert.equal(savedPath, structured.savedPaths[0]);
    assert.ok(existsSync(savedPath), "saved file exists");
    assert.deepEqual(readFileSync(savedPath), JPEG_BYTES, "original encoded bytes preserved");
    assert.ok(savedPath.endsWith(".jpg"), "extension follows the detected format");
    assert.match(savedPath, /sneakers-product-shot-\d{8}-\d{6}-[0-9a-f]{8}\.jpg$/);
  }

  // Relative saveDir is anchored to the session workspace, not process.cwd().
  {
    const workspace = makeTempDir();
    assert.notEqual(workspace, process.cwd());
    const { fetch } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES, 42)));
    globalThis.fetch = fetch;
    const result = await runNimImageTool(
      { prompt: "p", saveDir: "out", fileName: "session-relative" },
      { ...mockToolCtx(), cwd: workspace },
    );
    const expectedPath = join(workspace, "out", "session-relative.jpg");
    assert.equal(result.isError, false);
    assert.deepEqual((result.structuredContent as any).savedPaths, [expectedPath]);
    assert.deepEqual(readFileSync(expectedPath), JPEG_BYTES);
  }

  // Directory creation failures preserve the generated images and report saveError.
  {
    const dir = makeTempDir();
    const notDirectory = join(dir, "existing-file");
    writeFileSync(notDirectory, "ORIGINAL");
    const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES, 42)));
    globalThis.fetch = fetch;
    const result = await runNimImageTool({ prompt: "p", saveDir: notDirectory }, mockToolCtx());
    const structured = result.structuredContent as any;
    assert.equal(result.isError, true);
    assert.equal(structured.isError, true, "codemode receives save failures too");
    assert.equal(structured.stopReason, "stop", "generation itself succeeded");
    assert.match(structured.saveError, /failed to save/);
    assert.equal(structured.images.length, 1);
    assert.equal(result.content.filter((block) => block.type === "image").length, 1);
    assert.deepEqual(structured.savedPaths, []);
    assert.equal(calls.length, 1);
    assert.equal(readFileSync(notDirectory, "utf8"), "ORIGINAL");
    // The README's codemode check uses the structured value, not the outer result.
    assert.equal(structured.isError ? structured.errorMessage ?? structured.saveError : structured.savedPaths, structured.saveError);
  }

  // Overwrite protection: an existing target is never replaced.
  {
    const dir = makeTempDir();
    const existing = join(dir, "fixed.jpg");
    writeFileSync(existing, "ORIGINAL");
    const { fetch, calls } = mockFetch(() => jsonResponse(200, successBody(JPEG_BYTES, 42)));
    globalThis.fetch = fetch;
    const result = await runNimImageTool(
      { prompt: "p", saveDir: dir, fileName: "fixed.jpg" },
      mockToolCtx(),
    );
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as any).isError, true);
    assert.match((result.structuredContent as any).saveError, /refusing to overwrite existing file/);
    assert.deepEqual(readFileSync(existing, "utf8"), "ORIGINAL", "existing file untouched");
    assert.deepEqual((result.structuredContent as any).savedPaths, []);
    assert.equal(calls.length, 1, "generation still happened; only saving was refused");
    assert.equal((result.structuredContent as any).images.length, 1, "images are still returned");
  }

  // fileName without an extension gets the detected format's extension.
  {
    const dir = makeTempDir();
    const { fetch } = mockFetch(() => jsonResponse(200, successBody(WEBP_BYTES, 3)));
    globalThis.fetch = fetch;
    const result = await runNimImageTool(
      { prompt: "p", saveDir: dir, fileName: "shot" },
      mockToolCtx(),
    );
    const savedPath = (result.structuredContent as any).images[0].savedPath as string;
    assert.ok(savedPath.endsWith("shot.webp"));
  }

  // Tool-side validation and credential failures throw (failed tool result).
  {
    globalThis.fetch = originalFetch;
    await assert.rejects(
      runNimImageTool({ prompt: "p", steps: 9 }, mockToolCtx()),
      /between 1 and 4/,
      "steps validated before any request",
    );
    await assert.rejects(
      runNimImageTool({ prompt: "p", cfg_scale: 0 }, mockToolCtx()),
      /cfg_scale/,
      "cfg_scale validated locally",
    );
    await assert.rejects(
      runNimImageTool({ prompt: "p", width: 1000 }, mockToolCtx()),
      /multiple of 16/,
      "grid validated locally",
    );
    await assert.rejects(
      runNimImageTool({ prompt: "p", model: "nope/model" }, mockToolCtx()),
      /Unknown image model/,
      "unknown model rejected",
    );
    const missingAuth = await runNimImageTool({ prompt: "p" }, mockToolCtx({
      generateImages: async () => ({
        api: NIM_IMAGES_API, provider: "nvidia-nim", model: DEFAULT_NIM_IMAGE_MODEL_ID,
        output: [], stopReason: "error", errorMessage: "Provider is not configured: nvidia-nim", timestamp: Date.now(),
      }),
    }));
    assert.equal(missingAuth.isError, true, "runtime credential failures become structured errors");
    assert.match((missingAuth.structuredContent as any).errorMessage, /not configured/);
    await assert.rejects(
      runNimImageTool(
        { prompt: "p" },
        mockToolCtx({ getModelOfType: () => undefined }),
      ),
      /not registered/,
      "unregistered model reported",
    );
  }

  // Provider-side failure surfaces as an error tool result with details kept.
  {
    const { fetch } = mockFetch(() =>
      jsonResponse(200, successBody(JPEG_BYTES, 42, "CONTENT_FILTERED")),
    );
    globalThis.fetch = fetch;
    const result = await runNimImageTool({ prompt: "p" }, mockToolCtx());
    assert.equal(result.isError, true);
    const structured = result.structuredContent as any;
    assert.equal(structured.isError, true);
    assert.match(String(structured.errorMessage), /CONTENT_FILTERED/);
    assert.equal(structured.isError ? structured.errorMessage ?? structured.saveError : structured.savedPaths, structured.errorMessage);
  }

  // The tool definition exposes only verified capabilities.
  assert.equal(NIM_IMAGE_TOOL.name, NIM_IMAGE_TOOL_NAME);
  assert.equal(NIM_IMAGE_TOOL.exposure, "codemode");
  assert.equal((NIM_IMAGE_TOOL.outputSchema as any).properties.isError.type, "boolean");
  assert.ok((NIM_IMAGE_TOOL.outputSchema as any).required.includes("isError"));
  assert.match(NIM_IMAGE_TOOL.description, /16:9 landscape \(1344x768\)/);
  assert.match(NIM_IMAGE_TOOL.description, /Negative prompts and\s+output-format selection are not supported/);
  assert.match(NIM_IMAGE_TOOL.description, /no usage or cost information/);
  assert.ok(FLUX_2_KLEIN_4B_CAPABILITY.rejectedRequestFields["mode"]);
} finally {
  globalThis.fetch = originalFetch;
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

assert.equal(STATIC_MODEL_MAP.has(DEFAULT_NIM_IMAGE_MODEL_ID), false, "image model is not a chat model");

console.log("image generation tests passed");
