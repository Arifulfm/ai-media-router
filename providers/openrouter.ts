import type { Handler, Provider } from "./types.ts";
import { download, need, save, sleep } from "./util.ts";

const BASE = "https://openrouter.ai/api/v1";
const ENV = "OPENROUTER_API_KEY";
const auth = () => ({ Authorization: `Bearer ${need(ENV)}`, "Content-Type": "application/json" });

async function post(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: auth(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
  return res;
}

// Jev (TypeSafe System One), served by OpenRouter under the same key — no separate account needed.
// Docs: https://openrouter.ai/docs/guides/community/typesafe-sdk
// Pinned to a dated snapshot so thresholds tuned on it don't drift when "jev-1.13" moves.
// OpenRouter ids: "jev-1.13" (moving alias) or "jev-1.13-YYYYMMDD"; "jev-1.13.0" returns 400.
// To upgrade: run a few known cases on the new snapshot, compare, then change this line.
export const JEV_MODEL = "jev-1.13-20260917";

// Below this, a Choice/Score answer is too flat to act on automatically: leave it to a human.
export const JEV_CONFIDENCE_FLOOR = 0.5;

export interface SystemOneQuestion {
  type: "choice" | "score" | "noul";
  instructions: string;
  criteria?: Record<string, string>; // required for choice/score, unused for noul
}

export interface SystemOneAnswer {
  choice?: string;
  confidence?: number;
  score?: number;
  probabilities?: Record<string, number>;
}

export interface SystemOneResult {
  raw: unknown;
  answers: Record<string, SystemOneAnswer | number>; // noul answers can come back as a bare 0-1 number
  costUsd?: number;
  model: string; // the versioned model that actually answered, logged so answer shifts can be traced to releases
}

export async function systemOne(
  state: string,
  questions: Record<string, SystemOneQuestion>,
  model: string = JEV_MODEL,
): Promise<SystemOneResult> {
  const res = await post("/systemone", { model, state, questions });
  const data = (await res.json()) as { answers?: Record<string, unknown>; usage?: { cost?: number }; model?: string };
  return {
    raw: data,
    answers: (data.answers ?? {}) as Record<string, SystemOneAnswer | number>,
    costUsd: data.usage?.cost,
    model: data.model ?? model,
  };
}

// Choice/Score answers with confidence under the floor. Noul answers are probabilities, not confidence, so they're skipped.
export function lowConfidence(answers: Record<string, SystemOneAnswer | number>): string[] {
  return Object.entries(answers)
    .filter(([, a]) => typeof a === "object" && a?.confidence !== undefined && a.confidence < JEV_CONFIDENCE_FLOOR)
    .map(([name]) => name);
}

// Text (used by ask.ts)
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export async function chat(prompt: string, options: { model?: string; system?: string } = {}): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  messages.push({ role: "user", content: prompt });
  const res = await post("/chat/completions", { model: options.model ?? DEFAULT_MODEL, messages });
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned no message content.");
  return text;
}

const image: Handler = async (req) => {
  const res = await post("/images", {
    model: req.model,
    prompt: req.prompt,
    ...(req.aspect && { aspect_ratio: req.aspect }),
  });
  const data = (await res.json()) as {
    data?: { b64_json?: string; media_type?: string }[];
    usage?: { cost?: number };
  };
  const img = data.data?.[0];
  if (!img?.b64_json) throw new Error("OpenRouter returned no image data.");
  const ext = img.media_type?.split("/")[1]?.replace("svg+xml", "svg").replace("jpeg", "jpg") ?? "png";
  const file = await save(`${req.outFile}.${ext}`, Buffer.from(img.b64_json, "base64"));
  return { file, costUsd: data.usage?.cost };
};

const video: Handler = async (req) => {
  const submit = await post("/videos", {
    model: req.model,
    prompt: req.prompt,
    duration: req.seconds,
    aspect_ratio: req.aspect,
    resolution: req.resolution,
  });
  const job = (await submit.json()) as { id: string };
  console.log(`Job ${job.id} submitted. Polling ...`);

  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const poll = await fetch(`${BASE}/videos/${job.id}`, { headers: auth() });
    if (!poll.ok) throw new Error(`OpenRouter poll HTTP ${poll.status}: ${await poll.text()}`);
    const state = (await poll.json()) as { status: string; error?: unknown; usage?: { cost?: number } };
    if (state.status === "failed") throw new Error(`Video generation failed: ${JSON.stringify(state.error ?? state)}`);
    if (state.status === "completed") {
      const bytes = await download(`${BASE}/videos/${job.id}/content?index=0`, { Authorization: auth().Authorization });
      return { file: await save(`${req.outFile}.mp4`, bytes), costUsd: state.usage?.cost };
    }
  }
  throw new Error(`Timed out waiting for job ${job.id}.`);
};

const voice: Handler = async (req) => {
  const res = await post("/audio/speech", {
    model: req.model,
    input: req.prompt,
    voice: req.voice,
    response_format: "mp3",
  });
  return { file: await save(`${req.outFile}.mp3`, new Uint8Array(await res.arrayBuffer())) };
};

export const openrouter: Provider = { name: "openrouter", envKey: ENV, tasks: { image, video, voice } };
