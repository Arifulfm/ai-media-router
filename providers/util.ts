import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function need(envKey: string): string {
  const value = process.env[envKey]?.trim();
  if (!value) throw new Error(`${envKey} is missing. Set it in .env.local.`);
  return value;
}

export async function save(file: string, bytes: Uint8Array): Promise<string> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return file;
}

export async function download(url: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wrap raw 16-bit mono PCM in a WAV header (Gemini TTS returns 24 kHz PCM).
export function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
