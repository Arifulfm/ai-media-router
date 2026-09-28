import type { Provider } from "./types.ts";
import { openrouter } from "./openrouter.ts";
import { higgsfieldProvider } from "./higgsfield.ts";
import { gemini } from "./gemini.ts";
import { elevenlabs } from "./elevenlabs.ts";
import { cartesia } from "./cartesia.ts";

// Add new providers here (one line each).
export const PROVIDERS: Provider[] = [openrouter, higgsfieldProvider, gemini, elevenlabs, cartesia];

export function getProvider(name: string): Provider {
  const p = PROVIDERS.find((x) => x.name === name);
  if (!p) throw new Error(`Unknown provider "${name}". Known: ${PROVIDERS.map((x) => x.name).join(", ")}`);
  return p;
}
