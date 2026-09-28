import type { Handler, Provider } from "./types.ts";
import { need, save } from "./util.ts";

const ENV = "ELEVENLABS_API_KEY";

// req.voice is an ElevenLabs voice_id (your clone or a library voice).
// Falls back to ELEVENLABS_VOICE_ID from .env.local.
const voice: Handler = async (req) => {
  const voiceId = req.voice ?? process.env.ELEVENLABS_VOICE_ID?.trim();
  if (!voiceId) throw new Error("No voice_id. Pass --voice <voice_id> or set ELEVENLABS_VOICE_ID in .env.local.");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": need(ENV), "Content-Type": "application/json" },
      body: JSON.stringify({ text: req.prompt, model_id: req.model }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${await res.text()}`);
  return { file: await save(`${req.outFile}.mp3`, new Uint8Array(await res.arrayBuffer())) };
};

export const elevenlabs: Provider = { name: "elevenlabs", envKey: ENV, tasks: { voice } };
