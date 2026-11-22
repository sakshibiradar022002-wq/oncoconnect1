// ═══════════════════════════════════════════════════════════════════
// IMAGING GALLERY — the client for /api/images
//
// The imaging API (upload, gallery, bytes, share, delete) shipped without
// any screen reaching it. This page module closes that gap: patient picker,
// raw-body upload, thumbnail grid, full-size viewer, time-limited share
// links and delete.
//
// Endpoints used (src/routes/images.js):
//   POST   /api/images/:mrn         raw bytes, x-filename / x-note headers
//   GET    /api/images?mrn=         gallery listing
//   GET    /api/images/:id/file     bytes (cookie-authenticated)
//   POST   /api/images/share        { imageId, expiresInDays }
//   DELETE /api/images/:id          remove image + bytes
//
// CSP note: no inline handlers — everything is wired through data-action,
// matching the rest of the app.
// ═══════════════════════════════════════════════════════════════════

const IMG = { mrn: '', images: [], shareUrl: '', total: 0, hasMore: false };
const IMG_MAX_BYTES = 10 * 1024 * 1024;
const IMG_PAGE = 200;

function imgEl(id) { return document.getElementById(id); }

function imgMsg(text, ok) {
  const el = imgEl('img-msg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = ok ? 'var(--green)' : 'var(--red)';
}

/** Fill the patient picker from the same registry the rest of the app uses. */
function imgFillPatients() {
  const sel = imgEl('img-mrn');
  if (!sel) return;
  const current = sel.value;
  let pats = [];
  try { pats = (typeof getMyPatients === 'function' ? getMyPatients() : []).slice(); } catch { pats = []; }
  pats.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  sel.innerHTML = '<option value="">— Select patient —</option>' + pats.map((p) =>
    `<option value="${escAttr(p.mrn)}">${esc(p.name || 'Unnamed')} · ${esc(p.mrn)}</option>`
  ).join('');
  if (current) sel.value = current;
}

/** Entry point called from showPanel('imaging'). */
function renderImagingPanel() {
  imgFillPatients();
  imgLoadGallery();
}

/** A share link belongs to the image it was made for — drop it on reload. */
function imgClearShare() {
  IMG.shareUrl = '';
  const out = imgEl('img-share-out');
  if (out) out.innerHTML = '';
}

async function imgLoadGallery(more = false) {
  const box = imgEl('img-gallery');
  if (!box) return;
  const sel = imgEl('img-mrn');
  const mrn = String(sel ? sel.value : '').toUpperCase();
  IMG.mrn = mrn;
  if (!mrn) {
    IMG.images = [];
    IMG.total = 0;
    IMG.hasMore = false;
    imgClearShare();
    box.innerHTML = '<div class="empty-card">Select a patient to view imaging studies.</div>';
    return;
  }
  const offset = more ? IMG.images.length : 0;
  if (!more) {
    IMG.images = [];
    imgClearShare();
    box.innerHTML = '<div class="empty-card">Loading images…</div>';
  }
  try {
    // api() on this page is the doctor app helper: api('/path', {method, body}).
    const data = await api(`/images?mrn=${encodeURIComponent(mrn)}&limit=${IMG_PAGE}&offset=${offset}`);
    const batch = Array.isArray(data?.images) ? data.images : [];
    IMG.images = more ? IMG.images.concat(batch) : batch;
    IMG.total = Number.isFinite(Number(data?.total)) ? Number(data.total) : IMG.images.length;
    IMG.hasMore = data?.hasMore === true;
    imgRenderGallery();
  } catch (err) {
    box.innerHTML = `<div class="empty-card">Could not load images: ${esc(err.message || err)}</div>`;
  }
}

function imgLoadMore() { imgLoadGallery(true); }

function imgRenderGallery() {
  const box = imgEl('img-gallery');
  if (!box) return;
  if (!IMG.images.length) {
    box.innerHTML = `<div class="empty-card">No images for ${esc(IMG.mrn)} yet. Upload one above.</div>`;
    return;
  }
  const more = IMG.hasMore
    ? `<div style="text-align:center;margin-top:14px;">
         <button class="btn btn-ghost btn-sm" data-action="imgLoadMore">Load more (${IMG.images.length} of ${IMG.total})</button>
       </div>`
    : '';
  box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;">'
    + IMG.images.map(imgCard).join('') + '</div>' + more;
}

function imgCard(im) {
  const id = escAttr(im.id);
  const fileUrl = `/api/images/${encodeURIComponent(im.id)}/file`;
  const isDicom = im.mimeType === 'application/dicom';
  const thumb = isDicom
    ? `<div data-action="imgOpenDicom:${id}" style="height:116px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:var(--surface2);border-radius:8px;font-size:26px;cursor:pointer;" title="Open in the DICOM viewer">🧠<span style="font-size:10px;color:var(--text-dim);">DICOM · view</span></div>`
    : `<img src="${fileUrl}" alt="${escAttr(im.originalName || 'Imaging study')}" loading="lazy"
         style="width:100%;height:116px;object-fit:cover;border-radius:8px;background:var(--surface2);cursor:zoom-in;"
         data-action="imgView:${id}">`;
  const shared = im.sharedUntil
    ? `<span style="font-size:10px;color:var(--green);font-weight:700;">shared until ${esc(formatDate(im.sharedUntil))}</span>`
    : '';
  return `
    <div class="card" style="padding:10px;margin:0;">
      ${thumb}
      <div style="font-size:12px;font-weight:700;margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escAttr(im.originalName || '')}">${esc(im.originalName || 'Image')}</div>
      <div style="font-size:10.5px;color:var(--text-dim);">${esc(formatDateTime(im.createdAt))} · ${esc(imgSize(im.sizeBytes))}</div>
      ${im.note ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${esc(im.note)}</div>` : ''}
      ${shared}
      <div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;">
        ${isDicom ? `<button class="btn btn-primary btn-sm" data-action="imgOpenDicom:${id}">View</button>` : ''}
        <a class="btn btn-ghost btn-sm" href="${fileUrl}" target="_blank" rel="noopener" style="text-decoration:none;">Open</a>
        <button class="btn btn-ghost btn-sm" data-action="imgShare:${id}">Share</button>
        <button class="btn btn-ghost btn-sm" data-action="imgDelete:${id}" style="color:var(--red);">Delete</button>
      </div>
    </div>`;
}

function imgSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

/** Upload the selected file as raw bytes (no multipart — mirrors the API). */
async function imgUpload() {
  const sel = imgEl('img-mrn');
  const mrn = String(sel ? sel.value : '').toUpperCase();
  const fileInput = imgEl('img-file');
  const file = fileInput?.files?.[0];
  if (!mrn) { imgMsg('Select a patient first.', false); return; }
  if (!file) { imgMsg('Choose an image file to upload.', false); return; }
  if (file.size > IMG_MAX_BYTES) { imgMsg('Image is larger than 10 MB.', false); return; }

  const note = String(imgEl('img-note')?.value || '').replace(/[^\x20-\x7E]/g, '').slice(0, 300);
  imgMsg('Uploading…', true);
  try {
    const res = await fetch('/api/images/' + encodeURIComponent(mrn), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'x-filename': file.name,
        'x-note': note,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    if (fileInput) fileInput.value = '';
    const noteInput = imgEl('img-note');
    if (noteInput) noteInput.value = '';
    imgMsg('Uploaded — bytes are SHA-256 verified on every read.', true);
    await imgLoadGallery();
  } catch (err) {
    imgMsg('Upload failed: ' + (err.message || err), false);
  }
}

/** Full-size viewer (images only; DICOM opens as a file). */
function imgView(id) {
  const im = IMG.images.find((i) => i.id === id);
  if (im && im.mimeType === 'application/dicom') { imgOpenDicom(id); return; }
  const overlay = imgEl('img-viewer');
  const image = imgEl('img-viewer-img');
  const cap = imgEl('img-viewer-cap');
  if (!im || !overlay || !image) return;
  image.src = `/api/images/${encodeURIComponent(im.id)}/file`;
  image.alt = im.originalName || 'Imaging study';
  if (cap) cap.textContent = [im.originalName, formatDateTime(im.createdAt), im.note].filter(Boolean).join(' · ');
  overlay.style.display = 'flex';
}

function imgCloseViewer() {
  const overlay = imgEl('img-viewer');
  if (overlay) overlay.style.display = 'none';
  const image = imgEl('img-viewer-img');
  if (image) image.src = '';
}

async function imgShare(id) {
  const out = imgEl('img-share-out');
  try {
    const data = await api('/images/share', {
      method: 'POST',
      body: JSON.stringify({ imageId: id, expiresInDays: 7 }),
    });
    IMG.shareUrl = location.origin + data.shareUrl;
    if (out) {
      out.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <input id="img-share-url" readonly value="${escAttr(IMG.shareUrl)}" style="flex:1;min-width:180px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:11.5px;">
          <button class="btn btn-ghost btn-sm" data-action="imgCopyShare">Copy</button>
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">Anyone with this link can view the image until ${esc(formatDateTime(data.expiresAt))}. No patient identifiers are in the link.</div>`;
    }
    await imgLoadGallery();
  } catch (err) {
    if (out) out.innerHTML = `<div style="font-size:12px;color:var(--red);">Could not create a share link: ${esc(err.message || err)}</div>`;
  }
}

