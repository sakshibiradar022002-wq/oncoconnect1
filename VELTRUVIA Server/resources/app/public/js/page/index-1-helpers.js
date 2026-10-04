

// ── Action-dispatcher helpers (replaced inline-handler arithmetic) ──
function rNotesEditJson(json){let n;try{n=JSON.parse(json);}catch(e){return;}rNotesEdit(n);}
function apptWeekNav(delta){_apptWeekOffset = delta===0?0:_apptWeekOffset+delta;renderApptCalendar();}
function docCalNav(delta){calMonth+=delta;if(calMonth<0){calMonth=11;calYear--;}if(calMonth>11){calMonth=0;calYear++;}renderDocCal();}
function addDefaultAvailRow(){_availRows.push({dayOfWeek:1,startTime:'09:00',endTime:'12:00',slotDuration:30,active:true});renderAvailRows();}
function selectICDVal(code){const item=ICD_DB.find(i=>i.code===code);if(item)selectICD(code,item.label);closeOverlay('icd-lookup-modal');}
function calDayNav(hasLog,d,mrn){if(String(hasLog)==="1")showCalLogDetail(d);else openRecord(mrn);}
function removeBatchRow(idx){if(typeof idx==="number"){_batchRows.splice(idx,1);renderBatchRows();}else{removeBatchRowImpl(idx);}}
// ── Global Error Boundary ──
window.onerror=function(msg,src,line,col,err){
  console.error('[VELTRUVIA Error]',{msg,src,line,col,err});
  const el=document.getElementById('error-banner');
  if(el){el.textContent='⚠️ '+msg;el.style.display='block';setTimeout(()=>el.style.display='none',8000);}
  return false;
};
window.addEventListener('unhandledrejection',function(e){
  console.error('[VELTRUVIA Unhandled Promise]',e.reason);
  const el=document.getElementById('error-banner');
  if(el){el.textContent='⚠️ '+String(e.reason?.message||e.reason||'Unknown error');el.style.display='block';setTimeout(()=>el.style.display='none',8000);}
});
// ── Storage layer: encrypted-at-rest via SecureStore (js/secure-store.js) ──
// All app data ('pat_', 'appts_', 'lab_', messages, logs…) is AES-256-GCM
// encrypted locally; the key is wrapped by the OS (Electron safeStorage).
// Theme prefs stay plaintext (non-PHI).
const LS={
  get:k=>SecureStore.get(k),
  set:(k,v)=>SecureStore.set(k,v),
  del:k=>SecureStore.del(k),
  keys:pre=>SecureStore.names(pre),
  // Raw-string accessor for the sync flush path (adds 'cc_' prefix).
  // Returns a JSON string or null; reads through the memory cache so it
  // works on encrypted entries.
  getJSON:k=>{const v=SecureStore.peek(k);return v===undefined?null:JSON.stringify(v);},
};
SecureStore.init({namespace:'cc'});

var currentDoc=null, selectedMRN=null, selectedChatMRN=null;
let rLabs=[], rMeds=[], rAllergies=[];// ═══ UNDO/REDO SYSTEM ═══
const _undoStack={};const _redoStack={};const MAX_UNDO=30;
function pushUndo(mrn){
  if(!mrn)return;
  const p=LS.get('pat_'+mrn);if(!p)return;
  if(!_undoStack[mrn])_undoStack[mrn]=[];
  _undoStack[mrn].push(JSON.parse(JSON.stringify(p)));
  if(_undoStack[mrn].length>MAX_UNDO)_undoStack[mrn].shift();
  _redoStack[mrn]=[];
}
function undo(mrn){
  if(!_undoStack[mrn]||!_undoStack[mrn].length)return false;
  const current=LS.get('pat_'+mrn);
  if(current){if(!_redoStack[mrn])_redoStack[mrn]=[];_redoStack[mrn].push(JSON.parse(JSON.stringify(current)));}
  const prev=_undoStack[mrn].pop();
  LS.set('pat_'+mrn,prev);
  if(selectedMRN===mrn)openRecord(mrn);
  flash('Undo applied');return true;
}
function redo(mrn){
  if(!_redoStack[mrn]||!_redoStack[mrn].length)return false;
  const current=LS.get('pat_'+mrn);
  if(current){_undoStack[mrn].push(JSON.parse(JSON.stringify(current)));}
  const next=_redoStack[mrn].pop();
  LS.set('pat_'+mrn,next);
  if(selectedMRN===mrn)openRecord(mrn);
  flash('Redo applied');return true;
}
// Keyboard shortcuts
let _lastSaveMRN=null;
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();if(selectedMRN)undo(selectedMRN);}
  if((e.ctrlKey||e.metaKey)&&e.key==='z'&&e.shiftKey){e.preventDefault();if(selectedMRN)redo(selectedMRN);}
  if((e.ctrlKey||e.metaKey)&&e.key==='y'){e.preventDefault();if(selectedMRN)redo(selectedMRN);}
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();if(selectedMRN){pushUndo(selectedMRN);saveRecord();}}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPatientSearch();}
});

