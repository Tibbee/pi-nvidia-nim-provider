// Retry round: ambiguous models only, multiple attempts each.
const KEY = process.env.NVIDIA_API_KEY!;
const RETRIES = [
  "google/gemma-4-31b-it",
  "meta/llama-3.2-90b-vision-instruct",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "openai/gpt-oss-120b",
  "poolside/laguna-xs-2.1",
  "deepseek-ai/deepseek-v4-flash-0731",
];
const ATTEMPTS = 3;
for (const id of RETRIES) {
  const statuses: string[] = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: id, messages: [{ role: "user", content: "ping" }], max_tokens: 4 }),
        signal: AbortSignal.timeout(30000),
      });
      const ms = ((Date.now() - t0) / 1000).toFixed(1);
      statuses.push(`${res.status}/${ms}s`);
      if (res.ok) break;
    } catch (e: any) {
      statuses.push(`ERR:${String(e?.message ?? e).slice(0, 20)}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log(`${id.padEnd(45)} ${statuses.join("  ")}`);
}
