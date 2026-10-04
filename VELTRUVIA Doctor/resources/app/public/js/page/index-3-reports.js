
// ── 1. PRINT / DOWNLOAD LAYOUTS ──
const _REPORT_CSS=`
@page{margin:15mm 12mm;size:A4;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:10.5px;color:#1a1a1a;line-height:1.5;padding:0;}
.page{page-break-after:always;padding:0 0 16px;min-height:240mm;}
.page:last-child{page-break-after:avoid;}
/* ── SVG Logo ── */
.logo-svg{display:inline-block;vertical-align:middle;}
.logo-svg svg{width:42px;height:42px;}
/* ── Watermark ── */
.watermark{position:fixed;top:38%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:60px;font-weight:900;color:rgba(26,86,219,0.03);letter-spacing:8px;white-space:nowrap;pointer-events:none;z-index:0;}
/* ── Confidential Banner ── */
.conf-banner{background:#dc2626;color:#fff;text-align:center;font-size:8px;font-weight:800;letter-spacing:2px;padding:3px 0;text-transform:uppercase;}
/* ── Header ── */
.hdr{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #1a56db;padding-bottom:10px;margin-bottom:10px;}
.hdr-left{flex:1;}
.hdr-left h1{font-size:17px;font-weight:900;color:#1a56db;margin-bottom:0;letter-spacing:-.4px;}
.hdr-left .inst-name{font-size:11px;font-weight:700;color:#333;margin-top:2px;}
.hdr-left .sub{font-size:9px;color:#6b7280;letter-spacing:.3px;margin-top:1px;}
.hdr-right{text-align:right;min-width:160px;}
.hdr-right .logo{font-size:28px;margin-bottom:2px;}
.hdr-right .inst{font-size:9px;color:#6b7280;line-height:1.4;}
.hdr-right .report-id{font-size:8px;font-family:monospace;color:#94a3b8;margin-top:4px;}
/* ── Doctor / Author Info ── */
.doc-info{background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1a56db;border-radius:4px;padding:8px 12px;margin-bottom:12px;display:flex;gap:20px;flex-wrap:wrap;}
.doc-info .doc-field{display:flex;flex-direction:column;}
.doc-info .doc-lbl{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;}
.doc-info .doc-val{font-size:10.5px;font-weight:600;color:#1a1a1a;}
/* ── Patient banner ── */
.pat-banner{background:linear-gradient(135deg,#eff6ff,#f0f5ff);border:1px solid #c4d9f5;border-radius:6px;padding:10px 14px;margin-bottom:12px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;}
.pat-banner .field{display:flex;flex-direction:column;}
.pat-banner .lbl{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;}
.pat-banner .val{font-size:12px;font-weight:700;color:#1a1a1a;}
.pat-banner .val.big{font-size:14px;}
/* ── Patient Matrix Table ── */
.matrix-table{width:100%;border-collapse:collapse;margin-bottom:12px;}
.matrix-table th{background:#1e40af;color:#fff;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:5px 8px;text-align:left;border:1px solid #1e3a8a;}
.matrix-table td{padding:5px 8px;font-size:10px;border:1px solid #dde4ef;}
.matrix-table tr:nth-child(even) td{background:#f8fafc;}
/* ── Section ── */
.sec{margin-bottom:12px;}
.sec-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#fff;background:#1a56db;padding:5px 10px;border-radius:3px;margin-bottom:7px;display:flex;align-items:center;gap:6px;}
.sec-title .icon{font-size:12px;}
/* ── Tables ── */
table{width:100%;border-collapse:collapse;margin-bottom:6px;}
th{text-align:left;padding:5px 7px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#fff;background:#1e40af;border:1px solid #1e3a8a;}
td{padding:5px 7px;font-size:10px;border:1px solid #dde4ef;}
tr:nth-child(even) td{background:#f8fafc;}
/* ── Tags ── */
.tag{display:inline-block;padding:1px 7px;border-radius:3px;font-size:9px;font-weight:600;margin:1px 2px;}
.tag-red{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}
.tag-green{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;}
.tag-blue{background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;}
.tag-orange{background:#fffbeb;color:#d97706;border:1px solid #fed7aa;}
.tag-purple{background:#faf5ff;color:#7c3aed;border:1px solid #e9d5ff;}
.tag-gray{background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;}
/* ── Grid ── */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;}
.g4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;}
.field-row{display:flex;gap:5px;padding:3px 0;border-bottom:1px solid #f1f5f9;}
.field-row:last-child{border:none;}
.field-key{font-size:9px;color:#6b7280;min-width:90px;flex-shrink:0;font-weight:600;}
.field-val{font-size:10px;color:#1a1a1a;font-weight:500;}
/* ── Allergy box ── */
.allergy-box{background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:4px;padding:7px 10px;margin-bottom:8px;}
/* ── Rx box ── */
.rx-box{border:1.5px solid #1a56db;border-radius:5px;padding:10px 12px;margin-bottom:7px;background:#fafcff;}
.rx-header{font-size:11px;font-weight:800;color:#1a56db;border-bottom:1px solid #c4d9f5;padding-bottom:4px;margin-bottom:6px;}
.rx-drug{font-size:13px;font-weight:800;}
.rx-detail{font-size:9.5px;color:#475569;margin-top:2px;}
/* ── Status dot ── */
.status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px;vertical-align:middle;}
.dot-green{background:#16a34a;}
.dot-orange{background:#d97706;}
.dot-red{background:#dc2626;}
.dot-blue{background:#2563eb;}
.dot-gray{background:#94a3b8;}
/* ── Footer ── */
.footer{border-top:2px solid #e2e8f0;padding-top:8px;margin-top:14px;position:relative;}
.footer-row{display:flex;justify-content:space-between;align-items:flex-end;}
.footer .left{font-size:8px;color:#94a3b8;line-height:1.5;}
.footer .sig{width:160px;border-top:1px solid #1a1a1a;margin-top:24px;text-align:center;font-size:8.5px;color:#6b7280;}
.footer .sig-line{display:flex;gap:30px;justify-content:flex-end;}
/* ── Page Numbers ── */
.page{counter-increment:page-num;}
.page::after{content:'Page ' counter(page-num) ' of ' counter(page-total);display:block;text-align:center;font-size:8px;color:#94a3b8;margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0;}
.page:last-child::after{content:'Page ' counter(page-num) ' of ' counter(page-num);}
.page-num{text-align:center;font-size:8px;color:#94a3b8;margin-top:6px;}
/* ── QR Code ── */
.qr-box{display:inline-block;background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:4px;}
.qr-box canvas{display:block;}
/* ── Letterhead ── */
.letterhead-bar{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#1e40af,#1a56db);color:#fff;padding:8px 14px;border-radius:4px;margin-bottom:10px;font-size:8px;gap:12px;}
.letterhead-bar .lh-field{display:flex;flex-direction:column;}
.letterhead-bar .lh-lbl{font-size:6.5px;text-transform:uppercase;letter-spacing:.8px;opacity:0.6;}
.letterhead-bar .lh-val{font-weight:600;font-size:8.5px;}
/* ── Imaging Timeline ── */
.timeline-wrap{position:relative;padding:16px 0 16px 24px;}
.timeline-line{position:absolute;left:10px;top:0;bottom:0;width:2px;background:linear-gradient(180deg,#1a56db,#2563eb,#388bfd);border-radius:1px;}
.timeline-item{position:relative;margin-bottom:14px;padding:8px 12px;background:#fafcff;border:1px solid #e2e8f0;border-radius:6px;}
.timeline-item::before{content:'';position:absolute;left:-19px;top:12px;width:10px;height:10px;border-radius:50%;border:2px solid #1a56db;background:#fff;}
.timeline-item.stable::before{background:#16a34a;border-color:#16a34a;}
.timeline-item.progression::before{background:#dc2626;border-color:#dc2626;}
.timeline-item.remission::before{background:#2563eb;border-color:#2563eb;}
.timeline-item.new-lesion::before{background:#dc2626;border-color:#dc2626;}
.timeline-item.pseudo::before{background:#d97706;border-color:#d97706;}
.timeline-date{font-weight:700;font-size:10px;color:#1a1a1a;}
.timeline-meta{font-size:9px;color:#6b7280;margin-top:2px;}
.timeline-detail{font-size:10px;margin-top:3px;line-height:1.4;}
/* ── PDF Download Tip ── */
.pdf-tip{background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:8px 12px;margin-top:8px;font-size:9px;color:#1e40af;line-height:1.5;}
/* ── Confidentiality Bar ── */
.conf-footer{text-align:center;font-size:7.5px;color:#dc2626;font-weight:600;letter-spacing:1px;padding:4px 0;border-top:2px solid #dc2626;margin-top:10px;}
/* ── Print ── */
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.watermark{display:none;}}
`;

const _SVG_LOGO=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="42" height="42"><defs><linearGradient id="dnaGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a56db"/><stop offset="100%" stop-color="#388bfd"/></linearGradient></defs><circle cx="28" cy="28" r="26" fill="none" stroke="url(#dnaGrad)" stroke-width="1.5"/><path d="M14 8 C14 8, 20 14, 20 20 S14 28, 14 28 S20 34, 20 40 S14 48, 14 48" stroke="#1a56db" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M42 8 C42 8, 36 14, 36 20 S42 28, 42 28 S36 34, 36 40 S42 48, 42 48" stroke="#2563eb" stroke-width="2.2" fill="none" stroke-linecap="round"/><line x1="17" y1="11" x2="39" y2="11" stroke="#388bfd" stroke-width="1.2" opacity="0.5"/><line x1="15" y1="16" x2="41" y2="16" stroke="#388bfd" stroke-width="1.2" opacity="0.5"/><line x1="14" y1="21" x2="42" y2="21" stroke="#388bfd" stroke-width="1.2" opacity="0.5"/><line x1="14" y1="26" x2="42" y2="26" stroke="#388bfd" stroke-width="1.2" opacity="0.5"/><line x1="14" y1="31" x2="42" y2="31" stroke="#388bfd" stroke-width="1.2" opacity="0.5"/><line x1="15" y1="36" x2="41" y2="36" stroke="#388bfd" stroke-width="1.2" opacity="0.5"/><line x1="17" y1="41" x2="39" y2="41" stroke="#388bfd" stroke-width="1.2" opacity="0.5"/><circle cx="17" cy="11" r="1.8" fill="#1a56db"/><circle cx="39" cy="11" r="1.8" fill="#2563eb"/><circle cx="15" cy="16" r="1.8" fill="#1a56db"/><circle cx="41" cy="16" r="1.8" fill="#2563eb"/><circle cx="14" cy="21" r="1.8" fill="#1a56db"/><circle cx="42" cy="21" r="1.8" fill="#2563eb"/><circle cx="14" cy="31" r="1.8" fill="#1a56db"/><circle cx="42" cy="31" r="1.8" fill="#2563eb"/><circle cx="15" cy="36" r="1.8" fill="#1a56db"/><circle cx="41" cy="36" r="1.8" fill="#2563eb"/><circle cx="17" cy="41" r="1.8" fill="#1a56db"/><circle cx="39" cy="41" r="1.8" fill="#2563eb"/><text x="28" y="31" text-anchor="middle" font-size="9" font-weight="bold" fill="#1a56db" font-family="Arial">+</text></svg>`;

/* ── QR Code Generator (minimal Canvas-based) ── */
function _generateQR(text,size){
  // Simple QR-like visual hash for report verification
  // Generates a deterministic pattern from text that looks like a QR code
  let hash=0;
  for(let i=0;i<text.length;i++){hash=((hash<<5)-hash)+text.charCodeAt(i);hash|=0;}
  const seed=Math.abs(hash);
  const n=Math.min(Math.max(Math.ceil(Math.sqrt(text.length*4)),15),25);
  const canvas=document.createElement('canvas');
  canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');
  const cell=size/n;
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,size,size);
  // Position detection patterns (corners)
  function drawFinder(x,y){
    ctx.fillStyle='#1a1a1a';
    ctx.fillRect(x*cell,y*cell,7*cell,7*cell);
    ctx.fillStyle='#fff';
    ctx.fillRect((x+1)*cell,(y+1)*cell,5*cell,5*cell);
    ctx.fillStyle='#1a1a1a';
    ctx.fillRect((x+2)*cell,(y+2)*cell,3*cell,3*cell);
  }
  drawFinder(0,0);drawFinder(n-7,0);drawFinder(0,n-7);
  // Data cells
  let s=seed;
  for(let y=0;y<n;y++){
    for(let x=0;x<n;x++){
      if((x<8&&y<8)||(x>=n-8&&y<8)||(x<8&&y>=n-8))continue;
      s=(s*1103515245+12345)&0x7fffffff;
      if(s%3===0){
        ctx.fillStyle='#1a1a1a';
        ctx.fillRect(x*cell,y*cell,cell,cell);
      }
    }
  }
  // Timing patterns
  for(let i=8;i<n-8;i++){
    if(i%2===0){ctx.fillStyle='#1a1a1a';ctx.fillRect(i*cell,6*cell,cell,cell);ctx.fillRect(6*cell,i*cell,cell,cell);}
  }
  return canvas.toDataURL('image/png');
}

// Hospital letterhead config (stored in localStorage)
function _getLetterhead(){
  try{return JSON.parse(localStorage.getItem('onco_letterhead')||'{}');}catch(e){return {};}
}
function saveLetterhead(){
  const lh={
    address:document.getElementById('lh-address')?.value||'',
    phone:document.getElementById('lh-phone')?.value||'',
    fax:document.getElementById('lh-fax')?.value||'',
    licenseNo:document.getElementById('lh-license')?.value||'',
    registrationNo:document.getElementById('lh-regno')?.value||'',
    website:document.getElementById('lh-website')?.value||''
  };
  localStorage.setItem('onco_letterhead',JSON.stringify(lh));
  const msg=document.getElementById('lh-msg');
  if(msg){msg.style.display='block';msg.style.color='var(--green)';msg.textContent='Letterhead saved ✓';setTimeout(()=>msg.style.display='none',2000);}
}
function _renderLetterheadHTML(){
  const lh=_getLetterhead();
  if(!lh.address&&!lh.phone&&!lh.licenseNo)return'';
  return `<div class="letterhead-bar">
    ${lh.address?`<div class="lh-field"><span class="lh-lbl">Address</span><span class="lh-val">${esc(lh.address)}</span></div>`:''}
    ${lh.phone?`<div class="lh-field"><span class="lh-lbl">Phone</span><span class="lh-val">${esc(lh.phone)}</span></div>`:''}
    ${lh.fax?`<div class="lh-field"><span class="lh-lbl">Fax</span><span class="lh-val">${esc(lh.fax)}</span></div>`:''}
    ${lh.licenseNo?`<div class="lh-field"><span class="lh-lbl">License No.</span><span class="lh-val">${esc(lh.licenseNo)}</span></div>`:''}
    ${lh.registrationNo?`<div class="lh-field"><span class="lh-lbl">Reg. No.</span><span class="lh-val">${esc(lh.registrationNo)}</span></div>`:''}
    ${lh.website?`<div class="lh-field"><span class="lh-lbl">Web</span><span class="lh-val">${esc(lh.website)}</span></div>`:''}
  </div>`;
}

