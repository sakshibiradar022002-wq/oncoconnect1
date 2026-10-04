
// ── Global Error Boundary ──
window.onerror=function(msg,src,line,col,err){console.error("[VELTRUVIA Error]",{msg,src,line,col,err});return false;};
window.addEventListener("unhandledrejection",function(e){console.error("[VELTRUVIA Unhandled Promise]",e.reason);});
// ═══ STORAGE ═══
// Encrypted-at-rest via SecureStore (js/secure-store.js), 'lab' namespace.
const LS={
  get:k=>SecureStore.get(k),
  set:(k,v)=>SecureStore.set(k,v),
  del:k=>SecureStore.del(k),
  keys:pre=>SecureStore.names(pre)
};
SecureStore.init({namespace:'lab'});

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}
function escAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function v(id){const el=document.getElementById(id);return el?(el.value||'').trim():''}
function showErr(el,msg){el.textContent=msg;el.style.display='block';setTimeout(()=>{if(el)el.style.display='none'},6000)}
function openSheet(id){document.getElementById(id).classList.add('open')}
function closeSheet(id){document.getElementById(id).classList.remove('open')}
function showToast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3000)}

// ═══ SERVER API ═══
async function api(url,opts={}){const r=await fetch('/api'+url,{credentials:'include',headers:{'Content-Type':'application/json'},...opts});if(!r.ok){const e=await r.json().catch(()=>({error:r.statusText}));throw new Error(e.error||r.statusText)}return r.json()}

// Merge server-returned keys into localStorage
function mergeServerKeys(keys){if(!keys)return;for(const[k,entry]of Object.entries(keys)){if(entry&&entry.v!==undefined){LS.set(k,entry.v)}}}

let currentLab=null,_docId=null;

