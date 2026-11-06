import { animate, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LAYERS, LAYER_BY_ID, langColor } from '../lib/knowledge'
import type { Analysis } from '../lib/types'
import type { Nav } from './Dashboard'
import { repoPrompt } from '../lib/ai'
import { AIAnswer } from './AI'
import { File, Folder, Fork, Package, Star } from './Icons'

export function Counter({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const c = animate(0, value, { duration, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => { if (ref.current) ref.current.textContent = Math.round(v).toLocaleString() } })
    return () => c.stop()
  }, [value, duration])
  return <span ref={ref}>0</span>
}

export function LayerTag({ id }: { id: keyof typeof LAYER_BY_ID }) {
  const l = LAYER_BY_ID[id]
  return <span className="layer-tag" style={{ background: l.color + '1c', color: l.color }}><span className="dot" style={{ background: l.color, width: 6, height: 6 }} />{l.label}</span>
}

const fmtBytes = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B')

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] } } }

export default function Overview({ a, nav }: { a: Analysis; nav: Nav }) {
  const totalLang = a.languages.reduce((s, l) => s + l.bytes, 0) || 1
  const langs = a.languages.filter((l) => l.bytes / totalLang > 0.004)
  const stackGroups = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of a.stack) m.set(s.category, [...(m.get(s.category) ?? []), s.name])
    return [...m.entries()]
  }, [a.stack])
  const totalFiles = a.files.length
  const readmeStep = a.tour.find((t) => t.kind === 'readme')
  const maxScore = a.keyFiles[0]?.score ?? 1
  const [hoverLayer, setHoverLayer] = useState<string | null>(null)

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="grid" style={{ gap: 16 }}>
      {/* hero */}
      <div className="grid g-hero">
        <motion.div variants={item} className="panel panel-pad" style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -80, top: -80, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,123,255,0.25), transparent 70%)' }} />
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <img src={a.meta.avatar} alt="" style={{ width: 48, height: 48, borderRadius: 12 }} />
            <div>
              <div className="faint" style={{ fontSize: 12 }}>{a.meta.owner}</div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>{a.meta.name}</div>
            </div>
          </div>
          <p style={{ fontSize: 15, color: '#c5cad8', margin: '14px 0 12px', maxWidth: 680 }}>
            {a.meta.description || readmeStep?.body || 'No description provided.'}
          </p>
          {readmeStep && a.meta.description && <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', maxWidth: 680 }}>{readmeStep.body}</p>}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }} className="muted">
            <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Star width={14} height={14} /> {a.meta.stars.toLocaleString()}</span>
            <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Fork width={14} height={14} /> {a.meta.forks.toLocaleString()}</span>
            {a.meta.license && <span>{a.meta.license}</span>}
            <span>Updated {new Date(a.meta.updatedAt).toLocaleDateString()}</span>
          </div>
          {a.meta.topics.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {a.meta.topics.slice(0, 10).map((t) => <span key={t} className="chip" style={{ padding: '3px 10px', fontSize: 11.5 }}>{t}</span>)}
            </div>
          )}
          <div className="stat-row" style={{ marginTop: 20 }}>
            <div className="stat"><div className="stat-v"><Counter value={totalFiles} /></div><div className="stat-l">files mapped</div></div>
            <div className="stat"><div className="stat-v"><Counter value={a.totalLines} /></div><div className="stat-l">lines read</div></div>
            <div className="stat"><div className="stat-v"><Counter value={a.links.length} /></div><div className="stat-l">import links</div></div>
            <div className="stat"><div className="stat-v"><Counter value={a.nodes.length} /></div><div className="stat-l">modules parsed</div></div>
          </div>
          {a.meta.truncated && <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>This repo is very large; GitHub returned a partial file tree, so some files may be missing.</p>}
          {(a.limits.mappedFiles < a.limits.totalFiles || a.limits.parsedFiles < a.limits.codeFiles) && (
            <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
              Large repo: mapped {a.limits.mappedFiles.toLocaleString()} of {a.limits.totalFiles.toLocaleString()} files and read {a.limits.parsedFiles.toLocaleString()} of {a.limits.codeFiles.toLocaleString()} source files, starting with the most central code (src folders before tests, docs and examples).
            </p>
          )}
        </motion.div>

        <motion.div variants={item} className="panel panel-pad">
          <h3 className="panel-title">Built with</h3>
          {stackGroups.length === 0 && <p className="muted">No well-known frameworks detected — likely plain {a.languages[0]?.name ?? 'code'}.</p>}
          {stackGroups.map(([cat, names]) => (
            <div key={cat} className="stack-group">
              <div className="stack-cat">{cat}</div>
              <motion.div className="stack-chips" variants={container}>
                {names.map((n) => <motion.span key={n} variants={item} className="tech">{n}</motion.span>)}
              </motion.div>
            </div>
          ))}
        </motion.div>
      </div>

      <motion.div variants={item}>
        <AIAnswer a={a} cacheKey={`${a.meta.owner}/${a.meta.name}@${a.meta.branch}:repo`} title="Repo briefing" cta="Brief me on this repo" prompt={() => repoPrompt(a)} onFile={(p, l) => nav.open(p, l)} />
      </motion.div>

      {/* languages + layers */}
      <div className="grid g-2">
        <motion.div variants={item} className="panel panel-pad">
          <h3 className="panel-title">Languages</h3>
          <div className="langbar">
            {langs.map((l, i) => (
              <motion.div key={l.name} title={l.name} initial={{ width: 0 }} animate={{ width: `${(l.bytes / totalLang) * 100}%` }} transition={{ delay: 0.2 + i * 0.06, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} style={{ background: l.color }} />
            ))}
          </div>
          <div className="lang-legend">
            {langs.slice(0, 10).map((l) => (
              <span key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dot" style={{ background: l.color }} /> {l.name} <span className="faint">{((l.bytes / totalLang) * 100).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </motion.div>
        <motion.div variants={item} className="panel panel-pad">
          <h3 className="panel-title">What the files do <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}><button className="faint" style={{ fontSize: 12 }} onClick={() => nav.go('layers')}>Open layers →</button></span></h3>
          <div className="langbar" style={{ height: 22, borderRadius: 8 }}>
            {LAYERS.filter((l) => a.layerCounts[l.id]).map((l, i) => (
              <motion.div key={l.id} onMouseEnter={() => setHoverLayer(l.id)} onMouseLeave={() => setHoverLayer(null)}
                initial={{ width: 0 }} animate={{ width: `${(a.layerCounts[l.id] / totalFiles) * 100}%`, opacity: hoverLayer && hoverLayer !== l.id ? 0.3 : 1 }}
                transition={{ delay: 0.25 + i * 0.06, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} style={{ background: l.color, cursor: 'pointer' }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px 14px', marginTop: 14 }}>
            {LAYERS.filter((l) => a.layerCounts[l.id]).map((l) => (
              <div key={l.id} onMouseEnter={() => setHoverLayer(l.id)} onMouseLeave={() => setHoverLayer(null)} style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center', opacity: hoverLayer && hoverLayer !== l.id ? 0.4 : 1, transition: 'opacity .2s' }}>
                <span className="dot" style={{ background: l.color }} /> {l.label} <span className="faint" style={{ marginLeft: 'auto' }}>{a.layerCounts[l.id]}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, minHeight: 20, marginBottom: 0 }}>{hoverLayer ? LAYER_BY_ID[hoverLayer as keyof typeof LAYER_BY_ID].blurb : 'Hover a layer to learn what it means.'}</p>
        </motion.div>
      </div>

      {/* folders */}
      <motion.div variants={item} className="panel panel-pad">
        <h3 className="panel-title"><Folder width={14} height={14} /> Folder breakdown <span className="faint" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· click to zoom into the map</span></h3>
        <motion.div variants={container} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {a.folders.map((f) => {
            const pct = f.files / totalFiles
            return (
              <motion.div key={f.path} variants={item} className="folder-card" whileHover={{ y: -3 }} onClick={() => nav.go('map', f.path)}>
                <motion.div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, background: LAYER_BY_ID[f.layer].color }} initial={{ width: 0 }} animate={{ width: `${Math.max(pct * 100, 4)}%` }} transition={{ delay: 0.4, duration: 0.9 }} />
                <div className="fc-path"><Folder width={14} height={14} style={{ color: LAYER_BY_ID[f.layer].color }} />{f.path}/</div>
                <div className="fc-role">{f.role}</div>
                <div className="fc-meta">
                  <LayerTag id={f.layer} />
                  <span>{f.files} files</span>
                  <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}><span className="dot" style={{ background: langColor(f.topLang), width: 7, height: 7 }} />{f.topLang}</span>
                  <span style={{ marginLeft: 'auto' }}>{fmtBytes(f.bytes)}</span>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </motion.div>

      {/* key files + externals */}
      <div className="grid g-2">
        <motion.div variants={item} className="panel panel-pad">
          <h3 className="panel-title"><File width={14} height={14} /> Most important files</h3>
          {a.keyFiles.length === 0 && <p className="muted">No internal imports were found, so importance could not be ranked.</p>}
          {a.keyFiles.map((k, i) => (
            <motion.div key={k.path} className="keyfile" onClick={() => nav.open(k.path)} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.04 }}>
              <span className="rank">{String(i + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="kp">{k.path}</div>
                <div className="kr">{k.reasons.join(' · ')}</div>
                <div className="meter"><motion.div initial={{ width: 0 }} animate={{ width: `${(k.score / maxScore) * 100}%` }} transition={{ delay: 0.5 + i * 0.04, duration: 0.8 }} style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} /></div>
              </div>
            </motion.div>
          ))}
        </motion.div>
        <motion.div variants={item} className="panel panel-pad">
          <h3 className="panel-title"><Package width={14} height={14} /> Outside packages it leans on</h3>
          {a.externals.length === 0 && <p className="muted">No external imports detected in the parsed files.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {a.externals.map((e, i) => {
              const max = a.externals[0].count
              const s = 0.4 + (e.count / max) * 0.6
              return (
                <motion.span key={e.name} className="tech mono" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 0.5 + s / 2, scale: 1 }} transition={{ delay: 0.3 + i * 0.03, type: 'spring', stiffness: 300, damping: 18 }}
                  style={{ fontSize: 11 + s * 5, background: `rgba(56, 225, 198, ${0.04 + s * 0.1})`, borderColor: `rgba(56, 225, 198, ${0.15 + s * 0.3})` }} title={`imported in ${e.count} files`}>
                  {e.name} <span className="faint" style={{ fontSize: 10.5 }}>{e.count}</span>
                </motion.span>
              )
            })}
          </div>
          {a.entryPoints.length > 0 && (
            <>
              <h3 className="panel-title" style={{ marginTop: 22 }}>Entry points</h3>
              {a.entryPoints.map((e) => (
                <button key={e} className="dep" style={{ width: '100%' }} onClick={() => nav.open(e)}>▶ {e}</button>
              ))}
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}
