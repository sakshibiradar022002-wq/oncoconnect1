# Cornerstone3D (vendored)

Prebuilt browser bundle used by the imaging panel to display DICOM studies.

- `@cornerstonejs/core` **5.19.4** — MIT — https://github.com/cornerstonejs/cornerstone3D
- `@cornerstonejs/dicom-image-loader` **5.19.4** — MIT (see `LICENSE.dicom-image-loader`) — https://github.com/cornerstonejs/cornerstone3D

Rebuild with `node scripts/build-cornerstone-vendor.mjs` (root of the repo). The
output is ESM with shared chunks on purpose: the DICOM loader starts its decode
worker from `new URL('./decodeImageFrameWorker.js', import.meta.url)`, so
`decodeImageFrameWorker.js` must sit next to the chunks it imports. That keeps
the app's CSP (`worker-src 'self'`) intact — no `blob:` worker, no CDN.

`entry.js` is loaded lazily, on first DICOM open (`import()` from
`public/js/page/index-5-imaging.js`), so the ~3 MB engine never touches the
initial page load.

Not in `package.json` deliberately: it is a browser artifact, vendored like
`js/vendor/jsQR.js`. Do not add it to `dependencies`.
