/**
 * Shared connection UI & logic for standalone portal Electron apps.
 *
 * Each portal app (doctor / patient / lab) shows a dramatically different
 * connection screen — different colors, layout, branding, and personality.
 * They look like completely separate products.
 */

import { join } from 'node:path';

/**
 * Build the connection-screen HTML for a given portal.
 * Each portal has its own fully unique design.
 */
export function getConnectionHTML(opts) {
  const { portal } = opts;

  if (portal === 'doctor')  return getDoctorConnection();
  if (portal === 'patient') return getPatientConnection();
  if (portal === 'lab')     return getLabConnection();
  return getDoctorConnection(); // fallback
}

// ══════════════════════════════════════════════════════════════════
//  DOCTOR — Blue, clinical, professional dashboard feel
// ══════════════════════════════════════════════════════════════════
function getDoctorConnection() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OncoConnect Doctor</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#060b18;--surface:#0c1526;--surface2:#111d35;--border:#1a2d50;--border2:#243a5e;
--blue:#3b82f6;--blue2:#1d4ed8;--blue3:#1e40af;--blue-glow:rgba(59,130,246,.15);
--text:#e2e8f0;--text-muted:#7a8baa;--text-dim:#3d506e;
--green:#22c55e;--red:#ef4444;--cyan:#06b6d4;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);
display:flex;min-height:100vh;overflow:hidden;-webkit-app-region:drag;}
.drag{position:fixed;top:0;left:0;right:0;height:32px;z-index:100;}
/* ── Left panel (branding) ── */
.left{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
background:linear-gradient(160deg,#040810 0%,#0a1528 40%,#0f1f3a 70%,#162a4a 100%);
padding:48px;position:relative;overflow:hidden;}
.left::before{content:'';position:absolute;top:-40%;right:-30%;width:600px;height:600px;
border-radius:50%;background:radial-gradient(circle,rgba(59,130,246,.06) 0%,transparent 70%);pointer-events:none;}
.left::after{content:'';position:absolute;bottom:-30%;left:-20%;width:500px;height:500px;
border-radius:50%;background:radial-gradient(circle,rgba(30,64,175,.05) 0%,transparent 60%);pointer-events:none;}
.brand{position:relative;z-index:1;text-align:center;}
.brand-icon{width:80px;height:80px;border-radius:20px;background:linear-gradient(135deg,#2563eb,#1d4ed8);
display:inline-flex;align-items:center;justify-content:center;font-size:38px;
box-shadow:0 12px 48px rgba(37,99,235,.4);margin-bottom:24px;}
.brand h1{font-size:2rem;font-weight:800;letter-spacing:-.8px;margin-bottom:4px;}
.brand .tag{display:inline-block;padding:5px 14px;border-radius:8px;font-size:11px;font-weight:700;
letter-spacing:1.2px;text-transform:uppercase;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.15);color:var(--blue);}
.brand .desc{margin-top:20px;font-size:14px;color:var(--text-muted);line-height:1.6;max-width:320px;}
.features{margin-top:36px;display:flex;flex-direction:column;gap:14px;position:relative;z-index:1;}
.feat{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-muted);}
.feat-icon{width:32px;height:32px;border-radius:8px;background:rgba(59,130,246,.08);
border:1px solid rgba(59,130,246,.1);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
/* ── Right panel (form) ── */
.right{width:480px;display:flex;flex-direction:column;align-items:center;justify-content:center;
padding:48px;background:var(--surface);border-left:1px solid var(--border);position:relative;}
.form-card{width:100%;max-width:360px;}
.form-card h2{font-size:1.3rem;font-weight:800;margin-bottom:6px;}
.form-card .sub{font-size:13px;color:var(--text-muted);margin-bottom:32px;}
.field{margin-bottom:18px;}
.field label{display:block;font-size:10px;font-weight:700;letter-spacing:1.2px;
text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;}
.field input{width:100%;padding:14px 16px;background:var(--bg);border:1.5px solid var(--border);
border-radius:12px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:14px;outline:none;transition:all .2s;}
.field input:focus{border-color:var(--blue);box-shadow:0 0 0 4px var(--blue-glow);}
.field input::placeholder{color:var(--text-dim);font-family:'Plus Jakarta Sans',sans-serif;}
.hint{font-size:11px;color:var(--text-dim);margin-top:6px;}
.btn{width:100%;padding:15px;border:none;border-radius:12px;font-family:inherit;font-size:15px;
font-weight:700;cursor:pointer;transition:all .25s;-webkit-app-region:no-drag;}
.btn-primary{background:linear-gradient(135deg,var(--blue2),var(--blue));color:#fff;
box-shadow:0 6px 24px rgba(37,99,235,.35);}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 10px 36px rgba(37,99,235,.45);}
.btn-primary:active{transform:scale(.98);}
.btn-primary:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.status{margin-top:14px;font-size:13px;text-align:center;display:none;}
.status.error{display:block;color:var(--red);}
.status.ok{display:block;color:var(--green);}
.footer{position:absolute;bottom:24px;left:0;right:0;text-align:center;font-size:11px;color:var(--text-dim);}
@media(max-width:900px){.left{display:none;}.right{width:100%;}}
</style>
</head>
<body>
<div class="drag"></div>
<div class="left">
  <div class="brand">
    <div class="brand-icon">👨‍⚕️</div>
    <h1>OncoConnect</h1>
    <div class="tag">Doctor Software</div>
    <div class="desc">Full EMR dashboard for neuro-oncology. Manage patients, schedule appointments, write clinical notes, and coordinate care.</div>
    <div class="features">
      <div class="feat"><div class="feat-icon">📊</div>Patient records & EMR</div>
      <div class="feat"><div class="feat-icon">📅</div>Appointment scheduling</div>
      <div class="feat"><div class="feat-icon">🔬</div>Lab order management</div>
      <div class="feat"><div class="feat-icon">📹</div>Video telehealth calls</div>
    </div>
  </div>
