// Aliveness sweep: 1 tiny request per shipped model. Reports status + latency.
const KEY = process.env.NVIDIA_API_KEY!;
import { STATIC_MODELS } from "../models/registry";

async function probe(id: string) {
  const t0 = Date.now();
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: id,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 4,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const ms = ((Date.now() - t0) / 1000).toFixed(1);
    if (res.ok) {
      console.log(`200  ${String(ms).padStart(6)}s  ${id}`);
    } else {
      const body = await res.text().catch(() => "");
      console.log(`${res.status}  ${String(ms).padStart(6)}s  ${id}  ${body.slice(0, 90)}`);
    }
    return res.status;
  } catch (e: any) {
    console.log(`ERR  ${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(6)}s  ${id}  ${String(e?.message ?? e).slice(0, 60)}`);
    return 0;
  }
}

let alive = 0, dead = 0;
for (const m of STATIC_MODELS) {
  const s = await probe(m.id);
  if (s === 200) alive++; else dead++;
  await new Promise(r => setTimeout(r, 1600)); // stay under 40 req/min
}
console.log(`\nalive: ${alive}, dead/error: ${dead}, total: ${STATIC_MODELS.length}`);
