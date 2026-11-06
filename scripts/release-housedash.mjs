#!/usr/bin/env node
// HouseDash veröffentlichen: bauen (ARM64), packen, signieren und als GitHub Release hochladen.
//
//   node scripts/release-housedash.mjs --init-key
//       Erzeugt einmalig das Signatur-Schlüsselpaar. Der private Schlüssel bleibt in
//       %USERPROFILE%\.housedash\release-signing-key.pem (nie ins Git, nie auf den Pi).
//       Der öffentliche Schlüssel landet in updater/release-public-key.pub und wird mit ausgeliefert.
//
//   node scripts/release-housedash.mjs --version 0.3.0 --repo besitzer/housedash-releases --notes "Was neu ist"
//       Baut und packt in %USERPROFILE%\.housedash\releases\0.3.0. Mit --publish zusätzlich hochladen (gh CLI).
//
// Images gehen in die GitHub Container Registry (ghcr.io/<besitzer>/housedash-*), das Manifest nennt sie mit
// Inhalts-Hash. Pis laden mit docker pull nur geänderte Schichten: ein normales Update sind wenige MB.
// Einmalig: docker login ghcr.io (siehe docs/UPDATES.md) und die drei Pakete auf GitHub öffentlich stellen.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = path.join(os.homedir(), '.housedash');
const keyPath = process.env.HOUSEDASH_RELEASE_KEY || path.join(home, 'release-signing-key.pem');
const publicKeyPath = path.join(root, 'updater/release-public-key.pub');
const IMAGES = [
  { name: 'housedash-app:latest', context: '.', package: 'housedash-app' },
  { name: 'housedash-voice:latest', context: './voice', package: 'housedash-voice' },
  { name: 'housedash-https:latest', context: './https', package: 'housedash-https' },
];

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const fail = message => { console.error(`Fehler: ${message}`); process.exit(1); };
const run = (command, list, options = {}) => {
  const result = spawnSync(command, list, { cwd: root, stdio: 'inherit', shell: false, ...options });
  if (result.status !== 0) fail(`${command} ${list.join(' ')} ist fehlgeschlagen.`);
};

if (flag('--init-key')) {
  if (fs.existsSync(keyPath)) fail(`Es gibt schon einen Schlüssel: ${keyPath}. Nicht überschreiben, sonst nehmen die Pis keine Updates mehr an.`);
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`Privater Schlüssel: ${keyPath}  (sicher aufbewahren, z. B. zusätzlich im Passwortmanager)`);
  console.log(`Öffentlicher Schlüssel: ${path.relative(root, publicKeyPath)}  (gehört ins Git)`);
  process.exit(0);
}

const version = value('--version');
const repo = value('--repo');
const notes = value('--notes') ?? '';
if (!/^\d{1,4}\.\d{1,4}\.\d{1,5}$/.test(version ?? '')) fail('--version im Format 1.2.3 angeben.');
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? '')) fail('--repo im Format besitzer/name angeben.');
if (!fs.existsSync(keyPath)) fail(`Kein Signatur-Schlüssel gefunden (${keyPath}). Zuerst --init-key ausführen.`);
const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
const publicKey = crypto.createPublicKey(fs.readFileSync(publicKeyPath));
const probe = Buffer.from('housedash');
if (!crypto.verify(null, probe, publicKey, crypto.sign(null, probe, privateKey))) fail('Privater und öffentlicher Schlüssel passen nicht zusammen.');

// Das Installationsskript für neue Pis enthält den öffentlichen Schlüssel fest. Er muss zum Schlüssel im Repo passen.
const installer = path.join(root, 'scripts/install-housedash.sh');
const keyBody = fs.readFileSync(publicKeyPath, 'utf8').split(String.fromCharCode(10)).map(line => line.trim()).filter(line => line && !line.startsWith('-----')).join('');
if (!fs.readFileSync(installer, 'utf8').includes(keyBody)) fail('scripts/install-housedash.sh enthält nicht den aktuellen öffentlichen Schlüssel.');
const tag = `v${version}`;
const base = `https://github.com/${repo}/releases/download/${tag}/`;
const out = path.join(home, 'releases', version);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1. Version und Update-Quelle in den Quellcode schreiben (geht mit dem Release an jeden Pi).
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (cmp(version, pkg.version) < 0) fail(`Die Version ${version} ist älter als die aktuelle (${pkg.version}).`);
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}
fs.writeFileSync(path.join(root, 'updater/update-source.json'), JSON.stringify({ repo }, null, 2) + '\n');
console.log(`Version ${version}, Quelle ${repo}`);