</div>
<div class="right">
  <div class="form-card">
    <h2>Connect to Server</h2>
    <div class="sub">Enter your clinic's server address to get started</div>
    <div class="field">
      <label>Server Address</label>
      <input id="url" type="text" placeholder="192.168.1.100:3000" autocomplete="off" spellcheck="false">
      <div class="hint">IP address and port of the OncoConnect Server</div>
    </div>
    <button class="btn btn-primary" id="btn" onclick="go()">Connect →</button>
    <div class="status" id="st"></div>
  </div>
  <div class="footer">🔒 Encrypted connection · OncoConnect v2.0</div>
</div>
<script>
const PATH='/';const KEY='oc_server';const AUTO='http://127.0.0.1:3000';
const $=id=>document.getElementById(id);
const saved=localStorage.getItem(KEY);if(saved)$('url').value=saved;
$('url').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
async function tryConnect(u){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),3000);
  const r=await fetch(u+'/health',{signal:c.signal,mode:'cors'});clearTimeout(t);
  if(!r.ok)throw new Error(r.status);return true;
}
async function go(){
  let u=$('url').value.trim();if(!u){show('Enter a server address','error');return}
  if(!/^https?:\\/\\//.test(u))u='http://'+u;u=u.replace(/\\/+$/,'');
  $('btn').disabled=true;$('btn').textContent='Connecting…';
  try{await tryConnect(u);localStorage.setItem(KEY,u);show('Connected!','ok');setTimeout(()=>window.location.href=u+PATH+'?standalone=1',350)}
  catch(e){let m='Cannot reach server.';if(e.name==='AbortError')m='Timed out — check address & port.';show(m,'error');$('btn').disabled=false;$('btn').textContent='Connect →'}
}
function show(m,c){const s=$('st');s.textContent=m;s.className='status '+c}
// Auto-connect: try saved URL first, then localhost:3000
(async()=>{
  const candidates=[saved,AUTO].filter(Boolean);
  for(const u of candidates){try{await tryConnect(u);localStorage.setItem(KEY,u);window.location.href=u+PATH+'?standalone=1';return}catch{}}
})();
</script>
</body></html>`;
}

// ══════════════════════════════════════════════════════════════════
//  PATIENT — Green, warm, mobile-app feel
// ══════════════════════════════════════════════════════════════════
function getPatientConnection() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OncoConnect Patient</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#050e0b;--surface:#0a1a14;--surface2:#0f221b;--border:rgba(255,255,255,.06);
--green:#34d399;--green2:#059669;--green3:#047857;--green-glow:rgba(52,211,153,.12);
--text:#e8faf2;--text-muted:#6d9b85;--text-dim:#2d5a44;
--red:#f87171;--blue:#60a5fa;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);
display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden;
-webkit-app-region:drag;}
.drag{position:fixed;top:0;left:0;right:0;height:32px;z-index:100;}
/* ── Mobile phone frame ── */
.phone{width:380px;background:var(--surface);border:1px solid var(--border);border-radius:32px;
padding:0;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.03);
position:relative;z-index:1;-webkit-app-region:no-drag;}
.phone-notch{height:32px;background:var(--bg);display:flex;align-items:center;justify-content:center;}
.phone-notch::after{content:'';width:80px;height:5px;border-radius:3px;background:var(--border);}
.phone-header{padding:28px 28px 0;text-align:center;}
.phone-logo{width:72px;height:72px;border-radius:22px;background:linear-gradient(135deg,var(--green),var(--green2));
display:inline-flex;align-items:center;justify-content:center;font-size:34px;
box-shadow:0 10px 40px rgba(5,150,105,.35);margin-bottom:20px;}
.phone-header h1{font-size:1.5rem;font-weight:800;letter-spacing:-.4px;margin-bottom:4px;}
.phone-header .tag{font-size:12px;color:var(--green);font-weight:600;letter-spacing:.5px;}
.phone-body{padding:28px;}
.field{margin-bottom:18px;}
.field label{display:block;font-size:11px;font-weight:700;letter-spacing:.8px;
text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;}
.field input{width:100%;padding:15px 16px;background:var(--bg);border:1.5px solid var(--border);
border-radius:14px;color:var(--text);font-family:inherit;font-size:15px;outline:none;transition:all .2s;}
.field input:focus{border-color:var(--green);box-shadow:0 0 0 4px var(--green-glow);}
.field input::placeholder{color:var(--text-dim);}
.btn{width:100%;padding:16px;border:none;border-radius:14px;font-family:inherit;font-size:16px;
font-weight:700;cursor:pointer;transition:all .25s;-webkit-app-region:no-drag;}
.btn-green{background:linear-gradient(135deg,var(--green2),var(--green));color:#fff;
box-shadow:0 8px 32px rgba(5,150,105,.3);}
.btn-green:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(5,150,105,.4);}
.btn-green:active{transform:scale(.98);}
.btn-green:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.status{margin-top:14px;font-size:13px;text-align:center;display:none;}
.status.error{display:block;color:var(--red);}
.status.ok{display:block;color:var(--green);}
.info{margin-top:24px;padding:16px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;}
.info h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:12px;}
.info-item{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:13px;color:var(--text-muted);}
.info-icon{font-size:16px;}
.phone-footer{text-align:center;padding:20px 28px 28px;font-size:11px;color:var(--text-dim);}
@media(max-width:500px){.phone{width:100%;border:none;border-radius:0;min-height:100vh;box-shadow:none;}}
</style>
</head>
<body>
<div class="drag"></div>
<div class="phone">
  <div class="phone-notch"></div>
  <div class="phone-header">
    <div class="phone-logo">💚</div>
    <h1>OncoConnect</h1>
    <div class="tag">Patient App</div>
  </div>
  <div class="phone-body">
    <div class="field">
      <label>Clinic Server</label>
      <input id="url" type="text" placeholder="192.168.1.100:3000" autocomplete="off" spellcheck="false">
    </div>
    <button class="btn btn-green" id="btn" onclick="go()">Connect →</button>
    <div class="status" id="st"></div>
    <div class="info">
      <h3>What you can do</h3>
      <div class="info-item"><span class="info-icon">📝</span>Log daily symptoms</div>
      <div class="info-item"><span class="info-icon">💊</span>Track medications</div>
      <div class="info-item"><span class="info-icon">📅</span>View appointments</div>
      <div class="info-item"><span class="info-icon">💬</span>Message your care team</div>
    </div>
  </div>
  <div class="phone-footer">🔒 Your data is encrypted · v2.0</div>
</div>
<script>
const PATH='/patient.html';const KEY='oc_server';const AUTO='http://127.0.0.1:3000';
const $=id=>document.getElementById(id);
const saved=localStorage.getItem(KEY);if(saved)$('url').value=saved;
$('url').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
async function tryConnect(u){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),3000);
  const r=await fetch(u+'/health',{signal:c.signal,mode:'cors'});clearTimeout(t);
  if(!r.ok)throw new Error(r.status);return true;
}
async function go(){
  let u=$('url').value.trim();if(!u){show('Enter your clinic server','error');return}
  if(!/^https?:\\/\\//.test(u))u='http://'+u;u=u.replace(/\\/+$/,'');
  $('btn').disabled=true;$('btn').textContent='Connecting…';
  try{await tryConnect(u);localStorage.setItem(KEY,u);show('Connected!','ok');setTimeout(()=>window.location.href=u+PATH+'?standalone=1',350)}
  catch(e){let m='Cannot reach server.';if(e.name==='AbortError')m='Timed out — check the address.';show(m,'error');$('btn').disabled=false;$('btn').textContent='Connect →'}
}
function show(m,c){const s=$('st');s.textContent=m;s.className='status '+c}
// Auto-connect: try saved URL first, then localhost:3000
(async()=>{
  const candidates=[saved,AUTO].filter(Boolean);
  for(const u of candidates){try{await tryConnect(u);localStorage.setItem(KEY,u);window.location.href=u+PATH+'?standalone=1';return}catch{}}
})();
</script>
</body></html>`;
}