// ═══ DRUG INTERACTION DATABASE ═══
const DRUG_INTERACTIONS={
  'temozolomide+valproic acid':['Increased temozolomide levels','Monitor CBC closely'],
  'temozolomide+warfarin':['Increased bleeding risk','Check INR frequently'],
  'bevacizumab+aspirin':['Increased hemorrhage risk','Monitor for bleeding'],
  'bevacizumab+anticoagulants':['High hemorrhage risk','Consider discontinuing anticoagulant'],
  'lomustine+myelosuppressive drugs':['Additive bone marrow suppression','Monitor ANC weekly'],
  'dexamethasone+nsaids':['Increased GI ulcer risk','Add gastroprotection'],
  'dexamethasone+anticoagulants':['Altered anticoagulant effect','Monitor INR'],
  'carboplatin+aminoglycosides':['Enhanced nephrotoxicity','Monitor renal function'],
  'irinotecan+valproic acid':['Increased irinotecan toxicity','Avoid combination'],
  'vincristine+cisplatin':['Enhanced neurotoxicity','Monitor neurological status'],
  'phenytoin+warfarin':['Complex interaction','Monitor INR closely'],
  'levetiracetam+warfarin':['Minimal interaction','Safe to combine'],
};
function checkDrugInteractions(meds){
  const interactions=[];
  const names=meds.map(m=>(m.name||'').toLowerCase().trim());
  for(let i=0;i<names.length;i++){
    for(let j=i+1;j<names.length;j++){
      const key1=names[i]+'+'+names[j];
      const key2=names[j]+'+'+names[i];
      if(DRUG_INTERACTIONS[key1])interactions.push({drugs:[names[i],names[j]],effects:DRUG_INTERACTIONS[key1],severity:'warning'});
      if(DRUG_INTERACTIONS[key2])interactions.push({drugs:[names[j],names[i]],effects:DRUG_INTERACTIONS[key2],severity:'warning'});
    }
  }
  return interactions;
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
// ── Server API helper ──
async function api(path,opts){
  const r=await fetch('/api'+path,Object.assign({credentials:'include',headers:{'Content-Type':'application/json'}},opts));
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d.error||r.statusText),{status:r.status});
  return d;
}
// ── Input length sanitization ──
function sanitizeInput(el,maxLen){if(!el)return;const v=el.value;if(v.length>maxLen){el.value=v.slice(0,maxLen);}}
// Enforce max-length on critical inputs
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('input[maxlength],textarea[maxlength]').forEach(el=>{
    const mx=parseInt(el.getAttribute('maxlength'),10);if(mx>0)el.addEventListener('input',()=>sanitizeInput(el,mx));
  });
  // Desktop mode: enable Create Account button without OTP verification
  if(window.app?.isElectron){const b=document.getElementById('btn-create-account');if(b){b.disabled=false;b.style.opacity='1';}const h=document.getElementById('rg-create-hint');if(h)h.textContent='';const v=document.getElementById('rg-verify-send');if(v)v.style.display='none';const vi=document.getElementById('rg-verify-input');if(vi)vi.style.display='none';const badge=document.getElementById('rg-verify-badge');if(badge){badge.textContent='Desktop Mode';badge.style.background='rgba(16,185,129,.1)';badge.style.color='var(--green)';}const vd=document.getElementById('rg-verify-done');if(vd)vd.style.display='none';}});
function v(id){const el=document.getElementById(id);return el?(el.value||'').trim():'';}
function flash(msg){const d=document.createElement('div');d.style.cssText='position:fixed;top:16px;right:16px;background:var(--green);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:var(--shadow-lg);';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2500);}

// ── Server Sync Push ──
async function pushToServer(changes){try{await api('/sync',{method:'PUT',body:JSON.stringify({changes})})}catch(e){console.warn('[sync] push failed:',e.message)}}

// ── Auth ──
function switchATab(tab,btn){document.querySelectorAll('.ts-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.getElementById('a-login').style.display=tab==='login'?'block':'none';document.getElementById('a-register').style.display=tab==='register'?'block':'none';
  // Reset OTP state when switching to register
  if(tab==='register'){
    _regVerificationToken=null;
    document.getElementById('rg-verify-send').style.display='block';
    document.getElementById('rg-verify-input').style.display='none';
    document.getElementById('rg-verify-done').style.display='none';
    document.getElementById('rg-otp-dev').style.display='none';
    document.getElementById('btn-send-otp').disabled=false;
    document.getElementById('btn-send-otp').textContent='📧 Send Verification Code';
    document.getElementById('btn-create-account').disabled=true;
    document.getElementById('rg-create-hint').textContent='Verify your email above first';
    const badge=document.getElementById('rg-verify-badge');
    badge.textContent='Required';badge.style.background='rgba(245,158,11,.1)';badge.style.color='var(--orange)';
    document.getElementById('rg-otp').value='';
  }}
function showMsg(id,msg,type='err'){const el=document.getElementById(id);if(!el)return;el.innerHTML=msg;el.className='msg '+type;el.style.display='block';if(type==='err')setTimeout(()=>{if(el)el.style.display='none';},5000);}
function clearRegMsg(){['reg-msg','reg-ok'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});}

// Email duplicate check
let _emailCheckTimer=null;
function checkEmailExists(email){
  clearTimeout(_emailCheckTimer);
  const el=document.getElementById('rg-email-status');
  if(!email||!email.includes('@')){el.innerHTML='';return;}
  _emailCheckTimer=setTimeout(()=>{
    const exists=LS.get('doc_email_'+email.toLowerCase().trim().replace(/[^a-z0-9]/g,'_'));
    if(exists){el.innerHTML='<span style="color:var(--red);">✗ Account exists — <a href="#" data-action="switchATab:login,@q:.ts-btn" style="color:var(--blue);">sign in instead?</a></span>';}
    else{el.innerHTML='<span style="color:var(--green);">✓ Available</span>';}
  },400);
}

