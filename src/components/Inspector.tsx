import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { LAYER_BY_ID, folderRole } from '../lib/knowledge'
import type { Analysis } from '../lib/types'
import type { Nav } from './Dashboard'
import { ArrowIn, ArrowOut, Github, Graph, Package, X } from './Icons'
import { filePrompt } from '../lib/ai'
import { AIAnswer } from './AI'
import { LayerTag } from './Overview'
import { CodeView, EgoGraph } from './Shared'

const KIND_COLOR: Record<string, string> = { fn: '#82aaff', class: '#c792ea', type: '#f9a86b' }

export function explainFile(a: Analysis, path: string): string {
  const f = a.files.find((x) => x.path === path)
  const p = a.parsed[path]
  if (!f) return ''
  const L = LAYER_BY_ID[f.layer]
  const parts: string[] = []
  parts.push(`A ${f.lang} file in the ${L.label.toLowerCase()} layer — ${L.blurb.charAt(0).toLowerCase() + L.blurb.slice(1)}`)
  if (f.dir) parts.push(`It lives in ${f.dir}/, ${folderRole(f.dir.split('/').pop()!, f.layer).charAt(0).toLowerCase() + folderRole(f.dir.split('/').pop()!, f.layer).slice(1)}`)
  if (p) {
    const fns = p.symbols.filter((s) => s.kind === 'fn'), cls = p.symbols.filter((s) => s.kind === 'class'), tys = p.symbols.filter((s) => s.kind === 'type')
    const defs: string[] = []
    if (fns.length) defs.push(`${fns.length} function${fns.length > 1 ? 's' : ''} (${fns.slice(0, 3).map((s) => s.name).join(', ')}${fns.length > 3 ? '…' : ''})`)
    if (cls.length) defs.push(`${cls.length} class${cls.length > 1 ? 'es' : ''} (${cls.slice(0, 3).map((s) => s.name).join(', ')})`)
    if (tys.length) defs.push(`${tys.length} type${tys.length > 1 ? 's' : ''}`)
    if (defs.length) parts.push(`Across ${p.lines} lines it defines ${defs.join(', ')}.`)
    const usedBy = a.links.filter((l) => l.target === path).length
    if (usedBy >= 5) parts.push(`${usedBy} files depend on it — this is a hub, so changes here have wide impact.`)
    else if (usedBy > 0) parts.push(`${usedBy} file${usedBy > 1 ? 's' : ''} import${usedBy > 1 ? '' : 's'} it.`)
    else if (a.entryPoints.includes(path)) parts.push('Nothing imports it because it is an entry point — execution starts here.')
    else if (p.imports.length || p.externals.length) parts.push('Nothing inside the repo imports it, so it is likely a script, page, test or entry point.')
    if (p.externals.length) parts.push(`It relies on ${p.externals.slice(0, 4).join(', ')}${p.externals.length > 4 ? ' and more' : ''}.`)
  }
  return parts.map((s) => (s.endsWith('.') ? s : s + '.')).join(' ')
}

