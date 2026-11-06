import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { CONCEPTS, LAYER_BY_ID } from '../lib/knowledge'
import { escapeRe, search } from '../lib/search'
import type { Analysis } from '../lib/types'
import type { Nav } from './Dashboard'
import { ArrowRight, Search, Sparkle } from './Icons'
import { askPrompt } from '../lib/ai'
import { AIAnswer } from './AI'
import { LayerTag } from './Overview'

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const ts = terms.filter((t) => t.length > 2)
  if (!ts.length) return <>{text}</>
  const re = new RegExp(`(${ts.map(escapeRe).join('|')})`, 'gi')
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>
}

export default function AskView({ a, nav }: { a: Analysis; nav: Nav }) {
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const result = useMemo(() => (q ? search(a, q) : null), [a, q])
  const maxScore = result?.hits[0]?.score ?? 1

  const clusters = useMemo(() => {
    if (!result) return []
    const m = new Map<string, number>()
    for (const h of result.hits) { const d = h.path.split('/').slice(0, -1).join('/') || '(root)'; m.set(d, (m.get(d) ?? 0) + h.score) }
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4)
  }, [result])

  const ask = (text: string) => { setInput(text); setQ(text) }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', margin: '20px 0 26px' }}>
        <h2 style={{ fontSize: 32, letterSpacing: '-0.03em', margin: '0 0 6px' }}>Ask the <span className="grad-text">repo</span></h2>
        <p className="muted" style={{ margin: 0 }}>Ask in plain words. Strata expands your question into related code terms and ranks every file it read.</p>
      </motion.div>

      <form className="ask-box" onSubmit={(e) => { e.preventDefault(); setQ(input) }}>
        <Search width={18} height={18} style={{ color: 'var(--muted)' }} />
        <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Where is authentication handled?" />
        <button className="btn-primary" type="submit" disabled={!input.trim()}>Ask <ArrowRight width={14} height={14} /></button>
      </form>

      <div className="examples" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
        {CONCEPTS.map((c) => (
          <button key={c.label} className={`chip ${q === c.query ? 'active' : ''}`} onClick={() => ask(c.query)}>{c.label}</button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div key={q} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginTop: 26 }}>
            <div className="panel panel-pad" style={{ marginBottom: 14, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <Sparkle width={18} height={18} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
              <div style={{ fontSize: 13.5 }}>
                {result.hits.length === 0 ? (
                  <>Nothing in the files I read matches that. Try a different word, or one of the topics above.</>
                ) : (
                  <>
                    The strongest match is <button className="mono" style={{ color: '#c9c2ff', textDecoration: 'underline', textUnderlineOffset: 3 }} onClick={() => nav.open(result.hits[0].path, result.hits[0].lines[0]?.n)}>{result.hits[0].path}</button>
                    {' '}in the <b style={{ color: LAYER_BY_ID[result.hits[0].layer].color }}>{LAYER_BY_ID[result.hits[0].layer].label.toLowerCase()}</b> layer.
                    {clusters.length > 1 && <> Related code clusters in {clusters.map(([d]) => <code key={d} className="mono" style={{ fontSize: 12, marginRight: 6 }}>{d}/</code>)}</>}
                    <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>Searched for: {result.terms.slice(0, 14).join(', ')}</div>
                  </>
                )}
              </div>
            </div>

            {result.hits.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <AIAnswer a={a} cacheKey={`${a.meta.owner}/${a.meta.name}@${a.meta.branch}:ask:${q.trim().toLowerCase()}`} title="Answer" effort="medium" autoStart
                  cta="Answer with Claude" prompt={() => askPrompt(a, q, result.hits)} onFile={(p, l) => nav.open(p, l)} />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.hits.map((h, i) => (
                <motion.div key={h.path} className="result" onClick={() => nav.open(h.path, h.lines[0]?.n)}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.35 }} whileHover={{ x: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="faint mono" style={{ fontSize: 11 }}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.path}</span>
                    <span style={{ marginLeft: 'auto', flex: 'none' }}><LayerTag id={h.layer} /></span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                    <div className="meter" style={{ width: 120, marginTop: 0 }}><motion.div initial={{ width: 0 }} animate={{ width: `${(h.score / maxScore) * 100}%` }} transition={{ delay: 0.2 + i * 0.05, duration: 0.6 }} style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} /></div>
                    <span className="faint" style={{ fontSize: 11.5 }}>{h.why.join(' · ')}</span>
                  </div>
                  {h.lines.length > 0 && (
                    <div className="snippet">
                      {h.lines.map((l) => <div key={l.n}><span style={{ color: '#3a4152', marginRight: 10 }}>{String(l.n).padStart(4)}</span><Highlight text={l.text} terms={result.terms} /></div>)}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
