"""Ground truth for Python imports, using Python's own parser (ast).

Usage: python -I scripts/py_imports.py <repo_dir> < files.txt
Reads repo-relative .py paths on stdin and prints JSON {path: [resolved internal paths]}.
The repository is only read, never imported or executed.
"""
import ast
import json
import os
import sys

repo = sys.argv[1]
paths = [p.strip() for p in sys.stdin if p.strip().endswith(('.py', '.pyi'))]
all_files = set()
for root, dirs, files in os.walk(repo):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '.venv', 'venv')]
    for f in files:
        all_files.add(os.path.relpath(os.path.join(root, f), repo).replace(os.sep, '/'))

roots = ['', 'src', 'lib'] + sorted({os.path.dirname(f) for f in all_files if os.path.basename(f) in ('setup.py', 'pyproject.toml') and os.path.dirname(f)})


def module_file(parts):
    """Map module path parts (already rooted) to a file, or None."""
    base = '/'.join(p for p in parts if p)
    for cand in (base + '.py', base + '.pyi', base + '/__init__.py'):
        if cand.strip('/') in all_files:
            return cand.strip('/')
    return None


def absolute(mod):
    for r in roots:
        hit = module_file(([r] if r else []) + mod.split('.'))
        if hit:
            return hit
    return None


def relative(path, level, mod):
    pkg = path.split('/')[:-1]
    if level - 1 > len(pkg):
        return None
    base = pkg[: len(pkg) - (level - 1)]
    if mod:
        return module_file(base + mod.split('.'))
    init = '/'.join(base + ['__init__.py'])
    return init if base and init in all_files else None


out = {}
for path in paths:
    try:
        tree = ast.parse(open(os.path.join(repo, path), encoding='utf8', errors='replace').read())
    except SyntaxError:
        out[path] = None
        continue
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                hit = absolute(a.name)
                if hit:
                    found.add(hit)
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ''
            resolve = (lambda m: relative(path, node.level, m)) if node.level else absolute
            pkg_hit = resolve(mod) if mod or node.level else None
            attr = False
            for a in node.names:
                if a.name == '*':
                    attr = True
                    continue
                sub = resolve(f'{mod}.{a.name}' if mod else a.name)
                if sub:
                    found.add(sub)
                else:
                    attr = True
            if attr and pkg_hit:
                found.add(pkg_hit)
    found.discard(path)
    out[path] = sorted(found)
print(json.dumps(out))
