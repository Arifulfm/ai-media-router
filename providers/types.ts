export type Task = "image" | "video" | "voice";

export interface MediaRequest {
  prompt: string;
  model: string;
  outFile: string; // extension is added by the provider if it differs
  seconds?: number;
  aspect?: string;
  resolution?: string;
  voice?: string;
}

export interface MediaResult {
  file: string;
  costUsd?: number; // actual cost when the API reports it
}

export type Handler = (req: MediaRequest) => Promise<MediaResult>;

// To add a new API: create providers/<name>.ts exporting a Provider,
// add it to providers/index.ts, then add presets in router.ts.
export interface Provider {
  name: string;
  envKey: string; // env var that holds its key/credentials (set in .env.local)
  tasks: Partial<Record<Task, Handler>>;
}
