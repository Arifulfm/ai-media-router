import { appendFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { getProvider } from "./providers/index.ts";
import type { Task } from "./providers/types.ts";
import { estimate, PLAN, type Preset } from "./router.ts";

const ASK_ABOVE_USD = 0.25; // always confirm above this (or when the price is unknown)

const [task, ...rest] = process.argv.slice(2) as [Task, ...string[]];
if (!task || !(task in PLAN)) {
  console.error(`Usage: npm run <image|video|voice> -- "prompt" [--tier <name>] [--model <provider>:<model>]
       [--seconds N] [--aspect 9:16] [--resolution 720p] [--voice Name] [--out name] [--yes] [--auto]`);
  process.exit(1);
}

const flags: Record<string, string> = {};
const words: string[] = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--yes") flags.yes = "1";
  else if (rest[i] === "--auto") flags.auto = "1";
  else if (rest[i].startsWith("--") && rest[i + 1] !== undefined) flags[rest[i].slice(2)] = rest[++i];
  else words.push(rest[i]);
}
const prompt = words.join(" ").trim();
if (!prompt) {
  console.error("Prompt is empty.");
  process.exit(1);
}

const plan = PLAN[task];

// --auto: ask Jev (TypeSafe System One, via OpenRouter) to pick draft vs. final tier from the
// prompt text alone. Advisory only — it just fills in --tier; the cost check and y/n gate below
// still run unchanged, so this never generates anything without the usual confirmation.
let autoNote = "";
if (flags.auto && !flags.model && !flags.tier) {
  const draftPreset = plan.tiers.draft;
  const finalPreset = plan.tiers.final;
  if (!draftPreset || !finalPreset) {
    console.log(`--auto skipped: ${task} tiers aren't a draft/final quality axis here. Pick --tier manually.`);
  } else {
    try {
      const { systemOne, JEV_CONFIDENCE_FLOOR } = await import("./providers/openrouter.ts");
      const result = await systemOne(prompt, {
        tier: {
          type: "choice",
          instructions: `Should this ${task} generation be a quick draft/test or a final client-ready asset? Judge only from the request text.`,
          criteria: {
            draft: draftPreset.note ?? "Quick internal test or iteration, not for client delivery.",
            final: finalPreset.note ?? "Client-facing deliverable, needs polished, final quality.",
          },
        },
      });
      const ans = result.answers.tier;
      const choice = typeof ans === "object" && ans ? ans.choice : undefined;
      const confidence = typeof ans === "object" && ans ? ans.confidence : typeof ans === "number" ? ans : undefined;
      const jevCost = result.costUsd ?? 0;
      if (choice === "draft" || choice === "final") {
        const pct = confidence !== undefined ? `${Math.round(confidence * 100)}%` : "?";
        const unsure = confidence === undefined || confidence < JEV_CONFIDENCE_FLOOR;
        if (unsure) {
          console.log(`Jev is unsure (${choice}, ${pct}), not auto-picking. Using the default tier; pass --tier to choose.`);
        } else {
          flags.tier = choice;
          autoNote = ` | Jev→${choice} (${pct}, ~$${jevCost.toFixed(4)})`;
        }
        await appendFile(
          "decisions-log.md",
          `| ${new Date().toISOString().slice(0, 16)} | ${task} | ${JSON.stringify(prompt.slice(0, 80))} | ${choice}${unsure ? " (unsure, not used)" : ""} | ${pct} | $${jevCost.toFixed(4)} | ${result.model} |\n`,
        );
      } else {
        console.log(`Jev gave an unexpected answer, using default tier. Raw: ${JSON.stringify(result.raw).slice(0, 300)}`);
      }
    } catch (err) {
      console.log(`Jev call failed, using default tier: ${err instanceof Error ? err.message : err}`);
    }
  }
}

let preset: Preset;
if (flags.model) {
  const [provider, ...m] = flags.model.split(":");
  preset = { provider, model: m.join(":"), unit: "per_item" }; // manual override: price unknown
} else {
  const tier = flags.tier ?? plan.default;
  const found = plan.tiers[tier];
  if (!found) {
    console.error(`Unknown tier "${tier}" for ${task}. Tiers: ${Object.keys(plan.tiers).join(", ")}`);
    process.exit(1);
  }
  preset = found;
}

const seconds = Number(flags.seconds ?? (task === "video" ? 4 : 1));
const cost = estimate(preset, seconds);
const label = `${task} | ${preset.provider}:${preset.model}${task === "video" ? ` | ${seconds}s` : ""}`;
console.log(`${label} | est. cost: ${cost === undefined ? "unknown" : `~$${cost.toFixed(2)}`}${autoNote}`);

if ((cost === undefined || cost > ASK_ABOVE_USD) && !flags.yes) {
  if (!process.stdin.isTTY) {
    console.error("Costly or unknown-price call. Re-run with --yes to confirm.");
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Continue? (y/N) ")).trim().toLowerCase();
  rl.close();
  if (answer !== "y") {
    console.log("Cancelled. Nothing was spent.");
    process.exit(0);
  }
}

try {
  const provider = getProvider(preset.provider);
  const handler = provider.tasks[task];
  if (!handler) throw new Error(`${provider.name} does not support ${task}.`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outFile = `out/${flags.out ?? `${task}_${stamp}`}`;
  const result = await handler({
    prompt,
    model: preset.model,
    outFile,
    seconds: task === "video" ? seconds : undefined,
    aspect: flags.aspect ?? (task === "video" ? "9:16" : undefined),
    resolution: flags.resolution ?? preset.resolution ?? (task === "video" ? "720p" : undefined),
    voice: flags.voice ?? preset.voice,
  });

  const spent = result.costUsd ?? cost;
  await appendFile(
    "cost-log.md",
    `| ${new Date().toISOString().slice(0, 16)} | ${label} | ${spent === undefined ? "?" : `$${spent.toFixed(3)}`}${result.costUsd === undefined ? " (est.)" : ""} | ${result.file} |\n`,
  );
  console.log(`Saved: ${result.file}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