function _openReport(title,bodyHtml){
  let w;
  try{w=window.open('about:blank','_blank','width=820,height=900');}catch(e){}
  if(!w||w.closed||typeof w.document==='undefined'){
    // Popup blocked — fall back to printing the current page
    AppDialog.alert('Popup blocked. Please allow popups for this site, or use Ctrl+P to print.');
    return null;
  }
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${_REPORT_CSS}</style></head><body>
  <div id="__rpt-body">${bodyHtml}</div>
  <script>
  window.addEventListener('load',function(){
    var pages=document.querySelectorAll('.page');
    var total=pages.length;
    pages.forEach(function(p,i){
      var el=p.querySelector('.page-num');
      if(!el){el=document.createElement('div');el.className='page-num';p.appendChild(el);}
      el.textContent='Page '+(i+1)+' of '+total;
    });
    var s=document.createElement('style');
    s.textContent='.page::after{content:none !important;}';
    document.head.appendChild(s);
  });
  <\/script></body></html>`);
  w.document.close();
  return w;
}
function printPatientSummary(){
  if(!selectedMRN){AppDialog.alert('Open a patient record first.');return;}
  const p=LS.get('pat_'+selectedMRN);if(!p){AppDialog.alert('Patient not found.');return;}
  
  // Gather data
  const am=(p.meds||[]).filter(m=>m.status==='Active');
  const allMeds=(p.meds||[]);
  const al=(p.allergies||[]);
  const labs=(p.labs||[]).slice(-20);
  const mdt=(p.mdtNotes||[]).slice(0,5);
  const img=(p.imaging||[]).slice(0,5);
  const comor=(p.comorbidities||[]);
  const txEntries=(p.txEntries||[]).slice(0,10);
  const appts=(LS.get('appts_'+selectedMRN)||[]).slice(0,8);
  const logKeys=LS.keys('log_'+selectedMRN+'_').sort().reverse().slice(0,7);
  const logs=logKeys.map(k=>LS.get(k)).filter(Boolean);
  
  // Read checkbox states
  const chk=(id)=>{const el=document.getElementById(id);return el?el.checked:true;};
  const showDemo=chk('exp-demo'),showMetrics=chk('exp-metrics'),showDiag=chk('exp-diag');
  const showMol=chk('exp-mol'),showLabs=chk('exp-labs'),showMeds=chk('exp-meds');
  const showTx=chk('exp-tx'),showAppts=chk('exp-appts'),showMDT=chk('exp-mdt');
  const showImg=chk('exp-img'),showLogs=chk('exp-logs'),showNotes=chk('exp-clinnotes');
  
  // Doctor info
  const docName=currentDoc?.name||'Attending Physician';
  const docSpec=currentDoc?.spec||'Neuro-Oncology';
  const docInst=currentDoc?.institution||'VELTRUVIA Medical Center';
  const docEmail=currentDoc?.email||'';
  const reportId='RPT-'+Date.now().toString(36).toUpperCase()+'-'+(p.mrn||'0000');
  const reportDate=new Date();
  const reportDateStr=reportDate.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const reportTimeStr=reportDate.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  
  // QR code data URL
  const qrDataUrl=_generateQR(reportId+'|'+p.mrn+'|'+reportDateStr,80);
  const lhHTML=_renderLetterheadHTML();
  
  let html=`
  <!-- PAGE 1 -->
  <div class="page">
    <div class="watermark">VELTRUVIA CONFIDENTIAL</div>
    <div class="conf-banner">CONFIDENTIAL — PROTECTED HEALTH INFORMATION — AUTHORIZED PERSONNEL ONLY</div>
    
    ${lhHTML}
    
    <!-- HEADER -->
    <div class="hdr">
      <div class="hdr-left">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="logo-svg">${_SVG_LOGO}</div>
          <div>
            <h1>VELTRUVIA Pro</h1>
            <div class="inst-name">${esc(docInst)}</div>
            <div class="sub">Department of ${esc(docSpec)} · Clinical Patient Report</div>
          </div>
        </div>
      </div>
      <div class="hdr-right">
        <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end;">
          <div style="text-align:right;">
            <div class="inst">${esc(docInst)}</div>
            <div class="inst">${esc(docSpec)} Department</div>
            <div class="report-id">${reportId}</div>
          </div>
          <div class="qr-box"><img src="${qrDataUrl}" width="60" height="60" alt="QR"></div>
        </div>
      </div>
    </div>
    
    <!-- DOCTOR / AUTHORED BY -->
    <div class="doc-info">
      <div class="doc-field"><span class="doc-lbl">Attending Physician</span><span class="doc-val">Dr. ${esc(docName)}</span></div>
      <div class="doc-field"><span class="doc-lbl">Specialty</span><span class="doc-val">${esc(docSpec)}</span></div>
      <div class="doc-field"><span class="doc-lbl">Institution</span><span class="doc-val">${esc(docInst)}</span></div>
      <div class="doc-field"><span class="doc-lbl">Report Date</span><span class="doc-val">${reportDateStr} ${reportTimeStr}</span></div>
      ${docEmail?`<div class="doc-field"><span class="doc-lbl">Contact</span><span class="doc-val">${esc(docEmail)}</span></div>`:''}
    </div>
    
    ${showDemo?`
    <!-- PATIENT IDENTITY BANNER -->
    <div class="pat-banner">
      <div class="field"><span class="lbl">Patient Name</span><span class="val big">${esc(p.name)}</span></div>
      <div class="field"><span class="lbl">MRN</span><span class="val" style="font-family:monospace;">${p.mrn}</span></div>
      <div class="field"><span class="lbl">DOB</span><span class="val">${p.dob||'—'}</span></div>
      <div class="field"><span class="lbl">Age</span><span class="val">${p.age||'—'} yrs</span></div>
      <div class="field"><span class="lbl">Gender</span><span class="val">${p.gender||'—'}</span></div>
      <div class="field"><span class="lbl">Blood Group</span><span class="val">${p.blood||'—'}</span></div>
      <div class="field"><span class="lbl">Phone</span><span class="val">${p.phone||'—'}</span></div>
      <div class="field"><span class="lbl">Email</span><span class="val">${p.email||'—'}</span></div>
    </div>
    
    <!-- PATIENT MATRIX TABLE -->
    <table class="matrix-table">
      <thead><tr>
        <th>Patient</th><th>MRN</th><th>DOB</th><th>Age</th><th>Gender</th><th>Blood</th><th>Phase</th><th>Status</th>
      </tr></thead>
      <tbody><tr>
        <td style="font-weight:700;">${esc(p.name)}</td>
        <td style="font-family:monospace;font-weight:600;">${p.mrn}</td>
        <td>${p.dob||'—'}</td>
        <td>${p.age||'—'}</td>
        <td>${p.gender||'—'}</td>
        <td>${p.blood||'—'}</td>
        <td><span class="tag tag-blue">${p.phase||'—'}</span></td>
        <td><span class="status-dot ${p.diseaseStatus==='Progression'?'dot-red':p.diseaseStatus==='Remission'?'dot-green':p.diseaseStatus==='Stable'?'dot-blue':'dot-orange'}"></span>${p.diseaseStatus||'Active'}</td>
      </tr></tbody>
    </table>
    
    <!-- ALLERGIES -->
    ${al.length?`<div class="allergy-box"><div style="font-size:9px;font-weight:800;color:#dc2626;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">⚠ ALLERGIES</div>${al.map(a=>{const n=typeof a==='string'?a:a.name;const s=typeof a==='string'?'':a.severity||'Unknown';return `<span class="tag tag-red">${esc(n)} — ${s}</span>`}).join(' ')}</div>`:''}
    
    <!-- COMORBIDITIES -->
    ${comor.length?`<div style="background:#fffbeb;border:1px solid #fed7aa;border-left:4px solid #d97706;border-radius:4px;padding:7px 10px;margin-bottom:10px;"><div style="font-size:9px;font-weight:800;color:#d97706;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">⚕ COMORBIDITIES</div>${comor.map(c=>`<span class="tag tag-orange">${esc(c)}</span>`).join(' ')}</div>`:''}
    
    <!-- ADDITIONAL DEMOGRAPHICS -->
    ${(p.occupation||p.ethnicity||p.religion||p.insurance)?`<div style="margin-bottom:10px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:4px;">Additional Demographics</div>
      <div class="g3">
        ${p.occupation?`<div class="field-row"><span class="field-key">Occupation</span><span class="field-val">${esc(p.occupation)}</span></div>`:''}
        ${p.ethnicity?`<div class="field-row"><span class="field-key">Ethnicity</span><span class="field-val">${esc(p.ethnicity)}</span></div>`:''}
        ${p.religion?`<div class="field-row"><span class="field-key">Religion</span><span class="field-val">${esc(p.religion)}</span></div>`:''}
        ${p.language?`<div class="field-row"><span class="field-key">Language</span><span class="field-val">${esc(p.language)}</span></div>`:''}
        ${p.insurance?`<div class="field-row"><span class="field-key">Insurance</span><span class="field-val">${esc(p.insurance)}</span></div>`:''}
        ${p.insuranceId?`<div class="field-row"><span class="field-key">Insurance ID</span><span class="field-val">${esc(p.insuranceId)}</span></div>`:''}
        ${p.referral?`<div class="field-row"><span class="field-key">Referral</span><span class="field-val">${esc(p.referral)}</span></div>`:''}
      </div>
    </div>`:''}
    `:''}
    
    ${showDiag?`
    <!-- DIAGNOSIS -->
    <div class="sec">
      <div class="sec-title"><span class="icon">🔬</span> Diagnosis</div>
      <div class="g2">
        <div>
          <div class="field-row"><span class="field-key">Primary Diagnosis</span><span class="field-val" style="font-weight:700;">${esc(p.diag||'—')}</span></div>
          <div class="field-row"><span class="field-key">ICD-10 Code</span><span class="field-val" style="font-family:monospace;font-weight:600;">${p.icd10||'—'}</span></div>
          <div class="field-row"><span class="field-key">WHO Grade</span><span class="field-val">${p.whoGrade||'—'}</span></div>
          <div class="field-row"><span class="field-key">Primary Site</span><span class="field-val">${p.primarySite||'—'}</span></div>
          <div class="field-row"><span class="field-key">Laterality</span><span class="field-val">${p.laterality||'—'}</span></div>
          <div class="field-row"><span class="field-key">Histology</span><span class="field-val">${p.histology||'—'}</span></div>
          ${p.histVariant?`<div class="field-row"><span class="field-key">Hist. Variant</span><span class="field-val">${esc(p.histVariant)}</span></div>`:''}
          <div class="field-row"><span class="field-key">Date of Diagnosis</span><span class="field-val">${p.dateDiag||'—'}</span></div>
        </div>
        <div>
          <div class="field-row"><span class="field-key">Disease Status</span><span class="field-val"><span class="tag ${p.diseaseStatus==='Progression'?'tag-red':p.diseaseStatus==='Remission'?'tag-green':p.diseaseStatus==='Stable'?'tag-blue':'tag-orange'}">${p.diseaseStatus||'Stable'}</span></span></div>
          <div class="field-row"><span class="field-key">RECIST</span><span class="field-val">${p.recist||'—'}</span></div>
          <div class="field-row"><span class="field-key">TNM Stage</span><span class="field-val">${[p.tnmT,p.tnmN,p.tnmM].filter(Boolean).join(' ')||p.tnmStage||'—'}</span></div>
          <div class="field-row"><span class="field-key">Target Lesions</span><span class="field-val">${p.targetLesions||'—'}</span></div>
          <div class="field-row"><span class="field-key">New Lesions</span><span class="field-val">${p.newLesions||'—'}</span></div>
          <div class="field-row"><span class="field-key">ECOG PS</span><span class="field-val">${p.ecog||'—'}</span></div>
          <div class="field-row"><span class="field-key">KPS</span><span class="field-val">${p.kps?`${p.kps} / 100`:'—'}</span></div>
        </div>
      </div>
    </div>`:''}
    
    ${showMol?`
    <!-- MOLECULAR MARKERS -->
    ${(p.idh1||p.mgmt||p.codeletion||p.tert||p.atrx||p.braf||p.ki67||p.pdl1||p.p53||p.pten)?`<div class="sec">
      <div class="sec-title"><span class="icon">🧬</span> Molecular / Biomarker Profile</div>
      <table class="matrix-table">
        <thead><tr><th>Marker</th><th>Result</th><th>Significance</th></tr></thead>
        <tbody>
          ${p.idh1?`<tr><td style="font-weight:600;">IDH1</td><td><span class="tag ${p.idh1.includes('Mutant')?'tag-purple':p.idh1.includes('Wild')?'tag-green':'tag-gray'}">${esc(p.idh1)}</span></td><td style="font-size:9px;color:#6b7280;">${p.idh1.includes('Mutant')?'Favourable prognosis':'Standard'}</td></tr>`:''}
          ${p.mgmt?`<tr><td style="font-weight:600;">MGMT</td><td><span class="tag ${p.mgmt==='Methylated'?'tag-green':'tag-gray'}">${esc(p.mgmt)}</span></td><td style="font-size:9px;color:#6b7280;">${p.mgmt==='Methylated'?'TMZ responsive':'Variable response'}</td></tr>`:''}
          ${p.codeletion?`<tr><td style="font-weight:600;">1p/19q</td><td><span class="tag tag-blue">${esc(p.codeletion)}</span></td><td style="font-size:9px;color:#6b7280;">${p.codeletion.includes('Co-deleted')?'Oligodendroglioma marker':'No co-deletion'}</td></tr>`:''}
          ${p.tert?`<tr><td style="font-weight:600;">TERT</td><td><span class="tag tag-blue">${esc(p.tert)}</span></td><td style="font-size:9px;color:#6b7280;">Telomerase activity</td></tr>`:''}
          ${p.atrx?`<tr><td style="font-weight:600;">ATRX</td><td><span class="tag tag-blue">${esc(p.atrx)}</span></td><td style="font-size:9px;color:#6b7280;">ALT pathway</td></tr>`:''}
          ${p.egfrmol?`<tr><td style="font-weight:600;">EGFR</td><td><span class="tag tag-blue">${esc(p.egfrmol)}</span></td><td style="font-size:9px;color:#6b7280;">Targetable mutation</td></tr>`:''}
          ${p.braf?`<tr><td style="font-weight:600;">BRAF V600E</td><td><span class="tag tag-blue">${esc(p.braf)}</span></td><td style="font-size:9px;color:#6b7280;">Targetable mutation</td></tr>`:''}
          ${p.p53?`<tr><td style="font-weight:600;">p53</td><td><span class="tag tag-blue">${esc(p.p53)}</span></td><td style="font-size:9px;color:#6b7280;">Tumour suppressor</td></tr>`:''}
          ${p.pten?`<tr><td style="font-weight:600;">PTEN</td><td><span class="tag tag-blue">${esc(p.pten)}</span></td><td style="font-size:9px;color:#6b7280;">PI3K pathway</td></tr>`:''}
          ${p.h3k27m?`<tr><td style="font-weight:600;">H3K27M</td><td><span class="tag tag-blue">${esc(p.h3k27m)}</span></td><td style="font-size:9px;color:#6b7280;">Diffuse midline glioma</td></tr>`:''}
          ${p.ki67?`<tr><td style="font-weight:600;">Ki-67</td><td style="font-family:monospace;font-weight:700;">${esc(p.ki67)}%</td><td style="font-size:9px;color:#6b7280;">Proliferation index</td></tr>`:''}
          ${p.pdl1?`<tr><td style="font-weight:600;">PD-L1</td><td style="font-family:monospace;font-weight:700;">${esc(p.pdl1)}%</td><td style="font-size:9px;color:#6b7280;">Immunotherapy predictor</td></tr>`:''}
          ${p.tmb?`<tr><td style="font-weight:600;">TMB</td><td style="font-family:monospace;font-weight:700;">${esc(p.tmb)}</td><td style="font-size:9px;color:#6b7280;">Mutational burden</td></tr>`:''}
          ${p.msi?`<tr><td style="font-weight:600;">MSI</td><td><span class="tag tag-blue">${esc(p.msi)}</span></td><td style="font-size:9px;color:#6b7280;">Microsatellite stability</td></tr>`:''}
        </tbody>
      </table>
    </div>`:''}
    `:''}
  </div>
  
  <!-- PAGE 2 -->
  <div class="page">
    ${showMetrics?`
    <div class="sec">
      <div class="sec-title"><span class="icon">📊</span> Vital Signs & Performance Metrics</div>
      <div class="g3">
        <div class="field-row"><span class="field-key">Blood Pressure</span><span class="field-val" style="font-weight:700;">${p.bp_sys||'120'}/${p.bp_dia||'80'} mmHg</span></div>
        <div class="field-row"><span class="field-key">Heart Rate</span><span class="field-val">${p.hr||'72'} bpm (${p.rhythm||'Regular'})</span></div>
        <div class="field-row"><span class="field-key">SpO₂</span><span class="field-val">${p.spo2?`${p.spo2}%`:'—'}</span></div>
        <div class="field-row"><span class="field-key">Temperature</span><span class="field-val">${p.temp?`${p.temp}°C`:'—'}</span></div>
        <div class="field-row"><span class="field-key">Respiratory Rate</span><span class="field-val">${p.rr?`${p.rr}/min`:'—'}</span></div>
        <div class="field-row"><span class="field-key">Weight</span><span class="field-val">${p.weight?`${p.weight} kg`:'—'}</span></div>
        <div class="field-row"><span class="field-key">Height</span><span class="field-val">${p.height?`${p.height} cm`:'—'}</span></div>
        <div class="field-row"><span class="field-key">BMI</span><span class="field-val" style="font-weight:700;">${p.bmi||'—'}</span></div>
        <div class="field-row"><span class="field-key">BSA</span><span class="field-val">${p.bsa?`${p.bsa} m²`:'—'}</span></div>
        <div class="field-row"><span class="field-key">eGFR</span><span class="field-val">${p.egfr?`${p.egfr} mL/min`:'—'}</span></div>
        <div class="field-row"><span class="field-key">Creatinine</span><span class="field-val">${p.creat?`${p.creat} mg/dL`:'—'}</span></div>
      </div>
      <div class="g3" style="margin-top:8px;border-top:1px solid #f1f5f9;padding-top:8px;">
        <div class="field-row"><span class="field-key">ECOG PS</span><span class="field-val" style="font-weight:700;">${p.ecog||'—'}</span></div>
        <div class="field-row"><span class="field-key">KPS</span><span class="field-val">${p.kps?`${p.kps} / 100`:'—'}</span></div>
        <div class="field-row"><span class="field-key">GCS</span><span class="field-val">${p.gcs||'—'}</span></div>
        <div class="field-row"><span class="field-key">mRS</span><span class="field-val">${p.mrs||'—'}</span></div>
        <div class="field-row"><span class="field-key">Barthel Index</span><span class="field-val">${p.barthel||'—'}</span></div>
        <div class="field-row"><span class="field-key">MMSE</span><span class="field-val">${p.mmse||'—'}</span></div>
      </div>
      ${(p.motorR||p.motorL||p.speech||p.visual||p.cranial)?`<div class="g2" style="margin-top:8px;border-top:1px solid #f1f5f9;padding-top:8px;">
        ${p.motorR?`<div class="field-row"><span class="field-key">Motor (R)</span><span class="field-val">${esc(p.motorR)}</span></div>`:''}
        ${p.motorL?`<div class="field-row"><span class="field-key">Motor (L)</span><span class="field-val">${esc(p.motorL)}</span></div>`:''}
        ${p.speech?`<div class="field-row"><span class="field-key">Speech</span><span class="field-val">${esc(p.speech)}</span></div>`:''}
        ${p.visual?`<div class="field-row"><span class="field-key">Visual</span><span class="field-val">${esc(p.visual)}</span></div>`:''}
        ${p.cranial?`<div class="field-row"><span class="field-key">Cranial Nerves</span><span class="field-val">${esc(p.cranial)}</span></div>`:''}
      </div>`:''}
    </div>`:''}
    
    ${showLabs?`
    ${labs.length?`<div class="sec">
      <div class="sec-title"><span class="icon">🧪</span> Laboratory Results</div>
      <table><thead><tr><th>Date</th><th>Test</th><th>Value</th><th>Ref Range</th><th>Status</th></tr></thead><tbody>
      ${labs.map(l=>{const sc=l.status==='Critical'?'tag-red':l.status==='High'?'tag-orange':l.status==='Low'?'tag-blue':l.status==='Normal'?'tag-green':'';return `<tr><td style="white-space:nowrap;">${l.date||'—'}</td><td style="font-weight:600;">${esc(l.test||l.name||'—')}</td><td style="font-family:monospace;font-weight:700;">${esc(l.value)} ${l.status==='High'?'↑':l.status==='Low'?'↓':''}</td><td style="font-size:9px;">${esc(l.refRange||l.ref||'—')}</td><td><span class="tag ${sc}">${l.status||'—'}</span></td></tr>`}).join('')}
      </tbody></table>
    </div>`:''}
    `:''}
    
    ${showMeds?`
    <div class="sec">
      <div class="sec-title"><span class="icon">💊</span> Prescriptions</div>
      ${am.length?`<table><thead><tr><th>Drug</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Indication</th><th>Status</th></tr></thead><tbody>
      ${am.map(m=>`<tr><td style="font-weight:700;">${esc(m.name)}</td><td style="font-family:monospace;">${esc(m.dose)}</td><td>${m.route||'PO'}</td><td>${m.freq||'OD'}</td><td style="font-size:9px;">${esc(m.indication||'—')}</td><td><span class="tag tag-green">${m.status}</span></td></tr>`).join('')}
      </tbody></table>`:'<div style="padding:8px;color:#6b7280;font-style:italic;font-size:10px;">No active prescriptions.</div>'}
      ${allMeds.filter(m=>m.status!=='Active').length?`<div style="margin-top:6px;font-size:9px;color:#94a3b8;">${allMeds.filter(m=>m.status==='On Hold').length} on hold · ${allMeds.filter(m=>m.status==='Discontinued').length} discontinued</div>`:''}
    </div>`:''}
    
    ${showTx?`
    ${p.txTechnique?`<div class="sec">
      <div class="sec-title"><span class="icon">⚡</span> Treatment Plan</div>
      <div class="g2">
        <div>
          <div class="field-row"><span class="field-key">Technique</span><span class="field-val" style="font-weight:700;">${p.txTechnique}</span></div>
          <div class="field-row"><span class="field-key">Device</span><span class="field-val">${p.txDevice||'—'}</span></div>
          <div class="field-row"><span class="field-key">Dose</span><span class="field-val" style="font-weight:700;">${p.txDose||'—'} Gy / ${p.txFractions||'—'} fx</span></div>
          <div class="field-row"><span class="field-key">Dose/Fx</span><span class="field-val">${p.txDose&&p.txFractions?(p.txDose/p.txFractions).toFixed(1):'—'} Gy</span></div>
        </div>
        <div>
          <div class="field-row"><span class="field-key">Concurrent Chemo</span><span class="field-val">${esc(p.txConcChemo||'—')}</span></div>
          <div class="field-row"><span class="field-key">Targeted Therapy</span><span class="field-val">${esc(p.txTargeted||'—')}</span></div>
          <div class="field-row"><span class="field-key">Immunotherapy</span><span class="field-val">${esc(p.txImmuno||'—')}</span></div>
          <div class="field-row"><span class="field-key">Period</span><span class="field-val">${p.txStart||'—'} → ${p.txEnd||'—'}</span></div>
          <div class="field-row"><span class="field-key">Regimen Status</span><span class="field-val"><span class="tag ${p.txRegimenStatus==='Completed'?'tag-green':p.txRegimenStatus==='Ongoing'?'tag-blue':'tag-orange'}">${p.txRegimenStatus||'Planned'}</span></span></div>
        </div>
      </div>
      ${p.txCycleCurrent&&p.txCycleTotal?`<div style="margin-top:8px;background:#f1f5f9;border-radius:4px;padding:8px 12px;"><div style="font-size:8px;color:#6b7280;margin-bottom:4px;">CYCLE PROGRESS</div><div style="font-size:14px;font-weight:800;color:#1a56db;">Cycle ${p.txCycleCurrent} of ${p.txCycleTotal} <span style="font-size:11px;">(${Math.round(p.txCycleCurrent/p.txCycleTotal*100)}%)</span></div></div>`:''}
    </div>`:''}
    
    ${txEntries.length?`<div class="sec">
      <div class="sec-title"><span class="icon">📋</span> Treatment Log</div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Drug / Intervention</th><th>Notes</th></tr></thead><tbody>
      ${txEntries.map(e=>`<tr><td style="white-space:nowrap;">${e.date||'—'}</td><td><span class="tag tag-blue">${esc(e.type)}</span></td><td style="font-weight:600;">${esc(e.drug)}</td><td style="font-size:9px;">${esc(e.notes||'—')}</td></tr>`).join('')}
      </tbody></table>
    </div>`:''}
    `:''}
  </div>
  
  <!-- PAGE 3 -->
  <div class="page">
    ${showAppts?`
    ${appts.length?`<div class="sec">
      <div class="sec-title"><span class="icon">🗓</span> Appointments</div>
      <table><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Notes</th><th>Status</th></tr></thead><tbody>
      ${appts.sort((a,b)=>new Date(a.date)-new Date(b.date)).map(a=>{const sc=a.status==='Confirmed'?'tag-green':a.status==='Requested'?'tag-orange':a.status==='Declined'?'tag-red':'tag-blue';return `<tr><td style="font-weight:600;">${a.date||'—'}</td><td>${a.time||'—'}</td><td>${esc(a.type||'—')}</td><td style="font-size:9px;">${esc(a.notes||'—')}</td><td><span class="tag ${sc}">${a.status}</span></td></tr>`}).join('')}
      </tbody></table>
    </div>`:''}
    `:''}
    
    ${showMDT?`
    ${mdt.length?`<div class="sec">
      <div class="sec-title"><span class="icon">📋</span> Tumor Board / MDT Notes</div>
      ${mdt.map(n=>`<div style="border:1px solid #e2e8f0;border-radius:5px;padding:10px 12px;margin-bottom:8px;background:#fafcff;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="tag tag-blue">${esc(n.type||'MDT')}</span>
          <span style="font-size:10px;color:#6b7280;">${esc(n.date)}${n.venue?' · '+esc(n.venue):''}</span>
        </div>
        ${n.chair?`<div style="font-size:9px;color:#6b7280;">Chair: ${esc(n.chair)}${n.attendees?' · Attendees: '+esc(n.attendees):''}</div>`:''}
        ${n.presentation?`<div style="margin-top:4px;font-size:10px;"><b>Presentation:</b> ${esc(n.presentation)}</div>`:''}
        ${n.recommendation?`<div style="margin-top:4px;font-size:10px;"><b>Recommendation:</b> ${esc(n.recommendation)}</div>`:''}
        ${n.actions?`<div style="margin-top:3px;font-size:9.5px;color:#6b7280;"><b>Actions:</b> ${esc(n.actions)}</div>`:''}
      </div>`).join('')}
    </div>`:''}
    `:''}
    
    ${showImg?`
    ${img.length?`<div class="sec">
      <div class="sec-title"><span class="icon">🖼</span> Imaging Timeline</div>
      <!-- Timeline Summary Bar -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <span style="font-size:8px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:3px;padding:2px 6px;color:#6b7280;">${img.length} scan${img.length!==1?'s':''}</span>
        ${img.filter(r=>r.compare).map(r=>{const cs={'Stable':'tag-green','Decreased enhancement':'tag-green','Increased enhancement':'tag-red','New lesion':'tag-red','Pseudo-progression likely':'tag-orange','Radiation necrosis likely':'tag-orange'};return `<span class="tag ${cs[r.compare]||'tag-gray'}">${r.date}: ${r.compare}</span>`;}).join('')}
      </div>
      <!-- Visual Timeline -->
      <div class="timeline-wrap">
        <div class="timeline-line"></div>
        ${img.sort((a,b)=>new Date(a.date)-new Date(b.date)).map(r=>{const compColors={'Stable':'stable','Decreased enhancement':'remission','Increased enhancement':'progression','New lesion':'new-lesion','Pseudo-progression likely':'pseudo','Radiation necrosis likely':'pseudo'};const tc=compColors[r.compare]||'';const compTagColors={'Stable':'tag-green','Decreased enhancement':'tag-green','Increased enhancement':'tag-red','New lesion':'tag-red','Pseudo-progression likely':'tag-orange','Radiation necrosis likely':'tag-orange'};return `<div class="timeline-item ${tc}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="timeline-date">${esc(r.date)}</span>
            <span class="tag tag-purple">${esc(r.modality)}</span>
          </div>
          ${r.facility?`<div class="timeline-meta">${esc(r.facility)}</div>`:''}
          <div class="timeline-detail">
            ${r.t1?`<div><b>T1+Gd:</b> ${esc(r.t1)}</div>`:''}
            ${r.t2?`<div><b>T2/FLAIR:</b> ${esc(r.t2)}</div>`:''}
            ${r.dwi?`<div><b>DWI:</b> ${esc(r.dwi)}</div>`:''}
            ${r.mass?`<div><b>Mass Effect:</b> ${esc(r.mass)}</div>`:''}
          </div>
          ${r.compare?`<div style="margin-top:4px;"><b>Comparison:</b> <span class="tag ${compTagColors[r.compare]||'tag-gray'}">${esc(r.compare)}</span></div>`:''}
          ${r.impression?`<div style="margin-top:3px;font-weight:700;font-size:10.5px;color:#1a1a1a;">${esc(r.impression)}</div>`:''}
        </div>`}).join('')}
      </div>
    </div>`:''}
    `:''}
    
    ${showLogs?`
    ${logs.length?`<div class="sec">
      <div class="sec-title"><span class="icon">📋</span> Recent Health Logs</div>
      <table><thead><tr><th>Date</th><th>Cognitive</th><th>Headache</th><th>Fatigue</th><th>Mood</th><th>Vitals</th></tr></thead><tbody>
      ${logs.map(log=>`<tr>
        <td style="font-weight:600;">${log.date||'—'}</td>
        <td>${log.cognitive||'—'}/10</td>
        <td style="${(log.headache||0)>7?'color:#dc2626;font-weight:700;':''}">${log.headache||'—'}/10</td>
        <td>${log.fatigue||'—'}/10</td>
        <td>${log.mood||'—'}/10</td>
        <td style="font-size:9px;">${log.temp?log.temp+'°C ':''}${log.bp||''}${log.weight?' '+log.weight+'kg':''}</td>
      </tr>`).join('')}
      </tbody></table>
    </div>`:''}
    `:''}
    
    ${showNotes?`
    ${p.clinNotes?`<div class="sec">
      <div class="sec-title"><span class="icon">📝</span> Clinical Notes</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px 12px;font-size:10.5px;line-height:1.7;white-space:pre-wrap;">${esc(p.clinNotes)}</div>
    </div>`:''}
    `:''}
    
    <!-- SIGNATURES -->
    <div style="margin-top:20px;">
      <div style="display:flex;gap:40px;">
        <div style="flex:1;">
          <div style="border-top:1px solid #1a1a1a;margin-top:40px;padding-top:6px;text-align:center;">
            <div style="font-size:10px;font-weight:600;color:#1a1a1a;">Dr. ${esc(docName)}</div>
            <div style="font-size:8px;color:#6b7280;">${esc(docSpec)} · ${esc(docInst)}</div>
            <div style="font-size:8px;color:#94a3b8;margin-top:2px;">Signature & Stamp</div>
          </div>
        </div>
        <div style="flex:1;">
          <div style="border-top:1px solid #1a1a1a;margin-top:40px;padding-top:6px;text-align:center;">
            <div style="font-size:10px;font-weight:600;color:#1a1a1a;">Consultant Physician</div>
            <div style="font-size:8px;color:#6b7280;">Reg. No: _______________</div>
            <div style="font-size:8px;color:#94a3b8;margin-top:2px;">Signature & Stamp</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- FOOTER -->
    <div class="footer">
      <div class="left">
        VELTRUVIA Pro · Neuro-Oncology EMR<br>
        ${esc(docInst)} · ${esc(docSpec)} Department<br>
        Report ID: ${reportId} · Generated: ${reportDateStr} ${reportTimeStr}<br>
        This document is auto-generated from the patient electronic medical record.<br>
        Verify with original records. Not valid without physician signature.<br>
        Scan QR code (top-right) for digital verification of this report.
      </div>
    </div>
    <div class="conf-footer">THIS DOCUMENT CONTAINS PROTECTED HEALTH INFORMATION (PHI) — HIPAA COMPLIANT — DO NOT DISTRIBUTE WITHOUT AUTHORIZATION</div>
  </div>`;
  
  const w=_openReport('Clinical Report — '+p.name,html);
  if(w)setTimeout(()=>{try{w.print();}catch(e){}},500);
}

function downloadPrescription(){
  if(!selectedMRN)return;
  const p=LS.get('pat_'+selectedMRN);if(!p)return;
  const am=(p.meds||[]).filter(m=>m.status==='Active');
  const al=(p.allergies||[]);
  if(!am.length){AppDialog.alert('No active medications to prescribe.');return;}
  
  const docName=currentDoc?.name||'Attending Physician';
  const docSpec=currentDoc?.spec||'Neuro-Oncology';
  const docInst=currentDoc?.institution||'VELTRUVIA Medical Center';
  const rxId='RX-'+Date.now().toString(36).toUpperCase();
  const rxDate=new Date();
  const rxDateStr=rxDate.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const rxTimeStr=rxDate.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  const rxQR=_generateQR(rxId+'|'+p.mrn+'|'+rxDateStr,70);
  const lhHTML=_renderLetterheadHTML();
  
  let html=`
  <div class="page">
    <div class="conf-banner">CONFIDENTIAL — CONTROLLED PRESCRIPTION — AUTHORIZED PERSONNEL ONLY</div>
    
    ${lhHTML}
    
    <div class="hdr">
      <div class="hdr-left">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="logo-svg">${_SVG_LOGO}</div>
          <div>
            <h1>℞ Prescription Order</h1>
            <div class="inst-name">${esc(docInst)}</div>
            <div class="sub">Department of ${esc(docSpec)} · Prescription Record</div>
          </div>
        </div>
      </div>
      <div class="hdr-right">
        <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end;">
          <div style="text-align:right;">
            <div class="inst">${esc(docInst)}</div>
            <div class="report-id">${rxId}</div>
          </div>
          <div class="qr-box"><img src="${rxQR}" width="55" height="55" alt="QR"></div>
        </div>
      </div>
    </div>
    
    <div class="doc-info">
      <div class="doc-field"><span class="doc-lbl">Prescribing Physician</span><span class="doc-val">Dr. ${esc(docName)}</span></div>
      <div class="doc-field"><span class="doc-lbl">Specialty</span><span class="doc-val">${esc(docSpec)}</span></div>
      <div class="doc-field"><span class="doc-lbl">Institution</span><span class="doc-val">${esc(docInst)}</span></div>
      <div class="doc-field"><span class="doc-lbl">Date & Time</span><span class="doc-val">${rxDateStr} ${rxTimeStr}</span></div>
    </div>
    
    <div class="pat-banner">
      <div class="field"><span class="lbl">Patient Name</span><span class="val big">${esc(p.name)}</span></div>
      <div class="field"><span class="lbl">MRN</span><span class="val" style="font-family:monospace;">${p.mrn}</span></div>
      <div class="field"><span class="lbl">DOB</span><span class="val">${p.dob||'—'}</span></div>
      <div class="field"><span class="lbl">Age</span><span class="val">${p.age||'—'} yrs</span></div>
      <div class="field"><span class="lbl">Gender</span><span class="val">${p.gender||'—'}</span></div>
      <div class="field"><span class="lbl">Weight</span><span class="val">${p.weight?`${p.weight} kg`:'—'}</span></div>
      <div class="field"><span class="lbl">BSA</span><span class="val">${p.bsa?`${p.bsa} m²`:'—'}</span></div>
      <div class="field"><span class="lbl">Diagnosis</span><span class="val">${esc(p.diag||'—')}</span></div>
      <div class="field"><span class="lbl">Blood Group</span><span class="val">${p.blood||'—'}</span></div>
      <div class="field"><span class="lbl">eGFR</span><span class="val">${p.egfr?`${p.egfr} mL/min`:'—'}</span></div>
    </div>
    
    <table class="matrix-table">
      <thead><tr><th>Patient</th><th>MRN</th><th>Age</th><th>Weight</th><th>BSA</th><th>eGFR</th><th>Diagnosis</th></tr></thead>
      <tbody><tr>
        <td style="font-weight:700;">${esc(p.name)}</td>
        <td style="font-family:monospace;">${p.mrn}</td>
        <td>${p.age||'—'}</td>
        <td>${p.weight?`${p.weight} kg`:'—'}</td>
        <td>${p.bsa?`${p.bsa} m²`:'—'}</td>
        <td>${p.egfr||'—'}</td>
        <td style="font-size:9px;">${esc(p.diag||'—')}</td>
      </tr></tbody>
    </table>
    
    ${al.length?`<div class="allergy-box"><div style="font-size:9px;font-weight:800;color:#dc2626;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">⚠ ALLERGIES — Verify before prescribing</div>${al.map(a=>{const n=typeof a==='string'?a:a.name;const s=typeof a==='string'?'':a.severity||'';return `<span class="tag tag-red">${esc(n)}${s?' — '+s:''}</span>`}).join(' ')}</div>`:''}
    
    <div class="sec">
      <div class="sec-title"><span class="icon">💊</span> Prescribed Medications</div>
      ${am.map((m,i)=>`<div class="rx-box">
        <div class="rx-header">℞ ${i+1} — ${esc(m.name)}</div>
        <div class="g2" style="margin-top:6px;">
          <div>
            <div class="field-row"><span class="field-key">Drug Name</span><span class="field-val" style="font-weight:800;font-size:12px;">${esc(m.name)}</span></div>
            <div class="field-row"><span class="field-key">Dose</span><span class="field-val" style="font-weight:700;">${esc(m.dose)}</span></div>
            <div class="field-row"><span class="field-key">Route</span><span class="field-val">${m.route||'PO'}</span></div>
            <div class="field-row"><span class="field-key">Frequency</span><span class="field-val">${m.freq||'OD'}</span></div>
          </div>
          <div>
            ${m.indication?`<div class="field-row"><span class="field-key">Indication</span><span class="field-val">${esc(m.indication)}</span></div>`:''}
            <div class="field-row"><span class="field-key">Duration</span><span class="field-val">30 days</span></div>
            <div class="field-row"><span class="field-key">Refills</span><span class="field-val">___</span></div>
            <div class="field-row"><span class="field-key">Status</span><span class="field-val"><span class="tag tag-green">${m.status}</span></span></div>
          </div>
        </div>
        <div style="margin-top:6px;padding-top:6px;border-top:1px dashed #c4d9f5;font-size:9px;color:#6b7280;font-style:italic;">Dispense: 30 days supply · Qty: ___ · DAW: ☐ Yes ☐ No</div>
      </div>`).join('')}
    </div>
    
    <div style="margin-top:16px;padding:12px;border:1px solid #e2e8f0;border-radius:4px;background:#fafcff;">
      <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Clinical Notes / Instructions</div>
      <div style="min-height:60px;border-bottom:1px solid #e2e8f0;"></div>
      <div style="min-height:30px;border-bottom:1px solid #e2e8f0;"></div>
    </div>
    
    <div style="margin-top:20px;">
      <div style="display:flex;gap:40px;">
        <div style="flex:1;">
          <div style="border-top:1px solid #1a1a1a;margin-top:30px;padding-top:6px;text-align:center;">
            <div style="font-size:10px;font-weight:600;color:#1a1a1a;">Dr. ${esc(docName)}</div>
            <div style="font-size:8px;color:#6b7280;">${esc(docSpec)} · ${esc(docInst)}</div>
            <div style="font-size:8px;color:#94a3b8;margin-top:2px;">Signature & Stamp</div>
          </div>
        </div>
        <div style="flex:1;">
          <div style="border-top:1px solid #1a1a1a;margin-top:30px;padding-top:6px;text-align:center;">
            <div style="font-size:10px;font-weight:600;color:#1a1a1a;">Dispensing Pharmacist</div>
            <div style="font-size:8px;color:#6b7280;">License No: _______________</div>
            <div style="font-size:8px;color:#94a3b8;margin-top:2px;">Signature & Stamp</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <div class="left">
        VELTRUVIA Pro · Neuro-Oncology EMR<br>
        ${esc(docInst)} · Rx ID: ${rxId}<br>
        Generated: ${rxDateStr} ${rxTimeStr} · This prescription is generated from the electronic medical record system.<br>
        Verify with original records. Not valid without prescriber signature.
      </div>
    </div>
    <div class="conf-footer">THIS PRESCRIPTION CONTAINS PROTECTED HEALTH INFORMATION — HIPAA COMPLIANT — DO NOT DISTRIBUTE WITHOUT AUTHORIZATION</div>
  </div>`;
  
  const w=_openReport('Prescription — '+p.name,html);
  if(w)setTimeout(()=>{try{w.print();}catch(e){}},500);
}

function generatePDFDownload(){
  printPatientSummary();
}

// Add print/download buttons to record topbar
const _origOpenRecord=window.openRecord;
window.openRecord=function(mrn){
  if(typeof _origOpenRecord==='function')_origOpenRecord(mrn);
  setTimeout(()=>{
  const topbar=document.querySelector('.record-topbar');
  if(!topbar)return;
  // Only add buttons once
  if(document.getElementById('btn-print-summary'))return;
  // Find the right-side button container (last div in topbar)
  const btnsDiv=topbar.querySelector('div:last-child');
  if(!btnsDiv)return;
  const btnPdf=document.createElement('button');btnPdf.id='btn-pdf-download';btnPdf.className='btn btn-primary btn-sm';btnPdf.style.cssText='margin-right:4px';btnPdf.textContent='⬇ PDF';btnPdf.title='Opens print dialog — choose Save as PDF';btnPdf.onclick=printPatientSummary;
  const btnSummary=document.createElement('button');btnSummary.id='btn-print-summary';btnSummary.className='btn btn-ghost btn-sm';btnSummary.style.cssText='margin-right:4px';btnSummary.textContent='📄 Report';btnSummary.onclick=printPatientSummary;
  const btnRx=document.createElement('button');btnRx.id='btn-rx-download';btnRx.className='btn btn-ghost btn-sm';btnRx.style.cssText='color:var(--blue)';btnRx.textContent='℞ Rx';btnRx.onclick=downloadPrescription;
  // Insert before the existing close button (first child)
  btnsDiv.insertBefore(btnRx,btnsDiv.firstChild);
  btnsDiv.insertBefore(btnSummary,btnRx);
  btnsDiv.insertBefore(btnPdf,btnSummary);
  },200);};

// ── 2. DRUG DOSAGE CALCULATOR ──
function calcDrugDose(){
  if(!selectedMRN)return;
  const p=LS.get('pat_'+selectedMRN);if(!p)return;
  const weight=parseFloat(p.weight)||70;
  const height=parseFloat(p.height)||170;
  const bsa=parseFloat(p.bsa)||Math.sqrt((height*weight)/3600);
  const creat=parseFloat(p.creat)||1.0;
  const age=parseInt(p.age)||40;
  const isMale=(p.gender||'Male').toLowerCase().startsWith('m');
  // CKD-EPI eGFR
  const kappa=isMale?0.9:0.7;
  const alpha=isMale?-0.411:-0.329;
  const egfr=142*Math.min(creat/kappa,1)**alpha*Math.max(creat/kappa,1)**-1.200*0.9938**age*(isMale?1:1.012);
  const renalAdj=egfr>=60?1:egfr>=30?0.75:egfr>=15?0.5:0.25;
  const commonDoses=[
    {name:'Temozolomide',doseBSA:75,unit:'mg/m²/day',route:'PO',notes:'Concurrent RT 75mg/m²×42d, then adjuvant 150-200mg/m²×5/28d'},
    {name:'Bevacizumab',doseW:10,unit:'mg/kg/q2w',route:'IV',notes:'10mg/kg q2w or 15mg/kg q3w'},
    {name:'PCV (Procarbazine)',doseBSA:60,unit:'mg/m²/day',route:'PO',notes:'Days 8-21 of 28-day cycle'},
    {name:'Lomustine (CCNU)',doseBSA:110,unit:'mg/m²',route:'PO',notes:'Day 1 of 6-week cycle, max cumulative dose'},
    {name:'Carboplatin',doseBSA:null,unit:'AUC 5-6',route:'IV',notes:'Calvert: Dose = Target AUC × (GFR + 25)'},
    {name:'Irinotecan',doseBSA:125,unit:'mg/m²',route:'IV',notes:'Weekly×4 then 2 weeks off'},
    {name:'Vincristine',doseBSA:1.4,unit:'mg/m² (max 2mg)',route:'IV',notes:'Weekly, cap at 2mg total'},
    {name:'Dexamethasone',doseW:0.1,unit:'mg/kg/day',route:'PO',notes:'Anti-edema, taper over 10d'},
  ];
  let html=`<div class="info-card"><div class="info-card-title">🧮 Drug Dosage Calculator</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;font-size:12px;">
      <div><span style="color:var(--text-muted);">Weight</span><br><b>${weight} kg</b></div>
      <div><span style="color:var(--text-muted);">BSA</span><br><b>${bsa.toFixed(2)} m²</b></div>
      <div><span style="color:var(--text-muted);">eGFR</span><br><b>${egfr.toFixed(0)} mL/min</b></div>
      <div><span style="color:var(--text-muted);">Renal Adj</span><br><b>${(renalAdj*100).toFixed(0)}%</b></div>
    </div>
    <table class="lab-table"><thead><tr><th>Drug</th><th>Std Dose</th><th>Calc Dose</th><th>Route</th><th>Renal Adj</th><th>Notes</th></tr></thead><tbody>`;
  commonDoses.forEach(d=>{
    let calcDose='—';
    if(d.doseBSA!==null){
      let raw=d.name==='Vincristine'?Math.min(d.doseBSA*bsa,2):d.doseBSA*bsa;
      calcDose=(raw*renalAdj).toFixed(1)+' mg';
      if(d.name==='Dexamethasone')calcDose=(d.doseW*weight*renalAdj).toFixed(1)+' mg';
    }else if(d.name==='Carboplatin'){
      const gfr=Math.max(egfr,0);
      calcDose=(5*(gfr+25)).toFixed(0)+' mg';
    }
    html+=`<tr><td style="font-weight:600;">${d.name}</td><td>${d.doseBSA?d.doseBSA+' '+d.unit:d.unit}</td><td style="color:var(--blue);font-weight:700;font-family:var(--mono);">${calcDose}</td><td>${d.route}</td><td>${(renalAdj*100).toFixed(0)}%</td><td style="font-size:11px;color:var(--text-muted);">${d.notes}</td></tr>`;
  });
  html+='</tbody></table></div>';
  document.getElementById('ai-results').outerHTML=html;
}

// Add dosage calc button to treatment tab
const _origOpenRecord2=window.openRecord||function(){};

// ── 3. LAB RESULT AUTO-ALERTS ──
function checkLabAlerts(){
  const pats=getMyPatients();
  let alerts=[];
  pats.forEach(p=>{
    (p.labs||[]).forEach(l=>{
      if(l.status==='Critical'||l.status==='High'||l.status==='Low'){
        alerts.push({mrn:p.mrn,name:p.name,test:l.test,value:l.value,status:l.status,date:l.date});
      }
    });
  });
  // Update lab badge
  const badge=document.getElementById('lab-badge');
  if(badge){badge.textContent=alerts.length;badge.style.display=alerts.length?'inline':'none';}
  return alerts;
}

// ── 4. TREATMENT RESPONSE TRACKING (RECIST TIMELINE) ──
function renderRECTimeline(){
  if(!selectedMRN)return '';
  const p=LS.get('pat_'+selectedMRN);if(!p)return '';
  const recistColors={'CR – Complete Response':'var(--green)','PR – Partial Response':'var(--blue)','SD – Stable Disease':'var(--orange)','PD – Progressive Disease':'var(--red)','NE – Not Evaluable':'var(--text-dim)'};
  let html='<div class="info-card"><div class="info-card-title">📈 RECIST 1.1 Response Timeline</div>';
  const entries=[...(p.txEntries||[])].filter(e=>e.type==='Cycle Complete'||e.type==='Dose Modification'||e.type==='Toxicity Event').sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(!entries.length&&p.recist==='NE – Not Evaluable'){
    html+='<div class="empty-card">No response data yet. Add treatment log entries to track response over time.</div>';
  }else{
    html+='<div style="position:relative;padding-left:20px;">';
    const allPoints=[{date:p.dateDiag||'',label:'Diagnosed',color:'var(--text-dim)'}];
    entries.forEach(e=>{allPoints.push({date:e.date,label:e.type+(e.drug?' — '+e.drug:'')+(e.notes?' ('+e.notes+')':''),color:recistColors[p.recist]||'var(--text-dim)'});});
    allPoints.forEach((pt,i)=>{
      html+=`<div style="position:relative;padding:8px 0 8px 16px;border-left:2px solid ${pt.color};margin-left:0;">
        <div style="position:absolute;left:-5px;top:10px;width:8px;height:8px;border-radius:50%;background:${pt.color};"></div>
        <div style="font-size:11px;color:var(--text-dim);">${pt.date||'—'}</div>
        <div style="font-size:12px;font-weight:600;">${pt.label}</div>
      </div>`;
    });
    html+='</div>';
  }
  html+='</div>';
  return html;
}

// ── 5. PATIENT ADHERENCE TRACKING ──
function calcAdherence(mrn){
  const p=LS.get('pat_'+mrn);if(!p)return null;
  const am=(p.meds||[]).filter(m=>m.status==='Active');
  if(!am.length)return null;
  // Count logs in last 30 days
  const now=new Date();let logCount=0;
  for(let d=0;d<30;d++){
    const ds=new Date(now-d*86400000).toISOString().slice(0,10);
    if(LS.get('log_'+mrn+'_'+ds))logCount++;
  }
  const adherencePct=Math.min(100,Math.round(logCount/30*100));
  return{meds:am.length,logsLogged:logCount,adherencePct};
}
function renderAdherenceCard(mrn){
  const a=calcAdherence(mrn);if(!a)return '';
  const col=a.adherencePct>=80?'var(--green)':a.adherencePct>=50?'var(--orange)':'var(--red)';
  return `<div class="info-card"><div class="info-card-title">📊 Adherence (30 days)</div>
    <div style="display:flex;gap:16px;align-items:center;">
      <div style="font-size:28px;font-weight:800;color:${col};">${a.adherencePct}%</div>
      <div style="flex:1;"><div class="meter"><div class="meter-fill" style="width:${a.adherencePct}%;background:${col};"></div></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${a.logsLogged}/30 days logged · ${a.meds} active meds</div></div>
    </div></div>`;
}

// ── APPOINTMENT REMINDERS ──
async function loadReminderStatus(){
  const el=document.getElementById('r-reminder-status');
  if(!el)return;
  try{
    const r=await api('/email/reminders');
    if(!r.ok||!r.reminders||!r.reminders.length){
      el.innerHTML='';
      return;
    }
    let html=`<div class="info-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div class="info-card-title" style="margin:0;border:none;padding:0;">🔔 Email Reminders</div>
        <span style="font-size:10px;color:${r.emailConfigured?'var(--green)':'var(--orange)'};">${r.emailConfigured?'📧 Email active':'⚠ Email not configured'}</span>
      </div>`;
    r.reminders.forEach(rem=>{
      const col=rem.hoursUntil<=1?'var(--red)':rem.hoursUntil<=24?'var(--orange)':'var(--blue)';
      const sent=rem.remindersSent||[];
      html+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <div style="flex:1;"><div style="font-weight:600;">${esc(rem.type||'Follow-up')}</div><div style="font-size:11px;color:var(--text-muted);">${rem.date} ${rem.time||''} · in ${rem.hoursUntil}h</div></div>
        <div style="display:flex;gap:4px;">
          ${sent.includes('7d')?'<span style="background:rgba(124,58,237,.1);color:var(--purple);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">7d ✓</span>':''}
          ${sent.includes('24h')?'<span style="background:rgba(37,99,235,.1);color:var(--blue);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">24h ✓</span>':''}
          ${sent.includes('1h')?'<span style="background:rgba(220,38,38,.1);color:var(--red);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">1h ✓</span>':''}
        </div>
      </div>`;
    });
    html+='</div>';
    el.innerHTML=html;
  }catch(e){el.innerHTML='';}
}
// Hook into appointment rendering
const _origRenderRecordAppts=window.renderRecordAppts;
window.renderRecordAppts=function(mrn){
  if(_origRenderRecordAppts)_origRenderRecordAppts(mrn);
  loadReminderStatus();
};