// Password strength
function checkPassStrength(pass){
  const fill=document.getElementById('rg-pass-fill'),label=document.getElementById('rg-pass-label');
  if(!fill||!label)return;
  let score=0;
  if(pass.length>=8)score++;if(pass.length>=12)score++;if(/[A-Z]/.test(pass))score++;if(/[0-9]/.test(pass))score++;if(/[^A-Za-z0-9]/.test(pass))score++;
  const levels=[{w:'0%',col:'var(--border2)',txt:''},{w:'20%',col:'var(--red)',txt:'Very weak'},{w:'40%',col:'var(--red)',txt:'Weak'},{w:'60%',col:'var(--orange)',txt:'Fair'},{w:'80%',col:'var(--orange)',txt:'Good'},{w:'100%',col:'var(--green)',txt:'Strong ✓'}];
  const l=levels[Math.min(score,5)];fill.style.width=l.w;fill.style.background=l.col;label.textContent=l.txt;label.style.color=l.col;
}

// ═══ EMAIL OTP VERIFICATION ═══
let _regVerificationToken=null;

async function sendRegOtp(){
  const email=v('rg-email').toLowerCase().trim();
  if(!email||!email.includes('@')){showMsg('reg-msg','Enter your email address first.');return;}
  const btn=document.getElementById('btn-send-otp');
  btn.disabled=true;btn.textContent='Sending…';
  try{
    const r=await api('/auth/otp/send',{method:'POST',body:JSON.stringify({email,purpose:'register'})});
    document.getElementById('rg-verify-send').style.display='none';
    document.getElementById('rg-verify-input').style.display='block';
    // Show dev OTP if returned
    if(r.otp){
      const devEl=document.getElementById('rg-otp-dev');
      devEl.style.display='block';
      devEl.innerHTML=`🔑 <strong>Dev Mode:</strong> Your code is <span style="font-weight:800;font-family:var(--mono);font-size:16px;letter-spacing:3px">${r.otp}</span>`;
    }
    document.getElementById('rg-otp').focus();
  }catch(e){
    showMsg('reg-msg',e.message);
    btn.disabled=false;btn.textContent='📧 Send Verification Code';
  }
}

async function verifyRegOtp(){
  const email=v('rg-email').toLowerCase().trim();
  const code=v('rg-otp');
  if(!code||code.length!==6){showMsg('reg-msg','Enter the 6-digit code.');return;}
  try{
    const r=await api('/auth/otp/verify',{method:'POST',body:JSON.stringify({email,code,purpose:'register'})});
    if(r.ok&&r.verificationToken){
      _regVerificationToken=r.verificationToken;
      document.getElementById('rg-verify-input').style.display='none';
      document.getElementById('rg-verify-done').style.display='block';
      const badge=document.getElementById('rg-verify-badge');
      badge.textContent='Verified ✓';badge.style.background='rgba(16,185,129,.1)';badge.style.color='var(--green)';
      // Enable create account button
      document.getElementById('btn-create-account').disabled=false;
      document.getElementById('rg-create-hint').textContent='';
      document.getElementById('btn-create-account').style.opacity='1';
    }
  }catch(e){
    showMsg('reg-msg',e.message);
    if(e.message&&e.message.includes('expired')){
      document.getElementById('rg-verify-input').style.display='none';
      document.getElementById('rg-verify-send').style.display='block';
      document.getElementById('btn-send-otp').disabled=false;
      document.getElementById('btn-send-otp').textContent='📧 Send Verification Code';
    }
  }
}

// Account creation — requires email verification first
async function createAccount(){
  const name=v('rg-name').trim(),email=v('rg-email').toLowerCase().trim(),pass=v('rg-pass');
  if(!name){showMsg('reg-msg','Name is required.');return;}
  if(!email||!email.includes('@')){showMsg('reg-msg','Enter a valid email.');return;}
  if(pass.length<10||!/[A-Za-z]/.test(pass)||!/\d/.test(pass)){showMsg('reg-msg','Password: 10+ chars, letter + number required.');return;}
  if(!_regVerificationToken&&!window.app?.isElectron){showMsg('reg-msg','Please verify your email address first.');return;}
  // Check server for existing email (also keep local check for offline)
  if(LS.get('doc_email_'+email.replace(/[^a-z0-9]/g,'_'))){showMsg('reg-msg','Account exists locally. <a href="#" data-action="switchATab:login,@q:.ts-btn" style="color:var(--blue);">Sign in?</a>');return;}
  const spec=v('rg-spec'),hosp=v('rg-hosp').trim();
  showMsg('reg-msg','Creating account…','ok');
  try{
    const regToken = _regVerificationToken || (window.app?.isElectron ? 'desktop-electron-bypass' : null);
    const r=await api('/auth/register',{method:'POST',body:JSON.stringify({name,email,password:pass,specialty:spec,institution:hosp,emailVerificationToken:regToken})});
    showMsg('reg-ok',r.message||'Account created! Redirecting to sign in…','ok');
    _regVerificationToken=null;
  }catch(e){
    if(e.message&&e.message.includes('EMAIL_NOT_VERIFIED')){
      showMsg('reg-msg','Email verification expired. Please verify again.');
      _regVerificationToken=null;
      document.getElementById('rg-verify-done').style.display='none';
      document.getElementById('rg-verify-send').style.display='block';
      document.getElementById('btn-send-otp').disabled=false;
      document.getElementById('btn-send-otp').textContent='📧 Send Verification Code';
      document.getElementById('btn-create-account').disabled=true;
      const badge=document.getElementById('rg-verify-badge');
      badge.textContent='Required';badge.style.background='rgba(245,158,11,.1)';badge.style.color='var(--orange)';
      return;
    }
    // Server unreachable — save locally for offline mode
    showMsg('reg-ok','Account created (offline). Redirecting to sign in…','ok');
  }
  // Also save locally for offline fallback
  const passHash=await makePasswordHash(pass);
  const docIdReal='DOC-'+Date.now().toString(36);
  const doctor={docId:docIdReal,name,email,spec,hosp,pass:passHash,created:Date.now()};
  LS.set('doc_'+doctor.docId,doctor);
  LS.set('doc_email_'+email.replace(/[^a-z0-9]/g,'_'),doctor.docId);
  setTimeout(()=>{
    switchATab('login',document.querySelectorAll('.ts-btn')[0]);
    document.getElementById('li-email').value=email;
  },1500);
}

