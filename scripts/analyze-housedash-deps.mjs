// Maintenance inventory, not a test: records imports reachable from HouseDash entry points.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const options = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config.compilerOptions;
const compiler = ts.convertCompilerOptionsFromJson(options, root).options;
const walk = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const p = path.join(dir, entry.name);
  return entry.isDirectory() ? entry.name === '__tests__' ? [] : walk(p) : [p];
}) : [];
const entries = ['src/app/family', 'src/app/api/family', 'src/app/api/backup',
  'src/app/api/auth/login', 'src/app/api/auth/logout', 'src/app/api/auth/password', 'src/app/api/auth/status', 'src/app/api/auth/ip-allowlist',
  'src/app/api/backgrounds/route.ts', 'src/app/api/backgrounds/serve', 'src/app/api/weather/route.ts',
  'src/app/api/geocode', 'src/app/api/health', 'src/app/layout.tsx', 'src/app/page.tsx', 'src/app/error.tsx',
  'src/app/global-error.tsx', 'src/app/login', 'src/proxy.ts', 'src/instrumentation.ts'];
const roots = entries.flatMap(p => fs.existsSync(p) ? fs.statSync(p).isDirectory() ? walk(p).filter(f => /\.(?:ts|tsx|css)$/.test(f)) : [p] : []).map(p => path.resolve(p));
const seen = new Set(), packages = new Set(), missing = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  if (!/\.(?:ts|tsx|js|mjs|mts)$/.test(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const add = name => {
    if (!name.startsWith('.') && !name.startsWith('@/')) {
      if (!name.startsWith('node:')) packages.add(name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]);
      return;
    }
    const target = ts.resolveModuleName(name, file, compiler, ts.sys).resolvedModule?.resolvedFileName;
    if (target && !target.includes('node_modules')) visit(path.resolve(target));
    else {
      const asset = path.resolve(path.dirname(file), name);
      if (fs.existsSync(asset)) seen.add(asset); else missing.add(`${path.relative(root, file)}: ${name}`);
    }
  };
  function node(n) {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) add(n.moduleSpecifier.text);
    if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || n.expression.getText(ast) === 'require') && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) add(n.arguments[0].text);
    ts.forEachChild(n, node);
  }
  node(ast);
}
roots.forEach(visit);
const result = { entries, files: [...seen].map(f => path.relative(root, f).replaceAll('\\', '/')).sort(), packages: [...packages].sort(), missing: [...missing].sort() };
fs.mkdirSync('.next/cache', { recursive: true });
fs.writeFileSync('.next/cache/housedash-dependencies.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ files: result.files.length, packages: result.packages, missing: result.missing }));
