
// ── Global Error Boundary ──
window.onerror=function(msg,src,line,col,err){console.error("[VELTRUVIA Error]",{msg,src,line,col,err});return false;};
window.addEventListener("unhandledrejection",function(e){console.error("[VELTRUVIA Unhandled Promise]",e.reason);});
// ═══ STORAGE ═══
// Encrypted-at-rest via SecureStore (js/secure-store.js): AES-256-GCM
// locally, key wrapped by the OS through the desktop app's safeStorage.
const LS={get:k=>SecureStore.get(k),set:(k,v)=>SecureStore.set(k,v),del:k=>SecureStore.del(k),keys:pre=>SecureStore.names(pre)};
SecureStore.init({namespace:'cc'});
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}
function escAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function v(id){const el=document.getElementById(id);return el?(el.value||'').trim():''}
function toggle(el){el.classList.toggle('checked')}
function showToast(msg){const t=document.createElement('div');t.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--green2);color:#fff;padding:12px 24px;border-radius:12px;font-size:13px;font-weight:600;z-index:9000;box-shadow:0 8px 32px rgba(5,150,105,.3);animation:toastIn .3s ease,toastOut .3s ease 2.5s forwards;pointer-events:none;font-family:var(--font)';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3000)}

let currentPat=null,currentLab=null,calMonth=new Date().getMonth(),calYear=new Date().getFullYear(),_docId=null;

// ═══ SERVER API ═══
async function api(url,opts={}){const r=await fetch('/api'+url,{credentials:'include',headers:{'Content-Type':'application/json'},...opts});if(!r.ok){const e=await r.json().catch(()=>({error:r.statusText}));throw new Error(e.error||r.statusText)}return r.json()}

// Merge server-returned keys into localStorage (decrypts server-side PHI)
function mergeServerKeys(keys){if(!keys)return;for(const[k,entry]of Object.entries(keys)){if(entry&&entry.v!==undefined){LS.set(k,entry.v)}}}