// PBKDF2 — format must match server (pbkdf2v2 with SHA-256)
async function makePasswordHash(plaintext){
  const enc=new TextEncoder();
  const saltBytes=crypto.getRandomValues(new Uint8Array(16));
  // Encode salt as base64url string
  const saltB64=btoa(String.fromCharCode(...saltBytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  // IMPORTANT: Use the base64url STRING as UTF-8 bytes for PBKDF2 (matching server's pbkdf2Sync behavior)
  const saltStrBytes=enc.encode(saltB64);
  const keyMaterial=await crypto.subtle.importKey('raw',enc.encode(plaintext),{name:'PBKDF2'},false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltStrBytes,iterations:210000,hash:'SHA-256'},keyMaterial,256);
  // Use standard base64 for hash (matching server's .toString('base64'))
  const hashB64=btoa(String.fromCharCode(...new Uint8Array(bits)));
  return 'pbkdf2v2:210000:'+saltB64+':'+hashB64;
}

async function verifyPBKDF2v2(input,stored){
  // Server format: pbkdf2v2:<iterations>:<salt_b64url>:<hash_b64>
  if(!stored||!stored.startsWith('pbkdf2v2:'))return input===stored;
  const[,iterStr,saltB64,hashB64]=stored.split(':');
  const iterations=parseInt(iterStr,10);
  if(!saltB64||!hashB64||!iterations)return false;
  const enc=new TextEncoder();
  // Use base64url string as UTF-8 bytes for PBKDF2 (matching server's pbkdf2Sync behavior)
  const saltStrBytes=enc.encode(saltB64);
  const keyMaterial=await crypto.subtle.importKey('raw',enc.encode(input),{name:'PBKDF2'},false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltStrBytes,iterations,hash:'SHA-256'},keyMaterial,256);
  // Use standard base64 for comparison (matching server's .toString('base64'))
  const computedHash=btoa(String.fromCharCode(...new Uint8Array(bits)));
  return computedHash===hashB64;
}
async function verifyPassword(input,stored){
  if(!stored)return false;
  if(stored.startsWith('pbkdf2v2:'))return verifyPBKDF2v2(input,stored);
  if(!stored.startsWith('pbkdf2:'))return input===stored;
  const[,saltB64,hashB64]=stored.split(':');
  const enc=new TextEncoder();
  const salt=Uint8Array.from(atob(saltB64),c=>c.charCodeAt(0));
  const keyMaterial=await crypto.subtle.importKey('raw',enc.encode(input),{name:'PBKDF2'},false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-512'},keyMaterial,512);
  const newHash=btoa(String.fromCharCode(...new Uint8Array(bits)));
  return newHash===hashB64;
}

// Password generation
function genPass(){
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*+-=?';
  const arr=new Uint8Array(16);crypto.getRandomValues(arr);
  return Array.from(arr,b=>chars[b%chars.length]).join('');
}
function genLabUser(name){
  const slug=name.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8);
  const arr=new Uint8Array(2);crypto.getRandomValues(arr);
  return slug+String(arr[0]%100).padStart(2,'0')+String(arr[1]%100).padStart(2,'0');
}

