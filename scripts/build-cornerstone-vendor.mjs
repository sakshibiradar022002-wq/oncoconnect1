/* Vendor build: Cornerstone3D → public/js/vendor/cornerstone/
 *
 * Cornerstone3D is not added to the app's package.json on purpose: it is a
 * browser-only artifact, vendored the same way jsQR and qrcode-generator are.
 * Rebuild with:
 *
 *   node scripts/build-cornerstone-vendor.mjs
 *
 * The build produces ESM chunks (not a single IIFE) because the DICOM image
 * loader creates its decode worker with
 *   new Worker(new URL('./decodeImageFrameWorker.js', import.meta.url), { type: 'module' })
 * so the worker must exist as a real, same-origin file next to its chunks for
 * the app's CSP (`worker-src 'self'`) to accept it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const CORE = '5.19.4';
const LOADER = '5.19.4';
const ESBUILD = '0.25.12';

const OUT = resolve('VELTRUVIA Server/resources/app/public/js/vendor/cornerstone');
const WORK = join(tmpdir(), 'veltruvia-cornerstone-build');

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

writeFileSync(join(WORK, 'package.json'), JSON.stringify({
  name: 'cornerstone-vendor-build', private: true, type: 'module',
}, null, 2));

execFileSync('npm', ['install', '--no-audit', '--no-fund',
  `@cornerstonejs/core@${CORE}`,
  `@cornerstonejs/dicom-image-loader@${LOADER}`,
  `esbuild@${ESBUILD}`,
], { cwd: WORK, stdio: 'inherit' });

writeFileSync(join(WORK, 'entry.js'), `import { init as coreInit, RenderingEngine, Enums, imageLoader } from '@cornerstonejs/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
export { coreInit, RenderingEngine, Enums, imageLoader, dicomImageLoader };
`);

// Node built-ins reachable from the DICOMweb/XML dependencies. Leaving them
// external produces a bundle that throws "Dynamic require of url" at runtime,
// so they are aliased to browser shims instead.
mkdirSync(join(WORK, 'shims'), { recursive: true });
writeFileSync(join(WORK, 'shims', 'url.js'), `export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
export const parse = (u) => { const x = new globalThis.URL(u, 'http://localhost'); return { protocol: x.protocol, host: x.host, pathname: x.pathname, search: x.search, href: x.href }; };
export default { URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams, parse };
`);
writeFileSync(join(WORK, 'shims', 'events.js'), `export class EventEmitter {
  constructor() { this._e = new Map(); }
  on(n, f) { if (!this._e.has(n)) this._e.set(n, []); this._e.get(n).push(f); return this; }
  addListener(n, f) { return this.on(n, f); }
  once(n, f) { const w = (...a) => { this.off(n, w); f(...a); }; return this.on(n, w); }
  off(n, f) { const l = this._e.get(n); if (l) this._e.set(n, l.filter(x => x !== f)); return this; }
  removeListener(n, f) { return this.off(n, f); }
  removeAllListeners(n) { if (n) this._e.delete(n); else this._e.clear(); return this; }
  emit(n, ...a) { for (const f of this._e.get(n) || []) f(...a); return true; }
}
export default EventEmitter;
`);
writeFileSync(join(WORK, 'shims', 'empty.js'), 'export default {};\nexport const createRequire = () => () => ({});\n');

rmSync(join(WORK, 'out'), { recursive: true, force: true });
execFileSync(join(WORK, 'node_modules', '.bin', 'esbuild'), [
  'entry.js',
  'node_modules/@cornerstonejs/dicom-image-loader/dist/esm/decodeImageFrameWorker.js',
  '--bundle', '--format=esm', '--splitting', '--minify', '--platform=browser',
  ...['fs', 'path', 'stream', 'util', 'crypto'].map((m) => `--alias:${m}=${join(WORK, 'shims', 'empty.js')}`),
  `--alias:url=${join(WORK, 'shims', 'url.js')}`,
  `--alias:events=${join(WORK, 'shims', 'events.js')}`,
  '--outdir=out', '--entry-names=[name]', '--chunk-names=[name]-[hash]',
], { cwd: WORK, stdio: 'inherit' });

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(join(WORK, 'out'))) {
  copyFileSync(join(WORK, 'out', f), join(OUT, f));
}
const total = readdirSync(OUT).reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
console.log(`cornerstone ${CORE} + dicom-image-loader ${LOADER} → ${OUT}`);
console.log(`${readdirSync(OUT).length} files, ${(total / 1048576).toFixed(2)} MB`);
