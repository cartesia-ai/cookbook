## What this changes

<!-- One or two sentences. Name the template or recipe. -->

## How I checked it

<!-- Commands you ran and what they printed. Say if you ran it against the live API or only against mocks. -->

- [ ] `pnpm check` passes at the repo root
- [ ] The template's own tests and typecheck pass (see its AGENTS.md)
- [ ] Model ids come from `facts.json` (`sonic-3.6`, `ink-2`, `ink-whisper`)
- [ ] `CARTESIA_API_KEY` stays on the server; browsers get a short-lived access token
- [ ] `.env.example` has empty values, and `templates.json` lists the same keys
- [ ] New or renamed template: added to `templates.json`, `llms.txt` and the root README
- [ ] No keys, tokens or agent ids in code, logs, screenshots or this description
