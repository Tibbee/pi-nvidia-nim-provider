// Patient probe: 120s window, measures TTFB vs total.
const KEY = process.env.NVIDIA_API_KEY!;
const MODELS = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "openai/gpt-oss-120b",
  "google/gemma-4-31b-it",
  "meta/llama-3.2-90b-vision-instruct",
  "poolside/laguna-xs-2.1",
  "deepseek-ai/deepseek-v4-flash-0731",
];
for (const id of MODELS) {
  const t0 = Date.now();
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: id, messages: [{ role: "user", content: "ping" }], max_tokens: 4 }),
      signal: AbortSignal.timeout(120000),
    });
    const ms = ((Date.now() - t0) / 1000).toFixed(1);
    const body = res.ok ? "OK" : (await res.text().catch(() => "")).slice(0, 70);
    console.log(`${res.status}  ${String(ms).padStart(6)}s  ${id}  ${body}`);
  } catch (e: any) {
    console.log(`ERR ${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(6)}s  ${id}  ${String(e?.message ?? e).slice(0, 40)}`);
  }
  await new Promise(r => setTimeout(r, 1500));
}
