import { config, higgsfield } from "@higgsfield/client/v2";
import type { Handler, Provider } from "./types.ts";
import { download, need, save } from "./util.ts";

const ENV = "HF_CREDENTIALS";

const video: Handler = async (req) => {
  const credentials = need(ENV);
  if (!/^[^:\s]+:[^:\s]+$/.test(credentials)) {
    throw new Error(`${ENV} is not in key-id:key-secret format. Fix it in .env.local.`);
  }
  // Video generation can outlast the SDK's 5-minute default polling window.
  config({ credentials, maxPollTime: 15 * 60 * 1000 });

  const result = await higgsfield.subscribe(req.model, {
    input: {
      prompt: req.prompt,
      duration: req.seconds ?? 5,
      resolution: req.resolution ?? "720p",
      aspect_ratio: req.aspect ?? "16:9",
    },
    withPolling: true,
  });

  // Anything other than "completed" (failed, nsfw/moderated, canceled, ...) is a failure.
  const status: string = result.status;
  if (status !== "completed") {
    throw new Error(`Generation did not succeed. status=${status} request_id=${result.request_id}`);
  }
  const url = result.video?.url;
  if (!url) throw new Error(`Completed but no video URL returned. request_id=${result.request_id}`);
  return { file: await save(`${req.outFile}.mp4`, await download(url)) };
};

export const higgsfieldProvider: Provider = { name: "higgsfield", envKey: ENV, tasks: { video } };