function imgCopyShare() {
  const input = imgEl('img-share-url');
  if (!input) return;
  input.select();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(input.value).catch(() => {});
  } else {
    try { document.execCommand('copy'); } catch {}
  }
}

async function imgDelete(id) {
  if (!confirm('Delete this image permanently? The file and its metadata are removed.')) return;
  try {
    await api('/images/' + encodeURIComponent(id), { method: 'DELETE' });
    imgMsg('Image deleted.', true);
    await imgLoadGallery();
  } catch (err) {
    imgMsg('Delete failed: ' + (err.message || err), false);
  }
}

// ═══════════════════════════════════════════════════════════════════
// DICOM VIEWER — Cornerstone3D (vendored, MIT)
//
// Loaded lazily on first DICOM open so the ~3 MB engine stays out of the
// initial page load. Bytes come from the authenticated /api/images/:id/file
// route (not the loader's own XHR) and are handed to Cornerstone as a File,
// so session cookies and the server's SHA-256 check are both preserved.
// ═══════════════════════════════════════════════════════════════════
const IMG_DCM = { cs: null, engine: null, vp: null, host: null };

async function imgEnsureCornerstone() {
  if (IMG_DCM.cs) return IMG_DCM.cs;
  // Version query: the vendor bundle is a static file, so browsers would
  // otherwise keep serving a previous build after an upgrade.
  const cs = await import('/js/vendor/cornerstone/entry.js?v=2.6.7');
  // CPU rendering: no WebGL context limits, deterministic in Electron.
  if (typeof cs.setUseCPURendering === 'function') cs.setUseCPURendering(true);
  await cs.coreInit();
  cs.dicomImageLoader.init({ maxWebWorkers: 1 });
  IMG_DCM.cs = cs;
  return cs;
}

