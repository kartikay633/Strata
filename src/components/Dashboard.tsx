import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { Analysis } from '../lib/types'
import { AIKeyButton } from './AI'
import AskView from './AskView'
import GraphView from './GraphView'
import { Circles, Github, Graph, Grid, Home, Layers, Logo, Route, Search } from './Icons'
import Inspector from './Inspector'
import LayersView from './LayersView'
import MapView from './MapView'
import Overview from './Overview'
import TourView from './TourView'

export type Tab = 'overview' | 'map' | 'graph' | 'layers' | 'tour' | 'ask'

const TABS: { id: Tab; label: string; icon: typeof Grid }[] = [
  { id: 'overview', label: 'Overview', icon: Grid },
  { id: 'map', label: 'Map', icon: Circles },
  { id: 'graph', label: 'Graph', icon: Graph },
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'tour', label: 'Tour', icon: Route },
  { id: 'ask', label: 'Ask', icon: Search },
]

export interface Nav {
  open: (path: string, line?: number) => void
  go: (tab: Tab, focus?: string) => void
}

export default function Dashboard({ a, onHome }: { a: Analysis; onHome: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [focus, setFocus] = useState<string | undefined>()
  const [inspect, setInspect] = useState<{ path: string; line?: number } | null>(null)

  const nav: Nav = {
    open: (path, line) => setInspect({ path, line }),
    go: (t, f) => { setFocus(f); setTab(t); setInspect(null) },
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Escape') setInspect(null)
      const n = Number(e.key)
      if (n >= 1 && n <= TABS.length && !e.metaKey && !e.ctrlKey) { setTab(TABS[n - 1].id); setFocus(undefined) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const full = tab === 'map' || tab === 'graph'

  return (
    <div className="dash">
      <header className="topbar">
        <button className="repo-id" onClick={onHome} title="Analyze another repo" style={{ textAlign: 'left' }}>
          <Logo />
          <img src={a.meta.avatar} alt="" />
          <div style={{ minWidth: 0 }}>
            <div className="nm">{a.meta.owner}/<span style={{ color: '#c9c2ff' }}>{a.meta.name}</span></div>
            <div className="faint mono" style={{ fontSize: 11 }}>{a.meta.branch}</div>
          </div>
        </button>
        <nav className="tabs">
          {TABS.map((t, i) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setFocus(undefined) }}>
              {tab === t.id && <motion.div layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <t.icon width={15} height={15} /> {t.label} <kbd>{i + 1}</kbd>
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', gap: 8 }}>
          <AIKeyButton />
          <a className="ghost-btn" href={a.meta.url} target="_blank" rel="noreferrer"><Github width={14} height={14} /> GitHub</a>
          <button className="ghost-btn" onClick={onHome}><Home width={14} height={14} /> New</button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main
          key={tab + (focus ?? '')}
          className={`view ${full ? 'full' : ''}`}
          initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {tab === 'overview' && <Overview a={a} nav={nav} />}
          {tab === 'map' && <MapView a={a} nav={nav} focus={focus} />}
          {tab === 'graph' && <GraphView a={a} nav={nav} focus={focus} />}
          {tab === 'layers' && <LayersView a={a} nav={nav} />}
          {tab === 'tour' && <TourView a={a} nav={nav} />}
          {tab === 'ask' && <AskView a={a} nav={nav} />}
        </motion.main>
      </AnimatePresence>

      <AnimatePresence>
        {inspect && <Inspector key="insp" a={a} path={inspect.path} line={inspect.line} nav={nav} onClose={() => setInspect(null)} />}
      </AnimatePresence>
    </div>
  )
}