async function doLogin(){
  const email=v('li-email').toLowerCase().trim(),pass=v('li-pass'),totp=v('li-totp');
  if(!email||!pass){showMsg('login-msg','Enter email and password.');return;}
  try{
    // Try server-side login first
    const body={email,password:pass};if(totp)body.totpCode=totp;
    const r=await api('/auth/login',{method:'POST',body:JSON.stringify(body)});
    if(r.ok&&r.user){
      currentDoc={docId:r.user.id,email:r.user.email,name:r.user.name,spec:r.user.meta?.specialty||'',institution:r.user.meta?.institution||'',role:r.user.role};
      // Pull all doctor data from server into localStorage
      try{const sync=await api('/sync');if(sync&&sync.keys){for(const[k,entry]of Object.entries(sync.keys)){if(entry&&entry.v!==undefined)LS.set(k,entry.v)}}}catch(e){/* sync pull failed, continue with local data */}
      document.getElementById('auth-screen').style.display='none';
      document.getElementById('app').style.display='flex';
      document.getElementById('doc-name').textContent=r.user.name;
      document.getElementById('doc-role').textContent=r.user.meta?.specialty||'Doctor';
      document.getElementById('doc-av').textContent=r.user.name.charAt(0);
      document.getElementById('greet-text').textContent='Welcome back, '+r.user.name.split(' ')[0];
      refreshAll();
      return;
    }
  }catch(e){
    if(e.status===401&&e.message?.includes('TOTP')){
      const totpField=document.getElementById('li-totp-field');
      if(totpField){totpField.style.display='block';showMsg('login-msg','Enter the 6-digit code from your authenticator app.');}
      return;
    }
    if(e.status===403&&e.message?.includes('pending')){
      showMsg('login-msg',e.message);
      return;
    }
  }
  // Local fallback (offline mode)
  const docId=LS.get('doc_email_'+email.replace(/[^a-z0-9]/g,'_'));
  if(!docId){showMsg('login-msg','No account found for this email.');return;}
  const doc=LS.get('doc_'+docId);
  if(!doc){showMsg('login-msg','Account data not found.');return;}
  const ok=await verifyPassword(pass,doc.pass);
  if(!ok){showMsg('login-msg','Wrong password.');return;}
  currentDoc=doc;
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('doc-name').textContent=doc.name;
  document.getElementById('doc-role').textContent=doc.spec;
  document.getElementById('doc-av').textContent=doc.name.charAt(0);
  document.getElementById('greet-text').textContent='Welcome back, '+doc.name.split(' ')[0];
  refreshAll();
}

function doLogout(){
  // Revoke session server-side
  api('/auth/logout',{method:'POST'}).catch(()=>{});
  currentDoc=null;selectedMRN=null;
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('app').style.display='none';
}
// ── Session timeout: auto-logout after 30 minutes of inactivity ──
let _idleTimer=null;
function resetIdleTimer(){clearTimeout(_idleTimer);_idleTimer=setTimeout(()=>{AppDialog.alert('Session expired due to inactivity.');doLogout();},30*60*1000);}
['mousemove','mousedown','keydown','scroll','touchstart'].forEach(evt=>document.addEventListener(evt,resetIdleTimer,{passive:true}));
resetIdleTimer();
// ── Session security: validate session on tab visibility change ──
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&currentDoc){api('/auth/login',{method:'POST',body:JSON.stringify({email:currentDoc.email,password:''})}).catch(()=>{});}
});

// ═══ THEME TOGGLE ═══
function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme')||'dark';
  const next=current==='dark'?'light':'dark';
  html.setAttribute('data-theme',next);
  localStorage.setItem('onco_theme',next);
  updateThemeUI(next);
}
function updateThemeUI(theme){
  const icon=document.getElementById('theme-icon');
  const label=document.getElementById('theme-label');
  const track=document.getElementById('theme-track');
  if(!icon)return;
  if(theme==='dark'){
    icon.textContent='🌙';label.textContent='Dark Mode';track.classList.add('dark');
  }else{
    icon.textContent='☀️';label.textContent='Light Mode';track.classList.remove('dark');
  }
}
(function initTheme(){
  const saved=localStorage.getItem('onco_theme')||'dark';
  document.documentElement.setAttribute('data-theme',saved);
  document.addEventListener('DOMContentLoaded',()=>updateThemeUI(saved));
})();

// ── Navigation ──