// ═══ PBKDF2 VERIFICATION ═══
async function verifyPBKDF2v2(input,stored){
  if(!stored||!stored.startsWith('pbkdf2v2:'))return input===stored;
  const[,iterStr,saltB64,hashB64]=stored.split(':');
  const iterations=parseInt(iterStr,10);
  if(!saltB64||!hashB64||!iterations)return false;
  const enc=new TextEncoder();
  const pad=saltB64.replace(/-/g,'+').replace(/_/g,'/');
  const salt=Uint8Array.from(atob(pad),c=>c.charCodeAt(0));
  const keyMaterial=await crypto.subtle.importKey('raw',enc.encode(input),{name:'PBKDF2'},false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'},keyMaterial,256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)))===hashB64;
}

async function verifyPassword(input,stored){
  if(!stored)return false;
  if(stored.startsWith('pbkdf2v2:'))return verifyPBKDF2v2(input,stored);
  return input===stored;
}

// ═══ SPLASH ═══
window.addEventListener('DOMContentLoaded',()=>{
  setTimeout(()=>{
    document.getElementById('splash').classList.add('hide');
    // Check for existing session
    const lab=LS.get('current_lab');
    const docId=LS.get('current_docId');
    if(lab&&docId){
      currentLab=lab;_docId=docId;
      document.getElementById('auth-screen').style.display='none';
      document.getElementById('app-shell').style.display='flex';
      initDashboard();
    }else{
      document.getElementById('auth-screen').style.display='flex';
    }
  },1600);
});

// ═══ AUTH ═══
async function doLogin(){
  const user=v('li-user'),pass=v('li-pass');
  const errEl=document.getElementById('login-err');
  if(!user||!pass){showErr(errEl,'Enter username and password.');return}
  // 1. Try shared JSON store login first
  try{
    const result=await api('/sync/lab-store-login',{method:'POST',body:JSON.stringify({username:user,password:pass})});
    if(result&&result.ok&&result.lab){
      currentLab=result.lab;_docId=result.lab.docId||'';
      if(result.keys)mergeServerKeys(result.keys); // pull assigned tasks + patient list issued with the session
      LS.set('current_lab',result.lab);LS.set('current_docId',_docId);
      document.getElementById('auth-screen').style.display='none';
      document.getElementById('app-shell').style.display='flex';
      initDashboard();
      return;
    }
  }catch(e){/* store login failed, trying server */}
  // 2. Try server login (sql.js DB)
  try{
    const result=await api('/sync/lab-login',{method:'POST',body:JSON.stringify({username:user,password:pass})});
    if(result&&result.ok&&result.keys){
      mergeServerKeys(result.keys);
      let foundLab=null,foundDocId=null;
      for(const name of SecureStore.names('lab_')){
        const lab=await SecureStore.getAsync(name);
        if(lab&&lab.username===user){foundLab=lab;foundDocId=name.split('_')[1];break}
      }
      if(foundLab){
        currentLab=foundLab;_docId=foundDocId;
        LS.set('current_lab',foundLab);LS.set('current_docId',foundDocId);
        document.getElementById('auth-screen').style.display='none';
        document.getElementById('app-shell').style.display='flex';
        initDashboard();
        return;
      }
    }
  }catch(e){/* Server unreachable — try local */}
  // 3. Local fallback
  let foundLab=null,foundDocId=null;
  for(const name of SecureStore.names('lab_')){
    const lab=await SecureStore.getAsync(name);
    if(lab&&lab.username===user){
      if(await verifyPassword(pass,lab.password)){
        foundLab=lab;foundDocId=name.split('_')[1];break;
      }
    }
  }
  if(!foundLab){showErr(errEl,'No matching lab account found.');return}
  currentLab=foundLab;_docId=foundDocId;
  LS.set('current_lab',foundLab);LS.set('current_docId',foundDocId);
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-shell').style.display='flex';
  initDashboard();
}

async function checkAccounts(){
  const el=document.getElementById('accounts-list');
  const accounts=[];
  for(const name of SecureStore.names('lab_')){
    const lab=await SecureStore.getAsync(name);
    if(lab)accounts.push(lab);
  }
  if(!accounts.length){el.innerHTML='<div style="color:var(--text-dim);font-size:12px">No lab accounts found.</div>';return}
  el.innerHTML=accounts.slice(0,8).map(lab=>`<div style="padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:4px;cursor:pointer;font-size:12px" data-action="setval:li-user,${escAttr(lab.username)}"><strong>${esc(lab.name)}</strong> <span style="font-family:var(--mono);color:var(--text-dim);font-size:11px">${esc(lab.username)}</span></div>`).join('');
}

function doLogout(){
  fetch('/api/auth/logout',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'}}).catch(()=>{});
  currentLab=null;_docId=null;
  LS.del('current_lab');LS.del('current_docId');
  document.getElementById('app-shell').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
}

// ═══ NAVIGATION ═══
function goScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  const navBtn=document.getElementById('nav-'+name);
  if(navBtn)navBtn.classList.add('active');
  const sideNavBtn=document.querySelector('.sidebar-nav #nav-'+name);
  if(sideNavBtn)sideNavBtn.classList.add('active');
  if(name==='dashboard')initDashboard();
  if(name==='tasks')renderTasks();
  if(name==='upload')renderUpload();
  if(name==='history')renderHistory();
  if(name==='settings')renderSettings();
}

// ═══ DASHBOARD ═══
function initDashboard(){
  document.getElementById('dash-date').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('lab-greeting').textContent=currentLab?currentLab.name+' Lab':'Laboratory Portal';
  const tokens=(LS.get('pat_tokens_'+_docId)||[]).filter(t=>t.labId===currentLab?.labId&&t.status!=='Cancelled');
  const pending=tokens.filter(t=>!t.used);
  const done=tokens.filter(t=>t.used);
  const urgent=pending.filter(t=>t.priority==='STAT'||t.priority==='Urgent');
  const uniquePats=[...new Set(pending.map(t=>t.patName))];
  document.getElementById('st-pending').textContent=pending.length;
  document.getElementById('st-done').textContent=done.length;
  document.getElementById('st-urgent').textContent=urgent.length;
  document.getElementById('st-patients').textContent=uniquePats.length;
  // Recent activity
  const subs=(LS.get('lab_subs_'+_docId)||[]).filter(s=>s.labId===currentLab?.labId).sort((a,b)=>b.submittedAt-a.submittedAt);
  const actEl=document.getElementById('dash-activity');
  if(subs.length){
    actEl.innerHTML=subs.slice(0,5).map(s=>`<div class="info-card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:600;font-size:13px">📤 ${esc(s.test)}</div><span class="badge" style="background:var(--green);color:#fff">✓ Sent</span></div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">MRN: ${esc(s.mrn||'—')} · ${new Date(s.submittedAt).toLocaleDateString()}</div></div>`).join('');
  }else{
    actEl.innerHTML='<div class="empty-card">No submissions yet. Start by uploading results!</div>';
  }
}

// ═══ TASKS ═══
function renderTasks(){
  if(!currentLab||!_docId)return;
  const tokens=(LS.get('pat_tokens_'+_docId)||[]).filter(t=>t.labId===currentLab.labId&&t.status!=='Cancelled');
  const pending=tokens.filter(t=>!t.used);
  const search=v('task-search').toLowerCase();
  const filtered=search?pending.filter(t=>(t.desc||'').toLowerCase().includes(search)||(t.patName||'').toLowerCase().includes(search)):pending;
  const el=document.getElementById('task-list');
  if(!filtered.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">${search?'No matching tasks':'No pending tasks'}</div><div class="empty-sub">${search?'Try a different search term':'All caught up! New tasks will appear here when assigned.'}</div></div>`;
    return;
  }
  pending.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  el.innerHTML=filtered.map(t=>{
    const diff=Math.ceil((new Date(t.dueDate)-new Date())/(1000*60*60*24));
    let dueClass='ok',dueText='';
    if(diff<0){dueClass='overdue';dueText=`Overdue by ${Math.abs(diff)} day(s)`}
    else if(diff===0){dueClass='overdue';dueText='Due today'}
    else if(diff<=2){dueClass='soon';dueText=`Due in ${diff} day(s)`}
    else{dueText=`Due in ${diff} day(s)`}
    const pc={STAT:'var(--red)',Urgent:'var(--orange)',Routine:'var(--green)'}[t.priority]||'var(--text-dim)';
    const cardClass=t.priority==='STAT'?'urgent':'normal';
    return `<div class="task-card ${cardClass}" data-action="viewTask:${escAttr(t.taskId)}">
      <div class="task-header">
        <div class="task-title">${esc(t.desc)}</div>
        <span class="badge" style="background:${pc}22;color:${pc};flex-shrink:0;margin-left:8px">${t.priority}</span>
      </div>
      <div class="task-meta">👤 ${esc(t.patName)} · 👨‍⚕️ Dr. ${esc(t.docName||'—')}</div>
      <div class="task-footer">
        <div class="task-due ${dueClass}">📅 ${dueText}</div>
        <button class="btn-sm btn-purple" style="font-size:11px;padding:6px 12px" data-action="stop;;startUpload:${escAttr(t.taskId)},${escAttr(t.mrn)}">Upload →</button>
      </div>
    </div>`;
  }).join('');
}

function viewTask(taskId){
  const tokens=LS.get('pat_tokens_'+_docId)||[];
  const t=tokens.find(tk=>tk.taskId===taskId);
  if(!t)return;
  const diff=Math.ceil((new Date(t.dueDate)-new Date())/(1000*60*60*24));
  document.getElementById('task-detail-content').innerHTML=`
    <div class="info-card">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px">Test Details</div>
      <div class="irow"><span class="ikey">Test</span><span class="ival" style="font-weight:700">${esc(t.desc)}</span></div>
      <div class="irow"><span class="ikey">Priority</span><span class="ival"><span class="badge" style="background:${t.priority==='STAT'?'rgba(239,68,68,.12);color:var(--red)':t.priority==='Urgent'?'rgba(251,191,36,.12);color:var(--orange)':'rgba(16,185,129,.12);color:var(--green)'}">${t.priority}</span></span></div>
      <div class="irow"><span class="ikey">Due</span><span class="ival">${t.dueDate}</span></div>
    </div>
    <div class="info-card">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px">Patient</div>
      <div class="irow"><span class="ikey">Name</span><span class="ival">${esc(t.patName)}</span></div>
      <div class="irow"><span class="ikey">MRN</span><span class="ival" style="font-family:var(--mono)">${esc(t.mrn)}</span></div>
    </div>
    <div class="info-card">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px">Ordering Physician</div>
      <div class="irow"><span class="ikey">Doctor</span><span class="ival">Dr. ${esc(t.docName||'—')}</span></div>
    </div>
    <button class="big-btn btn-purple" data-action="closeSheet:task-detail-sheet;;startUpload:${escAttr(t.taskId)},${escAttr(t.mrn)}">📤 Upload Results</button>
  `;
  openSheet('task-detail-sheet');
}

function startUpload(taskId,mrn){
  goScreen('upload');
  setTimeout(()=>{
    document.getElementById('ul-taskid').value=taskId;
    document.getElementById('ul-mrn').value=mrn;
    // Find task description
    const tokens=LS.get('pat_tokens_'+_docId)||[];
    const t=tokens.find(tk=>tk.taskId===taskId);
    if(t)document.getElementById('ul-test').value=t.desc;
  },100);
}

// ═══ UPLOAD ═══
function renderUpload(){
  if(!currentLab||!_docId)return;
  const tokens=(LS.get('pat_tokens_'+_docId)||[]).filter(t=>t.labId===currentLab.labId&&t.status!=='Cancelled'&&!t.used);
  let h='';
  // Batch upload button
  h+=`<div class="info-card" style="border-left:4px solid var(--blue);cursor:pointer" data-action="openSheet:batch-sheet">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:28px">📦</div>
      <div><div style="font-weight:700;font-size:14px">Batch Upload (CSV)</div><div style="font-size:11px;color:var(--text-muted)">Upload multiple results at once</div></div>
      <div style="margin-left:auto;font-size:18px;color:var(--text-muted)">→</div>
    </div>
  </div>`;
  // Individual upload form
  h+=`<div class="sec-head" style="margin-top:8px">📤 Individual Upload</div>`;
  if(!tokens.length){
    h+=`<div class="empty-state" style="padding:32px"><div class="empty-icon">📤</div><div class="empty-title">No pending tasks</div><div class="empty-sub">Tasks assigned by your doctor will appear here. You can also use the batch upload above.</div></div>`;
  }else{
    h+=`<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${tokens.length} task(s) available for upload</div>`;
  }
  h+=`<div class="info-card" style="border-top:3px solid var(--purple)">
    <input type="hidden" id="ul-taskid" value="">
    <input type="hidden" id="ul-mrn" value="">
    <div class="fg"><label>Date</label><input type="date" id="ul-date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="fg"><label>Test Name</label><input id="ul-test" placeholder="e.g. Complete Blood Count"></div>
    <div class="fg"><label>Results</label><textarea id="ul-res" rows="3" placeholder="e.g. WBC: 5.2 x10^9/L (Normal)&#10;RBC: 4.8 x10^12/L (Normal)&#10;HGB: 12.1 g/dL (Low)"></textarea></div>
    <div class="fg"><label>Notes / Comments</label><textarea id="ul-notes" rows="2" placeholder="Additional observations..."></textarea></div>
    <div class="fg"><label>MRN (if manual)</label><input id="ul-mrn-manual" placeholder="MRN-XXXXXXXX" style="text-transform:uppercase" data-action-input="upper"></div>
    <button class="big-btn btn-purple" data-action="submitUpload">📤 Submit Report</button>
  </div>`;
  document.getElementById('upload-content').innerHTML=h;
}

async function submitUpload(){
  const taskId=v('ul-taskid'),mrn=v('ul-mrn')||v('ul-mrn-manual');
  const date=v('ul-date'),test=v('ul-test'),res=v('ul-res'),notes=v('ul-notes');
  if(!test){showToast('⚠️ Enter test name');return}
  const tokens=LS.get('pat_tokens_'+_docId)||[];
  if(taskId){
    // Mark task as used
    const tok=tokens.find(t=>t.taskId===taskId);
    if(tok)tok.used=true;
    LS.set('pat_tokens_'+_docId,tokens);
  }
  // Save submission
  const subs=LS.get('lab_subs_'+_docId)||[];
  subs.push({labId:currentLab.labId,labName:currentLab.name,mrn,test,date,results:res,notes,taskId,submittedAt:Date.now()});
  LS.set('lab_subs_'+_docId,subs);
  // Push to server so the doctor's record picks the result up (offline-safe)
  try{await api('/sync/lab',{method:'PUT',body:JSON.stringify({changes:{['pat_tokens_'+_docId]:tokens,['lab_subs_'+_docId]:subs}})})}catch(e){console.warn('[lab] push failed:',e.message)}
  // Clear form
  document.getElementById('ul-taskid').value='';
  document.getElementById('ul-mrn').value='';
  document.getElementById('ul-test').value='';
  document.getElementById('ul-res').value='';
  document.getElementById('ul-notes').value='';
  document.getElementById('ul-mrn-manual').value='';
  showToast('✅ Report submitted successfully!');
  renderUpload();
}

// ═══ BATCH CSV ═══
let _batchData=[];
function previewBatchCSV(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const lines=e.target.result.split('\n').filter(l=>l.trim());
    _batchData=[];
    for(let i=1;i<lines.length;i++){// skip header
      const parts=lines[i].split(',').map(p=>p.trim().replace(/^"|"$/g,''));
      if(parts.length>=4)_batchData.push({mrn:parts[0],test:parts[1],date:parts[2],results:parts[3],notes:parts[4]||''});
    }
    if(!_batchData.length){showToast('⚠️ No valid rows found in CSV');return}
    const prev=document.getElementById('batch-preview');
    prev.style.display='block';
    prev.innerHTML=`<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${_batchData.length} rows found:</div>${_batchData.slice(0,5).map(r=>`<div style="padding:6px 10px;background:var(--surface2);border-radius:8px;margin-bottom:4px;font-size:11px"><strong>${esc(r.test)}</strong> · ${esc(r.mrn)} · ${r.date}</div>`).join('')}${_batchData.length>5?`<div style="font-size:11px;color:var(--text-dim);margin-top:4px">...and ${_batchData.length-5} more</div>`:''}`;
    document.getElementById('batch-submit').style.display='block';
  };
  reader.readAsText(file);
}