// 2. Images für ARM64 bauen und in die Registry schieben. Ohne Provenance/SBOM, damit der Hash ein
//    einfaches ARM64-Manifest ist. Der Build-Cache sorgt dafür, dass unveränderte Schichten gleich bleiben.
const owner = repo.split('/')[0].toLowerCase();
const upload = [];
const images = [];
for (const image of IMAGES) {
  const target = `ghcr.io/${owner}/${image.package}`;
  run('docker', ['buildx', 'build', '--platform', 'linux/arm64', '--provenance=false', '--sbom=false', '--load', '-t', image.name, '-t', `${target}:${version}`, image.context]);
  if (!flag('--publish')) { images.push({ name: image.name, ref: `${target}@sha256:${'0'.repeat(64)}` }); continue; }
  // Hochladen: nur Schichten, die ghcr.io noch nicht kennt. Danach steht der Inhalts-Hash in RepoDigests.
  run('docker', ['push', `${target}:${version}`]);
  const inspect = spawnSync('docker', ['image', 'inspect', '--format', '{{json .RepoDigests}}', `${target}:${version}`], { encoding: 'utf8' });
  const ref = (JSON.parse(inspect.stdout || '[]')).find(entry => entry.startsWith(`${target}@sha256:`));
  if (!/^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._-]+@sha256:[0-9a-f]{64}$/.test(ref ?? '')) fail(`Kein Image-Hash für ${image.package}.`);
  images.push({ name: image.name, ref });
}

const sha256File = file => new Promise((resolve, reject) => { const hash = crypto.createHash('sha256'); fs.createReadStream(file).on('data', d => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject); });

// 4. Quellcode packen (wie beim Deployment: ohne Daten, Zugangsdaten, Git und Build-Reste).
run('node', ['scripts/sync-housedash-source.mjs', '--manifest']);
const sourceFile = path.join(out, `housedash-source-${version}.tar.gz`);
// On Windows use the system bsdtar: GNU tar (Git Bash) reads "C:" as a remote host.
const systemTar = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');
const tarCommand = process.platform === 'win32' && fs.existsSync(systemTar) ? systemTar : 'tar';
run(tarCommand, ['-czf', sourceFile, '--exclude=./.git', '--exclude=./node_modules', '--exclude=./.next', '--exclude=.env', '--exclude=.env.*',
  '--exclude=./data', '--exclude=./backups', '--exclude=./.deploy', '--exclude=./.deploy.lock', '--exclude=./housedash-source.tar.gz',
  '--exclude=./coverage', '--exclude=./test-results', '--exclude=./playwright-report', '--exclude=./.idea', '--exclude=./.vscode',
  '--exclude=*.pem', '--exclude=*.tar.gz', '--exclude=*.tsbuildinfo', '-C', root, '.']);
const source = { url: base + path.basename(sourceFile), sha256: await sha256File(sourceFile), size: fs.statSync(sourceFile).size };
upload.unshift(sourceFile);

// 5. Manifest schreiben und signieren.
const manifest = { schema: 1, product: 'housedash', version, published: new Date().toISOString(), notes, source, images };
const manifestFile = path.join(out, 'manifest.json');
const data = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(manifestFile, data);
const signature = crypto.sign(null, data, privateKey);
if (!crypto.verify(null, data, publicKey, signature)) fail('Die Signatur ließ sich nicht prüfen.');
fs.writeFileSync(manifestFile + '.sig', signature);
const installerCopy = path.join(out, 'install-housedash.sh');
// Immer mit Unix-Zeilenenden ausliefern, sonst läuft bash auf dem Pi nicht.
fs.writeFileSync(installerCopy, fs.readFileSync(installer, 'utf8').split(String.fromCharCode(13)).join(''));
upload.push(manifestFile, manifestFile + '.sig', installerCopy);
console.log(`\nRelease ${version} liegt in ${out}`);
console.log(upload.map(f => `  ${path.basename(f)}  ${(fs.statSync(f).size / 1e6).toFixed(1)} MB`).join('\n'));

// 6. Veröffentlichen.
if (!flag('--publish')) {
  console.log('\nNoch nicht veröffentlicht (Probelauf, Image-Hashes sind Platzhalter). Mit --publish bauen, in ghcr.io schieben und hochladen.');
  console.log('Danach package.json, package-lock.json und updater/update-source.json committen.');
  process.exit(0);
}
const gh = spawnSync('gh', ['--version'], { encoding: 'utf8' });
if (gh.status !== 0) fail('Die GitHub CLI fehlt. Installieren: winget install GitHub.cli, dann gh auth login.');
run('gh', ['release', 'create', tag, ...upload, '--repo', repo, '--title', `HouseDash ${version}`, '--notes', notes || `HouseDash ${version}`, '--latest']);
console.log(`\nVeröffentlicht: https://github.com/${repo}/releases/tag/${tag}`);
console.log('Jetzt package.json, package-lock.json und updater/update-source.json committen.');
