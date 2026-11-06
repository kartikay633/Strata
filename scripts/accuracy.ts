/**
 * Accuracy harness: runs Strata's engine on a local checkout and compares it with ground truth
 * from the official tooling (TypeScript compiler for JS/TS, Python's ast for Python), plus
 * the repo's own metadata (package manifests, GitHub's language stats).
 *
 * Usage: npm run accuracy -- <repo_dir> [owner/name]
 * The checkout is only read: nothing in it is installed or executed.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { analyzeRepo, type RepoSource } from '../src/lib/analyze'
import type { RepoMeta } from '../src/lib/types'

const [repoDir, slug = path.basename(repoDir ?? '')] = process.argv.slice(2)
if (!repoDir) { console.error('usage: accuracy <repo_dir> [owner/name]'); process.exit(1) }
const abs = path.resolve(repoDir)
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))

/* ---------- run Strata on the local checkout ---------- */

const tracked = execFileSync('git', ['-C', abs, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const meta: RepoMeta = {
  owner: slug.split('/')[0], name: slug.split('/')[1] ?? slug, branch: 'HEAD', description: '', stars: 0, forks: 0, openIssues: 0,
  url: `https://github.com/${slug}`, topics: [], license: null, updatedAt: new Date().toISOString(), avatar: '', truncated: false,
}
const source: RepoSource = {
  repo: async () => ({
    meta, isPrivate: false,
    tree: tracked.filter((p) => fs.existsSync(path.join(abs, p))).map((p) => ({ path: p, type: 'blob' as const, size: fs.statSync(path.join(abs, p)).size })),
  }),
  raw: async (_m, p) => { try { return fs.readFileSync(path.join(abs, p), 'utf8') } catch { return null } },
}
const a = await analyzeRepo(meta.owner, meta.name, undefined, undefined, () => {}, source)
const nodes = new Set(a.nodes.map((n) => n.id))
const strataEdges = new Set(a.links.map((l) => `${l.source} -> ${l.target}`))

/* ---------- ground truth: TypeScript compiler ---------- */

const JS_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
let options: ts.CompilerOptions = { allowJs: true, resolveJsonModule: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext }
const tsconfigPath = ['tsconfig.json', 'jsconfig.json'].map((f) => path.join(abs, f)).find((f) => fs.existsSync(f))
if (tsconfigPath) {
  const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(cfg.config ?? {}, ts.sys, path.dirname(tsconfigPath))
  options = { ...parsed.options, allowJs: true, resolveJsonModule: true }
  if (!options.moduleResolution || options.moduleResolution === ts.ModuleResolutionKind.Classic) options.moduleResolution = ts.ModuleResolutionKind.Bundler
}
const rel = (f: string) => path.relative(abs, f).split(path.sep).join('/')

const truth = new Map<string, { target: string; spec: string }[]>()
for (const file of nodes) {
  if (!JS_EXT.test(file)) continue
  const full = path.join(abs, file)
  const info = ts.preProcessFile(fs.readFileSync(full, 'utf8'), true, true)
  const out: { target: string; spec: string }[] = []
  for (const imp of info.importedFiles) {
    const spec = imp.fileName
    const r = ts.resolveModuleName(spec, full, options, ts.sys).resolvedModule
    let target = r && !r.resolvedFileName.includes('node_modules') ? rel(r.resolvedFileName) : null
    // non-code assets (css, json, svg…) that TS doesn't resolve but are real relative files
    if (!target && spec.startsWith('.')) { const p = path.join(path.dirname(full), spec); if (fs.existsSync(p) && fs.statSync(p).isFile()) target = rel(p) }
    if (!target && /\.\w+$/.test(spec) && options.paths) {
      for (const [k, vs] of Object.entries(options.paths)) {
        const pre = k.replace(/\*$/, '')
        if (!spec.startsWith(pre)) continue
        for (const v of vs) { const p = path.resolve(options.pathsBasePath as string ?? options.baseUrl ?? abs, v.replace(/\*$/, '') + spec.slice(pre.length)); if (fs.existsSync(p)) target = rel(p) }
      }
    }
    if (target && target !== file && !target.startsWith('..')) out.push({ target, spec })
  }
  truth.set(file, out)
}

/* ---------- ground truth: Python ast ---------- */

const pyFiles = [...nodes].filter((f) => /\.pyi?$/.test(f))
if (pyFiles.length) {
  const res = execFileSync('python', ['-I', path.join(here, 'py_imports.py'), abs], { input: pyFiles.join('\n'), encoding: 'utf8', maxBuffer: 64 << 20 })
  for (const [file, targets] of Object.entries(JSON.parse(res) as Record<string, string[] | null>)) {
    if (targets) truth.set(file, targets.map((t) => ({ target: t, spec: '' })))
  }
}

/* ---------- compare ---------- */

const gtEdges = new Map<string, string>()
let outsideParsed = 0
for (const [file, list] of truth) for (const { target, spec } of list) {
  if (!nodes.has(target)) { outsideParsed++; continue }
  gtEdges.set(`${file} -> ${target}`, spec)
}
const compared = new Set(truth.keys())
const strataCompared = [...strataEdges].filter((e) => compared.has(e.split(' -> ')[0]))
const tp = strataCompared.filter((e) => gtEdges.has(e))
const fp = strataCompared.filter((e) => !gtEdges.has(e))
const fn = [...gtEdges.keys()].filter((e) => !strataEdges.has(e))
const pct = (x: number, y: number) => (y ? ((100 * x) / y).toFixed(1) + '%' : 'n/a')

console.log(`\n=== ${slug}  (${a.files.length} files mapped, ${nodes.size} modules parsed, ${compared.size} checked against ground truth)`)
console.log(`import edges   truth ${gtEdges.size} | strata ${strataCompared.length} | correct ${tp.length} | precision ${pct(tp.length, strataCompared.length)} | recall ${pct(tp.length, gtEdges.size)}  (${outsideParsed} truth edges point at files Strata did not parse)`)
if (fp.length) console.log('  false links (Strata only):\n    ' + fp.slice(0, 12).join('\n    '))
if (fn.length) console.log('  missed links (truth only):\n    ' + fn.slice(0, 12).map((e) => `${e}${gtEdges.get(e) ? `   [${gtEdges.get(e)}]` : ''}`).join('\n    '))

/* ---------- metadata checks ---------- */

// outside packages vs. declared dependencies in every package.json / pyproject / requirements
const declared = new Set<string>()
for (const f of tracked) {
  const full = path.join(abs, f)
  if (/(^|\/)package\.json$/.test(f)) {
    try { const j = JSON.parse(fs.readFileSync(full, 'utf8')); for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) Object.keys(j[k] ?? {}).forEach((d) => declared.add(d)); if (j.name) declared.add(j.name) } catch { /* skip */ }
  }
  if (/(^|\/)(pyproject\.toml|requirements[^/]*\.txt|setup\.cfg|setup\.py|tox\.ini)$/.test(f)) {
    for (const m of fs.readFileSync(full, 'utf8').matchAll(/["'\s]([A-Za-z][\w.-]+)\s*(?:[<>=~!;\[,"']|$)/gm)) declared.add(m[1].toLowerCase().replace(/_/g, '-'))
  }
}
const norm = (n: string) => n.toLowerCase().replace(/_/g, '-')
const undeclared = a.externals.filter((e) => !declared.has(e.name) && !declared.has(norm(e.name)) && !e.name.startsWith('@types/'))
console.log(`outside packages  ${a.externals.length} reported | not declared in any manifest: ${undeclared.map((e) => `${e.name}(${e.count})`).join(', ') || 'none'}`)

// entry points vs. package.json main/module/bin/exports
const pkgPath = path.join(abs, 'package.json')
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [])
  const declaredEntries = [...new Set([pkg.main, pkg.module, ...strings(pkg.bin), ...strings(pkg.exports)].filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^\.\//, '')))]
  const existing = declaredEntries.filter((e) => fs.existsSync(path.join(abs, e)))
  console.log(`entry points   strata: ${a.entryPoints.join(', ') || 'none'} | package.json (existing in source): ${existing.join(', ') || 'none (points at build output)'}`)
}

// layer sanity
const other = a.files.filter((f) => f.layer === 'other')
console.log(`layers         ${Object.entries(a.layerCounts).filter(([, n]) => n).map(([k, n]) => `${k}:${n}`).join(' ')}${other.length ? ` | 'other' e.g. ${other.slice(0, 5).map((f) => f.path).join(', ')}` : ''}`)
console.log(`readme         ${a.tour.find((t) => t.kind === 'readme')?.body.slice(0, 160) ?? '(none)'}`)
console.log(`key files      ${a.keyFiles.slice(0, 5).map((k) => k.path).join(', ')}`)

// GitHub's own language stats vs Strata's (one API call)
try {
  const gh = (await (await fetch(`https://api.github.com/repos/${slug}/languages`)).json()) as Record<string, number>
  const total = Object.values(gh).reduce((s, n) => s + n, 0) || 1
  const ours = a.languages.reduce((s, l) => s + l.bytes, 0) || 1
  const row = (name: string) => `${name} gh ${(100 * (gh[name] ?? 0) / total).toFixed(0)}% / strata ${(100 * (a.languages.find((l) => l.name === name)?.bytes ?? 0) / ours).toFixed(0)}%`
  const names = [...new Set([...Object.keys(gh).slice(0, 3), ...a.languages.slice(0, 3).map((l) => l.name)])]
  console.log(`languages      ${names.map(row).join(' | ')}`)
} catch { console.log('languages      (GitHub API unavailable)') }
