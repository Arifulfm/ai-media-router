import { mkdir, readFile, writeFile } from "node:fs/promises";
import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { lowConfidence, systemOne, type SystemOneQuestion } from "../providers/openrouter.ts";

// Generic Jev batch runner: feed it { questions, items }, it asks Jev the same
// question(s) about each item's `state` text and returns the answers.
// Used by all ads-research workflows (competitor classify, pause/scale/keep,
// triage) — the caller decides the questions and where the items come from.
//
// Jev can't do arithmetic or compare numbers reliably, so numeric metrics go in
// `metrics` (not in `state`) and are checked against `targets` here in code.
// Jev only sees the verdict ("ROAS 1.8, below target min 3"), never the raw math.

type Target = { min?: number; max?: number };

interface BatchInput {
  questions: Record<string, SystemOneQuestion>;
  targets?: Record<string, Target>; // e.g. { "roas": { "min": 3 }, "cpa": { "max": 250 } }
  items: { id: string; state: string; metrics?: Record<string, number> }[];
}

interface BatchResult {
  id: string;
  answers: unknown;
  costUsd: number;
  model?: string;
  lowConfidence?: string[];
  metricVerdicts?: string[];
  error?: string;
}

function verdicts(metrics: Record<string, number> = {}, targets: Record<string, Target> = {}): string[] {
  return Object.entries(metrics).map(([name, value]) => {
    const t = targets[name];
    if (!t) return `${name} ${value}`;
    if (t.min !== undefined && value < t.min) return `${name} ${value}, below target (min ${t.min})`;
    if (t.max !== undefined && value > t.max) return `${name} ${value}, above target (max ${t.max})`;
    return `${name} ${value}, within target`;
  });
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error(`Usage: node --env-file=.env.local ads/jev-batch.ts <input.json> [output.json]`);
  process.exit(1);
}

const input = JSON.parse(await readFile(inputPath, "utf8")) as BatchInput;
if (!input.items?.length) {
  console.error("No items in input.");
  process.exit(1);
}
if (!input.questions || Object.keys(input.questions).length === 0) {
  console.error("No questions in input.");
  process.exit(1);
}

const results: BatchResult[] = [];
let totalCost = 0;

for (const item of input.items) {
  try {
    const metricVerdicts = verdicts(item.metrics, input.targets);
    const state = metricVerdicts.length ? `${item.state}\n\nMetrics (checked in code):\n${metricVerdicts.join("\n")}` : item.state;
    const result = await systemOne(state, input.questions);
    const cost = result.costUsd ?? 0;
    totalCost += cost;
    const unsure = lowConfidence(result.answers);
    results.push({
      id: item.id, answers: result.answers, costUsd: cost, model: result.model,
      ...(unsure.length && { lowConfidence: unsure }),
      ...(metricVerdicts.length && { metricVerdicts }),
    });
    const flag = unsure.length ? `  ⚠ low confidence on: ${unsure.join(", ")} — review manually` : "";
    console.log(`${item.id}: ${JSON.stringify(result.answers)} ($${cost.toFixed(4)})${flag}`);
    await appendFile(
      "decisions-log.md",
      `| ${new Date().toISOString().slice(0, 16)} | ads | ${JSON.stringify(item.id)} | ${JSON.stringify(result.answers)} | ${unsure.length ? `unsure: ${unsure.join(", ")}` : ""} | $${cost.toFixed(4)} | ${result.model} |\n`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${item.id}: failed — ${message}`);
    results.push({ id: item.id, answers: null, costUsd: 0, error: message });
  }
}

console.log(`\nTotal: ${results.length} items, ~$${totalCost.toFixed(4)}`);

if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(results, null, 2));
  console.log(`Saved: ${outputPath}`);
}
