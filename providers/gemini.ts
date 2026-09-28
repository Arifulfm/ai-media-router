import type { Handler, Provider } from "./types.ts";
import { need, pcmToWav, save } from "./util.ts";

const ENV = "GEMINI_API_KEY";

const voice: Handler = async (req) => {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": need(ENV), "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: req.prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice ?? "Kore" } } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const b64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error("Gemini returned no audio data.");
  return { file: await save(`${req.outFile}.wav`, pcmToWav(Buffer.from(b64, "base64"))) };
};

// Nano Banana: image out through generateContent, returned as base64 inlineData.
const image: Handler = async (req) => {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": need(ENV), "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: req.prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        ...(req.aspect && { imageConfig: { aspectRatio: req.aspect } }),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Gemini returned no image data (prompt may have been blocked).");
  const ext = part.inlineData.mimeType?.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  return { file: await save(`${req.outFile}.${ext}`, Buffer.from(part.inlineData.data, "base64")) };
};

export const gemini: Provider = { name: "gemini", envKey: ENV, tasks: { voice, image } };
