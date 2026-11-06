import type { LayerId } from './types'

/* ---------- Languages ---------- */

export const LANG_BY_EXT: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', pyi: 'Python',
  go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala',
  rb: 'Ruby', php: 'PHP', cs: 'C#', swift: 'Swift', dart: 'Dart',
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++', hh: 'C++', cxx: 'C++',
  vue: 'Vue', svelte: 'Svelte', astro: 'Astro',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'SCSS', less: 'Less',
  md: 'Markdown', mdx: 'Markdown', rst: 'Docs', txt: 'Text',
  json: 'JSON', yml: 'YAML', yaml: 'YAML', toml: 'TOML', xml: 'XML', ini: 'Config', env: 'Config',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'Shell', sql: 'SQL', graphql: 'GraphQL', gql: 'GraphQL',
  prisma: 'Prisma', proto: 'Protobuf', lua: 'Lua', ex: 'Elixir', exs: 'Elixir', hs: 'Haskell',
  zig: 'Zig', r: 'R', jl: 'Julia', sol: 'Solidity', tf: 'Terraform',
}

export const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3b82f6', JavaScript: '#facc15', Python: '#38bdf8', Go: '#22d3ee', Rust: '#f97316',
  Java: '#ef4444', Kotlin: '#a855f7', Scala: '#dc2626', Ruby: '#e11d48', PHP: '#818cf8', 'C#': '#22c55e',
  Swift: '#fb923c', Dart: '#2dd4bf', C: '#94a3b8', 'C++': '#f472b6', Vue: '#34d399', Svelte: '#ff6b3d',
  Astro: '#c084fc', HTML: '#f87171', CSS: '#60a5fa', SCSS: '#ec4899', Less: '#6366f1', Markdown: '#cbd5e1',
  Docs: '#cbd5e1', Text: '#64748b', JSON: '#a3a3a3', YAML: '#fca5a5', TOML: '#d4d4d4', XML: '#fdba74',
  Config: '#737373', Shell: '#4ade80', SQL: '#fbbf24', GraphQL: '#e879f9', Prisma: '#5eead4',
  Protobuf: '#a8a29e', Lua: '#6366f1', Elixir: '#a78bfa', Haskell: '#8b5cf6', Zig: '#f59e0b', R: '#60a5fa',
  Julia: '#a855f7', Solidity: '#94a3b8', Terraform: '#7c3aed', Other: '#525252',
}

export const langColor = (lang: string) => LANG_COLORS[lang] ?? LANG_COLORS.Other

export const CODE_LANGS = new Set([
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'Kotlin', 'Scala', 'Ruby', 'PHP', 'C#',
  'Swift', 'Dart', 'C', 'C++', 'Vue', 'Svelte', 'Astro', 'Elixir', 'Lua', 'Haskell', 'Zig',
])

/* ---------- Ignore rules ---------- */

export const IGNORED_DIRS = [
  'node_modules/', 'dist/', 'build/', '.git/', 'vendor/', '.next/', 'out/', 'coverage/', '__pycache__/',
  '.venv/', 'venv/', 'target/', '.idea/', '.vscode/', 'bower_components/', '.yarn/', '.turbo/', '.cache/',
]

export const IGNORED_FILES = [
  /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/, /bun\.lockb?$/, /Cargo\.lock$/, /poetry\.lock$/,
  /go\.sum$/, /composer\.lock$/, /Gemfile\.lock$/, /\.min\.(js|css)$/, /\.map$/,
  /\.(png|jpe?g|gif|webp|ico|bmp|svg|mp4|mp3|wav|ogg|webm|woff2?|ttf|eot|otf|pdf|zip|gz|tar|jar|exe|dll|so|dylib|bin|wasm|pyc|class|DS_Store)$/i,
]

/* ---------- Layers ---------- */

export const LAYERS: { id: LayerId; label: string; color: string; blurb: string }[] = [
  { id: 'interface', label: 'Interface', color: '#a78bfa', blurb: 'What users see: pages, components, views, styles.' },
  { id: 'api', label: 'Routes & API', color: '#38bdf8', blurb: 'Entry doors: routes, controllers, handlers, middleware.' },
  { id: 'logic', label: 'Core logic', color: '#34d399', blurb: 'The brain: services, hooks, state, domain rules.' },
  { id: 'data', label: 'Data', color: '#fbbf24', blurb: 'Memory: models, schemas, database access, migrations.' },
  { id: 'utils', label: 'Utilities', color: '#f472b6', blurb: 'Shared helpers, types and constants used everywhere.' },
  { id: 'config', label: 'Config & infra', color: '#94a3b8', blurb: 'Build tooling, CI, Docker, environment and settings.' },
  { id: 'tests', label: 'Tests', color: '#fb7185', blurb: 'Checks that prove the code does what it claims.' },
  { id: 'docs', label: 'Docs', color: '#cbd5e1', blurb: 'Guides, READMEs and examples for humans.' },
  { id: 'other', label: 'Other', color: '#64748b', blurb: 'Everything that does not fit a clear role.' },
]

