import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

const BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "z-ai/glm-5.2";
const PROMPT = "Compute 17 times 19. Give the final answer and a short explanation.";

type JsonObject = Record<string, unknown>;
type ProbeBody = JsonObject & { stream: boolean };

type ProbeCase = {
  name: string;
  stream: boolean;
  body: JsonObject;
};

type ProbeObservation = {
  status: number | null;
  accepted: boolean;
  responseEncoding: "reasoning_content" | "reasoning" | "reasoning_text" | "inline-tags" | "content" | "unknown";
  reasoningObserved: boolean;
  reasoningLength: number;
  contentLength: number;
  toolCallObserved: boolean;
  finishReason?: string;
  responseKeys: string[];
  deltaKeys: string[];
  messageKeys: string[];
  usage?: JsonObject;
  notes: string[];
};

type ProbeResult = Pick<ProbeCase, "name" | "stream"> & ProbeObservation;

type ProbeReport = {
  model: string;
  testedAt: string;
  extensionVersion: string;
  nodeVersion: string;
  piVersion: string;
  endpoint: string;
  results: ProbeResult[];
};

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function addKeys(target: Set<string>, value: unknown): void {
  const object = asObject(value);
  if (!object) return;
  for (const key of Object.keys(object)) target.add(key);
}

function textLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) {
    return value.reduce((total, part) => total + textLength(asObject(part)?.text), 0);
  }
  return 0;
}

function responseEncoding(delta: JsonObject | undefined, message: JsonObject | undefined): ProbeObservation["responseEncoding"] {
  if (typeof delta?.reasoning_content === "string" || typeof message?.reasoning_content === "string") {
    return "reasoning_content";
  }
  if (typeof delta?.reasoning === "string" || typeof message?.reasoning === "string") {
    return "reasoning";
  }
  if (typeof delta?.reasoning_text === "string" || typeof message?.reasoning_text === "string") {
    return "reasoning_text";
  }
  const content = typeof delta?.content === "string"
    ? delta.content
    : typeof message?.content === "string"
      ? message.content
      : "";
  if (/<think>|<\/think>|<antha>|<\/antha>/i.test(content)) return "inline-tags";
  if (content.length > 0) return "content";
  return "unknown";
}

function mergeObservation(
  observation: ProbeObservation,
  chunk: JsonObject,
): void {
  addKeys(new Set(observation.responseKeys), chunk);
  for (const key of Object.keys(chunk)) {
    if (!observation.responseKeys.includes(key)) observation.responseKeys.push(key);
  }

  const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
  const choice = asObject(choices[0]);
  if (!choice) return;

  const delta = asObject(choice.delta);
  const message = asObject(choice.message);
  if (delta) {
    addKeys(new Set(observation.deltaKeys), delta);
    for (const key of Object.keys(delta)) {
      if (!observation.deltaKeys.includes(key)) observation.deltaKeys.push(key);
    }
  }
  if (message) {
    addKeys(new Set(observation.messageKeys), message);
    for (const key of Object.keys(message)) {
      if (!observation.messageKeys.includes(key)) observation.messageKeys.push(key);
    }
  }

  const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.reasoning_text
    ?? message?.reasoning_content ?? message?.reasoning ?? message?.reasoning_text;
  const content = delta?.content ?? message?.content;
  observation.reasoningLength += textLength(reasoning);
  observation.contentLength += textLength(content);
  observation.reasoningObserved ||= textLength(reasoning) > 0;
  observation.toolCallObserved ||= Array.isArray(delta?.tool_calls) || Array.isArray(message?.tool_calls);
  const encoding = responseEncoding(delta, message);
  if (
    encoding !== "unknown" &&
    (observation.responseEncoding === "unknown" ||
      (observation.responseEncoding === "content" && encoding !== "content"))
  ) {
    observation.responseEncoding = encoding;
  }

  if (typeof choice.finish_reason === "string") {
    observation.finishReason = choice.finish_reason;
  }

  const usage = asObject(chunk.usage);
  if (usage) {
    // Keep numeric usage only; never copy arbitrary response content.
    observation.usage = Object.fromEntries(
      Object.entries(usage).filter(([, value]) => typeof value === "number"),
    );
  }
}

function emptyObservation(): ProbeObservation {
  return {
    status: null,
    accepted: false,
    responseEncoding: "unknown",
    reasoningObserved: false,
    reasoningLength: 0,
    contentLength: 0,
    toolCallObserved: false,
    responseKeys: [],
    deltaKeys: [],
    messageKeys: [],
    notes: [],
  };
}

