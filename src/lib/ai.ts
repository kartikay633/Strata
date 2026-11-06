import Anthropic from '@anthropic-ai/sdk'
import { LAYER_BY_ID } from './knowledge'
import type { Analysis } from './types'
import type { Hit } from './search'

export const MODEL = 'claude-opus-5-5'
const KEY_STORE = 'strata.anthropicKey'

/* ---------- key (bring-your-own, stays in this browser) ---------- */

export function readKey(): string {
  try { return localStorage.getItem(KEY_STORE) ?? '' } catch { return '' }
}

export function saveKey(k: string) {
  try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('strata:key'))
}

let client: Anthropic | null = null
let clientKey = ''
function getClient(key: string) {
  if (!client || clientKey !== key) {
    // The key is the user's own and is sent only to api.anthropic.com from their browser.
    client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
    clientKey = key
  }
  return client
}

/* ---------- prompts ---------- */

const INSTRUCTIONS = `You are Strata, a guide who explains unfamiliar codebases to developers reading them for the first time.

Write for a capable developer who has never seen this repository. Be concrete: name the actual files, functions and packages involved, and explain why things are structured the way they are, not just what they are. When you mention a file from the repository, write its path in backticks exactly as it appears in the repository map (for example \`src/lib/api.ts\`), optionally with a line number (\`src/lib/api.ts:42\`) — the interface turns those into links. Use short Markdown sections and bullet points; keep it scannable. If the provided material does not show something, say so instead of guessing.`

/** Stable per-repo context, placed in the system prompt so every request for this repo reuses the prompt cache. */
function repoContext(a: Analysis): string {
  const files = a.files
    .filter((f) => f.layer !== 'docs' || /readme/i.test(f.name))
    .slice(0, 1500)
    .map((f) => `${f.path}\t${LAYER_BY_ID[f.layer].label}`)
    .join('\n')
  const lines = [
    `Repository: ${a.meta.owner}/${a.meta.name} (branch ${a.meta.branch})`,
    a.meta.description && `Description: ${a.meta.description}`,
    `Detected stack: ${a.stack.map((s) => `${s.name} (${s.category})`).join(', ') || 'none detected'}`,
    `Languages: ${a.languages.slice(0, 6).map((l) => l.name).join(', ')}`,
    `Entry points: ${a.entryPoints.join(', ') || 'none detected'}`,
    `Most depended-on files: ${a.keyFiles.slice(0, 10).map((k) => `${k.path} (${k.reasons.join('; ')})`).join(' | ')}`,
    `Imports crossing layers: ${a.layerFlows.slice(0, 12).map((f) => `${LAYER_BY_ID[f.from].label} → ${LAYER_BY_ID[f.to].label}: ${f.count}`).join(', ') || 'none'}`,
    `Most used outside packages: ${a.externals.slice(0, 15).map((e) => e.name).join(', ')}`,
    '',
    `Repository map (path, layer)${a.files.length > 1500 ? ` — first 1500 of ${a.files.length} files` : ''}:`,
    files,
  ]
  return lines.filter((l): l is string => typeof l === 'string').join('\n')
}

function numbered(content: string, from = 1, to = Infinity) {
  return content.split('\n').slice(from - 1, to === Infinity ? undefined : to).map((l, i) => `${from + i}| ${l}`).join('\n')
}

export function filePrompt(a: Analysis, path: string): string {
  const p = a.parsed[path]
  const f = a.files.find((x) => x.path === path)
  const usedBy = a.links.filter((l) => l.target === path).map((l) => l.source)
  return [
    `Explain the file \`${path}\`${f ? ` (${f.lang}, ${LAYER_BY_ID[f.layer].label} layer)` : ''}.`,
    `It imports from the repo: ${p?.imports.join(', ') || 'nothing'}`,
    `It is imported by: ${usedBy.join(', ') || 'nothing inside the repo'}`,
    `Outside packages it uses: ${p?.externals.join(', ') || 'none'}`,
    '',
    'Cover: what this file is responsible for, how its main pieces work (walk through the important functions/classes with line numbers), how it fits into the rest of the repo given who imports it and what it imports, and anything surprising or easy to get wrong when changing it. Aim for roughly 250–450 words.',
    '',
    `<file path="${path}">`,
    p ? numbered(p.content) : '(content not downloaded)',
    '</file>',
  ].join('\n')
}

