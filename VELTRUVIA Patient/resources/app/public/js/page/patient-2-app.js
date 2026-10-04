
// ── Global Error Boundary ──
window.onerror=function(msg,src,line,col,err){console.error("[VELTRUVIA Error]",{msg,src,line,col,err});return false;};
window.addEventListener("unhandledrejection",function(e){console.error("[VELTRUVIA Unhandled Promise]",e.reason);});
// ── 1. EMERGENCY SOS BUTTON ──
async function sendSOS(){
  if(!currentPat)return;
  if(!await AppDialog.confirm('🚨 Send EMERGENCY alert to your doctor with current vitals?',{danger:true}))return;
  const key='msgs_'+_docId+'_'+currentPat.mrn;
  const msgs=LS.get(key)||[];
  const vitals=`[EMERGENCY SOS] Patient: ${currentPat.name} (MRN: ${currentPat.mrn})\n` +
    `Timestamp: ${new Date().toLocaleString()}\n` +
    `Diagnosis: ${currentPat.diag||'—'}\n` +
    `Phase: ${currentPat.phase||'—'}`;
  msgs.push({role:'patient',text:vitals,timestamp:Date.now(),urgent:true});
  LS.set(key,msgs);
  AppDialog.alert('🚨 Emergency alert sent to your doctor!');
}
// Add SOS button to profile screen
const _origRenderProfile=window.renderProfile;
window.renderProfile=function(){
  if(_origRenderProfile)_origRenderProfile();
  const el=document.getElementById('profile-content');
  if(!el)return;
  const sosBtn=document.createElement('div');
  sosBtn.style.cssText='background:rgba(239,68,68,.08);border:2px solid rgba(239,68,68,.3);border-radius:14px;padding:16px;margin-top:12px;text-align:center;cursor:pointer;';
  sosBtn.onclick=sendSOS;
  sosBtn.innerHTML='<div style="font-size:24px;margin-bottom:4px;">🚨</div><div style="font-weight:800;font-size:14px;color:var(--red);">EMERGENCY SOS</div><div style="font-size:11px;color:var(--text-muted);">Tap to alert your doctor with vitals</div>';
  el.appendChild(sosBtn);
};

// ── 2. SYMPTOM TREND GRAPHS ──
function renderSymptomTrends(){
  if(!currentPat)return;
  const mrn=currentPat.mrn;
  const days=30;
  const now=new Date();
  const data=[];
  for(let d=days-1;d>=0;d--){
    const ds=new Date(now-d*86400000).toISOString().slice(0,10);
    const log=LS.get('log_'+mrn+'_'+ds);
    data.push({date:ds,cognitive:log?.cognitive||null,mood:log?.mood||null,headache:log?.headache||null,fatigue:log?.fatigue||null});
  }
  const hasData=data.some(d=>d.cognitive!==null);
  if(!hasData)return '';
  // SVG chart
  const W=340,H=120,PAD=20;
  const metrics=[{key:'cognitive',label:'🧠 Cognition',color:'#3b82f6'},{key:'mood',label:'😊 Mood',color:'#10b981'},{key:'headache',label:'🤕 Headache',color:'#ef4444'},{key:'fatigue',label:'😴 Fatigue',color:'#f59e0b'}];
  let svg=`<svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible;">`;
  // Grid lines
  for(let y=0;y<=10;y+=5){const py=H-PAD-(y/10)*(H-2*PAD);svg+=`<line x1="${PAD}" y1="${py}" x2="${W-PAD}" y2="${py}" stroke="rgba(255,255,255,.08)" stroke-width="0.5"/><text x="${PAD-4}" y="${py+3}" fill="#6b7280" font-size="8" text-anchor="end">${y}</text>`;}
  // Lines
  metrics.forEach(m=>{
    const points=data.filter(d=>d[m.key]!==null).map((d,i)=>{const xi=PAD+(data.indexOf(d)/(data.length-1))*(W-2*PAD);const yi=H-PAD-(d[m.key]/10)*(H-2*PAD);return xi+','+yi});
    if(points.length>1)svg+=`<polyline points="${points.join(' ')}" fill="none" stroke="${m.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`;
    // Dots
    data.filter(d=>d[m.key]!==null).forEach((d,i)=>{const xi=PAD+(data.indexOf(d)/(data.length-1))*(W-2*PAD);const yi=H-PAD-(d[m.key]/10)*(H-2*PAD);svg+=`<circle cx="${xi}" cy="${yi}" r="2.5" fill="${m.color}"/>`;});
  });
  svg+='</svg>';
  return `<div class="info-card"><div class="info-card-title">📈 Symptom Trends (30 days)</div>${svg}<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:10px;">${metrics.map(m=>`<span style="color:${m.color};">${m.label}</span>`).join('')}</div></div>`;
}
// Inject trends into symptom screen
const _origCalNav=window.calNav;
window.calNav=function(dir){if(_origCalNav)_origCalNav(dir);injectTrends();};
function injectTrends(){
  const screen=document.getElementById('screen-symptoms');
  if(!screen||!currentPat)return;
  let existing=screen.querySelector('.trends-injected');
  if(existing)existing.remove();
  const html=renderSymptomTrends();
  if(!html)return;
  const div=document.createElement('div');div.className='trends-injected';div.innerHTML=html;
  const calGrid=screen.querySelector('.cal-grid7');
  if(calGrid&&calGrid.nextSibling)calGrid.parentNode.insertBefore(div,calGrid.nextSibling.nextSibling);
  else screen.appendChild(div);
}