export const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l])) as Record<LayerId, (typeof LAYERS)[number]>

const LAYER_RULES: { layer: LayerId; test: RegExp }[] = [
  { layer: 'tests', test: /(^|\/)(tests?|__tests__|spec|specs|e2e|cypress|playwright|testing)\/|[._-](test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py|rb)$/i },
  { layer: 'docs', test: /(^|\/)(docs?|documentation|examples?|samples?|website)\/|\.(md|mdx|rst|txt)$/i },
  { layer: 'config', test: /(^|\/)(\.github|\.circleci|scripts?|tools?|bin|deploy|infra|k8s|helm|docker|\.husky|config|configs|settings)\/|(^|\/)(Dockerfile|Makefile|Procfile|\.[a-z]+rc(\.[a-z]+)?|\.env[^/]*|[^/]*\.config\.[a-z]+|tsconfig[^/]*\.json|package\.json|pyproject\.toml|setup\.(py|cfg)|requirements[^/]*\.txt|go\.mod|Cargo\.toml|Gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?|docker-compose[^/]*\.ya?ml|vercel\.json|netlify\.toml|\.gitignore|\.editorconfig|LICENSE[^/]*)$|\.(ya?ml|toml|ini|tf)$/i },
  { layer: 'data', test: /(^|\/)(models?|schemas?|db|database|migrations?|prisma|entities|entity|repositor(y|ies)|dao|orm|seeds?|sql|store\/models)\/|\.(sql|prisma|graphql|gql|proto)$|(^|\/)(models?|schema|db|database)\.[a-z]+$/i },
  { layer: 'api', test: /(^|\/)(api|apis|routes?|routers?|controllers?|handlers?|endpoints?|middlewares?|server|resolvers?|views\.py|urls\.py|cmd|grpc|rest|http)(\/|\.[a-z]+$)|(^|\/)(server|app|main|index|router|routes|urls|wsgi|asgi)\.(js|ts|py|go|rb|php)$/i },
  { layer: 'interface', test: /(^|\/)(components?|pages|views|screens|layouts?|ui|templates?|widgets?|public|static|styles?|css|assets|theme|app\/[^/]*\/?page|frontend|client|web)\/|\.(tsx|jsx|vue|svelte|astro|html|htm|css|scss|sass|less)$/i },
  { layer: 'logic', test: /(^|\/)(services?|lib|libs|core|domain|hooks?|stores?|state|redux|features?|usecases?|modules?|engine|internal|pkg|src\/[^/]+\.(rs|go)|composables?|contexts?|providers?|actions?|reducers?|workers?|jobs?|tasks?)\//i },
  { layer: 'utils', test: /(^|\/)(utils?|utilities|helpers?|common|shared|constants?|types?|typings|interfaces|@types)\/|(^|\/)(utils?|helpers?|constants?|types)\.[a-z]+$|\.d\.ts$/i },
]

export function classifyLayer(path: string, lang: string): LayerId {
  for (const r of LAYER_RULES) if (r.test.test(path)) return r.layer
  if (CODE_LANGS.has(lang)) return 'logic'
  if (['JSON', 'YAML', 'TOML', 'Config', 'XML', 'Shell'].includes(lang)) return 'config'
  return 'other'
}

/* ---------- Folder roles ---------- */

const FOLDER_ROLES: [RegExp, string][] = [
  [/^(src|source|app|lib)$/i, 'Main source code — the heart of the project.'],
  [/^components?$/i, 'Reusable UI building blocks, assembled into pages.'],
  [/^pages|views|screens$/i, 'Full screens a user navigates between.'],
  [/^layouts?$/i, 'Page frames: headers, sidebars and shells around content.'],
  [/^(api|routes?|routers?)$/i, 'URL endpoints that receive requests and send responses.'],
  [/^controllers?$/i, 'Request handlers that turn HTTP calls into actions.'],
  [/^middlewares?$/i, 'Layers that wrap the core to add behaviour — logging, auth, persistence and the like.'],
  [/^services?$/i, 'Business logic — the actual work behind each feature.'],
  [/^(models?|entities)$/i, 'Shapes of the data the app stores and passes around.'],
  [/^(schemas?)$/i, 'Validation or database schemas describing data structure.'],
  [/^(db|database|prisma)$/i, 'Database connection, queries and schema.'],
  [/^migrations?$/i, 'Step-by-step database changes over time.'],
  [/^hooks?$/i, 'Reusable stateful logic for UI components.'],
  [/^(store|stores|state|redux)$/i, 'Global app state shared between screens.'],
  [/^(utils?|helpers?|common|shared)$/i, 'Small helpers used across the codebase.'],
  [/^(types?|typings|interfaces|@types)$/i, 'Type definitions describing data contracts.'],
  [/^(tests?|__tests__|spec|e2e)$/i, 'Automated tests that verify behaviour.'],
  [/^(docs?|documentation)$/i, 'Documentation for users and contributors.'],
  [/^(examples?|samples?|demo)$/i, 'Runnable examples showing how to use the project.'],
  [/^(scripts?|tools?|bin)$/i, 'Developer scripts for building, releasing or maintenance.'],
  [/^\.github$/i, 'GitHub config: CI workflows, issue templates, bots.'],
  [/^(config|configs|settings)$/i, 'Configuration values and environment setup.'],
  [/^(public|static|assets)$/i, 'Static files served as-is: images, fonts, icons.'],
  [/^(styles?|css|theme)$/i, 'Visual styling and design tokens.'],
  [/^(cmd)$/i, 'Executable entry points (Go convention: one folder per binary).'],
  [/^(internal|pkg)$/i, 'Go packages — internal ones are private to this module.'],
  [/^(core|domain|engine)$/i, 'Core domain logic independent of frameworks.'],
  [/^(packages|apps|modules|crates)$/i, 'Monorepo: several packages living side by side.'],
  [/^(server|backend)$/i, 'Server-side application code.'],
  [/^(client|frontend|web)$/i, 'Client-side application code.'],
  [/^(i18n|locales?|lang|translations)$/i, 'Translations for multiple languages.'],
  [/^(benchmarks?|bench)$/i, 'Performance benchmarks.'],
  [/^(fixtures?|mocks?|__mocks__)$/i, 'Fake data and stand-ins used by tests.'],
  [/^(workers?|jobs?|tasks?|queues?)$/i, 'Background jobs running outside the request cycle.'],
]

export function folderRole(name: string, layer: LayerId): string {
  for (const [re, role] of FOLDER_ROLES) if (re.test(name)) return role
  return LAYER_BY_ID[layer].blurb
}

/* ---------- Tech stack detection ---------- */

type StackDef = [name: string, category: string]

export const NPM_STACK: Record<string, StackDef> = {
  react: ['React', 'UI framework'], 'react-dom': ['React DOM', 'UI framework'], next: ['Next.js', 'Framework'],
  vue: ['Vue', 'UI framework'], nuxt: ['Nuxt', 'Framework'], svelte: ['Svelte', 'UI framework'],
  '@sveltejs/kit': ['SvelteKit', 'Framework'], 'solid-js': ['Solid', 'UI framework'], '@angular/core': ['Angular', 'Framework'],
  astro: ['Astro', 'Framework'], remix: ['Remix', 'Framework'], '@remix-run/react': ['Remix', 'Framework'],
  express: ['Express', 'Backend'], fastify: ['Fastify', 'Backend'], koa: ['Koa', 'Backend'], hono: ['Hono', 'Backend'],
  '@nestjs/core': ['NestJS', 'Backend'], 'socket.io': ['Socket.IO', 'Realtime'], ws: ['ws', 'Realtime'],
  '@trpc/server': ['tRPC', 'API'], graphql: ['GraphQL', 'API'], '@apollo/client': ['Apollo', 'API'], axios: ['Axios', 'HTTP'],
  prisma: ['Prisma', 'Database'], '@prisma/client': ['Prisma', 'Database'], 'drizzle-orm': ['Drizzle', 'Database'],
  mongoose: ['Mongoose', 'Database'], typeorm: ['TypeORM', 'Database'], sequelize: ['Sequelize', 'Database'],
  pg: ['PostgreSQL', 'Database'], mysql2: ['MySQL', 'Database'], redis: ['Redis', 'Database'], ioredis: ['Redis', 'Database'],
  '@supabase/supabase-js': ['Supabase', 'Database'], firebase: ['Firebase', 'Platform'],
  redux: ['Redux', 'State'], '@reduxjs/toolkit': ['Redux Toolkit', 'State'], zustand: ['Zustand', 'State'],
  jotai: ['Jotai', 'State'], mobx: ['MobX', 'State'], '@tanstack/react-query': ['TanStack Query', 'State'],
  tailwindcss: ['Tailwind CSS', 'Styling'], 'styled-components': ['styled-components', 'Styling'],
  '@emotion/react': ['Emotion', 'Styling'], sass: ['Sass', 'Styling'], '@mui/material': ['Material UI', 'Styling'],
  'framer-motion': ['Framer Motion', 'Animation'], gsap: ['GSAP', 'Animation'], three: ['Three.js', 'Graphics'], d3: ['D3', 'Graphics'],
  typescript: ['TypeScript', 'Language'], vite: ['Vite', 'Build'], webpack: ['Webpack', 'Build'], esbuild: ['esbuild', 'Build'],
  rollup: ['Rollup', 'Build'], turbo: ['Turborepo', 'Build'], tsup: ['tsup', 'Build'],
  jest: ['Jest', 'Testing'], vitest: ['Vitest', 'Testing'], mocha: ['Mocha', 'Testing'], cypress: ['Cypress', 'Testing'],
  '@playwright/test': ['Playwright', 'Testing'], '@testing-library/react': ['Testing Library', 'Testing'],
  eslint: ['ESLint', 'Quality'], prettier: ['Prettier', 'Quality'], zod: ['Zod', 'Validation'], yup: ['Yup', 'Validation'],
  'next-auth': ['NextAuth', 'Auth'], passport: ['Passport', 'Auth'], jsonwebtoken: ['JWT', 'Auth'], '@clerk/nextjs': ['Clerk', 'Auth'],
  openai: ['OpenAI SDK', 'AI'], '@anthropic-ai/sdk': ['Anthropic SDK', 'AI'], langchain: ['LangChain', 'AI'], ai: ['Vercel AI SDK', 'AI'],
  electron: ['Electron', 'Platform'], 'react-native': ['React Native', 'Platform'], expo: ['Expo', 'Platform'],
  stripe: ['Stripe', 'Payments'], '@stripe/stripe-js': ['Stripe', 'Payments'],
}

export const PY_STACK: Record<string, StackDef> = {
  django: ['Django', 'Backend'], flask: ['Flask', 'Backend'], fastapi: ['FastAPI', 'Backend'], starlette: ['Starlette', 'Backend'],
  uvicorn: ['Uvicorn', 'Backend'], gunicorn: ['Gunicorn', 'Backend'], celery: ['Celery', 'Background jobs'],
  sqlalchemy: ['SQLAlchemy', 'Database'], psycopg2: ['PostgreSQL', 'Database'], 'psycopg2-binary': ['PostgreSQL', 'Database'],
  pymongo: ['MongoDB', 'Database'], redis: ['Redis', 'Database'], alembic: ['Alembic', 'Database'], pydantic: ['Pydantic', 'Validation'],
  numpy: ['NumPy', 'Data science'], pandas: ['pandas', 'Data science'], scipy: ['SciPy', 'Data science'],
  'scikit-learn': ['scikit-learn', 'ML'], torch: ['PyTorch', 'ML'], tensorflow: ['TensorFlow', 'ML'], transformers: ['Transformers', 'ML'],
  openai: ['OpenAI SDK', 'AI'], anthropic: ['Anthropic SDK', 'AI'], langchain: ['LangChain', 'AI'],
  pytest: ['pytest', 'Testing'], requests: ['Requests', 'HTTP'], httpx: ['HTTPX', 'HTTP'], click: ['Click', 'CLI'], typer: ['Typer', 'CLI'],
  streamlit: ['Streamlit', 'UI framework'], jinja2: ['Jinja', 'Templates'], werkzeug: ['Werkzeug', 'Backend'], black: ['Black', 'Quality'], ruff: ['Ruff', 'Quality'],
}

export const FILE_STACK: [RegExp, StackDef][] = [
  [/(^|\/)Dockerfile$/, ['Docker', 'Infra']], [/docker-compose[^/]*\.ya?ml$/, ['Docker Compose', 'Infra']],
  [/^\.github\/workflows\//, ['GitHub Actions', 'CI/CD']], [/^\.gitlab-ci\.yml$/, ['GitLab CI', 'CI/CD']],
  [/^vercel\.json$/, ['Vercel', 'Hosting']], [/^netlify\.toml$/, ['Netlify', 'Hosting']],
  [/tailwind\.config\.[a-z]+$/, ['Tailwind CSS', 'Styling']], [/next\.config\.[a-z]+$/, ['Next.js', 'Framework']],
  [/vite\.config\.[a-z]+$/, ['Vite', 'Build']], [/schema\.prisma$/, ['Prisma', 'Database']],
  [/(^|\/)go\.mod$/, ['Go modules', 'Language']], [/(^|\/)Cargo\.toml$/, ['Cargo', 'Language']],
  [/(^|\/)manage\.py$/, ['Django', 'Backend']], [/\.tf$/, ['Terraform', 'Infra']], [/(^|\/)k8s\/|helm\//, ['Kubernetes', 'Infra']],
  [/(^|\/)pom\.xml$/, ['Maven', 'Build']], [/build\.gradle(\.kts)?$/, ['Gradle', 'Build']], [/(^|\/)Makefile$/, ['Make', 'Build']],
]

/* ---------- Concept search ---------- */

export const CONCEPTS: { label: string; query: string; terms: string[] }[] = [
  { label: 'Authentication', query: 'Where is auth handled?', terms: ['auth', 'login', 'logout', 'signin', 'signup', 'session', 'jwt', 'token', 'passport', 'oauth', 'password', 'credential', 'cookie', 'permission', 'role'] },
  { label: 'Database', query: 'How does it talk to the database?', terms: ['db', 'database', 'query', 'model', 'schema', 'migration', 'prisma', 'sql', 'orm', 'mongoose', 'sequelize', 'repository', 'table', 'insert', 'select'] },
  { label: 'API routes', query: 'Where are the API routes?', terms: ['route', 'router', 'api', 'endpoint', 'controller', 'handler', 'get(', 'post(', 'request', 'response', 'middleware'] },
  { label: 'State', query: 'How is state managed?', terms: ['state', 'store', 'reducer', 'context', 'useState', 'zustand', 'redux', 'signal', 'atom', 'dispatch'] },
  { label: 'Errors', query: 'How are errors handled?', terms: ['error', 'exception', 'catch', 'throw', 'raise', 'try', 'fail', 'panic', 'reject', 'logger'] },
  { label: 'Config', query: 'Where is configuration loaded?', terms: ['config', 'env', 'environment', 'settings', 'option', 'dotenv', 'process.env', 'os.environ'] },
  { label: 'Tests', query: 'How is it tested?', terms: ['test', 'describe', 'expect', 'assert', 'mock', 'fixture', 'spec', 'pytest', 'jest', 'vitest'] },
  { label: 'Styling', query: 'How is the UI styled?', terms: ['style', 'css', 'theme', 'tailwind', 'className', 'color', 'styled', 'scss'] },
]

const SYNONYMS: Record<string, string[]> = Object.fromEntries(
  CONCEPTS.flatMap((c) => c.terms.map((t) => [t, c.terms])),
)
Object.assign(SYNONYMS, {
  authentication: CONCEPTS[0].terms, authorization: CONCEPTS[0].terms, user: ['user', 'account', 'profile', 'member'],
  routing: CONCEPTS[2].terms, routes: CONCEPTS[2].terms, data: CONCEPTS[1].terms, storage: ['storage', 'store', 'save', 'persist', 'cache', 'file', 'upload'],
  upload: ['upload', 'file', 'multipart', 'storage', 'blob', 's3'], payment: ['payment', 'stripe', 'checkout', 'billing', 'invoice', 'price'],
  email: ['email', 'mail', 'smtp', 'sendgrid', 'nodemailer'], cache: ['cache', 'redis', 'memo', 'ttl'], log: ['log', 'logger', 'logging', 'debug'],
  start: ['main', 'index', 'app', 'server', 'bootstrap', 'init', 'start'], entry: ['main', 'index', 'app', 'server', 'bootstrap'],
  render: ['render', 'component', 'view', 'template', 'jsx'], ui: CONCEPTS[7].terms, errors: CONCEPTS[4].terms, error: CONCEPTS[4].terms,
  testing: CONCEPTS[6].terms, tested: CONCEPTS[6].terms, configuration: CONCEPTS[5].terms, styled: CONCEPTS[7].terms,
})

const STOP = new Set(['where', 'is', 'the', 'a', 'an', 'how', 'does', 'do', 'it', 'what', 'which', 'are', 'to', 'of', 'in', 'and', 'handled', 'with', 'for', 'this', 'that', 'code', 'file', 'files', 'managed', 'loaded', 'talk', 'from', 'on', 'by', 'be', 'i', 'can', 'find'])

export function expandQuery(q: string): string[] {
  const words = q.toLowerCase().replace(/[^a-z0-9_.(\s-]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w))
  const out = new Set<string>()
  for (const w of words) {
    out.add(w)
    const stem = w.replace(/(ing|ed|s)$/, '')
    if (stem.length > 2) out.add(stem)
    for (const s of SYNONYMS[w] ?? SYNONYMS[stem] ?? []) out.add(s.toLowerCase())
  }
  return [...out]
}
