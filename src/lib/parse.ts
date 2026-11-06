import type { ParsedFile } from './types'

/* ---------- path helpers ---------- */

export function dirname(p: string) {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

export function joinPath(base: string, rel: string) {
  const parts = (base ? base.split('/') : []).concat(rel.split('/'))
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/* ---------- raw import extraction ---------- */

interface RawImports {
  specs: string[]
  kind: 'js' | 'py' | 'go' | 'rust' | 'jvm' | 'c' | 'ruby' | 'php' | 'css' | 'none'
}

function matchAll(src: string, re: RegExp, group = 1) {
  const out: string[] = []
  for (const m of src.matchAll(re)) if (m[group]) out.push(m[group])
  return out
}

/**
 * Blank out comments and the *contents* of string literals, keeping every character's offset.
 * Matching runs on the masked text (so `// import x from './a'` or `"require('./b')"` never match);
 * specifiers are then read back from the original text at the same offsets.
 */
export function maskC(src: string): string {
  const out = src.split('')
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') out[i++] = ' '; continue }
    if (c === '/' && d === '*') {
      out[i] = out[i + 1] = ' '; i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] !== '\n') out[i] = ' '; i++ }
      if (i < n) { out[i] = out[i + 1] = ' '; i += 2 }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      i++
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out[i++] = '_'; if (i < n && src[i] !== '\n') out[i++] = '_'; continue }
        if (src[i] === '\n') { if (q !== '`') break; i++; continue }
        out[i++] = '_'
      }
      i++
      continue
    }
    i++
  }
  return out.join('')
}

/** Python: blank out `#` comments and all string literals (including triple-quoted docstrings). */
export function maskPy(src: string): string {
  const out = src.split('')
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === '#') { while (i < n && src[i] !== '\n') out[i++] = ' '; continue }
    if (c === '"' || c === "'") {
      const triple = src.startsWith(c.repeat(3), i)
      const q = triple ? c.repeat(3) : c
      for (let k = 0; k < q.length; k++) out[i++] = ' '
      while (i < n && !src.startsWith(q, i)) {
        if (src[i] === '\\') { out[i++] = ' '; if (i < n && src[i] !== '\n') out[i++] = ' '; continue }
        if (!triple && src[i] === '\n') break
        if (src[i] !== '\n') out[i] = ' '
        i++
      }
      if (src.startsWith(q, i)) for (let k = 0; k < q.length; k++) out[i++] = ' '
      continue
    }
    i++
  }
  return out.join('')
}

/** Run `re` on masked text; return group 1 as it appears in the original text. */
function specsAt(original: string, masked: string, re: RegExp): string[] {
  const out: string[] = []
  const withIdx = new RegExp(re.source, re.flags.includes('d') ? re.flags : re.flags + 'd')
  for (const m of masked.matchAll(withIdx)) {
    const span = m.indices?.[1]
    if (span) out.push(original.slice(span[0], span[1]))
  }
  return out
}

