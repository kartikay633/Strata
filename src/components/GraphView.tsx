import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LAYERS, LAYER_BY_ID } from '../lib/knowledge'
import type { Analysis, GraphNode, LayerId } from '../lib/types'
import type { Nav } from './Dashboard'
import { Search } from './Icons'

type SimNode = GraphNode & d3.SimulationNodeDatum & { r: number }
type SimLink = d3.SimulationLinkDatum<SimNode>
type Layout = 'force' | 'clusters'

export default function GraphView({ a, nav, focus }: { a: Analysis; nav: Nav; focus?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hidden, setHidden] = useState<Set<LayerId>>(new Set())
  const [layout, setLayout] = useState<Layout>('force')
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<{ x: number; y: number; n: SimNode } | null>(null)
  const [selected, setSelected] = useState<string | null>(focus ?? null)
  const [isolated, setIsolated] = useState(false)
  const selectedRef = useRef<string | null>(focus ?? null)
  const api = useRef<{ highlight: (id: string | null) => void; search: (q: string) => void } | null>(null)

  const present = useMemo(() => LAYERS.filter((l) => a.nodes.some((n) => n.layer === l.id)), [a.nodes])

  useEffect(() => {
    if (!wrapRef.current || !svgRef.current) return
    const wrap = wrapRef.current
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const width = wrap.clientWidth, height = wrap.clientHeight

    const nodes: SimNode[] = a.nodes
      .filter((n) => !hidden.has(n.layer) && (isolated || n.inDeg + n.outDeg > 0))
      .map((n) => ({ ...n, r: 3.5 + Math.sqrt(n.inDeg) * 2.6 }))
    const ids = new Set(nodes.map((n) => n.id))
    const links: SimLink[] = a.links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ source: l.source, target: l.target }))

    const groups = [...new Set(nodes.map((n) => n.group))]
    const layerOrder = LAYERS.map((l) => l.id)
    const angle = (g: string) => (groups.indexOf(g) / Math.max(groups.length, 1)) * Math.PI * 2
    const ring = Math.min(width, height) * 0.32

    const defs = svg.append('defs')
    defs.append('marker').attr('id', 'arrow').attr('viewBox', '0 -4 8 8').attr('refX', 8).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-3.5L8,0L0,3.5').attr('fill', 'rgba(200,210,230,0.7)')
    const glow = defs.append('filter').attr('id', 'gglow').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%')
    glow.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'b')
    const m = glow.append('feMerge'); m.append('feMergeNode').attr('in', 'b'); m.append('feMergeNode').attr('in', 'SourceGraphic')

    const root = svg.append('g')
    const zoomB = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.15, 6]).on('zoom', (e) => root.attr('transform', e.transform))
    svg.call(zoomB).on('dblclick.zoom', null)
    svg.call(zoomB.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.9))

    const hullG = root.append('g')
    const linkG = root.append('g')
    const flowG = root.append('g')
    const nodeG = root.append('g')
    const labelG = root.append('g')

    const link = linkG.selectAll('line').data(links).join('line')
      .attr('stroke', 'rgba(148,163,184,0.16)').attr('stroke-width', 0.8)

    const node = nodeG.selectAll<SVGCircleElement, SimNode>('circle').data(nodes, (d) => d.id).join('circle')
      .attr('r', 0)
      .attr('fill', (d) => LAYER_BY_ID[d.layer].color)
      .attr('stroke', '#07080d').attr('stroke-width', 1.5)
      .style('cursor', 'pointer')

    node.transition().delay((_, i) => 200 + i * 3).duration(600).ease(d3.easeBackOut).attr('r', (d) => d.r)

    const label = labelG.selectAll<SVGTextElement, SimNode>('text').data(nodes.filter((n) => n.inDeg >= 3 || n.r > 9)).join('text')
      .text((d) => d.id.split('/').pop()!)
      .attr('font-size', 10).attr('font-family', 'JetBrains Mono, monospace').attr('fill', '#cfd5e3')
      .attr('text-anchor', 'middle').attr('dy', (d) => -d.r - 5)
      .style('pointer-events', 'none').style('paint-order', 'stroke').style('stroke', '#07080d').style('stroke-width', 3)
      .attr('opacity', 0)
    label.transition().delay(1200).duration(600).attr('opacity', 0.85)

    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(layout === 'clusters' ? 26 : 46).strength(layout === 'clusters' ? 0.15 : 0.35))
      .force('charge', d3.forceManyBody().strength(layout === 'clusters' ? -40 : -90).distanceMax(380))
      .force('collide', d3.forceCollide<SimNode>().radius((d) => d.r + 2))

    if (layout === 'clusters') {
      sim.force('x', d3.forceX<SimNode>((d) => Math.cos(angle(d.group)) * ring).strength(0.18))
        .force('y', d3.forceY<SimNode>((d) => Math.sin(angle(d.group)) * ring).strength(0.18))
    } else {
      const bandH = Math.min(height, 900) / (present.length + 1)
      sim.force('y', d3.forceY<SimNode>((d) => (layerOrder.indexOf(d.layer) - present.length / 2) * bandH * 0.55).strength(0.05))
        .force('x', d3.forceX(0).strength(0.03))
    }

    // group hulls for cluster layout
    const drawHulls = () => {
      if (layout !== 'clusters') { hullG.selectAll('*').remove(); return }
      const data = groups.map((g) => {
        const pts = nodes.filter((n) => n.group === g).map((n) => [n.x!, n.y!] as [number, number])
        return { g, pts }
      }).filter((d) => d.pts.length >= 3)
      const hull = hullG.selectAll<SVGGElement, (typeof data)[number]>('g').data(data, (d) => d.g).join((enter) => {
        const gg = enter.append('g')
        gg.append('path').attr('fill', 'rgba(139,123,255,0.05)').attr('stroke', 'rgba(139,123,255,0.25)').attr('stroke-dasharray', '3 4').attr('stroke-linejoin', 'round').attr('stroke-width', 26)
        gg.append('text').attr('fill', '#8b93a7').attr('font-size', 12).attr('font-weight', 600).attr('text-anchor', 'middle')
        return gg
      })
      hull.select('path').attr('d', (d) => { const h = d3.polygonHull(d.pts); return h ? `M${h.join('L')}Z` : '' })
        .attr('stroke-opacity', 0.35).attr('fill-opacity', 1).style('stroke', 'rgba(139,123,255,0.12)')
      hull.select('text').text((d) => d.g + '/').attr('x', (d) => d3.mean(d.pts, (p) => p[0])!).attr('y', (d) => d3.min(d.pts, (p) => p[1])! - 22)
    }

    let tickN = 0
    sim.on('tick', () => {
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y).attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y)
      node.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!)
      label.attr('x', (d) => d.x!).attr('y', (d) => d.y!)
      if (tickN++ % 4 === 0) drawHulls()
    })

    // drag
    node.call(d3.drag<SVGCircleElement, SimNode>()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }))

    // adjacency
    const out = new Map<string, Set<string>>(), inc = new Map<string, Set<string>>()
    for (const l of links) {
      const s = typeof l.source === 'string' ? l.source : (l.source as SimNode).id
      const t = typeof l.target === 'string' ? l.target : (l.target as SimNode).id
      if (!out.has(s)) out.set(s, new Set()); out.get(s)!.add(t)
      if (!inc.has(t)) inc.set(t, new Set()); inc.get(t)!.add(s)
    }

    let flowTimer: d3.Timer | null = null
    const highlight = (id: string | null) => {
      flowTimer?.stop(); flowG.selectAll('*').remove()
      if (!id) {
        node.transition('h').duration(250).attr('opacity', 1).attr('filter', null)
        link.transition('h').duration(250).attr('stroke', 'rgba(148,163,184,0.16)').attr('stroke-width', 0.8).attr('opacity', 1).attr('marker-end', null)
        label.transition('h').duration(250).attr('opacity', 0.85)
        return
      }
      const o = out.get(id) ?? new Set(), i = inc.get(id) ?? new Set()
      const near = (n: string) => n === id || o.has(n) || i.has(n)
      node.transition('h').duration(250).attr('opacity', (d) => (near(d.id) ? 1 : 0.08)).attr('filter', (d) => (d.id === id ? 'url(#gglow)' : null))
      label.transition('h').duration(250).attr('opacity', (d) => (near(d.id) ? 1 : 0.05))
      link.transition('h').duration(250)
        .attr('opacity', (d: any) => (d.source.id === id || d.target.id === id ? 1 : 0.03))
        .attr('stroke', (d: any) => (d.source.id === id ? '#38e1c6' : d.target.id === id ? '#ff7ab6' : 'rgba(148,163,184,0.16)'))
        .attr('stroke-width', (d: any) => (d.source.id === id || d.target.id === id ? 1.6 : 0.8))
        .attr('marker-end', (d: any) => (d.source.id === id || d.target.id === id ? 'url(#arrow)' : null))

      // flowing particles along edges: import direction
      const active = links.filter((l: any) => l.source.id === id || l.target.id === id) as any[]
      const parts = flowG.selectAll('circle').data(active.flatMap((l, k) => [0, 0.5].map((off) => ({ l, off: off + (k % 7) * 0.07 })))).join('circle')
        .attr('r', 2.2).attr('fill', (d) => (d.l.source.id === id ? '#38e1c6' : '#ff7ab6')).attr('filter', 'url(#gglow)')
      flowTimer = d3.timer((el) => {
        parts.each(function (d) {
          const t = ((el / 1400) + d.off) % 1
          d3.select(this).attr('cx', d.l.source.x + (d.l.target.x - d.l.source.x) * t).attr('cy', d.l.source.y + (d.l.target.y - d.l.source.y) * t)
        })
      })
    }

    node.on('mouseenter', (e, d) => {
      const r = wrap.getBoundingClientRect()
      setHover({ x: e.clientX - r.left, y: e.clientY - r.top, n: d })
      if (!selectedRef.current) highlight(d.id)
    }).on('mouseleave', () => {
      setHover(null)
      if (!selectedRef.current) highlight(null)
    }).on('click', (e, d) => {
      e.stopPropagation()
      if (selectedRef.current === d.id) nav.open(d.id)
      else { selectedRef.current = d.id; setSelected(d.id); highlight(d.id) }
    })
    svg.on('click', () => { selectedRef.current = null; setSelected(null); highlight(null) })

    api.current = {
      highlight,
      search: (q) => {
        const ql = q.trim().toLowerCase()
        if (!ql) { highlight(selectedRef.current); return }
        node.transition('h').duration(250).attr('opacity', (d) => (d.id.toLowerCase().includes(ql) ? 1 : 0.06)).attr('filter', (d) => (d.id.toLowerCase().includes(ql) ? 'url(#gglow)' : null))
        link.transition('h').duration(250).attr('opacity', 0.03)
        label.transition('h').duration(250).attr('opacity', (d) => (d.id.toLowerCase().includes(ql) ? 1 : 0.04))
      },
    }

    if (selectedRef.current && ids.has(selectedRef.current)) {
      const id = selectedRef.current
      setTimeout(() => {
        highlight(id)
        const n = nodes.find((x) => x.id === id)
        if (n?.x != null) svg.transition().duration(900).call(zoomB.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(1.6).translate(-n.x, -n.y!))
      }, 1500)
    }

    return () => { sim.stop(); flowTimer?.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, hidden, layout, isolated])

  useEffect(() => { api.current?.search(query) }, [query])

  const sel = selected ? a.nodes.find((n) => n.id === selected) : null
  const selParsed = selected ? a.parsed[selected] : null
  const importers = selected ? a.links.filter((l) => l.target === selected).map((l) => l.source) : []

  if (a.nodes.length === 0 || a.links.length === 0) {
    return <div className="empty" style={{ margin: 'auto' }}>No internal imports were detected, so there is no dependency graph to draw for this repo.</div>
  }

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg ref={svgRef} />

      <div className="float-panel" style={{ top: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 10, width: 230 }}>
        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button className={layout === 'force' ? 'on' : ''} onClick={() => setLayout('force')}>Organic</button>
          <button className={layout === 'clusters' ? 'on' : ''} onClick={() => setLayout('clusters')}>By folder</button>
        </div>
        <label className="search-mini"><Search width={13} height={13} /><input placeholder="find a file…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%' }} /></label>
        <div>
          {present.map((l) => (
            <div key={l.id} className={`legend-item ${hidden.has(l.id) ? 'off' : ''}`} onClick={() => setHidden((h) => { const n = new Set(h); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })}>
              <span className="dot" style={{ background: l.color }} />{l.label}
              <span className="faint" style={{ marginLeft: 'auto' }}>{a.nodes.filter((n) => n.layer === l.id).length}</span>
            </div>
          ))}
        </div>
        <label className="kbd-hint" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={isolated} onChange={(e) => setIsolated(e.target.checked)} /> show unconnected files
        </label>
      </div>

      {sel && (
        <div className="float-panel" style={{ top: 16, right: 16, width: 300 }}>
          <div className="mono" style={{ fontWeight: 600, fontSize: 12.5, wordBreak: 'break-all' }}>{sel.id}</div>
          <div style={{ display: 'flex', gap: 10, fontSize: 12, margin: '8px 0' }}>
            <span style={{ color: LAYER_BY_ID[sel.layer].color }}>{LAYER_BY_ID[sel.layer].label}</span>
            <span className="muted">{selParsed?.lines} lines</span>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
            <span><span style={{ color: '#38e1c6' }}>●</span> imports {sel.outDeg}</span>
            <span><span style={{ color: '#ff7ab6' }}>●</span> used by {sel.inDeg}</span>
          </div>
          {importers.length > 0 && <div className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>Used by {importers.slice(0, 3).map((p) => p.split('/').pop()).join(', ')}{importers.length > 3 ? ` +${importers.length - 3}` : ''}</div>}
          <button className="btn-primary" style={{ marginTop: 12, padding: '8px 14px', fontSize: 12.5 }} onClick={() => nav.open(sel.id)}>Inspect file →</button>
        </div>
      )}

      <div className="float-panel kbd-hint" style={{ bottom: 16, right: 16 }}>
        <span style={{ color: '#38e1c6' }}>●</span> imports &nbsp; <span style={{ color: '#ff7ab6' }}>●</span> imported by · bigger = more depended on · click to pin, click again to inspect · scroll to zoom, drag nodes
      </div>

      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth ?? 0) - 330), top: hover.y + 14 }}>
          <div className="tt-path">{hover.n.id}</div>
          <div className="muted" style={{ marginTop: 4 }}>imports {hover.n.outDeg} · used by {hover.n.inDeg}</div>
        </div>
      )}
    </div>
  )
}
