"""Deterministically publish the sealed JSON token contract as consumer CSS."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
tokens = json.loads((ROOT / 'src/design/tokens.json').read_text())
mappings = json.loads((ROOT / 'src/design/tokenMappings.json').read_text())
leaves = []

def walk(node, path):
    if isinstance(node, dict):
        if '$type' in node:
            leaves.append((path, node))
        else:
            for key, value in node.items():
                walk(value, path + [key])

for namespace in ['primitive', 'semantic', 'component']:
    walk(tokens[namespace], [namespace])

def kebab(text):
    return re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', text).lower()

def variable(path):
    return '--cuk-' + '-'.join(kebab(part) for part in path)

def css_value(value):
    return re.sub(r'\{([\w.]+)\}', lambda match: 'var(' + variable(match[1].split('.')) + ')', str(value))

def block(selector, values):
    return selector + ' {\n' + ''.join(f'  {key}: {value};\n' for key, value in values) + '}\n'

base = []
for path, node in leaves:
    value = node.get('$value', node.get('modes', {}).get('dark.normal', node.get('density', {}).get('regular', node.get('scale', {}).get('1'))))
    if value is None:
        raise ValueError(f'Unresolved token: {path}')
    base.append((variable(path), css_value(value)))
    if path[0] == 'semantic':
        base.append(('--mv-' + '-'.join(kebab(part) for part in path[1:]), 'var(' + variable(path) + ')'))

css = '/* Generated from tokens.json and tokenMappings.json; no independent values. */\n' + block(':root', base)
for scheme in ['light', 'dark']:
    css += f':root[data-theme-scheme="{scheme}"] {{ color-scheme: {scheme}; }}\n'
    for contrast in ['normal', 'high']:
        css += block(f':root[data-theme-scheme="{scheme}"][data-theme-contrast="{contrast}"]', [(variable(path), css_value(node['modes'][scheme + '.' + contrast])) for path, node in leaves if 'modes' in node])
for axis, attribute in [('density', 'data-theme-density'), ('scale', 'data-theme-text-scale')]:
    modes = sorted({mode for _, node in leaves for mode in node.get(axis, {})})
    for mode in modes:
        css += block(f':root[{attribute}="{mode}"]', [(variable(path), css_value(node[axis][mode])) for path, node in leaves if axis in node])
for axis, attribute, mode, query in [('forcedColors', 'data-theme-forced-colors', 'active', '(forced-colors: active)'), ('reducedMotion', 'data-theme-motion', 'reduce', '(prefers-reduced-motion: reduce)')]:
    values = [(variable(path), css_value(node[axis][mode])) for path, node in leaves if axis in node]
    css += block(f':root[{attribute}="{mode}"]', values)
    css += '@media ' + query + ' {\n' + block(':root', values) + '}\n'
vendor = []
for token in mappings['vendorSurfaces']['dockview']['tokens']:
    if token['status'] == 'mapped':
        vendor.append((token['vendorToken'], 'var(' + variable(token['sourceToken'].split('.')) + ')'))
    elif token['status'] == 'approved_default':
        vendor.append((token['vendorToken'], css_value(token['defaultValue'])))
css += block('.mv-dockview-theme', vendor)
(ROOT / 'src/design/theme.css').write_text(css)
