import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { LAYERS } from '../lib/knowledge'
import type { Analysis } from '../lib/types'
import type { Nav } from './Dashboard'
import { explainFile } from './Inspector'
import { ArrowRight, Play } from './Icons'
import { CodeView, EgoGraph } from './Shared'

const KIND_LABEL: Record<string, string> = { readme: 'Orientation', manifest: 'Toolkit', entry: 'Entry point', hub: 'Hub file', layer: 'Architecture', folder: 'Structure' }

export default function TourView({ a, nav }: { a: Analysis; nav: Nav }) {
  const [i, setI] = useState(0)
  const [seen, setSeen] = useState(new Set([0]))
  const [auto, setAuto] = useState(false)
  const steps = a.tour
  const step = steps[i]

  const go = (n: number) => {
    const k = Math.max(0, Math.min(steps.length - 1, n))
    setI(k); setSeen((s) => new Set(s).add(k))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(i + 1) }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!auto) return
    if (i >= steps.length - 1) { setAuto(false); return }
    const t = setTimeout(() => go(i + 1), 6000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, i])

  if (!steps.length) return <div className="empty">Not enough structure to build a tour for this repo.</div>
  const parsed = step.path ? a.parsed[step.path] : null
  const isCode = step.path && a.nodes.some((n) => n.id === step.path)

  return (
    <div className="tour">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <h3 className="panel-title" style={{ margin: 0 }}>Reading order</h3>
          <button className="ghost-btn" style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 10px' }} onClick={() => setAuto((v) => !v)}>
            <Play width={12} height={12} /> {auto ? 'Pause' : 'Autoplay'}
          </button>
        </div>
        <div className="tour-steps">
          <div className="tour-line"><motion.div animate={{ height: `${(i / Math.max(steps.length - 1, 1)) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
          {steps.map((s, k) => (
            <motion.button key={k} className={`tour-step ${k === i ? 'on' : ''} ${seen.has(k) && k !== i ? 'seen' : ''}`} onClick={() => go(k)}
              initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.06 }}>
              <span className="num">{k + 1}</span>
              <span style={{ minWidth: 0 }}>
                <span className="faint" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{KIND_LABEL[s.kind]}</span>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: k === i ? 'var(--text)' : 'var(--muted)' }}>{s.title}</div>
                {s.path && <div className="faint mono" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.path}</div>}
              </span>
            </motion.button>
          ))}
        </div>
        <p className="kbd-hint" style={{ marginTop: 14, paddingLeft: 12 }}>Use <kbd>↑</kbd> <kbd>↓</kbd> to move between steps</p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={i} className="panel" style={{ padding: 0, overflow: 'hidden', alignSelf: 'start' }}
          initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}>
          {auto && <motion.div key={'p' + i} style={{ height: 2, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 6, ease: 'linear' }} />}
          <div style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="chip" style={{ fontSize: 11 }}>Step {i + 1} of {steps.length}</span>
              <span className="faint" style={{ fontSize: 12 }}>{KIND_LABEL[step.kind]}</span>
            </div>
            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} style={{ fontSize: 28, letterSpacing: '-0.03em', margin: '12px 0 10px' }}>{step.title}</motion.h2>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }} style={{ fontSize: 15, color: '#c5cad8', lineHeight: 1.65, margin: 0, maxWidth: 760 }}>{step.body}</motion.p>

            {step.kind === 'layer' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 20 }}>
                {LAYERS.filter((l) => a.layerCounts[l.id]).map((l, k) => (
                  <motion.div key={l.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + k * 0.07 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: l.color + '12', border: `1px solid ${l.color}33` }}>
                    <span className="dot" style={{ background: l.color }} />
                    <b style={{ width: 120, fontSize: 13 }}>{l.label}</b>
                    <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>{l.blurb}</span>
                    <span className="faint mono" style={{ fontSize: 12 }}>{a.layerCounts[l.id]}</span>
                  </motion.div>
                ))}
                <button className="ghost-btn" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => nav.go('layers')}>Open the Layers view <ArrowRight width={13} height={13} /></button>
              </div>
            )}

            {step.kind === 'folder' && (
              <div className="grid g-3" style={{ marginTop: 20 }}>
                {a.folders.slice(0, 3).map((f, k) => (
                  <motion.button key={f.path} className="folder-card" style={{ textAlign: 'left' }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + k * 0.08 }} onClick={() => nav.go('map', f.path)}>
                    <div className="fc-path">{f.path}/</div>
                    <div className="fc-role">{f.role}</div>
                    <div className="fc-meta"><span>{f.files} files</span><span>{f.topLang}</span></div>
                  </motion.button>
                ))}
              </div>
            )}

            {step.path && isCode && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} style={{ marginTop: 18 }}>
                <p className="muted" style={{ fontSize: 13 }}>{explainFile(a, step.path)}</p>
                <EgoGraph a={a} path={step.path} onPick={(p) => nav.open(p)} height={200} />
              </motion.div>
            )}

            {parsed && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{step.path}</span>
                  <button className="ghost-btn" style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 10px' }} onClick={() => nav.open(step.path!)}>Open full file</button>
                </div>
                <CodeView content={parsed.content} maxLines={step.kind === 'readme' ? 40 : 60} />
              </motion.div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              <button className="ghost-btn" onClick={() => go(i - 1)} disabled={i === 0} style={{ opacity: i === 0 ? 0.4 : 1 }}>← Back</button>
              {i < steps.length - 1
                ? <button className="btn-primary" onClick={() => go(i + 1)}>Next: {steps[i + 1].title} <ArrowRight width={14} height={14} /></button>
                : <button className="btn-primary" onClick={() => nav.go('graph')}>Explore the graph <ArrowRight width={14} height={14} /></button>}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
