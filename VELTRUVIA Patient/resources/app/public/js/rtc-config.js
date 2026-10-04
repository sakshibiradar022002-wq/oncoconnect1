// Shared WebRTC config for VELTRUVIA video calls.
// Fetches TURN relay coordinates from the server (/api/telehealth/ice-servers)
// so calls work across carrier-grade NAT, not just same-network pairs.
// Falls back to a public STUN server when no TURN is configured.
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
    const r = await fetch('/api/telehealth/ice-servers');
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.iceServers) && d.iceServers.length) {
        window.VELTRUVIA_RTC.iceServers = d.iceServers;
      }
    }
  } catch { /* offline/older build — STUN fallback stays */ }
})();
