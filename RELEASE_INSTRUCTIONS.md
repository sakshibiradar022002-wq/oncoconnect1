# How to share VELTRUVIA Pro

Your portable `.exe` is ready at `dist-desktop/VELTRUVIA Pro 1.0.0.exe` (79 MB).

## Option 1: GitHub Release (Recommended)

1. Go to https://github.com/sakshibiradar022002-wq/veltruvia1/releases
2. Click **"Draft a new release"**
3. Click **"Choose a tag"** → type `v1.0.0` → click **"Create new tag"**
4. Title: `VELTRUVIA Pro v1.0.0`
5. Description:
   ```
   🧬 Portable single-file release — no installation needed.

   **What's included:**
   - Doctor Portal (EMR & Patient Management)
   - Patient App (Symptom Tracker & Care)
   - Lab Portal (Test Management)
   - All data stored locally with AES-256 encryption

   **How to use:**
   1. Download the .exe below
   2. Double-click to run (no install required)
   3. Choose your portal from the launcher
   ```
6. Under **"Attach binaries"**, drag in `dist-desktop/VELTRUVIA Pro 1.0.0.exe`
7. Check **"Set as the latest release"**
8. Click **"Publish release"**

Your download link will be:
```
https://github.com/sakshibiradar022002-wq/veltruvia1/releases/download/v1.0.0/VELTRUVIA%20Pro%201.0.0.exe
```

## Option 2: Host the download page

The download page is at `public/download.html`. To make it live:

### GitHub Pages
```bash
git checkout -b gh-pages
git add public/download.html
# Move it to the root:
mv public/download.html download.html
git add download.html
git commit -m "Add download page"
git push origin gh-pages
```
Then enable Pages in repo Settings → Pages → Source: `gh-pages`.

Your download page: `https://sakshibiradar022002-wq.veltruvia1.github.io/veltruvia1/download.html`

### Or share just the .exe directly
Upload the file to any file-sharing service (Google Drive, Dropbox, etc.) and share the link.

## Rebuilding the portable .exe

In the future, run:
```bash
npm run electron:portable
```
This handles all the cache fixes automatically.
