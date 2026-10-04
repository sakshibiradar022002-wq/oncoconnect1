
// ── Global Error Boundary ──
window.onerror=function(msg,src,line,col,err){console.error("[VELTRUVIA Error]",{msg,src,line,col,err});return false;};
window.addEventListener("unhandledrejection",function(e){console.error("[VELTRUVIA Unhandled Promise]",e.reason);});
// ── XSS-safe HTML escaping ──
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// ── CSV injection prevention (leading formula chars) ──
function csvEscape(val){let s=String(val||'');if(/^=+|^\+|^\-|^@|^\t|^\r/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}

async function api(path, opts){
  const r = await fetch('/api'+path, Object.assign({credentials:'include', headers:{'Content-Type':'application/json'}}, opts));
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(d.error||r.statusText), {status:r.status});
  return d;
}
async function doLogin(){
  const msg=document.getElementById('login-msg');msg.textContent='';
  try{
    const r=await api('/auth/login',{method:'POST',body:JSON.stringify({email:document.getElementById('email').value.trim().toLowerCase(),password:document.getElementById('pass').value})});
    document.getElementById('who').textContent=r.user.email;
    await loadAll();
    document.getElementById('login-card').style.display='none';
    document.getElementById('panel').style.display='block';
  }catch(e){ msg.textContent = e.status===403?'This account is not the admin.':e.message; }
}
async function loadAll(){
  const [u,a]=await Promise.all([api('/admin/users'),api('/admin/audit?limit=500')]);
  _auditData=a.entries||[];
  document.getElementById('users-body').innerHTML=u.users.map(x=>`<tr><td><b>${esc(x.name||'—')}</b></td><td>${esc(x.email)}</td><td class="hide-sm">${esc(x.role)}</td><td><span class="badge ${x.active?'b-on':'b-off'}">${x.active?'Active':'Awaiting approval'}</span></td><td class="hide-sm">${x.lastLogin?new Date(x.lastLogin).toLocaleString():'never'}</td><td>${x.active?`<button class="btn-r" data-action="setActive:${esc(x.id)},false">Deactivate</button>`:`<button class="btn-g" data-action="setActive:${esc(x.id)},true">Approve ✓</button>`}</td></tr>`).join('');
  document.getElementById('audit-body').innerHTML=_auditData.slice(0,100).map(e=>`<tr><td>${new Date(e.ts).toLocaleString()}</td><td>${esc(e.actorRole||'')}</td><td><b>${esc(e.action)}</b></td><td class="hide-sm" style="font-family:monospace;font-size:11px;">${esc((e.targetId||'—').slice(0,14))}</td><td class="hide-sm">${esc(e.ip||'')}</td></tr>`).join('');
}
// ── Approve / deactivate a user account ───────────────────────────
async function setActive(id, active){
  if(!active){
    const ok = await AppDialog.confirm('Deactivate this user account? They will lose access until re-approved.', {danger:true, okLabel:'Deactivate'});
    if(!ok) return;
  }
  try{
    await api('/admin/users/'+encodeURIComponent(id)+'/active', {method:'POST', body:JSON.stringify({active:!!active})});
    AppDialog.alert(active ? 'User approved. They can now sign in.' : 'User deactivated.');
    await Promise.all([loadAll(), loadDashboard()]);
  }catch(e){ AppDialog.alert(e.message || 'Failed to update user.'); }
}
function exportAuditCSV(){
  if(!_auditData.length){AppDialog.alert('No audit data. Load the page first.');return;}
  const header='Timestamp,Actor ID,Actor Role,Action,Target ID,IP,Detail\n';
  const rows=_auditData.map(e=>{
    const d=e.detail?JSON.stringify(e.detail):'';
    return [csvEscape(e.ts),csvEscape(e.actorId),csvEscape(e.actorRole),csvEscape(e.action),csvEscape(e.targetId),csvEscape(e.ip),csvEscape(d)].join(',');
  }).join('\n');
  const blob=new Blob(['\uFEFF'+header+rows],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='veltruvia-audit-'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(url);
}
// auto-resume an existing session
api('/admin/users').then(()=>{document.getElementById('login-card').style.display='none';document.getElementById('panel').style.display='block';loadAll();loadDashboard();}).catch(()=>{});
document.getElementById('pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});

// ── Session timeout: auto-logout after 30 minutes of inactivity ──
let _idleTimer=null;
function resetIdleTimer(){clearTimeout(_idleTimer);_idleTimer=setTimeout(()=>{AppDialog.alert('Session expired due to inactivity.');location.reload();},30*60*1000);}
['mousemove','mousedown','keydown','scroll','touchstart'].forEach(evt=>document.addEventListener(evt,resetIdleTimer,{passive:true}));
resetIdleTimer();

// ── Session security: page visibility → validate session on return ──
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){api('/admin/users').catch(e=>{ // Only a real auth loss resets the session; transient errors (429 rate-limit, network blips, 5xx) must not reload-loop
    if(e && (e.status===401)){AppDialog.alert('Session expired. Please sign in again.');location.reload();}else{console.warn('[admin] session check skipped:', e && e.status, e && e.message);}});}
});

