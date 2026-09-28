# ai-media-router

One command line for AI image, video and voice generation across several providers. You name a quality tier, it shows the estimated cost, asks before anything expensive, generates, and logs what you spent.

```bash
npm run image -- "a ceramic mug on a linen table, soft morning light" --tier final
npm run video -- "slow dolly-in on a city street at dusk" --tier draft --seconds 5 --aspect 9:16
npm run voice -- "Hello, and welcome." --tier kore --out welcome
npm run ask   -- "Summarize the difference between these two tiers"
```

Output goes to `out/`, spend to `cost-log.md`.

## Providers

| Provider | Used for | Key |
|---|---|---|
| OpenRouter | image, video, text, Jev | `OPENROUTER_API_KEY` |
| Google Gemini | image, TTS voices (Kore, Orus) | `GEMINI_API_KEY` |
| ElevenLabs | voice (your cloned or library voice) | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| Cartesia | voice (Bangla voices included) | `CARTESIA_API_KEY` |
| Higgsfield | Seedance video | `HF_CREDENTIALS` |

Copy `.env.example` to `.env.local` and fill in only what you use. Keys are read from the environment and never written anywhere.

## Tiers

Every model and price lives in one place, `router.ts`. Examples:

- **video:** `draft` (Veo 3.1 lite), `wan`, `hailuo`, `grok`, `std` (Kling), `final` (Veo 3.1 fast), `best` (Veo 3.1), `seedance`
- **image:** `draft` (Qwen Image), `final` (GPT Image), `banana`, `gemini`, `vector` (Recraft)
- **voice:** `kore`, `orus` (Gemini), `eleven` (ElevenLabs), `rubel`, `ananya`, `pooja` (Cartesia Bangla)

Override any tier with `--model provider:model`.

## Spend gate

Each run prints an estimated cost. Above $0.25, or when the price is unknown, it asks y/n before generating. `--yes` skips the prompt; use it only for runs you've already priced.

## `--auto`: let Jev pick the tier

`--auto` (image and video) asks [Jev](https://openrouter.ai/docs/guides/community/typesafe-sdk) (TypeSafe System One, via OpenRouter) whether the prompt reads like a quick draft or a final asset, and fills in `--tier`. It costs about $0.0001 per call. If Jev's confidence is under 0.5 it doesn't pick, and the default tier is used. The cost check and y/n gate still run either way. Decisions go to `decisions-log.md`.

## `ads/jev-batch.ts`: batch judgments

Ask Jev the same questions about many items in one pass:

```bash
node --env-file=.env.local ads/jev-batch.ts input.json results.json
```

```json
{
  "questions": {
    "action": { "type": "choice", "instructions": "What should the advertiser consider?",
                "criteria": { "pause": "...", "scale": "...", "keep": "..." } }
  },
  "targets": { "roas": { "min": 3 }, "cpa": { "max": 250 } },
  "items": [{ "id": "ad-1", "state": "Carousel ad, 9 days, creative unchanged.", "metrics": { "roas": 1.4, "cpa": 410 } }]
}
```

Jev can't reliably do arithmetic or compare numbers, so numbers go in `metrics`, get checked against `targets` in code, and Jev only sees the verdict ("roas 1.4, below target (min 3)"). All questions for an item go in one call, since the state is charged once. Answers under 0.5 confidence are flagged for manual review. The model is pinned to a dated snapshot so tuned thresholds don't drift.

## Adding a provider

Add `providers/<name>.ts` exporting a `Provider`, register it in `providers/index.ts`, then add tiers in `router.ts`.

## Requirements

Node 23.6+ (runs the `.ts` files directly, no build step), then `npm install`.