async function imgOpenDicom(id) {
  const im = IMG.images.find((i) => i.id === id);
  const overlay = imgEl('img-dcm-viewer');
  const host = imgEl('img-dcm-element');
  const status = imgEl('img-dcm-status');
  const title = imgEl('img-dcm-title');
  const download = imgEl('img-dcm-download');
  if (!im || !overlay || !host) return;

  const setStatus = (t) => { if (status) status.textContent = t || ''; };
  overlay.style.display = 'flex';
  host.innerHTML = '';
  IMG_DCM.host = host;
  if (title) title.textContent = im.originalName || 'DICOM study';
  if (download) download.href = `/api/images/${encodeURIComponent(im.id)}/file`;

  try {
    setStatus('loading viewer…');
    const cs = await imgEnsureCornerstone();

    setStatus('downloading study…');
    const res = await fetch(`/api/images/${encodeURIComponent(im.id)}/file`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();
    const file = new File([buf], im.originalName || 'study.dcm', { type: 'application/dicom' });
    const imageId = cs.dicomImageLoader.wadouri.fileManager.add(file);
    await cs.imageLoader.loadAndCacheImage(imageId);

    const el = document.createElement('div');
    el.style.cssText = 'width:100%;height:100%;';
    host.appendChild(el);

    imgDcmDestroy();
    const engine = new cs.RenderingEngine('VELTRUVIA_IMG_DCM');
    engine.enableElement({
      viewportId: 'VELTRUVIA_IMG_DCM_VP',
      type: cs.Enums.ViewportType.STACK,
      element: el,
      defaultOptions: { background: [0, 0, 0] },
    });
    const vp = engine.getViewport('VELTRUVIA_IMG_DCM_VP');
    await vp.setStack([imageId], 0);
    vp.render();
    IMG_DCM.engine = engine;
    IMG_DCM.vp = vp;
    imgDcmBindGestures(el, vp);
    setStatus('drag = window/level · shift+drag = pan · wheel = zoom');
  } catch (err) {
    setStatus('Viewer failed: ' + (err.message || err) + ' — use Download instead.');
  }
}

function imgDcmDestroy() {
  if (IMG_DCM.engine) {
    try { IMG_DCM.engine.destroy(); } catch {}
  }
  IMG_DCM.engine = null;
  IMG_DCM.vp = null;
}

function imgDcmClose() {
  const overlay = imgEl('img-dcm-viewer');
  const host = imgEl('img-dcm-element');
  imgDcmDestroy();
  if (host) host.innerHTML = '';
  if (overlay) overlay.style.display = 'none';
}

function imgDcmZoom(dir) {
  const vp = IMG_DCM.vp;
  if (!vp) return;
  try {
    const cam = vp.getCamera();
    vp.setCamera({ parallelScale: Math.max(0.05, cam.parallelScale * (dir < 0 ? 1.2 : 0.83)) });
    vp.render();
  } catch {}
}

function imgDcmReset() {
  const vp = IMG_DCM.vp;
  if (!vp) return;
  try { vp.resetCamera(); vp.render(); } catch {}
}

function imgDcmBindGestures(el, vp) {
  let drag = null;
  el.style.cursor = 'crosshair';

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture?.(e.pointerId);
    const rect = el.getBoundingClientRect();
    let world = null;
    try { world = vp.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top]); } catch {}
    drag = {
      x: e.clientX,
      y: e.clientY,
      pan: e.shiftKey,
      cam: vp.getCamera(),
      voi: vp.getProperties().voiRange,
      world,
    };
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    try {
      if (drag.pan) {
        const rect = el.getBoundingClientRect();
        const now = vp.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top]);
        if (drag.world && now) {
          const d = [now[0] - drag.world[0], now[1] - drag.world[1], now[2] - drag.world[2]];
          vp.setCamera({
            focalPoint: drag.cam.focalPoint.map((v, i) => v - d[i]),
            position: drag.cam.position.map((v, i) => v - d[i]),
          });
        }
      } else {
        const voi = drag.voi || { lower: 0, upper: 255 };
        const w0 = Math.max(1, voi.upper - voi.lower);
        const c0 = (voi.upper + voi.lower) / 2;
        const w = Math.max(1, w0 + dx * 4);
        const c = c0 + dy * 2;
        vp.setProperties({ voiRange: { lower: c - w / 2, upper: c + w / 2 } });
      }
      vp.render();
    } catch {}
  });

  el.addEventListener('pointerup', () => { drag = null; });
  el.addEventListener('pointercancel', () => { drag = null; });

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    try {
      const cam = vp.getCamera();
      vp.setCamera({ parallelScale: Math.max(0.05, cam.parallelScale * (e.deltaY < 0 ? 0.9 : 1.1)) });
      vp.render();
    } catch {}
  }, { passive: false });
}
