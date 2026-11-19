// ───────────────────────────────────────────────────────────────────────
// Client-side SHA-256 verification for published VELTRUVIA installers.
//
// The page loads /downloads/SHA256SUMS.txt (the same file the release job
// writes) and hashes the selected file locally with Web Crypto — the file
// never leaves the browser. A file matches when its digest equals the
// published digest for that filename, or the digest of any published entry
// if the file was renamed (e.g. saved as "…(1).exe").
//
// External script on purpose: the server's CSP allows only 'self' scripts.
// ───────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var SUMS_URL = '/downloads/SHA256SUMS.txt';

  var fileInput = document.getElementById('vf-file');
  var pickBtn = document.getElementById('vf-pick');
  var dropZone = document.getElementById('vf-drop');
  var statusEl = document.getElementById('vf-status');
  var resultEl = document.getElementById('vf-result');
  var expectedEl = document.getElementById('vf-expected');
  var sumsEl = document.getElementById('vf-sums');

  if (!fileInput || !statusEl || !resultEl) return;

  var published = Object.create(null); // filename -> sha256
  var anyHash = Object.create(null);   // sha256 -> filename

  function setStatus(text) { statusEl.textContent = text; }

  function clearResult() {
    resultEl.className = 'vf-result';
    resultEl.textContent = '';
  }

  function showResult(kind, title, detail) {
    resultEl.className = 'vf-result ' + kind;
    resultEl.textContent = '';
    var strong = document.createElement('strong');
    strong.textContent = title;
    resultEl.appendChild(strong);
    if (detail) {
      var p = document.createElement('span');
      p.textContent = ' ' + detail;
      resultEl.appendChild(p);
    }
  }

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
  }

  function loadSums() {
    if (!sumsEl) return;
    fetch(SUMS_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var count = 0;
        text.split('\n').forEach(function (line) {
          var parts = line.trim().split(/\s+/);
          if (parts.length < 2) return;
          var hash = parts[0].toLowerCase();
          if (!/^[0-9a-f]{64}$/.test(hash)) return;
          var name = parts.slice(1).join(' ');
          published[name] = hash;
          anyHash[hash] = name;
          count++;
        });
        sumsEl.textContent = count
          ? count + ' published checksum' + (count === 1 ? '' : 's') + ' loaded.'
          : 'No checksums found in ' + SUMS_URL + '.';
      })
      .catch(function () {
        sumsEl.textContent = 'Could not load ' + SUMS_URL + ' — paste the expected hash below to compare manually.';
      });
  }

  function humanSize(n) {
    if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
  }

  function verify(file) {
    if (!file) return;
    if (!window.crypto || !window.crypto.subtle) {
      showResult('bad', 'Cannot hash in this browser.',
        'SHA-256 needs a secure context (https://) and a modern browser.');
      return;
    }
    clearResult();
    if (pickBtn) pickBtn.disabled = true;
    setStatus('Hashing ' + file.name + ' (' + humanSize(file.size) + ')…');

    file.arrayBuffer()
      .then(function (buf) {
        return window.crypto.subtle.digest('SHA-256', buf);
      })
      .then(function (digest) {
        var actual = toHex(digest);
        var expected = (expectedEl && expectedEl.value || '').trim().toLowerCase();
        var matchName = published[file.name];
        var matchHash = anyHash[actual];

        if (expected) {
          if (expected === actual) {
            showResult('ok', '✓ MATCH', 'The SHA-256 of ' + file.name + ' matches the hash you pasted.');
          } else {
            showResult('bad', '✗ NO MATCH', 'Pasted hash starts with ' + expected.slice(0, 12) +
              '… but this file hashes to ' + actual.slice(0, 12) + '…');
          }
        } else if (matchName) {
          if (matchName === actual) {
            showResult('ok', '✓ VERIFIED', file.name + ' matches the published checksum.');
          } else {
            showResult('bad', '✗ MISMATCH', file.name + ' is listed as ' + matchName.slice(0, 16) +
              '… but the file on disk hashes to ' + actual.slice(0, 16) + '…');
          }
        } else if (matchHash) {
          showResult('ok', '✓ VERIFIED', 'Contents match the published ' + matchHash + ' release.');
        } else {
          showResult('unknown', 'Not a published release',
            'This file is not listed in ' + SUMS_URL + '. Hash your own build the same way, or check you downloaded it from this site.');
        }

        setStatus(file.name + ' · SHA-256: ' + actual);
      })
      .catch(function (e) {
        showResult('bad', 'Hashing failed.', e && e.message ? e.message : '');
        setStatus('');
      })
      .then(function () {
        if (pickBtn) pickBtn.disabled = false;
      });
  }

  if (pickBtn) {
    pickBtn.addEventListener('click', function () { fileInput.click(); });
  }
  fileInput.addEventListener('change', function () {
    verify(fileInput.files && fileInput.files[0]);
  });

  if (dropZone) {
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropZone.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropZone.classList.remove('over');
      });
    });
    dropZone.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      verify(files && files[0]);
    });
  }

  if (expectedEl) {
    expectedEl.addEventListener('input', function () {
      if (fileInput.files && fileInput.files[0]) verify(fileInput.files[0]);
    });
  }

  loadSums();
})();
