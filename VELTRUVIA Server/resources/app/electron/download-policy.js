// ═══════════════════════════════════════════════════════════════════
// Download policy for the VELTRUVIA desktop shells.
//
// The shells previously cancelled EVERY download to suppress "Save As"
// dialogs for web content. That also killed the apps' own in-app exports:
//   • Patient  → "⬇ Export My Data" (JSON blob)
//   • Patient  → "📅 Export to Calendar (ICS)"
//   • Admin    → "⬇ Export audit log (CSV)"
// This policy allows files the app generates in-page (blob:/data: URLs)
// and still blocks web-initiated downloads (PDFs, EXEs, etc.).
// ═══════════════════════════════════════════════════════════════════

export function installDownloadPolicy(webContents, label = 'app') {
  webContents.session.on('will-download', (event, item) => {
    const src = String(item.getURL() || '');
    if (/^(blob:|data:)/i.test(src)) {
      // In-app generated file (Export My Data / ICS / CSV) — let Electron's
      // normal save flow run. No preventDefault() call.
      console.log(`[${label}] allowing in-app download: ${item.getFilename()}`);
      return;
    }
    event.preventDefault();
    try { item.cancel(); } catch {}
    console.log(`[${label}] download blocked: ${src.slice(0, 120)}`);
  });
}
