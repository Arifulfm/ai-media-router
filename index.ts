import { config, higgsfield, HiggsfieldError, APIError } from "@higgsfield/client/v2";

const MODEL = "bytedance/seedance-2.5/text-to-video";

const credentials = process.env.HF_CREDENTIALS?.trim();
if (!credentials || !/^[^:\s]+:[^:\s]+$/.test(credentials)) {
  console.error("HF_CREDENTIALS is missing or not in key-id:key-secret format. Set it in .env.local.");
  process.exit(1);
}

// Video generation can outlast the SDK's 5-minute default polling window.
config({ credentials, maxPollTime: 15 * 60 * 1000 });

try {
  console.log(`Submitting ${MODEL} ...`);
  const result = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  // Anything other than "completed" (failed, nsfw/moderated, canceled, ...) is a failure.
  const status: string = result.status;
  if (status !== "completed") {
    console.error(`Generation did not succeed. status=${status} request_id=${result.request_id}`);
    process.exit(1);
  }

  const url = result.video?.url;
  if (!url) {
    console.error(`Status is completed but no video URL was returned. request_id=${result.request_id}`);
    process.exit(1);
  }

  console.log(`Completed. request_id=${result.request_id}`);
  console.log(`Video URL: ${url}`);
} catch (err) {
  if (err instanceof APIError) {
    console.error(`${err.name}: ${err.message} (HTTP ${err.statusCode})`);
  } else if (err instanceof HiggsfieldError) {
    console.error(`${err.name}: ${err.message}`);
  } else {
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  }
  process.exit(1);
}