// ── Dashboard ──────────────────────────────────────────────────────
async function loadDashboard(){
  try{
    const [dash,health]=await Promise.all([api('/admin/dashboard'),api('/admin/health')]);
    document.getElementById('d-users').textContent=dash.users.total;
    document.getElementById('d-active').textContent=dash.users.active;
    document.getElementById('d-sessions').textContent=dash.sessions.active;
    document.getElementById('d-audit7d').textContent=dash.audit.last7Days;
    document.getElementById('d-logins').textContent=dash.users.recentLogins;
    document.getElementById('d-uptime').textContent=formatUptime(dash.system.uptimeSeconds);
    renderActivityChart(dash.activity.daily);
    renderTopActions(dash.audit.topActions);
    renderHealth(health, dash);
    renderStorage(dash);
  }catch(e){console.warn('Dashboard load failed:',e);}
}
function formatUptime(s){const d=Math.floor(s/86400);const h=Math.floor((s%86400)/3600);const m=Math.floor((s%3600)/60);return d>0?d+'d '+h+'h':h>0?h+'h '+m+'m':m+'m';}
function renderActivityChart(daily){
  const el=document.getElementById('d-activity-chart');
  if(!daily||!daily.length){el.innerHTML='<div style="color:var(--dim);font-size:12px;">No activity data</div>';return;}
  const max=Math.max(...daily.map(d=>d.count),1);
  el.innerHTML=daily.map(d=>{const h=Math.round((d.count/max)*100);return '<div style="flex:1;background:var(--blue);border-radius:3px 3px 0 0;height:'+h+'%;min-width:4px;position:relative;" title="'+esc(d.day)+': '+Number(d.count)+'"></div>'}).join('');
}
function renderTopActions(actions){
  const el=document.getElementById('d-top-actions');
  if(!actions||!actions.length){el.innerHTML='<div style="color:var(--dim);font-size:12px;">No actions recorded</div>';return;}
  const max=actions[0].count;
  el.innerHTML=actions.map(a=>{const w=Math.round((a.count/max)*100);return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;"><span style="min-width:140px;font-family:monospace;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(a.action)+'</span><div style="flex:1;height:14px;background:#e2e8f0;border-radius:3px;overflow:hidden;"><div style="width:'+w+'%;height:100%;background:var(--blue2);border-radius:3px;"></div></div><span style="min-width:24px;text-align:right;font-weight:700;">'+a.count+'</span></div>'}).join('');
}
function renderHealth(health,dash){
  const el=document.getElementById('d-health');
  const dbOk=health.checks&&health.checks.database?health.checks.database.ok:true;
  const memOk=health.checks&&health.checks.memory?health.checks.memory.ok:true;
  el.innerHTML=
    '<div>Database: <b style="color:'+(dbOk?'var(--green)':'var(--red)')+'">'+(dbOk?'✓ Healthy':'✗ Unhealthy')+'</b></div>'+
    '<div>Memory: <b style="color:'+(memOk?'var(--green)':'var(--red)')+'">'+dash.system.memoryMB.rss+' MB RSS</b></div>'+
    '<div>Heap: '+dash.system.memoryMB.heapUsed+' / '+dash.system.memoryMB.heapTotal+' MB</div>'+
    '<div>Node: '+dash.system.nodeVersion+' ('+dash.system.environment+')</div>';
}
function renderStorage(dash){
  const el=document.getElementById('d-storage');
  el.innerHTML=
    '<div>Sync entries (kv_store): <b>'+dash.sync.totalKVEntries+'</b></div>'+
    '<div>Doctor accounts with data: <b>'+dash.sync.doctorAccounts+'</b></div>'+
    '<div>Total audit entries: <b>'+dash.audit.totalEntries+'</b></div>'+
    '<div>Last 7 days: <b>'+dash.audit.last7Days+' events</b></div>';
}