// ══════════════════════════════════════════════════════════════════
//  LAB — Purple, scientific, technical feel
// ══════════════════════════════════════════════════════════════════
function getLabConnection() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OncoConnect Lab</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#080614;--surface:#0e0c1f;--surface2:#161330;--border:rgba(255,255,255,.06);
--purple:#a78bfa;--purple2:#7c3aed;--purple3:#6d28d9;--purple-glow:rgba(167,139,250,.12);
--text:#ede9ff;--text-muted:#8b82b8;--text-dim:#3d3860;
--red:#f87171;--cyan:#22d3ee;--green:#34d399;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);
display:flex;min-height:100vh;overflow:hidden;-webkit-app-region:drag;}
.drag{position:fixed;top:0;left:0;right:0;height:32px;z-index:100;}
/* ── Full layout ── */
.wrapper{display:flex;flex:1;}
/* ── Left: animated grid background ── */
.left{flex:1;display:flex;align-items:center;justify-content:center;
background:var(--bg);position:relative;overflow:hidden;}
.grid-bg{position:absolute;inset:0;
background-image:
  linear-gradient(rgba(167,139,250,.03) 1px,transparent 1px),
  linear-gradient(90deg,rgba(167,139,250,.03) 1px,transparent 1px);
background-size:40px 40px;animation:gridMove 20s linear infinite;}
@keyframes gridMove{0%{transform:translate(0,0)}100%{transform:translate(40px,40px)}}
.left-content{position:relative;z-index:1;text-align:center;padding:40px;}
.lab-icon{width:96px;height:96px;border-radius:24px;background:linear-gradient(135deg,var(--purple2),var(--purple3));
display:inline-flex;align-items:center;justify-content:center;font-size:44px;
box-shadow:0 16px 64px rgba(124,58,234,.4);margin-bottom:28px;position:relative;}
.lab-icon::after{content:'';position:absolute;inset:-6px;border-radius:28px;
border:2px solid rgba(167,139,250,.1);animation:iconPulse 3s ease-in-out infinite;}
@keyframes iconPulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.8;transform:scale(1.04)}}
.left-content h1{font-size:2.2rem;font-weight:800;letter-spacing:-.8px;margin-bottom:6px;}
.left-content .tag{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:8px;
font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;
background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.12);color:var(--purple);}
.left-content .desc{margin-top:24px;font-size:14px;color:var(--text-muted);line-height:1.7;max-width:340px;}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:32px;position:relative;z-index:1;}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;text-align:center;}
.stat-num{font-size:1.4rem;font-weight:800;color:var(--purple);}
.stat-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-dim);margin-top:4px;}
/* ── Right: form ── */
.right{width:440px;display:flex;flex-direction:column;align-items:center;justify-content:center;
padding:48px;background:linear-gradient(180deg,var(--surface) 0%,var(--surface2) 100%);
border-left:1px solid var(--border);position:relative;}
.form-card{width:100%;max-width:340px;}
.form-card h2{font-size:1.2rem;font-weight:800;margin-bottom:6px;}
.form-card .sub{font-size:13px;color:var(--text-muted);margin-bottom:28px;}
.field{margin-bottom:18px;}
.field label{display:block;font-size:10px;font-weight:700;letter-spacing:1.2px;
text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;}
.field input{width:100%;padding:14px 16px;background:var(--bg);border:1.5px solid var(--border);
border-radius:12px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:14px;outline:none;transition:all .2s;}
.field input:focus{border-color:var(--purple);box-shadow:0 0 0 4px var(--purple-glow);}
.field input::placeholder{color:var(--text-dim);font-family:'Plus Jakarta Sans',sans-serif;}
.btn{width:100%;padding:15px;border:none;border-radius:12px;font-family:inherit;font-size:15px;
font-weight:700;cursor:pointer;transition:all .25s;-webkit-app-region:no-drag;}
.btn-purple{background:linear-gradient(135deg,var(--purple3),var(--purple2));color:#fff;
box-shadow:0 6px 24px rgba(124,58,234,.35);}
.btn-purple:hover{transform:translateY(-2px);box-shadow:0 10px 36px rgba(124,58,234,.45);}
.btn-purple:active{transform:scale(.98);}
.btn-purple:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.status{margin-top:14px;font-size:13px;text-align:center;display:none;}
.status.error{display:block;color:var(--red);}
.status.ok{display:block;color:var(--green);}
.footer{position:absolute;bottom:24px;left:0;right:0;text-align:center;font-size:11px;color:var(--text-dim);}
@media(max-width:1000px){.left{display:none;}.right{width:100%;}}
</style>
</head>
<body>
<div class="drag"></div>
<div class="wrapper">
<div class="left">
  <div class="grid-bg"></div>
  <div class="left-content">
    <div class="lab-icon">🔬</div>
    <h1>OncoConnect Lab</h1>
    <div class="tag">⚡ Lab Portal</div>
    <div class="desc">Laboratory test management system. Process orders, upload results, track samples, and communicate with clinicians.</div>
    <div class="stats">
      <div class="stat"><div class="stat-num">🧪</div><div class="stat-label">Test Orders</div></div>
      <div class="stat"><div class="stat-num">📋</div><div class="stat-label">Results</div></div>
      <div class="stat"><div class="stat-num">📦</div><div class="stat-label">Samples</div></div>
      <div class="stat"><div class="stat-num">📡</div><div class="stat-label">Synced</div></div>
    </div>
  </div>
