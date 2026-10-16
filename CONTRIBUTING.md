# Contributing

This repo holds recipes (short written guides) and templates (runnable apps) for building with Cartesia speech and voice agents.

## Setup

You need Node 22.22 or newer and pnpm 10. Inside this repo use pnpm. Template READMEs give npm commands because readers clone one folder on its own.

```sh
pnpm install
pnpm check
```

`pnpm check` runs the same Node checks as CI, in this order:

| Script | What it checks |
| --- | --- |
| `check:facts` | Sonic model ids and `Cartesia-Version` dates in every text file against `facts.json` |
| `check:content` | The recipe tree: `NN-name` files, frontmatter, relative links, closed fences, no em dashes |
| `check:catalog` | `templates.json`, `llms.txt` and the root README against `examples/`, each `.env.example`, the recipes and `facts.json` |
| `check:copies` | Kit and agents-web files copied into templates match the package files, and `proxy.ts` and `rate-limit.ts` match article-to-podcast's |
| `typecheck` | `pnpm -r typecheck` |
| `test` | `pnpm -r test`, every workspace package that has tests |

CI also runs `pnpm build` (every package, with no env vars set) and a Python job for front-desk, audiobook and coding-voice-mode: `uv sync --locked`, `uv run pytest`, and ruff and mypy for front-desk. To run one Python template's checks, `cd` into it and run what its `AGENTS.md` lists.

## Layout

```
examples/<name>/                                runnable templates, one folder each
content/cookbook/<NN-section>/<NN-recipe>.mdx   recipes
packages/kit/                                   shared UI kit and design rules
packages/agents-web/                            browser client for Managed Agents
tools/check-facts/                              model ids against facts.json
tools/check-content/                            the recipe tree
tools/check-catalog/                            templates.json, llms.txt and README against the repo
tools/check-copies/                             template copies against packages/kit and packages/agents-web
facts.json                                      current model ids and API version
templates.json                                  machine-readable template catalog
llms.txt                                        index for agents and docs tools
```

## How the templates share code

Each template installs and builds on its own. Nothing imports from `packages/` at runtime. Shared code is copied in, so a reader can clone one folder and own all of it.