export function extractImports(path: string, ext: string, src: string): RawImports {
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs': case 'cjs': case 'mts': case 'cts':
    case 'vue': case 'svelte': case 'astro':
    {
      const masked = maskC(src)
      return {
        kind: 'js',
        specs: [
          ...specsAt(src, masked, /(?:^|[\s;}])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]/g),
          ...specsAt(src, masked, /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g),
          ...specsAt(src, masked, /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g),
        ],
      }
    }
    case 'py': case 'pyi': {
      // Specs are encoded as `from:<module>:<name,name>` or `import:<module>` for the resolver.
      const masked = maskPy(src).replace(/\\\n/g, '  ')
      const specs: string[] = []
      // names run to end of line, or across lines when parenthesised
      for (const m of masked.matchAll(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(\([^)]*\)|[^\n;]+)/gm)) {
        const names = m[2].replace(/[()]/g, '').split(',').map((n) => n.trim().split(/\s+/)[0]).filter((n) => n && n !== '*')
        specs.push(`from:${m[1]}:${names.join(',')}`)
      }
      for (const m of masked.matchAll(/^[ \t]*import[ \t]+([\w., \t]+)/gm))
        for (const n of m[1].split(',')) { const mod = n.trim().split(/\s+/)[0]; if (mod) specs.push(`import:${mod}`) }
      return { kind: 'py', specs }
    }
    case 'go': {
      const masked = maskC(src)
      const specs = specsAt(src, masked, /^\s*import\s+(?:[\w.]+\s+)?"([^"\n]+)"/gm)
      for (const block of masked.matchAll(/(?:^|\n)\s*import\s*\(([\s\S]*?)\)/gd)) {
        const [s0, s1] = block.indices![1]
        specs.push(...specsAt(src.slice(s0, s1), block[1], /"([^"\n]+)"/g))
      }
      return { kind: 'go', specs }
    }
    case 'rs':
      return {
        kind: 'rust',
        specs: [
          ...matchAll(maskC(src), /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm).map((m) => `mod:${m}`),
          ...matchAll(maskC(src), /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+((?:crate|super|self)::[\w:]+)/gm),
        ],
      }
    case 'java': case 'kt': case 'kts': case 'scala':
      return { kind: 'jvm', specs: matchAll(maskC(src), /^\s*import\s+(?:static\s+)?([\w.]+)/gm) }
    case 'c': case 'h': case 'cpp': case 'cc': case 'hpp': case 'hh': case 'cxx':
      return { kind: 'c', specs: specsAt(src, maskC(src), /^\s*#\s*include\s+"([^"\n]+)"/gm) }
    case 'rb':
      return { kind: 'ruby', specs: [...matchAll(src, /require_relative\s+['"]([^'"]+)['"]/g).map((s) => `./${s}`), ...matchAll(src, /\brequire\s+['"]([^'"]+)['"]/g)] }
    case 'php':
      return { kind: 'php', specs: matchAll(src, /(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+)['"]/g) }
    case 'css': case 'scss': case 'sass': case 'less':
      return { kind: 'css', specs: specsAt(src, maskC(src), /@(?:import|use|forward)\s+(?:url\()?['"]([^'"\n]+)['"]/g) }
    default:
      return { kind: 'none', specs: [] }
  }
}

/* ---------- symbols ---------- */

const SYMBOL_RULES: { exts: string[]; re: RegExp; kind: string }[] = [
  { exts: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'vue', 'svelte'], re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/gm, kind: 'fn' },
  { exts: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts'], re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/gm, kind: 'class' },
  { exts: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts'], re: /^\s*export\s+(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/gm, kind: 'fn' },
  { exts: ['ts', 'tsx', 'mts'], re: /^\s*(?:export\s+)?(?:interface|type)\s+(\w+)/gm, kind: 'type' },
  { exts: ['py', 'pyi'], re: /^(?:async\s+)?def\s+(\w+)/gm, kind: 'fn' },
  { exts: ['py', 'pyi'], re: /^class\s+(\w+)/gm, kind: 'class' },
  { exts: ['go'], re: /^func\s+(?:\([^)]*\)\s*)?(\w+)/gm, kind: 'fn' },
  { exts: ['go'], re: /^type\s+(\w+)\s+(?:struct|interface)/gm, kind: 'type' },
  { exts: ['rs'], re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/gm, kind: 'fn' },
  { exts: ['rs'], re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait)\s+(\w+)/gm, kind: 'type' },
  { exts: ['java', 'kt', 'scala', 'cs'], re: /^\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:abstract\s+|final\s+|data\s+|sealed\s+|open\s+)*(?:class|interface|object|enum|record)\s+(\w+)/gm, kind: 'class' },
  { exts: ['rb'], re: /^\s*def\s+(?:self\.)?(\w+[?!]?)/gm, kind: 'fn' },
  { exts: ['rb'], re: /^\s*(?:class|module)\s+([\w:]+)/gm, kind: 'class' },
  { exts: ['php'], re: /^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?function\s+(\w+)/gm, kind: 'fn' },
  { exts: ['c', 'cpp', 'cc', 'h', 'hpp'], re: /^[\w\s*&:<>]+?\b(\w+)\s*\([^;{]*\)\s*\{/gm, kind: 'fn' },
]

export function extractSymbols(ext: string, src: string) {
  const out: { kind: string; name: string; line: number }[] = []
  const seen = new Set<string>()
  for (const rule of SYMBOL_RULES) {
    if (!rule.exts.includes(ext)) continue
    for (const m of src.matchAll(rule.re)) {
      const name = m[1]
      if (!name || seen.has(name) || ['if', 'for', 'while', 'switch', 'return', 'main'].includes(name) && rule.kind !== 'fn') continue
      seen.add(name)
      const line = src.slice(0, m.index ?? 0).split('\n').length + (m[0].startsWith('\n') ? 1 : 0)
      out.push({ kind: rule.kind, name, line })
    }
  }
  return out.sort((a, b) => a.line - b.line).slice(0, 80)
}

/* ---------- resolution ---------- */

const JS_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.vue', '.svelte', '.d.ts', '.json', '.css', '.scss']
const JS_INDEX = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs', 'index.vue', 'index.d.ts']

export interface ResolveCtx {
  files: Set<string>
  byBasename: Map<string, string[]>
  goModule: string | null
  jsAliases: { prefix: string; target: string }[]
  pyRoots: string[]
  pyTops: Set<string>
  /** every Python module/package name anywhere in the repo (fixture apps added to sys.path, etc.) */
  pyAnywhere?: Set<string>
  dirFiles: Map<string, string[]>
}

function tryJs(ctx: ResolveCtx, base: string): string | null {
  for (const e of JS_EXTS) if (ctx.files.has(base + e)) return base + e
  // TS ESM style: import './foo.js' that is really foo.ts
  const stripped = base.replace(/\.(m|c)?js$/, '')
  if (stripped !== base) for (const e of ['.ts', '.tsx', '.mts', '.cts']) if (ctx.files.has(stripped + e)) return stripped + e
  // directory import, including the repo root itself (`require('../..')`)
  const dir = base ? base + '/' : ''
  for (const i of JS_INDEX) if (ctx.files.has(dir + i)) return dir + i
  return null
}

// Standard-library modules: imported like packages, but not dependencies worth listing.
const NODE_BUILTINS = new Set(('assert async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns domain events fs http http2 https inspector module net os path perf_hooks process punycode querystring readline repl stream string_decoder sys timers tls trace_events tty url util v8 vm wasi worker_threads zlib').split(' '))
const PY_STDLIB = new Set(('__future__ _typeshed rlcompleter __builtin__ StringIO cStringIO cPickle BaseHTTPServer SimpleHTTPServer CGIHTTPServer httplib urllib2 urlparse Queue ConfigParser cookielib Cookie HTMLParser htmlentitydefs xmlrpclib thread dummy_thread commands exceptions sets md5 sha abc argparse array ast asyncio atexit base64 binascii bisect builtins bz2 calendar cgi cmath code codecs collections colorsys concurrent configparser contextlib contextvars copy copyreg csv ctypes dataclasses datetime decimal difflib dis email encodings enum errno faulthandler fcntl filecmp fileinput fnmatch fractions ftplib functools gc getopt getpass gettext glob graphlib gzip hashlib heapq hmac html http imaplib importlib inspect io ipaddress itertools json keyword linecache locale logging lzma mailbox math mimetypes mmap multiprocessing netrc numbers operator optparse os pathlib pdb pickle pkgutil platform plistlib poplib posixpath pprint profile pstats pty pwd queue quopri random re readline reprlib resource runpy sched secrets select selectors shelve shlex shutil signal site smtplib socket socketserver sqlite3 ssl stat statistics string stringprep struct subprocess sys sysconfig tarfile tempfile termios textwrap threading time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty types typing typing_extensions unicodedata unittest urllib uuid venv warnings wave weakref webbrowser winreg wsgiref xml xmlrpc zipfile zipimport zlib zoneinfo').split(' '))

function packageName(spec: string) {
  if (spec.startsWith('node:')) return spec
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/** Resolve a dotted Python module (absolute or relative to `dir`) to a file in the repo. */
function pyModule(mod: string, dir: string, ctx: ResolveCtx): string | null {
  const tryBase = (cand: string) => [cand + '.py', cand + '.pyi', cand + '/__init__.py'].find((c) => ctx.files.has(c)) ?? null
  if (mod.startsWith('.')) {
    const dots = mod.match(/^\.+/)![0].length
    const parts = dir ? dir.split('/') : []
    if (dots - 1 > parts.length) return null
    const base = parts.slice(0, parts.length - (dots - 1)).join('/')
    const rel = mod.slice(dots).replace(/\./g, '/')
    if (rel) return tryBase(joinPath(base, rel))
    return base && ctx.files.has(base + '/__init__.py') ? base + '/__init__.py' : null
  }
  const rel = mod.replace(/\./g, '/')
  for (const root of ctx.pyRoots) {
    const hit = tryBase(joinPath(root, rel))
    if (hit) return hit
  }
  return null
}

export function resolveImports(path: string, raw: RawImports, ctx: ResolveCtx) {
  const dir = dirname(path)
  const internal = new Set<string>()
  const external = new Set<string>()

  for (const spec of raw.specs) {
    let hit: string | null = null
    switch (raw.kind) {
      case 'js':
      case 'css': {
        if (spec.startsWith('.') || spec.startsWith('/')) {
          hit = tryJs(ctx, spec.startsWith('/') ? joinPath('', spec) : joinPath(dir, spec))
        } else {
          for (const a of ctx.jsAliases) {
            if (spec.startsWith(a.prefix)) {
              hit = tryJs(ctx, joinPath(a.target, spec.slice(a.prefix.length)))
              if (hit) break
            }
          }
          if (!hit && raw.kind === 'css') hit = tryJs(ctx, joinPath(dir, spec)) ?? tryJs(ctx, joinPath(dir, '_' + spec))
          if (!hit && raw.kind === 'js' && !spec.startsWith('#') && !spec.startsWith('node:') && !NODE_BUILTINS.has(spec.split('/')[0])) external.add(packageName(spec))
        }
        break
      }
      case 'py': {
        const [form, mod, names = ''] = spec.split(':')
        const modHit = pyModule(mod, dir, ctx)
        if (form === 'from') {
          // `from pkg import name`: link to pkg/name.py when name is a submodule, else to pkg itself
          let attrImport = !names
          for (const name of names.split(',').filter(Boolean)) {
            const sub = pyModule(mod.endsWith('.') ? mod + name : `${mod}.${name}`, dir, ctx)
            if (sub) { if (sub !== path) internal.add(sub) }
            else attrImport = true
          }
          if (attrImport && modHit) hit = modHit
        } else hit = modHit
        if (!modHit && !mod.startsWith('.')) {
          const top = mod.split('.')[0]
          if (top && !ctx.pyTops.has(top) && !PY_STDLIB.has(top) && !ctx.pyAnywhere?.has(top)) external.add(top)
        }
        break
      }
      case 'go': {
        if (ctx.goModule && spec.startsWith(ctx.goModule)) {
          const pkgDir = spec.slice(ctx.goModule.length).replace(/^\//, '')
          const inDir = (ctx.dirFiles.get(pkgDir) ?? []).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go')).sort()
          if (inDir.length) hit = inDir[0]
        } else if (spec.includes('.')) external.add(spec.split('/').slice(0, 3).join('/'))
        break
      }
      case 'rust': {
        if (spec.startsWith('mod:')) {
          const name = spec.slice(4)
          const base = /(^|\/)(main|lib|mod)\.rs$/.test(path) ? dir : joinPath(dir, path.split('/').pop()!.replace(/\.rs$/, ''))
          const cand = [joinPath(base, name + '.rs'), joinPath(base, name + '/mod.rs')]
          hit = cand.find((c) => ctx.files.has(c)) ?? null
        } else if (spec.startsWith('crate::')) {
          const segs = spec.slice(7).split('::')
          const crateRoot = path.includes('src/') ? path.slice(0, path.indexOf('src/') + 3) : 'src'
          for (let n = segs.length; n > 0 && !hit; n--) {
            const p = joinPath(crateRoot, segs.slice(0, n).join('/'))
            hit = [p + '.rs', p + '/mod.rs'].find((c) => ctx.files.has(c)) ?? null
          }
        }
        break
      }
      case 'jvm': {
        const rel = spec.replace(/\./g, '/')
        const last = spec.split('.').pop()!
        for (const e of ['.java', '.kt', '.scala']) {
          const found = ctx.byBasename.get(last + e)?.find((f) => f === rel + e || f.endsWith('/' + rel + e))
          if (found) { hit = found; break }
        }
        if (!hit) external.add(spec.split('.').slice(0, 2).join('.'))
        break
      }
      case 'c': {
        const rel = joinPath(dir, spec)
        if (ctx.files.has(rel)) hit = rel
        else {
          const name = spec.split('/').pop()!
          const c = ctx.byBasename.get(name)?.filter((f) => f.endsWith(spec))
          if (c?.length) hit = c[0]
        }
        break
      }
      case 'ruby': {
        const rel = spec.startsWith('.') ? joinPath(dir, spec) : joinPath('lib', spec)
        hit = ctx.files.has(rel + '.rb') ? rel + '.rb' : ctx.files.has(rel) ? rel : null
        if (!hit && !spec.startsWith('.')) external.add(spec.split('/')[0])
        break
      }
      case 'php': {
        const rel = joinPath(dir, spec)
        hit = ctx.files.has(rel) ? rel : null
        break
      }
    }
    if (hit && hit !== path) internal.add(hit)
  }
  return { internal: [...internal], external: [...external] }
}

export function buildParsed(path: string, ext: string, content: string, ctx: ResolveCtx): ParsedFile {
  const raw = extractImports(path, ext, content)
  const { internal, external } = resolveImports(path, raw, ctx)
  return {
    path,
    lines: content.split('\n').length,
    imports: internal,
    externals: external,
    symbols: extractSymbols(ext, content),
    content: content.length > 200_000 ? content.slice(0, 200_000) : content,
  }
}
