// Explicit retirement audit. Timeouts, capacity errors and account gates stay inconclusive.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { STATIC_MODELS } from "../models/registry";

export function classifyAvailability(status: number | undefined, body = "") {
  if (status === 410 && /end of life|retir|deprecat|no longer (?:available|supported)/i.test(body)) return "retired";
  if (status !== undefined && status >= 200 && status < 300) return "responding";
  return "inconclusive";
}

export async function auditChatModel(id: string, apiKey: string, timeoutMs = 30_000) {
  const started = Date.now();
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: id, messages: [{ role: "user", content: "Reply OK." }], max_tokens: 4, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    const classification = classifyAvailability(response.status, body);
    const retirementDate = classification === "retired"
      ? body.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] : undefined;
    return { id, status: response.status, classification, retirementDate, elapsedMs: Date.now() - started };
  } catch {
    return { id, classification: "inconclusive", failure: "timeout-or-network", elapsedMs: Date.now() - started };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: npm run audit:retirements -- [--output=NEW_REPORT.json]. One tiny request per registered chat model; 30-second timeout, no retries. Requires NVIDIA_NIM_API_KEY or NVIDIA_API_KEY. Only explicit retirement is classified retired; 404/429/5xx/timeouts stay inconclusive. Existing reports are never overwritten.");
    return;
  }
  if (args.some(a => !a.startsWith("--output=")) || args.filter(a => a.startsWith("--output=")).length > 1) {
    throw new Error("Unsupported audit arguments.");
  }
  const output = args.find(a => a.startsWith("--output="))?.slice("--output=".length);
  if (output === "" || (output && existsSync(output))) throw new Error("Choose a new report path.");
  const apiKey = process.env.NVIDIA_NIM_API_KEY ?? process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_NIM_API_KEY or NVIDIA_API_KEY is required.");
  if (output) mkdirSync(dirname(resolve(output)), { recursive: true });
  const results: Awaited<ReturnType<typeof auditChatModel>>[] = [];
  for (let i = 0; i < STATIC_MODELS.length; i += 2) {
    const batch = await Promise.all(STATIC_MODELS.slice(i, i + 2).map(m => auditChatModel(m.id, apiKey)));
    results.push(...batch);
    for (const result of batch) console.log(JSON.stringify(result));
    if (i + 2 < STATIC_MODELS.length) await new Promise(r => setTimeout(r, 3200));
  }
  const report = { observedAt: new Date().toISOString(), policy: "Remove only explicit retirement; 404/429/5xx/timeouts are inconclusive.", results };
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ responding: results.filter(r => r.classification === "responding").length,
    retired: results.filter(r => r.classification === "retired").length,
    inconclusive: results.filter(r => r.classification === "inconclusive").length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error("Retirement audit failed; check credentials and output path."); process.exitCode = 1; });
}
