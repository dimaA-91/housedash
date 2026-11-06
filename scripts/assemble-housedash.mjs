// Package an explicit runtime tree; never copy live data or the repository wholesale.
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const out = path.resolve(root, '.next/housedash-runtime');
if (!out.startsWith(path.resolve(root, '.next') + path.sep)) throw new Error('Unsafe package target');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
// Turbopack's .next/node_modules aliases must remain relative to ARM64 node_modules.
// The default cpSync rewrites symlinks to absolute build-machine paths.
const copy = (source, target) => fs.cpSync(path.resolve(root, source), path.join(out, target), { recursive: true, verbatimSymlinks: true });
copy('.next/standalone/server.js', 'server.js');
copy('package.json', 'package.json');
copy('.next/standalone/.next', '.next');
copy('.next/static', '.next/static');
copy('public', 'public');
// Shared data validators read dictionaries from disk. Keep backup compatibility.
copy('LICENSE', 'LICENSE');
if (fs.existsSync('NOTICE.md')) copy('NOTICE.md', 'NOTICE.md');
copy('src/app/family/fonts/OFL.txt', 'licenses/DM-Sans-OFL.txt');
copy('src/app/family/fonts/Font-Awesome-LICENSE.txt', 'licenses/Font-Awesome-LICENSE.txt');
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
console.log('HouseDash runtime assembled (no live data, editor, plugins, build tools or old release scripts).');
