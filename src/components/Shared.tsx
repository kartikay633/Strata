import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import { LAYER_BY_ID } from '../lib/knowledge'
import type { Analysis } from '../lib/types'

/* ---------- tiny syntax highlighter ---------- */

const KW = new Set(('import export from default const let var function return if else for while do switch case break continue new class extends ' +
  'async await try catch finally throw typeof instanceof in of interface type enum implements public private protected static readonly ' +
  'def self None True False elif lambda with as pass yield raise except global nonlocal is not and or package func go defer chan struct ' +
  'map range fn pub use mod impl trait let mut match loop where crate super true false null undefined this void require module').split(' '))

type Tok = { t: string; c?: string }

export function tokenize(line: string, inBlock: { v: boolean }): Tok[] {
  const out: Tok[] = []
  let i = 0
  if (inBlock.v) {
    const end = line.indexOf('*/')
    if (end === -1) return [{ t: line, c: 'tk-c' }]
    out.push({ t: line.slice(0, end + 2), c: 'tk-c' }); i = end + 2; inBlock.v = false
  }
  while (i < line.length) {
    const rest = line.slice(i)
    let m: RegExpMatchArray | null
    if (rest.startsWith('//') || (rest.startsWith('#') && !rest.startsWith('#[') && !/^#\s*(include|define|if|endif|pragma)/.test(rest))) { out.push({ t: rest, c: 'tk-c' }); break }
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2)
      if (end === -1) { out.push({ t: rest, c: 'tk-c' }); inBlock.v = true; break }
      out.push({ t: rest.slice(0, end + 2), c: 'tk-c' }); i += end + 2; continue
    }
    if ((m = rest.match(/^(["'`])(?:\\.|(?!\1).)*\1?/))) { out.push({ t: m[0], c: 'tk-s' }); i += m[0].length; continue }
    if ((m = rest.match(/^\d[\d_.xXa-fA-F]*/))) { out.push({ t: m[0], c: 'tk-n' }); i += m[0].length; continue }
    if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) {
      const w = m[0]
      const next = line[i + w.length]
      out.push({ t: w, c: KW.has(w) ? 'tk-k' : next === '(' ? 'tk-f' : undefined }); i += w.length; continue
    }
    out.push({ t: line[i] }); i++
  }
  return out
}

export function CodeView({ content, highlight, maxLines = 400, startLine = 1 }: { content: string; highlight?: number; maxLines?: number; startLine?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => content.split('\n').slice(startLine - 1, startLine - 1 + maxLines), [content, maxLines, startLine])
  const toks = useMemo(() => { const st = { v: false }; return lines.map((l) => tokenize(l, st)) }, [lines])
  useEffect(() => {
    if (highlight && ref.current) {
      const row = ref.current.querySelector(`[data-ln="${highlight}"]`) as HTMLElement | null
      if (row) ref.current.scrollTop = row.offsetTop - 80
    }
  }, [highlight, content])
  return (
    <div className="code" ref={ref}>
      <table><tbody>
        {toks.map((tk, i) => {
          const ln = startLine + i
          return (
            <tr key={i} data-ln={ln} className={highlight === ln ? 'hl' : ''}>
              <td className="ln">{ln}</td>
              <td className="lc">{tk.map((t, j) => (t.c ? <span key={j} className={t.c}>{t.t}</span> : t.t))}</td>
            </tr>
          )
        })}
      </tbody></table>
      {content.split('\n').length > startLine - 1 + maxLines && <div className="faint" style={{ padding: '8px 14px', fontSize: 11.5 }}>… {content.split('\n').length - maxLines - startLine + 1} more lines</div>}
    </div>
  )
}

/* ---------- ego graph: who imports me / who I import ---------- */

export function EgoGraph({ a, path, onPick, height = 240 }: { a: Analysis; path: string; onPick: (p: string) => void; height?: number }) {
  const imports = (a.parsed[path]?.imports ?? []).slice(0, 8)
  const importers = a.links.filter((l) => l.target === path).map((l) => l.source).slice(0, 8)
  const W = 640, H = height, cx = W / 2, cy = H / 2
  const file = a.files.find((f) => f.path === path)
  const color = file ? LAYER_BY_ID[file.layer].color : '#8b7bff'
  const colOf = (p: string) => LAYER_BY_ID[a.files.find((f) => f.path === p)?.layer ?? 'other'].color
  const place = (n: number, i: number) => (n <= 1 ? cy : 26 + (i * (H - 52)) / (n - 1))
  const name = (p: string) => { const s = p.split('/').pop()!; return s.length > 22 ? s.slice(0, 20) + '…' : s }

  if (!imports.length && !importers.length) {
    return <div className="faint" style={{ fontSize: 12.5, padding: '18px 0' }}>This file has no internal connections — it stands alone.</div>
  }

  const side = (list: string[], dir: 'in' | 'out') => list.map((p, i) => {
    const y = place(list.length, i)
    const x = dir === 'in' ? 120 : W - 120
    const d = dir === 'in' ? `M ${x + 8} ${y} C ${(x + cx) / 2} ${y}, ${(x + cx) / 2} ${cy}, ${cx - 34} ${cy}` : `M ${cx + 34} ${cy} C ${(x + cx) / 2} ${cy}, ${(x + cx) / 2} ${y}, ${x - 8} ${y}`
    const stroke = dir === 'in' ? '#ff7ab6' : '#38e1c6'
    return (
      <g key={dir + p} style={{ cursor: 'pointer' }} onClick={() => onPick(p)}>
        <motion.path d={d} fill="none" stroke={stroke} strokeOpacity={0.45} strokeWidth={1.4} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15 + i * 0.05, duration: 0.6 }} />
        <circle r={2.4} fill={stroke}><animateMotion dur="1.8s" begin={`${0.6 + i * 0.15}s`} repeatCount="indefinite" path={d} /></circle>
        <motion.g initial={{ opacity: 0, x: dir === 'in' ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
          <circle cx={x} cy={y} r={6} fill={colOf(p)} />
          <text x={dir === 'in' ? x - 12 : x + 12} y={y + 4} textAnchor={dir === 'in' ? 'end' : 'start'} fontSize={11} fill="#cfd5e3" fontFamily="JetBrains Mono">{name(p)}</text>
        </motion.g>
      </g>
    )
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      <text x={20} y={14} fontSize={10} fill="#ff7ab6" fontWeight={700} letterSpacing="0.1em">USED BY {importers.length < a.links.filter((l) => l.target === path).length ? `(${a.links.filter((l) => l.target === path).length})` : ''}</text>
      <text x={W - 20} y={14} fontSize={10} fill="#38e1c6" fontWeight={700} letterSpacing="0.1em" textAnchor="end">IMPORTS {(a.parsed[path]?.imports.length ?? 0) > 8 ? `(${a.parsed[path].imports.length})` : ''}</text>
      {side(importers, 'in')}
      {side(imports, 'out')}
      <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={cy} r={34} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={34} fill="none" stroke={color} strokeOpacity={0.4}>
          <animate attributeName="r" values="34;48;34" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff" fontFamily="JetBrains Mono">{name(path).slice(0, 12)}</text>
      </motion.g>
    </svg>
  )
}
