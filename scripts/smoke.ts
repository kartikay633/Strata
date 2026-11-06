// Smoke test: node scripts/smoke.mjs owner/repo "question"
import { analyzeRepo } from '../src/lib/analyze'
import { search } from '../src/lib/search'

const [repo = 'pmndrs/zustand', question = 'How is state managed?'] = process.argv.slice(2)
const [owner, name] = repo.split('/')
const t0 = Date.now()
const a = await analyzeRepo(owner, name, undefined, process.env.GITHUB_TOKEN, () => {})
console.log(`${repo}: ${a.files.length} files, ${a.nodes.length} modules, ${a.links.length} links, ${a.totalLines} lines in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log('stack:', a.stack.map((s) => s.name).join(', '))
console.log('entry:', a.entryPoints.join(', '))
console.log('key files:', a.keyFiles.slice(0, 6).map((k) => `${k.path} [${k.reasons.join('; ')}]`).join('\n  '))
console.log('externals:', a.externals.slice(0, 8).map((e) => `${e.name}:${e.count}`).join(', '))
console.log('flows:', a.layerFlows.map((f) => `${f.from}->${f.to}:${f.count}`).join(', '))
console.log('tour:', a.tour.map((s) => `${s.title}${s.path ? ' (' + s.path + ')' : ''}`).join(' | '))
console.log('readme:', a.tour[0]?.body)
const r = search(a, question)
console.log(`ask "${question}":`, r.hits.slice(0, 5).map((h) => `${h.path} (${h.score.toFixed(1)})`).join(', '))
