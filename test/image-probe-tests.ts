import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JPEG_BYTES } from "./fixtures/image-bytes";
import { parseImageProbeArgs, probeNimImage, getImageProbeCapability, writeImageProbeReport } from "../tools/probe_nim_images";
import { NIM_IMAGE_MODELS } from "../models/image-models";

assert.equal(parseImageProbeArgs([]).live, false);
assert.throws(() => parseImageProbeArgs(["--live", "--dry-run"]));
assert.throws(() => parseImageProbeArgs(["--timeout-ms=Infinity"]));
assert.throws(() => parseImageProbeArgs(["--seed="]));
assert.throws(() => parseImageProbeArgs(["--unknown=SECRET"]));
assert.throws(() => getImageProbeCapability("black-forest-labs/flux.1-kontext-dev"), /preset-only/);
let requests = 0;
const fetch = (async () => { requests++; throw new Error("network must not be called"); }) as typeof globalThis.fetch;
const dry = await probeNimImage(parseImageProbeArgs(["--model=black-forest-labs/flux.1-schnell"]), { fetch });
assert.equal(requests, 0);
assert.equal(dry.requests, 0);
assert.equal(dry.settings.cfg_scale, 0);
assert.equal(dry.generationVerified, false);
assert.equal(NIM_IMAGE_MODELS.length, 1);
const options = parseImageProbeArgs(["--live", "--prompt=SECRET_PROMPT", "--seed=42"]);
await assert.rejects(probeNimImage(options, { apiKey: "SECRET_KEY", fetch }), /decoder/);
assert.equal(requests, 0, "missing decoder fails before consuming quota");
const artifact = { base64: JPEG_BYTES.toString("base64"), finishReason: "SUCCESS", seed: 42 };
for (const [body, decoder, expected] of [
  [{ artifacts: [artifact] }, () => ({ width: 1024, height: 1024 }), true],
  [{ artifacts: [artifact] }, () => ({ width: 1, height: 1 }), false],
  [{ artifacts: [artifact] }, () => { throw new Error("SECRET_DECODER_ERROR"); }, false],
  [{ artifacts: [{ ...artifact, finishReason: "CONTENT_FILTERED" }] }, () => ({ width: 1024, height: 1024 }), false],
  [{ artifacts: [] }, () => ({ width: 1024, height: 1024 }), false],
  [{ artifacts: [null] }, () => ({ width: 1024, height: 1024 }), false],
] as const) {
  const report = await probeNimImage(options, {
    apiKey: "SECRET_KEY", decode: decoder, fetch: (async () => new Response(JSON.stringify(body))) as typeof globalThis.fetch,
  });
  assert.equal(report.generationVerified, expected);
  assert.doesNotMatch(JSON.stringify(report), /SECRET|base64|finishReason|errorMessage/);
}
const serverError = await probeNimImage(options, {
  apiKey: "SECRET_KEY", decode: () => undefined,
  fetch: (async () => new Response(JSON.stringify({ detail: "SECRET_PROMPT SECRET_KEY" }), { status: 504 })) as typeof globalThis.fetch,
});
assert.equal(serverError.generationVerified, false);
assert.doesNotMatch(JSON.stringify(serverError), /SECRET/);
const dir = mkdtempSync(join(tmpdir(), "nim-probe-report-"));
try {
  const path = join(dir, "report.json");
  writeImageProbeReport(path, { original: true });
  assert.throws(() => writeImageProbeReport(path, { replaced: true }));
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { original: true });
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log("image probe tests passed");
