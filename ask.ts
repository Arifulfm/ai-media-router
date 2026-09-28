import { chat, DEFAULT_MODEL } from "./providers/openrouter.ts";

const args = process.argv.slice(2);
let model = DEFAULT_MODEL;
const words: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--model" && args[i + 1]) {
    model = args[++i];
  } else {
    words.push(args[i]);
  }
}

const prompt = words.join(" ").trim();
if (!prompt) {
  console.error('Usage: npm run ask -- [--model <id>] "your question"');
  process.exit(1);
}

try {
  console.log(await chat(prompt, { model }));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