async function inspectResponse(response: Response, stream: boolean): Promise<ProbeObservation> {
  const observation = emptyObservation();
  observation.status = response.status;
  observation.accepted = response.ok;

  if (!response.ok) {
    observation.notes.push("HTTP request was rejected");
    return observation;
  }

  if (!stream) {
    try {
      const body = await response.json() as JsonObject;
      mergeObservation(observation, body);
    } catch {
      observation.notes.push("Successful response was not valid JSON");
    }
    return observation;
  }

  if (!response.body) {
    observation.notes.push("Successful response did not include a stream body");
    return observation;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:") || line.trim() === "data: [DONE]") continue;
        try {
          const chunk = JSON.parse(line.slice(5).trim()) as JsonObject;
          mergeObservation(observation, chunk);
        } catch {
          observation.notes.push("A stream event was not valid JSON");
        }
      }
      if (done) break;
    }
    if (buffer.startsWith("data:") && buffer.trim() !== "data: [DONE]") {
      try {
        mergeObservation(observation, JSON.parse(buffer.slice(5).trim()) as JsonObject);
      } catch {
        observation.notes.push("The final stream event was not valid JSON");
      }
    }
  } finally {
    reader.releaseLock();
  }
  return observation;
}

function baseBody(model: string, stream: boolean): ProbeBody {
  return {
    model,
    messages: [{ role: "user", content: PROMPT }],
    temperature: 0,
    top_p: 1,
    max_tokens: 1024,
    seed: 42,
    stream,
  };
}

function buildCases(model: string): ProbeCase[] {
  const make = (name: string, stream: boolean, extra: JsonObject = {}): ProbeCase => ({
    name,
    stream,
    body: { ...baseBody(model, stream), ...extra },
  });

  return [
    make("baseline-stream", true),
    make("baseline-non-stream", false),
    make("current-extension-off", true, {
      chat_template_kwargs: { enable_thinking: false, clear_thinking: true },
    }),
    make("current-extension-on", true, {
      chat_template_kwargs: { enable_thinking: true, clear_thinking: false },
    }),
    make("top-level-thinking-enabled", true, {
      thinking: { type: "enabled" },
    }),
    make("top-level-thinking-disabled", true, {
      thinking: { type: "disabled" },
    }),
    make("top-level-thinking-high", true, {
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    }),
    make("top-level-thinking-max", true, {
      thinking: { type: "enabled" },
      reasoning_effort: "max",
    }),
    make("nested-effort-high", true, {
      chat_template_kwargs: { reasoning_effort: "high" },
    }),
    make("nested-effort-max", true, {
      chat_template_kwargs: { reasoning_effort: "max" },
    }),
    make("conflicting-thinking-controls", true, {
      thinking: { type: "disabled" },
      chat_template_kwargs: { enable_thinking: true, reasoning_effort: "high" },
    }),
    make("tools-thinking-off", true, {
      chat_template_kwargs: { enable_thinking: false, clear_thinking: true },
      tools: [{
        type: "function",
        function: {
          name: "get_weather",
          description: "Return the weather for a city.",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      }],
      tool_choice: "auto",
    }),
    make("tools-thinking-on", true, {
      chat_template_kwargs: { enable_thinking: true, clear_thinking: false },
      tools: [{
        type: "function",
        function: {
          name: "get_weather",
          description: "Return the weather for a city.",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      }],
      tool_choice: "auto",
    }),
    make("structured-output", true, {
      response_format: { type: "json_object" },
    }),
  ];
}

async function loadPackageVersion(): Promise<string> {
  try {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as JsonObject;
    return typeof packageJson.version === "string" ? packageJson.version : "unknown";
  } catch {
    return "unknown";
  }
}

async function runCase(apiKey: string, model: string, testCase: ProbeCase): Promise<ProbeResult> {
  const observation = emptyObservation();
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testCase.body),
      signal: AbortSignal.timeout(60000),
    });
    Object.assign(observation, await inspectResponse(response, testCase.stream));
  } catch {
    observation.notes.push("Request failed before a response was received");
  }
  return { name: testCase.name, stream: testCase.stream, ...observation };
}

async function main(): Promise<void> {
  const apiKey = argValue("--api-key")
    ?? process.env.NVIDIA_NIM_API_KEY
    ?? process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("Provide --api-key=... or NVIDIA_NIM_API_KEY/NVIDIA_API_KEY.");
  }

  const model = argValue("--model") ?? DEFAULT_MODEL;
  const results: ProbeResult[] = [];
  for (const testCase of buildCases(model)) {
    process.stderr.write(`Running ${testCase.name}...\n`);
    results.push(await runCase(apiKey, model, testCase));
  }

  const report: ProbeReport = {
    model,
    testedAt: new Date().toISOString(),
    extensionVersion: await loadPackageVersion(),
    nodeVersion: process.version,
    piVersion: process.env.PI_VERSION ?? "unknown",
    endpoint: "integrate.api.nvidia.com",
    results,
  };
  const output = JSON.stringify(report, null, 2);
  const outputFile = argValue("--output");
  if (outputFile) {
    writeFileSync(outputFile, `${output}\n`, { encoding: "utf8", mode: 0o600 });
  }
  process.stdout.write(`${output}\n`);
}

if (hasFlag("--help")) {
  console.log("Usage: npm run probe -- --model=z-ai/glm-5.2 [--output=report.json]");
  console.log("Credential: --api-key=... or NVIDIA_NIM_API_KEY/NVIDIA_API_KEY");
} else {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Probe failed";
    console.error(message);
    process.exitCode = 1;
  });
}
