import { fetchRaw, fetchRepo, pool } from './github'
import {
  CODE_LANGS, FILE_STACK, IGNORED_DIRS, IGNORED_FILES, LANG_BY_EXT, LAYERS, LAYER_BY_ID, NPM_STACK, PY_STACK,
  classifyLayer, folderRole, langColor,
} from './knowledge'
import { buildParsed, dirname, type ResolveCtx } from './parse'
import type {
  Analysis, FileEntry, FolderInsight, GraphLink, GraphNode, KeyFile, LayerId, ParsedFile, ScanProgress, StackItem,
  TourStep, TreeNode,
} from './types'

const MAX_PARSE = 450
const MAX_PARSE_BYTES = 150_000
const MAX_TREE_FILES = 6000

const MANIFEST_RE = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|setup\.py|go\.mod|Cargo\.toml|Gemfile|composer\.json|[tj]sconfig\.json)$/
const PARSEABLE = new Set([...CODE_LANGS, 'CSS', 'SCSS', 'Less'])

const ENTRY_RE = [
  /^(src\/)?(main|index|app|server|cli)\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /^(src\/)?app\/layout\.(tsx|jsx|js)$/, /^(src\/)?pages\/_app\.(tsx|jsx|js)$/,
  /(^|\/)(manage|app|main|wsgi|asgi|__main__|run|server)\.py$/,
  /^(cmd\/[^/]+\/)?main\.go$/, /^src\/(main|lib)\.rs$/, /(^|\/)Main\.(java|kt)$/, /^(bin|exe)\/[^/]+$/,
  /^(lib\/)?[\w-]+\.rb$/, /^index\.php$/,
]

