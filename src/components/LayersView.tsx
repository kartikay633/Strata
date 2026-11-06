import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { LAYERS, LAYER_BY_ID } from '../lib/knowledge'
import type { Analysis, LayerId } from '../lib/types'
import type { Nav } from './Dashboard'

const W = 900
const BAND_H = 66
const GAP = 26
const X0 = 150
const X1 = W - 150

export default function LayersView({ a, nav }: { a: Analysis; nav: Nav }) {
  const layers = LAYERS.filter((l) => a.layerCounts[l.id] > 0)
  const [sel, setSel] = useState<LayerId>(layers.find((l) => l.id === 'logic')?.id ?? layers[0]?.id ?? 'other')
  const [hoverFlow, setHoverFlow] = useState<string | null>(null)
  const yOf = (id: LayerId) => 20 + layers.findIndex((l) => l.id === id) * (BAND_H + GAP)
  const H = 20 + layers.length * (BAND_H + GAP)
  const maxFlow = Math.max(1, ...a.layerFlows.map((f) => f.count))
  const maxCount = Math.max(...layers.map((l) => a.layerCounts[l.id]))

  const flows = a.layerFlows.filter((f) => layers.some((l) => l.id === f.from) && layers.some((l) => l.id === f.to))

  const filesByLayer = useMemo(() => {
    const m = new Map<LayerId, typeof a.files>()
    for (const f of a.files) m.set(f.layer, [...(m.get(f.layer) ?? []), f])
    return m
  }, [a.files])

  const selFiles = filesByLayer.get(sel) ?? []
  const nodeById = new Map(a.nodes.map((n) => [n.id, n]))
  const topFiles = [...selFiles].map((f) => ({ f, n: nodeById.get(f.path) })).sort((x, y) => (y.n?.inDeg ?? -1) - (x.n?.inDeg ?? -1) || y.f.size - x.f.size).slice(0, 10)
  const selFolders = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of selFiles) m.set(f.dir || '(root)', (m.get(f.dir || '(root)') ?? 0) + 1)
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6)
  }, [selFiles])
  const inflow = flows.filter((f) => f.to === sel)
  const outflow = flows.filter((f) => f.from === sel)
  const L = LAYER_BY_ID[sel]

  return (
    <div className="layers-wrap">
      <motion.div className="panel panel-pad" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h3 className="panel-title">Architecture · how the layers call each other</h3>
        <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
          Every file is sorted into a layer by its path and role. Arcs show imports crossing between layers — <span style={{ color: '#38e1c6' }}>right side flows down</span>, <span style={{ color: '#ff7ab6' }}>left side flows up</span>. Thicker = more imports.
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          <defs>
            <filter id="lglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>
          {/* flows */}
          {flows.map((f, i) => {
            const y1 = yOf(f.from) + BAND_H / 2
            const y2 = yOf(f.to) + BAND_H / 2
            const down = y2 > y1
            const dist = Math.abs(y2 - y1)
            const x = down ? X1 : X0
            const bulge = (down ? 1 : -1) * (40 + dist * 0.35)
            const d = `M ${x} ${y1} C ${x + bulge} ${y1}, ${x + bulge} ${y2}, ${x} ${y2}`
            const key = `${f.from}>${f.to}`
            const w = 1.5 + (f.count / maxFlow) * 9
            const dim = (hoverFlow && hoverFlow !== key) || (!hoverFlow && sel && f.from !== sel && f.to !== sel)
            const col = down ? '#38e1c6' : '#ff7ab6'
            return (
              <g key={key} onMouseEnter={() => setHoverFlow(key)} onMouseLeave={() => setHoverFlow(null)} style={{ cursor: 'pointer' }}>
                <path d={d} stroke="transparent" strokeWidth={Math.max(14, w + 8)} fill="none" />
                <motion.path d={d} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: dim ? 0.12 : 0.55 }}
                  transition={{ pathLength: { delay: 0.4 + i * 0.08, duration: 0.9, ease: 'easeInOut' }, opacity: { duration: 0.3 } }} />
                {!dim && Array.from({ length: Math.min(4, 1 + Math.round((f.count / maxFlow) * 3)) }, (_, k) => (
                  <circle key={k} r={2 + w / 4} fill={col} filter="url(#lglow)" opacity={0.9}>
                    <animateMotion dur={`${2.2 + dist / 300}s`} begin={`${1.2 + k * 0.6}s`} repeatCount="indefinite" path={d} />
                  </circle>
                ))}
                {(hoverFlow === key || (!hoverFlow && (f.from === sel || f.to === sel))) && (
                  <text x={x + bulge * 0.78} y={(y1 + y2) / 2 + 4} textAnchor="middle" fill={col} fontSize={12} fontWeight={700} fontFamily="JetBrains Mono" style={{ paintOrder: 'stroke', stroke: '#0c0e16', strokeWidth: 4 }}>
                    {f.count}
                  </text>
                )}
              </g>
            )
          })}
          {/* bands */}
          {layers.map((l, i) => {
            const y = yOf(l.id)
            const count = a.layerCounts[l.id]
            const files = filesByLayer.get(l.id) ?? []
            const cells = Math.min(files.length, 64)
            const active = sel === l.id
            return (
              <motion.g key={l.id} onClick={() => setSel(l.id)} style={{ cursor: 'pointer' }}
                initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
                <rect x={X0} y={y} width={X1 - X0} height={BAND_H} rx={14} fill={l.color} fillOpacity={active ? 0.16 : 0.07} stroke={l.color} strokeOpacity={active ? 0.9 : 0.3} strokeWidth={active ? 1.6 : 1} />
                <motion.rect x={X0} y={y + BAND_H - 3} height={3} rx={1.5} fill={l.color} initial={{ width: 0 }} animate={{ width: ((X1 - X0) * count) / maxCount }} transition={{ delay: 0.3 + i * 0.07, duration: 0.9 }} />
                <text x={X0 + 18} y={y + 28} fill="#e8ebf4" fontSize={15} fontWeight={700}>{l.label}</text>
                <text x={X0 + 18} y={y + 47} fill="#8b93a7" fontSize={11.5}>{count} files</text>
                {Array.from({ length: cells }, (_, k) => {
                  const col = k % 16, row = Math.floor(k / 16)
                  return (
                    <motion.rect key={k} x={X1 - 20 - (16 - col) * 11} y={y + 12 + row * 11} width={8} height={8} rx={2} fill={l.color}
                      initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 0.35 + ((k * 37) % 60) / 100, scale: 1 }} transition={{ delay: 0.5 + i * 0.07 + k * 0.006 }} />
                  )
                })}
              </motion.g>
            )
          })}
        </svg>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div key={sel} className="panel panel-pad" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.25 }}
          style={{ alignSelf: 'start', position: 'sticky', top: 80, borderColor: L.color + '55' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="dot" style={{ background: L.color, width: 12, height: 12, boxShadow: `0 0 12px ${L.color}` }} />
            <span style={{ fontSize: 18, fontWeight: 800 }}>{L.label}</span>
            <span className="faint" style={{ marginLeft: 'auto' }}>{a.layerCounts[sel]} files</span>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>{L.blurb}</p>

          {(inflow.length > 0 || outflow.length > 0) && (
            <>
              <h3 className="panel-title" style={{ marginTop: 16 }}>Connections</h3>
              {outflow.map((f) => <div key={f.to} style={{ fontSize: 12.5, display: 'flex', gap: 8, padding: '3px 0' }}><span style={{ color: '#38e1c6' }}>→</span> uses <b style={{ color: LAYER_BY_ID[f.to].color }}>{LAYER_BY_ID[f.to].label}</b><span className="faint" style={{ marginLeft: 'auto' }}>{f.count}</span></div>)}
              {inflow.map((f) => <div key={f.from} style={{ fontSize: 12.5, display: 'flex', gap: 8, padding: '3px 0' }}><span style={{ color: '#ff7ab6' }}>←</span> used by <b style={{ color: LAYER_BY_ID[f.from].color }}>{LAYER_BY_ID[f.from].label}</b><span className="faint" style={{ marginLeft: 'auto' }}>{f.count}</span></div>)}
            </>
          )}

          <h3 className="panel-title" style={{ marginTop: 16 }}>Where it lives</h3>
          {selFolders.map(([d, n]) => (
            <div key={d} style={{ display: 'flex', fontSize: 12, fontFamily: 'var(--mono)', padding: '3px 0', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d}/</span>
              <span className="faint" style={{ marginLeft: 'auto' }}>{n}</span>
            </div>
          ))}

          <h3 className="panel-title" style={{ marginTop: 16 }}>Key files</h3>
          <div className="dep-list" style={{ maxHeight: 300 }}>
            {topFiles.map(({ f, n }) => (
              <button key={f.path} className="dep" onClick={() => nav.open(f.path)} title={f.path}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.path}</span>
                {n && n.inDeg > 0 && <span className="faint" style={{ marginLeft: 'auto', flex: 'none' }}>←{n.inDeg}</span>}
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