export function askPrompt(a: Analysis, question: string, hits: Hit[]): string {
  const parts = hits.slice(0, 6).map((h) => {
    const p = a.parsed[h.path]
    if (!p) return ''
    const total = p.content.split('\n').length
    if (total <= 400) return `<file path="${h.path}">\n${numbered(p.content)}\n</file>`
    // large file: send windows around the matching lines
    const windows = h.lines.map((l) => numbered(p.content, Math.max(1, l.n - 30), Math.min(total, l.n + 30)))
    return `<file path="${h.path}" excerpt="true" total_lines="${total}">\n${windows.join('\n…\n')}\n</file>`
  })
  return [
    `Question about this repository: ${question}`,
    '',
    'Answer using the files below (ranked by a keyword search, so some may be irrelevant) plus the repository map. Lead with a direct answer in one or two sentences, then explain the flow step by step, citing files with line numbers. If the files do not answer the question, say what you would look at next.',
    '',
    ...parts,
  ].join('\n')
}

export function repoPrompt(a: Analysis): string {
  const manifest = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'requirements.txt', 'Gemfile', 'composer.json'].find((m) => a.parsed[m])
  const entry = a.entryPoints[0]
  return [
    'Give a briefing on this repository for a developer about to start working in it.',
    'Cover: what the project is and who it is for; the architecture (main parts and how data or control flows between them); where execution starts; the three to five files worth reading first, in order, and why; and the conventions or patterns the code follows. Aim for roughly 350–550 words.',
    '',
    a.readme ? `<readme>\n${a.readme}\n</readme>` : '(no README)',
    manifest ? `<file path="${manifest}">\n${a.parsed[manifest].content}\n</file>` : '',
    entry && a.parsed[entry] ? `<file path="${entry}">\n${numbered(a.parsed[entry].content)}\n</file>` : '',
  ].join('\n')
}

/* ---------- streaming ---------- */

export interface StreamHandlers {
  onText: (delta: string) => void
  signal: AbortSignal
}

export class AIError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'rate' | 'refusal' | 'other') { super(message) }
}

export async function streamExplain(a: Analysis, userPrompt: string, effort: 'low' | 'medium', h: StreamHandlers) {
  const key = readKey()
  if (!key) throw new AIError('Add your Anthropic API key to use AI explanations.', 'auth')
  const stream = getClient(key).beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort },
      system: [
        { type: 'text', text: INSTRUCTIONS },
        { type: 'text', text: repoContext(a), cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    },
    { signal: h.signal },
  )
  stream.on('text', (t) => h.onText(t))
  try {
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') throw new AIError('Claude declined to answer this one. Try rephrasing the question.', 'refusal')
    return msg
  } catch (e) {
    if (e instanceof AIError) throw e
    if (e instanceof Anthropic.AuthenticationError) throw new AIError('That API key was rejected. Check it in AI settings.', 'auth')
    if (e instanceof Anthropic.PermissionDeniedError) throw new AIError('This API key does not have access to the model.', 'auth')
    if (e instanceof Anthropic.RateLimitError) throw new AIError('Rate limited by the API. Wait a moment and try again.', 'rate')
    if (e instanceof Anthropic.APIUserAbortError) throw e
    if (e instanceof Anthropic.APIError) throw new AIError(`API error ${e.status ?? ''}: ${e.message}`, 'other')
    throw new AIError(e instanceof Error ? e.message : String(e), 'other')
  }
}

/* ---------- in-memory cache of finished answers ---------- */

export const answerCache = new Map<string, string>()
