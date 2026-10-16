# Contributing

This repo holds recipes (short written guides) and examples (runnable apps) for building voice apps with Cartesia. The layout follows the [Vercel AI SDK cookbook](https://github.com/vercel/ai), so it will look familiar if you have read that one.

## Setup

You need Node 22.13 or newer and pnpm 10.

```sh
pnpm install
pnpm check
```

`pnpm check` checks model ids against `facts.json`, validates the recipe tree, type-checks every package and runs the tests. Run it before you open a pull request.

## Layout

```
content/cookbook/<NN-section>/<NN-recipe>.mdx   recipes
examples/<name>/                                runnable apps
packages/kit/                                   shared UI kit
packages/agents-web/                            browser client for Managed Agents
tools/check-content/                            checks the recipe tree
tools/check-facts/                              checks model ids against facts.json
```

## Writing a recipe

Recipes live in `content/cookbook`. Sections and recipes carry a two digit prefix so the order is explicit. Leave gaps (01, 05, 10) so you can insert a recipe later without renaming files.

| Section | For |
| --- | --- |
| `00-guides` | Concepts that apply to every stack, such as auth |
| `01-next` | Next.js App Router |
| `05-node` | Plain Node scripts and servers |
| `10-python` | Python |
| `15-agents` | Cartesia Managed Agents |

Every section has an `index.mdx` that says what lives there and links to its recipes. Every recipe starts with frontmatter and a matching H1:

```mdx
---
title: Stream speech in Next.js
description: One sentence on what the reader will build.
tags: ['next', 'tts', 'streaming']
---

# Stream speech in Next.js
```

Use plain markdown. Code blocks may carry a `filename="..."` meta string, as in the Vercel cookbook, and GitHub ignores it. Vercel's cookbook also uses `<IndexCards>`, `<Browser>` and `<Note>` components from its docs site. We have no docs site yet, so we don't use them. If a site is added later, map the plain link lists in `index.mdx` to cards.

A good recipe has Prerequisites, working code, a short explanation of how it works, and Next steps. Test every snippet. Say so when you could not run it against the live API.

### Rules the checker enforces

`pnpm check:content` fails when:

- a section or file name breaks the `NN-name` pattern, or a section has no `index.mdx`
- frontmatter is missing `title`, `description` or (for recipes) `tags`
- a relative link does not resolve, or a code fence is left open
- the text contains an em dash
- the text names a retired model id. To mention one on purpose, put `<!-- allow-model-id -->` on the line

For model ids, use `sonic-3.6` for speech and `ink-2` or `ink-whisper` for transcription.

## Writing an example

Examples live in `examples/<name>` and are pnpm workspace packages (or uv projects for Python). Each one needs:

- its own `package.json` or `pyproject.toml`, with a description, keywords, repository and license
- a `README.md` with a one-command clone, the exact commands to run it, an env var table and a screenshot in `docs/`
- a `.env.example` with empty values (real `.env` files are git-ignored)
- an `AGENTS.md` with the rules a coding agent needs to work in it, and a `CLAUDE.md` that contains only `@AGENTS.md`

Then list it in the catalog files, so people and agents can find it:

1. `templates.json`: slug, description, search phrases, stack, models, env keys (the same keys as `.env.example`), clone command and deploy link.
2. The root `README.md`: a row in the right table and a line under "Find a template by task".
3. `llms.txt`: one line with the raw README and AGENTS links.

`node .github/scripts/check-catalog.mjs` fails when one of these is missing or out of date, and CI runs it.

Web UIs use the kit in `packages/kit` (shadcn/ui recolored for Cartesia) and follow `packages/kit/DESIGN.md`. Copy the components you need into the template; do not import from `packages/`.

Keep the Cartesia API key on the server. Browsers get short-lived access tokens, see the `00-guides` recipe on browser auth.

## Style

Write plainly. No em dashes, no marketing words. Say what the code does and what the reader will see.

## License

By contributing you agree your work is licensed under Apache-2.0, the same as the rest of the repo.
