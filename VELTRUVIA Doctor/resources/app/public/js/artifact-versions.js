// ═════════════════════════════════════════════════════════════════════
// VELTRUVIA download page — artifact versions.
//
// The page used to assert a version in hand-written HTML, while the bytes
// served from /downloads could be weeks older — a visitor was told they were
// getting a build they were not. Each card now reads its version and date from
// that artifact's own updater manifest (latest-<app>.yml, written when the
// build is published). No manifest means no claim: the version line is hidden
// rather than guessed.
// ═════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // electron-builder writes `version: 2.6.3` and
  // `releaseDate: '2026-10-10T13:05:00.000Z'`; both are sometimes unquoted.
  // Only these two keys are read — never eval or a YAML parser.
  function parseManifest(text) {
    var src = String(text || '');
    var v = /^version:\s*'?([^'\r\n]+?)'?\s*$/m.exec(src);
    var d = /^releaseDate:\s*'?([^'\r\n]+?)'?\s*$/m.exec(src);
    return {
      version: v ? v[1].trim() : null,
      releaseDate: d ? d[1].trim() : null,
    };
  }

  function formatDate(iso) {
    var t = Date.parse(String(iso || ''));
    if (!t) return '';
    var d = new Date(t);
    return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }

  async function load(fetchFn, key) {
    try {
      var r = await fetchFn('/downloads/latest-' + key + '.yml', { cache: 'no-store' });
      if (!r || !r.ok) return null;
      var m = parseManifest(await r.text());
      return m.version ? m : null;
    } catch (e) {
      return null;
    }
  }

  // doc/fetch are injected so the behaviour can be exercised without a browser.
  async function wire(opts) {
    var doc = opts.document;
    var fetchFn = opts.fetch;

    var lines = Array.prototype.slice.call(doc.querySelectorAll('[data-artifact]') || []);
    await Promise.all(lines.map(async function (line) {
      var m = await load(fetchFn, line.getAttribute('data-artifact'));
      if (!m) { line.hidden = true; return; }
      // Markup ships with the line hidden, so no manifest can still leave a
      // stale version on screen — it is only revealed once read.
      line.hidden = false;
      var badge = line.querySelector('.v-badge');
      if (badge) badge.textContent = 'v' + m.version;
      var dateEl = line.querySelector('[data-artifact-date]');
      var pretty = formatDate(m.releaseDate);
      if (dateEl && pretty) dateEl.textContent = pretty;
    }));

    // The header describes the suite, which ships with the server build.
    var suite = await load(fetchFn, 'server');
    var pill = doc.getElementById('suite-pill');
    var badge = doc.getElementById('suite-badge');
    if (suite && suite.version) {
      if (pill) pill.textContent = 'Secure Cloud · v' + suite.version;
      if (badge) { badge.textContent = 'v' + suite.version; badge.hidden = false; }
    } else {
      if (pill) pill.textContent = 'Secure Cloud';
      // Never invent a version for the header: the span ships empty and hidden.
      if (badge) badge.hidden = true;
    }
  }

  window.artifactVersions = { parseManifest: parseManifest, formatDate: formatDate, wire: wire };
})();