</div>
<div class="right">
  <div class="form-card">
    <h2>Lab Server Connection</h2>
    <div class="sub">Connect to your laboratory information system</div>
    <div class="field">
      <label>Server Address</label>
      <input id="url" type="text" placeholder="192.168.1.100:3000" autocomplete="off" spellcheck="false">
    </div>
    <button class="btn btn-purple" id="btn" onclick="go()">Connect →</button>
    <div class="status" id="st"></div>
  </div>
  <div class="footer">🔒 Encrypted · OncoConnect Lab v2.0</div>
</div>
</div>
<script>
const PATH='/lab.html';const KEY='oc_server';const AUTO='http://127.0.0.1:3000';
const $=id=>document.getElementById(id);
const saved=localStorage.getItem(KEY);if(saved)$('url').value=saved;
$('url').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
async function tryConnect(u){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),3000);
  const r=await fetch(u+'/health',{signal:c.signal,mode:'cors'});clearTimeout(t);
  if(!r.ok)throw new Error(r.status);return true;
}
async function go(){
  let u=$('url').value.trim();if(!u){show('Enter the lab server address','error');return}
  if(!/^https?:\\/\\//.test(u))u='http://'+u;u=u.replace(/\\/+$/,'');
  $('btn').disabled=true;$('btn').textContent='Connecting…';
  try{await tryConnect(u);localStorage.setItem(KEY,u);show('Connected!','ok');setTimeout(()=>window.location.href=u+PATH+'?standalone=1',350)}
  catch(e){let m='Cannot reach server.';if(e.name==='AbortError')m='Timed out — check the address.';show(m,'error');$('btn').disabled=false;$('btn').textContent='Connect →'}
}
function show(m,c){const s=$('st');s.textContent=m;s.className='status '+c}
// Auto-connect: try saved URL first, then localhost:3000
(async()=>{
  const candidates=[saved,AUTO].filter(Boolean);
  for(const u of candidates){try{await tryConnect(u);localStorage.setItem(KEY,u);window.location.href=u+PATH+'?standalone=1';return}catch{}}
})();
</script>
</body></html>`;
}

// ══════════════════════════════════════════════════════════════════
//  Shared helpers
// ══════════════════════════════════════════════════════════════════

export function getPortalTitle(portal) {
  return { doctor: 'OncoConnect Doctor', patient: 'OncoConnect Patient', lab: 'OncoConnect Lab' }[portal] || 'OncoConnect';
}

export function getPortalIcon(portal, publicDir) {
  return join(publicDir, 'icons', portal === 'doctor' ? 'doctor-512.png' : 'patient-512.png');
}

export function getPortalConfig(portal) {
  return {
    doctor:  { portal: 'doctor',  title: 'OncoConnect Doctor',  subtitle: 'Doctor Software',   icon: '👨\u200d⚕️', themeColor: '#2563eb', portalPath: '/',          brand: 'SOFTWARE' },
    patient: { portal: 'patient', title: 'OncoConnect Patient', subtitle: 'Patient App',       icon: '📱', themeColor: '#059669', portalPath: '/patient.html', brand: 'APP' },
    lab:     { portal: 'lab',     title: 'OncoConnect Lab',     subtitle: 'Lab Portal',        icon: '🔬', themeColor: '#7c3aed', portalPath: '/lab.html',     brand: 'PORTAL' },
  }[portal];
}

/**
 * Get server URL from command-line arguments (--server=url)
 * This is used when the Server app launches client apps.
 */
export function getServerUrlFromArgs() {
  const args = process.argv || [];
  for (const arg of args) {
    if (arg.startsWith('--server=')) {
      return arg.slice('--server='.length);
    }
  }
  return null;
}

/**
 * Get portal from command-line arguments (--portal=name)
 */
export function getPortalFromArgs() {
  const args = process.argv || [];
  for (const arg of args) {
    if (arg.startsWith('--portal=')) {
      return arg.slice('--portal='.length);
    }
  }
  return null;
}
