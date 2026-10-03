// Shared WebRTC config for VELTRUVIA video calls.
// Fetches TURN relay coordinates from the server (/api/telehealth/ice-servers)
// so calls work across carrier-grade NAT, not just same-network pairs.
// Falls back to a public STUN server when the fetch fails or yields nothing.
// v2.5: credentials are time-limited (server mints them hourly), so the
// response is cached in sessionStorage until shortly before expiry.
window.VELTRUVIA_RTC = {
  iceServers: null, // populated async below
  rtcConfiguration() {
    const ice = (this.iceServers && this.iceServers.length)
      ? this.iceServers
      : [{ urls: 'stun:stun.l.google.com:19302' }];
    return { iceServers: ice, iceCandidatePoolSize: 4 };
  },
};

(async () => {
  try {
    // Serve from cache when the minted credentials are still fresh —
    // avoids a fresh credential per call and keeps call-open instant.
    const cached = sessionStorage.getItem('vx_ice_config');
    if (cached) {
      try {
        const c = JSON.parse(cached);
        if (c && c.expiresAt > Date.now() && Array.isArray(c.iceServers) && c.iceServers.length) {
          window.VELTRUVIA_RTC.iceServers = c.iceServers;
          return;
        }
      } catch { sessionStorage.removeItem('vx_ice_config'); }
    }
    // window.fetch may be patched by mobile-api.js on the APKs to attach the
    // Bearer token — so this call authenticates on native sessions too.
    const r = await fetch('/api/telehealth/ice-servers');
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.iceServers) && d.iceServers.length) {
        window.VELTRUVIA_RTC.iceServers = d.iceServers;
        const ttlSec = Number(d.ttl) > 0 ? Number(d.ttl) : 600;
        // Refresh 5 minutes before the minted credentials expire.
        sessionStorage.setItem('vx_ice_config', JSON.stringify({
          iceServers: d.iceServers,
          expiresAt: Date.now() + Math.max(60, ttlSec - 300) * 1000,
        }));
      }
    }
  } catch { /* offline / older build — STUN fallback stays */ }
})();
