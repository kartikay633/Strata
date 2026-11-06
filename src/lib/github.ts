import type { RepoMeta } from './types'

export interface RawTreeItem {
  path: string
  type: 'blob' | 'tree' | 'commit'
  size?: number
}

export function parseRepoInput(input: string): { owner: string; name: string; branch?: string } | null {
  const s = input.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const url = s.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)(?:\/tree\/([^\s#?]+))?/i)
  if (url) return { owner: url[1], name: url[2], branch: url[3] }
  const short = s.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (short) return { owner: short[1], name: short[2] }
  return null
}

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function gh<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers(token) })
  if (!res.ok) {
    if (res.status === 404) throw new Error('Repository not found. Check the name, or add a token for private repos.')
    if (res.status === 403 || res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset')
      const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'later'
      throw new Error(`GitHub rate limit reached (60 requests/hour without a token). Resets at ${when}, or add a token.`)
    }
    throw new Error(`GitHub API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

const CACHE_TTL = 30 * 60 * 1000

function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { t, v } = JSON.parse(raw)
    return Date.now() - t < CACHE_TTL ? (v as T) : null
  } catch { return null }
}

function cacheSet(key: string, v: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })) } catch { /* quota or unavailable */ }
}

/** Two API calls per repo (metadata + recursive tree); cached per browser session to protect the 60/hr anonymous limit. */
export async function fetchRepo(owner: string, name: string, branch: string | undefined, token?: string) {
  const key = `strata:${owner}/${name}@${branch ?? ''}`.toLowerCase()
  const hit = cacheGet<{ meta: RepoMeta; tree: RawTreeItem[]; isPrivate: boolean }>(key)
  if (hit) return hit
  const repo = await gh<any>(`/repos/${owner}/${name}`, token)
  const ref = branch || repo.default_branch
  const tree = await gh<{ tree: RawTreeItem[]; truncated: boolean }>(`/repos/${owner}/${name}/git/trees/${encodeURIComponent(ref)}?recursive=1`, token)
  const meta: RepoMeta = {
    owner: repo.owner.login,
    name: repo.name,
    branch: ref,
    description: repo.description ?? '',
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    url: repo.html_url,
    topics: repo.topics ?? [],
    license: repo.license?.spdx_id ?? null,
    updatedAt: repo.pushed_at,
    avatar: repo.owner.avatar_url,
    truncated: tree.truncated,
  }
  const slim = tree.tree.map((t) => ({ path: t.path, type: t.type, size: t.size }))
  const result = { meta, tree: slim, isPrivate: repo.private as boolean }
  if (!repo.private) cacheSet(key, result)
  return result
}

/** raw.githubusercontent.com is a CDN and does not count against the API rate limit. */
export async function fetchRaw(meta: RepoMeta, path: string, token?: string, isPrivate = false): Promise<string | null> {
  try {
    if (isPrivate && token) {
      const res = await fetch(
        `https://api.github.com/repos/${meta.owner}/${meta.name}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(meta.branch)}`,
        { headers: { ...headers(token), Accept: 'application/vnd.github.raw+json' } },
      )
      return res.ok ? await res.text() : null
    }
    const res = await fetch(
      `https://raw.githubusercontent.com/${meta.owner}/${meta.name}/${encodeURIComponent(meta.branch)}/${path.split('/').map(encodeURIComponent).join('/')}`,
    )
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}
