// Source-only synchronization. Persistent data, photos, secrets and Git are never targets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const manifestPath = path.join(root, 'scripts/housedash-source-files.json');
const prefixes = ['src/', 'scripts/', 'docs/', 'phone/', 'public/', 'website/', 'e2e/', 'image-creation/', 'infrastructure/', 'RELEASE_NOTES/', '.github/'];
const retiredRootFiles = new Set(['playwright.config.ts', 'vitest.config.ts', 'vitest.setup.ts', 'postcss.config.mjs', 'compose.example.yaml']);
if (process.argv.includes('--manifest')) {
  const files = [];
  function walk(dir, relative = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = relative + entry.name;
      if (entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === '.venv') continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), name + '/');
      else if (entry.isFile()) files.push(name);
    }
  }
  for (const dir of ['src', 'scripts', 'docs', 'phone', 'voice', 'https', 'public', 'updater']) {
    if (fs.existsSync(path.join(root, dir))) walk(path.join(root, dir), dir + '/');
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith('.env')) files.push(entry.name);
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, files: files.sort() }, null, 2) + '\n');
  console.log(`HouseDash source manifest: ${files.length} files`);
} else if (process.argv.includes('--prune')) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('Invalid source manifest');
  const keep = new Set(manifest.files);
  const retired = JSON.parse(fs.readFileSync(path.join(root, 'scripts/retired-upstream-files.json'), 'utf8'));
  const targets = retired.filter(relative => !keep.has(relative)).map(relative => {
    if (typeof relative !== 'string' || relative.split('/').some(part => part === '..' || part === '.') || relative.includes('\\') || relative.startsWith('public/backgrounds/') ||
      !(prefixes.some(prefix => relative.startsWith(prefix)) || retiredRootFiles.has(relative))) throw new Error('Unsafe source target');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) throw new Error('Source path escapes application directory');
    if (fs.existsSync(target) && (!fs.realpathSync(target).startsWith(root + path.sep) || !fs.lstatSync(target).isFile())) throw new Error('Unsafe source file');
    return target;
  });
  let count = 0;
  for (const target of targets) {
    if (fs.existsSync(target)) { fs.unlinkSync(target); count++; }
    let dir = path.dirname(target);
    while (dir !== root && dir.startsWith(root + path.sep) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir); dir = path.dirname(dir);
    }
  }
  console.log(`Removed ${count} retired source files; live data and photos preserved.`);
} else throw new Error('Use --manifest or --prune');