function showPanel(id,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(btn)btn.classList.add('active');
  document.body.classList.remove('nav-open');
  if(id==='overview')refreshOverview();
  if(id==='patients')renderPatList();
  if(id==='calendars')populateCalSel();
  if(id==='messages')renderChatConvos();
  if(id==='labs'){populateLabDropdowns();refreshLabList();renderLabTaskQueue();}
  if(id==='backup')refreshStorageInfo();
  if(id==='broadcast'){checkBroadcastEmailStatus();loadBroadcastContacts();}
}
function closeRecord(){document.getElementById('record-shell').classList.remove('open');selectedMRN=null;}
function openOverlay(id){document.getElementById(id).classList.add('open');}
function closeOverlay(id){document.getElementById(id).classList.remove('open');}
function showRTab(id,btn){
  document.querySelectorAll('.rtab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.rnav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if(btn)btn.classList.add('active');
  if(id==='rt-creds'&&selectedMRN)loadPendingPasswordRequests(selectedMRN);
}

// ── Patient Management ──
function getMyPatients(){return LS.keys('pat_').map(k=>LS.get(k)).filter(p=>p&&!Array.isArray(p)&&p.mrn&&p.name);}

function renderPatList(){
  const q=(v('pat-search')||'').toLowerCase(),phase=v('pat-phase-filter');
  const pats=getMyPatients().filter(p=>{
    if(phase&&p.phase!==phase)return false;
    if(q&&!p.name?.toLowerCase().includes(q)&&!p.mrn?.toLowerCase().includes(q)&&!p.diag?.toLowerCase().includes(q))return false;
    return true;
  }).sort((a,b)=>(b.updatedAt||b.created||0)-(a.updatedAt||a.created||0));
  const el=document.getElementById('pat-list');
  if(!pats.length){el.innerHTML='<div class="empty-card">No patients found.</div>';return;}
  el.innerHTML=pats.map(p=>{
    const ds=p.diseaseStatus||'Stable';
    const dsColors={Active:'var(--blue)',Stable:'var(--cyan)',Remission:'var(--green)',Progression:'var(--red)',Relapse:'var(--orange)',Deceased:'var(--text-dim)'};
    return `<div class="patient-row" data-action="openRecord:${escAttr(p.mrn)}">
      <div style="flex:1;"><div class="pat-name">${esc(p.name)}</div><div class="pat-mrn">${p.mrn}</div><div class="pat-diag">${esc(p.diag||'—')}</div></div>
      <span class="badge" style="background:${dsColors[ds]||'var(--text-dim)'}22;color:${dsColors[ds]||'var(--text-dim)'};">${ds}</span>
    </div>`;
  }).join('');
}

function openAddPat(){document.getElementById('ap-creds').style.display='none';document.getElementById('ap-msg').style.display='none';openOverlay('add-pat-modal');}
function calcAddPatAge(){const dob=v('ap-dob');if(!dob)return;const age=Math.floor((Date.now()-new Date(dob))/(365.25*24*3600*1e3));document.getElementById('ap-age').value=age;}

async function createPatient(){
  const name=v('ap-name').trim(),email=v('ap-email').trim(),dob=v('ap-dob'),gender=v('ap-gender'),blood=v('ap-blood'),phone=v('ap-phone').trim(),diag=v('ap-diag').trim(),phase=v('ap-phase');
  if(!name||!diag){showMsg('ap-msg','Name and Diagnosis are required.');return;}
  // Generate MRN
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let mrn='MRN-';const mrnArr=new Uint8Array(8);crypto.getRandomValues(mrnArr);
  mrn+=Array.from(mrnArr,b=>alphabet[b%alphabet.length]).join('');
  const pass=genPass();
  const passHash=await makePasswordHash(pass);
  const age=dob?Math.floor((Date.now()-new Date(dob))/(365.25*24*3600*1e3)):null;
  const patient={mrn,name,email,dob,age,gender,blood,phone,diag,phase,
    docId:currentDoc?.docId||'',
    pass:passHash,diseaseStatus:'Stable',
    ecog:'0 - Fully Active',kps:'100',
    labs:[],meds:[],allergies:[],comorbidities:[],
    mdtNotes:[],imaging:[],txEntries:[],
    created:Date.now(),updatedAt:Date.now()
  };
  LS.set('pat_'+mrn,patient);
  pushToServer({['pat_'+mrn]:patient});
  // Also save to shared JSON store for Patient/Lab login
  try{await api('/sync/save-patient',{method:'POST',body:JSON.stringify({mrn,patient})})}catch(e){console.warn('[store] save-patient failed:',e.message)}
  document.getElementById('ap-creds').style.display='block';
  document.getElementById('ap-creds-mrn').textContent=mrn;
  document.getElementById('ap-creds-pass').textContent=pass;
  refreshAll();
  flash('Patient created: '+name);
}

// ── Overview ──
function refreshOverview(){
  const pats=getMyPatients();
  document.getElementById('st-total').textContent=pats.length;
  document.getElementById('st-active').textContent=pats.filter(p=>p.phase==='Treatment Phase').length;
  const today=new Date().toISOString().slice(0,10);
  let logCount=0;pats.forEach(p=>{if(LS.get('log_'+p.mrn+'_'+today))logCount++;});
  document.getElementById('st-logs').textContent=logCount;
  // Pending appointments count
  let pendingAppts=0;
  pats.forEach(p=>{const appts=LS.get('appts_'+p.mrn)||[];pendingAppts+=appts.filter(a=>a.status==='Scheduled'||a.status==='Requested').length;});
  document.getElementById('st-msgs').textContent=pendingAppts;
  // Recent patients
  const recent=[...pats].sort((a,b)=>(b.updatedAt||b.created||0)-(a.updatedAt||a.created||0)).slice(0,5);
  document.getElementById('ov-patients').innerHTML=recent.length?recent.map(p=>`<div class="patient-row" data-action="openRecord:${escAttr(p.mrn)}"><div style="flex:1;"><div class="pat-name">${esc(p.name)}</div><div class="pat-mrn">${p.mrn} · ${esc(p.diag||'—')}</div></div></div>`).join(''):'<div class="empty-card">No patients yet.</div>';
}

function refreshStorageInfo(){
  let total=0;const cats={};
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&(k.startsWith('ccenc_')||k.startsWith('cc_'))){const v=localStorage.getItem(k)||'';total+=v.length;const name=k.replace(/^ccenc_/,'').replace(/^cc_/,'');const prefix=name.split('_')[0]||'other';cats[prefix]=(cats[prefix]||0)+v.length;}}
  const pct=Math.min(100,Math.round(total/5242880*100));
  document.getElementById('storage-pct').textContent=pct+'%';
  document.getElementById('storage-bar').style.width=pct+'%';
  if(pct>80)document.getElementById('storage-bar').style.background='var(--orange)';
}

function refreshAll(){refreshOverview();refreshStorageInfo();renderPatList();renderFHIRPatSel();populateCalSel();populateLabDropdowns();renderChatConvos();refreshLabList();renderLabTaskQueue();loadLetterheadUI();}
function loadLetterheadUI(){const lh=_getLetterhead();const fields={address:'lh-address',phone:'lh-phone',fax:'lh-fax',license:'lh-license',regno:'lh-regno',website:'lh-website'};Object.entries(fields).forEach(([k,id])=>{const el=document.getElementById(id);if(el&&lh[k])el.value=lh[k];});}

