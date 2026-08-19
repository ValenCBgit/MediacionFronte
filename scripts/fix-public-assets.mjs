import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Post-export fixup for the static Vercel deploy.
 *
 * `expo export` emits module assets (fonts, navigation icons) under
 * `public/assets/_node_modules/.pnpm/<pkg>/node_modules/<scope>/...`. That
 * inner literal `node_modules` directory is a problem twice over: the repo's
 * .gitignore silently drops it from commits, and Vercel's default ignore list
 * refuses to serve it even when committed — so the deployed site 404s every
 * font and falls back to system typography.
 *
 * This renames every `node_modules` directory under `public/assets` to `nm`
 * and rewrites the references inside the exported JS bundle and prerendered
 * HTML to match. Run it right after `expo export` (see `vercel-build` in the
 * root package.json).
 */
const PUBLIC_DIR = new URL('../public', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ASSETS_DIR = join(PUBLIC_DIR, 'assets');

function renameNodeModulesDirs(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  let renamed = 0;
  for (const entry of entries) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    let next = full;
    if (entry === 'node_modules') {
      next = join(dir, 'nm');
      renameSync(full, next);
      renamed += 1;
    }
    renamed += renameNodeModulesDirs(next);
  }
  return renamed;
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkFiles(full);
    } else {
      yield full;
    }
  }
}

const renamed = renameNodeModulesDirs(ASSETS_DIR);

// Rewrite only the asset-path occurrences, never arbitrary mentions of
// node_modules: match the full `assets/_node_modules/...` URL and rename the
// literal `node_modules` segments inside it.
const ASSET_PATH = /assets\/_node_modules\/[^"'()\\\s]*/g;
let patched = 0;
for (const file of walkFiles(PUBLIC_DIR)) {
  if (!/\.(js|html|css|json)$/.test(file)) continue;
  const before = readFileSync(file, 'utf8');
  const after = before.replace(ASSET_PATH, (path) => path.replaceAll('/node_modules/', '/nm/'));
  if (after !== before) {
    writeFileSync(file, after);
    patched += 1;
  }
}

console.log(`fix-public-assets: renamed ${renamed} node_modules dir(s), patched ${patched} file(s)`);