export default function Inspector({ a, path, line, nav, onClose }: { a: Analysis; path: string; line?: number; nav: Nav; onClose: () => void }) {
  const [hl, setHl] = useState<number | undefined>(line)
  const f = a.files.find((x) => x.path === path)
  const p = a.parsed[path]
  const importers = useMemo(() => a.links.filter((l) => l.target === path).map((l) => l.source), [a.links, path])
  const explanation = useMemo(() => explainFile(a, path), [a, path])
  const ghUrl = `${a.meta.url}/blob/${a.meta.branch}/${path}${hl ? `#L${hl}` : ''}`
  const isNode = a.nodes.some((n) => n.id === path)

  return (
    <>
      <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside className="drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
        <div className="drawer-head">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="faint mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{f?.dir ? f.dir + '/' : ''}</div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 700, wordBreak: 'break-all' }}>{f?.name ?? path}</div>
            </div>
            <button className="ghost-btn" onClick={onClose} aria-label="Close"><X /></button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap', fontSize: 12 }}>
            {f && <LayerTag id={f.layer} />}
            {f && <span className="muted">{f.lang}</span>}
            {p && <span className="muted">{p.lines.toLocaleString()} lines</span>}
            {f && <span className="muted">{(f.size / 1024).toFixed(1)} KB</span>}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {isNode && <button className="ghost-btn" onClick={() => nav.go('graph', path)}><Graph width={13} height={13} /> In graph</button>}
              <a className="ghost-btn" href={ghUrl} target="_blank" rel="noreferrer"><Github width={13} height={13} /> GitHub</a>
            </span>
          </div>
        </div>

        <div className="drawer-body">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            style={{ padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(139,123,255,0.1), rgba(56,225,198,0.05))', border: '1px solid rgba(139,123,255,0.25)', fontSize: 13.5, lineHeight: 1.6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#c9c2ff', marginBottom: 6 }}>IN PLAIN ENGLISH</div>
            {explanation}
          </motion.div>

          {p && (
            <div style={{ marginTop: 12 }}>
              <AIAnswer a={a} cacheKey={`${a.meta.owner}/${a.meta.name}@${a.meta.branch}:file:${path}`} title="Deep explanation" prompt={() => filePrompt(a, path)} onFile={(q, l) => nav.open(q, l)} />
            </div>
          )}

          {p && (
            <>
              <h3 className="panel-title" style={{ marginTop: 22 }}>Connections</h3>
              <EgoGraph a={a} path={path} onPick={(q) => nav.open(q)} height={Math.max(160, Math.min(8, Math.max(p.imports.length, importers.length)) * 30)} />

              <div className="grid g-2" style={{ marginTop: 12 }}>
                <div>
                  <div className="faint" style={{ fontSize: 11.5, marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}><ArrowOut width={12} height={12} style={{ color: '#38e1c6' }} /> Imports ({p.imports.length})</div>
                  <div className="dep-list">
                    {p.imports.map((d) => <button key={d} className="dep" onClick={() => nav.open(d)} title={d}>{d}</button>)}
                    {p.imports.length === 0 && <span className="faint" style={{ fontSize: 12 }}>none</span>}
                  </div>
                </div>
                <div>
                  <div className="faint" style={{ fontSize: 11.5, marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}><ArrowIn width={12} height={12} style={{ color: '#ff7ab6' }} /> Used by ({importers.length})</div>
                  <div className="dep-list">
                    {importers.map((d) => <button key={d} className="dep" onClick={() => nav.open(d)} title={d}>{d}</button>)}
                    {importers.length === 0 && <span className="faint" style={{ fontSize: 12 }}>none</span>}
                  </div>
                </div>
              </div>

              {p.externals.length > 0 && (
                <>
                  <div className="faint" style={{ fontSize: 11.5, margin: '14px 0 6px', display: 'flex', gap: 6, alignItems: 'center' }}><Package width={12} height={12} /> Packages</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{p.externals.map((e) => <span key={e} className="sym">{e}</span>)}</div>
                </>
              )}

              {p.symbols.length > 0 && (
                <>
                  <h3 className="panel-title" style={{ marginTop: 22 }}>Outline · {p.symbols.length} symbols</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {p.symbols.map((s, i) => (
                      <motion.button key={s.name + s.line} className="sym" onClick={() => setHl(s.line)} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 + i * 0.012 }}>
                        <span className="sym-kind" style={{ color: KIND_COLOR[s.kind] }}>{s.kind}</span>{s.name}<span className="faint">:{s.line}</span>
                      </motion.button>
                    ))}
                  </div>
                </>
              )}

              <h3 className="panel-title" style={{ marginTop: 22 }}>Source</h3>
              <CodeView content={p.content} highlight={hl} maxLines={1500} />
            </>
          )}
          {!p && (
            <p className="muted" style={{ marginTop: 20 }}>
              This file was mapped but not downloaded (only source code and manifests are read). <a href={ghUrl} target="_blank" rel="noreferrer">View it on GitHub →</a>
            </p>
          )}
        </div>
      </motion.aside>
    </>
  )
}
