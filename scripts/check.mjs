// Lightweight pre-build check: every source module must parse, and the
// anti-cheat module must be imported by the entry point (so nobody can
// silently ship a build without it).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../src', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(root);

let failed = false;
for (const f of files) {
  // `node --check` only parses; .js is treated as ESM because package.json has "type": "module".
  const r = spawnSync(process.execPath, ['--check', f]);
  if (r.status !== 0) {
    failed = true;
    console.error(`✖ ${f}\n${r.stderr.toString()}`);
  }
}

const entry = readFileSync(join(root, 'main.js'), 'utf8');
if (!/from ['"]\.\/anticheat\/sentinel\.js['"]/.test(entry)) {
  failed = true;
  console.error('✖ src/main.js must import ./anticheat/sentinel.js');
}

// If a production build exists, it must not carry the dev test handle.
import { existsSync } from 'node:fs';
const dist = new URL('../dist/assets', import.meta.url).pathname;
if (existsSync(dist)) {
  for (const name of readdirSync(dist)) {
    if (name.endsWith('.js') && readFileSync(join(dist, name), 'utf8').includes('__flick')) {
      failed = true;
      console.error(`✖ dist/assets/${name} leaks the dev test handle`);
    }
  }
}

if (failed) process.exit(1);
console.log(`✔ ${files.length} modules parsed, sentinel wired.`);