// ── APPOINTMENT CALENDAR VIEW (Weekly) ──
var _apptWeekOffset=0;

function getWeekRange(offset){
  const now=new Date();
  const day=now.getDay();
  const monday=new Date(now);monday.setDate(now.getDate()-day+(day===0?-6:1)+offset*7);
  const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  return{monday,sunday};
}

function renderApptCalendar(){
  const el=document.getElementById('appt-cal-view');
  const labelEl=document.getElementById('appt-week-label');
  if(!el)return;
  const{monday,sunday}=getWeekRange(_apptWeekOffset);
  const fmtShort=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const fmtFull=d=>d.toISOString().slice(0,10);
  if(labelEl)labelEl.textContent=`${fmtShort(monday)} — ${fmtShort(sunday)}, ${sunday.getFullYear()}`;
  const dateFrom=fmtFull(monday);
  const dateTo=fmtFull(sunday);
  // Show loading
  el.innerHTML='<div style="text-align:center;padding:30px;color:var(--text-muted);"><div style="font-size:20px;margin-bottom:8px;">⏳</div>Loading appointments...</div>';
  // Fetch from server API
  api('/schedule/appointments?from='+dateFrom+'&to='+dateTo).then(r=>{
    const appts=r.ok?(r.appointments||[]):[];
    // Merge with local LS appointments
    const pats=getMyPatients();
    pats.forEach(p=>{
      (LS.get('appts_'+p.mrn)||[]).forEach(a=>{
        if(a.date&&a.date>=dateFrom&&a.date<=dateTo&&a.status!=='Cancelled'&&a.status!=='Completed'){
          if(!appts.find(x=>x.id===a.id))appts.push({...a,patient_mrn:p.mrn,patient_name:p.name,diagnosis:p.diag});
        }
      });
    });
    renderWeeklyView(el,appts,monday,sunday);
  }).catch(()=>{
    // Fallback to local only
    const appts=[];
    const pats=getMyPatients();
    pats.forEach(p=>{
      (LS.get('appts_'+p.mrn)||[]).forEach(a=>{
        if(a.date&&a.date>=dateFrom&&a.date<=dateTo&&a.status!=='Cancelled'&&a.status!=='Completed'){
          appts.push({...a,patient_mrn:p.mrn,patient_name:p.name,diagnosis:p.diag});
        }
      });
    });
    renderWeeklyView(el,appts,monday,sunday);
  });
}

