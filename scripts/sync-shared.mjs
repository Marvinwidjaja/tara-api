// Keeps src/shared identical to the Expo app's ../TARA/src/shared (the source of truth): the
// reply classifier, translated messages, activity library, report builders and API types.
//
//   npm run sync-shared          copy the app's files here (adds the ".js" import extensions Node needs)
//   npm run sync-shared -- --check   exit 1 if they differ (for CI)
//
// Runs automatically before `npm run dev`, `npm run build` and `npm test`. If the app folder isn't
// there (e.g. on a server that only has the backend), it does nothing and the committed copy is used.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const check = process.argv.includes('--check');
const from = path.resolve(root, process.env.SHARED_SOURCE ?? '../TARA/src/shared');
const to = path.join(root, 'src/shared');

if (!existsSync(from)) {
  console.log(`[sync-shared] ${from} not found; using the existing src/shared.`);
  process.exit(0);
}

const render = (file) => {
  const source = readFileSync(path.join(from, file), 'utf-8').replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+?)(['"])/g,
    (_, a, spec, b) => `${a}${spec.endsWith('.js') ? spec : `${spec}.js`}${b}`
  );
  return `// Synced from the Expo app (TARA/src/shared/${file}) by \`npm run sync-shared\`. Edit it there.\n${source}`;
};

const wanted = readdirSync(from).filter((f) => f.endsWith('.ts'));
mkdirSync(to, { recursive: true });
const existing = readdirSync(to).filter((f) => f.endsWith('.ts'));

const changed = wanted.filter((f) => !existing.includes(f) || readFileSync(path.join(to, f), 'utf-8') !== render(f));
const removed = existing.filter((f) => !wanted.includes(f));

if (check) {
  if (changed.length || removed.length) {
    console.error(`[sync-shared] out of date: ${[...changed, ...removed].join(', ')}. Run npm run sync-shared.`);
    process.exit(1);
  }
  console.log('[sync-shared] in sync');
  process.exit(0);
}

for (const f of changed) writeFileSync(path.join(to, f), render(f));
for (const f of removed) rmSync(path.join(to, f));
console.log(
  changed.length || removed.length
    ? `[sync-shared] updated: ${[...changed, ...removed.map((f) => `${f} (removed)`)].join(', ')}`
    : '[sync-shared] in sync'
);
