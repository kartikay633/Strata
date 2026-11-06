import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import Constellation from './Constellation'
import { ArrowRight, Circles, Graph, Layers, Logo, Route, Search } from './Icons'

const EXAMPLES = ['expressjs/express', 'pmndrs/zustand', 'pallets/flask', 'gin-gonic/gin', 'shadcn-ui/taxonomy']

const FEATURES = [
  { icon: Circles, color: '#a78bfa', title: 'Living map', text: 'Zoom through every folder and file as nested bubbles.' },
  { icon: Graph, color: '#38bdf8', title: 'Import graph', text: 'See which files depend on which — and find the hubs.' },
  { icon: Layers, color: '#34d399', title: 'Architecture', text: 'Files sorted into layers, with animated data flow.' },
  { icon: Route, color: '#fbbf24', title: 'Guided tour', text: 'A step-by-step reading order for a new codebase.' },
  { icon: Search, color: '#f472b6', title: 'Ask the repo', text: '“Where is auth handled?” → exact files and lines.' },
]

const word = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: (i: number) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { delay: 0.1 + i * 0.07, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] } }),
}

export default function Landing({ onSubmit, error, token, onToken }: {
  onSubmit: (v: string) => void; error: string | null; token: string; onToken: (t: string) => void
}) {
  const [value, setValue] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [draftToken, setDraftToken] = useState(token)
  const title = ['See', 'inside', 'any', 'codebase.']

  return (
    <div className="landing">
      <Constellation />
      <div className="glow" style={{ width: 520, height: 520, background: '#6d5cff', top: -160, left: -120 }} />
      <div className="glow" style={{ width: 440, height: 440, background: '#14b8a6', bottom: -180, right: -100 }} />

      <div className="landing-inner">
        <motion.div className="brand" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Logo /> Strata <span className="brand-badge">· repo explainer</span>
        </motion.div>

        <h1 className="hero-title">
          {title.map((w, i) => (
            <motion.span key={w} custom={i} variants={word} initial="hidden" animate="show" style={{ display: 'inline-block', marginRight: '0.24em' }} className={i === 3 ? 'grad-text' : ''}>
              {w}
            </motion.span>
          ))}
        </h1>
        <motion.p className="hero-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.6 }}>
          Paste a GitHub repo. Strata reads the code, traces every import, and turns it into an interactive map you can actually understand.
        </motion.p>

        <motion.form
          className="search"
          initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.6, duration: 0.5 }}
          onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value) }}
        >
          <span className="faint mono" style={{ fontSize: 15 }}>github.com/</span>
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="owner/repository" spellCheck={false} aria-label="GitHub repository" />
          <button className="btn-primary" type="submit" disabled={!value.trim()}>
            Explain <ArrowRight />
          </button>
        </motion.form>

        <AnimatePresence>
          {error && (
            <motion.div className="error-box" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div className="examples" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.8 } } }}>
          <span className="faint" style={{ fontSize: 12.5, alignSelf: 'center' }}>Try</span>
          {EXAMPLES.map((ex) => (
            <motion.button key={ex} className="chip mono" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} whileHover={{ y: -2 }} onClick={() => { setValue(ex); onSubmit(ex) }}>
              {ex}
            </motion.button>
          ))}
        </motion.div>

        <motion.div className="token-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
          {token ? 'Using your GitHub token (5,000 req/hr). ' : 'No sign-up. Public repos work out of the box. '}
          <button onClick={() => setShowToken((s) => !s)}>{token ? 'Change token' : 'Add a token for private repos'}</button>
          <AnimatePresence>
            {showToken && (
              <motion.form className="token-input" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                onSubmit={(e) => { e.preventDefault(); onToken(draftToken.trim()); setShowToken(false) }}>
                <input type="password" value={draftToken} onChange={(e) => setDraftToken(e.target.value)} placeholder="ghp_… (stored only in this browser)" />
                <button className="ghost-btn" type="submit">Save</button>
                {token && <button className="ghost-btn" type="button" onClick={() => { onToken(''); setDraftToken(''); setShowToken(false) }}>Clear</button>}
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div className="features" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 1.0 } } }}>
          {FEATURES.map((f) => (
            <motion.div key={f.title} className="feature" variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} whileHover={{ y: -4, borderColor: f.color + '66' }}>
              <div className="feature-icon" style={{ background: f.color + '1f', color: f.color }}><f.icon width={18} height={18} /></div>
              <h4>{f.title}</h4>
              <p>{f.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