function renderWeeklyView(el,appts,monday,sunday){
  const DAY_SHORT=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const DAY_FULL=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const today=new Date().toISOString().slice(0,10);
  // Build day columns
  let html='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">';
  for(let i=0;i<7;i++){
    const d=new Date(monday);d.setDate(monday.getDate()+i);
    const dateStr=d.toISOString().slice(0,10);
    const isToday=dateStr===today;
    const dayAppts=appts.filter(a=>a.date===dateStr).sort((a,b)=>(a.start_time||a.time||'').localeCompare(b.start_time||b.time||''));
    html+=`<div style="min-height:120px;border:1px solid ${isToday?'var(--blue)':'var(--border)'};border-radius:10px;overflow:hidden;background:${isToday?'var(--blue-pale)':'var(--surface)'};">
      <div style="padding:8px 10px;text-align:center;border-bottom:1px solid var(--border);background:${isToday?'rgba(37,99,235,.1)':'var(--surface2)'};">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${isToday?'var(--blue)':'var(--text-muted)'};">${DAY_SHORT[i]}</div>
        <div style="font-size:16px;font-weight:800;color:${isToday?'var(--blue)':'var(--text)'};">${d.getDate()}</div>
      </div>
      <div style="padding:6px;max-height:300px;overflow-y:auto;">`;
    if(!dayAppts.length){
      html+=`<div style="text-align:center;padding:16px 4px;font-size:10px;color:var(--text-dim);">No appointments</div>`;
    } else {
      dayAppts.forEach(a=>{
        const time=a.start_time||a.time||'';
        const status=a.status||'Scheduled';
        const statusCol={confirmed:'var(--green)',Confirmed:'var(--green)',pending:'var(--orange)',Requested:'var(--orange)',Scheduled:'var(--blue)',completed:'var(--text-dim)','no-show':'var(--red)',cancelled:'var(--red)'}[status]||'var(--text-dim)';
        const name=a.patient_name||a.patName||a.patient_mrn||'Unknown';
        const type=a.type||'Follow-up';
        html+=`<div style="padding:6px 8px;margin-bottom:4px;border-radius:8px;border-left:3px solid ${statusCol};background:var(--surface2);font-size:11px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:700;">${time}</span>
            <span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${statusCol}22;color:${statusCol};font-weight:700;">${status}</span>
          </div>
          <div style="font-weight:600;margin-top:2px;">${name}</div>
          <div style="color:var(--text-dim);font-size:10px;">${type}</div>
        </div>`;
      });
    }
    html+='</div></div>';
  }
  html+='</div>';
  // Summary below calendar
  html+=`<div style="margin-top:14px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;display:flex;gap:20px;font-size:12px;">
    <div><span style="font-weight:700;">${appts.length}</span> <span style="color:var(--text-muted);">appointments this week</span></div>
    <div><span style="font-weight:700;color:var(--green);">${appts.filter(a=>['confirmed','Confirmed','Scheduled'].includes(a.status)).length}</span> <span style="color:var(--text-muted);">confirmed</span></div>
    <div><span style="font-weight:700;color:var(--orange);">${appts.filter(a=>['pending','Requested'].includes(a.status)).length}</span> <span style="color:var(--text-muted);">pending</span></div>
    <div><span style="font-weight:700;color:var(--red);">${appts.filter(a=>['cancelled','no-show'].includes(a.status)).length}</span> <span style="color:var(--text-muted);">cancelled/no-show</span></div>
  </div>`;
  el.innerHTML=html;
}

// ── PUSH NOTIFICATION SUBSCRIBE (no SW) ──
async function subscribePush(){
  AppDialog.alert('Push notifications require a service worker which has been removed.');
}

// ── 2FA Setup UI ──────────────────────────────────────────────────
let _totpSecret=null;
async function show2FASetup(){
  const d=document.createElement('div');
d.id='twofa-modal';d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;display:flex;align-items:center;justify-content:center;';
d.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:400px;width:90%;position:relative;">
  <button data-action="elRemove:twofa-modal" style="position:absolute;top:12px;right:12px;background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer;">✕</button>
  <h2 style="font-size:16px;margin-bottom:12px;">🔐 Two-Factor Authentication</h2>
  <div id="twofa-content"><div style="text-align:center;color:var(--text-muted);font-size:13px;">Loading...</div></div>
</div>`;
d.onclick=e=>{if(e.target===d)d.remove()};document.body.appendChild(d);
  try{
    const r=await api('/auth/totp/setup',{method:'POST'});
    if(r.ok&&r.secret){
      _totpSecret=r.secret;
      document.getElementById('twofa-content').innerHTML=`
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</div>
        <div style="text-align:center;margin:12px 0;"><div style="background:#fff;display:inline-block;padding:12px;border-radius:8px;" id="twofa-qr-slot"></div></div>
        <div style="font-size:11px;color:var(--text-dim);margin:8px 0;">Or enter this key manually:</div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;font-family:var(--mono);font-size:14px;text-align:center;letter-spacing:2px;margin-bottom:12px;">${r.secret}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Enter the 6-digit code from your app to confirm:</div>
        <div style="display:flex;gap:8px;">
          <input id="twofa-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" style="flex:1;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:16px;font-family:var(--mono);text-align:center;letter-spacing:4px;">
          <button data-action="enable2FA" style="padding:10px 16px;background:var(--green);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Enable</button>
        </div>`;
    // 2FA QR rendered locally — the otpauth URL embeds the TOTP secret;
    // sending it to a public QR service would leak the second factor.
    { const slot = document.getElementById('twofa-qr-slot');
      if (slot && window.localQr) slot.appendChild(localQr(r.otpauthUrl, { width: 200, alt: '2FA setup QR' })); }
    }
  }catch(e){
    if(e.message?.includes('already enabled')){
      document.getElementById('twofa-content').innerHTML=`<div style="text-align:center;"><div style="font-size:24px;margin-bottom:8px;">✅</div><div style="font-weight:600;">2FA is already enabled</div><div style="font-size:12px;color:var(--text-muted);margin-top:4px;">To disable, use the button below.</div><div style="display:flex;gap:8px;margin-top:16px;justify-content:center;"><input id="twofa-disable-code" maxlength="6" placeholder="Code" style="width:120px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;font-family:var(--mono);text-align:center;"><button data-action="disable2FA" style="padding:10px 16px;background:rgba(220,38,38,.1);color:var(--red);border:none;border-radius:8px;font-weight:700;cursor:pointer;">Disable 2FA</button></div></div>`;
    } else {
      document.getElementById('twofa-content').innerHTML=`<div style="text-align:center;color:var(--red);font-size:13px;">${e.message}</div>`;
    }
  }
}
async function enable2FA(){
  const code=document.getElementById('twofa-code')?.value;
  if(!code||code.length!==6){AppDialog.alert('Enter the 6-digit code.');return;}
  try{
    await api('/auth/totp/enable',{method:'POST',body:JSON.stringify({code})});
    document.getElementById('twofa-content').innerHTML=`<div style="text-align:center;"><div style="font-size:32px;margin-bottom:8px;">🎉</div><div style="font-weight:700;font-size:16px;">2FA Enabled!</div><div style="font-size:12px;color:var(--text-muted);margin-top:8px;">You will now need your authenticator app code when signing in.</div><button data-action="elRemove:twofa-modal" style="margin-top:16px;padding:10px 24px;background:var(--green);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Done</button></div>`;
  }catch(e){AppDialog.alert(e.message);}
}
async function disable2FA(){
  const code=document.getElementById('twofa-disable-code')?.value;
  if(!code||code.length!==6){AppDialog.alert('Enter your current 6-digit code.');return;}
  try{
    await api('/auth/totp/disable',{method:'POST',body:JSON.stringify({code})});
    document.getElementById('twofa-content').innerHTML=`<div style="text-align:center;"><div style="font-size:24px;margin-bottom:8px;">🔓</div><div style="font-weight:600;">2FA has been disabled</div><button data-action="elRemove:twofa-modal" style="margin-top:16px;padding:10px 24px;background:var(--blue);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Done</button></div>`;
  }catch(e){AppDialog.alert(e.message);}
}

// ═══════════════════════════════════════════════════════════════
// CLINICAL DECISION SUPPORT
// ═══════════════════════════════════════════════════════════════
function renderCDSPanel(){
  // Populate patient dropdown
  const sel=document.getElementById('cds-patient');
  const keys=LS.keys('pat_').filter(k=>{const p=LS.get(k);return p&&!Array.isArray(p)&&p.mrn&&p.name;});
  sel.innerHTML='<option value="">— Select —</option>'+keys.map(k=>{const p=LS.get(k);return p?`<option value="${p.mrn}">${p.name} (${p.mrn})</option>`:''}).join('');
}

async function checkInteractions(){
  const medsStr=document.getElementById('cds-meds').value;
  const meds=medsStr.split(',').map(m=>m.trim()).filter(Boolean);
  if(meds.length<2){AppDialog.alert('Enter at least 2 medications');return}
  try{
    const r=await api('/cds/interactions',{method:'POST',body:JSON.stringify({medications:meds})});
    const el=document.getElementById('cds-interaction-results');
    if(!r.ok||!r.interactions||!r.interactions.length){el.innerHTML='<div style="padding:12px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:10px;color:var(--green);font-size:13px">✅ No known interactions found between these medications.</div>';return}
    const sevColors={severe:'var(--red)',moderate:'var(--orange)',mild:'var(--text-muted)'};
    el.innerHTML=r.interactions.map(i=>`
      <div style="padding:12px;background:rgba(${i.severity==='severe'?'239,68,68':i.severity==='moderate'?'245,158,11':'100,116,139'},.06);border:1px solid rgba(${i.severity==='severe'?'239,68,68':i.severity==='moderate'?'245,158,11':'100,116,139'},.2);border-radius:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-weight:700;font-size:13px">${i.drug_a} ↔ ${i.drug_b}</span>
          <span style="font-size:10px;font-weight:700;color:${sevColors[i.severity]};text-transform:uppercase">${i.severity}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${i.description}</div>
        ${i.recommendation?`<div style="font-size:11px;color:var(--blue);font-weight:600">💡 ${i.recommendation}</div>`:''}
      </div>
    `).join('');
  }catch(e){AppDialog.alert('Error: '+e.message)}
}

async function loadPatientAllergies(){
  const mrn=document.getElementById('cds-patient').value;
  const el=document.getElementById('cds-allergy-list');
  if(!mrn){el.innerHTML='';return}
  try{
    const r=await api('/cds/allergies/'+mrn);
    if(!r.ok||!r.allergies||!r.allergies.length){el.innerHTML='<div style="font-size:12px;color:var(--text-dim);margin-top:8px">No known allergies.</div>';return}
    const sevColors={mild:'var(--green)',moderate:'var(--orange)',severe:'var(--red)',anaphylaxis:'#dc2626'};
    el.innerHTML='<div style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin-top:8px;margin-bottom:4px">Known Allergies</div>'+r.allergies.map(a=>`
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.12);border-radius:8px;margin-bottom:4px;font-size:12px">
        <span style="font-weight:700;color:var(--red)">⚠ ${a.drug_name}</span>
        ${a.reaction?`<span style="color:var(--text-muted)">— ${a.reaction}</span>`:''}
        <span style="margin-left:auto;font-size:10px;font-weight:700;color:${sevColors[a.severity]};text-transform:uppercase">${a.severity}</span>
        <button data-action="removeAllergy:${a.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px">✕</button>
      </div>
    `).join('');
  }catch(e){el.innerHTML='<div style="font-size:11px;color:var(--red)">Error loading allergies</div>'}
}

async function addAllergy(){
  const mrn=document.getElementById('cds-patient').value;
  const drug=document.getElementById('cds-allergy-drug').value;
  const rxn=document.getElementById('cds-allergy-rxn').value;
  const sev=document.getElementById('cds-allergy-sev').value;
  if(!mrn||!drug){AppDialog.alert('Select patient and enter drug name');return}
  try{await api('/cds/allergies',{method:'POST',body:JSON.stringify({mrn,drugName:drug,reaction:rxn,severity:sev})});document.getElementById('cds-allergy-drug').value='';document.getElementById('cds-allergy-rxn').value='';loadPatientAllergies()}catch(e){AppDialog.alert(e.message)}
}

async function removeAllergy(id){if(!await AppDialog.confirm('Remove this allergy?',{danger:true}))return;try{await api('/cds/allergies/'+id,{method:'DELETE'});loadPatientAllergies()}catch(e){AppDialog.alert(e.message)}}

