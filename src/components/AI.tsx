import Anthropic from '@anthropic-ai/sdk'
import { AnimatePresence, motion } from 'framer-motion'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { AIError, answerCache, readKey, saveKey, streamExplain } from '../lib/ai'
import type { Analysis } from '../lib/types'
import { Sparkle, X } from './Icons'

/* ---------- key hook + settings ---------- */

export function useAIKey() {
  const [key, setKey] = useState(readKey)
  useEffect(() => {
    const on = () => setKey(readKey())
    window.addEventListener('strata:key', on)
    return () => window.removeEventListener('strata:key', on)
  }, [])
  return key
}

export function AIKeyButton() {
  const key = useAIKey()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <div style={{ position: 'relative' }}>
      <button className="ghost-btn" onClick={() => { setDraft(''); setOpen((o) => !o) }} style={key ? { borderColor: 'rgba(139,123,255,0.5)', color: '#c9c2ff' } : undefined}>
        <Sparkle width={14} height={14} /> {key ? 'AI on' : 'Enable AI'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="float-panel ai-pop" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <b style={{ fontSize: 14 }}>AI explanations</b>
              <button className="faint" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)} aria-label="Close"><X width={14} height={14} /></button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
              Strata uses Claude to explain files, answer questions and brief you on the repo. Paste your own Anthropic API key. It is stored only in this browser and sent only to api.anthropic.com.
            </p>
            <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { saveKey(draft.trim()); setOpen(false) } }}>
              <input className="key-input" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={key ? '•••••••• saved — paste to replace' : 'sk-ant-…'} autoFocus />
              <button className="btn-primary" style={{ padding: '8px 14px' }} type="submit" disabled={!draft.trim()}>Save</button>
            </form>
            {key && <button className="faint" style={{ fontSize: 12, marginTop: 10, textDecoration: 'underline' }} onClick={() => { saveKey(''); setOpen(false) }}>Remove key</button>}
            <p className="faint" style={{ fontSize: 11.5, margin: '10px 0 0' }}>Get a key at console.anthropic.com. Usage is billed to your account.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------- tiny markdown renderer with clickable file paths ---------- */

function inline(text: string, isFile: (p: string) => boolean, onFile: (p: string, line?: number) => void): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<b key={m.index}>{tok.slice(2, -2)}</b>)
    else {
      const code = tok.slice(1, -1)
      const fm = code.match(/^(.+?)(?::(\d+)(?:[-–]\d+)?)?$/)
      if (fm && isFile(fm[1])) out.push(<button key={m.index} className="file-link" onClick={() => onFile(fm[1], fm[2] ? Number(fm[2]) : undefined)}>{code}</button>)
      else out.push(<code key={m.index} className="md-code">{code}</code>)
    }
    last = m.index! + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ text, a, onFile }: { text: string; a: Analysis; onFile: (p: string, line?: number) => void }) {
  const paths = new Set(a.files.map((f) => f.path))
  const isFile = (p: string) => paths.has(p.replace(/^\.\//, ''))
  const open = (p: string, l?: number) => onFile(p.replace(/^\.\//, ''), l)
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={blocks.length} className="md-list">{list.items.map((it, i) => <li key={i}>{inline(it, isFile, open)}</li>)}</Tag>)
    list = null
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('```')) {
      flush()
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      blocks.push(<pre key={blocks.length} className="md-pre">{body.join('\n')}</pre>)
      continue
    }
    const h = l.match(/^(#{1,4})\s+(.*)/)
    if (h) { flush(); blocks.push(<div key={blocks.length} className={`md-h md-h${h[1].length}`}>{inline(h[2], isFile, open)}</div>); continue }
    const li = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)/)
    if (li) {
      const ordered = /\d/.test(li[1])
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push(li[2])
      continue
    }
    if (!l.trim()) { flush(); continue }
    flush()
    blocks.push(<p key={blocks.length} className="md-p">{inline(l, isFile, open)}</p>)
  }
  flush()
  return <div className="md">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>
}

/* ---------- streaming answer card ---------- */

type State = 'idle' | 'thinking' | 'streaming' | 'done' | 'error'

export function AIAnswer({ a, cacheKey, title, prompt, effort = 'low', autoStart = false, onFile, cta = 'Explain with Claude' }: {
  a: Analysis; cacheKey: string; title: string; prompt: () => string; effort?: 'low' | 'medium'
  autoStart?: boolean; onFile: (p: string, line?: number) => void; cta?: string
}) {
  const key = useAIKey()
  const cached = answerCache.get(cacheKey)
  const [state, setState] = useState<State>(cached ? 'done' : 'idle')
  const [text, setText] = useState(cached ?? '')
  const [err, setErr] = useState<string | null>(null)
  const ctl = useRef<AbortController | null>(null)

  const run = async () => {
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    setText(''); setErr(null); setState('thinking')
    let acc = ''
    try {
      await streamExplain(a, prompt(), effort, {
        signal: c.signal,
        onText: (d) => { acc += d; setText(acc); setState('streaming') },
      })
      answerCache.set(cacheKey, acc)
      setState('done')
    } catch (e) {
      if (e instanceof Anthropic.APIUserAbortError || c.signal.aborted) return
      setErr(e instanceof AIError ? e.message : String(e))
      setState('error')
    }
  }

  useEffect(() => {
    const k = answerCache.get(cacheKey)
    setText(k ?? ''); setErr(null); setState(k ? 'done' : 'idle')
    if (!k && autoStart && readKey()) run()
    return () => ctl.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  if (!key && state === 'idle') {
    return (
      <div className="ai-card ai-empty">
        <Sparkle width={16} height={16} style={{ color: 'var(--accent)' }} />
        <span className="muted" style={{ fontSize: 13 }}>Turn on AI (top bar → <b>Enable AI</b>) to get Claude's {title.toLowerCase()}.</span>
      </div>
    )
  }

  return (
    <motion.div className={`ai-card ${state === 'thinking' || state === 'streaming' ? 'live' : ''}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="ai-head">
        <Sparkle width={15} height={15} />
        <span>{title}</span>
        <span className="faint" style={{ fontWeight: 500, fontSize: 11 }}>· Claude Opus 5.5</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {state === 'idle' && <button className="btn-primary ai-btn" onClick={run}>{cta}</button>}
          {(state === 'done' || state === 'error') && <button className="ghost-btn ai-btn" onClick={run}>Regenerate</button>}
          {(state === 'thinking' || state === 'streaming') && <button className="ghost-btn ai-btn" onClick={() => { ctl.current?.abort(); setState(text ? 'done' : 'idle') }}>Stop</button>}
        </span>
      </div>
      {state === 'thinking' && (
        <div className="ai-thinking">
          {[0, 1, 2].map((i) => <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18 }} />)}
          <span className="muted" style={{ fontSize: 12.5 }}>Reading the code…</span>
        </div>
      )}
      {text && (
        <div className="ai-body">
          <Markdown text={text} a={a} onFile={onFile} />
          {state === 'streaming' && <span className="ai-caret" />}
        </div>
      )}
      {err && <div className="error-box" style={{ margin: '10px 0 0', maxWidth: 'none' }}>{err}</div>}
    </motion.div>
  )
}