- [`packages/kit`](packages/kit) is the design kit: [shadcn/ui](https://ui.shadcn.com) components recolored through the CSS variables in `theme.css` (Verdant green primary, light and dark, Inter), plus layout and form blocks. [`DESIGN.md`](packages/kit/DESIGN.md) sets the rules every screen follows. Next.js templates copy the components into `components/ui` and `components/blocks`. The others carry the same tokens in their own form: hand-written CSS in docs-voice-widget and front-desk, a Gradio theme in audiobook, and React Native components in voice-journal.
- [`packages/agents-web`](packages/agents-web) is a small browser client for the Managed Agents WebSocket. It mints nothing itself: you pass a `getToken` function. It captures the microphone with an AudioWorklet, plays agent audio through a jitter buffer, drops it on barge-in, and answers client tool calls. voice-chat and speaking-partner copy it to `lib/agents-web`, docs-voice-widget to `widget/src/agents-web`, and front-desk ships it as a bundled `examples/front-desk/front_desk/static/vendor/agents-web.js`.

The package is the source of truth. Fix a bug there first, then copy the file over the template's copy. `pnpm check:copies` fails when a copy under `components/ui`, `components/blocks`, `lib/agents-web` or `widget/src/agents-web` differs from the package file of the same name (voice-journal is a React Native fork and is skipped). If a template needs different behavior, put it in a new file with a different name. Delete copied files the template does not import. The same check keeps the Next templates' `proxy.ts` (the `APP_PASSWORD` gate) and `lib/rate-limit.ts`, plus voice-journal's `lib/server/rate-limit.ts`, identical to the files in article-to-podcast.

## Current models and API version

[`facts.json`](facts.json) holds these values, and `pnpm check:facts` fails CI when any file in the repo drifts from it.

| Use | Model id | Notes |
| --- | --- | --- |
| Text to speech | `sonic-3.6` | Pinned snapshot `sonic-3.6-2026-08-27` |
| Streaming speech to text with turn detection | `ink-2` | English, Spanish, French, Hindi and Japanese |
| File (batch) speech to text | `ink-whisper` | `ink-2` does not work on the batch endpoint |
| API version header | `Cartesia-Version: 2026-08-14` | The SDKs set it |

Do not use older ids. `sonic`, `sonic-english` and `sonic-multilingual` were sunset on 2026-06-01 and return a `model_sunsetted` error. `sonic-2`, `sonic-turbo` and `sonic-3-2025-10-27` stop working on 2026-10-20. The aliases `sonic-latest` and `sonic-3-latest` are deprecated. <!-- allow-model-id -->

Check the current lists at [Sonic 3.6](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest), [Ink 2](https://docs.cartesia.ai/build-with-cartesia/stt/latest) and [deprecated models](https://docs.cartesia.ai/build-with-cartesia/tts-models/api-changes). When a doc page and `facts.json` disagree, update `facts.json` first, then fix what `pnpm check:facts` reports.

The root README quickstart snippets were run against the live API with `@cartesia/cartesia-js` 4.2.0 and `cartesia` 4.2.0 on 2026-10-16. Run them again when you bump an SDK.

## Writing a recipe

Recipes live in `content/cookbook`. Sections and recipes carry a two digit prefix so the order is explicit. Leave gaps (01, 05, 10) so you can insert a recipe later without renaming files.

| Section | For |
| --- | --- |
| `00-guides` | Concepts that apply to every stack, such as auth |
| `01-next` | Next.js App Router |
| `05-node` | Plain Node scripts and servers |
| `10-python` | Python |
| `15-agents` | Cartesia Managed Agents |
| `20-telephony` | Phone calls |
| `25-mobile` | Expo and React Native |

Every section has an `index.mdx` that says what lives there and links to its recipes. Every recipe starts with frontmatter and a matching H1:

```mdx
---
title: Stream speech in Next.js
description: One sentence on what the reader will build.
tags: ['next', 'tts', 'streaming']
---

# Stream speech in Next.js
```

Use plain markdown. Code blocks may carry a `filename="..."` meta string, and GitHub ignores it. We have no docs site yet, so don't use site components such as `<Note>` or `<IndexCards>`.

A good recipe has Prerequisites, working code, a short explanation of how it works, and Next steps. Test every snippet. Say so when you could not run it against the live API.

Add every recipe to `llms.txt` as `[<frontmatter title>](<raw link>): <description>`. `pnpm check:catalog` fails when one is missing or its title is out of date.

### Rules the content checker enforces

`pnpm check:content` fails when:

- a section or file name breaks the `NN-name` pattern, or a section has no `index.mdx`
- frontmatter is missing `title`, `description` or (for recipes) `tags`
- a relative link does not resolve, or a code fence is left open
- the text contains an em dash
- the text names a retired model id. To mention one on purpose, put `<!-- allow-model-id -->` on the line

## Writing a template

Templates live in `examples/<name>` and are pnpm workspace packages (or uv projects for Python). Each one needs:

- its own `package.json` or `pyproject.toml`, with a description, keywords, repository and license
- a `README.md` with a one-command clone, the exact commands to run it, an env var table and a screenshot in `docs/`
- a `.env.example` with empty values (real `.env` files are git-ignored)
- an `AGENTS.md` with the rules a coding agent needs to work in it
- a `CLAUDE.md` that contains only `@AGENTS.md`, because Claude Code reads `CLAUDE.md` and not `AGENTS.md`

Then list it in the catalog files, so people and agents can find it:

1. `templates.json`: slug, description, search phrases, stack, models, features, env keys (the same keys as `.env.example`), clone command and deploy link.
2. The root `README.md`: a row in the template table, with a short Setup cell.
3. `llms.txt`: one line with the raw README and AGENTS links.

`pnpm check:catalog` fails when one of these is missing or out of date.

Web UIs use the kit in `packages/kit` and follow `packages/kit/DESIGN.md`. Copy the components you need into the template; do not import from `packages/`.

Keep the Cartesia API key on the server. Browsers get short-lived access tokens, see the `00-guides` recipe on browser auth.

## Style

Write plainly. No em dashes, no marketing words. Say what the code does and what the reader will see.

## License

By contributing you agree your work is licensed under Apache-2.0, the same as the rest of the repo.