export async function analyzeRepo(
  owner: string, name: string, branch: string | undefined, token: string | undefined,
  onProgress: (p: ScanProgress) => void,
): Promise<Analysis> {
  const prog: ScanProgress = { stage: 0, label: 'Connecting to GitHub', discovered: 0, parsed: 0, toParse: 0, imports: 0, recent: [] }
  const emit = (patch: Partial<ScanProgress> = {}) => { Object.assign(prog, patch); onProgress({ ...prog, recent: [...prog.recent] }) }
  emit()

  /* 1. Fetch repo + tree */
  const { meta, tree: rawTree, isPrivate } = await fetchRepo(owner, name, branch, token)

  /* 2. Map the tree */
  emit({ stage: 1, label: 'Mapping the file tree' })
  const files: FileEntry[] = []
  for (const item of rawTree) {
    if (item.type !== 'blob') continue
    const p = item.path
    if (IGNORED_DIRS.some((d) => p.startsWith(d) || p.includes('/' + d))) continue
    if (IGNORED_FILES.some((re) => re.test(p))) continue
    const fname = p.split('/').pop()!
    const ext = fname.includes('.') ? fname.split('.').pop()!.toLowerCase() : ''
    const lang = LANG_BY_EXT[ext] ?? (/^(Dockerfile|Makefile|Procfile)$/.test(fname) ? 'Config' : 'Other')
    files.push({ path: p, name: fname, dir: dirname(p), ext, size: item.size ?? 0, lang, layer: classifyLayer(p, lang) })
    if (files.length >= MAX_TREE_FILES) break
  }
  // animate discovery count
  for (let i = 1; i <= 12; i++) {
    emit({ discovered: Math.round((files.length * i) / 12) })
    await new Promise((r) => setTimeout(r, 35))
  }

  /* 3. Choose + read files */
  emit({ stage: 2, label: 'Reading source files' })
  const depth = (p: string) => p.split('/').length
  const candidates = files
    .filter((f) => PARSEABLE.has(f.lang) && f.size < MAX_PARSE_BYTES && !/\.d\.ts$/.test(f.path))
    .sort((a, b) => (a.layer === 'tests' ? 1 : 0) - (b.layer === 'tests' ? 1 : 0) || (a.layer === 'docs' ? 1 : 0) - (b.layer === 'docs' ? 1 : 0) || depth(a.path) - depth(b.path) || a.size - b.size)
    .slice(0, MAX_PARSE)
  const extras = files.filter((f) => MANIFEST_RE.test(f.path) && depth(f.path) <= 3).slice(0, 14)
  const readme = files.find((f) => /^readme(\.(md|mdx|rst|txt))?$/i.test(f.path))
  const toRead = [...new Map([...candidates, ...extras, ...(readme ? [readme] : [])].map((f) => [f.path, f])).values()]
  emit({ toParse: toRead.length })

  const contents = new Map<string, string>()
  let done = 0
  await pool(toRead, 16, async (f) => {
    const text = await fetchRaw(meta, f.path, token, isPrivate)
    if (text != null) contents.set(f.path, text)
    done++
    prog.recent = [{ path: f.path, lang: f.lang }, ...prog.recent].slice(0, 7)
    if (done % 2 === 0 || done === toRead.length) emit({ parsed: done })
  })

  /* 4. Resolve imports */
  emit({ stage: 3, label: 'Tracing imports' })
  const fileSet = new Set(files.map((f) => f.path))
  const byBasename = new Map<string, string[]>()
  const dirFiles = new Map<string, string[]>()
  for (const f of files) {
    byBasename.set(f.name, [...(byBasename.get(f.name) ?? []), f.path])
    dirFiles.set(f.dir, [...(dirFiles.get(f.dir) ?? []), f.path])
  }
  const goModFile = files.find((f) => f.path === 'go.mod')
  const goModule = goModFile ? contents.get(goModFile.path)?.match(/^module\s+(\S+)/m)?.[1] ?? null : null

  const jsAliases: ResolveCtx['jsAliases'] = []
  for (const f of extras) {
    const text = contents.get(f.path)
    if (!text) continue
    if (/[tj]sconfig\.json$/.test(f.path)) {
      try {
        const json = JSON.parse(text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1'))
        const base = json.compilerOptions?.baseUrl ?? '.'
        for (const [k, v] of Object.entries<string[]>(json.compilerOptions?.paths ?? {})) {
          const prefix = k.replace(/\*$/, '')
          const target = (v[0] ?? '').replace(/\*$/, '')
          jsAliases.push({ prefix, target: [f.dir, base, target].filter(Boolean).join('/').replace(/\/\.\//g, '/').replace(/^\.\//, '') })
        }
      } catch { /* ignore malformed tsconfig */ }
    }
    if (/package\.json$/.test(f.path)) {
      try {
        const pkgName = JSON.parse(text).name
        const base = f.dir ? f.dir + '/' : ''
        if (pkgName) jsAliases.push(
          { prefix: pkgName + '/', target: base + 'src' }, { prefix: pkgName + '/', target: f.dir },
          { prefix: pkgName, target: base + 'src' }, { prefix: pkgName, target: f.dir },
        )
      } catch { /* ignore */ }
    }
  }
  jsAliases.push({ prefix: '@/', target: 'src' }, { prefix: '~/', target: 'src' }, { prefix: '@/', target: '' }, { prefix: 'src/', target: 'src' })

  const pyRoots = ['', 'src', 'lib', ...files.filter((f) => /(^|\/)(setup\.py|pyproject\.toml)$/.test(f.path) && f.dir).map((f) => f.dir)]
  const pyTops = new Set<string>()
  for (const f of files) {
    if (f.ext !== 'py') continue
    for (const r of pyRoots) {
      if (r && !f.path.startsWith(r + '/')) continue
      const rest = r ? f.path.slice(r.length + 1) : f.path
      pyTops.add(rest.split('/')[0].replace(/\.py$/, ''))
    }
  }

  const ctx: ResolveCtx = { files: fileSet, byBasename, goModule, jsAliases, pyRoots, pyTops, dirFiles }
  const parsed: Record<string, ParsedFile> = {}
  let importCount = 0
  const fileByPath = new Map(files.map((f) => [f.path, f]))
  for (const f of candidates) {
    const text = contents.get(f.path)
    if (text == null) continue
    const pf = buildParsed(f.path, f.ext, text, ctx)
    parsed[f.path] = pf
    importCount += pf.imports.length
  }
  for (let i = 1; i <= 10; i++) {
    emit({ imports: Math.round((importCount * i) / 10) })
    await new Promise((r) => setTimeout(r, 40))
  }
  // keep content for non-code extras too (readme, manifests) so the inspector can show them
  for (const f of [...extras, ...(readme ? [readme] : [])]) {
    const text = contents.get(f.path)
    if (text != null && !parsed[f.path]) parsed[f.path] = { path: f.path, lines: text.split('\n').length, imports: [], externals: [], symbols: [], content: text }
  }

  /* 5. Architecture */
  emit({ stage: 4, label: 'Detecting architecture' })

  // graph
  const nodeMap = new Map<string, GraphNode>()
  const links: GraphLink[] = []
  for (const pf of Object.values(parsed)) {
    const f = fileByPath.get(pf.path)!
    if (!PARSEABLE.has(f.lang)) continue
    nodeMap.set(pf.path, { id: pf.path, layer: f.layer, group: groupOf(pf.path), inDeg: 0, outDeg: 0 })
  }
  for (const pf of Object.values(parsed)) {
    if (!nodeMap.has(pf.path)) continue
    for (const t of pf.imports) {
      if (!nodeMap.has(t)) continue
      links.push({ source: pf.path, target: t })
      nodeMap.get(pf.path)!.outDeg++
      nodeMap.get(t)!.inDeg++
    }
  }
  const nodes = [...nodeMap.values()]

  // layer flows
  const flowMap = new Map<string, number>()
  for (const l of links) {
    const a = nodeMap.get(l.source)!.layer
    const b = nodeMap.get(l.target)!.layer
    if (a === b) continue
    flowMap.set(`${a}>${b}`, (flowMap.get(`${a}>${b}`) ?? 0) + 1)
  }
  const layerFlows = [...flowMap.entries()].map(([k, count]) => {
    const [from, to] = k.split('>') as [LayerId, LayerId]
    return { from, to, count }
  }).sort((a, b) => b.count - a.count)

  const layerCounts = Object.fromEntries(LAYERS.map((l) => [l.id, 0])) as Record<LayerId, number>
  for (const f of files) layerCounts[f.layer]++

  // languages (by bytes of real source files, computed locally to save an API call)
  const LANG_OK = new Set([...PARSEABLE, 'HTML', 'Shell', 'SQL', 'GraphQL', 'Prisma', 'Terraform'])
  const languages = aggregate(files.filter((f) => LANG_OK.has(f.lang) && f.layer !== 'docs'), (f) => f.lang, (f) => f.size)
    .map(([n, bytes]) => ({ name: n, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .map((l) => ({ ...l, color: langColor(l.name) }))

  // stack
  const stack = detectStack(files, contents)

  // entry points
  const pkgJson = contents.get('package.json')
  const entryPoints = new Set<string>()
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson)
      const cands = [pkg.main, pkg.module, ...(typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {}))]
      for (const c of cands) if (typeof c === 'string') {
        const p = c.replace(/^\.\//, '')
        if (fileSet.has(p)) entryPoints.add(p)
      }
    } catch { /* ignore */ }
  }
  for (const f of files) if (f.layer !== 'tests' && f.layer !== 'docs' && ENTRY_RE.some((re) => re.test(f.path)) && PARSEABLE.has(f.lang)) entryPoints.add(f.path)
  const entries = [...entryPoints].sort((a, b) => depth(a) - depth(b)).slice(0, 6)

  // key files
  const keyFiles: KeyFile[] = nodes.map((n) => {
    const pf = parsed[n.id]
    const reasons: string[] = []
    let score = (n.inDeg * 3 + n.outDeg * 0.6 + Math.log10(pf.lines + 1)) * (n.layer === 'tests' || n.layer === 'docs' ? 0.35 : 1)
    if (n.inDeg >= 2) reasons.push(`Imported by ${n.inDeg} files`)
    if (entries.includes(n.id)) { score += 10; reasons.push('Entry point') }
    if (n.outDeg >= 5) reasons.push(`Pulls together ${n.outDeg} modules`)
    if (pf.lines > 400) reasons.push(`${pf.lines.toLocaleString()} lines`)
    if (pf.symbols.length >= 8) reasons.push(`Defines ${pf.symbols.length} symbols`)
    return { path: n.id, score, reasons }
  }).filter((k) => k.reasons.length).sort((a, b) => b.score - a.score).slice(0, 12)

  // folders
  const folders = folderInsights(files)

  // externals
  const extCount = new Map<string, number>()
  for (const pf of Object.values(parsed)) for (const e of pf.externals) extCount.set(e, (extCount.get(e) ?? 0) + 1)
  const externals = [...extCount.entries()].map(([n, count]) => ({ name: n, count })).sort((a, b) => b.count - a.count).slice(0, 24)

  const readmeText = readme ? contents.get(readme.path) ?? null : null
  const totalLines = Object.values(parsed).reduce((s, p) => s + p.lines, 0)

  const tour = buildTour({ readmePath: readme?.path, readmeText, stack, entries, nodes, parsed, layerCounts, folders, extras: extras.map((e) => e.path), externals })

  await new Promise((r) => setTimeout(r, 450))
  emit({ stage: 5, label: 'Ready' })

  return {
    meta, files, parsed, languages, stack, tree: buildTree(files, meta.name), nodes, links, layerFlows, layerCounts,
    folders, entryPoints: entries, keyFiles, externals, tour, readme: readmeText, totalLines,
  }
}

/* ---------------- helpers ---------------- */

function groupOf(path: string) {
  const parts = path.split('/')
  if (parts.length === 1) return '(root)'
  if (['src', 'lib', 'app', 'packages', 'apps', 'internal', 'pkg'].includes(parts[0]) && parts.length > 2) return parts[0] + '/' + parts[1]
  return parts[0]
}

function aggregate<T>(items: T[], key: (t: T) => string, val: (t: T) => number): [string, number][] {
  const m = new Map<string, number>()
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + val(it))
  return [...m.entries()]
}

function buildTree(files: FileEntry[], rootName: string): TreeNode {
  const root: TreeNode = { name: rootName, path: '', size: 0, children: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join('/')
      let child = node.children!.find((c) => c.path === p && c.children)
      if (!child) { child = { name: parts[i], path: p, size: 0, children: [] }; node.children!.push(child) }
      node = child
    }
    node.children!.push({ name: f.name, path: f.path, size: Math.max(f.size, 400), file: f })
  }
  return root
}

function folderInsights(files: FileEntry[]): FolderInsight[] {
  const tops = new Map<string, FileEntry[]>()
  for (const f of files) {
    const parts = f.path.split('/')
    if (parts.length === 1) continue
    let key = parts[0]
    // if a single source folder dominates, look one level deeper
    if (['src', 'lib', 'app', 'packages', 'apps'].includes(parts[0]) && parts.length > 2) key = parts[0] + '/' + parts[1]
    tops.set(key, [...(tops.get(key) ?? []), f])
  }
  return [...tops.entries()].map(([path, fs]) => {
    const langs = aggregate(fs.filter((f) => f.lang !== 'Other'), (f) => f.lang, (f) => f.size).sort((a, b) => b[1] - a[1])
    const layers = aggregate(fs, (f) => f.layer, () => 1).sort((a, b) => b[1] - a[1])
    const layer = (layers[0]?.[0] ?? 'other') as LayerId
    return {
      path, files: fs.length, bytes: fs.reduce((s, f) => s + f.size, 0), topLang: langs[0]?.[0] ?? 'Other', layer,
      role: folderRole(path.split('/').pop()!, layer),
    }
  }).sort((a, b) => b.files - a.files).slice(0, 18)
}

function detectStack(files: FileEntry[], contents: Map<string, string>): StackItem[] {
  const found = new Map<string, StackItem>()
  const add = (name: string, category: string, source: string) => { if (!found.has(name)) found.set(name, { name, category, source }) }
  for (const [path, text] of contents) {
    if (/package\.json$/.test(path)) {
      try {
        const pkg = JSON.parse(text)
        for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })) {
          const def = NPM_STACK[dep]
          if (def) add(def[0], def[1], path)
        }
      } catch { /* ignore */ }
    } else if (/requirements[^/]*\.txt$|pyproject\.toml$|setup\.py$/.test(path)) {
      for (const m of text.toLowerCase().matchAll(/^[\s"']*([a-z0-9_.-]+)/gm)) {
        const def = PY_STACK[m[1]]
        if (def) add(def[0], def[1], path)
      }
      for (const [k, def] of Object.entries(PY_STACK)) if (new RegExp(`["'\\s]${k.replace(/[.-]/g, '[.-]')}[\\s"'=<>~\\[]`, 'i').test(text)) add(def[0], def[1], path)
    } else if (/go\.mod$/.test(path)) {
      const GO: Record<string, [string, string]> = { 'gin-gonic/gin': ['Gin', 'Backend'], 'labstack/echo': ['Echo', 'Backend'], 'gofiber/fiber': ['Fiber', 'Backend'], 'gorm.io/gorm': ['GORM', 'Database'], 'spf13/cobra': ['Cobra', 'CLI'], 'stretchr/testify': ['Testify', 'Testing'], 'go-chi/chi': ['chi', 'Backend'], 'grpc': ['gRPC', 'API'] }
      for (const [k, d] of Object.entries(GO)) if (text.includes(k)) add(d[0], d[1], path)
    } else if (/Cargo\.toml$/.test(path)) {
      const RS: Record<string, [string, string]> = { tokio: ['Tokio', 'Async runtime'], axum: ['Axum', 'Backend'], 'actix-web': ['Actix', 'Backend'], serde: ['Serde', 'Serialization'], clap: ['clap', 'CLI'], sqlx: ['SQLx', 'Database'], diesel: ['Diesel', 'Database'], reqwest: ['reqwest', 'HTTP'] }
      for (const [k, d] of Object.entries(RS)) if (new RegExp(`^\\s*${k}\\s*=`, 'm').test(text)) add(d[0], d[1], path)
    } else if (/Gemfile$/.test(path)) {
      if (/['"]rails['"]/.test(text)) add('Ruby on Rails', 'Framework', path)
      if (/['"]rspec/.test(text)) add('RSpec', 'Testing', path)
      if (/['"]sinatra['"]/.test(text)) add('Sinatra', 'Backend', path)
    } else if (/composer\.json$/.test(path)) {
      if (text.includes('laravel/framework')) add('Laravel', 'Framework', path)
      if (text.includes('symfony/')) add('Symfony', 'Framework', path)
    }
  }
  for (const f of files) for (const [re, def] of FILE_STACK) if (re.test(f.path)) add(def[0], def[1], f.path)
  return [...found.values()]
}

function readmeSummary(text: string) {
  const paras = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('|') && !/^([-*+]|\d+\.)\s/.test(p) && !/^[-=*_]{3,}$/.test(p) && !/^\[!?/.test(p) && p.replace(/[*_`]/g, '').length > 40)
    .map((p) => p.replace(/^>\s*/, '').replace(/[*_`]/g, ''))
  let out = paras.slice(0, 2).join(' ')
  if (out.length > 340) {
    const cut = out.slice(0, 340)
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
    out = end > 120 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…'
  }
  return (out || 'The README is the project’s front door — it explains what this is and how to run it.')
}

function buildTour(o: {
  readmePath?: string; readmeText: string | null; stack: StackItem[]; entries: string[]; nodes: GraphNode[]
  parsed: Record<string, ParsedFile>; layerCounts: Record<LayerId, number>; folders: FolderInsight[]; extras: string[]
  externals: { name: string; count: number }[]
}): TourStep[] {
  const steps: TourStep[] = []
  if (o.readmePath && o.readmeText) steps.push({ kind: 'readme', title: 'Start with the README', path: o.readmePath, body: readmeSummary(o.readmeText) })

  const manifest = o.extras.find((p) => !p.includes('/') && /package\.json|pyproject\.toml|requirements\.txt|go\.mod|Cargo\.toml|Gemfile|composer\.json/.test(p)) ?? o.extras.find((p) => !/[tj]sconfig/.test(p))
  if (manifest) {
    const top = o.stack.slice(0, 6).map((s) => s.name)
    const ext = o.externals.slice(0, 5).map((e) => e.name)
    steps.push({
      kind: 'manifest', title: 'Check what it is built with', path: manifest,
      body: top.length
        ? `This manifest reveals the toolkit: ${top.join(', ')}. Knowing the stack tells you which conventions the rest of the code follows.`
        : ext.length ? `The most-used outside packages are ${ext.join(', ')}. These are the building blocks the project leans on.` : 'This manifest lists dependencies and scripts — how the project is installed, built and run.',
    })
  }

  const byId = new Map(o.nodes.map((n) => [n.id, n]))
  for (const e of o.entries.slice(0, 2)) {
    const pf = o.parsed[e]
    const imports = pf?.imports.slice(0, 4).map((p) => p.split('/').pop()).join(', ')
    steps.push({
      kind: 'entry', title: steps.some((s) => s.kind === 'entry') ? 'Another way in' : 'Find where it starts', path: e,
      body: `Execution begins here.${imports ? ` From this file the program reaches out to ${imports}${(pf?.imports.length ?? 0) > 4 ? ' and more' : ''}.` : ''} Follow its imports to trace the main flow.`,
    })
  }

  const hubs = [...o.nodes].filter((n) => !o.entries.includes(n.id) && n.inDeg >= 2 && n.layer !== 'tests' && n.layer !== 'docs').sort((a, b) => b.inDeg - a.inDeg).slice(0, 3)
  for (const h of hubs) {
    const syms = o.parsed[h.id]?.symbols.slice(0, 4).map((s) => s.name)
    steps.push({
      kind: 'hub', title: `Meet a hub: ${h.id.split('/').pop()}`, path: h.id,
      body: `${h.inDeg} other files depend on this one, so changes here ripple widely.${syms?.length ? ` It defines ${syms.join(', ')}.` : ''} It sits in the ${LAYER_BY_ID[h.layer].label.toLowerCase()} layer.`,
    })
  }
  void byId

  const present = LAYERS.filter((l) => o.layerCounts[l.id] > 0 && l.id !== 'other').map((l) => `${l.label.toLowerCase()} (${o.layerCounts[l.id]})`)
  steps.push({ kind: 'layer', title: 'See the layers', body: `Files fall into ${present.length} layers: ${present.join(', ')}. Open the Layers view to watch how they call each other.` })

  const side = (f: FolderInsight) => ['tests', 'docs', 'config', 'other'].includes(f.layer)
  const big = [...o.folders.filter((f) => !side(f)), ...o.folders.filter(side)].slice(0, 3)
  if (big.length) steps.push({ kind: 'folder', title: 'Where most code lives', path: big[0].path, body: big.map((f) => `${f.path}/ — ${f.role}`).join(' · ') })
  return steps
}
