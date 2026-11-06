import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import Dashboard from './components/Dashboard'
import Landing from './components/Landing'
import ScanScreen from './components/ScanScreen'
import { analyzeRepo } from './lib/analyze'
import { parseRepoInput } from './lib/github'
import type { Analysis, ScanProgress } from './lib/types'

type Phase = 'landing' | 'scanning' | 'ready'

const cache = new Map<string, Analysis>()

function readToken() {
  try { return localStorage.getItem('strata.token') ?? '' } catch { return '' }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('landing')
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState(readToken)
  const runId = useRef(0)

  const saveToken = (t: string) => {
    setToken(t)
    try { t ? localStorage.setItem('strata.token', t) : localStorage.removeItem('strata.token') } catch { /* ignore */ }
  }

  const start = useCallback(async (input: string) => {
    const parsed = parseRepoInput(input)
    if (!parsed) { setError('Enter a GitHub repo like "owner/name" or a github.com URL.'); return }
    setError(null)
    const key = `${parsed.owner}/${parsed.name}@${parsed.branch ?? ''}`.toLowerCase()
    const url = new URL(window.location.href)
    url.searchParams.set('repo', `${parsed.owner}/${parsed.name}${parsed.branch ? '@' + parsed.branch : ''}`)
    window.history.replaceState(null, '', url)
    if (cache.has(key)) { setAnalysis(cache.get(key)!); setPhase('ready'); return }
    const id = ++runId.current
    setPhase('scanning')
    setProgress(null)
    try {
      const result = await analyzeRepo(parsed.owner, parsed.name, parsed.branch, token || undefined, (p) => {
        if (runId.current === id) setProgress(p)
      })
      if (runId.current !== id) return
      cache.set(key, result)
      setAnalysis(result)
      setPhase('ready')
    } catch (e) {
      if (runId.current !== id) return
      setError(e instanceof Error ? e.message : String(e))
      setPhase('landing')
    }
  }, [token])

  // deep link: ?repo=owner/name
  useEffect(() => {
    const repo = new URLSearchParams(window.location.search).get('repo')
    if (repo) {
      const [r, b] = repo.split('@')
      start(b ? `https://github.com/${r}/tree/${b}` : r)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goHome = () => {
    runId.current++
    setPhase('landing')
    const url = new URL(window.location.href)
    url.searchParams.delete('repo')
    window.history.replaceState(null, '', url)
  }

  return (
    <AnimatePresence mode="wait">
      {phase === 'landing' && (
        <motion.div key="landing" exit={{ opacity: 0, scale: 0.98, filter: 'blur(6px)' }} transition={{ duration: 0.35 }}>
          <Landing onSubmit={start} error={error} token={token} onToken={saveToken} />
        </motion.div>
      )}
      {phase === 'scanning' && (
        <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }} transition={{ duration: 0.45 }}>
          <ScanScreen progress={progress} onCancel={goHome} />
        </motion.div>
      )}
      {phase === 'ready' && analysis && (
        <motion.div key="dash" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
          <Dashboard a={analysis} onHome={goHome} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
