import type { Handler, Provider } from "./types.ts";
import { need, save } from "./util.ts";

const ENV = "CARTESIA_API_KEY";
const VERSION = "2026-08-14"; // the only API version the docs list as supported

// req.voice is a Cartesia voice id. Falls back to CARTESIA_VOICE_ID from .env.local.
const voice: Handler = async (req) => {
  const voiceId = req.voice ?? process.env.CARTESIA_VOICE_ID?.trim();
  if (!voiceId) throw new Error("No voice id. Pass --voice <id> or set CARTESIA_VOICE_ID in .env.local.");

  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${need(ENV)}`,
      "Cartesia-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: req.model,
      transcript: req.prompt,
      voice: { mode: "id", id: voiceId },
      language: "bn",
      output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
    }),
  });
  if (!res.ok) throw new Error(`Cartesia HTTP ${res.status}: ${await res.text()}`);
  return { file: await save(`${req.outFile}.wav`, new Uint8Array(await res.arrayBuffer())) };
};

export const cartesia: Provider = { name: "cartesia", envKey: ENV, tasks: { voice } };