// ── Calendar ──
var calYear,calMonth;const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
function renderDocCal(){
  const mrn=document.getElementById('cal-sel')?.value;
  const view=document.getElementById('cal-view');
  if(!view)return;
  if(!mrn){view.innerHTML='<div class="empty-card">Select a patient above to view their symptom calendar.</div>';return;}
  if(!calYear){const now=new Date();calYear=now.getFullYear();calMonth=now.getMonth();}
  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  // Collect log dates for this patient this month
  const monthPrefix=String(calMonth+1).padStart(2,'0');
  const logDates={};
  const allLogs=LS.keys('log_'+mrn+'_');
  allLogs.forEach(k=>{const log=LS.get(k);if(log&&log.date&&log.date.startsWith(calYear+'-'+monthPrefix))logDates[parseInt(log.date.slice(8,10))]=true;});
  // Collect appointment dates
  const apptDates={};
  const appts=LS.get('appts_'+mrn)||[];
  appts.forEach(a=>{if(a.date&&a.date.startsWith(calYear+'-'+monthPrefix))apptDates[parseInt(a.date.slice(8,10))]=true;});
  let html=`<div class="card" style="margin-top:8px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <button class="btn btn-ghost btn-sm" data-action="docCalNav:-1">←</button>
      <div style="font-weight:800;font-size:15px;">${monthNames[calMonth]} ${calYear}</div>
      <button class="btn btn-ghost btn-sm" data-action="docCalNav:1">→</button>
    </div>
    <div class="cal-grid7">`;
  dayNames.forEach(d=>{html+=`<div class="cal-head-cell">${d}</div>`;});
  for(let i=0;i<firstDay;i++)html+=`<div class="cal-day empty"></div>`;
  const logData={};
  allLogs.forEach(k=>{const log=LS.get(k);if(log&&log.date&&log.date.startsWith(calYear+'-'+monthPrefix))logData[parseInt(log.date.slice(8,10))]=log;});
  window._calLogData=logData;
  window._calMrn=mrn;
  for(let d=1;d<=daysInMonth;d++){
    const isToday=d===today.getDate()&&calMonth===today.getMonth()&&calYear===today.getFullYear();
    const hasLog=logDates[d];
    const hasAppt=apptDates[d];
    html+=`<div class="cal-day${isToday?' today':''}" data-action="calDayNav:${hasLog?'1':'0'},${d},'${escAttr(mrn)}'" style="cursor:pointer;position:relative;">
      <span>${d}</span>
      <div style="display:flex;gap:2px;margin-top:2px;">${hasLog?'<span style="width:5px;height:5px;border-radius:50%;background:var(--green);"></span>':''}${hasAppt?'<span style="width:5px;height:5px;border-radius:50%;background:var(--blue);"></span>':''}</div>
    </div>`;
  }
  html+=`</div>
    <div style="display:flex;gap:14px;margin-top:10px;font-size:11px;color:var(--text-muted);">
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);vertical-align:middle;margin-right:4px;"></span>Log recorded</span>
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--blue);vertical-align:middle;margin-right:4px;"></span>Appointment</span>
    </div>
  </div>`;
  view.innerHTML=html;
}

