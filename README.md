# Strata — see inside any codebase

**Live demo:** https://kartikay633.github.io/Strata/ · try it on [pmndrs/zustand](https://kartikay633.github.io/Strata/?repo=pmndrs/zustand)

Paste a GitHub repo and Strata reads the code, traces every import, and turns it into an interactive, animated explainer. It runs entirely in the browser, with no backend and no sign-up.

## Views

| View | What it shows |
| --- | --- |
| **Overview** | Repo stats, detected tech stack, language mix, layer breakdown, folder-by-folder roles, ranked key files, outside packages, entry points |
| **Map** | Zoomable circle-packing of every folder and file, colored by role or language, with search highlighting |
| **Graph** | Force-directed import graph. Hover or pin a file to see animated particles flowing along its imports (teal) and importers (pink). Organic or by-folder layout |
| **Layers** | Architecture diagram: files sorted into Interface → API → Logic → Data (+ utils, config, tests, docs), with animated arcs showing how many imports cross between layers |
| **Tour** | Guided reading order for a newcomer: README → manifest → entry point → hub files → layers → folders, with autoplay |
| **Ask** | Plain-language search ("Where is auth handled?") that expands to related code terms and ranks files with highlighted matching lines |
| **Inspector** | Any file: a plain-English explanation, a live "used by / imports" graph, a symbol outline, and highlighted source |
| **AI (optional)** | Claude Opus 5.5 streams a repo briefing (Overview), a deep explanation of any file (Inspector), and answers to questions grounded in the top search hits (Ask). File paths in answers are clickable |

## How it works

1. **2 GitHub API calls**: repo metadata plus the recursive git tree. These are cached per browser session to respect the 60 requests/hour anonymous limit.
2. **Up to 450 source files** are fetched from `raw.githubusercontent.com` (a CDN that doesn't count against the API limit), 16 at a time.
3. **Import resolution** for JS/TS (including tsconfig `paths`, `@/` aliases and monorepo package names), Python (relative and absolute), Go (`go.mod` module paths), Rust (`mod` / `crate::`), Java/Kotlin, C/C++, Ruby, PHP and CSS.
4. **Heuristics** classify layers, detect the tech stack from manifests, find entry points, rank hub files and generate the tour.

## AI explanations

Click **Enable AI** in the top bar and paste your own Anthropic API key. The key is stored only in your browser's `localStorage` and sent only to `api.anthropic.com`, using the official `@anthropic-ai/sdk` with `dangerouslyAllowBrowser`. That's fine for bring-your-own-key use; a public deployment with a shared key should go through a small server-side proxy instead.

- **Prompt caching:** each repo's map (paths, layers, stack, key files, flows) is sent as a cached system block, so the briefing, file explanations and Ask answers all reuse it.
- **Grounded answers:** Ask sends the top keyword-search hits (whole files, or ±30-line windows around matches in large files) with line numbers, and Claude cites `path:line`.
- **Refusal fallback:** requests use server-side fallbacks (`fallbacks: "default"`), and refusals and auth or rate-limit errors are shown inline.

## Run

```bash
npm install
npm run dev        # http://localhost:5199
npm run smoke -- pmndrs/zustand "How is state managed?"   # engine test in Node
```

Optional: add a GitHub token in the UI (stored in `localStorage`) for private repos and 5,000 requests/hour.

## Testing

```bash
npm test                                              # 51 unit tests (vitest)
npm run accuracy -- path/to/local/clone owner/name    # compare against ground truth
```

- **Unit tests** cover import parsing for every supported language, including imports inside comments, strings and docstrings, aliases, `baseUrl`, folder and repo-root imports, and multi-line Python imports. They also cover layer rules, README summaries, tsconfig parsing, search, and a full in-memory analysis.
- **The accuracy harness** runs Strata on a local checkout and compares every import link with ground truth from the official tooling: the TypeScript compiler's module resolution for JS/TS and Python's `ast` for Python. It also checks the reported packages against the repo's manifests and the language mix against GitHub's own stats. The checkout is only read, never installed or executed.

Results on real repos:

| Repo | Language | Import links | Precision | Recall |
| --- | --- | --- | --- | --- |
| pmndrs/zustand | TypeScript | 68 | 100% | 100% |
| expressjs/express | JavaScript (CJS) | 154 | 100% | 100% |
| sindresorhus/ky | TypeScript (ESM) | 179 | 100% | 100% |
| shadcn-ui/taxonomy | Next.js / TSX | 264 | 100% | 100% |
| pallets/flask | Python | 184 | 100% | 100% |
| psf/requests | Python | 106 | 100% | 100% |

CI runs the unit tests before every deploy.

## Deploy

Every push to `main` builds the app and publishes it to GitHub Pages using `.github/workflows/deploy.yml`. The workflow sets `BASE_PATH=/<repo>/` so assets load from the project-site path. To build for Pages locally:

```bash
BASE_PATH=/Strata/ npm run build
```

## Stack

React 18 · TypeScript · Vite · D3 (pack, force, zoom) · Framer Motion · plain CSS
