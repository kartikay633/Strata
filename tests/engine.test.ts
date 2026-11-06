import { describe, expect, it } from 'vitest'
import { analyzeRepo, parseJsonc, readmeSummary, type RepoSource } from '../src/lib/analyze'
import { parseRepoInput } from '../src/lib/github'
import { classifyLayer, expandQuery } from '../src/lib/knowledge'
import { extractImports, extractSymbols, joinPath, resolveImports, type ResolveCtx } from '../src/lib/parse'
import { search } from '../src/lib/search'
import type { RepoMeta } from '../src/lib/types'

/* ---------- helpers ---------- */

function ctxFor(paths: string[], extra: Partial<ResolveCtx> = {}): ResolveCtx {
  const byBasename = new Map<string, string[]>()
  const dirFiles = new Map<string, string[]>()
  for (const p of paths) {
    const name = p.split('/').pop()!
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
    byBasename.set(name, [...(byBasename.get(name) ?? []), p])
    dirFiles.set(dir, [...(dirFiles.get(dir) ?? []), p])
  }
  const pyTops = new Set(paths.filter((p) => p.endsWith('.py')).map((p) => p.replace(/^src\//, '').split('/')[0].replace(/\.py$/, '')))
  return { files: new Set(paths), byBasename, dirFiles, goModule: null, jsAliases: [], pyRoots: ['', 'src'], pyTops, ...extra }
}

const resolve = (from: string, ext: string, src: string, ctx: ResolveCtx) => resolveImports(from, extractImports(from, ext, src), ctx)

const META: RepoMeta = {
  owner: 'acme', name: 'demo', branch: 'main', description: '', stars: 0, forks: 0, openIssues: 0,
  url: 'https://github.com/acme/demo', topics: [], license: null, updatedAt: '2026-01-01T00:00:00Z', avatar: '', truncated: false,
}

function memorySource(files: Record<string, string>): RepoSource {
  return {
    repo: async () => ({ meta: META, isPrivate: false, tree: Object.entries(files).map(([path, c]) => ({ path, type: 'blob' as const, size: c.length })) }),
    raw: async (_m, path) => files[path] ?? null,
  }
}

/* ---------- input parsing ---------- */

describe('parseRepoInput', () => {
  it('accepts owner/name, URLs, .git suffixes and branch URLs', () => {
    expect(parseRepoInput('pmndrs/zustand')).toEqual({ owner: 'pmndrs', name: 'zustand' })
    expect(parseRepoInput('https://github.com/pmndrs/zustand')).toMatchObject({ owner: 'pmndrs', name: 'zustand' })
    expect(parseRepoInput('https://github.com/pmndrs/zustand.git')).toMatchObject({ owner: 'pmndrs', name: 'zustand' })
    expect(parseRepoInput('github.com/vercel/next.js/tree/canary')).toEqual({ owner: 'vercel', name: 'next.js', branch: 'canary' })
    expect(parseRepoInput('  https://github.com/a/b/  ')).toMatchObject({ owner: 'a', name: 'b' })
  })
  it('accepts deep links to files and SSH remotes', () => {
    expect(parseRepoInput('https://github.com/a/b/blob/main/src/x.ts')).toMatchObject({ owner: 'a', name: 'b' })
    expect(parseRepoInput('git@github.com:a/b.git')).toMatchObject({ owner: 'a', name: 'b' })
  })
  it('rejects junk', () => {
    expect(parseRepoInput('hello world')).toBeNull()
    expect(parseRepoInput('')).toBeNull()
  })
})

/* ---------- JS / TS imports ---------- */

describe('JS/TS import extraction', () => {
  const files = ['src/a.ts', 'src/b.tsx', 'src/c/index.ts', 'src/d.js', 'src/e.ts', 'src/f.ts', 'src/g.ts', 'src/styles.css', 'src/multi.ts', 'src/lazy.ts', 'src/types.ts', 'src/esm.ts']
  const ctx = ctxFor(files)

  it('resolves every common import form', () => {
    const src = `
import a from './a'
import { b } from "./b"
import * as c from './c'
import './styles.css'
export { e } from './e'
export * from './f'
const d = require('./d')
import type { T } from './types'
import {
  m1,
  m2,
} from './multi'
const lazy = () => import('./lazy')
import Default, { named } from './g'
import { x } from './esm.js'
import React from 'react'
import { z } from '@scope/pkg/sub'
`
    const r = resolve('src/main.ts', 'ts', src, ctx)
    expect(r.internal.sort()).toEqual(['src/a.ts', 'src/b.tsx', 'src/c/index.ts', 'src/d.js', 'src/e.ts', 'src/esm.ts', 'src/f.ts', 'src/g.ts', 'src/lazy.ts', 'src/multi.ts', 'src/styles.css', 'src/types.ts'].sort())
    expect(r.external.sort()).toEqual(['@scope/pkg', 'react'])
  })

  it('ignores imports inside comments and strings', () => {
    const src = `
// import gone from './a'
/* import alsoGone from './b'
   require('./d') */
const s = "import fake from './e'"
const t = \`require('./f')\`
import real from './g'
`
    const r = resolve('src/main.ts', 'ts', src, ctx)
    expect(r.internal).toEqual(['src/g.ts'])
  })

  it('does not treat node built-ins as outside packages', () => {
    const r = resolve('src/main.ts', 'ts', `import fs from 'fs'\nimport path from 'node:path'\nimport { x } from 'fs/promises'`, ctx)
    expect(r.external).toEqual([])
  })

  it('applies tsconfig-style aliases', () => {
    const c = ctxFor(['src/lib/api.ts', 'src/components/Button.tsx'], { jsAliases: [{ prefix: '@/', target: 'src' }] })
    const r = resolve('src/app/page.tsx', 'tsx', `import { api } from '@/lib/api'\nimport { Button } from '@/components/Button'`, c)
    expect(r.internal.sort()).toEqual(['src/components/Button.tsx', 'src/lib/api.ts'])
  })

  it('resolves folder imports, including the repo root (express examples)', () => {
    const c = ctxFor(['index.js', 'lib/router/index.js', 'examples/hello/index.js'])
    expect(resolve('examples/hello/index.js', 'js', `const express = require('../..')
const r = require('../../lib/router/')`, c).internal.sort()).toEqual(['index.js', 'lib/router/index.js'])
  })

  it('resolves bare specifiers through tsconfig baseUrl', () => {
    const c = ctxFor(['types/index.d.ts', 'lib/db.ts'], { jsAliases: [{ prefix: '', target: '' }] })
    const r = resolve('app/page.tsx', 'tsx', `import type { User } from 'types'
import { db } from 'lib/db'
import React from 'react'`, c)
    expect(r.internal.sort()).toEqual(['lib/db.ts', 'types/index.d.ts'])
    expect(r.external).toEqual(['react'])
  })

  it('reads imports from Vue and Svelte components', () => {
    const r = resolve('src/App.vue', 'vue', `<template><div/></template>\n<script setup>\nimport A from './a'\n</script>`, ctx)
    expect(r.internal).toEqual(['src/a.ts'])
  })
})

/* ---------- Python imports ---------- */

describe('Python import extraction', () => {
  const files = ['pkg/__init__.py', 'pkg/models.py', 'pkg/views.py', 'pkg/sub/__init__.py', 'pkg/sub/helpers.py', 'pkg/utils.py', 'manage.py']
  const ctx = ctxFor(files)

  it('resolves relative, absolute, package and submodule imports', () => {
    const src = `
from .models import User
from . import views
from .sub import helpers
import pkg.utils
from pkg.sub.helpers import thing
import os, sys
from typing import Any
import requests
`
    const r = resolve('pkg/app.py', 'py', src, ctx)
    // `from X import name` links to X/name.py when name is a submodule, otherwise to X itself
    expect(r.internal.sort()).toEqual(['pkg/models.py', 'pkg/sub/helpers.py', 'pkg/utils.py', 'pkg/views.py'])
    expect(r.external).toEqual(['requests'])
  })

  it('handles parenthesised multi-line imports', () => {
    const r = resolve('pkg/app.py', 'py', `from . import (\n    models,\n    views,\n)\n\nclass App:\n    pass\n`, ctx)
    expect(r.internal.sort()).toEqual(['pkg/models.py', 'pkg/views.py'])
  })

  it('links attribute imports to the package __init__', () => {
    const r = resolve('manage.py', 'py', `from pkg import create_app
from pkg.sub import helpers, CONSTANT`, ctx)
    expect(r.internal.sort()).toEqual(['pkg/__init__.py', 'pkg/sub/__init__.py', 'pkg/sub/helpers.py'])
  })

  it('does not report repo-local fixture apps or py2 stdlib as outside packages', () => {
    const c = ctxFor(['tests/test_apps/blueprintapp/__init__.py', 'src/flask/app.py'], { pyAnywhere: new Set(['blueprintapp', 'app']) })
    expect(resolve('tests/test_bp.py', 'py', `import blueprintapp
import StringIO
import werkzeug`, c).external).toEqual(['werkzeug'])
  })

  it('handles parent-relative imports', () => {
    const r = resolve('pkg/sub/helpers.py', 'py', `from ..models import User\nfrom .. import utils`, ctx)
    expect(r.internal.sort()).toEqual(['pkg/models.py', 'pkg/utils.py'])
  })

  it('ignores imports inside docstrings', () => {
    const src = `"""Example:\n\nfrom pkg.models import User\n"""\nfrom .views import index\n`
    const r = resolve('pkg/app.py', 'py', src, ctx)
    expect(r.internal).toEqual(['pkg/views.py'])
  })
})

/* ---------- other languages ---------- */

describe('other languages', () => {
  it('Go: links module-internal packages, ignores stdlib', () => {
    const c = ctxFor(['go.mod', 'internal/db/db.go', 'internal/db/db_test.go', 'cmd/app/main.go'], { goModule: 'example.com/app' })
    const r = resolve('cmd/app/main.go', 'go', `package main\n\nimport (\n\t"fmt"\n\t"example.com/app/internal/db"\n\t"github.com/gin-gonic/gin"\n)\n`, c)
    expect(r.internal).toEqual(['internal/db/db.go'])
    expect(r.external).toEqual(['github.com/gin-gonic/gin'])
  })
  it('Rust: mod declarations and crate paths', () => {
    const c = ctxFor(['src/main.rs', 'src/config.rs', 'src/net/mod.rs', 'src/net/client.rs'])
    expect(resolve('src/main.rs', 'rs', `mod config;\nmod net;\nuse crate::net::client::Client;`, c).internal.sort()).toEqual(['src/config.rs', 'src/net/client.rs', 'src/net/mod.rs'])
  })
  it('Java: package imports map to files', () => {
    const c = ctxFor(['src/main/java/com/acme/App.java', 'src/main/java/com/acme/util/Strings.java'])
    expect(resolve('src/main/java/com/acme/App.java', 'java', `import com.acme.util.Strings;\nimport java.util.List;`, c).internal).toEqual(['src/main/java/com/acme/util/Strings.java'])
  })
  it('C: quoted includes resolve, system includes do not', () => {
    const c = ctxFor(['src/main.c', 'src/util.h', 'include/api.h'])
    expect(resolve('src/main.c', 'c', `#include <stdio.h>\n#include "util.h"\n#include "api.h"`, c).internal.sort()).toEqual(['include/api.h', 'src/util.h'])
  })
})

/* ---------- symbols ---------- */

describe('symbol extraction', () => {
  it('finds functions, classes and types with correct line numbers', () => {
    const src = `import x from 'y'\n\nexport function alpha() {}\nexport const beta = (a) => a\nclass Gamma {}\nexport interface Delta {}\nexport default async function epsilon() {}\n`
    const syms = extractSymbols('ts', src)
    expect(syms.map((s) => [s.name, s.line])).toEqual([['alpha', 3], ['beta', 4], ['Gamma', 5], ['Delta', 6], ['epsilon', 7]])
  })
  it('Python defs and classes', () => {
    const syms = extractSymbols('py', `import os\n\nclass App:\n    def run(self):\n        pass\n\ndef main():\n    pass\n`)
    expect(syms.map((s) => s.name)).toEqual(['App', 'main'])
  })
})

/* ---------- layers ---------- */

describe('layer classification', () => {
  it.each([
    ['src/components/Button.tsx', 'TypeScript', 'interface'],
    ['src/api/users.ts', 'TypeScript', 'api'],
    ['app/routes/index.ts', 'TypeScript', 'api'],
    ['src/services/billing.ts', 'TypeScript', 'logic'],
    ['src/models/user.py', 'Python', 'data'],
    ['prisma/schema.prisma', 'Prisma', 'data'],
    ['src/utils/format.ts', 'TypeScript', 'utils'],
    ['tests/test_app.py', 'Python', 'tests'],
    ['src/foo.test.ts', 'TypeScript', 'tests'],
    ['testdata/x.go', 'Go', 'tests'],
    ['docs/intro.md', 'Markdown', 'docs'],
    ['package.json', 'JSON', 'config'],
    ['.github/workflows/ci.yml', 'YAML', 'config'],
    ['Dockerfile', 'Config', 'config'],
    ['.prettierignore', 'Other', 'config'],
    ['uv.lock', 'Other', 'config'],
    ['src/requests/py.typed', 'Other', 'config'],
  ])('%s → %s', (path, lang, layer) => {
    expect(classifyLayer(path, lang)).toBe(layer)
  })
})

/* ---------- README summary ---------- */

describe('readmeSummary', () => {
  it('skips badges, code, headings, lists and reference links', () => {
    const md = `# Demo\n\n[![CI](https://x/badge.svg)](https://x)\n\n> [!NOTE]\n> Beta.\n\nDemo is a [fast](https://a) toolkit for building [WSGI] apps with a friendly API and no magic.\n\n\`\`\`js\nconsole.log('this is code that should never appear in the summary at all')\n\`\`\`\n\n- list item that is long enough to pass the length filter easily\n\n[WSGI]: https://wsgi.readthedocs.io\n`
    expect(readmeSummary(md)).toBe('Demo is a fast toolkit for building WSGI apps with a friendly API and no magic.')
  })
  it('drops reference-style badges and callout markers', () => {
    const md = `# X

**Fast, minimalist web framework for [Node.js][node].**

[![NPM Version][npm-version-image]][npm-url]
[![CI][ci-image]][ci-url]

> [!NOTE]
> This project has been archived and will no longer receive any updates at all.
`
    expect(readmeSummary(md)).toBe('Fast, minimalist web framework for Node.js. This project has been archived and will no longer receive any updates at all.')
  })

  it('cuts long summaries at a sentence boundary', () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} explains one more useful thing about it.`).join(' ')
    const out = readmeSummary(long)
    expect(out.length).toBeLessThanOrEqual(341)
    expect(out.endsWith('.')).toBe(true)
  })
})

/* ---------- search ---------- */

describe('search / query expansion', () => {
  it('expands concepts to related code terms', () => {
    const terms = expandQuery('Where is auth handled?')
    expect(terms).toEqual(expect.arrayContaining(['auth', 'login', 'jwt', 'session']))
    expect(terms).not.toContain('where')
  })
})

/* ---------- full pipeline on an in-memory repo ---------- */

describe('analyzeRepo (in-memory repo)', async () => {
  const files: Record<string, string> = {
    'README.md': '# Demo\n\nDemo is a tiny example service used to test the analysis pipeline end to end.\n',
    'package.json': JSON.stringify({ name: 'demo', main: 'src/index.ts', dependencies: { express: '^4', zod: '^3' }, devDependencies: { vitest: '^2' } }),
    'src/index.ts': `import express from 'express'\nimport { router } from './routes/users'\nconst app = express()\napp.use(router)\n`,
    'src/routes/users.ts': `import { Router } from 'express'\nimport { getUser } from '../services/users'\nexport const router = Router()\nrouter.get('/users/:id', async (req, res) => res.json(await getUser(req.params.id)))\n`,
    'src/services/users.ts': `import { db } from '../db/client'\nimport { User } from '../models/user'\nexport async function getUser(id: string): Promise<User> { return db.find(id) }\n`,
    'src/db/client.ts': `export const db = { find: async (id: string) => ({ id, name: 'x' }) }\n`,
    'src/models/user.ts': `import { z } from 'zod'\nexport const UserSchema = z.object({ id: z.string() })\nexport type User = z.infer<typeof UserSchema>\n`,
    'src/utils/log.ts': `export function log(m: string) { console.log(m) }\n`,
    'tests/users.test.ts': `import { describe } from 'vitest'\nimport { getUser } from '../src/services/users'\ndescribe('x', () => {})\n`,
    'node_modules/express/index.js': 'module.exports = {}',
    'dist/bundle.js': 'minified',
    'logo.png': 'binary',
  }
  const a = await analyzeRepo('acme', 'demo', undefined, undefined, () => {}, memorySource(files))

  it('ignores vendored, built and binary files', () => {
    expect(a.files.map((f) => f.path)).not.toEqual(expect.arrayContaining(['node_modules/express/index.js']))
    expect(a.files.some((f) => f.path.startsWith('dist/') || f.path.endsWith('.png'))).toBe(false)
  })
  it('builds the exact import graph', () => {
    const edges = a.links.map((l) => `${l.source} -> ${l.target}`).sort()
    expect(edges).toEqual([
      'src/index.ts -> src/routes/users.ts',
      'src/routes/users.ts -> src/services/users.ts',
      'src/services/users.ts -> src/db/client.ts',
      'src/services/users.ts -> src/models/user.ts',
      'tests/users.test.ts -> src/services/users.ts',
    ])
  })
  it('finds entry point, stack, packages and layers', () => {
    expect(a.entryPoints).toContain('src/index.ts')
    expect(a.stack.map((s) => s.name)).toEqual(expect.arrayContaining(['Express', 'Zod', 'Vitest']))
    expect(a.externals.map((e) => e.name).sort()).toEqual(['express', 'vitest', 'zod'])
    const layer = Object.fromEntries(a.files.map((f) => [f.path, f.layer]))
    expect(layer['src/routes/users.ts']).toBe('api')
    expect(layer['src/services/users.ts']).toBe('logic')
    expect(layer['src/db/client.ts']).toBe('data')
    expect(layer['src/models/user.ts']).toBe('data')
    expect(layer['tests/users.test.ts']).toBe('tests')
  })
  it('ranks the most depended-on file first and builds a tour', () => {
    // entry points get a deliberate boost; after them, the most depended-on file leads
    expect(a.keyFiles[0].path).toBe('src/index.ts')
    expect(a.keyFiles.filter((k) => !a.entryPoints.includes(k.path))[0].path).toBe('src/services/users.ts')
    expect(a.tour[0]).toMatchObject({ kind: 'readme', body: 'Demo is a tiny example service used to test the analysis pipeline end to end.' })
    expect(a.tour.some((t) => t.kind === 'entry' && t.path === 'src/index.ts')).toBe(true)
  })
  it('answers a question with the right file first', () => {
    const r = search(a, 'Where are the API routes?')
    expect(r.hits[0].path).toBe('src/routes/users.ts')
  })
})

describe('tsconfig parsing', () => {
  it('keeps "@/*" and "**/*" inside strings while dropping real comments', () => {
    const cfg = parseJsonc(`{
      // line comment
      "compilerOptions": { "baseUrl": ".", /* block */ "paths": { "@/*": ["./*"], "@app/*": ["./src/app/*"], }, },
      "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
    }`)
    expect(cfg.compilerOptions.paths['@/*']).toEqual(['./*'])
    expect(cfg.include).toEqual(['next-env.d.ts', '**/*.ts', '**/*.tsx'])
  })

  it('applies custom aliases and baseUrl from a real-world tsconfig', async () => {
    const files = {
      'tsconfig.json': `{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./*"], "@app/*": ["./src/app/*"] } }, "include": ["**/*.ts"] }`,
      'src/app/config.ts': 'export const c = 1\n',
      'types/index.d.ts': 'export type User = {}\n',
      'pages/index.ts': `import { c } from '@app/config'\nimport type { User } from 'types'\n`,
    }
    const r = await analyzeRepo('acme', 'demo', undefined, undefined, () => {}, memorySource(files))
    expect(r.links.map((l) => `${l.source} -> ${l.target}`)).toEqual(['pages/index.ts -> src/app/config.ts'])
    expect(r.externals.map((e) => e.name)).not.toContain('types')
  })
})

describe('path helpers', () => {
  it('joins and normalises', () => {
    expect(joinPath('src/a', '../b/./c')).toBe('src/b/c')
    expect(joinPath('', './x')).toBe('x')
  })
})