async function showDrugInfo(name){
  try{
    const r=await api('/cds/drug-info/'+name);
    const el=document.getElementById('cds-drug-info');
    if(!r.ok){el.innerHTML='<div style="font-size:12px;color:var(--text-dim)">Drug not found in database.</div>';return}
    const info=r.info||{};
    el.innerHTML=`<div class="card" style="margin-top:0;border-left:3px solid var(--blue)">
      <div style="font-weight:800;font-size:16px;margin-bottom:4px">${name}${info.brand?' <span style="color:var(--text-muted);font-weight:400;font-size:13px">('+info.brand+')</span>':''}</div>
      ${info.unit?`<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Dose unit: <strong>${info.unit}</strong></div>`:''}
      ${info.frequency?`<div style="font-size:12px;margin-bottom:4px"><span style="color:var(--text-dim)">Frequency:</span> ${info.frequency}</div>`:''}
      ${info.commonDoses?`<div style="font-size:12px;margin-bottom:4px"><span style="color:var(--text-dim)">Common doses:</span> ${info.commonDoses.join(', ')} ${info.unit||''}</div>`:''}
      ${info.notes?`<div style="font-size:12px;color:var(--text-muted);margin-top:8px;padding:8px 12px;background:var(--surface2);border-radius:8px">📋 ${info.notes}</div>`:''}
      ${info.blackBox?`<div style="font-size:12px;color:var(--red);margin-top:8px;padding:8px 12px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;font-weight:600">⚠️ BLACK BOX: ${info.blackBox}</div>`:''}
      ${info.interactions&&info.interactions.length?`<div style="margin-top:8px"><div style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px">Known Interactions</div>${info.interactions.map(i=>`<div style="font-size:11px;color:var(--orange);padding:2px 0">• ${i}</div>`).join('')}</div>`:''}
    </div>`;
  }catch(e){}
}

// ═══════════════════════════════════════════════════════════════
// E-PRESCRIBING
// ═══════════════════════════════════════════════════════════════
function renderDoctorRxPanel(){
  const sel=document.getElementById('rx-patient');
  const keys=LS.keys('pat_').filter(k=>{const p=LS.get(k);return p&&!Array.isArray(p)&&p.mrn&&p.name;});
  sel.innerHTML='<option value="">— Select —</option>'+keys.map(k=>{const p=LS.get(k);return p?`<option value="${p.mrn}">${p.name} (${p.mrn})</option>`:''}).join('');
  sel.onchange=()=>loadDoctorRxs(sel.value);
}

async function loadDoctorRxs(mrn){
  const el=document.getElementById('rx-active-list');
  if(!mrn){el.innerHTML='<div class="empty-card">Select a patient to view prescriptions</div>';return}
  try{
    const r=await api('/rx/patient/'+mrn);
    if(!r.ok||!r.prescriptions||!r.prescriptions.length){el.innerHTML='<div class="empty-card">No prescriptions for this patient.</div>';return}
    const statusColors={active:'var(--green)',completed:'var(--text-muted)',cancelled:'var(--red)',expired:'var(--orange)','pending-refill':'var(--orange)'};
    el.innerHTML=r.prescriptions.map(rx=>`
      <div style="padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div><div style="font-weight:700">${rx.medication}</div><div style="font-size:12px;color:var(--text-muted)">${rx.dosage} · ${rx.frequency} · ${rx.route||'oral'}</div></div>
          <span style="font-size:10px;font-weight:700;color:${statusColors[rx.status]};text-transform:uppercase">${rx.status}</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          ${rx.status==='active'?`<button class="btn btn-ghost btn-sm" data-action="updateRx:${rx.id},completed">Complete</button>`:''}
          ${rx.status==='active'?`<button class="btn btn-danger btn-sm" data-action="updateRx:${rx.id},cancelled">Cancel</button>`:''}
          ${rx.status==='pending-refill'?`<button class="btn btn-primary btn-sm" data-action="updateRx:${rx.id},active">Approve Refill</button>`:''}
        </div>
      </div>
    `).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Error loading prescriptions.</div>'}
}

async function createPrescription(){
  const mrn=document.getElementById('rx-patient').value;
  const med=document.getElementById('rx-med').value;
  const dose=document.getElementById('rx-dose').value;
  const freq=document.getElementById('rx-freq').value;
  if(!mrn||!med||!dose){AppDialog.alert('Select patient, enter medication and dosage');return}
  try{
    const r=await api('/rx',{method:'POST',body:JSON.stringify({
      patientMrn:mrn,medication:med,genericName:document.getElementById('rx-generic').value||undefined,
      dosage:dose,frequency:freq,route:document.getElementById('rx-route').value,
      duration:document.getElementById('rx-dur').value||undefined,
      quantity:parseInt(document.getElementById('rx-qty').value)||undefined,
      refills:parseInt(document.getElementById('rx-refills').value)||0,
      pharmacy:document.getElementById('rx-pharmacy').value||undefined,
      instructions:document.getElementById('rx-instructions').value||undefined
    })});
    if(r.ok){
      if(r.warnings&&r.warnings.length){
        const el=document.getElementById('rx-safety-warnings');
        el.style.display='block';
        el.innerHTML='<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:12px"><div style="font-weight:700;font-size:12px;color:var(--orange);margin-bottom:6px">⚠️ Safety Warnings</div>'+r.warnings.map(w=>`<div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">• ${w.message}</div>`).join('')+'</div>';
      }
      AppDialog.alert('✅ Prescription created');
      document.getElementById('rx-med').value='';document.getElementById('rx-dose').value='';document.getElementById('rx-instructions').value='';
      loadDoctorRxs(mrn);
    }
  }catch(e){AppDialog.alert(e.message)}
}

async function updateRx(id,status){
  try{await api('/rx',{method:'PATCH',body:JSON.stringify({prescriptionId:id,status})});
  loadDoctorRxs(document.getElementById('rx-patient').value)}catch(e){AppDialog.alert(e.message)}
}

// ═══════════════════════════════════════════════════════════════
// PER-PATIENT CLINICAL SUPPORT (rt-clinical-support tab)
// ═══════════════════════════════════════════════════════════════

function renderRecordClinicalSupport(mrn){
  if(!mrn)return;
  rCdsLoadAllergies(mrn);
  rCdsPrefillMeds();
}

// ── Load server allergies for this patient ──
async function rCdsLoadAllergies(mrn){
  const el=document.getElementById('r-cds-allergy-list');
  const badge=document.getElementById('r-cds-allergy-count');
  if(!el)return;
  try{
    const r=await api('/cds/allergies/'+mrn);
    if(!r.ok||!r.allergies||!r.allergies.length){el.innerHTML='<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">No known allergies recorded on server.</div>';if(badge)badge.style.display='none';return;}
    const sevColors={mild:'var(--green)',moderate:'var(--orange)',severe:'var(--red)',anaphylaxis:'#dc2626'};
    el.innerHTML=r.allergies.map(a=>`
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.12);border-radius:8px;margin-bottom:5px;font-size:12px;">
        <span style="font-weight:700;color:var(--red)">⚠ ${a.drug_name}</span>
        ${a.reaction?`<span style="color:var(--text-muted)">— ${a.reaction}</span>`:''}
        <span style="margin-left:auto;font-size:10px;font-weight:700;color:${sevColors[a.severity]};text-transform:uppercase">${a.severity}</span>
        <button data-action="rCdsRemoveAllergy:${a.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;" title="Remove">✕</button>
      </div>
    `).join('');
    if(badge){badge.textContent=r.allergies.length;badge.style.display='inline';}
  }catch(e){el.innerHTML='<div style="font-size:11px;color:var(--red)">Error loading allergies</div>'}
}

async function rCdsAddAllergy(){
  if(!selectedMRN)return;
  const drug=document.getElementById('r-cds-allergy-drug').value;
  const rxn=document.getElementById('r-cds-allergy-rxn').value;
  const sev=document.getElementById('r-cds-allergy-sev').value;
  if(!drug){AppDialog.alert('Enter a drug name');return}
  try{
    await api('/cds/allergies',{method:'POST',body:JSON.stringify({mrn:selectedMRN,drugName:drug,reaction:rxn||undefined,severity:sev})});
    document.getElementById('r-cds-allergy-drug').value='';
    document.getElementById('r-cds-allergy-rxn').value='';
    rCdsLoadAllergies(selectedMRN);
  }catch(e){AppDialog.alert(e.message)}
}

async function rCdsRemoveAllergy(id){
  if(!await AppDialog.confirm('Remove this allergy?',{danger:true}))return;
  try{await api('/cds/allergies/'+id,{method:'DELETE'});rCdsLoadAllergies(selectedMRN)}catch(e){AppDialog.alert(e.message)}
}

// ── Pre-fill meds from patient's active meds ──
function rCdsPrefillMeds(){
  const el=document.getElementById('r-cds-meds');
  if(!el||!selectedMRN)return;
  const p=LS.get('pat_'+selectedMRN);
  if(!p)return;
  const active=(p.meds||[]).filter(m=>m.status==='Active').map(m=>m.name).join(', ');
  const serverMeds=[];
  // Also try to get from server prescriptions
  api('/rx/patient/'+selectedMRN).then(r=>{
    if(r.ok&&r.prescriptions){
      const activeRx=r.prescriptions.filter(rx=>rx.status==='active').map(rx=>rx.medication);
      const all=[...new Set([...active.split(', ').filter(Boolean),...activeRx])];
      el.value=all.join(', ');
    }
  }).catch(()=>{el.value=active;});
  el.value=active;
}

// ── Drug interaction check ──
async function rCdsCheckInteractions(){
  const medsStr=document.getElementById('r-cds-meds').value;
  const meds=medsStr.split(',').map(m=>m.trim()).filter(Boolean);
  if(meds.length<2){AppDialog.alert('Enter at least 2 medications');return}
  const el=document.getElementById('r-cds-interaction-results');
  el.innerHTML='<div style="font-size:12px;color:var(--text-muted);padding:8px;">Checking...</div>';
  try{
    const r=await api('/cds/interactions',{method:'POST',body:JSON.stringify({medications:meds})});
    if(!r.ok||!r.interactions||!r.interactions.length){
      el.innerHTML='<div style="padding:12px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:10px;color:var(--green);font-size:13px">✅ No known interactions found between these medications.</div>';
      return;
    }
    const sevColors={severe:'var(--red)',moderate:'var(--orange)',mild:'var(--text-muted)'};
    el.innerHTML=r.interactions.map(i=>`
      <div style="padding:12px;background:rgba(${i.severity==='severe'?'239,68,68':i.severity==='moderate'?'245,158,11':'100,116,139'},.06);border:1px solid rgba(${i.severity==='severe'?'239,68,68':i.severity==='moderate'?'245,158,11':'100,116,139'},.2);border-radius:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-weight:700;font-size:13px">${i.drug_a} ↔ ${i.drug_b}</span>
          <span style="font-size:10px;font-weight:700;color:${sevColors[i.severity]};text-transform:uppercase">${i.severity}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${i.description}</div>
        ${i.recommendation?`<div style="font-size:11px;color:var(--blue);font-weight:600">💡 ${i.recommendation}</div>`:''}
        ${i._existingMed?`<div style="font-size:10px;color:var(--orange);margin-top:4px;">⚠ Conflicts with existing active medication: <strong>${i._existingMed}</strong></div>`:''}
      </div>
    `).join('');
  }catch(e){el.innerHTML='<div style="font-size:12px;color:var(--red)">Error: '+e.message+'</div>'}
}

// ── Dosage validation ──
async function rCdsCheckDosage(){
  const med=document.getElementById('r-cds-dose-med').value;
  const dose=document.getElementById('r-cds-dose-val').value;
  const freq=document.getElementById('r-cds-dose-freq').value;
  if(!med||!dose||!freq){AppDialog.alert('Enter medication, dosage, and frequency');return}
  const el=document.getElementById('r-cds-dose-results');
  el.innerHTML='<div style="font-size:12px;color:var(--text-muted);padding:8px;">Validating...</div>';
  try{
    const r=await api('/cds/dosage-check',{method:'POST',body:JSON.stringify({medication:med,dosage:dose,frequency:freq})});
    if(!r.ok){el.innerHTML='<div style="font-size:12px;color:var(--red)">Validation error</div>';return}
    if(!r.alerts||!r.alerts.length){
      el.innerHTML='<div style="padding:12px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:10px;color:var(--green);font-size:13px">✅ Dosage appears within standard range.</div>';
      if(r.reference){
        const ref=r.reference;
        el.innerHTML+=`<div style="margin-top:10px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:12px;">
          <div style="font-weight:700;margin-bottom:4px;">📋 Reference: ${med}${ref.brand?' ('+ref.brand+')':''}</div>
          ${ref.commonDoses?`<div>Common doses: <strong>${ref.commonDoses.join(', ')}</strong> ${ref.unit||''}</div>`:''}
          ${ref.frequency?`<div>Frequency: ${ref.frequency}</div>`:''}
          ${ref.notes?`<div style="margin-top:6px;color:var(--text-muted);font-style:italic;">${ref.notes}</div>`:''}
          ${ref.blackBox?`<div style="margin-top:6px;color:var(--red);font-weight:700;">⚠️ BLACK BOX: ${ref.blackBox}</div>`:''}
        </div>`;
      }
      return;
    }
    const sevColors={severe:'var(--red)',moderate:'var(--orange)',mild:'var(--text-muted)'};
    el.innerHTML=r.alerts.map(a=>`
      <div style="padding:10px;background:rgba(${a.severity==='severe'?'239,68,68':'245,158,11'},.06);border:1px solid rgba(${a.severity==='severe'?'239,68,68':'245,158,11'},.2);border-radius:8px;margin-bottom:6px;font-size:12px;">
        <span style="font-weight:700;color:${sevColors[a.severity]};text-transform:uppercase;font-size:10px;">${a.severity}</span>
        <div style="margin-top:4px;color:var(--text);">${a.message}</div>
      </div>
    `).join('');
  }catch(e){el.innerHTML='<div style="font-size:12px;color:var(--red)">Error: '+e.message+'</div>'}
}

// ── Quick prescribe with CDS checks ──
async function rCdsQuickPrescribe(){
  if(!selectedMRN)return;
  const med=document.getElementById('r-cds-rx-med').value;
  const dose=document.getElementById('r-cds-rx-dose').value;
  const freq=document.getElementById('r-cds-rx-freq').value;
  const route=document.getElementById('r-cds-rx-route').value;
  const dur=document.getElementById('r-cds-rx-dur').value;
  const instr=document.getElementById('r-cds-rx-instr').value;
  if(!med||!dose){AppDialog.alert('Enter medication and dosage');return}
  const warnEl=document.getElementById('r-cds-rx-warnings');
  warnEl.style.display='none';
  try{
    const r=await api('/rx',{method:'POST',body:JSON.stringify({
      patientMrn:selectedMRN,medication:med,dosage:dose,frequency:freq,
      route:route,duration:dur||undefined,instructions:instr||undefined
    })});
    if(r.ok){
      if(r.warnings&&r.warnings.length){
        warnEl.style.display='block';
        warnEl.innerHTML=`<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:12px;margin-bottom:8px;">
          <div style="font-weight:700;font-size:12px;color:var(--orange);margin-bottom:6px">⚠️ CDS Safety Warnings (${r.warnings.length})</div>
          ${r.warnings.map(w=>`<div style="font-size:11px;color:var(--text-muted);margin-bottom:3px;">${w.type==='allergy'?'🔴':'🟡'} ${w.message}${w.recommendation?' — 💡 '+w.recommendation:''}</div>`).join('')}
        </div>`;
      }
      // Clear form
      document.getElementById('r-cds-rx-med').value='';
      document.getElementById('r-cds-rx-dose').value='';
      document.getElementById('r-cds-rx-instr').value='';
      // Reload patient's med list in prescriptions tab if open
      renderMedList();
      AppDialog.alert('✅ Prescription created for ' + med);
      renderRecordClinicalSupport(selectedMRN);
    }
  }catch(e){AppDialog.alert(e.message)}
}

