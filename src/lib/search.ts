import { expandQuery } from './knowledge'
import type { Analysis, LayerId } from './types'

export interface Hit { path: string; score: number; layer: LayerId; lines: { n: number; text: string }[]; why: string[] }

export function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export function search(a: Analysis, q: string): { terms: string[]; hits: Hit[] } {
  const terms = expandQuery(q)
  if (!terms.length) return { terms, hits: [] }
  const docs = Object.values(a.parsed)
  const N = docs.length || 1
  const lower = new Map(docs.map((d) => [d.path, d.content.toLowerCase()]))
  const df = new Map(terms.map((t) => [t, docs.filter((d) => lower.get(d.path)!.includes(t)).length]))
  const layerOf = new Map(a.files.map((f) => [f.path, f.layer]))
  const hits: Hit[] = []
  for (const d of docs) {
    const text = lower.get(d.path)!
    const pathL = d.path.toLowerCase()
    let score = 0
    const why = new Set<string>()
    for (const t of terms) {
      const idf = Math.log(1 + N / (1 + (df.get(t) ?? 0)))
      if (pathL.split(/[/._-]/).some((seg) => seg === t || (t.length > 3 && seg.includes(t)))) { score += 8 * idf; why.add(`path mentions “${t}”`) }
      const sym = d.symbols.find((s) => s.name.toLowerCase().includes(t))
      if (sym && t.length > 2) { score += 4 * idf; why.add(`defines ${sym.name}`) }
      let c = 0, idx = text.indexOf(t)
      while (idx !== -1 && c < 25) { c++; idx = text.indexOf(t, idx + t.length) }
      if (c) score += Math.log2(1 + c) * idf
    }
    if (score <= 0.5) continue
    // pick best lines
    const re = new RegExp(terms.filter((t) => t.length > 2).map(escapeRe).join('|') || '$^', 'i')
    const lines: { n: number; text: string }[] = []
    d.content.split('\n').some((l, n) => {
      if (re.test(l) && l.trim().length > 3) lines.push({ n: n + 1, text: l.length > 160 ? l.slice(0, 160) + '…' : l })
      return lines.length >= 3
    })
    const layer = layerOf.get(d.path) ?? 'other'
    if ((layer === 'tests' && !terms.includes('test')) || layer === 'docs') score *= 0.6
    hits.push({ path: d.path, score, layer, lines, why: [...why].slice(0, 3) })
  }
  return { terms, hits: hits.sort((x, y) => y.score - x.score).slice(0, 14) }
}