function submitBatchCSV(){
  if(!_batchData.length)return;
  const subs=LS.get('lab_subs_'+_docId)||[];
  _batchData.forEach(r=>{
    subs.push({labId:currentLab.labId,labName:currentLab.name,mrn:r.mrn,test:r.test,date:r.date,results:r.results,notes:r.notes,submittedAt:Date.now()});
  });
  LS.set('lab_subs_'+_docId,subs);
  _batchData=[];
  closeSheet('batch-sheet');
  showToast(`✅ ${subs.length} results uploaded!`);
  renderUpload();
}

// ═══ HISTORY ═══
function renderHistory(){
  if(!currentLab||!_docId)return;
  const subs=(LS.get('lab_subs_'+_docId)||[]).filter(s=>s.labId===currentLab.labId).sort((a,b)=>b.submittedAt-a.submittedAt);
  const search=v('hist-search').toLowerCase();
  const filtered=search?subs.filter(s=>(s.test||'').toLowerCase().includes(search)||(s.mrn||'').toLowerCase().includes(search)):subs;
  const el=document.getElementById('history-list');
  if(!filtered.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">${search?'No matching results':'No submissions yet'}</div><div class="empty-sub">${search?'Try a different search term':'Your submitted reports will appear here.'}</div></div>`;
    return;
  }
  el.innerHTML=filtered.map(s=>`<div class="result-card" data-action="viewResult:${s.submittedAt}">
    <div class="result-header">
      <div class="result-test">📤 ${esc(s.test)}</div>
      ${_abnClass(s.test,s.value)==='abn'?'<span class="badge" style="background:rgba(220,38,38,.12);color:var(--red)">⚠ Abnormal</span>':''}
      <span class="badge" style="background:rgba(5,150,105,.12);color:var(--green)">✓ Sent</span>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
      MRN: <span style="font-family:var(--mono)">${esc(s.mrn||'—')}</span> · ${s.date||'—'}
    </div>
    <div style="font-size:11px;color:var(--text-dim);margin-top:4px">Submitted: ${new Date(s.submittedAt).toLocaleString()}</div>
  </div>`).join('');
}