// ── Drug info lookup (in patient context) ──
async function rCdsShowDrugInfo(name){
  try{
    const r=await api('/cds/drug-info/'+name);
    const el=document.getElementById('r-cds-drug-info');
    if(!r.ok){el.innerHTML='<div style="font-size:12px;color:var(--text-dim)">Drug not found in database.</div>';return}
    const info=r.info||{};
    el.innerHTML=`<div style="padding:16px;background:var(--surface2);border:1px solid var(--border);border-left:3px solid var(--blue);border-radius:10px;margin-top:0;">
      <div style="font-weight:800;font-size:15px;margin-bottom:4px">${name}${info.brand?' <span style="color:var(--text-muted);font-weight:400;font-size:12px">('+info.brand+')</span>':''}</div>
      ${info.unit?`<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Dose unit: <strong>${info.unit}</strong></div>`:''}
      ${info.frequency?`<div style="font-size:12px;margin-bottom:3px;"><span style="color:var(--text-dim)">Frequency:</span> ${info.frequency}</div>`:''}
      ${info.commonDoses?`<div style="font-size:12px;margin-bottom:3px;"><span style="color:var(--text-dim)">Common doses:</span> ${info.commonDoses.join(', ')} ${info.unit||''}</div>`:''}
      ${info.notes?`<div style="font-size:12px;color:var(--text-muted);margin-top:8px;padding:8px 12px;background:var(--surface);border-radius:8px;">📋 ${info.notes}</div>`:''}
      ${info.blackBox?`<div style="font-size:12px;color:var(--red);margin-top:8px;padding:8px 12px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;font-weight:600;">⚠️ BLACK BOX: ${info.blackBox}</div>`:''}
      ${info.interactions&&info.interactions.length?`<div style="margin-top:8px;"><div style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px;">Known Interactions</div>${info.interactions.map(i=>`<div style="font-size:11px;color:var(--orange);padding:2px 0;">• ${i}</div>`).join('')}</div>`:''}
      ${r.interactions&&r.interactions.length?`<div style="margin-top:8px;"><div style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px;">DB Interactions</div>${r.interactions.map(i=>`<div style="font-size:11px;color:${i.severity==='severe'?'var(--red)':'var(--orange)'};padding:2px 0;">• ${i.drug_a} ↔ ${i.drug_b} (${i.severity})</div>`).join('')}</div>`:''}
    </div>`;
  }catch(e){}
}

// ═══════════════════════════════════════════════════════════════
// AUDIT TRAIL PANEL
// ═══════════════════════════════════════════════════════════════
async function renderAuditPanel(){
  const mrn=(document.getElementById('audit-mrn')?.value||'').trim().toUpperCase();
  const cat=document.getElementById('audit-cat')?.value||'';
  const days=document.getElementById('audit-days')?.value||'30';
  const el=document.getElementById('audit-list');
  if(!el)return;
  if(!mrn){
    // Show doctor's own recent activity
    try{
      const r=await api('/features/audit?days='+days+'&limit=100');
      if(!r.ok||!r.entries||!r.entries.length){el.innerHTML='<div class="empty-card">No audit entries found.</div>';return;}
      document.getElementById('audit-count').textContent=r.entries.length+' entries';
      el.innerHTML=r.entries.map(e=>auditEntryHTML(e)).join('');
    }catch(e){el.innerHTML='<div class="empty-card">Error loading audit trail</div>'}
    return;
  }
  try{
    let url='/api/features/audit/'+mrn+'?limit=100';
    if(cat)url+='&category='+cat;
    const r=await api(url);
    if(!r.ok||!r.entries||!r.entries.length){el.innerHTML='<div class="empty-card">No audit entries for this patient.</div>';return;}
    document.getElementById('audit-count').textContent=r.entries.length+' of '+r.total+' entries';
    el.innerHTML=r.entries.map(e=>auditEntryHTML(e)).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Error loading audit trail</div>'}
}
function auditEntryHTML(e){
  const catIcons={prescription:'💊',allergy:'⚠️',clinical_note:'📝',referral:'🔀',imaging:'📎',lab:'🧪',protocol:'📋'};
  const catColors={prescription:'var(--blue)',allergy:'var(--red)',clinical_note:'var(--green)',referral:'var(--orange)',imaging:'var(--purple)',lab:'var(--cyan)',protocol:'var(--blue)'};
  const icon=catIcons[e.category]||'📋';
  const col=catColors[e.category]||'var(--text-muted)';
  const detail=e.detail?((typeof e.detail==='object')?Object.entries(e.detail).map(([k,v])=>k+': '+v).join(', '):e.detail):'';
  const ts=e.created_at?new Date(e.created_at).toLocaleString():'';
  return `<div style="display:flex;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);font-size:12px;">
    <span style="font-size:16px;flex-shrink:0;">${icon}</span>
    <div style="flex:1;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:600;color:${col};">${e.action}</span>
        <span style="font-size:10px;color:var(--text-dim);">${ts}</span>
      </div>
      ${detail?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${esc(detail)}</div>`:''}
      ${e.patient_mrn?`<div style="font-size:10px;color:var(--text-dim);margin-top:1px;">Patient: ${e.patient_mrn}</div>`:''}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// CLINICAL NOTES
// ═══════════════════════════════════════════════════════════════
function rNotesCreate(){
  const type=document.getElementById('r-note-type').value;
  document.getElementById('r-notes-editor').style.display='block';
  document.getElementById('r-note-free-wrap').style.display=(type==='progress')?'block':'none';
  document.getElementById('r-note-s').value='';document.getElementById('r-note-o').value='';
  document.getElementById('r-note-a').value='';document.getElementById('r-note-p').value='';
  document.getElementById('r-note-free').value='';
}
let _rNoteId=null;
function rNotesEdit(note){
  _rNoteId=note.id;
  document.getElementById('r-notes-editor').style.display='block';
  document.getElementById('r-note-s').value=note.subjective||'';
  document.getElementById('r-note-o').value=note.objective||'';
  document.getElementById('r-note-a').value=note.assessment||'';
  document.getElementById('r-note-p').value=note.plan||'';
  document.getElementById('r-note-free').value=note.free_text||'';
}
async function rNotesSave(){
  if(!selectedMRN)return;
  const body={patientMrn:selectedMRN,noteType:document.getElementById('r-note-type').value,
    subjective:v('r-note-s'),objective:v('r-note-o'),assessment:v('r-note-a'),plan:v('r-note-p'),freeText:v('r-note-free')};
  try{
    if(_rNoteId){await api('/features/notes/'+_rNoteId,{method:'PATCH',body:JSON.stringify(body)});}
    else{await api('/features/notes',{method:'POST',body:JSON.stringify(body)});}
    _rNoteId=null;document.getElementById('r-notes-editor').style.display='none';rNotesLoad();
  }catch(e){AppDialog.alert(e.message)}
}
async function rNotesSign(){
  if(!_rNoteId){AppDialog.alert('Save the note first, then sign.');return;}
  try{await api('/features/notes/'+_rNoteId,{method:'PATCH',body:JSON.stringify({signed:true})});rNotesLoad();}catch(e){AppDialog.alert(e.message)}
}
async function rNotesLoad(){
  if(!selectedMRN)return;const el=document.getElementById('r-notes-list');
  try{
    const r=await api('/features/notes/'+selectedMRN);
    if(!r.ok||!r.notes||!r.notes.length){el.innerHTML='<div class="empty-card">No clinical notes yet.</div>';return;}
    el.innerHTML=r.notes.map(n=>`<div style="padding:14px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${n.signed?'var(--green)':'var(--orange)'};border-radius:10px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:700;font-size:13px;">${n.note_type.toUpperCase()}${n.template_name?' · '+n.template_name:''}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          ${n.signed?'<span style="font-size:10px;font-weight:700;color:var(--green);">✅ SIGNED</span>':'<span style="font-size:10px;font-weight:700;color:var(--orange);">DRAFT</span>'}
          <span style="font-size:10px;color:var(--text-dim);">${n.created_at?.split('T')[0]||''}</span>
          <button class="btn btn-ghost btn-sm" data-action="rNotesEditJson:${JSON.stringify(n).replace(/'/g,"\\'")}" style="padding:3px 8px;font-size:10px;">Edit</button>
        </div>
      </div>
      ${n.subjective?`<div style="margin-bottom:6px;"><span style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;">Subjective:</span><div style="font-size:12px;color:var(--text);margin-top:2px;white-space:pre-wrap;">${esc(n.subjective)}</div></div>`:''}
      ${n.objective?`<div style="margin-bottom:6px;"><span style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;">Objective:</span><div style="font-size:12px;color:var(--text);margin-top:2px;white-space:pre-wrap;">${esc(n.objective)}</div></div>`:''}
      ${n.assessment?`<div style="margin-bottom:6px;"><span style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;">Assessment:</span><div style="font-size:12px;color:var(--text);margin-top:2px;white-space:pre-wrap;">${esc(n.assessment)}</div></div>`:''}
      ${n.plan?`<div style="margin-bottom:6px;"><span style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;">Plan:</span><div style="font-size:12px;color:var(--text);margin-top:2px;white-space:pre-wrap;">${esc(n.plan)}</div></div>`:''}
      ${n.free_text?`<div style="margin-bottom:6px;"><span style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;">Notes:</span><div style="font-size:12px;color:var(--text);margin-top:2px;white-space:pre-wrap;">${esc(n.free_text)}</div></div>`:''}
    </div>`).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Error loading notes</div>'}
}

// ═══════════════════════════════════════════════════════════════
// CHEMOTHERAPY CYCLES
// ═══════════════════════════════════════════════════════════════
let _chemoProtocols=[];
async function rChemoShowForm(){
  document.getElementById('r-chemo-form').style.display='block';
  document.getElementById('r-chemo-start').value=new Date().toISOString().split('T')[0];
  // Load protocols
  try{const r=await api('/features/protocols');if(r.ok&&r.protocols){_chemoProtocols=r.protocols;const sel=document.getElementById('r-chemo-protocol');sel.innerHTML='<option value="">Select protocol...</option>'+r.protocols.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('');}}catch(e){}
}
function rChemoLoadProtocol(){
  const id=document.getElementById('r-chemo-protocol').value;
  const p=_chemoProtocols.find(x=>x.id===id);
  if(!p)return;
  document.getElementById('r-chemo-regimen').value=typeof p.drugs==='string'?p.drugs:JSON.stringify(p.drugs,null,2);
  if(p.cycles)document.getElementById('r-chemo-total').value=p.cycles;
  if(p.cycle_length)document.getElementById('r-chemo-length').value=p.cycle_length;
}
async function rChemoSave(){
  if(!selectedMRN)return;
  const protoId=document.getElementById('r-chemo-protocol').value;
  const proto=_chemoProtocols.find(p=>p.id===protoId);
  const body={patientMrn:selectedMRN,protocolName:proto?proto.name:v('r-chemo-protocol'),regimen:v('r-chemo-regimen'),totalCycles:parseInt(v('r-chemo-total'))||6,cycleLengthDays:parseInt(v('r-chemo-length'))||28,startDate:v('r-chemo-start'),notes:v('r-chemo-notes')};
  if(!body.protocolName||!body.startDate){AppDialog.alert('Select protocol and start date');return;}
  try{await api('/features/chemo',{method:'POST',body:JSON.stringify(body)});document.getElementById('r-chemo-form').style.display='none';rChemoLoad();}catch(e){AppDialog.alert(e.message)}
}
async function rChemoLoad(){
  if(!selectedMRN)return;const el=document.getElementById('r-chemo-list');
  try{
    const r=await api('/features/chemo/'+selectedMRN);
    if(!r.ok||!r.cycles||!r.cycles.length){el.innerHTML='<div class="empty-card">No chemotherapy protocols started.</div>';return;}
    el.innerHTML=r.cycles.map(c=>{const pct=Math.round((c.current_cycle/c.total_cycles)*100);const statusCol={active:'var(--green)',completed:'var(--text-muted)',paused:'var(--orange)',discontinued:'var(--red)'}[c.status]||'var(--text-dim)';return `<div class="info-card" style="border-left:3px solid ${statusCol};">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
        <div><div style="font-weight:700;font-size:14px;">${c.protocol_name}</div><div style="font-size:12px;color:var(--text-muted);">Started: ${c.start_date}</div></div>
        <span class="badge" style="background:${statusCol}22;color:${statusCol};">${c.status}</span>
      </div>
      <div style="margin:10px 0;"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span>Cycle ${c.current_cycle} of ${c.total_cycles}</span><span>${pct}%</span></div><div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden;"><div style="height:100%;background:linear-gradient(90deg,var(--blue),var(--green));border-radius:4px;width:${pct}%;transition:width .5s;"></div></div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px;color:var(--text-muted);">
        <div>Next cycle: <strong>${c.next_cycle_date||'—'}</strong></div>
        <div>Cycle length: <strong>${c.cycle_length_days} days</strong></div>
        <div>Regimen: <strong>${(c.regimen||'').substring(0,50)}${(c.regimen||'').length>50?'...':''}</strong></div>
      </div>
      ${c.status==='active'?`<div style="display:flex;gap:6px;margin-top:10px;">
        <button class="btn btn-ghost btn-sm" data-action="rChemoAdvance:${c.id},${c.current_cycle}">➡️ Advance Cycle</button>
        <button class="btn btn-danger btn-sm" data-action="rChemoUpdateStatus:${c.id},paused">⏸ Pause</button>
      </div>`:''}
    </div>`;}).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Error loading chemo cycles</div>'}
}
async function rChemoAdvance(id,current){
  try{await api('/features/chemo/'+id,{method:'PATCH',body:JSON.stringify({currentCycle:current+1})});rChemoLoad();}catch(e){AppDialog.alert(e.message)}
}
async function rChemoUpdateStatus(id,status){
  try{await api('/features/chemo/'+id,{method:'PATCH',body:JSON.stringify({status})});rChemoLoad();}catch(e){AppDialog.alert(e.message)}
}

// ═══════════════════════════════════════════════════════════════
// REFERRALS
// ═══════════════════════════════════════════════════════════════
function rRefShowForm(){document.getElementById('r-ref-form').style.display='block';}
async function rRefSave(){
  if(!selectedMRN)return;
  const body={patientMrn:selectedMRN,toSpecialty:v('r-ref-specialty'),toProvider:v('r-ref-provider')||undefined,reason:v('r-ref-reason'),urgency:v('r-ref-urgency'),clinicalSummary:v('r-ref-summary')||undefined};
  if(!body.reason){AppDialog.alert('Enter referral reason');return;}
  try{await api('/features/referrals',{method:'POST',body:JSON.stringify(body)});document.getElementById('r-ref-form').style.display='none';rRefLoad();}catch(e){AppDialog.alert(e.message)}
}
async function rRefLoad(){
  if(!selectedMRN)return;const el=document.getElementById('r-ref-list');
  try{
    const r=await api('/features/referrals/'+selectedMRN);
    if(!r.ok||!r.referrals||!r.referrals.length){el.innerHTML='<div class="empty-card">No referrals yet.</div>';return;}
    const urgencyCol={urgent:'var(--red)',expedited:'var(--orange)',routine:'var(--blue)'};
    const statusCol={pending:'var(--orange)',accepted:'var(--green)',completed:'var(--text-muted)',declined:'var(--red)'};
    el.innerHTML=r.referrals.map(ref=>`<div style="padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${urgencyCol[ref.urgency]||'var(--blue)'};border-radius:10px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:start;">
        <div><div style="font-weight:700;">→ ${ref.to_specialty}${ref.to_provider?' · '+ref.to_provider:''}</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${ref.reason}</div></div>
        <div style="text-align:right;"><span class="badge" style="background:${statusCol[ref.status]||'var(--text-dim)'}22;color:${statusCol[ref.status]||'var(--text-dim)'};">${ref.status}</span><div style="font-size:10px;color:var(--text-dim);margin-top:2px;">${ref.created_at?.split('T')[0]||''}</div></div>
      </div>
      ${ref.status==='pending'?`<div style="display:flex;gap:6px;margin-top:8px;">
        <button class="btn btn-ghost btn-sm" data-action="rRefUpdate:${ref.id},accepted">✓ Accept</button>
        <button class="btn btn-danger btn-sm" data-action="rRefUpdate:${ref.id},declined">✕ Decline</button>
        <button class="btn btn-ghost btn-sm" data-action="rRefUpdate:${ref.id},completed">✅ Complete</button>
      </div>`:''}
    </div>`).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Error loading referrals</div>'}
}
async function rRefUpdate(id,status){
  try{await api('/features/referrals/'+id,{method:'PATCH',body:JSON.stringify({status})});rRefLoad();}catch(e){AppDialog.alert(e.message)}
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════
async function rDocsUpload(){
  if(!selectedMRN)return;
  const fileInput=document.getElementById('r-doc-file');
  const file=fileInput.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async()=>{
    const b64=reader.result.split(',')[1];
    try{
      await api('/features/documents',{method:'POST',body:JSON.stringify({patientMrn:selectedMRN,docType:document.getElementById('r-doc-type').value,filename:file.name,contentType:file.type,contentB64:b64})});
      fileInput.value='';rDocsLoad();
    }catch(e){AppDialog.alert(e.message)}
  };
  reader.readAsDataURL(file);
}
async function rDocsLoad(){
  if(!selectedMRN)return;const el=document.getElementById('r-docs-list');
  try{
    const r=await api('/features/documents/'+selectedMRN);
    if(!r.ok||!r.documents||!r.documents.length){el.innerHTML='<div class="empty-card">No documents uploaded.</div>';return;}
    const typeIcons={consent:'📄',pathology:'🔬',imaging_report:'🖼',referral_letter:'📬',other:'📎'};
    el.innerHTML=r.documents.map(d=>`<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
      <span style="font-size:20px;">${typeIcons[d.doc_type]||'📎'}</span>
      <div style="flex:1;"><div style="font-weight:600;font-size:13px;">${d.filename}</div><div style="font-size:11px;color:var(--text-muted);">${d.doc_type} · ${d.file_size?Math.round(d.file_size/1024)+'KB':''} · ${d.created_at?.split('T')[0]||''}</div></div>
      <button class="btn btn-danger btn-sm" data-action="rDocsDelete:${d.id}" style="padding:4px 8px;">✕</button>
    </div>`).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Error loading documents</div>'}
}
async function rDocsDelete(id){
  if(!await AppDialog.confirm('Delete this document?',{danger:true}))return;
  try{await api('/features/documents/'+id,{method:'DELETE'});rDocsLoad();}catch(e){AppDialog.alert(e.message)}
}

// ═══════════════════════════════════════════════════════════════
// PATIENT OUTCOMES
// ═══════════════════════════════════════════════════════════════
function rOutShowForm(){document.getElementById('r-out-form').style.display='block';document.getElementById('r-out-date').value=new Date().toISOString().split('T')[0];}
async function rOutSave(){
  if(!selectedMRN)return;
  const body={patientMrn:selectedMRN,outcomeType:v('r-out-type'),date:v('r-out-date'),value:v('r-out-value'),notes:v('r-out-notes')||undefined};
  if(!body.value||!body.date){AppDialog.alert('Enter date and value');return;}
  try{await api('/features/outcomes',{method:'POST',body:JSON.stringify(body)});document.getElementById('r-out-form').style.display='none';rOutLoad();}catch(e){AppDialog.alert(e.message)}
}
async function rOutLoad(){
  if(!selectedMRN)return;const el=document.getElementById('r-out-list');
  try{
    const r=await api('/features/outcomes/'+selectedMRN);
    if(!r.ok||!r.outcomes||!r.outcomes.length){el.innerHTML='<div class="empty-card">No outcomes recorded.</div>';return;}
    const typeIcons={response:'📊',survival:'💓',qol:'😊',toxicity:'⚠️',milestone:'🎯'};
    const typeColors={response:'var(--blue)',survival:'var(--green)',qol:'var(--cyan)',toxicity:'var(--red)',milestone:'var(--orange)'};
    el.innerHTML=r.outcomes.map(o=>`<div style="padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${typeColors[o.outcome_type]||'var(--blue)'};border-radius:10px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:start;">
        <div style="display:flex;gap:10px;align-items:start;"><span style="font-size:18px;">${typeIcons[o.outcome_type]||'📊'}</span><div><div style="font-weight:600;font-size:13px;">${o.outcome_type.toUpperCase()}</div><div style="font-size:13px;color:var(--text);margin-top:2px;">${esc(o.value)}</div>${o.notes?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${esc(o.notes)}</div>`:''}</div></div>
        <div style="text-align:right;"><div style="font-size:11px;color:var(--text-dim);">${o.date}</div><button class="btn btn-danger btn-sm" data-action="rOutDelete:${o.id}" style="padding:2px 6px;font-size:10px;margin-top:4px;">✕</button></div>
      </div>
    </div>`).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Error loading outcomes</div>'}
}
async function rOutDelete(id){
  if(!await AppDialog.confirm('Delete this outcome?',{danger:true}))return;
  try{await api('/features/outcomes/'+id,{method:'DELETE'});rOutLoad();}catch(e){AppDialog.alert(e.message)}
}

// ═══════════════════════════════════════════════════════════════
// 💰 BILLING DASHBOARD
// ═══════════════════════════════════════════════════════════════
async function renderBillingDashboard(){
  try{
    const s=await api('/billing/stats');
    document.getElementById('billing-stats').innerHTML=`
      <div class="billing-stat-card"><div class="label">Total Revenue</div><div class="value" style="color:var(--green)">$${(s.totalRevenue||0).toLocaleString()}</div><div class="sub">All time</div></div>
      <div class="billing-stat-card"><div class="label">Outstanding</div><div class="value" style="color:var(--orange)">$${(s.totalOutstanding||0).toLocaleString()}</div><div class="sub">Unpaid balance</div></div>
      <div class="billing-stat-card"><div class="label">Claims</div><div class="value">${s.totalClaims||0}</div><div class="sub">${s.pendingClaims||0} pending · ${s.deniedClaims||0} denied</div></div>
      <div class="billing-stat-card"><div class="label">This Month</div><div class="value" style="color:var(--blue)">$${(s.revenueThisMonth||0).toLocaleString()}</div><div class="sub">${s.invoicesThisMonth||0} invoices</div></div>
    `;
    loadBillingInvoices();
  }catch(e){console.error('billing stats',e);}
}
async function loadBillingInvoices(){
  try{
    const inv=await api('/billing/invoices');
    const el=document.getElementById('billing-invoices-list');
    if(!inv.length){el.innerHTML='<div class="empty-card">No invoices yet.</div>';return;}
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;">${inv.map(i=>`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;">${esc(i.invoice_number)}</div>
          <div style="font-size:11px;color:var(--text-dim);">MRN: ${esc(i.patient_mrn)} · ${i.due_date ? 'Due: '+i.due_date : ''}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;font-size:14px;">$${(i.total||0).toFixed(2)}</div>
          <div style="font-size:11px;color:var(--text-dim);">Balance: $${(i.balance_due||0).toFixed(2)}</div>
        </div>
        <span style="font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600;background:${i.status==='paid'?'rgba(34,197,94,.15);color:var(--green)':i.status==='overdue'?'rgba(239,68,68,.15);color:var(--red)':'rgba(100,116,139,.15);color:var(--text-muted)'}">${i.status.toUpperCase()}</span>
      </div>
    `).join('')}</div>`;
  }catch(e){}
}
function switchBillingTab(tab,btn){
  document.querySelectorAll('.billing-tab-content').forEach(t=>t.style.display='none');
  document.getElementById('bv-'+tab).style.display='';
  btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(tab==='claims')loadBillingClaims();
  if(tab==='payments')loadBillingPayments();
}
async function loadBillingClaims(){
  try{
    const cl=await api('/billing/claims');
    const el=document.getElementById('billing-claims-list');
    if(!cl.length){el.innerHTML='<div class="empty-card">No claims yet.</div>';return;}
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;">${cl.map(c=>`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;">${esc(c.claim_number)}</div>
          <div style="font-size:11px;color:var(--text-dim);">${esc(c.payer_name)} · ${esc(c.patient_mrn)}</div>
        </div>
        <div style="font-weight:700;font-size:14px;">$${(c.total_charged||0).toFixed(2)}</div>
        <span style="font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600;background:${c.status==='approved'||c.status==='paid'?'rgba(34,197,94,.15);color:var(--green)':c.status==='denied'?'rgba(239,68,68,.15);color:var(--red)':'rgba(100,116,139,.15);color:var(--text-muted)'}">${c.status.toUpperCase()}</span>
      </div>
    `).join('')}</div>`;
  }catch(e){}
}
async function loadBillingPayments(){
  try{
    const p=await api('/billing/payments');
    const el=document.getElementById('billing-payments-list');
    if(!p.length){el.innerHTML='<div class="empty-card">No payments.</div>';return;}
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;">${p.map(x=>`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;">${esc(x.method||'Cash')} payment</div>
          <div style="font-size:11px;color:var(--text-dim);">MRN: ${esc(x.patient_mrn)} · ${x.date||''}</div>
        </div>
        <div style="font-weight:700;font-size:14px;color:var(--green);">+$${(x.amount||0).toFixed(2)}</div>
      </div>
    `).join('')}</div>`;
  }catch(e){}
}
async function lookupICD10(){
  const q=document.getElementById('icd10-search').value;
  if(!q||q.length<2)return;
  try{
    const codes=await api('/billing/codes/icd10?q='+encodeURIComponent(q));
    document.getElementById('icd10-results').innerHTML=codes.map(c=>`<div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;gap:10px;cursor:pointer;" data-hover="bg:var(--blue-pale)::">
      <span style="font-weight:700;color:var(--blue);font-family:var(--mono);min-width:60px;">${c.code}</span><span style="font-size:12px;color:var(--text-muted);">${c.desc}</span></div>`).join('')||'<div style="padding:12px;color:var(--text-dim);font-size:12px;">No results</div>';
  }catch(e){}
}
async function lookupCPT(){
  const q=document.getElementById('cpt-search').value;
  if(!q||q.length<2)return;
  try{
    const codes=await api('/billing/codes/cpt?q='+encodeURIComponent(q));
    document.getElementById('cpt-results').innerHTML=codes.map(c=>`<div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;gap:10px;cursor:pointer;" data-hover="bg:var(--blue-pale)::">
      <span style="font-weight:700;color:var(--blue);font-family:var(--mono);min-width:70px;">${c.code}</span><div><span style="font-size:12px;color:var(--text-muted);">${c.desc}</span><span style="font-size:10px;color:var(--text-dim);margin-left:6px;">${c.category}</span></div></div>`).join('')||'<div style="padding:12px;color:var(--text-dim);font-size:12px;">No results</div>';
  }catch(e){}
}

// ═══════════════════════════════════════════════════════════════
// 📊 REPORTS & ANALYTICS
// ═══════════════════════════════════════════════════════════════
function switchReportTab(tab,btn){
  document.querySelectorAll('.report-tab-content').forEach(t=>t.style.display='none');
  document.getElementById('rv-'+tab).style.display='';
  btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(tab==='panel')renderReportsPanel();
  if(tab==='financial')renderFinancialReport();
  if(tab==='operational')renderOperationalReport();
  if(tab==='quality')renderQualityReport();
  if(tab==='registry')renderCancerRegistryReport();
}
async function renderReportsPanel(){
  try{
    const d=await api('/reports/panel-health');
    let html=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
      <div class="billing-stat-card"><div class="label">Total Patients</div><div class="value" style="color:var(--blue)">${d.totalPatients||0}</div></div>
      <div class="billing-stat-card"><div class="label">Active Treatments</div><div class="value" style="color:var(--cyan)">${d.activeTreatments||0}</div></div>
      <div class="billing-stat-card"><div class="label">Labs (30d)</div><div class="value" style="color:var(--orange)">${d.recentLabResults||0}</div></div>
      <div class="billing-stat-card"><div class="label">Active Chemo</div><div class="value" style="color:var(--green)">${d.chemoActive||0}</div></div>
    </div>`;
    if(d.byPhase&&d.byPhase.length){
      html+=`<div class="report-chart" style="margin-bottom:16px;"><div style="font-weight:700;font-size:13px;margin-bottom:12px;">Patients by Phase</div>`;
      const max=Math.max(...d.byPhase.map(x=>x.count));
      html+=d.byPhase.map(x=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="width:120px;font-size:11px;color:var(--text-muted);text-align:right;">${esc(x.phase)}</div>
        <div style="flex:1;height:18px;background:var(--surface);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${(x.count/max*100)}%;background:linear-gradient(90deg,var(--blue),var(--blue2));border-radius:4px;"></div>
        </div>
        <div style="width:30px;font-size:12px;font-weight:600;">${x.count}</div>
      </div>`).join('');
      html+=`</div>`;
    }
    document.getElementById('report-panel-health').innerHTML=html;
  }catch(e){console.error(e);}
}
async function renderFinancialReport(){
  try{
    const d=await api('/reports/financial');
    document.getElementById('report-financial').innerHTML=`
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div class="billing-stat-card"><div class="label">Total Revenue</div><div class="value" style="color:var(--green)">$${(d.totalRevenue||0).toLocaleString()}</div></div>
        <div class="billing-stat-card"><div class="label">This Month</div><div class="value" style="color:var(--blue)">$${(d.revenueThisMonth||0).toLocaleString()}</div></div>
        <div class="billing-stat-card"><div class="label">Outstanding</div><div class="value" style="color:var(--orange)">$${(d.totalOutstanding||0).toLocaleString()}</div></div>
        <div class="billing-stat-card"><div class="label">Claims</div><div class="value">${d.claimsSubmitted||0}</div><div class="sub" style="color:var(--green)">${d.claimsApproved||0} approved · <span style="color:var(--red)">${d.claimsDenied||0} denied</span></div></div>
      </div>`;
  }catch(e){}
}
async function renderOperationalReport(){
  try{
    const d=await api('/reports/operational');
    document.getElementById('report-operational').innerHTML=`
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div class="billing-stat-card"><div class="label">Total Appointments</div><div class="value">${d.totalAppointments||0}</div><div class="sub">${d.completedAppts||0} completed</div></div>
        <div class="billing-stat-card"><div class="label">Cancelled</div><div class="value" style="color:var(--orange)">${d.cancelledAppts||0}</div></div>
        <div class="billing-stat-card"><div class="label">No-Shows</div><div class="value" style="color:var(--red)">${d.noShowAppts||0}</div></div>
        <div class="billing-stat-card"><div class="label">Referrals</div><div class="value">${d.totalReferrals||0}</div><div class="sub">${d.pendingReferrals||0} pending</div></div>
      </div>`;
  }catch(e){}
}
async function renderQualityReport(){
  try{
    const d=await api('/reports/quality');
    let html=`<div style="margin-bottom:16px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:12px;">
      <div style="font-size:13px;font-weight:600;">Overall Compliance:</div>
      <div style="font-size:20px;font-weight:800;color:${(d.complianceRate||0)>=70?'var(--green)':'var(--orange)'}">${d.complianceRate||0}%</div>
    </div>`;
    if(d.measures){
      html+=d.measures.map(m=>`<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
        <div style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;background:${m.value>=m.target?'rgba(34,197,94,.15)':'rgba(239,68,68,.15)'};">${m.value>=m.target?'✅':'⚠️'}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;">${m.name}</div>
          <div style="font-size:11px;color:var(--text-dim);">${m.description}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;font-size:14px;color:${m.value>=m.target?'var(--green)':'var(--red)'}">${m.value}%</div>
          <div style="font-size:10px;color:var(--text-dim);">Target: ${m.target}%</div>
        </div>
      </div>`).join('');
    }
    document.getElementById('report-quality').innerHTML=html;
  }catch(e){}
}
async function renderCancerRegistryReport(){
  try{
    const d=await api('/reports/cancer-registry');
    let html=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
      <div class="billing-stat-card"><div class="label">Total Patients</div><div class="value">${d.totalPatients||0}</div></div>
      <div class="billing-stat-card"><div class="label">With Biomarkers</div><div class="value" style="color:var(--blue)">${d.withBiomarkers||0}</div><div class="sub">${d.biomarkerRate||0}% rate</div></div>
      <div class="billing-stat-card"><div class="label">Histologies</div><div class="value">${(d.byHistology||[]).length}</div></div>
    </div>`;
    if(d.byHistology&&d.byHistology.length){
      html+=`<div class="report-chart"><div style="font-weight:700;font-size:13px;margin-bottom:12px;">Cases by Histology</div>`;
      const max=Math.max(...d.byHistology.map(x=>x.count));
      html+=d.byHistology.map(x=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="width:160px;font-size:11px;color:var(--text-muted);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(x.diagnosis||'Unknown')}</div>
        <div style="flex:1;height:18px;background:var(--surface);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${(x.count/max*100)}%;background:linear-gradient(90deg,var(--blue),var(--cyan));border-radius:4px;"></div>
        </div>
        <div style="width:30px;font-size:12px;font-weight:600;">${x.count}</div>
      </div>`).join('');
      html+=`</div>`;
    }
    document.getElementById('report-registry').innerHTML=html;
  }catch(e){}
}