// ═══ AUTH ═══
function switchLoginTab(tab,btn){document.querySelectorAll('.ltab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.getElementById('login-patient').style.display=tab==='patient'?'block':'none';document.getElementById('login-lab').style.display=tab==='lab'?'block':'none'}

window.addEventListener('DOMContentLoaded',async()=>{
  await SecureStore.readyOr({timeoutMs: 1500}); // hydrate local PHI before first read
  // Hide splash screen
  setTimeout(()=>{const sp=document.getElementById('splash');if(sp){sp.style.opacity='0';sp.style.visibility='hidden';setTimeout(()=>sp.remove(),500)}},1600);
  const b=document.getElementById('conn-banner');
  // First check local data
  const hasLocal=LS.keys('pat_').length>0||LS.keys('doc_').filter(k=>!k.startsWith('doc_email')).length>0;
  if(hasLocal){b.textContent='🔗 Connected to Doctor Software';b.className='conn-banner';return}
  // No local data — check if server is reachable
  try{await api('/health');b.textContent='🟢 Server connected — log in to sync your data';b.className='conn-banner'}
  catch(e){b.textContent='⚠ Doctor Software not connected — data shared when served from same server';b.className='conn-banner warn'}
});

// Find which doctor owns a patient
function findDoctorForPatient(pat){
  // If the patient record has a docId, use it directly — the doctor's
  // profile may not be in localStorage (store-login only syncs patient data)
  // but the docId is still valid as a key for file-based stores.
  if(pat.docId)return pat.docId;
  // Scan all doctor keys in localStorage as fallback
  const docKeys=LS.keys('doc_').filter(k=>!k.startsWith('doc_email'));
  for(const dk of docKeys){
    const patKeys=LS.keys('pat_');
    for(const pk of patKeys){const p=LS.get(pk);if(p&&p.docId===dk)return dk}
  }
  return docKeys[0]||null;
}

async function doLogin(){
  const mrn=v('li-mrn'),pass=v('li-pass');
  const errEl=document.getElementById('pat-login-err');
  if(!mrn||!pass){showErr(errEl,'Enter MRN and password.');return}
  // ── 1. Try shared JSON store login (most reliable cross-app method) ──
  try{
    const result=await api('/sync/store-login',{method:'POST',body:JSON.stringify({mrn, password:pass})});
    if(result&&result.ok&&result.patient){
      const pat={...result.patient,pass:undefined,passPlain:undefined};
      LS.set('pat_'+mrn,pat);
      currentPat=pat;_docId=findDoctorForPatient(pat);
      document.getElementById('screen-login').style.display='none';
      document.getElementById('app-shell').style.display='flex';
      document.getElementById('cal-greeting').textContent='Hello, '+pat.name?.split(' ')[0]+' 👋';
      document.getElementById('cal-phase').textContent=(pat.phase||'Treatment')+(pat.diag?' · '+pat.diag:'');
      document.getElementById('cal-today-badge').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
      renderCalendar();
      checkPendingPCR();
      const b=document.getElementById('conn-banner');b.textContent='🔗 Connected to Doctor Software';b.className='conn-banner';
      return;
    }
  }catch(e){/* store login failed, trying server */}
  // ── 2. Try server login (sql.js DB) ──
  try{
    const result=await api('/sync/patient-login',{method:'POST',body:JSON.stringify({mrn, password:pass})});
    if(result&&result.ok&&result.keys){
      mergeServerKeys(result.keys);
      const pat=LS.get('pat_'+mrn);
      if(pat){
        currentPat=pat;_docId=findDoctorForPatient(pat);
        document.getElementById('screen-login').style.display='none';
        document.getElementById('app-shell').style.display='flex';
        document.getElementById('cal-greeting').textContent='Hello, '+pat.name?.split(' ')[0]+' 👋';
        document.getElementById('cal-phase').textContent=(pat.phase||'Treatment')+(pat.diag?' · '+pat.diag:'');
        document.getElementById('cal-today-badge').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
        renderCalendar();
        checkPendingPCR();
        const b=document.getElementById('conn-banner');b.textContent='🔗 Connected to Doctor Software';b.className='conn-banner';
        return;
      }
    }
  }catch(e){/* Server unreachable or invalid credentials — try local fallback */}
  // ── 3. Local fallback (offline mode) ──
  let pat=null;
  if(LS.get('pat_'+mrn))pat=LS.get('pat_'+mrn);
  else{const keys=LS.keys('pat_');for(const k of keys){const p=LS.get(k);if(p&&p.mrn&&p.mrn.toLowerCase()===mrn.toLowerCase()){pat=p;break}}}
  if(!pat){showErr(errEl,'No patient accounts exist yet. Ask your doctor to create one.');return}
  if(pat.pass&&pat.pass.startsWith('pbkdf2v2:')){
    if(!await verifyPBKDF2v2(pass,pat.pass)){showErr(errEl,'Wrong password.');return}
  }else if(pat.pass&&pat.pass.startsWith('pbkdf2:')){
    if(!await verifyPBKDF2(pass,pat.pass)){showErr(errEl,'Wrong password.');return}
  }else if(pat.passPlain){if(pass!==pat.passPlain){showErr(errEl,'Wrong password.');return}}
  else if(pat.pass){if(pass!==pat.pass){showErr(errEl,'Wrong password.');return}}
  currentPat=pat;_docId=findDoctorForPatient(pat);
  document.getElementById('screen-login').style.display='none';
  document.getElementById('app-shell').style.display='flex';
  document.getElementById('cal-greeting').textContent='Hello, '+pat.name?.split(' ')[0]+' 👋';
  document.getElementById('cal-phase').textContent=(pat.phase||'Treatment')+(pat.diag?' · '+pat.diag:'');
  document.getElementById('cal-today-badge').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  renderCalendar();
  checkPendingPCR();
}

async function verifyPBKDF2(input,stored){
  if(!stored||!stored.startsWith('pbkdf2:'))return input===stored;
  const[,saltB64,hashB64]=stored.split(':');
  const enc=new TextEncoder();
  const salt=Uint8Array.from(atob(saltB64),c=>c.charCodeAt(0));
  const keyMaterial=await crypto.subtle.importKey('raw',enc.encode(input),{name:'PBKDF2'},false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-512'},keyMaterial,512);
  return btoa(String.fromCharCode(...new Uint8Array(bits)))===hashB64;
}
async function verifyPBKDF2v2(input,stored){
  // Server format: pbkdf2v2:<iterations>:<salt_b64url>:<hash_b64>
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
async function verifyLabPassword(input,stored){
  if(!stored)return false;
  if(stored.startsWith('pbkdf2v2:'))return verifyPBKDF2v2(input,stored);
  if(stored.startsWith('pbkdf2:'))return verifyPBKDF2(input,stored);
  return input===stored;
}

function showErr(el,msg){el.textContent=msg;el.style.display='block';setTimeout(()=>{if(el)el.style.display='none'},6000)}

function checkPatientAccounts(){
  const keys=LS.keys('pat_');const el=document.getElementById('pat-accounts-list');
  if(!keys.length){el.innerHTML='<div style="color:var(--text-dim)">No patient accounts found.</div>';return}
  el.innerHTML=keys.slice(0,8).map(k=>{const p=LS.get(k);return p?`<div style="padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:4px;cursor:pointer" data-action="setval:li-mrn,${escAttr(p.mrn)}"><strong>${esc(p.name)}</strong> <span style="font-family:monospace;color:var(--text-dim);font-size:11px">${p.mrn}</span></div>`:''}).join('');
  if(keys.length===1){const p=LS.get(keys[0]);if(p)document.getElementById('li-mrn').value=p.mrn}
}

// Lab login
async function doLabLogin(){
  const user=v('li-lab-user'),pass=v('li-lab-pass');
  const errEl=document.getElementById('lab-login-err');
  if(!user||!pass){showErr(errEl,'Enter username and password.');return}
  // ── Try server login first ──
  try{
    const result=await api('/sync/lab-login',{method:'POST',body:JSON.stringify({username:user, password:pass})});
    if(result&&result.ok&&result.keys){
      mergeServerKeys(result.keys);
      let foundLab=null,foundDocId=null;
      for(const k of LS.keys('lab_')){const lab=LS.get(k);if(lab&&lab.username===user){foundLab=lab;foundDocId=k.split('_')[1];break}}
      if(foundLab){
        currentLab=foundLab;_docId=foundDocId;
        document.getElementById('screen-login').style.display='none';
        document.getElementById('app-shell').style.display='none';
        document.getElementById('screen-lab').style.display='block';
        refreshLabTasks();
        const b=document.getElementById('conn-banner');b.textContent='🔗 Connected to Doctor Software';b.className='conn-banner';
        return;
      }
    }
  }catch(e){/* Server unreachable or invalid — try local fallback */}
  // ── Local fallback (offline or server unreachable) ──
  let foundLab=null,foundDocId=null;
  for(const k of LS.keys('lab_')){const lab=LS.get(k);if(lab&&lab.username===user&&(await verifyLabPassword(pass,lab.password))){foundLab=lab;foundDocId=k.split('_')[1];break}}
  if(!foundLab){showErr(errEl,'No matching lab account found.');return}
  currentLab=foundLab;_docId=foundDocId;
  document.getElementById('screen-login').style.display='none';
  document.getElementById('app-shell').style.display='none';
  document.getElementById('screen-lab').style.display='block';
  refreshLabTasks();
}
function checkLabAccounts(){
  const keys=LS.keys('lab_');const el=document.getElementById('lab-accounts-list');
  if(!keys.length){el.innerHTML='<div style="color:var(--text-dim)">No lab accounts found.</div>';return}
  el.innerHTML=keys.slice(0,5).map(k=>{const l=LS.get(k);return l?`<div style="padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:4px;cursor:pointer" data-action="setval:li-lab-user,${escAttr(l.username)}"><strong>${esc(l.name)}</strong> <span style="font-family:monospace;color:var(--text-dim);font-size:11px">${l.username}</span></div>`:''}).join('');
}
// ═══ THEME TOGGLE ═══
function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme')||'dark';
  const next=current==='dark'?'light':'dark';
  html.setAttribute('data-theme',next);
  localStorage.setItem('onco_patient_theme',next);
  updateThemeUI(next);
}
function updateThemeUI(theme){
  const icon=document.getElementById('theme-icon');
  const label=document.getElementById('theme-label');
  const track=document.getElementById('theme-track');
  const thumb=document.getElementById('theme-thumb');
  if(!icon)return;
  if(theme==='dark'){
    icon.textContent='🌙';label.textContent='Dark Mode';track.style.background='var(--green)';thumb.style.transform='translateX(0)';
  }else{
    icon.textContent='☀️';label.textContent='Light Mode';track.style.background='var(--green2)';thumb.style.transform='translateX(18px)';
  }
}
(function(){
  const saved=localStorage.getItem('onco_patient_theme')||'dark';
  document.documentElement.setAttribute('data-theme',saved);
  document.addEventListener('DOMContentLoaded',()=>updateThemeUI(saved));
})();
function doLogout(){
  // Revoke session server-side
  fetch('/api/auth/logout',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'}}).catch(()=>{});
  currentPat=null;currentLab=null;_docId=null;
  document.getElementById('screen-login').style.display='flex';
  document.getElementById('app-shell').style.display='none';
  document.getElementById('screen-lab').style.display='none';
}
// ── Session timeout: auto-logout after 30 minutes of inactivity ──
let _idleTimer=null;
function resetIdleTimer(){clearTimeout(_idleTimer);_idleTimer=setTimeout(()=>{AppDialog.alert('Session expired due to inactivity.');doLogout();},30*60*1000);}
['mousemove','mousedown','keydown','scroll','touchstart'].forEach(evt=>document.addEventListener(evt,resetIdleTimer,{passive:true}));
resetIdleTimer();
// ── Session security: validate session on tab visibility change ──
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&(currentPat||currentLab)){
    const endpoint=currentPat?'/api/sync/patient':'/api/sync/lab';
    fetch(endpoint,{credentials:'include'}).catch(()=>{});
  }
});

// ═══ PASSWORD CHANGE APPROVAL ═══
async function checkPendingPCR(){
  try{
    const r=await api('/sync/patient/password-change-pending');
    const banner=document.getElementById('pat-pcr-banner');
    if(r.ok&&r.requests&&r.requests.length>0){
      banner.style.display='block';
      window._pcrRequests=r.requests;
    }else{banner.style.display='none';}
  }catch(e){document.getElementById('pat-pcr-banner').style.display='none';}
}

async function approvePCR(){
  const otp=v('pcr-otp');
  const errEl=document.getElementById('pcr-err');
  const okEl=document.getElementById('pcr-ok');
  errEl.style.display='none';okEl.style.display='none';
  if(!otp||otp.length!==6){showErr(errEl,'Enter the 6-digit OTP code.');return;}
  const reqs=window._pcrRequests||[];
  if(!reqs.length){showErr(errEl,'No pending requests found.');return;}
  const req=reqs[0];
  try{
    const r=await api('/sync/patient/password-change-approve',{method:'POST',body:JSON.stringify({requestId:req.id,otp})});
    if(r.ok){
      okEl.style.display='block';
      okEl.textContent='✅ '+r.message;
      errEl.style.display='none';
      document.getElementById('pcr-otp').value='';
      window._pcrRequests=[];
      document.getElementById('pat-pcr-banner').style.display='none';
    }
  }catch(e){showErr(errEl,e.message);}
}

// ═══ NAVIGATION ═══
function goScreen(name){
  document.querySelectorAll('#app-shell .screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.bottom-nav .nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.getElementById('nav-'+name).classList.add('active');
  if(name==='treatment')renderTreatmentPlan();
  if(name==='visits')renderVisits();
  if(name==='appointments')renderPatientAppointments();
  if(name==='rx')renderPatientRx();
  if(name==='messages')renderChat();
  if(name==='profile')renderProfile();
}

// ═══ CALENDAR ═══
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function renderCalendar(){
  const grid=document.getElementById('cal-grid');
  const title=document.getElementById('cal-title');
  title.textContent=MONTHS[calMonth]+' '+calYear;
  let html=DAYS.map(d=>`<div class="cal-head">${d}</div>`).join('');
  const first=new Date(calYear,calMonth,1).getDay();
  const days=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();
  for(let i=0;i<first;i++)html+='<div class="cal-day empty"></div>';
  for(let d=1;d<=days;d++){
    const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasLog=currentPat&&LS.get('log_'+currentPat.mrn+'_'+ds);
    const isToday=d===today.getDate()&&calMonth===today.getMonth()&&calYear===today.getFullYear();
    const hasAppt=currentPat&&(LS.get('appts_'+currentPat.mrn)||[]).some(a=>a.date===ds);
    const dots=(hasLog||hasAppt)?'<div style="position:absolute;bottom:3px;display:flex;gap:2px">'+(hasLog?'<span style="width:4px;height:4px;border-radius:50%;background:var(--green)"></span>':'')+(hasAppt?'<span style="width:4px;height:4px;border-radius:50%;background:var(--blue)"></span>':'')+'</div>':'';
    html+='<div class="cal-day'+(isToday?' today':'')+(hasLog?' has-log':'')+'" data-action="viewDayLog:"+ds+">'+d+dots+'</div>';
  }
  grid.innerHTML=html;
}

// ═══════════════════════════════════════════════════════════════
// APPOINTMENT BOOKING
// ═══════════════════════════════════════════════════════════════
let _slotData={},_slotDateIdx=0,_selectedSlot=null;

function switchApptTab(tab){
  document.getElementById('appt-book-panel').style.display=tab==='book'?'block':'none';
  document.getElementById('appt-my-panel').style.display=tab==='my'?'block':'none';
  document.getElementById('appt-tab-book').style.background=tab==='book'?'var(--green)':'var(--surface)';
  document.getElementById('appt-tab-book').style.color=tab==='book'?'#fff':'var(--text)';
  document.getElementById('appt-tab-my').style.background=tab==='my'?'var(--green)':'var(--surface)';
  document.getElementById('appt-tab-my').style.color=tab==='my'?'#fff':'var(--text)';
  if(tab==='my')renderMyAppts();
}

async function renderPatientAppointments(){
  _slotData={};
  // Try shared store with docId first (works in desktop mode without auth)
  if(_docId){
    try{
      const r=await api('/sync/get-slots/'+_docId+'?days=30');
      if(r.ok&&r.slots&&Object.keys(r.slots).length){_slotData=r.slots;}
    }catch(e){}
  }
  // If no slots yet, try get-slots-all (aggregates all doctors + defaults)
  if(!Object.keys(_slotData).length){
    try{
      const r=await api('/sync/get-slots-all?days=30');
      if(r.ok&&r.slots&&Object.keys(r.slots).length){_slotData=r.slots;}
    }catch(e){}
  }
  // Fallback: try server DB
  if(!Object.keys(_slotData).length){
    try{
      const r=await api('/schedule/slots?days=30');
      if(r.ok&&r.slots&&Object.keys(r.slots).length)_slotData=r.slots;
    }catch(e){}
  }
  _slotDateIdx=0;_selectedSlot=null;
  renderSlotDate();
  // Check for video rooms
  try{
    const vr=await api('/sync/th/my-rooms/'+(_docId||'unknown')+'/'+currentPat.mrn);
    document.getElementById('video-call-btn-container').style.display=(vr.ok&&vr.rooms&&vr.rooms.length>0)?'block':'none';
  }catch(e){}
}

function slotNav(dir){_slotDateIdx+=dir;if(_slotDateIdx<0)_slotDateIdx=0;_selectedSlot=null;renderSlotDate()}

function renderSlotDate(){
  const d=new Date();d.setDate(d.getDate()+_slotDateIdx);
  const ds=d.toISOString().slice(0,10);
  const label=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  document.getElementById('slot-date-label').textContent=label;
  const slots=_slotData[ds]||[];
  const el=document.getElementById('slot-list');
  const empty=document.getElementById('slot-empty');
  const info=document.getElementById('slot-selected-info');
  if(!slots.length){
    el.innerHTML='';
    const hasAnySlots=Object.keys(_slotData).length>0;
    if(hasAnySlots){
      empty.textContent='No available slots on this date. Try another day.';
    }else{
      empty.textContent='No availability configured yet. Your doctor needs to set their schedule.';
    }
    empty.style.display='block';info.style.display='none';return
  }
  empty.style.display='none';
  el.innerHTML=slots.map(s=>`<button data-action="selectSlot:${ds},${s.time},${s.endTime},${s.duration}" style="padding:10px 8px;border-radius:10px;background:var(--surface);border:1.5px solid var(--border);color:var(--text);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;text-align:center">${s.time}</button>`).join('');
}

function selectSlot(date,time,endTime,dur){
  _selectedSlot={date,time,endTime,duration:parseInt(dur)};
  document.getElementById('slot-selected-info').style.display='block';
  const d=new Date(date+'T00:00:00');
  document.getElementById('slot-selected-details').innerHTML=`<div style="margin-bottom:6px"><span style="color:var(--green);font-weight:700">📅 ${d.toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric'})}</span></div><div><span style="color:var(--blue);font-weight:700">⏰ ${time} — ${endTime}</span></div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">Duration: ${dur} min</div>`;
}

async function confirmBookAppt(){
  if(!_selectedSlot)return AppDialog.alert('Select a time slot first');
  const type=document.getElementById('book-appt-type').value;
  const notes=document.getElementById('book-appt-notes').value;
  // Save to shared appointment store (works in desktop mode)
  try{
    await api('/sync/save-appointment',{method:'POST',body:JSON.stringify({mrn:currentPat.mrn,appointment:{date:_selectedSlot.date,time:_selectedSlot.time,type,notes,status:'Scheduled',createdAt:Date.now()}})});
  }catch(e){}
  // Also try server booking
  try{
    const r=await api('/schedule/book',{method:'POST',body:JSON.stringify({date:_selectedSlot.date,startTime:_selectedSlot.time,type,notes})});
    if(r.ok){AppDialog.alert('✅ '+r.message)}else{AppDialog.alert('✅ Appointment request submitted!')}
  }catch(e){AppDialog.alert('✅ Appointment request submitted!')}
  _selectedSlot=null;
  document.getElementById('slot-selected-info').style.display='none';
  // Refresh slots
  try{
    const url=_docId?'/sync/get-slots/'+_docId+'?days=30':'/sync/get-slots-all?days=30';
    const sr=await api(url);if(sr.ok&&sr.slots)_slotData=sr.slots;
  }catch(e){}
  renderSlotDate();
}

async function renderMyAppts(){
  const el=document.getElementById('my-appt-list');
  // Try authenticated schedule API first, then fall back to shared appointments store
  let appts=[];
  try{
    const r=await api('/schedule/my-appointments');
    if(r.ok&&r.appointments&&r.appointments.length)appts=r.appointments;
  }catch(e){}
  if(!appts.length){
    try{
      const r=await api('/sync/get-appointments/'+currentPat.mrn);
      if(r&&r.ok&&r.appointments)appts=r.appointments;
    }catch(e){}
  }
  if(!appts.length){el.innerHTML='<div class="empty-card">No upcoming appointments.</div>';return}
  const statusColors={pending:'var(--orange)',confirmed:'var(--green)',cancelled:'var(--red)',completed:'var(--blue)',Scheduled:'var(--blue)',Requested:'var(--orange)',Confirmed:'var(--green)',Declined:'var(--red)'};
  el.innerHTML=appts.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(a=>{
    const d=new Date((a.date||'')+'T00:00:00');
    const status=(a.status||'').toLowerCase();
    const canCancel=status==='pending'||status==='confirmed'||status==='scheduled';
    const displayType=a.type||'Follow-up';
    const displayTime=a.start_time||a.time||'';
    const displayStatus=a.status||'Scheduled';
    return `<div class="info-card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div><div style="font-weight:700;font-size:14px">${esc(displayType)}</div><div style="font-size:12px;color:var(--text-muted)">${a.date?d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):''} ${displayTime}</div></div>
        <span class="badge" style="background:${statusColors[displayStatus]||statusColors[displayStatus.charAt(0).toUpperCase()+displayStatus.slice(1)]||'var(--border)'};color:#fff;font-size:10px;padding:3px 10px;border-radius:8px">${displayStatus}</span>
      </div>
      ${canCancel?`<button data-action="cancelPatAppt:${a.id||''}" style="margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid rgba(239,68,68,.2);background:rgba(239,68,68,.06);color:var(--red);font-family:inherit;font-size:12px;font-weight:600;cursor:pointer">Cancel</button>`:''}
    </div>`;
  }).join('');
}

async function cancelPatAppt(id){
  if(!await AppDialog.confirm('Cancel this appointment?',{danger:true}))return;
  try{
    const r=await api('/schedule/cancel',{method:'POST',body:JSON.stringify({appointmentId:id})});
    if(r.ok){AppDialog.alert('✅ Appointment cancelled');renderMyAppts()}
  }catch(e){AppDialog.alert(e.message)}
}

// ═══════════════════════════════════════════════════════════════
// PATIENT PRESCRIPTIONS
// ═══════════════════════════════════════════════════════════════
async function renderPatientRx(){
  const el=document.getElementById('rx-list');
  try{
    const r=await api('/rx/my');
    if(!r.ok||!r.prescriptions||!r.prescriptions.length){el.innerHTML='<div class="empty-card">No prescriptions on file.</div>';return}
    const statusIcon={active:'✅',completed:'✔️',cancelled:'❌',expired:'⏰','pending-refill':'🔄'};
    const statusColor={active:'var(--green)',completed:'var(--text-muted)',cancelled:'var(--red)',expired:'var(--orange)','pending-refill':'var(--blue)'};
    el.innerHTML=r.prescriptions.map(rx=>`
      <div class="info-card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div><div style="font-weight:700;font-size:15px">${esc(rx.medication)}${rx.genericName?' <span style="font-size:12px;color:var(--text-muted);font-weight:400">('+esc(rx.genericName)+')</span>':''}</div></div>
          <span style="font-size:11px;color:${statusColor[rx.status]};font-weight:700">${statusIcon[rx.status]||''} ${rx.status}</span>
        </div>
        <div class="irow"><div class="ikey">Dosage</div><div class="ival">${esc(rx.dosage)}</div></div>
        <div class="irow"><div class="ikey">Frequency</div><div class="ival">${esc(rx.frequency)}</div></div>
        ${rx.route?`<div class="irow"><div class="ikey">Route</div><div class="ival">${esc(rx.route)}</div></div>`:''}
        ${rx.duration?`<div class="irow"><div class="ikey">Duration</div><div class="ival">${esc(rx.duration)}</div></div>`:''}
        ${rx.refills?`<div class="irow"><div class="ikey">Refills</div><div class="ival">${rx.refills} remaining</div></div>`:''}
        ${rx.pharmacy?`<div class="irow"><div class="ikey">Pharmacy</div><div class="ival">${esc(rx.pharmacy)}</div></div>`:''}
        ${rx.instructions?`<div style="margin-top:8px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:12px;color:var(--text-muted)">📋 ${esc(rx.instructions)}</div>`:''}
        ${rx.status==='active'?`<button data-action="requestRefill:${rx.id}" style="margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid var(--green);background:rgba(5,150,105,.06);color:var(--green);font-family:inherit;font-size:12px;font-weight:600;cursor:pointer">🔄 Request Refill</button>`:''}
        <div style="font-size:10px;color:var(--text-dim);margin-top:6px">Prescribed: ${rx.prescribedDate||'N/A'}</div>
      </div>
    `).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Error loading prescriptions.</div>'}
}

async function requestRefill(rxId){
  if(!await AppDialog.confirm('Request a refill for this medication?',{danger:false}))return;
  try{
    const r=await api('/rx/refill-request',{method:'POST',body:JSON.stringify({prescriptionId:rxId})});
    if(r.ok){AppDialog.alert('✅ '+r.message);renderPatientRx()}
  }catch(e){AppDialog.alert(e.message)}
}

// ═══════════════════════════════════════════════════════════════
// VIDEO CALL (TELEHEALTH)
// ═══════════════════════════════════════════════════════════════
let _pc=null,_localStream=null,_remoteStream=null,_signalInterval=null;

async function promptJoinVideo(){
  // First check if there's an active room
  try{
    const r=await api('/sync/th/my-rooms/'+(_docId||'unknown')+'/'+currentPat.mrn);
    if(r.ok&&r.rooms&&r.rooms.length>0){joinVideoCall(r.rooms[0].id);return}
  }catch(e){}
  // Ask for room code
  const code=await AppDialog.prompt('Enter video room code from your doctor:');
  if(code&&code.trim())joinVideoCall(code.trim().toUpperCase());
}
async function checkForVideoRooms(){
  promptJoinVideo();
}

async function joinVideoCall(roomCode){
  try{
    _localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
  }catch(e){AppDialog.alert('Camera/microphone access needed for video calls.');return}
  // Join room
  try{await api('/sync/th/join-room',{method:'POST',body:JSON.stringify({roomCode})})}catch(e){}
  // Create video overlay
  const overlay=document.createElement('div');
  overlay.id='video-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column';
  overlay.innerHTML=`
    <div id="remote-video-wrap" style="flex:1;position:relative;background:#111">
      <video id="remote-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;bottom:16px;left:16px;font-size:14px;color:#fff;font-weight:600;background:rgba(0,0,0,.5);padding:6px 12px;border-radius:8px">📹 Video Call</div>
    </div>
    <div style="position:absolute;bottom:80px;right:16px;width:120px;height:160px;border-radius:12px;overflow:hidden;border:2px solid #fff;box-shadow:0 4px 20px rgba(0,0,0,.5);z-index:10000">
      <video id="local-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></div>
    </div>
    <div style="position:absolute;bottom:20px;left:0;right:0;display:flex;justify-content:center;gap:16px;z-index:10000">
      <button data-action="toggleMute" id="btn-mute" style="width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer">🎤</button>
      <button data-action="toggleVideoOff" id="btn-video" style="width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer">📹</button>
      <button data-action="endVideoCall:${roomCode}" style="width:48px;height:48px;border-radius:50%;border:none;background:#dc2626;color:#fff;font-size:20px;cursor:pointer">📞</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('local-video').srcObject=_localStream;
  // Simple WebRTC signaling via polling
  _pc=new RTCPeerConnection(window.VELTRUVIA_RTC ? window.VELTRUVIA_RTC.rtcConfiguration() : {iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  _localStream.getTracks().forEach(t=>_pc.addTrack(t,_localStream));
  _pc.onicecandidate=e=>{if(e.candidate)api('/sync/th/signal',{method:'POST',body:JSON.stringify({roomCode,type:'candidate',data:e.candidate,sender:'patient'})})};
  _pc.ontrack=e=>{document.getElementById('remote-video').srcObject=e.streams[0]};
  const offer=await _pc.createOffer();
  await _pc.setLocalDescription(offer);
  await api('/sync/th/signal',{method:'POST',body:JSON.stringify({roomCode,type:'offer',data:offer,sender:'patient'})});
  // Poll for signaling messages
  let lastTs=Date.now();
  _signalInterval=setInterval(async()=>{
    try{const r=await fetch('/api/sync/th/signal/'+roomCode+'?since='+lastTs,{credentials:'include'});const d=await r.json();
    if(d.messages){for(const m of d.messages){lastTs=Math.max(lastTs,m.timestamp);
      if(m.type==='answer'&&m.sender==='doctor')await _pc.setRemoteDescription(new RTCSessionDescription(m.data));
      if(m.type==='candidate'&&m.sender==='doctor'&&m.data)await _pc.addIceCandidate(new RTCIceCandidate(m.data));
    }}
    }catch(e){}},2000);
}

function toggleMute(){const t=_localStream?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;document.getElementById('btn-mute').textContent=t.enabled?'🎤':'🔇'}}
function toggleVideoOff(){const t=_localStream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;document.getElementById('btn-video').textContent=t.enabled?'📹':'📷'}}

function endVideoCall(roomCode){
  if(_pc){_pc.close();_pc=null}
  if(_localStream){_localStream.getTracks().forEach(t=>t.stop());_localStream=null}
  if(_signalInterval){clearInterval(_signalInterval);_signalInterval=null}
  const ov=document.getElementById('video-overlay');if(ov)ov.remove();
}

function calNav(dir){calMonth+=dir;if(calMonth>11){calMonth=0;calYear++}if(calMonth<0){calMonth=11;calYear--}renderCalendar()}

async function viewDayLog(dateStr){
  if(!currentPat)return;
  const log=LS.get('log_'+currentPat.mrn+'_'+dateStr);
  if(!log){if(await AppDialog.confirm('No log for '+dateStr+'. Log symptoms now?'))openSheet('log-sheet');return}
  renderLogDetail(dateStr);
}

function renderLogDetail(dateStr){
  const log=LS.get('log_'+currentPat.mrn+'_'+dateStr);
  if(!log)return;
  const syms=[
    {label:'🧠 Cognitive',score:log.cognitive},{label:'⚡ Seizure',score:log.seizure},
    {label:'👁️ Vision',score:log.vision},{label:'🤕 Headache',score:log.headache},
    {label:'😴 Fatigue',score:log.fatigue},{label:'🤢 Nausea',score:log.nausea},
    {label:'🍽️ Appetite',score:log.appetite},{label:'🌙 Sleep',score:log.sleep},
    {label:'😊 Mood',score:log.mood}
  ];
  let html=`<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">📅 ${dateStr}</div>`;
  if((log.headache||0)>7)html+='<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--red);margin-bottom:8px">⚠ High pain score (>7)</div>';
  if((log.cognitive||0)<4)html+='<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--red);margin-bottom:8px">⚠ Low cognition (<4)</div>';
  syms.forEach(s=>{
    const sc=s.score||0;const col=sc<=3?'var(--green)':sc<=6?'var(--orange)':'var(--red)';
    html+=`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:3px"><span>${s.label}</span><span style="color:${col}">${sc}/10</span></div><div class="meter"><div class="meter-fill" style="width:${sc*10}%;background:${col}"></div></div></div>`;
  });
  if(log.items&&log.items.length)html+=`<div style="margin-top:8px"><div style="font-size:10px;font-weight:700;color:var(--text-dim);margin-bottom:4px">CHECKED ITEMS</div><div style="display:flex;flex-wrap:wrap;gap:4px">${log.items.map(i=>`<span style="background:var(--blue-pale);color:var(--blue);padding:3px 8px;border-radius:6px;font-size:11px">${esc(i)}</span>`).join('')}</div></div>`;
  if(log.temp||log.weight||log.bp)html+=`<div style="margin-top:10px"><div style="font-size:10px;font-weight:700;color:var(--text-dim);margin-bottom:4px">VITALS</div>${log.temp?'<div style="font-size:12px">🌡️ Temp: '+log.temp+'°C</div>':''}${log.bp?'<div style="font-size:12px">💓 BP: '+log.bp+'</div>':''}${log.weight?'<div style="font-size:12px">⚖️ Weight: '+log.weight+' kg</div>':''}</div>`;
  if(log.notes)html+=`<div style="margin-top:10px"><div style="font-size:10px;font-weight:700;color:var(--text-dim);margin-bottom:4px">NOTES</div><div style="font-size:12px;line-height:1.5">${esc(log.notes)}</div></div>`;
  document.getElementById('log-detail-content').innerHTML=html;
  openSheet('log-detail-sheet');
}

// ═══ LOG SHEET ═══
function openSheet(id){document.getElementById(id).classList.add('open')}
function closeSheet(id){document.getElementById(id).classList.remove('open')}

async function saveLog(){
  if(!currentPat)return;
  const date=new Date().toISOString().slice(0,10);
  const items=[];
  document.querySelectorAll('#log-form-content .check-item.checked').forEach(ci=>items.push(ci.textContent.trim()));
  const log={date,cognitive:+v('s-cog')||5,seizure:+v('s-sz')||0,vision:+v('s-vis')||5,headache:+v('s-head')||0,fatigue:+v('s-fat')||3,nausea:+v('s-naus')||0,appetite:+v('s-app')||7,sleep:+v('s-sleep')||6,mood:+v('s-mood')||6,temp:v('v-temp'),bp:v('v-bp'),weight:v('v-weight'),meds:v('v-meds'),notes:v('v-notes'),items,savedAt:Date.now()};
  LS.set('log_'+currentPat.mrn+'_'+date,log);
  // Also save to shared store so Doctor can see it
  try{await api('/sync/save-log',{method:'POST',body:JSON.stringify({mrn:currentPat.mrn,date,log})})}catch(e){console.warn('[log] save to store failed:',e.message)}
  closeSheet('log-sheet');
  renderCalendar();
  AppDialog.alert('Log saved! ✓');
}

// ═══ FACT-BR ═══
const FACTBR=[
  {t:'I feel well',s:'ph',r:0},{t:'I have nausea',s:'ph',r:1},{t:'Trouble meeting family needs due to condition',s:'ph',r:1},{t:'I have pain',s:'ph',r:1},{t:'Bothered by treatment side effects',s:'ph',r:1},
  {t:'I feel sad',s:'em',r:1},{t:'Satisfied with coping',s:'em',r:0},{t:'Losing hope',s:'em',r:1},{t:'I feel nervous',s:'em',r:1},{t:'I worry about dying',s:'em',r:1},
  {t:'I am able to work',s:'fn',r:0},{t:'My work is fulfilling',s:'fn',r:0},{t:'I enjoy life',s:'fn',r:0},{t:'Content with quality of life',s:'fn',r:0},
  {t:'I get around on my own',s:'br',r:0},{t:'I think clearly',s:'br',r:0},{t:'I remember things',s:'br',r:0},{t:'Trouble with coordination',s:'br',r:1},{t:'I have headaches',s:'br',r:1},{t:'I have seizures',s:'br',r:1},{t:'Trouble concentrating',s:'br',r:1},{t:'I feel confused',s:'br',r:1}
];
const _fbAns={};
function openFactBr(){
  const el=document.getElementById('factbr-questions');
  el.innerHTML=FACTBR.map((item,i)=>`<div style="margin-bottom:14px"><div style="font-size:13px;margin-bottom:6px;line-height:1.4">${i+1}. ${item.t}</div><div style="display:flex;gap:4px">${[0,1,2,3,4].map(n=>`<button class="star-btn" data-idx="${i}" data-action="selFB:@this,${i},${n}"><span class="star-num">${n}</span><span class="star-lbl">${['Not at all','A little','Somewhat','Quite a bit','Very much'][n]}</span></button>`).join('')}</div></div>`).join('');
  openSheet('factbr-sheet');
}
function selFB(btn,idx,val){_fbAns[idx]=val;document.querySelectorAll(`.star-btn[data-idx="${idx}"]`).forEach(b=>b.classList.remove('active'));btn.classList.add('active')}
function saveFactBr(){
  if(!currentPat)return;
  const subs={ph:[],em:[],fn:[],br:[]};
  FACTBR.forEach((item,i)=>{let sc=_fbAns[i]??0;if(item.r)sc=4-sc;subs[item.s].push(sc)});
  const ph=subs.ph.reduce((a,b)=>a+b,0),em=subs.em.reduce((a,b)=>a+b,0),fn=subs.fn.reduce((a,b)=>a+b,0),br=subs.br.reduce((a,b)=>a+b,0);
  const total=ph+em+fn+br,max=FACTBR.length*4,pct=Math.round(total/max*100);
  LS.set('factbr_'+currentPat.mrn+'_'+new Date().toISOString().slice(0,10),{date:new Date().toISOString().slice(0,10),total,max,pct,physical:ph,emotional:em,functional:fn,brain:br,recordedAt:Date.now()});
  closeSheet('factbr-sheet');
  for(const k in _fbAns)delete _fbAns[k];
  AppDialog.alert('FACT-Br Score: '+total+'/'+max+' ('+pct+'%)\nPhysical: '+ph+'\nEmotional: '+em+'\nFunctional: '+fn+'\nBrain Cancer: '+br);
}

// ═══ TREATMENT ═══
function renderTreatmentPlan(){
  if(!currentPat)return;
  const p=LS.get('pat_'+currentPat.mrn);if(!p){document.getElementById('treatment-content').innerHTML='<div class="empty-card">Patient data not found.</div>';return}
  let h='';
  h+=`<div class="info-card" style="font-size:11px;color:var(--text-dim)">Last updated: ${p.updatedAt?new Date(p.updatedAt).toLocaleDateString():'—'}</div>`;
  // Active meds
  const am=(p.meds||[]).filter(m=>m.status==='Active');
  h+='<div class="info-card"><div class="info-card-title">💊 Active Medications</div>';
  if(am.length)h+=am.map(m=>`<div class="irow"><span class="ikey">💊 ${esc(m.name)}</span><span class="ival">${esc(m.dose)} · ${m.route||''} · ${m.freq||''}</span></div>`).join('');
  else h+='<div class="empty-card">No active medications.</div>';
  h+='</div>';
  // Radiotherapy
  if(p.txTechnique||p.txDose){
    h+='<div class="info-card"><div class="info-card-title">⚡ Radiotherapy</div>';
    h+=`<div class="irow"><span class="ikey">Technique</span><span class="ival">${p.txTechnique||'—'}</span></div>`;
    h+=`<div class="irow"><span class="ikey">Dose</span><span class="ival">${p.txDose||'—'} Gy / ${p.txFractions||'—'} fractions</span></div>`;
    if(p.txStart||p.txEnd)h+=`<div class="irow"><span class="ikey">Period</span><span class="ival">${p.txStart||'—'} → ${p.txEnd||'—'}</span></div>`;
    if(p.txConcChemo)h+=`<div class="irow"><span class="ikey">Concurrent</span><span class="ival">${esc(p.txConcChemo)}</span></div>`;
    if(p.txTargeted)h+=`<div class="irow"><span class="ikey">Targeted</span><span class="ival">${esc(p.txTargeted)}</span></div>`;
    if(p.txImmuno)h+=`<div class="irow"><span class="ikey">Immuno</span><span class="ival">${esc(p.txImmuno)}</span></div>`;
    if(p.txRegimenStatus)h+=`<div class="irow"><span class="ikey">Status</span><span class="ival">${p.txRegimenStatus}</span></div>`;
    h+='</div>';
  }
  // Cycle progress
  if(p.txCycleCurrent&&p.txCycleTotal){
    const pct=Math.round(p.txCycleCurrent/p.txCycleTotal*100);
    h+=`<div class="info-card"><div class="info-card-title">📊 Treatment Progress</div><div style="font-size:12px;margin-bottom:6px">Cycle ${p.txCycleCurrent} of ${p.txCycleTotal} (${pct}%)</div><div class="meter"><div class="meter-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--green),var(--blue))"></div></div>`;
    if(p.txCTCAE&&p.txCTCAE!=='Grade 0 – None')h+=`<div style="font-size:11px;color:var(--orange);margin-top:6px">⚠ CTCAE: ${p.txCTCAE}${p.txToxicity?' — '+esc(p.txToxicity):''}</div>`;
    h+='</div>';
  }
  // Treatment history
  if(p.txEntries&&p.txEntries.length){
    h+='<div class="info-card"><div class="info-card-title">📋 Treatment Log</div>';
    p.txEntries.slice(0,10).forEach(e=>{h+=`<div class="irow"><span class="ikey">${e.date||'—'}</span><span class="ival">${esc(e.type||'')} ${e.drug?'· '+esc(e.drug):''}${e.notes?' — '+esc(e.notes):''}</span></div>`});
    h+='</div>';
  }
  // Diagnosis summary
  h+='<div class="info-card"><div class="info-card-title">📋 Diagnosis Summary</div>';
  h+=`<div class="irow"><span class="ikey">Diagnosis</span><span class="ival">${esc(p.diag||'—')}</span></div>`;
  if(p.whoGrade&&p.whoGrade!=='Not Graded')h+=`<div class="irow"><span class="ikey">WHO Grade</span><span class="ival">${p.whoGrade}</span></div>`;
  h+=`<div class="irow"><span class="ikey">Status</span><span class="ival">${p.diseaseStatus||'—'}</span></div>`;
  if(p.recist&&p.recist!=='NE – Not Evaluable')h+=`<div class="irow"><span class="ikey">RECIST</span><span class="ival">${p.recist}</span></div>`;
  h+=`<div class="irow"><span class="ikey">Phase</span><span class="ival">${p.phase||'—'}</span></div>`;
  if(p.idh1&&p.idh1!=='Pending')h+=`<div class="irow"><span class="ikey">IDH1</span><span class="ival">${p.idh1}</span></div>`;
  if(p.mgmt&&p.mgmt!=='Pending')h+=`<div class="irow"><span class="ikey">MGMT</span><span class="ival">${p.mgmt}</span></div>`;
  h+='</div>';
  // Next appointment
  const appts=(LS.get('appts_'+p.mrn)||[]).filter(a=>new Date(a.date)>=new Date()&&a.status!=='Declined').sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(appts.length){const n=appts[0];h+=`<div style="background:linear-gradient(135deg,var(--green),var(--blue));border-radius:12px;padding:16px;color:#fff;margin-bottom:12px"><div style="font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Next Appointment</div><div style="font-weight:700;font-size:15px">${new Date(n.date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div><div style="font-size:13px;opacity:.8;margin-top:2px">${n.time||''} · ${n.type||'Follow-up'}</div></div>`}
  document.getElementById('treatment-content').innerHTML=h;
}

// ═══ VISITS ═══
async function renderVisits(){
  if(!currentPat)return;
  let appts=[];
  try{const r=await api('/sync/get-appointments/'+currentPat.mrn);if(r&&r.ok&&r.appointments){appts=r.appointments;}}catch(e){}
  if(!appts.length)appts=LS.get('appts_'+currentPat.mrn)||[];
  appts=appts.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const today=new Date().toISOString().slice(0,10);
  const upcoming=appts.filter(a=>a.date>=today&&a.status!=='Declined');
  const past=appts.filter(a=>a.date<today||a.status==='Declined');
  let h='<div class="sec-head">Upcoming Visits</div>';
  if(upcoming.length)h+=upcoming.map(a=>{const sc={Confirmed:'var(--green)',Requested:'var(--orange)',Scheduled:'var(--blue)',Declined:'var(--red)'}[a.status]||'var(--text-dim)';return `<div class="info-card"><div style="display:flex;justify-content:space-between;align-items:center"><strong>${a.date} ${a.time||''}</strong><span class="badge" style="background:${sc}22;color:${sc}">${a.status}</span></div><div style="font-size:12px;color:var(--text-muted);margin-top:4px">${a.type||'Follow-up'}${a.notes?' · '+esc(a.notes):''}${a.rescheduledFrom?'<br><span style="color:var(--orange);font-size:11px">📅 Rescheduled from '+a.rescheduledFrom+'</span>':''}</div></div>`}).join('');
  else h+='<div class="empty-card">No upcoming visits.</div>';
  h+='<div class="sec-head">Past Visits</div>';
  if(past.length)h+=past.slice(0,10).map(a=>{const sc={Confirmed:'var(--green)',Requested:'var(--orange)',Scheduled:'var(--blue)',Declined:'var(--red)'}[a.status]||'var(--text-dim)';return `<div class="info-card" style="opacity:.7"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:600">${a.date} — ${a.type||'Follow-up'}</div><span class="badge" style="background:${sc}22;color:${sc};font-size:10px">${a.status}</span></div>${a.rescheduledFrom?'<div style="font-size:11px;color:var(--orange);margin-top:2px">📅 Rescheduled from '+a.rescheduledFrom+'</div>':''}</div>`}).join('');
  else h+='<div class="empty-card">No past visits.</div>';
  h+='<button class="big-btn nav-btn-style" data-action="openSheet:appt-sheet" style="margin-top:12px">+ Request New Appointment</button>';
  document.getElementById('visits-content').innerHTML=h;
}
async function submitApptRequest(){
  if(!currentPat)return;
  const date=v('appt-req-date'),time=v('appt-req-time'),type=v('appt-req-type'),notes=v('appt-req-notes');
  if(!date){AppDialog.alert('Select a date.');return}
  const appt={date,time,type,notes,status:'Requested',createdAt:Date.now()};
  const appts=LS.get('appts_'+currentPat.mrn)||[];
  appts.push(appt);
  LS.set('appts_'+currentPat.mrn,appts);
  try{await api('/sync/save-appointment',{method:'POST',body:JSON.stringify({mrn:currentPat.mrn,appointment:appt})})}catch(e){console.warn('[appt] save to store failed:',e.message)}
  closeSheet('appt-sheet');
  AppDialog.alert('Appointment request submitted! ✓');
  renderVisits();
}

// ═══ MESSAGES ═══
async function renderChat(){
  if(!currentPat)return;
  if(!_docId){
    document.getElementById('chat-msgs').innerHTML='<div class="empty-card" style="margin-top:40px">Connect to doctor software to enable messaging.</div>';
    return;
  }
  // Try shared store first, fall back to localStorage
  let msgs=[];
  try{const r=await api('/sync/get-messages/'+_docId+'/'+currentPat.mrn);if(r&&r.ok&&r.msgs)msgs=r.msgs;}catch(e){}
  if(!msgs.length)msgs=(LS.get('msgs_'+_docId+'_'+currentPat.mrn)||[]);
  msgs.sort((a,b)=>a.timestamp-b.timestamp);
  const el=document.getElementById('chat-msgs');
  if(!msgs.length){el.innerHTML='<div class="empty-card" style="margin-top:40px">No messages yet. Send one below to start a conversation with your doctor.</div>';return}
  el.innerHTML=msgs.map(m=>`<div class="msg-bubble ${m.role==='doctor'?'in':'out'}"><div>${esc(m.text)}</div><div class="msg-time">${new Date(m.timestamp).toLocaleString()}</div></div>`).join('');
  el.scrollTop=el.scrollHeight;
}
async function sendPatMsg(){
  if(!currentPat||!_docId)return;
  const text=v('chat-inp');if(!text)return;
  const key='msgs_'+_docId+'_'+currentPat.mrn;
  const msgs=LS.get(key)||[];
  msgs.push({role:'patient',text,timestamp:Date.now()});
  LS.set(key,msgs);
  // Also save to shared store
  try{await api('/sync/send-message',{method:'POST',body:JSON.stringify({mrn:currentPat.mrn,docId:_docId,role:'patient',text})})}catch(e){console.warn('[chat] save to store failed:',e.message)}
  document.getElementById('chat-inp').value='';
  renderChat();
}

// ═══ PROFILE ═══
function renderProfile(){
  if(!currentPat)return;
  const p=LS.get('pat_'+currentPat.mrn);if(!p)return;
  const am=(p.meds||[]).filter(m=>m.status==='Active');
  let h=`<div class="info-card"><div class="info-card-title">Patient Information</div>
    <div class="irow"><span class="ikey">Name</span><span class="ival">${esc(p.name)}</span></div>
    <div class="irow"><span class="ikey">MRN</span><span class="ival" style="font-family:monospace">${p.mrn}</span></div>
    <div class="irow"><span class="ikey">DOB / Age</span><span class="ival">${p.dob||'—'} / ${p.age||'—'}</span></div>
    <div class="irow"><span class="ikey">Gender</span><span class="ival">${p.gender||'—'}</span></div>
    <div class="irow"><span class="ikey">Blood</span><span class="ival">${p.blood||'—'}</span></div>
    <div class="irow"><span class="ikey">Phone</span><span class="ival">${p.phone||'—'}</span></div>
    <div class="irow"><span class="ikey">Diagnosis</span><span class="ival">${esc(p.diag||'—')}</span></div>
    <div class="irow"><span class="ikey">Phase</span><span class="ival">${p.phase||'—'}</span></div>
    <div class="irow"><span class="ikey">Disease Status</span><span class="ival">${p.diseaseStatus||'—'}</span></div>
    <div class="irow"><span class="ikey">ECOG</span><span class="ival">${p.ecog||'—'}</span></div>
  </div>`;
  if(am.length){
    h+='<div class="info-card"><div class="info-card-title">💊 Active Medications</div>';
    am.forEach(m=>{h+=`<div class="irow"><span class="ikey">💊 ${esc(m.name)}</span><span class="ival">${esc(m.dose)} · ${m.freq||''}</span></div>`});
    h+='</div>';
  }
  // Allergies
  if(p.allergies&&p.allergies.length){
    h+='<div class="info-card"><div class="info-card-title">⚠️ Allergies</div><div style="display:flex;flex-wrap:wrap;gap:4px">';
    p.allergies.forEach(a=>{const name=typeof a==='string'?a:a.name;const sev=typeof a==='string'?'':a.severity;h+=`<span style="background:rgba(239,68,68,.1);color:var(--red);padding:4px 10px;border-radius:8px;font-size:12px">${esc(name)}${sev?' ('+sev+')':''}</span>`});
    h+='</div></div>';
  }
  // Emergency contact
  if(p.emergencyName){
    h+='<div class="info-card"><div class="info-card-title">🆘 Emergency Contact</div>';
    h+=`<div class="irow"><span class="ikey">Name</span><span class="ival">${esc(p.emergencyName)}</span></div>`;
    if(p.emergencyPhone)h+=`<div class="irow"><span class="ikey">Phone</span><span class="ival">${esc(p.emergencyPhone)}</span></div>`;
    if(p.emergencyRel)h+=`<div class="irow"><span class="ikey">Relationship</span><span class="ival">${p.emergencyRel}</span></div>`;
    h+='</div>';
  }
  h+='<button class="big-btn nav-btn-style" data-action="exportMyData" style="margin-top:12px">⬇ Export My Data</button>';
  // Push notifications
  h+='<button class="big-btn" style="background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;margin-top:12px" data-action="subscribeToPush">🔔 Enable Appointment Reminders</button>';
  // Storage bar
  let total=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&(k.startsWith('ccenc_')||k.startsWith('cc_')))total+=(localStorage.getItem(k)||'').length}
  const pct=Math.min(100,Math.round(total/5242880*100));
  h+=`<div class="info-card" style="margin-top:12px"><div class="info-card-title">💾 Storage</div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px"><span>${(total/1024).toFixed(1)} KB</span><span>${pct}%</span></div><div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct>80?'var(--orange)':'var(--green)'};border-radius:3px"></div></div></div>`;
  document.getElementById('profile-content').innerHTML=h;
}
async function exportMyData(){
  if(!currentPat)return;
  const data={};
  for(const name of SecureStore.names()){
    if(!name.includes(currentPat.mrn))continue;
    const v=await SecureStore.getAsync(name);
    if(v!==null&&v!==undefined)data[name]=v;
  }
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='MyData_'+currentPat.mrn+'.json';a.click();
}

// ═══ PUSH NOTIFICATIONS (no service worker) ═══
async function subscribeToPush(){
  AppDialog.alert('Push notifications require a service worker which has been removed.');
}

// ═══ LAB PORTAL ═══
function labTab(tab){
  ['tasks','upload','info'].forEach(t=>{
    document.getElementById('lab-screen-'+t).classList.toggle('active',t===tab);
    document.getElementById('lab-nav-'+t).classList.toggle('active',t===tab);
  });
  if(tab==='tasks')refreshLabTasks();if(tab==='upload')renderLabUpload();if(tab==='info')renderLabInfo();
}
function refreshLabTasks(){
  if(!currentLab||!_docId)return;
  const tokens=(LS.get('pat_tokens_'+_docId)||[]).filter(t=>t.labId===currentLab.labId&&t.status!=='Cancelled');
  const pending=tokens.filter(t=>!t.used);
  const submitted=tokens.filter(t=>t.used);
  const uniquePats=[...new Set(pending.map(t=>t.patName))];
  let h=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
    <div class="info-card" style="text-align:center"><div style="font-size:20px">🟠</div><div style="font-weight:800;font-size:18px">${pending.length}</div><div style="font-size:10px;color:var(--text-dim)">Pending</div></div>
    <div class="info-card" style="text-align:center"><div style="font-size:20px">🟢</div><div style="font-weight:800;font-size:18px">${submitted.length}</div><div style="font-size:10px;color:var(--text-dim)">Submitted</div></div>
    <div class="info-card" style="text-align:center"><div style="font-size:20px">🔵</div><div style="font-weight:800;font-size:18px">${uniquePats.length}</div><div style="font-size:10px;color:var(--text-dim)">Patients</div></div>
  </div>`;
  h+='<div class="sec-head">📋 Assigned Test Requests</div>';
  pending.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  if(!pending.length)h+='<div class="empty-card">No pending tasks.</div>';
  else{pending.forEach(t=>{const diff=Math.ceil((new Date(t.dueDate)-new Date())/(1000*60*60*24));let urg='',bc='';if(diff<0){urg='🔴 Overdue!';bc='var(--red)'}else if(diff===0){urg='🔴 Due today';bc='var(--red)'}else if(diff===1){urg='⚠ Due tomorrow';bc='var(--orange)'}else{urg='⚠ Due in '+diff+' days';bc='var(--orange)'}const pc={STAT:'var(--red)',Urgent:'var(--orange)',Routine:'var(--green)'}[t.priority]||'var(--text-dim)';h+=`<div class="info-card" style="border-top:3px solid ${pc}"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:${bc};font-weight:600">${urg}</span><span class="badge" style="background:${pc}22;color:${pc}">${t.priority}</span></div><div style="font-weight:700;font-size:14px;margin-bottom:4px">${esc(t.desc)}</div><div style="font-size:11px;color:var(--text-muted)">Patient: ${esc(t.patName)} · Dr: ${esc(t.docName||'—')}</div></div>`})}
  // Submitted reports
  const subs=(LS.get('lab_subs_'+_docId)||[]).filter(s=>s.labId===currentLab.labId).sort((a,b)=>b.submittedAt-a.submittedAt);
  h+='<div class="sec-head" style="margin-top:16px">📤 Submitted Reports</div>';
  if(subs.length)h+=subs.slice(0,10).map(s=>`<div class="info-card"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:600">${esc(s.test)} <span class="badge" style="background:var(--green);color:#fff">✓ Sent</span></div></div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">${esc(s.mrn||'—')} · ${new Date(s.submittedAt).toLocaleDateString()}</div></div>`).join('');
  else h+='<div class="empty-card">No submitted reports yet.</div>';
  document.getElementById('lab-screen-tasks').innerHTML=h;
}
function renderLabUpload(){
  if(!currentLab||!_docId)return;
  const tokens=(LS.get('pat_tokens_'+_docId)||[]).filter(t=>t.labId===currentLab.labId&&t.status!=='Cancelled'&&!t.used);
  let h='';
  // Batch CSV upload section
  h+='<div class="info-card" style="margin-bottom:16px;border-top:3px solid var(--blue)">';
  h+='<div style="font-weight:700;font-size:14px;margin-bottom:8px">📦 Batch Upload (CSV)</div>';
  h+='<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Upload multiple lab results at once. CSV format: MRN,Test Name,Date,Results,Notes</div>';
  h+='<input type="file" id="batch-csv-input" accept=".csv" style="margin-bottom:10px;font-size:12px" data-action-change="previewBatchCSV:@this">';
  h+='<div id="batch-csv-preview" style="display:none"></div>';
  h+='<button class="big-btn log-btn" data-action="submitBatchCSV" id="batch-csv-submit" style="display:none;margin-top:8px">📤 Upload All Results</button>';
  h+='</div>';
  if(!tokens.length)h+='<div class="empty-card">No pending individual upload tasks. Tasks are assigned by the doctor app.</div>';
  else{tokens.forEach(t=>{
    h+=`<div class="info-card" style="margin-bottom:16px"><div style="font-weight:700;font-size:14px;margin-bottom:4px">📤 ${esc(t.desc)}</div><div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Patient: ${esc(t.patName)} · Due: ${t.dueDate} · ${t.priority}</div>`;
    h+=`<div class="fg"><label>Date</label><input type="date" id="ul-date-${t.taskId}" value="${new Date().toISOString().slice(0,10)}"></div>`;
    h+=`<div class="fg"><label>Test Name</label><input id="ul-test-${t.taskId}" value="${esc(t.desc)}"></div>`;
    h+=`<div class="fg"><label>Results</label><textarea id="ul-res-${t.taskId}" rows="2" placeholder="e.g. WBC: 5.2 x10^9/L (Normal)"></textarea></div>`;
    h+=`<div class="fg"><label>Notes</label><textarea id="ul-notes-${t.taskId}" rows="2" placeholder="Additional notes"></textarea></div>`;
    h+=`<button class="big-btn log-btn" data-action="submitUpload:${t.taskId},${t.mrn}">📤 Submit Report</button></div>`;
  })}
  document.getElementById('lab-screen-upload').innerHTML=h;
}
function submitUpload(taskId,mrn){
  if(!currentLab||!_docId)return;
  const date=v('ul-date-'+taskId),test=v('ul-test-'+taskId),res=v('ul-res-'+taskId),notes=v('ul-notes-'+taskId);
  if(!test){AppDialog.alert('Enter test name.');return}
  const tokens=LS.get('pat_tokens_'+_docId)||[];
  const tok=tokens.find(t=>t.taskId===taskId);if(tok)tok.used=true;
  LS.set('pat_tokens_'+_docId,tokens);
  const subs=LS.get('lab_subs_'+_docId)||[];
  subs.push({labId:currentLab.labId,labName:currentLab.name,mrn,test,date,results:res,notes,submittedAt:Date.now()});
  LS.set('lab_subs_'+_docId,subs);
  AppDialog.alert('Report submitted! ✓');
  renderLabUpload();
  refreshLabTasks();
}
function renderLabInfo(){
  if(!currentLab)return;
  document.getElementById('lab-screen-info').innerHTML=`<div class="info-card"><div class="info-card-title">Lab Profile</div>
    <div class="irow"><span class="ikey">Name</span><span class="ival">${esc(currentLab.name)}</span></div>
    <div class="irow"><span class="ikey">Username</span><span class="ival" style="font-family:monospace">${currentLab.username}</span></div>
    <div class="irow"><span class="ikey">Contact</span><span class="ival">${esc(currentLab.contact||'—')}</span></div>
    <div class="irow"><span class="ikey">Phone</span><span class="ival">${esc(currentLab.phone||'—')}</span></div>
    <div class="irow"><span class="ikey">Email</span><span class="ival">${esc(currentLab.email||'—')}</span></div>
    <div class="irow"><span class="ikey">Address</span><span class="ival">${esc(currentLab.address||'—')}</span></div>
    <div class="irow"><span class="ikey">Specialty</span><span class="ival">${esc(currentLab.specialty||'—')}</span></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// v2.1 MEDICATION REMINDERS — local alarms per active prescription
// Parses the Rx frequency into daily times; fires Notification +
// vibration + in-app toast while the app is open. Stored locally so
// times survive restarts; user sets them once per medication.
// ═══════════════════════════════════════════════════════════════
const _REMIND_KEY='veltruvia_med_reminders';
function _remindAll(){try{return JSON.parse(localStorage.getItem(_REMIND_KEY)||'{}')}catch(e){return{}}}
function _remindSave(all){try{localStorage.setItem(_REMIND_KEY,JSON.stringify(all))}catch(e){}}
function parseFreqTimes(freq){
  const f=String(freq||'').toLowerCase();
  if(/once|daily|1x|qday|od\b/.test(f))return['08:00'];
  if(/twice|bid\b|2x/.test(f))return['08:00','20:00'];
  if(/three|tid\b|3x/.test(f))return['08:00','14:00','20:00'];
  if(/four|qid\b|4x/.test(f))return['08:00','12:00','16:00','20:00'];
  if(/q(\d+)\s*h/.test(f)){const n=Number(f.match(/q(\d+)\s*h/)[1]);const out=[];for(let h=8;h<24;h+=n)out.push(String(h).padStart(2,'0')+':00');return out.length?out:['08:00'];}
  if(/every\s+morning/.test(f))return['08:00'];
  if(/every\s+night|bedtime|qhs/.test(f))return['21:00'];
  return['08:00'];
}
function setupMedReminders(){
  if(!('Notification' in window))return;
  if(Notification.permission==='default')Notification.requestPermission();
  api('/rx/my').then(r=>{
    if(!r||!r.ok||!r.prescriptions)return;
    const active=r.prescriptions.filter(p=>p.status==='active');
    const all=_remindAll();
    let added=0;
    for(const rx of active){
      if(all[rx.id])continue;
      all[rx.id]={med:rx.medication,times:parseFreqTimes(rx.frequency),enabled:true};
      added++;
    }
    // drop reminders for meds no longer active
    for(const id of Object.keys(all)){if(!active.some(p=>String(p.id)===String(id))){delete all[id];}}
    _remindSave(all);
    if(added)showToast('⏰ '+added+' medication reminder'+(added===1?'':'s')+' scheduled');
  }).catch(()=>{});
}
function checkMedReminders(){
  const all=_remindAll();
  const now=new Date();
  const cur=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const today=now.toISOString().slice(0,10);
  for(const [id,r] of Object.entries(all)){
    if(!r.enabled||!r.times||!r.times.includes(cur))continue;
    const firedKey='veltruvia_rem_'+id+'_'+today+'_'+cur;
    if(localStorage.getItem(firedKey))continue;
    try{localStorage.setItem(firedKey,'1')}catch(e){}
    try{
      if(Notification.permission==='granted')new Notification('💊 Time for '+r.med,{body:'Scheduled dose at '+cur,body_lang:'en'});
    }catch(e){}
    try{if(navigator.vibrate)navigator.vibrate([300,150,300]);}catch(e){}
    try{showToast('💊 Time for '+r.med+' ('+cur+')');}catch(e){}
  }
}
setInterval(checkMedReminders,30000);
setTimeout(setupMedReminders,4000);

// ═══════════════════════════════════════════════════════════════
// 🪑 PATIENT WAITING ROOM (v2.3) — join puts you in a queue; the
// doctor admits you and the call starts automatically.
// ═══════════════════════════════════════════════════════════════
const _origPromptJoinVideo=promptJoinVideo;
promptJoinVideo=async function(){
  try{
    const r=await api('/sync/th/my-rooms/'+(_docId||'unknown')+'/'+currentPat.mrn);
    if(r.ok&&r.rooms&&r.rooms.length){
      const room=r.rooms[0];
      if(room.status==='active'){joinVideoCall(room.id);return}
      try{await api('/sync/th/queue/join',{method:'POST',body:JSON.stringify({roomCode:room.id})})}catch(e){}
      showWaitingRoom(room.id);
      return;
    }
  }catch(e){}
  const code=await AppDialog.prompt('Enter video room code from your doctor:');
  if(code&&code.trim()){
    const rc=code.trim().toUpperCase();
    try{await api('/sync/th/queue/join',{method:'POST',body:JSON.stringify({roomCode:rc})})}catch(e){}
    showWaitingRoom(rc);
  }
};
function showWaitingRoom(roomCode){
  const existing=document.getElementById('th-waiting-overlay');if(existing)existing.remove();
  const ov=document.createElement('div');ov.id='th-waiting-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9998;display:flex;align-items:center;justify-content:center';
  ov.innerHTML=`<div style="background:var(--surface,#fff);border-radius:16px;padding:28px;max-width:340px;text-align:center">
    <div style="font-size:40px;margin-bottom:10px">🪑</div>
    <div style="font-weight:800;font-size:16px;margin-bottom:6px">You're in the waiting room</div>
    <div style="font-size:12px;color:var(--text-muted,#666);margin-bottom:14px">The doctor will bring you in shortly — keep this screen open.</div>
    <div id="th-wait-spin" style="font-size:11px;color:var(--text-dim,#999);margin-bottom:14px">waiting…</div>
    <button id="th-wait-cancel" style="padding:8px 18px;border-radius:10px;border:1px solid var(--border,#ddd);background:transparent;color:inherit;font-family:inherit;font-size:12px;cursor:pointer">Leave waiting room</button>
  </div>`;
  document.body.appendChild(ov);
  const started=Date.now();
  const poll=setInterval(async()=>{
    try{
      const r=await api('/sync/th/my-rooms/'+(_docId||'unknown')+'/'+currentPat.mrn);
      const room=((r||{}).rooms||[]).find(x=>x.id===roomCode);
      if(!room){clearInterval(poll);ov.remove();return}
      if(room.status==='active'){clearInterval(poll);ov.remove();joinVideoCall(roomCode);return}
      const mins=Math.floor((Date.now()-started)/60000);
      const sp=document.getElementById('th-wait-spin');if(sp)sp.textContent='waiting · '+mins+' min';
    }catch(e){}
  },5000);
  document.getElementById('th-wait-cancel').onclick=async()=>{
    clearInterval(poll);
    try{await api('/sync/th/queue/leave',{method:'POST',body:JSON.stringify({roomCode})})}catch(e){}
    ov.remove();
  };
}
