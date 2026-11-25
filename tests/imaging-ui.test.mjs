// The imaging API shipped once with no client at all — every endpoint was
// tested and correct, but no page ever called it. This locks the UI wiring so
// that gap cannot reopen silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APP = resolve('VELTRUVIA Server/resources/app');
const html = readFileSync(join(APP, 'public', 'index.html'), 'utf8');
const gallery = readFileSync(join(APP, 'public', 'js', 'page', 'index-5-imaging.js'), 'utf8');
const helpers = readFileSync(join(APP, 'public', 'js', 'page', 'index-1-helpers.js'), 'utf8');

test('imaging panel is reachable: nav item, panel, script tag', () => {
  assert.match(html, /data-action="showPanel:imaging/, 'nav item opens the imaging panel');
  assert.match(html, /id="panel-imaging"/, 'panel exists');
  assert.match(html, /js\/page\/index-5-imaging\.js/, 'gallery module is loaded');
});

test('navigation renders the gallery when the panel opens', () => {
  assert.match(helpers, /id==='imaging'/, 'showPanel dispatches to the imaging renderer');
  assert.match(helpers, /renderImagingPanel\(\)/, 'renderer is invoked');
});

test('DICOM studies open in the vendored Cornerstone3D viewer', () => {
  assert.match(gallery, /imgOpenDicom/, 'DICOM cards route to the viewer');
  assert.match(gallery, /await import\('\/js\/vendor\/cornerstone\/entry\.js[^']*'\)/, 'engine is lazy-loaded, not in the page bundle');
  assert.match(gallery, /dicomImageLoader\.wadouri\.fileManager\.add/, 'bytes go through the authenticated route');
  assert.match(html, /id="img-dcm-viewer"/, 'viewer modal exists');
  assert.ok(existsSync(join(APP, 'public', 'js', 'vendor', 'cornerstone', 'entry.js')), 'vendor bundle is present');
  assert.ok(existsSync(join(APP, 'public', 'js', 'vendor', 'cornerstone', 'decodeImageFrameWorker.js')), 'decode worker is self-hosted (CSP worker-src: self)');
});

test('gallery module uses the real imaging endpoints', () => {
  assert.match(gallery, /\/api\/images\?mrn=/, 'lists via the gallery endpoint');
  assert.match(gallery, /method: 'POST'[\s\S]{0,400}x-filename/, 'uploads raw bytes with x-filename');
  assert.match(gallery, /method: 'DELETE'/, 'can delete images');
});

// The gallery's Share button was removed on 2026-11-25: it handed out a
// login-free bearer link, which the operator judged not worth the exposure.
// The API route stays (tests/images.api.test.mjs exercises it), so this locks
// both halves: no share path in the page, the route still present on the server.
test('the gallery mints no share links, and the share route is untouched', () => {
  assert.doesNotMatch(gallery, /\/api\/images\/share/, 'no share call in the gallery module');
  assert.doesNotMatch(gallery, /imgShare|shareUrl/, 'no share helpers or state left behind');
  const routes = readFileSync(join(APP, 'src', 'routes', 'images.js'), 'utf8');
  assert.match(routes, /imagesRouter\.post\('\/share'/, 'POST /api/images/share still exists');
  assert.match(html, /id="img-gallery"/, 'the gallery container the module renders into still exists');
  assert.doesNotMatch(html, /img-share-out/, 'the share output box is gone from the page');
});
