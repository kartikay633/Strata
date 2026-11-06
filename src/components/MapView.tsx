import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LAYERS, LAYER_BY_ID, langColor } from '../lib/knowledge'
import type { Analysis, TreeNode } from '../lib/types'
import type { Nav } from './Dashboard'
import { Search } from './Icons'

type HNode = d3.HierarchyCircularNode<TreeNode>
type Mode = 'layer' | 'language'

export default function MapView({ a, nav, focus }: { a: Analysis; nav: Nav; focus?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const api = useRef<{ zoomToPath: (p: string) => void; recolor: (m: Mode, q: string) => void } | null>(null)
  const [mode, setMode] = useState<Mode>('layer')
  const [query, setQuery] = useState('')
  const [crumbs, setCrumbs] = useState<string[]>([])
  const [tip, setTip] = useState<{ x: number; y: number; d: HNode } | null>(null)

  const langs = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of a.files) m.set(f.lang, (m.get(f.lang) ?? 0) + 1)
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)
  }, [a.files])

  useEffect(() => {
    const wrap = wrapRef.current!
    const svg = d3.select(svgRef.current!)
    svg.selectAll('*').remove()
    let width = wrap.clientWidth, height = wrap.clientHeight
    svg.attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)

    const root = d3.pack<TreeNode>().size([1000, 1000]).padding((d) => (d.depth === 0 ? 10 : 3))(
      d3.hierarchy(a.tree).sum((d) => (d.children ? 0 : d.size)).sort((x, y) => (y.value ?? 0) - (x.value ?? 0)),
    )
    let focusNode: HNode = root
    let view: [number, number, number] = [root.x, root.y, root.r * 2]

    const defs = svg.append('defs')
    const glow = defs.append('filter').attr('id', 'mglow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    glow.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'b')
    const mg = glow.append('feMerge'); mg.append('feMergeNode').attr('in', 'b'); mg.append('feMergeNode').attr('in', 'SourceGraphic')

    const g = svg.append('g')
    const all = root.descendants().slice(1) as HNode[]
    const fileFill = (d: HNode, m: Mode) => (m === 'layer' ? LAYER_BY_ID[d.data.file!.layer].color : langColor(d.data.file!.lang))

    const node = g.selectAll<SVGCircleElement, HNode>('circle').data(all).join('circle')
      .attr('fill', (d) => (d.children ? `rgba(139,123,255,${0.03 + Math.min(d.depth, 6) * 0.018})` : fileFill(d, 'layer')))
      .attr('fill-opacity', (d) => (d.children ? 1 : 0.85))
      .attr('stroke', (d) => (d.children ? 'rgba(148,163,184,0.22)' : 'none'))
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', function (ev, d) {
        d3.select(this).attr('stroke', '#fff').attr('stroke-width', 1.5)
        const r = wrap.getBoundingClientRect()
        setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, d })
      })
      .on('mousemove', (ev, d) => {
        const r = wrap.getBoundingClientRect()
        setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, d })
      })
      .on('mouseleave', function (_, d) {
        d3.select(this).attr('stroke', d.children ? 'rgba(148,163,184,0.22)' : 'none').attr('stroke-width', 1)
        setTip(null)
      })
      .on('click', (ev, d) => {
        ev.stopPropagation()
        if (d.children) { if (focusNode !== d) zoom(d) }
        else nav.open(d.data.path)
      })

    const label = g.selectAll<SVGTextElement, HNode>('text').data(root.descendants() as HNode[]).join('text')
      .attr('text-anchor', 'middle')
      .style('font', '600 11px Inter, sans-serif')
      .style('pointer-events', 'none')
      .style('fill', '#e8ebf4')
      .style('paint-order', 'stroke')
      .style('stroke', 'rgba(7,8,13,0.85)')
      .style('stroke-width', 3)
      .style('fill-opacity', (d) => (d.parent === root ? 1 : 0))
      .style('display', (d) => (d.parent === root ? 'inline' : 'none'))
      .text((d) => (d.children ? d.data.name + '/' : d.data.name))

    function zoomTo(v: [number, number, number]) {
      const k = Math.min(width, height) / v[2]
      view = v
      label.attr('transform', (d) => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k + (d.children ? -d.r * k + 14 : 4)})`)
      node.attr('transform', (d) => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`).attr('r', (d) => d.r * k)
      label.style('font-size', (d) => `${Math.max(9, Math.min(13, d.r * k * 0.18))}px`)
    }

    function zoom(d: HNode, duration = 750) {
      node.interrupt()
      focusNode = d
      setCrumbs(d.ancestors().reverse().slice(1).map((n) => n.data.path))
      const t = svg.transition().duration(duration).ease(d3.easeCubicInOut).tween('zoom', () => {
        const i = d3.interpolateZoom(view, [d.x, d.y, d.r * 2])
        return (tt: number) => zoomTo(i(tt) as [number, number, number])
      })
      label.filter(function (n) { return n.parent === focusNode || (this as SVGTextElement).style.display === 'inline' })
        .transition(t as any)
        .style('fill-opacity', (n) => (n.parent === focusNode ? 1 : 0))
        .on('start', function (n) { if (n.parent === focusNode) (this as SVGTextElement).style.display = 'inline' })
        .on('end', function (n) { if (n.parent !== focusNode) (this as SVGTextElement).style.display = 'none' })
    }

    svg.on('click', () => { if (focusNode.parent) zoom(focusNode.parent as HNode) })

    // bloom-in entrance
    zoomTo(view)
    const k0 = Math.min(width, height) / view[2]
    node.attr('r', 0).transition().delay((d) => d.depth * 110 + Math.random() * 160).duration(650).ease(d3.easeBackOut.overshoot(1.2)).attr('r', (d) => d.r * k0)

    api.current = {
      zoomToPath: (p) => {
        const target = root.descendants().find((n) => n.data.path === p && n.children) as HNode | undefined
        if (target) zoom(target, 1000)
      },
      recolor: (m, q) => {
        const ql = q.trim().toLowerCase()
        node.transition('color').duration(400)
          .attr('fill', (d) => (d.children ? `rgba(139,123,255,${0.03 + Math.min(d.depth, 6) * 0.018})` : fileFill(d, m)))
          .attr('fill-opacity', (d) => (d.children ? 1 : !ql || d.data.path.toLowerCase().includes(ql) ? 0.9 : 0.08))
          .attr('filter', (d) => (!d.children && ql && d.data.path.toLowerCase().includes(ql) ? 'url(#mglow)' : null))
      },
    }

    if (focus) setTimeout(() => api.current?.zoomToPath(focus), 900)

    const ro = new ResizeObserver(() => {
      width = wrap.clientWidth; height = wrap.clientHeight
      svg.attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
      zoomTo(view)
    })
    ro.observe(wrap)
    return () => { ro.disconnect(); svg.interrupt() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a])

  useEffect(() => { api.current?.recolor(mode, query) }, [mode, query])

  const tipFile = tip?.d.data.file
  const tipParsed = tipFile ? a.parsed[tipFile.path] : null

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg ref={svgRef} />

      <div className="float-panel" style={{ top: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 'calc(100% - 32px)' }}>
        <div className="crumbs">
          <button onClick={() => api.current?.zoomToPath('')}>{a.meta.name}</button>
          {crumbs.map((c) => (
            <span key={c} style={{ display: 'contents' }}>
              <span className="faint">/</span>
              <button onClick={() => api.current?.zoomToPath(c)}>{c.split('/').pop()}</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="seg">
            <button className={mode === 'layer' ? 'on' : ''} onClick={() => setMode('layer')}>By role</button>
            <button className={mode === 'language' ? 'on' : ''} onClick={() => setMode('language')}>By language</button>
          </div>
          <label className="search-mini"><Search width={13} height={13} /><input placeholder="highlight files…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        </div>
      </div>

      <div className="float-panel" style={{ bottom: 16, left: 16 }}>
        {mode === 'layer'
          ? LAYERS.filter((l) => a.layerCounts[l.id]).map((l) => (
              <div key={l.id} className="legend-item"><span className="dot" style={{ background: l.color }} />{l.label}<span className="faint" style={{ marginLeft: 'auto', paddingLeft: 12 }}>{a.layerCounts[l.id]}</span></div>
            ))
          : langs.map(([l, n]) => (
              <div key={l} className="legend-item"><span className="dot" style={{ background: langColor(l) }} />{l}<span className="faint" style={{ marginLeft: 'auto', paddingLeft: 12 }}>{n}</span></div>
            ))}
      </div>

      <div className="float-panel kbd-hint" style={{ bottom: 16, right: 16 }}>
        Click a folder to dive in · click empty space to zoom out · click a file to inspect
      </div>

      {tip && (
        <div className="tooltip" style={{ left: Math.min(tip.x + 14, (wrapRef.current?.clientWidth ?? 0) - 330), top: tip.y + 14 }}>
          <div className="tt-path">{tip.d.data.path || a.meta.name}</div>
          {tipFile ? (
            <div className="muted" style={{ marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: LAYER_BY_ID[tipFile.layer].color }}>{LAYER_BY_ID[tipFile.layer].label}</span>
              <span>{tipFile.lang}</span>
              <span>{(tipFile.size / 1024).toFixed(1)} KB</span>
              {tipParsed && <span>{tipParsed.lines} lines</span>}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 4 }}>{tip.d.leaves().length} files · {((tip.d.value ?? 0) / 1024).toFixed(0)} KB</div>
          )}
        </div>
      )}
    </div>
  )
}