// ── 3. MEDICATION REMINDERS ──
function renderMedReminders(){
  if(!currentPat)return;
  const p=LS.get('pat_'+currentPat.mrn);if(!p)return;
  const am=(p.meds||[]).filter(m=>m.status==='Active');
  if(!am.length)return '';
  let html='<div class="info-card"><div class="info-card-title">💊 Medication Schedule</div>';
  const freqMap={'OD':'Once daily','BID':'Twice daily','TID':'Three times daily','Weekly':'Weekly','Monthly':'Monthly','PRN':'As needed'};
  am.forEach(m=>{
    const times=m.freq==='BID'?['8:00 AM','8:00 PM']:m.freq==='TID'?['8:00 AM','2:00 PM','8:00 PM']:m.freq==='Weekly'?['Monday']:['8:00 AM'];
    html+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="flex:1;"><div style="font-weight:600;font-size:13px;">${esc(m.name)}</div><div style="font-size:11px;color:var(--text-muted);">${esc(m.dose)} · ${m.route||''} · ${freqMap[m.freq]||m.freq}</div></div>
      <div style="font-size:10px;color:var(--blue);font-family:var(--mono);">${times.join(', ')}</div>
    </div>`;
  });
  html+='</div>';
  return html;
}
// Inject med reminders into symptom screen after trends
const _origInjectTrends=window.injectTrends;
window.injectTrends=function(){
  if(_origInjectTrends)_origInjectTrends();
  const screen=document.getElementById('screen-symptoms');
  if(!screen||!currentPat)return;
  let existing=screen.querySelector('.medrem-injected');
  if(existing)existing.remove();
  const html=renderMedReminders();
  if(!html)return;
  const div=document.createElement('div');div.className='medrem-injected';div.innerHTML=html;
  const trendsDiv=screen.querySelector('.trends-injected');
  if(trendsDiv&&trendsDiv.nextSibling)trendsDiv.parentNode.insertBefore(div,trendsDiv.nextSibling);
  else{const calGrid=screen.querySelector('.cal-grid7');if(calGrid&&calGrid.nextSibling)calGrid.parentNode.insertBefore(div,calGrid.nextSibling.nextSibling);else screen.appendChild(div);}
};

// ── 4. APPOINTMENT CALENDAR SYNC (ICS EXPORT) ──
function exportApptICS(){
  if(!currentPat)return;
  const mrn=currentPat.mrn;
  const appts=(LS.get('appts_'+mrn)||[]).filter(a=>a.date>=new Date().toISOString().slice(0,10));
  if(!appts.length){AppDialog.alert('No upcoming appointments to export.');return;}
  let ics='BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//VELTRUVIA//EN\nCALSCALE:GREGORIAN\n';
  appts.forEach(a=>{
    const dt=(a.date||'').replace(/-/g,'')+(a.time?a.time.replace(':','')+'00':'T090000');
    ics+=`BEGIN:VEVENT\nDTSTART:${dt}\nDTEND:${dt}\nSUMMARY:VELTRUVIA - ${a.type||'Follow-up'}\nDESCRIPTION:Patient: ${currentPat.name} (MRN: ${mrn})\nLOCATION:${a.notes||'Clinic'}\nEND:VEVENT\n`;
  });
  ics+='END:VCALENDAR';
  const blob=new Blob([ics],{type:'text/calendar'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='VELTRUVIA_Appointments.ics';link.click();
  URL.revokeObjectURL(url);
  AppDialog.alert('📅 Calendar file downloaded! Import into Google Calendar or Apple Calendar.');
}
// Add export button to visits screen
const _origRenderVisits=window.renderVisits;
window.renderVisits=function(){if(_origRenderVisits)_origRenderVisits();
  const screen=document.getElementById('screen-visits');
  if(!screen)return;
  let existing=screen.querySelector('.ics-export-btn');
  if(existing)return;
  const btn=document.createElement('button');btn.className='ics-export-btn big-btn nav-btn-style';btn.style.cssText='margin-top:8px;font-size:12px;';btn.textContent='📅 Export to Calendar (ICS)';btn.onclick=exportApptICS;
  const addBtn=screen.querySelector('.big-btn.nav-btn-style');
  if(addBtn)addBtn.parentNode.insertBefore(btn,addBtn.nextSibling);
};

// ── 5. MEDICATION LIST WITH REFILL REMINDERS ──
function renderMedRefillTrack(){
  if(!currentPat)return '';
  const p=LS.get('pat_'+currentPat.mrn);if(!p)return '';
  const am=(p.meds||[]).filter(m=>m.status==='Active');
  if(!am.length)return '';
  let html='<div class="info-card"><div class="info-card-title">💊 Medication Inventory</div>';
  html+='<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">Track supply and get refill reminders.</div>';
  am.forEach((m,i)=>{
    const inv=LS.get('inv_'+currentPat.mrn+'_'+i)||{supply:30,lastRefill:''};
    const daysLeft=inv.supply||0;
    const refillBy=daysLeft<=7?'var(--red)':daysLeft<=14?'var(--orange)':'var(--green)';
    html+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="flex:1;"><div style="font-weight:600;font-size:13px;">${esc(m.name)}</div><div style="font-size:11px;color:var(--text-muted);">${esc(m.dose)} · ${m.freq||''}</div></div>
      <div style="text-align:right;">
        <div style="font-size:20px;font-weight:800;color:${refillBy};">${daysLeft}</div>
        <div style="font-size:9px;color:var(--text-dim);">days left</div>
      </div>
      <button data-action="adjustSupply:${i},-1" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;color:var(--text);">−</button>
      <button data-action="adjustSupply:${i},1" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;color:var(--text);">+</button>
    </div>`;
  });
  html+='</div>';
  return html;
}
function adjustSupply(medIdx,delta){
  if(!currentPat)return;
  const key='inv_'+currentPat.mrn+'_'+medIdx;
  const inv=LS.get(key)||{supply:30};
  inv.supply=Math.max(0,(inv.supply||0)+delta);
  inv.lastRefill=new Date().toISOString();
  LS.set(key,inv);
  renderProfile();
}

