import type { Task } from "./providers/types.ts";

// The plan: which provider + model handles which task, per tier.
// Change a model or add a new API/tier here only. Prices are USD estimates
// from OpenRouter's model list (26 Sep 2026); "unit" says how the price scales.
export interface Preset {
  provider: string;
  model: string;
  unit: "per_second" | "per_item";
  usd?: number; // undefined = unknown, the CLI will always ask before running
  voice?: string;
  resolution?: string; // overrides the 720p default when a model does not support it
  note?: string;
}

export const PLAN: Record<Task, { default: string; tiers: Record<string, Preset> }> = {
  video: {
    default: "draft",
    tiers: {
      draft: { provider: "openrouter", model: "google/veo-3.1-lite", unit: "per_second", usd: 0.05, note: "cheap test, audio" },
      wan: { provider: "openrouter", model: "alibaba/wan-3.0", unit: "per_second", usd: 0.1, note: "720p, audio, cheap, text-to-video" },
      hailuo: { provider: "openrouter", model: "minimax/hailuo-3-max", unit: "per_second", usd: 0.08, resolution: "768p", note: "no audio" },
      grok: { provider: "openrouter", model: "x-ai/grok-imagine-video", unit: "per_second", usd: 0.07, note: "720p" },
      std: { provider: "openrouter", model: "kwaivgi/kling-v3.0-std", unit: "per_second", usd: 0.084 },
      final: { provider: "openrouter", model: "google/veo-3.1-fast", unit: "per_second", usd: 0.12, note: "720p with audio" },
      best: { provider: "openrouter", model: "google/veo-3.1", unit: "per_second", usd: 0.4, note: "with audio, expensive" },
      seedance: { provider: "higgsfield", model: "bytedance/seedance-2.5/text-to-video", unit: "per_second", note: "Higgsfield plan, price unknown" },
    },
  },
  image: {
    default: "draft",
    tiers: {
      draft: { provider: "openrouter", model: "qwen/qwen-image-3", unit: "per_item", usd: 0.03 },
      final: { provider: "openrouter", model: "openai/gpt-image-2", unit: "per_item", usd: 0.1, note: "good text in image" },
      banana: { provider: "openrouter", model: "google/gemini-3.1-flash-lite-image", unit: "per_item", usd: 0.05 },
      gemini: { provider: "gemini", model: "gemini-2.5-flash-image", unit: "per_item", usd: 0.04, note: "Nano Banana via GEMINI_API_KEY" },
      vector: { provider: "openrouter", model: "recraft/recraft-v4-styles-vector", unit: "per_item", usd: 0.05 },
    },
  },
  voice: {
    default: "kore",
    tiers: {
      kore: { provider: "gemini", model: "gemini-2.5-flash-preview-tts", unit: "per_item", usd: 0.02, voice: "Kore" },
      eleven: { provider: "elevenlabs", model: "eleven_v3", unit: "per_item", note: "needs voice_id (--voice or ELEVENLABS_VOICE_ID); uses your credits, price unknown" },
      rubel: { provider: "cartesia", model: "sonic-3.6", unit: "per_item", voice: "2ba861ea-7cdc-43d1-8608-4045b5a41de5", note: "Cartesia Bangla, male, credits" },
      ananya: { provider: "cartesia", model: "sonic-3.6", unit: "per_item", voice: "48b9e1de-e2fa-4914-8b32-31c437813548", note: "Cartesia Bangla, female, clear" },
      pooja: { provider: "cartesia", model: "sonic-3.6", unit: "per_item", voice: "59ba7dee-8f9a-432f-a6c0-ffb33666b654", note: "Cartesia Bangla, female, soft" },
      orus: { provider: "gemini", model: "gemini-2.5-flash-preview-tts", unit: "per_item", usd: 0.02, voice: "Orus" },
    },
  },
};

export function estimate(preset: Preset, seconds: number): number | undefined {
  if (preset.usd === undefined) return undefined;
  return preset.unit === "per_second" ? preset.usd * seconds : preset.usd;
}