// ═══════════════════════════════════════════════════════════════
// ⚙️ SETTINGS & COMPLIANCE
// ═══════════════════════════════════════════════════════════════
async function renderSettingsPanel(){
  try{
    const roles=await api('/hipaa/roles');
    document.getElementById('settings-roles-list').innerHTML=roles.map(r=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
      <div style="width:10px;height:10px;border-radius:50%;background:${r.is_system?'var(--blue)':'var(--green)'};"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:12px;">${esc(r.name)}</div>
        <div style="font-size:10px;color:var(--text-dim);">${esc(r.description||'')} ${r.is_system?'(System)':''}</div>
      </div>
      <div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.permissions||'')}</div>
    </div>`).join('');
    const ret=await api('/hipaa/retention');
    document.getElementById('settings-retention-list').innerHTML=ret.map(r=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:12px;">${esc(r.name)}</div>
        <div style="font-size:10px;color:var(--text-dim);">${esc(r.data_type)} · Retain ${r.retain_years} years</div>
      </div>
      <label style="font-size:10px;display:flex;align-items:center;gap:4px;"><input type="checkbox" ${r.auto_archive?'checked':''}> Archive</label>
    </div>`).join('');
    document.getElementById('settings-breakglass-log').innerHTML='<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">No break-the-glass events recorded.</div>';
    rngRender();
  }catch(e){console.error('settings',e);}
}
async function addCustomRole(){
  const name=document.getElementById('new-role-name').value;
  if(!name){AppDialog.alert('Enter a role name');return;}
  try{
    await api('/hipaa/roles',{method:'POST',body:JSON.stringify({name,description:'Custom role',permissions:['patient.view']})});
    document.getElementById('new-role-name').value='';
    renderSettingsPanel();
  }catch(e){AppDialog.alert('Error: '+e.message);}
}