// ── 6. PHOTO UPLOAD FOR SYMPTOM LOGS ──
function addPhotoToLog(){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.capture='environment';
  inp.onchange=function(){
    const file=this.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=function(){
      const photos=LS.get('photos_'+currentPat.mrn)||[];
      photos.push({data:reader.result,name:file.name,date:new Date().toISOString().slice(0,10),ts:Date.now()});
      // Keep only last 20 photos to manage localStorage
      if(photos.length>20)photos.splice(0,photos.length-20);
      LS.set('photos_'+currentPat.mrn,photos);
      AppDialog.alert('📷 Photo added to your record!');
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}
// Add photo button to log sheet
const _origOpenSheet=window.openSheet;
window.openSheet=function(id){
  if(_origOpenSheet)_origOpenSheet(id);
  if(id==='log-sheet'&&!document.getElementById('log-photo-btn')){
    const form=document.getElementById('log-form-content');
    if(!form)return;
    const btn=document.createElement('button');
    btn.id='log-photo-btn';
    btn.className='big-btn';
    btn.style.cssText='background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;margin-top:8px;';
    btn.textContent='📷 Add Photo (Wound/Side Effect)';
    btn.onclick=addPhotoToLog;
    form.appendChild(btn);
  }
};

// ── 7. BATCH CSV UPLOAD FOR LAB RESULTS ──
let _batchCSVData = [];
function previewBatchCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) { AppDialog.alert('CSV must have a header row and at least one data row.'); return; }
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('mrn') || header.includes('test') || header.includes('result');
    const startIdx = hasHeader ? 1 : 0;
    const cols = lines[0].split(',').map(c => c.trim().toLowerCase());
    // Find column indices
    const mrnIdx = cols.findIndex(c => c === 'mrn' || c === 'patient_mrn' || c === 'patient');
    const testIdx = cols.findIndex(c => c === 'test' || c === 'test_name' || c === 'name');
    const dateIdx = cols.findIndex(c => c === 'date' || c === 'test_date');
    const resIdx = cols.findIndex(c => c === 'result' || c === 'results' || c === 'value');
    const notesIdx = cols.findIndex(c => c === 'notes' || c === 'comment' || c === 'comments');
    _batchCSVData = [];
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      if (parts.length < 2) continue;
      _batchCSVData.push({
        mrn: mrnIdx >= 0 ? parts[mrnIdx] : (currentLab ? '' : ''),
        test: testIdx >= 0 ? parts[testIdx] : parts[0] || '',
        date: dateIdx >= 0 ? parts[dateIdx] : new Date().toISOString().slice(0, 10),
        results: resIdx >= 0 ? parts[resIdx] : parts[1] || '',
        notes: notesIdx >= 0 ? parts[notesIdx] : ''
      });
    }
    if (!_batchCSVData.length) { AppDialog.alert('No valid data rows found.'); return; }
    // Show preview
    const preview = document.getElementById('batch-csv-preview');
    preview.style.display = 'block';
    let html = '<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Preview (' + _batchCSVData.length + ' rows):</div>';
    html += '<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">';
    html += '<table style="width:100%;font-size:11px;"><thead><tr style="background:var(--surface2);"><th style="padding:6px;text-align:left;">MRN</th><th style="padding:6px;text-align:left;">Test</th><th style="padding:6px;text-align:left;">Date</th><th style="padding:6px;text-align:left;">Results</th><th style="padding:6px;text-align:left;"></th></tr></thead><tbody>';
    _batchCSVData.forEach((row, i) => {
      const isError = !row.test || !row.results;
      html += '<tr style="border-bottom:1px solid var(--border);' + (isError ? 'background:rgba(239,68,68,.05);' : '') + '">';
      html += '<td style="padding:4px 6px;font-family:monospace;">' + (row.mrn || '<span style="color:var(--red)">?</span>') + '</td>';
      html += '<td style="padding:4px 6px;">' + esc(row.test) + '</td>';
      html += '<td style="padding:4px 6px;">' + row.date + '</td>';
      html += '<td style="padding:4px 6px;">' + esc(row.results) + '</td>';
      html += '<td style="padding:4px 6px;"><button data-action="removeBatchRow:@numRow" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;">✕</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    preview.innerHTML = html;
    document.getElementById('batch-csv-submit').style.display = 'block';
  };
  reader.readAsText(file);
}
function removeBatchRow(idx) {
  _batchCSVData.splice(idx, 1);
  if (!_batchCSVData.length) {
    document.getElementById('batch-csv-preview').style.display = 'none';
    document.getElementById('batch-csv-submit').style.display = 'none';
    return;
  }
  // Re-render preview
  const preview = document.getElementById('batch-csv-preview');
  let html = '<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Preview (' + _batchCSVData.length + ' rows):</div>';
  html += '<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">';
  html += '<table style="width:100%;font-size:11px;"><thead><tr style="background:var(--surface2);"><th style="padding:6px;text-align:left;">MRN</th><th style="padding:6px;text-align:left;">Test</th><th style="padding:6px;text-align:left;">Date</th><th style="padding:6px;text-align:left;">Results</th><th style="padding:6px;text-align:left;"></th></tr></thead><tbody>';
  _batchCSVData.forEach((row, i) => {
    html += '<tr style="border-bottom:1px solid var(--border);">';
    html += '<td style="padding:4px 6px;font-family:monospace;">' + (row.mrn || '<span style="color:var(--red)">?</span>') + '</td>';
    html += '<td style="padding:4px 6px;">' + esc(row.test) + '</td>';
    html += '<td style="padding:4px 6px;">' + row.date + '</td>';
    html += '<td style="padding:4px 6px;">' + esc(row.results) + '</td>';
    html += '<td style="padding:4px 6px;"><button data-action="removeBatchRow:@numRow" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;">✕</button></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  preview.innerHTML = html;
}
async function submitBatchCSV() {
  if (!_batchCSVData.length) return;
  if (!currentLab || !_docId) return;
  const validRows = _batchCSVData.filter(r => r.test && r.results);
  if (!validRows.length) { AppDialog.alert('No valid rows to submit (each row needs at least a test name and results).'); return; }
  if (!await AppDialog.confirm('Upload ' + validRows.length + ' lab results?')) return;
  const subs = LS.get('lab_subs_' + _docId) || [];
  let count = 0;
  validRows.forEach(row => {
    subs.push({
      labId: currentLab.labId, labName: currentLab.name,
      mrn: row.mrn, test: row.test, date: row.date,
      results: row.results, notes: row.notes,
      submittedAt: Date.now(), batch: true
    });
    // Mark corresponding task as used if MRN matches
    const tokens = LS.get('pat_tokens_' + _docId) || [];
    const tok = tokens.find(t => t.labId === currentLab.labId && t.mrn === row.mrn && !t.used);
    if (tok) { tok.used = true; count++; }
    LS.set('pat_tokens_' + _docId, tokens);
  });
  LS.set('lab_subs_' + _docId, subs);
  _batchCSVData = [];
  document.getElementById('batch-csv-preview').style.display = 'none';
  document.getElementById('batch-csv-submit').style.display = 'none';
  document.getElementById('batch-csv-input').value = '';
  AppDialog.alert('✅ ' + validRows.length + ' lab results uploaded!' + (count ? ' (' + count + ' tasks marked complete)' : ''));
  renderLabUpload();
  refreshLabTasks();
}
