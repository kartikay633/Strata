import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { langColor } from '../lib/knowledge'
import type { ScanProgress } from '../lib/types'
import Constellation from './Constellation'

const STAGES = ['Connecting to GitHub', 'Mapping the file tree', 'Reading source files', 'Tracing imports', 'Detecting architecture']

export default function ScanScreen({ progress, onCancel }: { progress: ScanProgress | null; onCancel: () => void }) {
  const p = progress ?? { stage: 0, label: STAGES[0], discovered: 0, parsed: 0, toParse: 0, imports: 0, recent: [] }
  const colors = useRef<string[]>([])
  const last = useRef(0)
  const [, force] = useState(0)

  useEffect(() => {
    const add = p.parsed - last.current
    if (add > 0) {
      const fresh = p.recent.slice(0, add).map((r) => langColor(r.lang))
      while (fresh.length < add) fresh.push(fresh[fresh.length - 1] ?? '#8b7bff')
      colors.current.push(...fresh.reverse())
      last.current = p.parsed
      force((n) => n + 1)
    }
  }, [p.parsed, p.recent])

  const cells = Math.max(64, Math.min(p.toParse || 144, 420))
  const cols = Math.ceil(Math.sqrt(cells))
  const shown = Math.round((Math.min(p.parsed, p.toParse || 1) / Math.max(p.toParse, 1)) * cells)

  const meta = (i: number) => {
    if (i === 1 && p.discovered) return `${p.discovered.toLocaleString()} files`
    if (i === 2 && p.toParse) return `${p.parsed}/${p.toParse}`
    if (i === 3 && p.imports) return `${p.imports.toLocaleString()} links`
    return ''
  }

  return (
    <div className="scan">
      <Constellation density={40} speed={0.6} />
      <div className="scan-card">
        <motion.div className="radar" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="radar-ring" style={{ inset: `${i * 9}%`, opacity: 1 - i * 0.25 }} />
          ))}
          <div className="radar-sweep" />
          <div className="mosaic" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cells }, (_, i) => {
              const on = i < shown
              const c = colors.current[Math.floor((i / cells) * colors.current.length)] ?? '#8b7bff'
              return (
                <div key={i} className={`mosaic-cell ${on ? 'on' : ''}`}
                  style={on ? { background: c, boxShadow: `0 0 8px ${c}88` } : { transform: p.stage >= 1 ? 'scale(1)' : 'scale(0.4)' }} />
              )
            })}
          </div>
          <motion.div
            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}
            key={p.stage} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          >
            <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.04em', textShadow: '0 0 30px rgba(0,0,0,0.9)' }}>
              {p.toParse ? Math.round((Math.min(p.parsed, p.toParse) / p.toParse) * 100) : 0}%
            </div>
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
          <h2 className="scan-title">Reading the repository…</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>Every file is fetched, parsed and linked. Big repos take a few seconds.</p>
          <div className="stages">
            {STAGES.map((s, i) => {
              const state = p.stage > i ? 'done' : p.stage === i ? 'active' : 'pending'
              return (
                <motion.div key={s} className={`stage ${state}`} layout>
                  <div className="stage-dot">
                    <AnimatePresence mode="wait">
                      {state === 'done' ? (
                        <motion.svg key="ok" width="14" height="14" viewBox="0 0 24 24" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <motion.path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
                        </motion.svg>
                      ) : state === 'active' ? (
                        <motion.div key="spin" style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent' }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} />
                      ) : (
                        <span key="n">{i + 1}</span>
                      )}
                    </AnimatePresence>
                  </div>
                  <span className="stage-label">{s}</span>
                  <span className="stage-meta">{meta(i)}</span>
                </motion.div>
              )
            })}
          </div>
          <div className="ticker">
            <AnimatePresence initial={false}>
              {p.recent.map((r) => (
                <motion.div key={r.path} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} layout>
                  <span className="dot" style={{ background: langColor(r.lang), marginRight: 8 }} />
                  {r.path}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <button className="ghost-btn" onClick={onCancel} style={{ marginTop: 8 }}>Cancel</button>
        </motion.div>
      </div>
    </div>
  )
}
