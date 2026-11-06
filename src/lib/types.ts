export type LayerId =
  | 'interface'
  | 'api'
  | 'logic'
  | 'data'
  | 'utils'
  | 'config'
  | 'tests'
  | 'docs'
  | 'other'

export interface RepoMeta {
  owner: string
  name: string
  branch: string
  description: string
  stars: number
  forks: number
  openIssues: number
  url: string
  topics: string[]
  license: string | null
  updatedAt: string
  avatar: string
  truncated: boolean
}

export interface FileEntry {
  path: string
  name: string
  dir: string
  ext: string
  size: number
  lang: string
  layer: LayerId
}

export interface ParsedFile {
  path: string
  lines: number
  imports: string[] // resolved internal paths
  externals: string[] // package names
  symbols: { kind: string; name: string; line: number }[]
  content: string
}

export interface StackItem {
  name: string
  category: string
  source: string
}

export interface TreeNode {
  name: string
  path: string
  size: number
  children?: TreeNode[]
  file?: FileEntry
}

export interface GraphNode {
  id: string
  layer: LayerId
  group: string
  inDeg: number
  outDeg: number
}

export interface GraphLink {
  source: string
  target: string
}

export interface FolderInsight {
  path: string
  files: number
  bytes: number
  topLang: string
  layer: LayerId
  role: string
}

export interface KeyFile {
  path: string
  score: number
  reasons: string[]
}

export interface TourStep {
  title: string
  path?: string
  body: string
  kind: 'readme' | 'manifest' | 'entry' | 'hub' | 'layer' | 'folder'
}

export interface Analysis {
  meta: RepoMeta
  files: FileEntry[]
  parsed: Record<string, ParsedFile>
  languages: { name: string; bytes: number; color: string }[]
  stack: StackItem[]
  tree: TreeNode
  nodes: GraphNode[]
  links: GraphLink[]
  layerFlows: { from: LayerId; to: LayerId; count: number }[]
  layerCounts: Record<LayerId, number>
  folders: FolderInsight[]
  entryPoints: string[]
  keyFiles: KeyFile[]
  externals: { name: string; count: number }[]
  tour: TourStep[]
  readme: string | null
  totalLines: number
}

export interface ScanProgress {
  stage: number
  label: string
  discovered: number
  parsed: number
  toParse: number
  imports: number
  recent: { path: string; lang: string }[]
}