function viewResult(ts){
  const subs=LS.get('lab_subs_'+_docId)||[];
  const s=subs.find(r=>r.submittedAt===ts);
  if(!s)return;
  document.getElementById('task-detail-content').innerHTML=`
    <div class="info-card">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px">Test Report</div>
      <div class="irow"><span class="ikey">Test</span><span class="ival" style="font-weight:700">${esc(s.test)}</span></div>
      <div class="irow"><span class="ikey">Date</span><span class="ival">${s.date||'—'}</span></div>
      <div class="irow"><span class="ikey">MRN</span><span class="ival" style="font-family:var(--mono)">${esc(s.mrn||'—')}</span></div>
      <div class="irow"><span class="ikey">Submitted</span><span class="ival">${new Date(s.submittedAt).toLocaleString()}</span></div>
    </div>
    ${s.results?`<div class="info-card"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px">Results</div><div style="font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(s.results)}</div></div>`:''}
    ${s.notes?`<div class="info-card"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px">Notes</div><div style="font-size:13px;line-height:1.5">${esc(s.notes)}</div></div>`:''}
  `;
  document.querySelector('#task-detail-sheet .sheet-title').innerHTML='Result Details <button class="sheet-x" data-action="closeSheet:task-detail-sheet">✕</button>';
  openSheet('task-detail-sheet');
}

// ═══ SETTINGS ═══
function renderSettings(){
  if(!currentLab)return;
  let h=`<div class="info-card">
    <div class="info-card-title">🔬 Lab Profile</div>
    <div class="irow"><span class="ikey">Name</span><span class="ival" style="font-weight:700">${esc(currentLab.name)}</span></div>
    <div class="irow"><span class="ikey">Username</span><span class="ival" style="font-family:var(--mono)">${esc(currentLab.username)}</span></div>
    ${currentLab.contact?`<div class="irow"><span class="ikey">Contact</span><span class="ival">${esc(currentLab.contact)}</span></div>`:''}
    ${currentLab.phone?`<div class="irow"><span class="ikey">Phone</span><span class="ival">${esc(currentLab.phone)}</span></div>`:''}
    ${currentLab.email?`<div class="irow"><span class="ikey">Email</span><span class="ival">${esc(currentLab.email)}</span></div>`:''}
    ${currentLab.address?`<div class="irow"><span class="ikey">Address</span><span class="ival">${esc(currentLab.address)}</span></div>`:''}
    ${currentLab.specialty?`<div class="irow"><span class="ikey">Specialty</span><span class="ival">${esc(currentLab.specialty)}</span></div>`:''}
  </div>`;
  // Theme toggle
  const isDark=(document.documentElement.getAttribute('data-theme')||'dark')==='dark';
  h+=`<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px;margin-top:16px">Appearance</div>
    <div class="theme-toggle" data-action="toggleTheme">
      <span style="font-size:18px">${isDark?'🌙':'☀️'}</span>
      <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text)" id="theme-label">${isDark?'Dark Mode':'Light Mode'}</div><div style="font-size:11px;color:var(--text-muted)">Switch between light and dark</div></div>
      <div class="theme-track ${isDark?'on':''}" id="theme-track"><div class="theme-thumb"></div></div>
    </div>`;
  // Storage
  let total=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&(k.startsWith('labenc_')||k.startsWith('lab_')))total+=(localStorage.getItem(k)||'').length}
  const pct=Math.min(100,Math.round(total/5242880*100));
  h+=`<div class="info-card" style="margin-top:12px"><div class="info-card-title">💾 Local Storage</div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px"><span>${(total/1024).toFixed(1)} KB</span><span>${pct}%</span></div><div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${pct>80?'var(--orange)':'var(--purple)'}"></div></div></div>`;
  // Logout
  h+=`<button class="big-btn btn-danger" data-action="doLogout" style="margin-top:16px">Sign Out</button>`;
  document.getElementById('settings-content').innerHTML=h;
}

// ═══ THEME ═══
function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme')||'dark';
  const next=current==='dark'?'light':'dark';
  html.setAttribute('data-theme',next);
  localStorage.setItem('lab_theme',next);
  const track=document.getElementById('theme-track');
  const label=document.getElementById('theme-label');
  if(track)track.classList.toggle('on',next==='dark');
  if(label)label.textContent=next==='dark'?'Dark Mode':'Light Mode';
}
(function(){
  const saved=localStorage.getItem('lab_theme')||'dark';
  document.documentElement.setAttribute('data-theme',saved);
})();

// ═══ IDLE TIMEOUT ═══
let _idleTimer=null;
function resetIdleTimer(){clearTimeout(_idleTimer);_idleTimer=setTimeout(()=>{AppDialog.alert('Session expired due to inactivity.');doLogout()},30*60*1000)}
['mousemove','mousedown','keydown','scroll','touchstart'].forEach(evt=>document.addEventListener(evt,resetIdleTimer,{passive:true}));
resetIdleTimer();

// Standalone mode: LOCK to Lab portal only
(function(){
  if(new URLSearchParams(location.search).get('standalone')==='1'){
    document.title='VELTRUVIA Lab';
    window._standaloneMode=true;
    // Hide cross-portal links on login screen
    document.querySelectorAll('a[href="/patient.html"],a[href="/"],a[href="/admin.html"]').forEach(function(a){
      var p=a.parentElement;
      if(p&&p.children.length<=3) p.style.display='none';
      else a.style.display='none';
    });
    // Also hide any portal links in settings area
    document.querySelectorAll('[onclick*="patient"],[onclick*="doctor"],[onclick*="admin"]').forEach(function(el){el.style.display='none';});
    // Hide any remaining cross-portal elements rendered later
    var obs=new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if(n.nodeType!==1) return;
          if(n.querySelectorAll){
            n.querySelectorAll('a[href="/patient.html"],a[href="/"],a[href="/admin.html"]').forEach(function(a){a.style.display='none';});
          }
        });
      });
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }
})();

// ═══════════════════════════════════════════════════════════════
// v2.1 INSTRUMENT STATUS + ABNORMAL/DELTA HIGHLIGHTING
// ═══════════════════════════════════════════════════════════════
async function loadInstrumentStatus(){
  const el=document.getElementById('instrument-status-card');if(!el)return;
  try{
    const s=await api('/x/instrument-status');
    const m=(s&&s.mllp)||{};
    const on=!!m.enabled;
    el.innerHTML=`<div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:26px">${on?'🟢':'⚪'}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px">MLLP listener ${on?'active':'off'}${m.port?' · port '+esc(String(m.port)):''}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${s?s.resultsLast24h:0} results stored (24h)${m.connections?(' · '+esc(String(m.connections))+' instrument connection(s)'):''} · instruments send HL7 ORU^R01 to this port</div>
      </div>
    </div>`;
  }catch(e){
    el.innerHTML='<div class="empty-card" style="margin:0">Instrument feed unavailable offline.</div>';
  }
}
// Patch initDashboard to also refresh the instrument card
const _initDashboard=initDashboard;
initDashboard=function(){_initDashboard();loadInstrumentStatus();};

// Abnormal/delta coloring on history result cards — flags numeric values
// outside the server's reference ranges or carrying big moves vs. the
// patient's previous result (server returns deltaCheck on save; for
// history we approximate client-side with simple band rules).
function _abnClass(test,val){
  const t=String(test||'').toLowerCase();
  const v=Number(val);if(!Number.isFinite(v))return'';
  const bands=[['hemoglobin',13.5,17.5],['hgb',13.5,17.5],['wbc',4000,11000],['platelets',150000,450000],['glucose',70,200],['creatinine',0.6,1.3],['potassium',3.5,5.1],['sodium',135,145],['hba1c',4,6.5],['alt',7,56],['ast',10,40],['crp',0,10]];
  for(const [k,lo,hi] of bands){if(t.includes(k)){return v<lo||v>hi?'abn':'ok';}}
  return'';
}
