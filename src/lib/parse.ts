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

export function extractImports(path: string, ext: string, src: string): RawImports {
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs': case 'cjs': case 'mts': case 'cts':
    case 'vue': case 'svelte': case 'astro':
      return {
        kind: 'js',
        specs: [
          ...matchAll(src, /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g),
          ...matchAll(src, /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g),
          ...matchAll(src, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
        ],
      }
    case 'py': case 'pyi': {
      const specs: string[] = []
      for (const m of src.matchAll(/^\s*from\s+([.\w]+)\s+import\s+([\w\s,*()]+)/gm)) {
        const mod = m[1]
        specs.push(mod)
        // `from . import a, b` or `from pkg import submodule`
        for (const n of m[2].replace(/[()]/g, '').split(',')) {
          const name = n.trim().split(/\s+/)[0]
          if (name && name !== '*') specs.push(mod.endsWith('.') ? mod + name : `${mod}.${name}`)
        }
      }
      for (const m of src.matchAll(/^\s*import\s+([\w., ]+)/gm))
        for (const n of m[1].split(',')) specs.push(n.trim().split(/\s+/)[0])
      return { kind: 'py', specs }
    }
    case 'go': {
      const specs = matchAll(src, /^\s*import\s+(?:\w+\s+)?"([^"]+)"/gm)
      for (const block of src.matchAll(/import\s*\(([\s\S]*?)\)/g)) specs.push(...matchAll(block[1], /"([^"]+)"/g))
      return { kind: 'go', specs }
    }
    case 'rs':
      return {
        kind: 'rust',
        specs: [
          ...matchAll(src, /^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm).map((m) => `mod:${m}`),
          ...matchAll(src, /^\s*(?:pub\s+)?use\s+((?:crate|super|self)::[\w:]+)/gm),
        ],
      }
    case 'java': case 'kt': case 'kts': case 'scala':
      return { kind: 'jvm', specs: matchAll(src, /^\s*import\s+(?:static\s+)?([\w.]+)/gm) }
    case 'c': case 'h': case 'cpp': case 'cc': case 'hpp': case 'hh': case 'cxx':
      return { kind: 'c', specs: matchAll(src, /^\s*#\s*include\s+"([^"]+)"/gm) }
    case 'rb':
      return { kind: 'ruby', specs: [...matchAll(src, /require_relative\s+['"]([^'"]+)['"]/g).map((s) => `./${s}`), ...matchAll(src, /\brequire\s+['"]([^'"]+)['"]/g)] }
    case 'php':
      return { kind: 'php', specs: matchAll(src, /(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+)['"]/g) }
    case 'css': case 'scss': case 'sass': case 'less':
      return { kind: 'css', specs: matchAll(src, /@(?:import|use|forward)\s+(?:url\()?['"]([^'"]+)['"]/g) }
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
const JS_INDEX = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs', '/index.vue']

export interface ResolveCtx {
  files: Set<string>
  byBasename: Map<string, string[]>
  goModule: string | null
  jsAliases: { prefix: string; target: string }[]
  pyRoots: string[]
  pyTops: Set<string>
  dirFiles: Map<string, string[]>
}

function tryJs(ctx: ResolveCtx, base: string): string | null {
  for (const e of JS_EXTS) if (ctx.files.has(base + e)) return base + e
  // TS ESM style: import './foo.js' that is really foo.ts
  const stripped = base.replace(/\.(m|c)?js$/, '')
  if (stripped !== base) for (const e of ['.ts', '.tsx', '.mts', '.cts']) if (ctx.files.has(stripped + e)) return stripped + e
  for (const i of JS_INDEX) if (ctx.files.has(base + i)) return base + i
  return null
}

function packageName(spec: string) {
  if (spec.startsWith('node:')) return spec
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
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
          if (!hit && raw.kind === 'js' && !spec.startsWith('#')) external.add(packageName(spec))
        }
        break
      }
      case 'py': {
        let mod = spec
        let base = ''
        if (mod.startsWith('.')) {
          const dots = mod.match(/^\.+/)![0].length
          base = dir.split('/').slice(0, Math.max(0, dir.split('/').length - (dots - 1))).join('/')
          if (dir === '') base = ''
          mod = mod.slice(dots)
          const rel = mod.replace(/\./g, '/')
          const cand = rel ? joinPath(base, rel) : base
          hit = ctx.files.has(cand + '.py') ? cand + '.py' : ctx.files.has(cand + '/__init__.py') ? cand + '/__init__.py' : null
        } else {
          const rel = mod.replace(/\./g, '/')
          for (const root of ctx.pyRoots) {
            const cand = joinPath(root, rel)
            if (ctx.files.has(cand + '.py')) { hit = cand + '.py'; break }
            if (ctx.files.has(cand + '/__init__.py')) { hit = cand + '/__init__.py'; break }
          }
          if (!hit) {
            const top = mod.split('.')[0]
            if (top && !ctx.pyTops.has(top)) external.add(top)
          }
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