function showCalLogDetail(day){
  const log=window._calLogData?.[day];
  const mrn=window._calMrn||document.getElementById('cal-sel').value;
  if(!log){openRecord(mrn);return;}
  const syms=[{l:'🧠 Cognitive',s:log.cognitive},{l:'⚡ Seizure',s:log.seizure},{l:'👁️ Vision',s:log.vision},{l:'🤕 Headache',s:log.headache},{l:'😴 Fatigue',s:log.fatigue},{l:'🤢 Nausea',s:log.nausea},{l:'🍽️ Appetite',s:log.appetite},{l:'🌙 Sleep',s:log.sleep},{l:'😊 Mood',s:log.mood}];
  let html=`<div style="text-align:center;margin-bottom:12px;"><div style="font-size:14px;font-weight:800;">📋 Health Log — ${log.date}</div><div style="font-size:11px;color:var(--text-muted);">Day ${day}, ${monthNames[calMonth]} ${calYear}</div></div>`;
  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">`;
  syms.forEach(s=>{const v=s.s||0;const c=v<=3?'var(--green)':v<=6?'var(--orange)':'var(--red)';html+=`<div style="background:var(--surface2);border-radius:6px;padding:8px;"><div style="font-size:10px;color:var(--text-dim);">${s.l}</div><div style="font-size:16px;font-weight:700;color:${c};">${v}<span style="font-size:11px;font-weight:400;">/10</span></div></div>`;});
  html+=`</div>`;
  if(log.temp||log.bp||log.weight||log.meds)html+=`<div style="background:var(--surface2);border-radius:6px;padding:10px;margin-bottom:8px;"><div style="font-size:10px;font-weight:700;color:var(--text-dim);margin-bottom:4px;">VITALS</div><div style="font-size:12px;display:flex;gap:12px;flex-wrap:wrap;">${log.temp?'🌡️ '+log.temp+'°C':''} ${log.bp?'💓 '+log.bp:''} ${log.weight?'⚖️ '+log.weight+'kg':''}</div>${log.meds?'<div style="font-size:12px;margin-top:4px;">💊 '+esc(log.meds)+'</div>':''}</div>`;
  if(log.notes)html+=`<div style="background:var(--surface2);border-radius:6px;padding:10px;margin-bottom:8px;"><div style="font-size:10px;font-weight:700;color:var(--text-dim);margin-bottom:4px;">NOTES</div><div style="font-size:12px;">${esc(log.notes)}</div></div>`;
  let alerts=[];
  if((log.headache||0)>7)alerts.push('⚠ High pain score (>7)');
  if((log.cognitive||0)<4)alerts.push('⚠ Low cognition (<4)');
  if((log.seizure||0)>3)alerts.push('⚠ Seizure activity reported');
  if(alerts.length)html+=`<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:8px;margin-bottom:8px;">${alerts.map(a=>'<div style="color:var(--red);font-size:12px;font-weight:600;">'+a+'</div>').join('')}</div>`;
  html+=`<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-primary" style="flex:1;" data-action="hide:cal-log-overlay;;openRecord:${escAttr(document.getElementById('cal-sel').value)}">Open Full Record</button><button class="btn btn-ghost" style="flex:0;" data-action="hide:cal-log-overlay">Close</button></div>`;
  let ov=document.getElementById('cal-log-overlay');
  if(!ov){ov=document.createElement('div');ov.id='cal-log-overlay';ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px;';ov.onclick=function(e){if(e.target===ov)ov.style.display='none';};document.body.appendChild(ov);}
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;width:100%;max-width:420px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">${html}</div>`;
  ov.style.display='flex';
}
function populateCalSel(){const sel=document.getElementById('cal-sel');if(!sel)return;const pats=getMyPatients();sel.innerHTML='<option value="">— Choose a patient —</option>'+pats.map(p=>`<option value="${p.mrn}">${esc(p.name)} (${p.mrn})</option>`).join('');}
function populateLabDropdowns(){const docId=currentDoc?.docId;if(!docId)return;const pats=getMyPatients();const labs=LS.keys('lab_'+docId+'_').map(k=>LS.get(k)).filter(Boolean);const pSel=document.getElementById('pqr-patient');const lSel=document.getElementById('pqr-lab');if(pSel)pSel.innerHTML='<option value="">— Select —</option>'+pats.map(p=>`<option value="${p.mrn}">${esc(p.name)} (${p.mrn})</option>`).join('');if(lSel)lSel.innerHTML='<option value="">— Select —</option>'+labs.map(l=>`<option value="${l.labId}">${esc(l.name)}</option>`).join('');}
function renderChatConvos(){const el=document.getElementById('chat-convos');if(!el)return;const pats=getMyPatients();if(!pats.length){el.innerHTML='<div style="padding:8px;font-size:11px;color:var(--text-dim);">No patients yet.</div>';return;}el.innerHTML=pats.map(p=>`<div class="chat-conv${selectedChatMRN===p.mrn?' active':''}" data-action="openDocChat:${p.mrn}"><div style="font-weight:600;font-size:12px;">${esc(p.name)}</div><div style="font-size:10px;color:var(--text-dim);">${p.mrn}</div></div>`).join('');}
function openDocChat(mrn){selectedChatMRN=mrn;renderChatConvos();const pats=getMyPatients();const pat=pats.find(p=>p.mrn===mrn);document.getElementById('chat-header').textContent=pat?pat.name:mrn;document.getElementById('chat-inp-row').style.display='flex';renderDocMessages(mrn);}
async function renderDocMessages(mrn){const el=document.getElementById('chat-msgs');if(!el)return;
  let msgs=[];
  try{const r=await api('/sync/get-messages/'+currentDoc.docId+'/'+mrn);if(r&&r.ok&&r.msgs)msgs=r.msgs;}catch(e){}
  if(!msgs.length)msgs=LS.get('msgs_'+currentDoc.docId+'_'+mrn)||[];
  if(!msgs.length){el.innerHTML='<div style="text-align:center;padding:32px;color:var(--text-dim);font-size:12.5px;">No messages yet.</div>';return;}el.innerHTML=msgs.sort((a,b)=>a.timestamp-b.timestamp).map(m=>{const isDoc=m.role==='doctor';return `<div class="msg-bubble ${isDoc?'out':'in'}">${esc(m.text)}<div class="msg-time">${new Date(m.timestamp).toLocaleString()}</div></div>`;}).join('');el.scrollTop=el.scrollHeight;}
async function sendDocMsg(){if(!selectedChatMRN||!currentDoc)return;const inp=document.getElementById('chat-inp');const text=inp.value.trim();if(!text)return;const key='msgs_'+currentDoc.docId+'_'+selectedChatMRN;const msgs=LS.get(key)||[];msgs.push({role:'doctor',text,timestamp:Date.now()});LS.set(key,msgs);try{await api('/sync/send-message',{method:'POST',body:JSON.stringify({mrn:selectedChatMRN,docId:currentDoc.docId,role:'doctor',text})})}catch(e){console.warn('[chat] save to store failed:',e.message)}inp.value='';renderDocMessages(selectedChatMRN);}

// ── Auto-check login ──
window.addEventListener('DOMContentLoaded',()=>{
  const docs=LS.keys('doc_').filter(k=>!k.startsWith('doc_email'));
  // Don't auto-login, show auth screen
});
