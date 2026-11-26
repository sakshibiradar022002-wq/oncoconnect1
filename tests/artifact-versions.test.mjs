// Locks the download page's version wiring: a card must report the version its
// own manifest carries, and must claim nothing at all when no manifest exists.
// The script is a classic browser file, so it is loaded with a `window` stub
// rather than imported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
  new URL('../VELTRUVIA Server/resources/app/public/js/artifact-versions.js', import.meta.url),
  'utf8',
);

function loadScript() {
  const win = {};
  new Function('window', SRC)(win);
  return win.artifactVersions;
}

const YML = [
  'version: 2.6.3',
  'files:',
  '  - url: VELTRUVIA-Doctor-Setup.exe',
  '    sha512: abc',
  'path: VELTRUVIA-Doctor-Setup.exe',
  'sha512: abc',
  "releaseDate: '2026-10-10T13:05:00.000Z'",
  '',
].join('\n');

function makeLine(key, version = 'v2.6.8', date = 'Nov 25, 2026') {
  const badge = { textContent: version };
  const dateEl = { textContent: date };
  return {
    hidden: false,
    getAttribute: (name) => (name === 'data-artifact' ? key : null),
    querySelector: (sel) => {
      if (sel === '.v-badge') return badge;
      if (sel === '[data-artifact-date]') return dateEl;
      return null;
    },
    badge,
    dateEl,
  };
}

function makeDoc(lines, pill = { textContent: 'Secure Cloud · v2.6.8' }, badge = { textContent: 'v2.6.8' }) {
  return {
    querySelectorAll: (sel) => (sel === '[data-artifact]' ? lines : []),
    getElementById: (id) => ({ 'suite-pill': pill, 'suite-badge': badge }[id] || null),
  };
}

function fakeFetch(map) {
  const fn = async (url) => {
    fn.calls.push(url);
    const body = map[url];
    if (!body) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
  fn.calls = [];
  return fn;
}

test('parses version and releaseDate from a published manifest', () => {
  const { parseManifest } = loadScript();
  assert.deepEqual(parseManifest(YML), { version: '2.6.3', releaseDate: '2026-10-10T13:05:00.000Z' });
  // Unquoted variants are just as likely once a build tool rewrites the file.
  assert.deepEqual(
    parseManifest('version: 2.6.8\nreleaseDate: 2026-11-25T00:00:00.000Z\n'),
    { version: '2.6.8', releaseDate: '2026-11-25T00:00:00.000Z' },
  );
  assert.deepEqual(parseManifest(''), { version: null, releaseDate: null });
});

test('formats a manifest date in UTC, and ignores nonsense', () => {
  const { formatDate } = loadScript();
  assert.equal(formatDate('2026-10-10T13:05:00.000Z'), 'Oct 10, 2026');
  assert.equal(formatDate('not a date'), '');
  assert.equal(formatDate(null), '');
});

test('each card shows the version its own artifact carries', async () => {
  const { wire } = loadScript();
  const doctor = makeLine('doctor');
  const lab = makeLine('lab');
  const doc = makeDoc([doctor, lab]);
  const fetchFn = fakeFetch({
    '/downloads/latest-doctor.yml': YML,
    '/downloads/latest-lab.yml': 'version: 2.6.5\nreleaseDate: 2026-11-01T00:00:00.000Z\n',
    '/downloads/latest-server.yml': YML,
  });

  await wire({ document: doc, fetch: fetchFn });

  assert.equal(doctor.badge.textContent, 'v2.6.3');
  assert.equal(doctor.dateEl.textContent, 'Oct 10, 2026');
  assert.equal(doctor.hidden, false);
  assert.equal(lab.badge.textContent, 'v2.6.5');
  assert.equal(lab.dateEl.textContent, 'Nov 1, 2026');
  assert.ok(fetchFn.calls.includes('/downloads/latest-doctor.yml'));
  assert.ok(fetchFn.calls.includes('/downloads/latest-server.yml'));
});

test('a card with no manifest claims no version at all', async () => {
  const { wire } = loadScript();
  const doctor = makeLine('doctor');
  const doc = makeDoc([doctor]);

  await wire({ document: doc, fetch: fakeFetch({}) });

  assert.equal(doctor.hidden, true);
  assert.equal(doctor.badge.textContent, 'v2.6.8', 'stale markup text must not be rewritten, the line is hidden instead');
});

test('the header drops its version when the server manifest is missing', async () => {
  const { wire } = loadScript();
  const pill = { textContent: 'Secure Cloud · v2.6.8' };
  const badge = { textContent: 'v2.6.8' };
  const doc = makeDoc([], pill, badge);

  await wire({ document: doc, fetch: fakeFetch({}) });

  assert.equal(pill.textContent, 'Secure Cloud');
  assert.equal(badge.textContent, 'Secure Cloud');
});

test('a manifest without a version line is treated as missing', async () => {
  const { wire } = loadScript();
  const doctor = makeLine('doctor');
  const doc = makeDoc([doctor]);

  await wire({ document: doc, fetch: fakeFetch({ '/downloads/latest-doctor.yml': 'files: []\n' }) });

  assert.equal(doctor.hidden, true);
});