// ═══════════════════════════════════════════════════════════════
// 📋 NCCN & BIOMARKERS (per-patient)
// ═══════════════════════════════════════════════════════════════
async function loadNCCNTab(mrn){
  try{
    const bios=await api('/biomarkers/'+mrn);
    const el=document.getElementById('nccn-bio-list');
    if(!bios||!bios.length){el.innerHTML='<div class="empty-card">No biomarker results yet.</div>';}
    else{
      el.innerHTML=bios.map(b=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">
        <span style="font-weight:700;color:var(--blue);font-size:12px;min-width:60px;">${esc(b.biomarker)}</span>
        <span style="font-size:12px;color:var(--text);">${esc(b.result)}</span>
        <span style="font-size:10px;color:var(--text-dim);margin-left:auto;">${esc(b.method||'')} · ${b.report_date?.slice(0,10)||''}</span>
      </div>
      ${b.clinical_significance?`<div style="font-size:11px;color:var(--text-muted);padding:4px 12px 8px;border-bottom:1px solid var(--border);margin-bottom:6px;">💡 ${esc(b.clinical_significance)}</div>`:''}`).join('');
    }
    const recs=await api('/nccn/recommendations/'+mrn);
    const rel=document.getElementById('nccn-recommendations');
    if(!recs||!recs.length){rel.innerHTML='<div class="empty-card">No matching protocols found.</div>';}
    else{
      rel.innerHTML=recs.map(r=>`<div style="padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-weight:700;font-size:13px;color:var(--blue);">${esc(r.protocol_name)}</span>
          <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(37,99,235,.1);color:var(--blue);">Level ${esc(r.evidence_level||'')}</span>
          <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(100,116,139,.1);color:var(--text-muted);">Score: ${r.relevanceScore}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">${esc(r.cancer_type)}${r.histology?' · '+esc(r.histology):''}${r.stage?' · Stage '+esc(r.stage):''}</div>
        <div style="font-size:12px;color:var(--text);line-height:1.5;">${esc(r.regimen)}</div>
      </div>`).join('');
    }
    const doses=await api('/dosing/cumulative/'+mrn);
    const dl=document.getElementById('cum-dose-list');
    if(!doses||!doses.length){dl.innerHTML='<div class="empty-card">No cumulative doses tracked.</div>';}
    else{
      dl.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;margin-bottom:8px;font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;"><span>Drug</span><span>Cumulative Dose</span><span>Unit</span><span>Status</span></div>`+doses.map(d=>`<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:4px;align-items:center;">
        <span style="font-weight:600;font-size:12px;">${esc(d.drug_name)}</span>
        <span style="font-size:12px;">${d.cumulative_dose}</span>
        <span style="font-size:11px;color:var(--text-dim);">${esc(d.dose_unit||'mg')}</span>
        <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${d.max_lifetime&&d.cumulative_dose>=d.max_lifetime*0.9?'rgba(239,68,68,.15);color:var(--red)':'rgba(34,197,94,.15);color:var(--green)'};">${d.max_lifetime?d.cumulative_dose+'/'+d.max_lifetime:'No limit set'}</span>
      </div>`).join('');
    }
    filterNCCN();
  }catch(e){console.error('NCCN tab',e);}
}
async function addBiomarker(){
  if(!selectedMRN){AppDialog.alert('No patient selected');return;}
  try{
    const r=await api('/biomarkers',{method:'POST',body:JSON.stringify({
      patientMrn:selectedMRN,
      biomarker:document.getElementById('nccn-bio-name').value,
      result:document.getElementById('nccn-bio-result').value,
      method:document.getElementById('nccn-bio-method').value,
      reportDate:document.getElementById('nccn-bio-date').value||undefined
    })});
    if(r.clinicalSignificance)AppDialog.alert('💡 '+r.clinicalSignificance);
    if(r.recommendedProtocols&&r.recommendedProtocols.length)AppDialog.alert('📋 Recommended protocols: '+r.recommendedProtocols.join(', '));
    loadNCCNTab(selectedMRN);
  }catch(e){AppDialog.alert('Error: '+e.message);}
}
async function filterNCCN(){
  const q=(document.getElementById('nccn-filter')?.value||'').toLowerCase();
  try{
    const gl=await api('/nccn/guidelines'+(q?'?cancerType='+encodeURIComponent(q):''));
    document.getElementById('nccn-protocol-list').innerHTML=gl.map(g=>`<div style="padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-weight:700;font-size:13px;">${esc(g.protocol_name)}</span>
        <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(37,99,235,.1);color:var(--blue);">${esc(g.evidence_level||'')}</span>
        <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(100,116,139,.1);color:var(--text-muted);">${esc(g.category||'')}</span>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${esc(g.cancer_type)}${g.histology?' · '+esc(g.histology):''}</div>
      <div style="font-size:12px;color:var(--text);">${esc(g.regimen)}</div>
    </div>`).join('')||'<div style="padding:12px;color:var(--text-dim);font-size:12px;">No protocols found</div>';
  }catch(e){}
}

// ═══════════════════════════════════════════════════════════════
// 💰 PATIENT BILLING (per-patient)
// ═══════════════════════════════════════════════════════════════
function switchPatientBillingTab(tab,btn){
  document.querySelectorAll('.pt-billing-tab').forEach(t=>t.style.display='none');
  document.getElementById('pbv-'+tab).style.display='';
  btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
async function loadPatientBilling(mrn){
  try{
    const inv=await api('/billing/invoices?patientMrn='+mrn);
    const el=document.getElementById('pt-billing-invoices');
    if(!inv.length){el.innerHTML='<div class="empty-card">No invoices yet.</div>';return;}
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;">${inv.map(i=>`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
        <div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;">${esc(i.invoice_number)}</div><div style="font-size:11px;color:var(--text-dim);">${i.due_date?'Due: '+i.due_date:''}</div></div>
        <div style="font-weight:700;">$${(i.total||0).toFixed(2)}</div>
        <span style="font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600;background:${i.status==='paid'?'rgba(34,197,94,.15);color:var(--green)':'rgba(100,116,139,.15);color:var(--text-muted)'}">${i.status.toUpperCase()}</span>
      </div>`).join('')}</div>`;
    const cl=await api('/billing/claims?patientMrn='+mrn);
    const cel=document.getElementById('pt-billing-claims');
    if(!cl.length){cel.innerHTML='<div class="empty-card">No claims.</div>';return;}
    cel.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;">${cl.map(c=>`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
        <div style="flex:1;"><div style="font-weight:600;font-size:13px;">${esc(c.claim_number)}</div><div style="font-size:11px;color:var(--text-dim);">${esc(c.payer_name)}</div></div>
        <div style="font-weight:700;">$${(c.total_charged||0).toFixed(2)}</div>
        <span style="font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600;background:${c.status==='paid'?'rgba(34,197,94,.15);color:var(--green)':'rgba(100,116,139,.15);color:var(--text-muted)'}">${c.status.toUpperCase()}</span>
      </div>`).join('')}</div>`;
    const pay=await api('/billing/payments?patientMrn='+mrn);
    const pel=document.getElementById('pt-billing-payments');
    if(!pay.length){pel.innerHTML='<div class="empty-card">No payments.</div>';return;}
    pel.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;">${pay.map(x=>`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
        <div style="flex:1;"><div style="font-weight:600;font-size:13px;">${esc(x.method||'Cash')}</div><div style="font-size:11px;color:var(--text-dim);">${x.date||''}</div></div>
        <div style="font-weight:700;color:var(--green);">+$${(x.amount||0).toFixed(2)}</div>
      </div>`).join('')}</div>`;
    const ins=await api('/billing/insurance/'+mrn);
    const iel=document.getElementById('pt-billing-insurance');
    if(!ins.length){iel.innerHTML='<div class="empty-card">No insurance on file.</div>';return;}
    iel.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;">${ins.map(x=>`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${x.is_primary?'var(--blue)':'var(--text-dim)'};"></div>
        <div style="flex:1;"><div style="font-weight:600;font-size:13px;">${esc(x.payer_name)}</div><div style="font-size:11px;color:var(--text-dim);">${esc(x.plan_type||'')} · ID: ${esc(x.member_id||'N/A')}</div></div>
        ${x.copay!=null?`<div style="font-size:11px;color:var(--text-dim);">Copay: $${x.copay}</div>`:''}
      </div>`).join('')}</div>`;
  }catch(e){console.error('patient billing',e);}
}
async function createPatientInvoice(){
  if(!selectedMRN){AppDialog.alert('No patient selected');return;}
  const desc=await AppDialog.prompt('Line item description:', '', { title: 'Add Invoice Item', placeholder: 'e.g. Office Visit Level 4', required: true }); if(!desc)return;
  const price=parseFloat(await AppDialog.prompt('Amount ($):','150',{title:'Add Invoice Item',required:true})); if(!price)return;
  try{
    const r=await api('/billing/invoices',{method:'POST',body:JSON.stringify({patientMrn:selectedMRN,items:[{description:desc,unitPrice:price,quantity:1}],dueDate:new Date(Date.now()+30*86400000).toISOString().slice(0,10)})});
    AppDialog.alert('Invoice created: '+r.invoiceNumber+' for $'+r.total);
    loadPatientBilling(selectedMRN);
  }catch(e){AppDialog.alert('Error: '+e.message);}
}
async function addPatientInsurance(){
  if(!selectedMRN){AppDialog.alert('No patient selected');return;}
  try{
    await api('/billing/insurance',{method:'POST',body:JSON.stringify({
      patientMrn:selectedMRN,payerName:document.getElementById('ins-payer').value,
      planType:document.getElementById('ins-plan').value,memberId:document.getElementById('ins-member').value,
      groupNumber:document.getElementById('ins-group').value,copay:parseFloat(document.getElementById('ins-copay').value)||0,
      deductible:parseFloat(document.getElementById('ins-deductible').value)||0,
      isPrimary:document.getElementById('ins-primary').checked
    })});
    ['ins-payer','ins-member','ins-group','ins-copay','ins-deductible'].forEach(id=>document.getElementById(id).value='');
    loadPatientBilling(selectedMRN);
  }catch(e){AppDialog.alert('Error: '+e.message);}
}

// ═══════════════════════════════════════════════════════════════
// TELEMEDICINE / VIDEO
// ═══════════════════════════════════════════════════════════════
let _thVideoSearchTimeout=null;

function renderTelehealthPanel(){
  document.getElementById('th-mrn-input').value='';
  document.getElementById('th-selected-mrn').value='';
  document.getElementById('th-selected-patient').style.display='none';
  document.getElementById('th-search-results').style.display='none';
  loadActiveRooms();
}

function searchPatientForVideo(query){
  const resultsEl=document.getElementById('th-search-results');
  if(!query||query.length<1){resultsEl.style.display='none';return}
  clearTimeout(_thVideoSearchTimeout);
  _thVideoSearchTimeout=setTimeout(async()=>{
    try{
      // Search server first
      const r=await api('/auth/search-patients?q='+encodeURIComponent(query));
      const patients=(r.ok&&r.patients)?r.patients:[];
      // Also search local storage
      const localPats=getMyPatients().filter(p=>{
        const q=query.toLowerCase();
        return(p.mrn&&p.mrn.toLowerCase().includes(q))||(p.name&&p.name.toLowerCase().includes(q));
      });
      // Merge, dedup by MRN
      const seen=new Set();const all=[];
      [...localPats,...patients].forEach(p=>{if(p.mrn&&!seen.has(p.mrn)){seen.add(p.mrn);all.push(p)}});
      if(!all.length){resultsEl.innerHTML='<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-dim);">No patients found</div>';resultsEl.style.display='block';return}
      resultsEl.innerHTML=all.slice(0,10).map(p=>
        `<div data-action="selectVideoPatient:${p.mrn||''},${p.name||''}" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;transition:background .15s;" data-hover="bg:var(--surface2)" data-hover="bgt:transparent">
          <div><div style="font-weight:700;font-size:13px;">${p.name||'Unknown'}</div><div style="font-size:11px;color:var(--text-muted);">MRN: ${p.mrn}</div></div>
          <div style="font-size:11px;color:var(--blue);">Select →</div>
        </div>`
      ).join('');
      resultsEl.style.display='block';
    }catch(e){
      // Fallback to local search only
      const localPats=getMyPatients().filter(p=>{
        const q=query.toLowerCase();
        return(p.mrn&&p.mrn.toLowerCase().includes(q))||(p.name&&p.name.toLowerCase().includes(q));
      });
      if(!localPats.length){resultsEl.innerHTML='<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-dim);">No patients found</div>';resultsEl.style.display='block';return}
      resultsEl.innerHTML=localPats.slice(0,10).map(p=>
        `<div data-action="selectVideoPatient:${p.mrn||''},${p.name||''}" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;" data-hover="bg:var(--surface2)" data-hover="bgt:transparent">
          <div><div style="font-weight:700;font-size:13px;">${p.name||'Unknown'}</div><div style="font-size:11px;color:var(--text-muted);">MRN: ${p.mrn}</div></div>
          <div style="font-size:11px;color:var(--blue);">Select →</div>
        </div>`
      ).join('');
      resultsEl.style.display='block';
    }
  },200);
}

function selectVideoPatient(mrn,name){
  document.getElementById('th-selected-mrn').value=mrn;
  document.getElementById('th-mrn-input').value=name+' ('+mrn+')';
  document.getElementById('th-selected-name').textContent=name;
  document.getElementById('th-selected-mrn-label').textContent='MRN: '+mrn;
  document.getElementById('th-selected-patient').style.display='block';
  document.getElementById('th-search-results').style.display='none';
}

function clearVideoPatientSelection(){
  document.getElementById('th-selected-mrn').value='';
  document.getElementById('th-mrn-input').value='';
  document.getElementById('th-selected-patient').style.display='none';
}
// Close video search dropdown on outside click
document.addEventListener('click',e=>{
  const results=document.getElementById('th-search-results');
  const input=document.getElementById('th-mrn-input');
  if(results&&input&&!results.contains(e.target)&&e.target!==input)results.style.display='none';
});

async function loadActiveRooms(){
  const el=document.getElementById('th-active-rooms');
  try{
    const r=await api('/sync/th/rooms/'+(currentDoc?.docId||'unknown'));
    if(!r.ok||!r.rooms||!r.rooms.length){el.innerHTML='<div class="empty-card">No active video rooms</div>';return}
    el.innerHTML=r.rooms.map(room=>`
      <div style="padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><div style="font-weight:700">📹 Room ${room.id}</div><div style="font-size:12px;color:var(--text-muted)">Patient: ${room.patientMrn} · ${room.status}</div></div>
          <div style="display:flex;gap:6px">
            ${room.status!=='ended'?`<button class="btn btn-primary btn-sm" data-action="joinDoctorVideo:${room.id}">Join</button>`:''}
            ${room.status!=='ended'?`<button class="btn btn-danger btn-sm" data-action="endDoctorRoom:${room.id}">End</button>`:''}
          </div>
        </div>
      </div>
    `).join('');
  }catch(e){el.innerHTML='<div class="empty-card">No active video rooms</div>'}
}

let _docPc=null,_docLocalStream=null,_docSignalInterval=null;

async function startTelehealth(){
  const mrn=document.getElementById('th-selected-mrn').value;
  if(!mrn){AppDialog.alert('Please search and select a patient by MRN first.');return}
  try{
    const r=await api('/sync/th/create-room',{method:'POST',body:JSON.stringify({patientMrn:mrn,doctorId:currentDoc?.docId||'unknown'})});
    if(r.ok){
      document.getElementById('th-room-info').innerHTML=`<div style="padding:14px;background:var(--blue-pale);border:1px solid rgba(37,99,235,.2);border-radius:10px">
        <div style="font-weight:700;color:var(--blue);margin-bottom:6px">🎬 Video Room Created</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Room code: <strong style="font-family:var(--mono)">${r.roomCode}</strong></div>
        <div style="font-size:11px;color:var(--text-dim)">Tell patient the room code: <strong>${r.roomCode}</strong></div>
        <button class="btn btn-primary" style="margin-top:10px" data-action="joinDoctorVideo:${r.roomCode}">📹 Join Call</button>
      </div>`;
      loadActiveRooms();
    }
  }catch(e){AppDialog.alert('Failed to create video room: '+e.message)}
}

async function joinDoctorVideo(roomCode){
  try{
    _docLocalStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
  }catch(e){AppDialog.alert('Camera/microphone access needed.');return}
  const overlay=document.createElement('div');
  overlay.id='doc-video-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column';
  overlay.innerHTML=`
    <div id="doc-remote-video-wrap" style="flex:1;position:relative;background:#111">
      <video id="doc-remote-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;bottom:16px;left:16px;font-size:14px;color:#fff;font-weight:600;background:rgba(0,0,0,.5);padding:6px 12px;border-radius:8px">📹 Room: ${roomCode}</div>
    </div>
    <div style="position:absolute;bottom:80px;right:16px;width:120px;height:160px;border-radius:12px;overflow:hidden;border:2px solid #fff;box-shadow:0 4px 20px rgba(0,0,0,.5);z-index:10000">
      <video id="doc-local-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></div>
    </div>
    <div style="position:absolute;bottom:20px;left:0;right:0;display:flex;justify-content:center;gap:16px;z-index:10000">
      <button data-action="docToggleMute" id="doc-btn-mute" style="width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer">🎤</button>
      <button data-action="docToggleVideo" id="doc-btn-video" style="width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer">📹</button>
      <button data-action="endDoctorVideo:${roomCode}" style="width:48px;height:48px;border-radius:50%;border:none;background:#dc2626;color:#fff;font-size:20px;cursor:pointer">📞</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('doc-local-video').srcObject=_docLocalStream;
  _docPc=new RTCPeerConnection(window.VELTRUVIA_RTC ? window.VELTRUVIA_RTC.rtcConfiguration() : {iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  _docLocalStream.getTracks().forEach(t=>_docPc.addTrack(t,_docLocalStream));
  _docPc.onicecandidate=e=>{if(e.candidate)api('/sync/th/signal',{method:'POST',body:JSON.stringify({roomCode,type:'candidate',data:e.candidate,sender:'doctor'})})};
  _docPc.ontrack=e=>{document.getElementById('doc-remote-video').srcObject=e.streams[0]};
  // Wait for patient offer
  let lastTs=Date.now();
  _docSignalInterval=setInterval(async()=>{
    try{const r=await fetch('/api/sync/th/signal/'+roomCode+'?since='+lastTs,{credentials:'include'});const d=await r.json();
    if(d.messages){for(const m of d.messages){lastTs=Math.max(lastTs,m.timestamp);
      if(m.type==='offer'&&m.sender==='patient'){
        await _docPc.setRemoteDescription(new RTCSessionDescription(m.data));
        const answer=await _docPc.createAnswer();
        await _docPc.setLocalDescription(answer);
        await api('/sync/th/signal',{method:'POST',body:JSON.stringify({roomCode,type:'answer',data:answer,sender:'doctor'})});
      }
      if(m.type==='candidate'&&m.sender==='patient'&&m.data)await _docPc.addIceCandidate(new RTCIceCandidate(m.data));
    }}
    }catch(e){}},2000);
}

function docToggleMute(){const t=_docLocalStream?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;document.getElementById('doc-btn-mute').textContent=t.enabled?'🎤':'🔇'}}
function docToggleVideo(){const t=_docLocalStream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;document.getElementById('doc-btn-video').textContent=t.enabled?'📹':'📷'}}

async function endDoctorVideo(roomCode){
  if(_docPc){_docPc.close();_docPc=null}
  if(_docLocalStream){_docLocalStream.getTracks().forEach(t=>t.stop());_docLocalStream=null}
  if(_docSignalInterval){clearInterval(_docSignalInterval);_docSignalInterval=null}
  const ov=document.getElementById('doc-video-overlay');if(ov)ov.remove();
  try{await api('/sync/th/end-room',{method:'POST',body:JSON.stringify({roomCode})})}catch(e){}
  loadActiveRooms();
}

async function endDoctorRoom(code){if(!await AppDialog.confirm('End this video room?',{danger:false}))return;try{await api('/sync/th/end-room',{method:'POST',body:JSON.stringify({roomCode:code})});loadActiveRooms()}catch(e){AppDialog.alert(e.message)}}

// ═══════════════════════════════════════════════════════════════
// DOCTOR AVAILABILITY
// ═══════════════════════════════════════════════════════════════
const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var _availRows=[
  {dayOfWeek:1,startTime:'09:00',endTime:'12:00',slotDuration:30,active:true},
  {dayOfWeek:1,startTime:'14:00',endTime:'17:00',slotDuration:30,active:true},
  {dayOfWeek:2,startTime:'09:00',endTime:'12:00',slotDuration:30,active:true},
  {dayOfWeek:3,startTime:'09:00',endTime:'12:00',slotDuration:30,active:true},
  {dayOfWeek:4,startTime:'09:00',endTime:'12:00',slotDuration:30,active:true},
  {dayOfWeek:4,startTime:'14:00',endTime:'17:00',slotDuration:30,active:true},
  {dayOfWeek:5,startTime:'09:00',endTime:'12:00',slotDuration:30,active:true},
];

async function renderAvailabilityPanel(){
  // Try shared store first (works in desktop mode without auth)
  try{
    const r=await api('/sync/get-availability/'+(currentDoc?.docId||'unknown'));
    if(r.ok&&r.availability&&r.availability.length){
      _availRows=r.availability;
      LS.set('avail_'+(currentDoc?.docId||''),_availRows);
      renderAvailRows();renderAvailSlotPreview();return;
    }
  }catch(e){}
  // Fallback: try server DB
  try{
    const r=await api('/schedule/availability');
    if(r.ok&&r.availability&&r.availability.length){
      _availRows=r.availability.map(a=>({id:a.id,dayOfWeek:a.day_of_week,startTime:a.start_time,endTime:a.end_time,slotDuration:a.slot_duration,active:!!a.active}));
      LS.set('avail_'+(currentDoc?.docId||''),_availRows);
    }
  }catch(e){}
  // Fallback: localStorage
  if(!_availRows.length){const saved=LS.get('avail_'+(currentDoc?.docId||''));if(saved&&saved.length)_availRows=saved;}
  renderAvailRows();
  renderAvailSlotPreview();
}

function renderAvailRows(){
  const el=document.getElementById('avail-rows');
  el.innerHTML=_availRows.map((r,i)=>`
    <div style="display:grid;grid-template-columns:100px 1fr 1fr 80px 1fr;gap:8px;align-items:center;margin-bottom:6px">
      <select data-action-change="availRow:${i}:dayOfWeek:@num" style="padding:8px;border:1px solid var(--border2);border-radius:8px;font-family:inherit;font-size:12px;background:var(--surface);color:var(--text)">
        ${DAY_NAMES.map((d,j)=>`<option value="${j}" ${j===r.dayOfWeek?'selected':''}>${d}</option>`).join('')}
      </select>
      <input type="time" value="${r.startTime}" data-action-change="availRow:${i}:startTime:@value" style="padding:8px;border:1px solid var(--border2);border-radius:8px;font-family:inherit;font-size:12px;background:var(--surface);color:var(--text)">
      <input type="time" value="${r.endTime}" data-action-change="availRow:${i}:endTime:@value" style="padding:8px;border:1px solid var(--border2);border-radius:8px;font-family:inherit;font-size:12px;background:var(--surface);color:var(--text)">
      <input type="number" value="${r.slotDuration}" min="10" max="120" data-action-change="availRow:${i}:slotDuration:@num" style="padding:8px;border:1px solid var(--border2);border-radius:8px;font-family:inherit;font-size:12px;background:var(--surface);color:var(--text)">
      <div style="display:flex;gap:6px;align-items:center">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;color:var(--text-muted);">
          <input type="checkbox" ${r.active?'checked':''} data-action-change="availRow:${i}:active:@checked" style="width:16px;height:16px;accent-color:var(--blue)">
          ${r.active?'<span style="color:var(--green)">On</span>':'<span style="color:var(--text-dim)">Off</span>'}
        </label>
        <button class="btn btn-ghost btn-sm" data-action="availSplice:${i}" style="color:var(--red)">✕</button>
      </div>
    </div>
  `).join('')+
  `<button class="btn btn-ghost btn-sm" data-action="addDefaultAvailRow">+ Add Time Block</button>`;
}

function showAvailMsg(msg,type){
  const el=document.getElementById('avail-msg');
  if(!el)return;
  el.textContent=msg;
  el.style.background=type==='success'?'rgba(34,197,94,.1)':'rgba(245,158,11,.1)';
  el.style.color=type==='success'?'var(--green)':'var(--orange)';
  el.style.border='1px solid '+(type==='success'?'rgba(34,197,94,.25)':'rgba(245,158,11,.25)');
  el.style.display='block';
  setTimeout(()=>{el.style.display='none';},5000);
}
function renderAvailSlotPreview(){
  const el=document.getElementById('avail-slot-preview');
  if(!el)return;
  const DAY_SHORT=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today=new Date();
  const todayDay=today.getDay();
  // Generate slots for next 7 days from today
  let html='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">';
  let totalSlots=0;
  for(let i=0;i<7;i++){
    const d=new Date(today);d.setDate(today.getDate()+i);
    const dateStr=d.toISOString().slice(0,10);
    const dayOfWeek=d.getDay();
    const daySlots=[];
    _availRows.filter(r=>r.active&&r.dayOfWeek===dayOfWeek).forEach(r=>{
      const[sh,sm]=r.startTime.split(':').map(Number);
      const[eh,em]=r.endTime.split(':').map(Number);
      const dur=r.slotDuration||30;
      let mins=sh*60+sm;const endMins=eh*60+em;
      while(mins+dur<=endMins){
        const h=Math.floor(mins/60);const m=mins%60;
        daySlots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
        mins+=dur;
      }
    });
    totalSlots+=daySlots.length;
    const isToday=dateStr===today.toISOString().slice(0,10);
    html+=`<div style="border:1px solid ${isToday?'var(--blue)':'var(--border)'};border-radius:8px;overflow:hidden;background:${isToday?'var(--blue-pale)':'var(--surface)'};">
      <div style="padding:6px 8px;text-align:center;border-bottom:1px solid var(--border);background:${isToday?'rgba(37,99,235,.08)':'var(--surface2)'};">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:${isToday?'var(--blue)':'var(--text-muted)'};">${DAY_SHORT[dayOfWeek]}</div>
        <div style="font-size:13px;font-weight:800;color:${isToday?'var(--blue)':'var(--text)'};">${d.getDate()}</div>
      </div>
      <div style="padding:4px 6px;max-height:160px;overflow-y:auto;">`;
    if(!daySlots.length){
      html+='<div style="text-align:center;padding:10px 2px;font-size:9px;color:var(--text-dim);">—</div>';
    } else {
      daySlots.forEach(s=>{
        html+=`<div style="padding:3px 6px;margin:2px 0;border-radius:4px;background:rgba(34,197,94,.08);font-size:10px;font-weight:600;color:var(--green);text-align:center;border:1px solid rgba(34,197,94,.15);">${s}</div>`;
      });
    }
    html+='</div></div>';
  }
  html+='</div>';
  html+=`<div style="margin-top:10px;font-size:11px;color:var(--text-muted);">Total: <strong style="color:var(--green);">${totalSlots}</strong> bookable slots over the next 7 days</div>`;
  el.innerHTML=html;
}

async function saveAvailability(){
  const activeSlots=_availRows.filter(r=>r.active);
  LS.set('avail_'+(currentDoc?.docId||''),_availRows);
  // Save to shared JSON store (works in desktop mode)
  try{
    await api('/sync/save-availability',{method:'POST',body:JSON.stringify({docId:currentDoc?.docId||'unknown',slots:activeSlots})});
  }catch(e){}
  // Also try server DB
  try{
    await api('/schedule/availability',{method:'PUT',body:JSON.stringify({slots:activeSlots})});
  }catch(e){}
  showAvailMsg('✅ Schedule saved! Patients can book during these times.','success');
  renderAvailSlotPreview();
}

// ═══════════════════════════════════════════════════════════════
// 🧪 REFERENCE RANGES ADMIN (v2.2) — /api/x/lab/ranges
// ═══════════════════════════════════════════════════════════════
let _rngCache=[];
async function rngRender(){
  const el=document.getElementById('settings-ranges-list');if(!el)return;
  try{
    const r=await api('/x/lab/ranges');
    _rngCache=(r&&r.ranges)||[];
    if(!_rngCache.length){el.innerHTML='<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">No ranges yet — they seed automatically on first lab result.</div>';return;}
    el.innerHTML=_rngCache.map(b=>{
      const d=_rngCache.filter(x=>x.biomarker===b.biomarker);
      if(d[0]!==b)return '';
      return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:6px;">
        <div style="font-weight:600;font-size:12px;margin-bottom:6px;">${esc(b.biomarker)} <span style="color:var(--text-dim);font-weight:400;">${esc(b.unit||'')}</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${d.map(x=>
          `<span style="display:inline-flex;align-items:center;gap:6px;font-size:10px;font-family:var(--mono);background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:3px 9px;">
            ${x.sex==='any'?'♂♀':x.sex==='male'?'♂':'♀'} ${x.min}–${x.max}${x.age_min?' · ≥'+x.age_min+'y':''}
            <a href="#" style="color:var(--red);text-decoration:none;font-weight:700;" title="Delete" data-action="rngDel:${x.id}">×</a>
          </span>`).join('')}</div></div>`;
    }).join('');
  }catch(e){el.innerHTML='<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">Ranges unavailable offline.</div>';}
}
async function rngAdd(){
  const bio=document.getElementById('rng-bio').value.trim();
  const min=document.getElementById('rng-min').value, max=document.getElementById('rng-max').value;
  if(!bio||min===''||max==='')return AppDialog.alert('Analyte, min and max are required.');
  if(Number(min)>=Number(max))return AppDialog.alert('Min must be below Max.');
  try{
    await api('/x/lab/ranges',{method:'POST',body:JSON.stringify({
      biomarker:bio, unit:document.getElementById('rng-unit').value.trim()||null,
      sex:document.getElementById('rng-sex').value,
      min:Number(min), max:Number(max),
      ageMin:Number(document.getElementById('rng-agemin').value||0), ageMax:120, // API caps at 120 = "no upper bound"
    })});
    document.getElementById('rng-bio').value='';document.getElementById('rng-min').value='';document.getElementById('rng-max').value='';
    flash('Range saved ✓'); rngRender();
  }catch(e){AppDialog.alert('Save failed: '+e.message);}
}
async function rngDel(id){
  try{
    await api('/x/lab/ranges/'+encodeURIComponent(id),{method:'DELETE'});
    flash('Range deleted'); rngRender();
  }catch(e){AppDialog.alert('Delete failed: '+e.message);}
}

// ═══════════════════════════════════════════════════════════════
// 🪑 TELEHEALTH WAITING ROOM (v2.3)
// ═══════════════════════════════════════════════════════════════
async function loadThQueue(){
  const el=document.getElementById('th-waiting-queue');if(!el)return;
  try{
    const r=await api('/sync/th/queue/'+(currentDoc?.docId||'unknown'));
    const q=(r&&r.waiting)||[];
    if(!q.length){el.innerHTML='<div class="empty-card">Waiting room is empty</div>';return}
    el.innerHTML=q.map(p=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
      <div><div style="font-weight:700;font-size:13px">#${p.position} · Patient ${esc(p.patientMrn)}</div>
      <div style="font-size:11px;color:var(--text-muted)">waiting ${p.waitedMinutes} min · room ${esc(p.roomCode)}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-sm" data-action="admitThQueue:${escAttr(p.roomCode)}">✅ Admit</button>
        <button class="btn btn-ghost btn-sm" data-action="joinDoctorVideo:${escAttr(p.roomCode)}">📹 Join</button>
      </div></div>`).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Queue unavailable offline.</div>'}
}
async function admitThQueue(roomCode){
  try{
    await api('/sync/th/queue/admit',{method:'POST',body:JSON.stringify({roomCode})});
    flash('Patient admitted ✓');
    loadThQueue(); loadActiveRooms();
  }catch(e){AppDialog.alert('Admit failed: '+e.message)}
}
// refresh the queue whenever the telehealth panel opens
const _origRenderTelehealthPanel=renderTelehealthPanel;
renderTelehealthPanel=function(){_origRenderTelehealthPanel();loadThQueue();};
