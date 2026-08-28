// Probe NIM chat endpoint for candidate model IDs. 1-request-per-model, tiny output.
const KEY = process.env.NVIDIA_API_KEY;
const URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const CANDIDATES = [
  // never-tested catalog entries
  "moonshotai/kimi-k3",
  "moonshotai/kimi-k2-instruct-0905",
  "qwen/qwen3-coder-480b-a35b-instruct",
  "qwen/qwen2.5-coder-32b-instruct",
  "mistralai/magistral-small-2506",
  "mistralai/mistral-medium-3-instruct",
  "nvidia/nemotron-nano-3-30b-a3b",
  // in built-in pi but NOT in /v1/models
  "nvidia/cosmos-reason2-8b",
  // speculative unlisted successors (staged but unpublished?)
  "moonshotai/kimi-k3-0905",
  "moonshotai/kimi-k3-thinking",
  "moonshotai/kimi-k4",
  "deepseek-ai/deepseek-v4.1",
  "deepseek-ai/deepseek-v4-pro-0901",
  "deepseek-ai/deepseek-r2",
  "qwen/qwen3.5-coder",
  "qwen/qwen3-max",
  "z-ai/glm-5.5",
  "z-ai/glm-5-air",
  "openai/gpt-oss-240b",
  "meta/llama-4-scout-17b-16e-instruct",
  "meta/llama-4.1-maverick",
  "minimaxai/minimax-m4",
  "stepfun-ai/step-3.8-flash",
  "mistralai/mistral-medium-3.5-128b",
  "mistralai/devstral-2-24b-instruct",
  "google/gemma-4-12b-it",
  "google/gemma-5-e2b-it",
  "nvidia/nemotron-4-nano-9b-v2",
  "poolside/laguna-3",
  "ibm/granite-4.0-9b-instruct",
  "ai21labs/jamba-4-large-instruct",
];

async function probe(id: string) {
  const t0 = Date.now();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: id,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 4,
      }),
      signal: AbortSignal.timeout(45000),
    });
    const ms = Date.now() - t0;
    const body = await res.text().catch(() => "");
    let detail = "";
    try { detail = JSON.parse(body)?.detail ?? JSON.parse(body)?.title ?? body.slice(0, 80); }
    catch { detail = body.slice(0, 80); }
    let extra = "";
    if (res.ok) {
      try {
        const j = JSON.parse(body);
        const content = j.choices?.[0]?.message?.content;
        extra = ` | content=${JSON.stringify(content).slice(0, 40)} model=${j.model}`;
      } catch { /* ignore */ }
    }
    console.log(`${String(res.status).padEnd(4)} ${String(ms).padStart(6)}ms  ${id.padEnd(45)} ${String(detail).slice(0, 60)}${extra}`);
    return res.status;
  } catch (e: any) {
    const ms = Date.now() - t0;
    console.log(`ERR  ${String(ms).padStart(6)}ms  ${id.padEnd(45)} ${String(e?.message ?? e).slice(0, 60)}`);
    return 0;
  }
}

const results: Record<string, number[]> = {};
for (const id of CANDIDATES) {
  const s = await probe(id);
  (results[s] ||= []).push(id as any);
  await new Promise(r => setTimeout(r, 400));
}
console.log("\n=== Summary by status ===");
for (const [status, ids] of Object.entries(results).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(status, "->", ids.length);
}
