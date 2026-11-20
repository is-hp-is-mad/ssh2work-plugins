import fs from 'node:fs';
import path from 'node:path';
import { validatePluginTree } from './validate-plugins.mjs';

const root = process.cwd();
const pluginsRoot = path.join(root, 'plugins');
const localPlugins = new Map();

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name === 'plugin.json') {
      const rel = path.relative(root, full).replace(/\\/g, '/');
      localPlugins.set(rel, fs.readFileSync(full, 'utf8'));
    }
  }
}

if (fs.existsSync(pluginsRoot)) walk(pluginsRoot);

const res = validatePluginTree({ basePlugins: new Map(), headPlugins: localPlugins, isMaintainer: true });
if (!res.ok) {
  console.error('Validation failed, cannot build registry.json');
  process.exit(1);
}

const list = [];
for (const [relPath, raw] of [...localPlugins.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const data = JSON.parse(raw);
  const parts = relPath.split('/');
  list.push({
    id: data.id,
    name: data.name,
    version: data.version,
    author: data.author || 'ssh4work',
    category: data.category || parts[1] || 'general',
    description: data.description || '',
    tab: data.tab || null,
    quickCommands: Array.isArray(data.quickCommands) ? data.quickCommands : [],
    path: relPath,
  });
}

const registry = {
  version: 1,
  updatedAt: new Date().toISOString(),
  plugins: list,
};

fs.writeFileSync(path.join(root, 'registry.json'), JSON.stringify(registry, null, 2) + '\n', 'utf8');
console.log(`Generated registry.json with ${list.length} plugins.`);
