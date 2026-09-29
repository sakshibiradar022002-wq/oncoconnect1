
function openRecord(mrn){
  selectedMRN=mrn;const p=LS.get('pat_'+mrn);if(!p)return;
  rLabs=[...(p.labs||[])];rMeds=[...(p.meds||[])];
  rAllergies=(p.allergies||[]).map(a=>typeof a==='string'?{name:a,severity:'Mild'}:a);
  buildRecordTabs(p);
  document.getElementById('rec-pat-name').textContent=p.name;
  document.getElementById('rec-pat-mrn').textContent='MRN: '+p.mrn;
  document.getElementById('record-shell').classList.add('open');
  document.querySelectorAll('.rnav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.rtab').forEach(t=>t.classList.remove('active'));
  document.querySelector('.rnav-item').classList.add('active');
  document.getElementById('rt-identity').classList.add('active');
  setTimeout(()=>{rCalcBP();rCalcBMI();rCalcAge();rCalcSpO2();rCalcTemp();calcEQD2();renderAllergyTags();renderLabsTable();renderMedList();renderRecordLogs(mrn);loadTrendsTab(mrn);renderRecordAppts(mrn);renderQuickSummary();checkDrugAllergyWarning();rCalcEGFR();renderMDTNotes(mrn);renderImagingReports(mrn);renderDrugInteractionBanner(mrn);renderRecordClinicalSupport(mrn);importLabSubs(mrn);rRxLoadAllergySummary();rRxLoadServerPrescriptions();rNotesLoad();rChemoLoad();rRefLoad();rDocsLoad();rOutLoad();loadNCCNTab(mrn);loadPatientBilling(mrn);},50);
}

function buildRecordTabs(p){
  const c=document.getElementById('record-content');
  c.innerHTML=`
  <!-- ══ TAB 1: IDENTITY ══ -->
  <div id="rt-identity" class="rtab active">
    <div style="background:linear-gradient(135deg,var(--blue),var(--blue2));border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;">
      <div style="color:#fff;"><div style="font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">MRN</div><div style="font-weight:700;font-size:13px;font-family:var(--mono);">${p.mrn}</div></div>
      <div style="width:1px;background:rgba(255,255,255,.2);align-self:stretch;"></div>
      <div style="color:#fff;"><div style="font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Age / Gender</div><div style="font-weight:700;font-size:13px;">${p.age||'—'} / ${p.gender||'—'}</div></div>
      <div style="width:1px;background:rgba(255,255,255,.2);align-self:stretch;"></div>
      <div style="color:#fff;"><div style="font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Diagnosis</div><div style="font-weight:700;font-size:13px;">${esc(p.diag||'—')}</div></div>
      <div style="width:1px;background:rgba(255,255,255,.2);align-self:stretch;"></div>
      <div style="color:#fff;"><div style="font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">ECOG</div><div style="font-weight:700;font-size:13px;">${p.ecog||'—'}</div></div>
      <div style="width:1px;background:rgba(255,255,255,.2);align-self:stretch;"></div>
      <div style="color:#fff;"><div style="font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Phase</div><div style="font-weight:700;font-size:13px;">${p.phase||'—'}</div></div>
      <div style="width:1px;background:rgba(255,255,255,.2);align-self:stretch;"></div>
      <div style="color:#fff;"><div style="font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Disease Status</div><div style="font-weight:700;font-size:13px;">${p.diseaseStatus||'Stable'}</div></div>
    </div>
    <div id="r-allergy-drug-warn" style="display:none;background:rgba(220,38,38,.07);border:1.5px solid rgba(220,38,38,.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--red);"></div>
    <div class="rt-section">
      <div class="rt-title">Core Identity</div>
      <div class="g3">
        <div class="fg"><label>Full Name *</label><input id="r-name" value="${esc(p.name)}"></div>
        <div class="fg"><label>MRN</label><input id="r-mrn" value="${esc(p.mrn)}" readonly style="font-family:var(--mono);"></div>
        <div class="fg"><label>Email</label><input id="r-email" value="${esc(p.email||'')}"></div>
        <div class="fg"><label>Date of Birth</label><input type="date" id="r-dob" value="${p.dob||''}" data-action-input="rCalcAge"></div>
        <div class="fg"><label>Age</label><input id="r-age" readonly value="${p.age||''}" placeholder="Auto"></div>
        <div class="fg"><label>Gender</label><select id="r-gender">${['Male','Female','Other','Prefer not to say'].map(o=>`<option${p.gender===o?' selected':''}>${o}</option>`).join('')}</select></div>
        <div class="fg"><label>Blood Group</label><select id="r-blood">${['O+','O-','A+','A-','B+','B-','AB+','AB-','Unknown'].map(o=>`<option${p.blood===o?' selected':''}>${o}</option>`).join('')}</select></div>
        <div class="fg"><label>Phone</label><input id="r-phone" value="${esc(p.phone||'')}"></div>
        <div class="fg"><label>Treatment Phase</label><select id="r-phase">${['Diagnosis','Pre-Treatment','Treatment Phase','Post-Treatment','Monitoring','Palliative'].map(o=>`<option${p.phase===o?' selected':''}>${o}</option>`).join('')}</select></div>
      </div>
    </div>
    <div class="rt-section">
      <div class="rt-title">Extended Demographics</div>
      <div class="g4">
        <div class="fg"><label>Occupation</label><input id="r-occupation" value="${esc(p.occupation||'')}"></div>
        <div class="fg"><label>Ethnicity</label><select id="r-ethnicity">${['Prefer not to say','South Asian','East Asian','Arab / Middle Eastern','Black / African','White / Caucasian','Hispanic / Latino','Mixed','Other'].map(o=>`<option${(p.ethnicity||'Prefer not to say')===o?' selected':''}>${o}</option>`).join('')}</select></div>
        <div class="fg"><label>Religion / Dietary</label><select id="r-religion">${['Not specified','Muslim','Christian','Hindu','Sikh','Jewish','Buddhist','Other'].map(o=>`<option${(p.religion||'Not specified')===o?' selected':''}>${o}</option>`).join('')}</select></div>
        <div class="fg"><label>Primary Language</label><input id="r-language" value="${esc(p.language||'')}"></div>
        <div class="fg"><label>Health Literacy</label><select id="r-literacy">${['Not assessed','High – reads medical material','Moderate – basic health info','Low – needs verbal explanation','Requires interpreter'].map(o=>`<option${(p.literacy||'Not assessed')===o?' selected':''}>${o}</option>`).join('')}</select></div>
        <div class="fg"><label>Socioeconomic Status</label><select id="r-socio">${['Not recorded','High','Middle','Low','Below poverty line'].map(o=>`<option${(p.socio||'Not recorded')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      </div>
    </div>
    <div class="rt-section">
      <div class="rt-title">Emergency Contact</div>
      <div class="g3">
        <div class="fg"><label>Name</label><input id="r-emergency-name" value="${esc(p.emergencyName||'')}"></div>
        <div class="fg"><label>Phone</label><input id="r-emergency-phone" value="${esc(p.emergencyPhone||'')}"></div>
        <div class="fg"><label>Relationship</label><select id="r-emergency-rel">${['Spouse','Parent','Child','Sibling','Friend','Caregiver','Other'].map(o=>`<option${(p.emergencyRel||'')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      </div>
    </div>
    <div class="rt-section">
      <div class="rt-title">Insurance</div>
      <div class="g3">
        <div class="fg"><label>Provider</label><input id="r-insurance" value="${esc(p.insurance||'')}"></div>
        <div class="fg"><label>Policy ID</label><input id="r-insurance-id" value="${esc(p.insuranceId||'')}"></div>
        <div class="fg"><label>Referral Source</label><input id="r-referral" value="${esc(p.referral||'')}"></div>
      </div>
    </div>
  </div>

  <!-- ══ TAB 2: METRICS ══ -->
  <div id="rt-metrics" class="rtab">
    <div class="g2">
      <div>
        <div class="rt-title">Vitals &amp; Anthropometrics</div>
        <div class="g3">
          <div class="fg"><label>Height (cm)</label><input id="r-h" type="number" min="80" max="250" value="${p.height||''}" placeholder="cm" data-action-input="rCalcBMI"></div>
          <div class="fg"><label>Weight (kg)</label><input id="r-w" type="number" min="20" max="300" value="${p.weight||''}" placeholder="kg" data-action-input="rCalcBMI"></div>
          <div class="fg"><label>BMI (Auto)</label><input id="r-bmi" value="${p.bmi||''}" readonly style="font-family:var(--mono);"></div>
        </div>
        <div id="r-bmi-cat" style="font-size:11px;margin-bottom:10px;padding:5px 10px;border-radius:5px;display:none;"></div>
        <div class="vitals-box">
          <div class="vitals-box-label">Blood Pressure <span id="r-bp-badge" style="font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700;margin-left:6px;"></span></div>
          <div class="g2">
            <div class="fg" style="margin:0 0 8px;"><label>Systolic (mmHg)</label><input id="r-sys" type="number" min="70" max="260" value="${p.bp_sys||'120'}" data-action-input="rCalcBP"></div>
            <div class="fg" style="margin:0 0 8px;"><label>Diastolic (mmHg)</label><input id="r-dia" type="number" min="40" max="150" value="${p.bp_dia||'80'}" data-action-input="rCalcBP"></div>
          </div>
        </div>
        <div class="vitals-box" style="margin-top:10px;">
          <div class="vitals-box-label">Heart / Pulse</div>
          <div class="g2">
            <div class="fg" style="margin:0 0 8px;"><label>Heart Rate (bpm)</label><input id="r-hr" type="number" min="20" max="300" value="${p.hr||'72'}"></div>
            <div class="fg" style="margin:0 0 8px;"><label>Rhythm</label><select id="r-rhythm">${['Regular','Irregular','A-Fib','Bradycardia','Tachycardia'].map(o=>`<option${(p.rhythm||'Regular')===o?' selected':''}>${o}</option>`).join('')}</select></div>
          </div>
        </div>
        <div class="vitals-box" style="margin-top:10px;">
          <div class="vitals-box-label">SpO₂ / Temperature / Respiratory Rate</div>
          <div class="g3">
            <div class="fg" style="margin:0 0 8px;"><label>SpO₂ (%)</label><input id="r-spo2" type="number" min="50" max="100" value="${p.spo2||''}" data-action-input="rCalcSpO2"></div>
            <div class="fg" style="margin:0 0 8px;"><label>Temperature (°C)</label><input id="r-temp" type="number" min="30" max="45" step="0.1" value="${p.temp||''}" data-action-input="rCalcTemp"></div>
            <div class="fg" style="margin:0 0 8px;"><label>Resp Rate (/min)</label><input id="r-rr" type="number" min="5" max="60" value="${p.rr||''}"></div>
          </div>
          <div id="r-spo2-alert" style="font-size:11px;display:none;padding:3px 8px;border-radius:4px;margin-top:4px;"></div>
          <div id="r-temp-alert" style="font-size:11px;display:none;padding:3px 8px;border-radius:4px;margin-top:4px;"></div>
        </div>

        <div style="margin-top:12px;"><div class="rt-title">Performance Status</div>
          <div class="g2">
            <div class="fg"><label>ECOG Performance Status</label><select id="r-ecog">${['0 - Fully active','1 - Restricted in strenuous activity','2 - Ambulatory, >50% of waking','3 - Limited self-care, >50% in bed','4 - Completely disabled'].map(o=>`<option${(p.ecog||'0 - Fully active')===o?' selected':''}>${o}</option>`).join('')}</select></div>
            <div class="fg"><label>KPS (Karnofsky 0-100)</label><input id="r-kps" type="number" min="0" max="100" value="${p.kps||''}" placeholder="0-100"></div>
          </div>
        </div>

        <div style="margin-top:12px;"><div class="rt-title">Neurological Examination</div>
          <div class="g3">
            <div class="fg"><label>GCS (E+V+M)</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input id="r-gcs" type="number" min="3" max="15" value="${p.gcs||''}" placeholder="Total" data-action-input="rCalcGCS" style="flex:1;">
                <div style="font-size:11px;color:var(--text-muted);">E<input id="r-gcs-e" type="number" min="1" max="4" value="${p.gcsE||''}" style="width:36px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;outline:none;"> V<input id="r-gcs-v" type="number" min="1" max="5" value="${p.gcsV||''}" style="width:36px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;outline:none;"> M<input id="r-gcs-m" type="number" min="1" max="6" value="${p.gcsM||''}" style="width:36px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;outline:none;"></div>
              </div>
              <div id="r-gcs-label" style="font-size:11px;color:var(--text-muted);margin-top:3px;">${p.gcs?(p.gcs>=13?'Mild (13-15)':p.gcs>=9?'Moderate (9-12)':'Severe (3-8)'):''}</div>
            </div>
            <div class="fg"><label>mRS</label><select id="r-mrs">${['0 – No symptoms','1 – Minor, no restriction','2 – Slight disability','3 – Moderate, needs help','4 – Moderately severe','5 – Severe, constant care','6 – Death'].map(o=>`<option${(p.mrs||'0 – No symptoms')===o?' selected':''}>${o}</option>`).join('')}</select></div>
            <div class="fg"><label>Barthel ADL (0-100)</label><input id="r-barthel" type="number" min="0" max="100" step="5" value="${p.barthel||''}" placeholder="100=Independent"></div>
          </div>
          <div class="g3" style="margin-top:8px;">
            <div class="fg"><label>Motor Right</label><select id="r-motor-r">${['Normal','Mild weakness (4/5)','Moderate (3/5)','Severe (2/5)','Trace (1/5)','Plegia (0/5)'].map(o=>`<option${(p.motorR||'Normal')===o?' selected':''}>${o}</option>`).join('')}</select></div>
            <div class="fg"><label>Motor Left</label><select id="r-motor-l">${['Normal','Mild weakness (4/5)','Moderate (3/5)','Severe (2/5)','Trace (1/5)','Plegia (0/5)'].map(o=>`<option${(p.motorL||'Normal')===o?' selected':''}>${o}</option>`).join('')}</select></div>
            <div class="fg"><label>Speech</label><select id="r-speech">${['Normal','Mild dysarthria','Severe dysarthria','Expressive aphasia','Receptive aphasia','Global aphasia'].map(o=>`<option${(p.speech||'Normal')===o?' selected':''}>${o}</option>`).join('')}</select></div>
            <div class="fg"><label>Visual Field</label><select id="r-visual">${['Normal','Bitemporal hemianopia','Left homonymous','Right homonymous','Other deficit'].map(o=>`<option${(p.visual||'Normal')===o?' selected':''}>${o}</option>`).join('')}</select></div>
            <div class="fg"><label>MMSE (0-30)</label><input id="r-mmse" type="number" min="0" max="30" value="${p.mmse||''}"></div>
            <div class="fg"><label>Cranial Nerve Deficits</label><input id="r-cranial" value="${esc(p.cranial||'')}"></div>
          </div>
        </div>

        <div style="margin-top:12px;"><div class="rt-title">Renal Function &amp; Dosing</div>
          <div class="g3">
            <div class="fg"><label>Serum Creatinine (mg/dL)</label><input id="r-creat" type="number" step="0.01" value="${p.creat||''}" data-action-input="rCalcEGFR"></div>
            <div class="fg"><label>eGFR (CKD-EPI 2021)</label><input id="r-egfr" readonly value="${p.egfr||''}" style="font-family:var(--mono);background:var(--surface2);"><div id="r-egfr-stage" style="font-size:10.5px;color:var(--text-muted);margin-top:3px;"></div></div>
            <div class="fg"><label>BSA Mosteller (m²)</label><input id="r-bsa" readonly value="${p.bsa||''}" style="font-family:var(--mono);background:var(--surface2);"></div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN -->
      <div style="display:flex;flex-direction:column;gap:14px;">
        <!-- ALLERGIES -->
        <div class="info-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div class="info-card-title" style="margin:0;border:none;padding:0;">⚠️ Allergies</div>
            <span id="r-allergy-count-badge" style="background:rgba(220,38,38,.1);color:var(--red);font-size:11px;font-weight:700;padding:3px 9px;border-radius:12px;display:none;">0</span>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:10px;">
            <input id="r-allergy-inp" placeholder="Allergen name…" autocomplete="off" style="flex:1;padding:8px 11px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:9px;color:var(--text);font-size:13px;outline:none;" data-action-enter="prevent;;rAddAllergy">
            <select id="r-allergy-sev" style="padding:8px 6px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:9px;color:var(--text);font-size:12px;outline:none;">
              <option>Mild</option><option>Moderate</option><option>Severe</option><option>Life-threatening</option>
            </select>
            <button data-action="rAddAllergy" style="width:34px;height:34px;border-radius:9px;border:none;background:var(--blue);color:#fff;font-size:18px;font-weight:700;cursor:pointer;">+</button>
          </div>
          <div id="r-allergy-tags" style="display:flex;flex-wrap:wrap;gap:6px;min-height:28px;"></div>
        </div>

        <!-- COMORBIDITIES -->
        <div class="info-card">
          <div class="info-card-title">🩺 Comorbidities</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            ${['Hypertension','Diabetes T2','CKD','Epilepsy/Seizures','DVT/PE','Cardiac Disease','Liver Disease','Thyroid Disorder','Depression/Anxiety','Other Malignancy'].map(c=>{
              const checked=(p.comorbidities||[]).includes(c);
              return `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:${checked?'var(--blue-pale)':'var(--surface2)'};border:1.5px solid ${checked?'var(--blue)':'var(--border)'};border-radius:9px;cursor:pointer;font-size:12px;font-weight:${checked?'700':'500'};color:${checked?'var(--blue)':'var(--text)'};" data-action="labelclick">
                <input type="checkbox" class="comor-cb" value="${c}" ${checked?'checked':''} style="display:none;">${c}
              </label>`;
            }).join('')}
          </div>
        </div>

        <!-- CLINICAL NOTES -->
        <div class="info-card">
          <div class="info-card-title">📝 Clinical Notes</div>
          <textarea id="r-clin-notes" rows="4" placeholder="Assessment, plan, observations…" style="width:100%;padding:9px 11px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:9px;color:var(--text);font-family:inherit;font-size:13px;outline:none;resize:vertical;line-height:1.6;">${esc(p.clinNotes||'')}</textarea>
        </div>

      </div>
    </div>
  </div>

  <!-- ══ TAB 3: DIAGNOSIS ══ -->
  <div id="rt-diagnosis" class="rtab">
    <div class="rt-title">Disease Status</div>
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
      ${[['Active','#1a56db'],['Stable','#0891b2'],['Remission','#059669'],['Progression','#dc2626'],['Relapse','#d97706'],['Deceased','#6e7681']].map(([s,col])=>{
        const active=(p.diseaseStatus||'Stable')===s;
        return `<button data-action="setDS:@this,${s}" data-ds="${s}" class="ds-btn${active?' active':''}" style="${active?'background:'+col+';border-color:'+col+';':''}">${s}</button>`;
      }).join('')}
    </div>
    <input type="hidden" id="r-ds" value="${p.diseaseStatus||'Stable'}">

    <div class="rt-title">Primary Diagnosis</div>
    <div class="info-card">
      <div class="fg"><label>Diagnosis Name</label><input id="r-diag" value="${esc(p.diag||'')}"></div>
      <div class="g2">
        <div class="fg" style="margin:0;"><label>ICD-10/11 Code</label><div style="display:flex;gap:6px;"><input id="r-icd" value="${esc(p.icd10||'')}" style="flex:1;font-family:var(--mono);"><button class="btn btn-ghost btn-sm" data-action="openICDLookup">Browse</button></div></div>
        <div class="fg" style="margin:0;"><label>WHO CNS Grade (2021)</label><select id="r-who">${['Not Graded','WHO Grade I','WHO Grade II','WHO Grade III','WHO Grade IV'].map(o=>`<option${(p.whoGrade||'Not Graded')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      </div>
    </div>

    <div class="g2">
      <div class="info-card">
        <div class="info-card-title">Classification</div>
        <div class="fg"><label>Primary Site</label><select id="r-site">${['','Frontal lobe','Temporal lobe','Parietal lobe','Occipital lobe','Cerebellum','Brainstem','Ventricular','Suprasellar','Spinal','Other'].map(o=>`<option value="${o}"${(p.primarySite||'')===o?' selected':''}>${o||'— Select —'}</option>`).join('')}</select></div>
        <div class="g2">
          <div class="fg" style="margin:0;"><label>Laterality</label><select id="r-lat">${['','Left','Right','Bilateral','Midline','N/A'].map(o=>`<option value="${o}"${(p.laterality||'')===o?' selected':''}>${o||'— Select —'}</option>`).join('')}</select></div>
          <div class="fg" style="margin:0;"><label>Histology</label><input id="r-hist" value="${esc(p.histology||'')}"></div>
          <div class="fg" style="margin:0;"><label>Histologic Variant</label><input id="r-histvariant" value="${esc(p.histVariant||'')}"></div>
          <div class="fg" style="margin:0;"><label>Date Diagnosed</label><input type="date" id="r-ddiag" value="${p.dateDiag||''}"></div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="info-card">
          <div class="info-card-title">TNM Staging</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center;font-size:12px;">
            <span style="color:var(--text-muted);">T</span><select id="r-tnmt" style="padding:5px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:12px;">${['TX','T0','T1','T2','T3','T4'].map(o=>`<option${(p.tnmT||'TX')===o?' selected':''}>${o}</option>`).join('')}</select>
            <span style="color:var(--text-muted);">N</span><select id="r-tnmn" style="padding:5px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:12px;">${['NX','N0','N1','N2','N3'].map(o=>`<option${(p.tnmN||'NX')===o?' selected':''}>${o}</option>`).join('')}</select>
            <span style="color:var(--text-muted);">M</span><select id="r-tnmm" style="padding:5px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:12px;">${['MX','M0','M1'].map(o=>`<option${(p.tnmM||'MX')===o?' selected':''}>${o}</option>`).join('')}</select>
            <span style="color:var(--blue);font-weight:600;">Stage</span><input id="r-tnms" value="${p.tnmStage||''}" style="padding:5px 8px;background:transparent;border:none;border-bottom:2px solid var(--border);color:var(--blue);font-weight:600;font-size:12px;outline:none;">
          </div>
        </div>
        <div class="info-card">
          <div class="info-card-title">RECIST 1.1</div>
          <div class="g2">
            <div class="fg" style="margin:0 0 8px;"><label>Criteria</label><select id="r-recist">${['NE – Not Evaluable','CR – Complete Response','PR – Partial Response','SD – Stable Disease','PD – Progressive Disease'].map(o=>`<option${(p.recist||'NE – Not Evaluable')===o?' selected':''}>${o}</option>`).join('')}</select></div>
            <div class="fg" style="margin:0 0 8px;"><label>Last Assessment</label><input type="date" id="r-lass" value="${p.lastAssess||''}"></div>
            <div class="fg" style="margin:0;"><label>Target Lesions (mm)</label><input type="number" id="r-target" value="${p.targetLesions||'0'}" min="0"></div>
            <div class="fg" style="margin:0;"><label>New Lesions</label><select id="r-newlesions">${['None','Present'].map(o=>`<option${(p.newLesions||'None')===o?' selected':''}>${o}</option>`).join('')}</select></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ TAB 4: MOLECULAR ══ -->
  <div id="rt-molecular" class="rtab">
    <div class="rt-title">Core WHO CNS 2021 Panel</div>
    <div class="g4" style="margin-bottom:20px;">
      <div class="fg"><label>IDH1</label><select id="r-idh1">${['Pending','Mutant R132H','Mutant (Other)','Wild-type','N/A'].map(o=>`<option${(p.idh1||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>MGMT Methylation</label><select id="r-mgmt">${['Pending','Methylated','Unmethylated','Indeterminate','N/A'].map(o=>`<option${(p.mgmt||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>1p/19q Co-deletion</label><select id="r-cod">${['Pending','Co-deleted','Intact','N/A'].map(o=>`<option${(p.codeletion||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>TERT Promoter</label><select id="r-tert">${['Pending','Mutant C228T','Mutant C250T','Wild-type','N/A'].map(o=>`<option${(p.tert||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>ATRX</label><select id="r-atrx">${['Pending','Lost','Retained','N/A'].map(o=>`<option${(p.atrx||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>EGFR</label><select id="r-egfrmol">${['Pending','Amplified','Not Amplified','N/A'].map(o=>`<option${(p.egfrmol||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>BRAF V600E</label><select id="r-braf">${['Pending','Mutant','Wild-type','N/A'].map(o=>`<option${(p.braf||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>H3 K27M</label><select id="r-h3k27m">${['Pending','Mutant','Wild-type','N/A'].map(o=>`<option${(p.h3k27m||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
    </div>
    <div class="rt-title">Extended Panel</div>
    <div class="g4">
      <div class="fg"><label>Ki-67 Index (%)</label><input id="r-ki67" type="number" min="0" max="100" value="${p.ki67||''}"></div>
      <div class="fg"><label>P53 Expression</label><select id="r-p53">${['Pending','Positive (>10%)','Negative (<10%)','N/A'].map(o=>`<option${(p.p53||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>PTEN Status</label><select id="r-pten">${['Pending','Lost','Retained','N/A'].map(o=>`<option${(p.pten||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>CDKN2A/B</label><select id="r-cdkn">${['Pending','Homozygous Deletion','Heterozygous Loss','Intact','N/A'].map(o=>`<option${(p.cdkn2ab||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>CDK4 Amplification</label><select id="r-cdk4">${['Pending','Amplified','Not Amplified','N/A'].map(o=>`<option${(p.cdk4||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>PDGFRA Amplification</label><select id="r-pdgfra">${['Pending','Amplified','Not Amplified','N/A'].map(o=>`<option${(p.pdgfra||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>NF1 Status</label><select id="r-nf1">${['Pending','Mutant','Wild-type','N/A'].map(o=>`<option${(p.nf1||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>FGFR1</label><select id="r-fgfr1">${['Pending','Mutant (p.K656E)','Tandem duplication','Wild-type','N/A'].map(o=>`<option${(p.fgfr1||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
    </div>
    <div class="rt-title" style="margin-top:18px;">Immunotherapy &amp; Tumour Mutational Markers</div>
    <div class="g4">
      <div class="fg"><label>NTRK Fusion</label><select id="r-ntrk">${['Pending','NTRK1','NTRK2','NTRK3','Not fused','N/A'].map(o=>`<option${(p.ntrk||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>TMB (mut/Mb)</label><input id="r-tmb" type="number" min="0" max="500" step="0.1" value="${p.tmb||''}"><div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">${p.tmb>=10?'High (≥10)':p.tmb>0?'Low (<10)':''}</div></div>
      <div class="fg"><label>MSI Status</label><select id="r-msi">${['Pending','MSS','MSI-L','MSI-H','N/A'].map(o=>`<option${(p.msi||'Pending')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>PD-L1 Expression (%)</label><input id="r-pdl1" type="number" min="0" max="100" value="${p.pdl1||''}"><div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">${p.pdl1>=50?'High ≥50%':p.pdl1>=1?'Low 1-49%':p.pdl1==0?'Negative':''}</div></div>
    </div>
  </div>

  <!-- ══ TAB 5: LABS ══ -->
  <div id="rt-labs" class="rtab">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">Laboratory Results</div>
      <button class="btn btn-primary btn-sm" data-action="showLabForm">+ Add Result</button>
    </div>
    <div id="r-lab-form" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px;">
      <div style="display:grid;grid-template-columns:1fr 1.6fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <div class="fg" style="margin:0;"><label>Date</label><input type="date" id="r-lab-date"></div>
        <div class="fg" style="margin:0;"><label>Test</label><div style="position:relative;"><input id="r-lab-test" placeholder="Search test…" autocomplete="off" data-action-input="filterLabTests:@value" data-action-focus="showLabTestDropdown" data-action-blur="blurhide:lab-test-dropdown"><div id="lab-test-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1.5px solid var(--blue-light);border-radius:0 0 8px 8px;max-height:200px;overflow-y:auto;z-index:999;box-shadow:0 8px 24px rgba(0,0,0,.3);"></div></div></div>
        <div class="fg" style="margin:0;"><label>Value</label><input id="r-lab-val"></div>
        <div class="fg" style="margin:0;"><label>Ref Range</label><input id="r-lab-ref"></div>
        <div class="fg" style="margin:0;"><label>Status</label><select id="r-lab-status"><option>Normal</option><option>High</option><option>Low</option><option>Critical</option><option>Pending</option></select></div>
      </div>
      <div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" data-action="hideLabForm">Cancel</button><button class="btn btn-primary btn-sm" data-action="saveLabResult">Save</button></div>
    </div>
    <div id="r-labs-empty" style="text-align:center;padding:32px;color:var(--text-dim);font-size:12.5px;border:1px dashed var(--border);border-radius:8px;display:none;">No lab results. Click "+ Add Result" to start.</div>
    <table class="lab-table" id="r-labs-table"><thead><tr><th>Date</th><th>Test</th><th>Value</th><th>Ref Range</th><th>Status</th><th></th></tr></thead><tbody id="r-labs-body"></tbody></table>
  </div>

  <!-- ══ TAB 6: PRESCRIPTIONS (Merged E-Prescribing & Medication Management) ══ -->
  <div id="rt-prescriptions" class="rtab">
    <!-- Page Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
      <div>
        <div style="font-size:1.25rem;font-weight:800;color:var(--text);letter-spacing:-.5px;">💊 Prescriptions</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">E-prescribing & medication management · <a href="#" data-action="printDaySheet:@v:selectedMRN" style="color:var(--blue);font-size:12px;">🖨 Day sheet</a></div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" data-action="rRxLoadServerPrescriptions;;rRxLoadAllergySummary">🔄 Refresh</button>
        <button class="btn btn-primary btn-sm" data-action="toggleDisplay:r-rx-create-form">+ New Prescription</button>
      </div>
    </div>

    <!-- Drug Interaction Banner -->
    <div id="r-drug-interaction-banner" style="display:none;background:rgba(220,38,38,.06);border:1.5px solid rgba(220,38,38,.2);border-radius:8px;padding:11px 14px;margin-bottom:14px;font-size:12.5px;color:var(--red);line-height:1.7;"></div>

    <!-- CDS Allergy Summary -->
    <div id="r-rx-allergy-summary" style="display:none;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:12px 16px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:16px;">⚠️</span>
        <span style="font-weight:700;font-size:13px;color:var(--red);">Known Patient Allergies</span>
      </div>
      <div id="r-rx-allergy-tags" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Auto-check runs before every new prescription.</div>
    </div>

    <!-- Create Prescription Form -->
    <div id="r-rx-create-form" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:18px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:12px;">✍️ New Prescription</div>
      <div class="g2">
        <div class="fg" style="margin:0 0 10px;"><label>Medication *</label><input id="r-med-name" placeholder="e.g. Temozolomide" data-action-input="rRxLiveAllergyCheck:@value"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Generic Name</label><input id="r-rx-generic" placeholder="Optional generic name"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Dosage *</label><input id="r-med-dose" placeholder="e.g. 150 mg/m²"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Frequency *</label><select id="r-med-freq"><option>QD</option><option>BID</option><option>TID</option><option>QID</option><option>PRN</option><option>Monthly</option><option>Cycle Day 1-5</option></select></div>
        <div class="fg" style="margin:0 0 10px;"><label>Route</label><select id="r-med-route"><option value="oral">Oral</option><option value="iv">IV</option><option value="im">IM</option><option value="subcutaneous">Subcutaneous</option><option value="intrathecal">Intrathecal</option><option value="topical">Topical</option></select></div>
        <div class="fg" style="margin:0 0 10px;"><label>Duration</label><input id="r-med-dur" placeholder="e.g. 30 days"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Indication</label><input id="r-med-indication" placeholder="e.g. Anti-epileptic"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Quantity</label><input id="r-med-qty" type="number" placeholder="# pills"></div>
      </div>
      <div class="g2">
        <div class="fg" style="margin:0 0 10px;"><label>Pharmacy</label><input id="r-med-pharmacy" placeholder="Pharmacy name/address"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Refills</label><input id="r-med-refills" type="number" value="0" min="0" max="12"></div>
      </div>
      <div class="fg" style="margin:0 0 10px;"><label>Special Instructions</label><textarea id="r-med-instructions" rows="2" placeholder="e.g. Take with food, avoid sunlight"></textarea></div>
      <!-- Live CDS allergy check -->
      <div id="r-med-allergy-check" style="display:none;padding:8px 12px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;margin-bottom:10px;font-size:12px;color:var(--red);"></div>
      <!-- CDS interaction check -->
      <div id="r-med-interaction-check" style="display:none;padding:8px 12px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:8px;margin-bottom:10px;font-size:12px;color:var(--orange);"></div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn btn-ghost btn-sm" data-action="hide:r-rx-create-form;;hide:r-med-allergy-check;;hide:r-med-interaction-check">Cancel</button>
        <button class="btn btn-primary btn-sm" data-action="rRxPrescribeWithCDS">💊 Prescribe with CDS Check</button>
        <div style="margin-left:auto;">
          <button class="btn btn-ghost btn-sm" data-action="showRTabQ:rt-clinical-support,6" style="font-size:11px;">⚕️ Full Clinical Support</button>
        </div>
      </div>
    </div>

    <!-- Active E-Prescriptions (Server) -->
    <div class="g2" style="margin-bottom:18px;">
      <div class="info-card">
        <div class="info-card-title" style="display:flex;align-items:center;justify-content:space-between;">📋 Active E-Prescriptions <button class="btn btn-ghost btn-sm" data-action="rRxLoadServerPrescriptions" style="padding:3px 8px;font-size:10px;">Refresh</button></div>
        <div id="r-rx-server-list"><div class="empty-card">No prescriptions yet.</div></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">💊 Medication List (Local)</div>
        <div id="r-med-list"><div class="empty-card">No local medications recorded.</div></div>
      </div>
    </div>

    <!-- Quick Drug Reference -->
    <div class="info-card">
      <div class="info-card-title">📖 Quick Drug Reference</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
        <div style="cursor:pointer;font-size:11px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;text-align:center;transition:all .2s;" data-action="rCdsShowDrugInfo:temozolomide" data-hover="border:var(--blue)::var(--border)"><strong>TMZ</strong><br><span style="font-size:9px;color:var(--text-dim)">Temozolomide</span></div>
        <div style="cursor:pointer;font-size:11px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;text-align:center;transition:all .2s;" data-action="rCdsShowDrugInfo:bevacizumab" data-hover="border:var(--blue)::var(--border)"><strong>Bevacizumab</strong><br><span style="font-size:9px;color:var(--text-dim)">Avastin</span></div>
        <div style="cursor:pointer;font-size:11px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;text-align:center;transition:all .2s;" data-action="rCdsShowDrugInfo:carboplatin" data-hover="border:var(--blue)::var(--border)"><strong>Carboplatin</strong><br><span style="font-size:9px;color:var(--text-dim)">Platinum</span></div>
        <div style="cursor:pointer;font-size:11px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;text-align:center;transition:all .2s;" data-action="rCdsShowDrugInfo:levetiracetam" data-hover="border:var(--blue)::var(--border)"><strong>Levetiracetam</strong><br><span style="font-size:9px;color:var(--text-dim)">Keppra</span></div>
        <div style="cursor:pointer;font-size:11px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;text-align:center;transition:all .2s;" data-action="rCdsShowDrugInfo:dexamethasone" data-hover="border:var(--blue)::var(--border)"><strong>Dexa</strong><br><span style="font-size:9px;color:var(--text-dim)">Decadron</span></div>
        <div style="cursor:pointer;font-size:11px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;text-align:center;transition:all .2s;" data-action="rCdsShowDrugInfo:lomustine" data-hover="border:var(--blue)::var(--border)"><strong>Lomustine</strong><br><span style="font-size:9px;color:var(--text-dim)">CCNU</span></div>
        <div style="cursor:pointer;font-size:11px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;text-align:center;transition:all .2s;" data-action="rCdsShowDrugInfo:procarbazine" data-hover="border:var(--blue)::var(--border)"><strong>Procarbazine</strong><br><span style="font-size:9px;color:var(--text-dim)">Matulane</span></div>
        <div style="cursor:pointer;font-size:11px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;text-align:center;transition:all .2s;" data-action="rCdsShowDrugInfo:valproic-acid" data-hover="border:var(--blue)::var(--border)"><strong>Valproic Acid</strong><br><span style="font-size:9px;color:var(--text-dim)">Depakote</span></div>
      </div>
      <div id="r-cds-drug-info" style="margin-top:12px;"></div>
    </div>
  </div>

  <!-- ══ TAB 6B: CLINICAL SUPPORT (per-patient) ══ -->
  <div id="rt-clinical-support" class="rtab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">⚕️ Clinical Decision Support</div>
    </div>

    <!-- Allergy Management -->
    <div class="g2" style="margin-bottom:20px;">
      <div class="info-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div class="info-card-title" style="margin:0;border:none;padding:0;">⚠️ Patient Allergies</div>
          <span id="r-cds-allergy-count" style="background:rgba(239,68,68,.1);color:var(--red);font-size:10px;font-weight:700;padding:3px 9px;border-radius:12px;display:none;">0</span>
        </div>
        <div id="r-cds-allergy-list" style="margin-bottom:12px;"></div>
        <div style="border-top:1px solid var(--border);padding-top:12px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-dim);margin-bottom:8px;">Add Server Allergy</div>
          <div class="g2">
            <div class="fg" style="margin:0;"><label>Drug Name</label><input id="r-cds-allergy-drug" placeholder="e.g. penicillin"></div>
            <div class="fg" style="margin:0;"><label>Reaction</label><input id="r-cds-allergy-rxn" placeholder="e.g. rash, anaphylaxis"></div>
          </div>
          <div class="fg" style="margin-top:8px;"><label>Severity</label><select id="r-cds-allergy-sev"><option value="mild">Mild</option><option value="moderate" selected>Moderate</option><option value="severe">Severe</option><option value="anaphylaxis">Anaphylaxis</option></select></div>
          <button class="btn btn-primary btn-sm" data-action="rCdsAddAllergy">+ Add Allergy</button>
        </div>
      </div>

      <!-- Drug Interaction Checker -->
      <div class="info-card">
        <div class="info-card-title">🔍 Drug Interaction Check</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Checks interactions between medications. Pre-filled with patient's active meds.</div>
        <div class="fg"><label>Medications (comma-separated, min 2)</label><textarea id="r-cds-meds" rows="2" placeholder="e.g. temozolomide, valproic acid, dexamethasone"></textarea></div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-primary btn-sm" data-action="rCdsCheckInteractions">🔍 Check Interactions</button>
          <button class="btn btn-ghost btn-sm" data-action="rCdsPrefillMeds">Auto-fill from active meds</button>
        </div>
        <div id="r-cds-interaction-results" style="margin-top:14px;"></div>
      </div>
    </div>

    <!-- Dosage Check + Quick Prescribe -->
    <div class="g2" style="margin-bottom:20px;">
      <div class="info-card">
        <div class="info-card-title">💊 Dosage Validation</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Validate dose against neuro-oncology reference ranges.</div>
        <div class="g2">
          <div class="fg" style="margin:0 0 8px;"><label>Medication</label><input id="r-cds-dose-med" placeholder="e.g. temozolomide"></div>
          <div class="fg" style="margin:0 0 8px;"><label>Dosage</label><input id="r-cds-dose-val" placeholder="e.g. 150 mg"></div>
        </div>
        <div class="fg"><label>Frequency</label><input id="r-cds-dose-freq" placeholder="e.g. QD x 5 days"></div>
        <button class="btn btn-primary btn-sm" data-action="rCdsCheckDosage">✅ Validate Dosage</button>
        <div id="r-cds-dose-results" style="margin-top:12px;"></div>
      </div>

      <div class="info-card">
        <div class="info-card-title">🚀 Clinical Prescribe</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Create a prescription with automatic allergy + interaction checks.</div>
        <div class="fg"><label>Medication *</label><input id="r-cds-rx-med" placeholder="e.g. Temozolomide"></div>
        <div class="g2">
          <div class="fg" style="margin:0 0 8px;"><label>Dosage *</label><input id="r-cds-rx-dose" placeholder="e.g. 150 mg/m²"></div>
          <div class="fg" style="margin:0 0 8px;"><label>Frequency *</label><select id="r-cds-rx-freq"><option>QD</option><option>BID</option><option>TID</option><option>QID</option><option>PRN</option><option>Monthly</option><option>Cycle Day 1-5</option></select></div>
        </div>
        <div class="g2">
          <div class="fg" style="margin:0 0 8px;"><label>Route</label><select id="r-cds-rx-route"><option value="oral">Oral</option><option value="iv">IV</option><option value="im">IM</option><option value="subcutaneous">Subcutaneous</option><option value="intrathecal">Intrathecal</option><option value="topical">Topical</option></select></div>
          <div class="fg" style="margin:0 0 8px;"><label>Duration</label><input id="r-cds-rx-dur" placeholder="e.g. 30 days"></div>
        </div>
        <div class="fg"><label>Special Instructions</label><textarea id="r-cds-rx-instr" rows="2" placeholder="e.g. Take on empty stomach"></textarea></div>
        <div id="r-cds-rx-warnings" style="display:none;margin-bottom:12px;"></div>
        <button class="btn btn-primary btn-full" data-action="rCdsQuickPrescribe">⚕️ Prescribe with CDS Check</button>
      </div>
    </div>

    <!-- Drug Info Reference -->
    <div class="info-card">
      <div class="info-card-title">📖 Quick Drug Reference</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">
        <div style="cursor:pointer;font-size:11px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;transition:all .2s;" data-action="rCdsShowDrugInfo:temozolomide" data-hover="border:var(--blue)::var(--border)"><strong>Temozolomide</strong><br><span style="font-size:10px;color:var(--text-dim)">TMZ · Temodar</span></div>
        <div style="cursor:pointer;font-size:11px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;transition:all .2s;" data-action="rCdsShowDrugInfo:bevacizumab" data-hover="border:var(--blue)::var(--border)"><strong>Bevacizumab</strong><br><span style="font-size:10px;color:var(--text-dim)">Anti-VEGF · Avastin</span></div>
        <div style="cursor:pointer;font-size:11px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;transition:all .2s;" data-action="rCdsShowDrugInfo:carboplatin" data-hover="border:var(--blue)::var(--border)"><strong>Carboplatin</strong><br><span style="font-size:10px;color:var(--text-dim)">Platinum agent</span></div>
        <div style="cursor:pointer;font-size:11px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;transition:all .2s;" data-action="rCdsShowDrugInfo:lomustine" data-hover="border:var(--blue)::var(--border)"><strong>Lomustine</strong><br><span style="font-size:10px;color:var(--text-dim)">CCNU · Nitrosourea</span></div>
        <div style="cursor:pointer;font-size:11px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;transition:all .2s;" data-action="rCdsShowDrugInfo:procarbazine" data-hover="border:var(--blue)::var(--border)"><strong>Procarbazine</strong><br><span style="font-size:10px;color:var(--text-dim)">MAO inhibitor</span></div>
        <div style="cursor:pointer;font-size:11px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;transition:all .2s;" data-action="rCdsShowDrugInfo:levetiracetam" data-hover="border:var(--blue)::var(--border)"><strong>Levetiracetam</strong><br><span style="font-size:10px;color:var(--text-dim)">Antiepileptic · Keppra</span></div>
        <div style="cursor:pointer;font-size:11px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;transition:all .2s;" data-action="rCdsShowDrugInfo:dexamethasone" data-hover="border:var(--blue)::var(--border)"><strong>Dexamethasone</strong><br><span style="font-size:10px;color:var(--text-dim)">Steroid · Decadron</span></div>
        <div style="cursor:pointer;font-size:11px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;transition:all .2s;" data-action="rCdsShowDrugInfo:valproic-acid" data-hover="border:var(--blue)::var(--border)"><strong>Valproic Acid</strong><br><span style="font-size:10px;color:var(--text-dim)">Antiepileptic · Depakote</span></div>
      </div>
      <div id="r-cds-drug-info" style="margin-top:14px;"></div>
    </div>
  </div>

  <!-- ══ TAB 7: TREATMENT ══ -->
  <div id="rt-treatment" class="rtab">
    <div class="rt-title">Radiotherapy</div>
    <div class="g3">
      <div class="fg"><label>Technique</label><select id="r-tx-tech">${['IMRT','VMAT','SRS','SBRT','3D-CRT','Proton','Other'].map(o=>`<option${(p.txTechnique||'IMRT')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>Device</label><select id="r-tx-dev">${['LINAC','Gamma Knife','CyberKnife','Tomotherapy','Proton Unit','Other'].map(o=>`<option${(p.txDevice||'LINAC')===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fg"><label>Total Dose (Gy)</label><input id="r-tx-dose" type="number" min="0" step="0.1" value="${p.txDose||''}" data-action-input="calcEQD2"></div>
      <div class="fg"><label>Fractions</label><input id="r-tx-frac" type="number" min="0" value="${p.txFractions||''}" data-action-input="calcEQD2"></div>
      <div class="fg"><label>Concurrent Chemo</label><input id="r-tx-chemo" value="${esc(p.txConcChemo||'')}"></div>
      <div class="fg"><label>Targeted Therapy</label><input id="r-tx-targeted" value="${esc(p.txTargeted||'')}"></div>
      <div class="fg"><label>Immunotherapy</label><input id="r-tx-immuno" value="${esc(p.txImmuno||'')}"></div>
      <div class="fg"><label>Start Date</label><input type="date" id="r-tx-start" value="${p.txStart||''}"></div>
      <div class="fg"><label>End Date</label><input type="date" id="r-tx-end" value="${p.txEnd||''}"></div>
      <div class="fg"><label>Regimen Status</label><select id="r-tx-regimen-status">${['Planned','Ongoing','Completed','Stopped – Toxicity','Stopped – Progression'].map(o=>`<option${(p.txRegimenStatus||'Planned')===o?' selected':''}>${o}</option>`).join('')}</select></div>
    </div>

    <div class="g2" style="margin-top:12px;">
      <div>
        <div class="rt-title">Cycle Tracker</div>
        <div class="g2">
          <div class="fg"><label>Current Cycle</label><input id="r-tx-cycle-current" type="number" min="0" value="${p.txCycleCurrent||''}"></div>
          <div class="fg"><label>Total Cycles</label><input id="r-tx-cycle-total" type="number" min="0" value="${p.txCycleTotal||''}"></div>
        </div>
        <div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden;margin-top:6px;"><div style="height:100%;background:linear-gradient(90deg,var(--blue),var(--green));border-radius:4px;width:${p.txCycleCurrent&&p.txCycleTotal?Math.round(p.txCycleCurrent/p.txCycleTotal*100):0}%;"></div></div>
      </div>
      <div>
        <div class="rt-title">CTCAE Toxicity</div>
        <div class="fg"><label>Grade</label><select id="r-tx-ctcae">${['Grade 0 – None','Grade 1 – Mild','Grade 2 – Moderate','Grade 3 – Severe','Grade 4 – Life-threatening','Grade 5 – Death'].map(o=>`<option${(p.txCTCAE||'Grade 0 – None')===o?' selected':''}>${o}</option>`).join('')}</select></div>
        <div class="fg"><label>Description</label><input id="r-tx-toxicity" value="${esc(p.txToxicity||'')}"></div>
      </div>
    </div>

    <!-- EQD2/BED Calculator -->
    <div class="info-card" style="margin-top:16px;">
      <div class="info-card-title">🧮 EQD₂ / BED Calculator <span style="float:right;font-weight:400;text-transform:none;letter-spacing:0;">α/β: <input id="r-eqd2-ab" type="number" value="${p.txAlphaBeta||2}" min="1" max="20" step="0.5" style="width:50px;padding:2px 5px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;text-align:center;" data-action-input="calcEQD2"></span></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="text-align:center;"><div style="font-size:10px;color:var(--text-dim);">BED</div><div style="font-weight:800;font-size:20px;font-family:var(--mono);" id="r-bed-val">—</div></div>
        <div style="text-align:center;"><div style="font-size:10px;color:var(--text-dim);">EQD₂</div><div style="font-weight:800;font-size:20px;color:var(--blue);font-family:var(--mono);" id="r-eqd2-val">—</div></div>
        <div style="text-align:center;"><div style="font-size:10px;color:var(--text-dim);">Dose/Fx</div><div style="font-weight:800;font-size:20px;font-family:var(--mono);" id="r-dpf-display">—</div></div>
      </div>
    </div>

    <div style="margin-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div class="rt-title" style="margin:0;padding:0;border:none;">Treatment Log</div>
        <button class="btn btn-ghost btn-sm" data-action="showTxEntryForm">+ Add Entry</button>
      </div>
      <div id="r-tx-entry-form" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
          <div class="fg" style="margin:0;"><label>Date</label><input type="date" id="txe-date"></div>
          <div class="fg" style="margin:0;"><label>Type</label><select id="txe-type"><option>Cycle Start</option><option>Cycle Complete</option><option>Dose Modification</option><option>Toxicity Event</option><option>Protocol Change</option></select></div>
          <div class="fg" style="margin:0;"><label>Drug</label><input id="txe-drug"></div>
          <div class="fg" style="margin:0;"><label>Notes</label><input id="txe-notes"></div>
        </div>
        <div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" data-action="hideTxEntryForm">Cancel</button><button class="btn btn-primary btn-sm" data-action="saveTxEntry">Save</button></div>
      </div>
      <table class="lab-table" id="r-tx-entries-table"><thead><tr><th>Date</th><th>Type</th><th>Drug</th><th>Notes</th><th></th></tr></thead><tbody id="r-tx-entries-body"></tbody></table>
      <button class="btn btn-ghost btn-sm" data-action="showTxEntryForm" style="margin-top:8px;">+ Add Entry</button>
    </div>
  </div>

  <!-- ══ TAB 8: APPOINTMENTS ══ -->
  <div id="rt-appointments" class="rtab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">Appointments</div>
      <button class="btn btn-primary btn-sm" data-action="openAddApptForm">+ Schedule</button>
    </div>
    <div id="r-add-appt-form" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px;">
      <div class="g3">
        <div class="fg" style="margin:0 0 8px;"><label>Date</label><input type="date" id="r-appt-date"></div>
        <div class="fg" style="margin:0 0 8px;"><label>Time</label><input type="time" id="r-appt-time"></div>
        <div class="fg" style="margin:0 0 8px;"><label>Type</label><select id="r-appt-type"><option>Follow-up</option><option>MRI Review</option><option>Lab Review</option><option>Treatment Planning</option><option>Emergency</option><option>Teleconsult</option></select></div>
      </div>
      <div class="fg" style="margin:0 0 8px;"><label>Notes</label><input id="r-appt-notes"></div>
      <div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" data-action="cancelApptForm">Cancel</button><button class="btn btn-primary btn-sm" data-action="saveAppt">Save</button></div>
    </div>
    <div id="r-appt-list"></div>
    <div id="r-reminder-status" style="margin-top:16px;"></div>
  </div>

  <!-- ══ TAB 9: MDT NOTES ══ -->
  <div id="rt-mdt" class="rtab">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">Tumor Board / MDT Notes</div>
      <button class="btn btn-primary btn-sm" data-action="showFormDate:r-mdt-form,mdt-date">+ Add Meeting</button>
    </div>
    <div id="r-mdt-form" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px;">
      <div class="g2">
        <div class="fg" style="margin:0 0 10px;"><label>Meeting Date</label><input type="date" id="mdt-date"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Meeting Type</label><select id="mdt-type">${['Tumor Board','MDT Meeting','Case Conference','Second Opinion','Ethics Committee','Other'].map(o=>`<option>${o}</option>`).join('')}</select></div>
        <div class="fg" style="margin:0 0 10px;"><label>Venue</label><input id="mdt-venue" placeholder="e.g. AKUH MDT Room"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Chair</label><input id="mdt-chair" placeholder="e.g. Dr. Ahmed"></div>
      </div>
      <div class="fg" style="margin-bottom:10px;"><label>Attending Specialists</label><input id="mdt-attendees" placeholder="e.g. Neurosurgery, Rad Onc, Pathology"></div>
      <div class="fg" style="margin-bottom:10px;"><label>Case Summary</label><textarea id="mdt-presentation" rows="2" placeholder="Brief case summary"></textarea></div>
      <div class="fg" style="margin-bottom:10px;"><label>Recommendation</label><textarea id="mdt-recommendation" rows="3" placeholder="MDT recommendation"></textarea></div>
      <div class="fg" style="margin-bottom:10px;"><label>Action Items</label><textarea id="mdt-actions" rows="2" placeholder="1. Repeat MRI&#10;2. Refer palliative care"></textarea></div>
      <div style="display:flex;gap:8px;"><button class="btn btn-ghost btn-sm" data-action="hide:r-mdt-form">Cancel</button><button class="btn btn-primary" data-action="saveMDTNote">Save</button></div>
    </div>
    <div id="r-mdt-list"></div>
  </div>

  <!-- ══ TAB 10: IMAGING ══ -->
  <div id="rt-imaging" class="rtab">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">Imaging Reports</div>
      <button class="btn btn-primary btn-sm" data-action="showFormDate:r-imaging-form,img-date">+ Add Report</button>
    </div>
    <div id="r-imaging-form" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px;">
      <div class="g3">
        <div class="fg" style="margin:0 0 10px;"><label>Study Date</label><input type="date" id="img-date"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Modality</label><select id="img-modality">${['MRI Brain with contrast','MRI Brain w/o contrast','MRI Spine','CT Head','CT Chest/Abdomen/Pelvis','PET-CT','MR Spectroscopy','fMRI','DTI','Other'].map(o=>`<option>${o}</option>`).join('')}</select></div>
        <div class="fg" style="margin:0 0 10px;"><label>Facility</label><input id="img-facility" placeholder="e.g. AKUH Radiology"></div>
      </div>
      <div class="g2">
        <div class="fg" style="margin:0 0 10px;"><label>T1+Gd Findings</label><textarea id="img-t1" rows="2" placeholder="Enhancement characteristics"></textarea></div>
        <div class="fg" style="margin:0 0 10px;"><label>T2/FLAIR Findings</label><textarea id="img-t2" rows="2" placeholder="FLAIR signal, oedema"></textarea></div>
      </div>
      <div class="g3">
        <div class="fg" style="margin:0 0 10px;"><label>DWI/ADC</label><input id="img-dwi"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Mass Effect</label><input id="img-mass" placeholder="e.g. 5mm shift"></div>
        <div class="fg" style="margin:0 0 10px;"><label>Compared to Previous</label><select id="img-compare">${['First study','Stable','Decreased enhancement','Increased enhancement','New lesion','Post-op change','Pseudo-progression likely','Radiation necrosis likely'].map(o=>`<option>${o}</option>`).join('')}</select></div>
      </div>
      <div class="fg" style="margin-bottom:10px;"><label>Radiological Impression</label><textarea id="img-impression" rows="2" placeholder="Overall impression"></textarea></div>
      <div style="display:flex;gap:8px;"><button class="btn btn-ghost btn-sm" data-action="hide:r-imaging-form">Cancel</button><button class="btn btn-primary" data-action="saveImagingReport">Save Report</button></div>
    </div>
    <div id="r-imaging-list"></div>
  </div>

  <!-- ══ TAB 10b: TRENDS (v2.1) ══ -->
  <div id="rt-trends" class="rtab">
    <div class="rt-title">Vitals &amp; Lab Trends</div>
    <div id="r-trends-body" style="color:var(--text-muted);font-size:13px;">Loading trends…</div>
  </div>

  <!-- ══ TAB 11: HEALTH LOGS ══ -->
  <div id="rt-logs" class="rtab">
    <div class="rt-title">Patient Health Logs</div>
    <div id="r-logs-trends" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">Symptom Trends</div>
        <div style="display:flex;gap:4px;">${[7,14,30,90].map(d=>`<button data-action="renderLogsTrend:${p.mrn},${d}" style="padding:3px 9px;font-size:11px;font-family:inherit;font-weight:600;border-radius:6px;cursor:pointer;border:1px solid var(--border2);background:${d===7?'var(--blue)':'var(--surface2)'};color:${d===7?'#fff':'var(--text-muted)'};">${d}d</button>`).join('')}</div>
      </div>
      <div style="display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;font-size:12px;">
        <span style="color:var(--text-muted);">Avg mood: <strong id="r-avg-mood" style="color:var(--text);">—</strong></span>
        <span style="color:var(--text-muted);">Avg cognition: <strong id="r-avg-cog" style="color:var(--text);">—</strong></span>
        <span style="color:var(--text-muted);">Logs: <strong id="r-log-count" style="color:var(--text);">—</strong></span>
      </div>
    </div>
    <div id="r-logs-list"></div>
  </div>

  <!-- ══ CLINICAL NOTES ══ -->
  <div id="rt-notes" class="rtab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">📝 Clinical Notes</div>
      <div style="display:flex;gap:6px;">
        <select id="r-note-type" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:12px;background:var(--surface);color:var(--text);"><option value="progress">Progress Note</option><option value="soap">SOAP Note</option><option value="procedure">Procedure Note</option><option value="discharge">Discharge Summary</option><option value="consult">Consultation</option></select>
        <button class="btn btn-primary btn-sm" data-action="rNotesCreate">+ New Note</button>
      </div>
    </div>
    <div id="r-notes-editor" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div class="g2" style="margin-bottom:10px;"><div class="fg" style="margin:0;"><label>Subjective (S)</label><textarea id="r-note-s" rows="3" placeholder="Patient complaints, history..."></textarea></div><div class="fg" style="margin:0;"><label>Objective (O)</label><textarea id="r-note-o" rows="3" placeholder="Vitals, examination findings..."></textarea></div></div>
      <div class="g2" style="margin-bottom:10px;"><div class="fg" style="margin:0;"><label>Assessment (A)</label><textarea id="r-note-a" rows="3" placeholder="Diagnosis, impression..."></textarea></div><div class="fg" style="margin:0;"><label>Plan (P)</label><textarea id="r-note-p" rows="3" placeholder="Treatment plan, follow-up..."></textarea></div></div>
      <div id="r-note-free-wrap" style="display:none;margin-bottom:10px;"><div class="fg"><label>Notes</label><textarea id="r-note-free" rows="4" placeholder="Free text notes..."></textarea></div></div>
      <div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" data-action="hide:r-notes-editor">Cancel</button><button class="btn btn-primary btn-sm" data-action="rNotesSave">💾 Save Note</button><button class="btn btn-ghost btn-sm" data-action="rNotesSign">✍️ Sign</button></div>
    </div>
    <div id="r-notes-list"></div>
  </div>

  <!-- ══ CHEMOTHERAPY CYCLES ══ -->
  <div id="rt-chemo" class="rtab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">🧪 Chemotherapy Cycles</div>
      <button class="btn btn-primary btn-sm" data-action="rChemoShowForm">+ New Protocol</button>
    </div>
    <div id="r-chemo-form" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="font-size:18px;">💊</span><span style="font-weight:700;font-size:13px;">Start New Protocol</span></div>
      <div class="g2"><div class="fg" style="margin:0 0 10px;"><label>Protocol *</label><select id="r-chemo-protocol" data-action-change="rChemoLoadProtocol"><option value="">Select protocol...</option></select></div><div class="fg" style="margin:0 0 10px;"><label>Start Date *</label><input type="date" id="r-chemo-start"></div></div>
      <div class="g2"><div class="fg" style="margin:0 0 10px;"><label>Total Cycles</label><input type="number" id="r-chemo-total" value="6" min="1"></div><div class="fg" style="margin:0 0 10px;"><label>Cycle Length (days)</label><input type="number" id="r-chemo-length" value="28" min="1"></div></div>
      <div class="fg" style="margin:0 0 10px;"><label>Regimen Details</label><textarea id="r-chemo-regimen" rows="3" placeholder="Detailed regimen..."></textarea></div>
      <div class="fg" style="margin:0 0 10px;"><label>Notes</label><textarea id="r-chemo-notes" rows="2" placeholder="Additional notes..."></textarea></div>
      <div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" data-action="hide:r-chemo-form">Cancel</button><button class="btn btn-primary btn-sm" data-action="rChemoSave">🚀 Start Protocol</button></div>
    </div>
    <div id="r-chemo-list"></div>
  </div>

  <!-- ══ REFERRALS ══ -->
  <div id="rt-referrals" class="rtab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">🔀 Referrals</div>
      <button class="btn btn-primary btn-sm" data-action="rRefShowForm">+ New Referral</button>
    </div>
    <div id="r-ref-form" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div class="g2"><div class="fg" style="margin:0 0 10px;"><label>To Specialty *</label><select id="r-ref-specialty"><option>Neurosurgery</option><option>Radiation Oncology</option><option>Medical Oncology</option><option>Neurology</option><option>Palliative Care</option><option>Pathology</option><option>Rehabilitation</option><option>Psychology</option><option>Nutrition</option><option>Other</option></select></div><div class="fg" style="margin:0 0 10px;"><label>Provider</label><input id="r-ref-provider" placeholder="Specific doctor name"></div></div>
      <div class="fg" style="margin:0 0 10px;"><label>Reason *</label><textarea id="r-ref-reason" rows="2" placeholder="Reason for referral..."></textarea></div>
      <div class="fg" style="margin:0 0 10px;"><label>Clinical Summary</label><textarea id="r-ref-summary" rows="3" placeholder="Relevant clinical history..."></textarea></div>
      <div style="display:flex;gap:6px;align-items:center;"><div class="fg" style="margin:0;"><label>Urgency</label><select id="r-ref-urgency"><option value="routine">Routine</option><option value="expedited">Expedited</option><option value="urgent">Urgent</option></select></div><div style="flex:1;"></div><button class="btn btn-ghost btn-sm" data-action="hide:r-ref-form">Cancel</button><button class="btn btn-primary btn-sm" data-action="rRefSave">📤 Send Referral</button></div>
    </div>
    <div id="r-ref-list"></div>
  </div>

  <!-- ══ DOCUMENTS ══ -->
  <div id="rt-docs" class="rtab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">📎 Documents</div>
      <div style="display:flex;gap:6px;">
        <select id="r-doc-type" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:12px;background:var(--surface);color:var(--text);"><option value="consent">Consent Form</option><option value="pathology">Pathology Report</option><option value="imaging_report">Imaging Report</option><option value="referral_letter">Referral Letter</option><option value="other">Other</option></select>
        <label class="btn btn-primary btn-sm" style="cursor:pointer;">📎 Upload <input type="file" id="r-doc-file" style="display:none;" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" data-action-change="rDocsUpload"></label>
      </div>
    </div>
    <div id="r-docs-list"></div>

    <div class="rt-title" style="margin-top:18px;">🖼 Attachments (X-rays, lab PDFs, photos)</div>
    <div style="display:flex;gap:6px;margin-bottom:10px;">
      <label class="btn btn-primary btn-sm" style="cursor:pointer;">📤 Upload Attachment <input type="file" id="r-att-file" style="display:none;" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv" data-action-change="rAttUpload"></label>
    </div>
    <div id="r-att-list" style="display:flex;gap:10px;flex-wrap:wrap;"></div>
  </div>

  <!-- ══ PATIENT OUTCOMES ══ -->
  <div id="rt-outcomes" class="rtab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">📈 Patient Outcomes</div>
      <button class="btn btn-primary btn-sm" data-action="rOutShowForm">+ Record Outcome</button>
    </div>
    <div id="r-out-form" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div class="g2"><div class="fg" style="margin:0 0 10px;"><label>Outcome Type *</label><select id="r-out-type"><option value="response">Treatment Response</option><option value="survival">Survival Status</option><option value="qol">Quality of Life</option><option value="toxicity">Toxicity Assessment</option><option value="milestone">Clinical Milestone</option></select></div><div class="fg" style="margin:0 0 10px;"><label>Date *</label><input type="date" id="r-out-date"></div></div>
      <div class="fg" style="margin:0 0 10px;"><label>Value *</label><textarea id="r-out-value" rows="3" placeholder="e.g. CR, PR, SD, PD / ECOG 1 / Grade 2 neuropathy..."></textarea></div>
      <div class="fg" style="margin:0 0 10px;"><label>Notes</label><textarea id="r-out-notes" rows="2" placeholder="Additional context..."></textarea></div>
      <div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" data-action="hide:r-out-form">Cancel</button><button class="btn btn-primary btn-sm" data-action="rOutSave">💾 Record</button></div>
    </div>
    <div id="r-out-list"></div>
  </div>

  <!-- ══ NCCN GUIDELINES & BIOMARKERS ══ -->
  <div id="rt-nccn" class="rtab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">📋 NCCN Guidelines & 🧬 Biomarkers</div>
    </div>
    <div class="g2" style="margin-bottom:16px;">
      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">🧬 Patient Biomarkers</div>
        <div id="nccn-bio-list"><div class="empty-card">No biomarker results yet.</div></div>
        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">
          <div class="card-title" style="font-size:12px;margin-bottom:8px;">Add Biomarker</div>
          <div class="g2"><div class="fg" style="margin:0;"><label>Biomarker</label><select id="nccn-bio-name"><option>MGMT</option><option>EGFR</option><option>BRAF</option><option>IDH1</option><option>IDH2</option><option>1p19q</option><option>TERT</option><option>ATRX</option><option>PTEN</option><option>Ki-67</option><option>H3K27M</option></select></div><div class="fg" style="margin:0;"><label>Result</label><select id="nccn-bio-result"><option>Methylated</option><option>Unmethylated</option><option>Mutant</option><option>Wild Type</option><option>Amplified</option><option>Deleted</option><option>Loss</option><option>High</option><option>Normal</option><option>Positive</option><option>Negative</option></select></div></div>
          <div class="g2"><div class="fg" style="margin:0;"><label>Method</label><select id="nccn-bio-method"><option>IHC</option><option>FISH</option><option>NGS</option><option>PCR</option><option>Methylation Array</option><option>WGS</option></select></div><div class="fg" style="margin:0;"><label>Report Date</label><input type="date" id="nccn-bio-date"></div></div>
          <button class="btn btn-primary btn-sm" style="margin-top:8px;" data-action="addBiomarker">+ Add Biomarker</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">📋 Recommended Protocols</div>
        <div id="nccn-recommendations"><div class="empty-card">Add biomarkers to get NCCN-based recommendations.</div></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:12px;">💊 Cumulative Dose Tracker</div>
      <div id="cum-dose-list"><div class="empty-card">No cumulative doses tracked yet.</div></div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:12px;">📖 NCCN Protocol Library</div>
      <div class="fg"><label>Filter by cancer type</label><input id="nccn-filter" placeholder="e.g. glioblastoma, meningioma" data-action-input="filterNCCN"></div>
      <div id="nccn-protocol-list"></div>
    </div>
  </div>

  <!-- ══ BILLING (per-patient) ══ -->
  <div id="rt-billing" class="rtab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div class="rt-title" style="margin:0;padding:0;border:none;">💰 Billing &amp; Insurance</div>
      <div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" data-action="printLatestInvoice:@v:selectedMRN">🖨 Print latest</button><button class="btn btn-primary btn-sm" data-action="createPatientInvoice">+ New Invoice</button></div>
    </div>
    <div style="display:flex;gap:4px;background:var(--surface2);padding:3px;border-radius:8px;margin-bottom:16px;width:fit-content;">
      <button class="btn btn-ghost btn-sm active" data-action="switchPatientBillingTab:invoices,@this">📄 Invoices</button>
      <button class="btn btn-ghost btn-sm" data-action="switchPatientBillingTab:claims,@this">📤 Claims</button>
      <button class="btn btn-ghost btn-sm" data-action="switchPatientBillingTab:payments,@this">💳 Payments</button>
      <button class="btn btn-ghost btn-sm" data-action="switchPatientBillingTab:insurance,@this">🏥 Insurance</button>
    </div>
    <div id="pbv-invoices" class="pt-billing-tab"><div id="pt-billing-invoices"><div class="empty-card">No invoices for this patient.</div></div></div>
    <div id="pbv-claims" class="pt-billing-tab" style="display:none;"><div id="pt-billing-claims"><div class="empty-card">No claims for this patient.</div></div></div>
    <div id="pbv-payments" class="pt-billing-tab" style="display:none;"><div id="pt-billing-payments"><div class="empty-card">No payments recorded.</div></div></div>
    <div id="pbv-insurance" class="pt-billing-tab" style="display:none;">
      <div id="pt-billing-insurance"><div class="empty-card">No insurance on file.</div></div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">
        <div class="card-title" style="font-size:12px;margin-bottom:8px;">Add Insurance</div>
        <div class="g2"><div class="fg" style="margin:0;"><label>Payer Name</label><input id="ins-payer" placeholder="e.g. Blue Cross"></div><div class="fg" style="margin:0;"><label>Plan Type</label><select id="ins-plan"><option>HMO</option><option>PPO</option><option>EPO</option><option>Medicare</option><option>Medicaid</option><option>Tricare</option><option>Other</option></select></div></div>
        <div class="g2"><div class="fg" style="margin:0;"><label>Member ID</label><input id="ins-member" placeholder="Member ID"></div><div class="fg" style="margin:0;"><label>Group Number</label><input id="ins-group" placeholder="Group #"></div></div>
        <div class="g2"><div class="fg" style="margin:0;"><label>Copay ($)</label><input type="number" id="ins-copay" placeholder="0"></div><div class="fg" style="margin:0;"><label>Deductible ($)</label><input type="number" id="ins-deductible" placeholder="0"></div></div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:8px;"><input type="checkbox" id="ins-primary" checked> Primary insurance</label>
        <button class="btn btn-primary btn-sm" style="margin-top:12px;" data-action="addPatientInsurance">+ Add Insurance</button>
      </div>
    </div>
  </div>

  <!-- ══ TAB 12: EXPORT ══ -->
  <div id="rt-export" class="rtab">
    <div style="max-width:560px;">
      <div class="rt-title" style="border:none;padding:0 0 6px;">Generate Clinical Report</div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:10px;">Sections</div>
        <div class="g2">
          <label class="export-option"><input type="checkbox" id="exp-demo" checked> 🪪 Identity</label>
          <label class="export-option"><input type="checkbox" id="exp-metrics" checked> 📊 Metrics</label>
          <label class="export-option"><input type="checkbox" id="exp-diag" checked> 🔬 Diagnosis</label>
          <label class="export-option"><input type="checkbox" id="exp-mol" checked> 🧬 Molecular</label>
          <label class="export-option"><input type="checkbox" id="exp-labs" checked> 🧪 Labs</label>
          <label class="export-option"><input type="checkbox" id="exp-meds" checked> 💊 Prescriptions</label>
          <label class="export-option"><input type="checkbox" id="exp-tx" checked> ⚡ Treatment</label>
          <label class="export-option"><input type="checkbox" id="exp-appts" checked> 🗓 Appointments</label>
          <label class="export-option"><input type="checkbox" id="exp-mdt" checked> 📋 MDT Notes</label>
          <label class="export-option"><input type="checkbox" id="exp-img" checked> 🖼 Imaging</label>
          <label class="export-option"><input type="checkbox" id="exp-logs" checked> 📋 Health Logs</label>
          <label class="export-option"><input type="checkbox" id="exp-clinnotes" checked> 📝 Clinical Notes</label>
        </div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:10px;">Date Range</div>
        <div class="g2">
          <div class="fg" style="margin:0;"><label>From</label><input type="date" id="exp-date-from"></div>
          <div class="fg" style="margin:0;"><label>To</label><input type="date" id="exp-date-to" value="${new Date().toISOString().slice(0,10)}"></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" style="flex:1;" data-action="generatePDFDownload">🖨 Print / Preview</button>
        <button class="btn btn-primary" style="flex:2;" data-action="generatePDFDownload">⬇ Download as PDF</button>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-top:12px;">
        <div style="font-size:10px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">💡 How to Save as PDF</div>
        <div style="font-size:11px;color:#1e40af;line-height:1.6;">
          Click "Download as PDF" above → In the print dialog, select <b>"Save as PDF"</b> as the destination.<br>
          • <b>Chrome:</b> Destination → Save as PDF → Save<br>
          • <b>Firefox:</b> Print → PDF → Save<br>
          • <b>Safari:</b> PDF → Save as PDF<br>
          • <b>Edge:</b> Microsoft Print to PDF → Save
        </div>
      </div>
    </div>
  </div>

  <!-- ══ TAB 13: CREDENTIALS ══ -->
  <div id="rt-creds" class="rtab">
    <div class="g2" style="max-width:700px;">
      <div>
        <div class="cred-box" style="margin-bottom:16px;">
          <div class="cred-label">🔑 Patient Login Credentials</div>
          <div class="cred-row"><span class="cred-key">MRN</span><span class="cred-val">${p.mrn}</span></div>
          <div class="cred-row"><span class="cred-key">Password</span><span class="cred-val">${String(p.pass||'').startsWith('pbkdf2')?'•••••••• (encrypted)':esc(p.pass||'—')}</span></div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:10px;">Share with patient for VELTRUVIA Patient App.</div>
        </div>
        <div class="info-card">
          <div class="info-card-title">Reset Password</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" data-action="generateNewPassword:${p.mrn}">Auto-Generate &amp; Reset</button><button class="btn btn-ghost btn-sm" data-action="requestPasswordChange:${p.mrn}">🔑 Request OTP Change</button></div>
          <div id="cred-reset-msg" style="font-size:12px;margin-top:8px;display:none;"></div>
          <div id="cred-otp-msg" style="font-size:12px;margin-top:8px;display:none;"></div>
          <div id="cred-pending-reqs" style="margin-top:12px;display:none;"></div>
        </div>
      </div>
      <div>
        <div style="background:rgba(220,38,38,.05);border:1.5px solid rgba(220,38,38,.15);border-radius:10px;padding:14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--red);margin-bottom:10px;">⚠ Danger Zone</div>
          <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px;">Permanently delete this patient record.</div>
          <button class="btn btn-danger btn-full" data-action="deletePatient">🗑 Remove Patient</button>
        </div>
      </div>
    </div>
  </div>
  `;
}

// ── Calculations ──
function rCalcAge(){const dob=document.getElementById('r-dob')?.value;if(!dob)return;const age=Math.floor((Date.now()-new Date(dob))/(365.25*24*3600*1e3));document.getElementById('r-age').value=age;}
function rCalcBMI(){const h=parseFloat(document.getElementById('r-h')?.value),w=parseFloat(document.getElementById('r-w')?.value);if(h>0&&w>0){const bmi=(w/((h/100)**2)).toFixed(1);document.getElementById('r-bmi').value=bmi;const cat=document.getElementById('r-bmi-cat');if(cat){let lbl='',col='';const b=parseFloat(bmi);if(b<18.5){lbl='Underweight';col='var(--cyan)';}else if(b<25){lbl='Normal';col='var(--green)';}else if(b<30){lbl='Overweight';col='var(--orange)';}else{lbl='Obese';col='var(--red)';}cat.textContent='WHO: '+lbl;cat.style.cssText=`background:${col}22;color:${col};border:1px solid ${col}40;display:block;padding:5px 10px;border-radius:5px;font-size:11px;`;}}}
function rCalcBP(){const s=parseFloat(document.getElementById('r-sys')?.value),d=parseFloat(document.getElementById('r-dia')?.value);if(s>0&&d>0){const badge=document.getElementById('r-bp-badge');if(badge){let lbl='',col='';if(s>=180||d>=110){lbl='Grade 3 HTN';col='var(--red)';}else if(s>=160||d>=100){lbl='Grade 2 HTN';col='var(--red)';}else if(s>=140||d>=90){lbl='Grade 1 HTN';col='var(--orange)';}else if(s>=130||d>=85){lbl='High Normal';col='var(--orange)';}else if(s>=120||d>=80){lbl='Normal';col='var(--green)';}else{lbl='Optimal';col='var(--green)';}if(s>=140&&d<90)lbl='Isolated Systolic';badge.textContent=lbl;badge.style.cssText=`background:${col}22;color:${col};`;}}}
function rCalcSpO2(){const val=parseFloat(document.getElementById('r-spo2')?.value);const el=document.getElementById('r-spo2-alert');if(!el)return;if(isNaN(val)){el.style.display='none';return;}if(val<95){el.textContent='⚠ Hypoxaemia (SpO₂ < 95%)';el.style.cssText='display:block;background:rgba(220,38,38,.1);color:var(--red);padding:4px 10px;border-radius:4px;font-size:11px;';}else{el.style.display='none';}}
function rCalcTemp(){const val=parseFloat(document.getElementById('r-temp')?.value);const el=document.getElementById('r-temp-alert');if(!el)return;if(isNaN(val)){el.style.display='none';return;}if(val>=38.5){el.textContent='⚠ Fever (≥ 38.5°C)';el.style.cssText='display:block;background:rgba(220,38,38,.1);color:var(--red);padding:4px 10px;border-radius:4px;font-size:11px;';}else{el.style.display='none';}}
function rCalcGCS(){const e=parseInt(document.getElementById('r-gcs-e')?.value||0),v2=parseInt(document.getElementById('r-gcs-v')?.value||0),m=parseInt(document.getElementById('r-gcs-m')?.value||0);const tot=e+v2+m;if(e&&v2&&m)document.getElementById('r-gcs').value=tot;const lbl=document.getElementById('r-gcs-label');if(lbl&&tot>=3)lbl.textContent=tot>=13?'Mild (13-15)':tot>=9?'Moderate (9-12)':'Severe (3-8)';}
function rCalcEGFR(){const cr=parseFloat(document.getElementById('r-creat')?.value),age=parseInt(document.getElementById('r-age')?.value)||30,el=document.getElementById('r-egfr');if(!el||!cr||cr<=0){if(el)el.value='';return;}const k=0.9;let egfr=142*Math.pow(cr/k,-0.302)*Math.pow(0.9938,age);if(cr>k)egfr=142*Math.pow(cr/k,-1.200)*Math.pow(0.9938,age);egfr=Math.max(egfr,1).toFixed(0);el.value=egfr;const stage=document.getElementById('r-egfr-stage');if(stage){let st='',col='';if(egfr>=90){st='G1 – Normal';col='var(--green)';}else if(egfr>=60){st='G2 – Mildly decreased';col='var(--green)';}else if(egfr>=45){st='G3a – Mild-moderate';col='var(--orange)';}else if(egfr>=30){st='G3b – Moderate-severe';col='var(--orange)';}else if(egfr>=15){st='G4 – Severe';col='var(--red)';}else{st='G5 – Kidney failure';col='var(--red)';}stage.textContent=st;stage.style.color=col;}document.getElementById('r-bsa').value=calcBSA();}
function calcBSA(){const h=parseFloat(document.getElementById('r-h')?.value),w=parseFloat(document.getElementById('r-w')?.value);if(h>0&&w>0)return Math.sqrt((h*w)/3600).toFixed(2);return '';}
function calcEQD2(){const dose=parseFloat(document.getElementById('r-tx-dose')?.value),fx=parseFloat(document.getElementById('r-tx-frac')?.value),ab=parseFloat(document.getElementById('r-eqd2-ab')?.value)||2;if(dose>0&&fx>0){const dpf=dose/fx;const bed=dose*(1+dpf/ab);const eqd2=dose*(dpf+ab)/(2+ab);document.getElementById('r-bed-val').textContent=bed.toFixed(1);document.getElementById('r-eqd2-val').textContent=eqd2.toFixed(1);document.getElementById('r-dpf-display').textContent=dpf.toFixed(2);}else{document.getElementById('r-bed-val').textContent='—';document.getElementById('r-eqd2-val').textContent='—';document.getElementById('r-dpf-display').textContent='—';}}
function rCalcHR(){const hr=parseFloat(document.getElementById('r-hr')?.value);const alert=document.getElementById('r-hr-alert');if(!alert)return;if(hr<60){alert.textContent='⚠ Bradycardia';alert.style.cssText='display:block;background:rgba(26,86,219,.1);color:var(--blue);padding:3px 8px;border-radius:4px;font-size:11px;';}else if(hr>100){alert.textContent='⚠ Tachycardia';alert.style.cssText='display:block;background:rgba(220,38,38,.1);color:var(--red);padding:3px 8px;border-radius:4px;font-size:11px;';}else{alert.style.display='none';}}

// ── Allergies ──
function rAddAllergy(){const name=v('r-allergy-inp'),sev=v('r-allergy-sev');if(!name)return;rAllergies.push({name,severity:sev});document.getElementById('r-allergy-inp').value='';renderAllergyTags();}
function rRemoveAllergy(idx){rAllergies.splice(idx,1);renderAllergyTags();}
function renderAllergyTags(){const el=document.getElementById('r-allergy-tags');const badge=document.getElementById('r-allergy-count-badge');if(!el)return;el.innerHTML=rAllergies.map((a,i)=>{const col={Mild:'var(--green)',Moderate:'var(--orange)',Severe:'var(--red)','Life-threatening':'var(--red)'}[a.severity]||'var(--red)';return `<span class="atag" style="background:${col}11;border-color:${col}44;color:${col};">${esc(a.name)} <span class="atag-x" data-action="rRemoveAllergy:${i}">✕</span></span>`;}).join('');if(badge){badge.textContent=rAllergies.length;badge.style.display=rAllergies.length?'inline':'none';}}
function checkDrugAllergyWarning(){const el=document.getElementById('r-allergy-drug-warn');if(!el)return;const allergyNames=rAllergies.map(a=>a.name.toLowerCase());const activeMeds=rMeds.filter(m=>m.status==='Active').map(m=>m.name.toLowerCase());const hits=allergyNames.filter(an=>activeMeds.some(m=>m.includes(an)));if(hits.length){el.style.display='block';el.innerHTML='⚠️ <strong>Drug-Allergy Alert:</strong> Active medications may match allergies: '+hits.map(h=>'<strong>'+esc(h)+'</strong>').join(', ');}else{el.style.display='none';}}

// ── Comorbidities ──
function updateComorBadge(){const cbs=document.querySelectorAll('.comor-cb:checked');const badge=document.getElementById('r-comor-badge');if(badge){badge.textContent=cbs.length;badge.style.display=cbs.length?'inline':'none';}}
document.addEventListener('change',e=>{if(e.target.classList.contains('comor-cb'))updateComorBadge();});

// ── Disease Status ──
function setDS(btn,status){document.getElementById('r-ds').value=status;document.querySelectorAll('.ds-btn').forEach(b=>{b.classList.remove('active');b.style.cssText='';});btn.classList.add('active');const cols={Active:'#1a56db',Stable:'#0891b2',Remission:'#059669',Progression:'#dc2626',Relapse:'#d97706',Deceased:'#6e7681'};const c=cols[status]||'#888';btn.style.cssText='background:'+c+';border-color:'+c+';color:#fff;';}

// ── Labs ──
function showLabForm(){document.getElementById('r-lab-form').style.display='block';}
function hideLabForm(){document.getElementById('r-lab-form').style.display='none';}
function saveLabResult(){const entry={date:v('r-lab-date'),name:v('r-lab-test'),value:v('r-lab-val'),ref:v('r-lab-ref'),status:v('r-lab-status'),notes:''};if(!entry.name){AppDialog.alert('Enter a test name.');return;}rLabs.push(entry);hideLabForm();renderLabsTable();}
function renderLabsTable(){const body=document.getElementById('r-labs-body');const empty=document.getElementById('r-labs-empty');if(!rLabs.length){body.innerHTML='';empty.style.display='block';return;}empty.style.display='none';body.innerHTML=rLabs.map((l,i)=>{const sc={Normal:'var(--green)',High:'var(--orange)',Low:'var(--blue)',Critical:'var(--red)',Pending:'var(--text-dim)'}[l.status]||'var(--text-muted)';return `<tr><td style="font-family:var(--mono);font-size:11px;">${l.date||'—'}</td><td>${esc(l.name)}</td><td style="color:${sc};font-weight:600;">${esc(l.value)}</td><td style="font-size:11px;color:var(--text-dim);">${esc(l.ref)}</td><td><span class="badge" style="background:${sc}22;color:${sc};">${l.status}</span></td><td><button data-action="rLabs.splice:@t:${i},1" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button></td></tr>`;}).join('');}
// Pull lab-portal submissions for this patient off the server and surface them
// in the Labs table. Status stays neutral ('Result') — the lab reports values,
// the doctor decides the clinical interpretation. De-duped by submittedAt.
async function importLabSubs(mrn){
  try{
    const r=await api('/sync');
    const subs=(r.keys && r.keys['lab_subs_'+(currentDoc?.docId||'')] && r.keys['lab_subs_'+(currentDoc?.docId||'')].v)||[];
    const mine=subs.filter(s=>s&&s.mrn===mrn);
    const seen=new Set(rLabs.filter(l=>l.submittedAt).map(l=>l.submittedAt));
    let added=0;
    for(const s of mine){
      if(s.submittedAt==null||seen.has(s.submittedAt))continue;
      rLabs.push({date:s.date||'',name:s.test||'Lab result',value:s.results||'',ref:s.labName||'',status:'Result',submittedAt:s.submittedAt});
      seen.add(s.submittedAt);added++;
    }
    if(added)renderLabsTable();
  }catch(e){/* offline or no subs — table stays as-is */}
}
async function filterLabTests(q){const dd=document.getElementById('lab-test-dropdown');if(!dd)return;const matches=q?LAB_TESTS.filter(t=>t.name.toLowerCase().includes(q.toLowerCase())||t.group.toLowerCase().includes(q.toLowerCase())):LAB_TESTS.slice(0,20);const grouped={};matches.forEach(t=>{if(!grouped[t.group])grouped[t.group]=[];grouped[t.group].push(t.name);});dd.innerHTML=Object.entries(grouped).map(([g,tests])=>{let h='<div style="padding:4px 10px;font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;">'+g+'</div>';tests.forEach(t=>{h+='<div style="padding:6px 10px;font-size:12px;cursor:pointer;color:var(--text);" data-action-mousedown="selectval:r-lab-test">'+t+'</div>';});return h;}).join('');dd.style.display=matches.length?'block':'none';}
function showLabTestDropdown(){filterLabTests(document.getElementById('r-lab-test')?.value||'');}
function hideLabTestDropdown(){const dd=document.getElementById('lab-test-dropdown');if(dd)dd.style.display='none';}

const LAB_TESTS=[
{group:'Haematology',name:'CBC'},{group:'Haematology',name:'Haemoglobin'},{group:'Haematology',name:'WBC'},{group:'Haematology',name:'Platelets'},{group:'Haematology',name:'ANC'},{group:'Haematology',name:'HCT'},
{group:'Liver',name:'ALT'},{group:'Liver',name:'AST'},{group:'Liver',name:'ALP'},{group:'Liver',name:'Bilirubin'},{group:'Liver',name:'Albumin'},
{group:'Renal',name:'Creatinine'},{group:'Renal',name:'BUN'},{group:'Renal',name:'eGFR'},{group:'Renal',name:'Uric Acid'},
{group:'Electrolytes',name:'Sodium'},{group:'Electrolytes',name:'Potassium'},{group:'Electrolytes',name:'Chloride'},{group:'Electrolytes',name:'Calcium'},{group:'Electrolytes',name:'Magnesium'},
{group:'Coagulation',name:'PT/INR'},{group:'Coagulation',name:'aPTT'},{group:'Coagulation',name:'D-Dimer'},
{group:'Tumour Markers',name:'CEA'},{group:'Tumour Markers',name:'AFP'},{group:'Tumour Markers',name:'CA-125'},{group:'Tumour Markers',name:'NSE'},{group:'Tumour Markers',name:'S-100B'},
{group:'Endocrine',name:'TSH'},{group:'Endocrine',name:'Free T4'},{group:'Endocrine',name:'Cortisol'},
{group:'Lipids',name:'Total Cholesterol'},{group:'Lipids',name:'LDL'},{group:'Lipids',name:'HDL'},{group:'Lipids',name:'Triglycerides'},
{group:'Inflammatory',name:'CRP'},{group:'Inflammatory',name:'ESR'},{group:'Inflammatory',name:'Ferritin'},{group:'Inflammatory',name:'LDH'},
{group:'CSF',name:'CSF Protein'},{group:'CSF',name:'CSF Glucose'},{group:'CSF',name:'CSF Cell Count'},{group:'CSF',name:'CSF Cytology'},
{group:'Other',name:'HbA1c'},{group:'Other',name:'Vitamin D'},{group:'Other',name:'B12'}
];

// ── Prescriptions (merged E-Prescribing & Medication Management) ──

// ── Save local medication (legacy) ──
function showMedForm(){document.getElementById('r-rx-create-form').style.display='block';}
function hideMedForm(){document.getElementById('r-rx-create-form').style.display='none';document.getElementById('r-med-allergy-check').style.display='none';document.getElementById('r-med-interaction-check').style.display='none';}
function saveMed(){const med={name:v('r-med-name'),dose:v('r-med-dose'),route:v('r-med-route'),freq:v('r-med-freq'),indication:v('r-med-indication'),status:'Active',addedAt:Date.now()};if(!med.name){AppDialog.alert('Enter drug name.');return;}rMeds.push(med);hideMedForm();renderMedList();checkDrugAllergyWarning();renderDrugInteractionBanner(selectedMRN);}

// ── Live allergy check on med input ──
let _rxAllergyTimeout=null;
function rRxLiveAllergyCheck(name){
  const el=document.getElementById('r-med-allergy-check');
  if(!el)return;
  clearTimeout(_rxAllergyTimeout);
  if(!name||name.length<2||!selectedMRN){el.style.display='none';return;}
  _rxAllergyTimeout=setTimeout(async()=>{
    try{
      const r=await api('/cds/allergy-check',{method:'POST',body:JSON.stringify({patientMrn:selectedMRN,medications:[name]})});
      if(r.ok&&r.alerts&&r.alerts.length){
        el.style.display='block';
        el.innerHTML='<strong>⚠️ ALLERGY WARNING:</strong> '+r.alerts.map(a=>a.message).join(' | ');
      }else{el.style.display='none';}
    }catch(e){el.style.display='none';}
  },400);
  // Also check interactions with current meds
  const intEl=document.getElementById('r-med-interaction-check');
  if(intEl){
    const activeMeds=(rMeds||[]).filter(m=>m.status==='Active').map(m=>m.name).filter(Boolean);
    if(activeMeds.length>=1){
      const allMeds=[name,...activeMeds];
      setTimeout(async()=>{
        try{
          const r2=await api('/cds/interactions',{method:'POST',body:JSON.stringify({medications:allMeds})});
          if(r2.ok&&r2.interactions&&r2.interactions.length){
            intEl.style.display='block';
            intEl.innerHTML='<strong>⚠️ INTERACTIONS:</strong> '+r2.interactions.map(i=>i.drug_a+' ↔ '+i.drug_b+' ('+i.severity+')').join(' | ');
          }else{intEl.style.display='none';}
        }catch(e){intEl.style.display='none';}
      },500);
    }
  }
}

// ── Prescribe with full CDS check (server e-prescription) ──
async function rRxPrescribeWithCDS(){
  if(!selectedMRN)return;
  const med=v('r-med-name');const dose=v('r-med-dose');const freq=v('r-med-freq');
  if(!med||!dose){AppDialog.alert('Enter medication and dosage');return}
  // Run allergy check
  let allergyBlocked=false;
  try{
    const r=await api('/cds/allergy-check',{method:'POST',body:JSON.stringify({patientMrn:selectedMRN,medications:[med]})});
    if(r.ok&&r.alerts&&r.alerts.length){
      if(!await AppDialog.confirm('⚠️ ALLERGY WARNING:\n'+r.alerts.map(a=>a.message).join('\n')+'\n\nProceed anyway?'))return;
      allergyBlocked=true;
    }
  }catch(e){}
  // Create server prescription
  try{
    const r=await api('/rx',{method:'POST',body:JSON.stringify({
      patientMrn:selectedMRN,medication:med,
      genericName:v('r-rx-generic')||undefined,
      dosage:dose,frequency:freq,
      route:v('r-med-route'),duration:v('r-med-dur')||undefined,
      quantity:parseInt(v('r-med-qty'))||undefined,
      refills:parseInt(v('r-med-refills'))||0,
      pharmacy:v('r-med-pharmacy')||undefined,
      instructions:v('r-med-instructions')||undefined
    })});
    if(r.ok){
      // Also add to local med list
      rMeds.push({name:med,dose:dose,route:v('r-med-route'),freq:freq,indication:v('r-med-indication'),status:'Active',addedAt:Date.now()});
      // Show warnings if any
      if(r.warnings&&r.warnings.length){
        AppDialog.alert('✅ Prescription created.\n\n⚠️ '+r.warnings.length+' safety warning(s) flagged:\n'+r.warnings.map(w=>w.message).join('\n'));
      }else{
        AppDialog.alert('✅ Prescription created: '+med+' '+dose);
      }
      // Clear form
      document.getElementById('r-med-name').value='';
      document.getElementById('r-med-dose').value='';
      document.getElementById('r-med-instructions').value='';
      document.getElementById('r-med-allergy-check').style.display='none';
      document.getElementById('r-med-interaction-check').style.display='none';
      document.getElementById('r-rx-create-form').style.display='none';
      // Refresh lists
      renderMedList();
      rRxLoadServerPrescriptions();
      rRxLoadAllergySummary();
      checkDrugAllergyWarning();
      renderDrugInteractionBanner(selectedMRN);
    }
  }catch(e){AppDialog.alert(e.message)}
}

// ── Load allergy summary in prescriptions tab ──
async function rRxLoadAllergySummary(){
  if(!selectedMRN)return;
  const wrap=document.getElementById('r-rx-allergy-summary');
  const tags=document.getElementById('r-rx-allergy-tags');
  if(!wrap||!tags)return;
  try{
    const r=await api('/cds/allergies/'+selectedMRN);
    if(!r.ok||!r.allergies||!r.allergies.length){wrap.style.display='none';return;}
    const sevColors={mild:'var(--green)',moderate:'var(--orange)',severe:'var(--red)',anaphylaxis:'#dc2626'};
    tags.innerHTML=r.allergies.map(a=>{
      const c=sevColors[a.severity]||'var(--red)';
      return `<span style="display:inline-flex;align-items:center;gap:4px;background:${c}11;border:1px solid ${c}44;color:${c};padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;">⚠ ${a.drug_name} <span style="font-size:9px;text-transform:uppercase;opacity:.8;">${a.severity}</span></span>`;
    }).join('');
    wrap.style.display='block';
  }catch(e){wrap.style.display='none';}
}

// ── Load server-side prescriptions ──
async function rRxLoadServerPrescriptions(){
  if(!selectedMRN)return;
  const el=document.getElementById('r-rx-server-list');
  if(!el)return;
  try{
    const r=await api('/rx/patient/'+selectedMRN);
    if(!r.ok||!r.prescriptions||!r.prescriptions.length){el.innerHTML='<div class="empty-card">No e-prescriptions on file.</div>';return;}
    const statusColors={active:'var(--green)',completed:'var(--text-muted)',cancelled:'var(--red)',expired:'var(--orange)','pending-refill':'var(--orange)'};
    el.innerHTML=r.prescriptions.map(rx=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:13px;">💊 ${rx.medication}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${rx.dosage} · ${rx.frequency} · ${rx.route||'oral'}${rx.duration?' · '+rx.duration:''}</div>
          ${rx.instructions?`<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">📝 ${rx.instructions}</div>`:''}
          ${rx.pharmacy?`<div style="font-size:11px;color:var(--text-dim);">🏪 ${rx.pharmacy}</div>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${rx.status==='active'?`<button class="btn btn-ghost btn-sm" data-action="updateRxServer:${rx.id},completed">Complete</button><button class="btn btn-danger btn-sm" data-action="updateRxServer:${rx.id},cancelled">Cancel</button>`:''}
          ${rx.status==='pending-refill'?`<button class="btn btn-primary btn-sm" data-action="updateRxServer:${rx.id},active">Approve Refill</button>`:''}
          <span style="font-size:10px;font-weight:700;color:${statusColors[rx.status]};text-transform:uppercase;">${rx.status}</span>
          <span style="font-size:10px;color:var(--text-dim);">${rx.created_at?.split('T')[0]||''}</span>
        </div>
      </div>
    `).join('');
  }catch(e){el.innerHTML='<div class="empty-card">Error loading prescriptions.</div>'}
}
async function updateRxServer(id,status){
  try{await api('/rx',{method:'PATCH',body:JSON.stringify({prescriptionId:id,status})});
  rRxLoadServerPrescriptions();}catch(e){AppDialog.alert(e.message)}
}
function renderMedList(){const el=document.getElementById('r-med-list');if(!rMeds.length){el.innerHTML='<div class="empty-card">No medications recorded.</div>';return;}const sorted=[...rMeds].sort((a,b)=>a.status==='Active'?-1:b.status==='Active'?1:0);el.innerHTML=sorted.map((m,i)=>{const idx=rMeds.indexOf(m);const sc={Active:'var(--green)','On Hold':'var(--orange)',Discontinued:'var(--red)'}[m.status]||'var(--text-dim)';return `<div class="med-item"><div><div style="font-weight:600;">💊 ${esc(m.name)}</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${esc(m.dose)} · ${m.route} · ${m.freq}</div></div><span class="badge" style="background:${sc}22;color:${sc};">${m.status}</span></div>`;}).join('');}

// ── Drug Interactions (banner list) ──
const DRUG_INTERACTION_PAIRS=[
{drugs:['temozolomide','ondansetron'],warn:'QT prolongation risk.'},{drugs:['temozolomide','valproate'],warn:'Valproate inhibits TMZ clearance.'},
{drugs:['dexamethasone','warfarin'],warn:'Alters warfarin metabolism.'},{drugs:['dexamethasone','insulin'],warn:'Steroid-induced hyperglycaemia.'},
{drugs:['phenytoin','temozolomide'],warn:'CYP3A4 inducer — may reduce TMZ efficacy.'},{drugs:['bevacizumab','aspirin'],warn:'Increased haemorrhage risk.'},
{drugs:['methotrexate','nsaid'],warn:'NSAIDs reduce MTX excretion.'},{drugs:['methotrexate','aspirin'],warn:'Increased MTX toxicity.'},
{drugs:['cyclophosphamide','allopurinol'],warn:'Prolonged half-life.'},{drugs:['procarbazine','alcohol'],warn:'MAOI — alcohol interaction.'},
{drugs:['lomustine','cimetidine'],warn:'Increased haematologic toxicity.'},{drugs:['irinotecan','ketoconazole'],warn:'Increased irinotecan toxicity.'},
{drugs:['vincristine','azole'],warn:'Increased neurotoxicity.'},{drugs:['erlotinib','antacid'],warn:'Reduced erlotinib absorption.'},
{drugs:['olaparib','ketoconazole'],warn:'Increased olaparib exposure.'},{drugs:['pembrolizumab','prednisone'],warn:'Steroids may reduce ICI efficacy.'},
{drugs:['nivolumab','prednisone'],warn:'Steroids may blunt immune response.'},{drugs:['gefitinib','phenytoin'],warn:'Reduced gefitinib levels.'},
{drugs:['lapatinib','warfarin'],warn:'Elevated warfarin levels.'},{drugs:['carbamazepine','temozolomide'],warn:'Lowers TMZ plasma levels.'},
{drugs:['bevacizumab','heparin'],warn:'CNS haemorrhage risk.'},{drugs:['irinotecan','phenytoin'],warn:'Reduces irinotecan efficacy.'},
{drugs:['levetiracetam','methotrexate'],warn:'May reduce MTX clearance.'},{drugs:['dexamethasone','metformin'],warn:'Antagonises metformin.'}
];
function renderDrugInteractionBanner(mrn){const el=document.getElementById('r-drug-interaction-banner');if(!el)return;const p=LS.get('pat_'+mrn);if(!p)return;const names=(p.meds||[]).filter(m=>m.status==='Active').map(m=>(m.name||'').toLowerCase());const hits=[];DRUG_INTERACTION_PAIRS.forEach(pair=>{const matched=pair.drugs.filter(d=>names.some(n=>n.includes(d)));if(matched.length>=2)hits.push({pair:matched.join(' + '),warn:pair.warn});});if(hits.length){el.style.display='block';el.innerHTML='<strong>⚠ Drug Interactions (illustrative only — not a clinical database):</strong><br>'+hits.map(h=>'<span style="display:block;margin-top:4px;">• <strong>'+esc(h.pair)+'</strong> — '+esc(h.warn)+'</span>').join('');}else{el.style.display='none';}}

// ── Treatment Entries ──
function showTxEntryForm(){document.getElementById('r-tx-entry-form').style.display='block';}
function hideTxEntryForm(){document.getElementById('r-tx-entry-form').style.display='none';}
function saveTxEntry(){const p=LS.get('pat_'+selectedMRN);if(!p)return;if(!p.txEntries)p.txEntries=[];p.txEntries.unshift({date:v('txe-date'),type:v('txe-type'),drug:v('txe-drug'),notes:v('txe-notes'),addedAt:Date.now()});LS.set('pat_'+selectedMRN,p);pushToServer({['pat_'+selectedMRN]:p});hideTxEntryForm();renderTxEntries(p.txEntries);flash('Entry saved');}
function renderTxEntries(entries){const body=document.getElementById('r-tx-entries-body');if(!body)return;body.innerHTML=(entries||[]).map((e,i)=>`<tr><td style="font-family:var(--mono);font-size:11px;">${e.date||'—'}</td><td>${esc(e.type)}</td><td>${esc(e.drug)}</td><td>${esc(e.notes)}</td><td><button data-action="deleteTxEntry:${i}" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button></td></tr>`).join('');}
function deleteTxEntry(idx){const p=LS.get('pat_'+selectedMRN);if(!p)return;p.txEntries.splice(idx,1);LS.set('pat_'+selectedMRN,p);pushToServer({['pat_'+selectedMRN]:p});renderTxEntries(p.txEntries);}

// ── Appointments ──
function openAddApptForm(){document.getElementById('r-add-appt-form').style.display='block';}
function cancelApptForm(){document.getElementById('r-add-appt-form').style.display='none';}
async function saveAppt(){const appt={date:v('r-appt-date'),time:v('r-appt-time'),type:v('r-appt-type'),notes:v('r-appt-notes'),status:'Scheduled',createdAt:Date.now()};if(!appt.date){AppDialog.alert('Select date.');return;}const key='appts_'+selectedMRN;const appts=LS.get(key)||[];appts.push(appt);LS.set(key,appts);pushToServer({[key]:appts});try{await api('/sync/save-appointment',{method:'POST',body:JSON.stringify({mrn:selectedMRN,appointment:appt})})}catch(e){console.warn('[appt] save to store failed:',e.message)}cancelApptForm();renderRecordAppts(selectedMRN);flash('Appointment saved');}
async function updateApptStatus(mrn,idx,newStatus){try{await api('/sync/update-appointment',{method:'POST',body:JSON.stringify({mrn,index:idx,status:newStatus})})}catch(e){console.warn('[appt] sync update failed:',e.message)}const appts=LS.get('appts_'+mrn)||[];const appt=appts.sort((a,b)=>new Date(b.date)-new Date(a.date))[idx];if(appt){appt.status=newStatus;appt.respondedAt=Date.now();LS.set('appts_'+mrn,appts)}renderRecordAppts(mrn);flash('Appointment '+newStatus.toLowerCase());}
async function rescheduleAppt(mrn,idx){const appts=LS.get('appts_'+mrn)||[];const sorted=appts.sort((a,b)=>new Date(b.date)-new Date(a.date));const appt=sorted[idx];if(!appt)return;const oldDate=appt.date;const newDate=await AppDialog.prompt('Enter new date (YYYY-MM-DD):',appt.date,{title:'Reschedule Appointment',required:true});if(!newDate)return;const newTime=await AppDialog.prompt('Enter new time (HH:MM) or leave blank:',appt.time||'');appt.date=newDate;appt.time=newTime||appt.time;appt.status='Scheduled';appt.rescheduledFrom=oldDate;appt.respondedAt=Date.now();LS.set('appts_'+mrn,appts);renderRecordAppts(mrn);flash('Appointment rescheduled to '+newDate);}
async function renderRecordAppts(mrn){const el=document.getElementById('r-appt-list');if(!el)return;let appts=[];try{const r=await api('/sync/get-appointments/'+mrn);if(r&&r.ok&&r.appointments){appts=r.appointments;}}catch(e){}if(!appts.length)appts=LS.get('appts_'+mrn)||[];if(!appts.length){el.innerHTML='<div class="empty-card">No appointments scheduled.</div>';return;}el.innerHTML=appts.sort((a,b)=>new Date(b.date)-new Date(a.date)).map((a,i)=>{const sc={Confirmed:'var(--green)',Requested:'var(--orange)',Declined:'var(--red)',Scheduled:'var(--blue)'}[a.status]||'var(--text-dim)';const isRequested=a.status==='Requested';let actionBtns='';if(isRequested){actionBtns=`<div style="display:flex;gap:4px;margin-top:8px;"><button class="btn btn-sm" style="background:var(--green);color:#fff;padding:4px 10px;font-size:11px;border-radius:6px;border:none;cursor:pointer;" data-action="stop;;updateApptStatus:${mrn},${i},Confirmed">✓ Confirm</button><button class="btn btn-sm" style="background:var(--red);color:#fff;padding:4px 10px;font-size:11px;border-radius:6px;border:none;cursor:pointer;" data-action="stop;;updateApptStatus:${mrn},${i},Declined">✕ Decline</button><button class="btn btn-sm" style="background:var(--blue);color:#fff;padding:4px 10px;font-size:11px;border-radius:6px;border:none;cursor:pointer;" data-action="stop;;rescheduleAppt:${mrn},${i}">📅 Reschedule</button></div>`;}return `<div style="padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;"><div style="display:flex;align-items:center;justify-content:space-between;"><div><div style="font-weight:600;font-size:13px;">${a.date} ${a.time||''}</div><div style="font-size:12px;color:var(--text-muted);">${a.type}${a.notes?' · '+esc(a.notes):''}${a.rescheduledFrom?'<br><span style="color:var(--orange);font-size:11px;">📅 Rescheduled from '+a.rescheduledFrom+'</span>':''}</div></div><span class="badge" style="background:${sc}22;color:${sc};">${a.status}</span></div>${actionBtns}</div>`;}).join('');}

// ── MDT Notes ──
function saveMDTNote(){const note={date:v('mdt-date'),type:v('mdt-type'),venue:v('mdt-venue'),chair:v('mdt-chair'),attendees:v('mdt-attendees'),presentation:v('mdt-presentation'),recommendation:v('mdt-recommendation'),actions:v('mdt-actions'),addedAt:Date.now()};const p=LS.get('pat_'+selectedMRN);if(!p)return;if(!p.mdtNotes)p.mdtNotes=[];p.mdtNotes.unshift(note);LS.set('pat_'+selectedMRN,p);pushToServer({['pat_'+selectedMRN]:p});document.getElementById('r-mdt-form').style.display='none';renderMDTNotes(selectedMRN);flash('MDT note saved');}
function renderMDTNotes(mrn){const p=LS.get('pat_'+mrn);const el=document.getElementById('r-mdt-list');if(!el||!p)return;const notes=p.mdtNotes||[];if(!notes.length){el.innerHTML='<div class="empty-card">No MDT notes yet.</div>';return;}el.innerHTML=notes.map((n,i)=>`<div class="info-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><span class="badge badge-blue">${esc(n.type)}</span><strong>${esc(n.date)}</strong><button data-action="deleteMDTNote:${i}" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button></div>${n.chair?`<div style="font-size:12px;color:var(--text-muted);">Chair: ${esc(n.chair)}</div>`:''}${n.recommendation?`<div style="margin-top:6px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Recommendation</div><div style="font-size:13px;margin-top:2px;">${esc(n.recommendation)}</div></div>`:''}${n.actions?`<div style="margin-top:4px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Actions</div><div style="font-size:12px;margin-top:2px;white-space:pre-line;">${esc(n.actions)}</div></div>`:''}</div>`).join('');}
function deleteMDTNote(idx){const p=LS.get('pat_'+selectedMRN);if(!p)return;p.mdtNotes.splice(idx,1);LS.set('pat_'+selectedMRN,p);pushToServer({['pat_'+selectedMRN]:p});renderMDTNotes(selectedMRN);}

// ── Imaging ──
function saveImagingReport(){const report={date:v('img-date'),modality:v('img-modality'),facility:v('img-facility'),t1:v('img-t1'),t2:v('img-t2'),dwi:v('img-dwi'),mass:v('img-mass'),compare:v('img-compare'),impression:v('img-impression'),addedAt:Date.now()};const p=LS.get('pat_'+selectedMRN);if(!p)return;if(!p.imaging)p.imaging=[];p.imaging.unshift(report);LS.set('pat_'+selectedMRN,p);pushToServer({['pat_'+selectedMRN]:p});document.getElementById('r-imaging-form').style.display='none';renderImagingReports(selectedMRN);flash('Imaging report saved');}
function renderImagingReports(mrn){const p=LS.get('pat_'+mrn);const el=document.getElementById('r-imaging-list');if(!el||!p)return;const reports=p.imaging||[];if(!reports.length){el.innerHTML='<div class="empty-card">No imaging reports.</div>';return;}el.innerHTML=reports.map((r,i)=>{const compColors={'Stable':'var(--green)','Decreased enhancement':'var(--green)','Increased enhancement':'var(--red)','New lesion':'var(--red)','Pseudo-progression likely':'var(--orange)','Radiation necrosis likely':'var(--orange)'};const compCol=compColors[r.compare]||'var(--text-muted)';return `<div class="info-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><strong>${esc(r.date)}</strong><span class="badge badge-blue">${esc(r.modality)}</span></div>${r.t1?`<div style="margin-bottom:4px;"><span style="font-size:10px;font-weight:700;color:var(--text-dim);">T1+Gd:</span> <span style="font-size:12px;">${esc(r.t1)}</span></div>`:''}${r.t2?`<div style="margin-bottom:4px;"><span style="font-size:10px;font-weight:700;color:var(--text-dim);">T2/FLAIR:</span> <span style="font-size:12px;">${esc(r.t2)}</span></div>`:''}${r.compare?`<div style="font-size:12px;margin-top:4px;"><span style="color:var(--text-dim);">Comparison:</span> <span style="color:${compCol};font-weight:600;">${esc(r.compare)}</span></div>`:''}${r.impression?`<div style="font-size:13px;font-weight:600;margin-top:6px;">${esc(r.impression)}</div>`:''}</div>`;}).join('');}

// ── Health Logs ──
async function renderRecordLogs(mrn){const el=document.getElementById('r-logs-list');if(!el)return;
  let logEntries=[];
  try{const r=await api('/sync/get-logs/'+mrn);if(r&&r.ok&&r.logs){logEntries=Object.entries(r.logs).map(([date,log])=>({date,...log}));}}catch(e){}
  // Also merge localStorage logs
  const localKeys=LS.keys('log_'+mrn+'_');localKeys.forEach(k=>{const log=LS.get(k);if(log&&logEntries.every(l=>l.date!==log.date))logEntries.push(log);});
  logEntries.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,30);
  if(!logEntries.length){el.innerHTML='<div class="empty-card">No health logs recorded by patient.</div>';return;}
  el.innerHTML=logEntries.map(log=>{const syms=[{l:'🧠 Cognitive',s:log.cognitive},{l:'⚡ Seizure',s:log.seizure},{l:'👁️ Vision',s:log.vision},{l:'🤕 Headache',s:log.headache},{l:'😴 Fatigue',s:log.fatigue},{l:'🤢 Nausea',s:log.nausea},{l:'🍽️ Appetite',s:log.appetite},{l:'🌙 Sleep',s:log.sleep},{l:'😊 Mood',s:log.mood}];let vitalsH='';if(log.temp||log.bp||log.weight)vitalsH=`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-size:11px;">${log.temp?'🌡️ '+log.temp+'°C ':''}${log.bp?'💓 '+log.bp+' ':''}${log.weight?'⚖️ '+log.weight+'kg ':''}${log.meds?'💊 '+esc(log.meds):''}</div>`;let alertsH='';if((log.headache||0)>7)alertsH+='<div style="color:var(--red);font-weight:600;margin-top:4px;">⚠ High pain score (>7)</div>';if((log.cognitive||0)<4)alertsH+='<div style="color:var(--red);font-weight:600;">⚠ Low cognition (<4)</div>';return `<div style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${(log.headache||0)>7||((log.cognitive||0)<4)?'var(--red)':'var(--green)'};border-radius:8px;margin-bottom:8px;font-size:12px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><strong>${log.date}</strong><span style="font-size:10px;color:var(--text-dim);">${new Date(log.savedAt||log.date).toLocaleTimeString()}</span></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">${syms.map(s=>{const v=s.s||0;const c=v<=3?'var(--green)':v<=6?'var(--orange)':'var(--red)';return `<div style="font-size:11px;"><span style="color:var(--text-dim);">${s.l}</span> <span style="color:${c};font-weight:600;">${v}/10</span></div>`;}).join('')}</div>${vitalsH}${alertsH}${log.notes?'<div style="margin-top:6px;color:var(--text-muted);font-size:11px;">'+esc(log.notes)+'</div>':''}</div>`;}).join('');}
function renderLogsTrend(mrn,days){/* Placeholder for trend rendering */}
function renderQuickSummary(){/* Quick summary already rendered in identity tab */}

// ── ICD Browser ──
const ICD_DB=[
{code:'C71',label:'Malignant neoplasm of brain',version:'icd10',group:'malignant'},{code:'C71.0',label:'Cerebrum',version:'icd10',group:'malignant'},
{code:'C71.1',label:'Frontal lobe',version:'icd10',group:'malignant'},{code:'C71.2',label:'Temporal lobe',version:'icd10',group:'malignant'},
{code:'C71.3',label:'Parietal lobe',version:'icd10',group:'malignant'},{code:'C71.4',label:'Occipital lobe',version:'icd10',group:'malignant'},
{code:'C71.5',label:'Ventricle',version:'icd10',group:'malignant'},{code:'C71.6',label:'Cerebellum',version:'icd10',group:'malignant'},
{code:'C71.7',label:'Brain stem',version:'icd10',group:'malignant'},{code:'C71.9',label:'Brain NOS',version:'icd10',group:'malignant'},
{code:'C70.0',label:'Cerebral meninges',version:'icd10',group:'malignant'},{code:'C72.0',label:'Spinal cord',version:'icd10',group:'malignant'},
{code:'C79.31',label:'Brain metastasis',version:'icd10',group:'secondary'},
{code:'D32.0',label:'Benign meningioma',version:'icd10',group:'benign'},{code:'D33.0',label:'Benign brain supratentorial',version:'icd10',group:'benign'},
{code:'D43.0',label:'Uncertain behaviour brain',version:'icd10',group:'benign'},
{code:'2A00',label:'Primary brain neoplasms',version:'icd11',group:'malignant'},{code:'2A00.0',label:'Gliomas',version:'icd11',group:'malignant'},
{code:'2A00.1',label:'Embryonal tumours',version:'icd11',group:'malignant'},{code:'2A01',label:'Meningeal neoplasms',version:'icd11',group:'malignant'},
{code:'2D50',label:'Brain metastasis',version:'icd11',group:'secondary'}
];
let icdActiveFilter='all',icdSelectedCode=null;
function openICDLookup(){icdSelectedCode=null;document.getElementById('icd-search').value='';document.getElementById('icd-selected-preview').style.display='none';icdActiveFilter='all';document.querySelectorAll('.icd-filter-btn').forEach(b=>b.classList.remove('active'));document.querySelector('.icd-filter-btn').classList.add('active');renderICDResults();openOverlay('icd-lookup-modal');}
function setICDFilter(f,btn){icdActiveFilter=f;document.querySelectorAll('.icd-filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');filterICD();}
function filterICD(){renderICDResults(document.getElementById('icd-search')?.value||'');}
function renderICDResults(q=''){const container=document.getElementById('icd-results');let items=ICD_DB;if(icdActiveFilter!=='all')items=items.filter(i=>i.group===icdActiveFilter||i.version===icdActiveFilter);if(q)items=items.filter(i=>i.code.toLowerCase().includes(q.toLowerCase())||i.label.toLowerCase().includes(q.toLowerCase()));container.innerHTML=items.map(i=>`<div class="icd-row" data-action="selectICDVal:${i.code}"><span class="icd-code">${i.code}</span><span class="icd-label">${i.label}</span><span class="icd-badge icd-badge-${i.version==='icd10'?'10':'11'}">${i.version.toUpperCase()}</span></div>`).join('')||'<div style="text-align:center;padding:40px;color:var(--text-dim);">No codes found</div>';}
function selectICD(code,label){document.getElementById('r-icd').value=code;closeOverlay('icd-lookup-modal');}

// ── Save Record ──
async function saveRecord(){
  const p=LS.get('pat_'+selectedMRN);if(!p)return;
  const fields={name:'r-name',email:'r-email',dob:'r-dob',gender:'r-gender',blood:'r-blood',phone:'r-phone',phase:'r-phase',occupation:'r-occupation',ethnicity:'r-ethnicity',religion:'r-religion',language:'r-language',literacy:'r-literacy',socio:'r-socio','emergencyName':'r-emergency-name','emergencyPhone':'r-emergency-phone','emergencyRel':'r-emergency-rel',insurance:'r-insurance','insuranceId':'r-insurance-id',referral:'r-referral',diag:'r-diag','icd10':'r-icd','whoGrade':'r-who','primarySite':'r-site',laterality:'r-lat',histology:'r-hist','histVariant':'r-histvariant','dateDiag':'r-ddiag','tnmT':'r-tnmt','tnmN':'r-tnmn','tnmM':'r-tnmm','tnmStage':'r-tnms',recist:'r-recist','lastAssess':'r-lass','targetLesions':'r-target','newLesions':'r-newlesions','diseaseStatus':'r-ds',height:'r-h',weight:'r-w',bp_sys:'r-sys',bp_dia:'r-dia',hr:'r-hr',rhythm:'r-rhythm',spo2:'r-spo2',temp:'r-temp',rr:'r-rr',ecog:'r-ecog',kps:'r-kps',gcs:'r-gcs','gcsE':'r-gcs-e','gcsV':'r-gcs-v','gcsM':'r-gcs-m',mrs:'r-mrs',barthel:'r-barthel','motorR':'r-motor-r','motorL':'r-motor-l',speech:'r-speech',visual:'r-visual',mmse:'r-mmse',cranial:'r-cranial',creat:'r-creat','clinNotes':'r-clin-notes',idh1:'r-idh1',mgmt:'r-mgmt','codeletion':'r-cod',tert:'r-tert',atrx:'r-atrx','egfrmol':'r-egfrmol',braf:'r-braf','h3k27m':'r-h3k27m',ki67:'r-ki67',p53:'r-p53',pten:'r-pten','cdkn2ab':'r-cdkn',cdk4:'r-cdk4',pdgfra:'r-pdgfra',nf1:'r-nf1',fgfr1:'r-fgfr1',ntrk:'r-ntrk',tmb:'r-tmb',msi:'r-msi',pdl1:'r-pdl1','txTechnique':'r-tx-tech','txDevice':'r-tx-dev','txDose':'r-tx-dose','txFractions':'r-tx-frac','txConcChemo':'r-tx-chemo','txTargeted':'r-tx-targeted','txImmuno':'r-tx-immuno','txStart':'r-tx-start','txEnd':'r-tx-end','txRegimenStatus':'r-tx-regimen-status','txCycleCurrent':'r-tx-cycle-current','txCycleTotal':'r-tx-cycle-total','txCTCAE':'r-tx-ctcae','txToxicity':'r-tx-toxicity','txAlphaBeta':'r-eqd2-ab'};
  for(const[field,inputId]of Object.entries(fields)){const val=v(inputId);if(val!==undefined)p[field]=val;}
  p.allergies=rAllergies;p.meds=rMeds;
  const cbs=document.querySelectorAll('.comor-cb:checked');p.comorbidities=Array.from(cbs).map(cb=>cb.value);
  p.updatedAt=Date.now();LS.set('pat_'+selectedMRN,p);pushToServer({['pat_'+selectedMRN]:p});flash('Record saved ✓');
  refreshOverview();
}

// ── Export ──
function generatePDFDownload(){printPatientSummary();}

// ── Credentials ──
async function generateNewPassword(mrn){const pass=genPass();const hash=await makePasswordHash(pass);const p=LS.get('pat_'+mrn);if(!p)return;p.pass=hash;p.updatedAt=Date.now();LS.set('pat_'+mrn,p);try{await api('/sync/save-patient',{method:'POST',body:JSON.stringify({mrn,patient:p})})}catch(e){console.warn('[store] save-patient failed:',e.message)}const el=document.getElementById('cred-reset-msg');if(el){el.style.display='block';el.className='msg ok';el.textContent='New password: '+pass+' — Copy and share with patient.';}flash('Password reset');}

// ── OTP Password Change Request ──
async function requestPasswordChange(mrn){
  const msg=document.getElementById('cred-otp-msg');
  if(msg){msg.style.display='block';msg.style.color='var(--text-muted)';msg.textContent='Requesting...';}
  try{
    const r=await api('/sync/password-change-request',{method:'POST',body:JSON.stringify({mrn})});
    if(r.ok){
      const isRemote=r.delivery==='email'||r.delivery==='sms';
      const deliveryLabel=r.delivery==='email'?'📧 Email':r.delivery==='sms'?'📱 SMS':'🧑‍⚕️ In person';
      if(msg){msg.style.color='var(--green)';
        let html='<div style="background:var(--green-pale);border:1px solid rgba(16,185,129,.2);border-radius:8px;padding:12px;margin-top:4px;">';
        if(isRemote){
          html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'+
            '<span style="font-size:20px;">'+(r.delivery==='email'?'📧':'📱')+'</span>'+
            '<div><div style="font-weight:700;">OTP sent to patient via '+deliveryLabel+'</div>'+
            '<div style="font-size:11px;color:var(--text-muted);">'+esc(r.deliveryTo||'')+'</div></div></div>';
        }else{
          html+='<div style="font-weight:700;margin-bottom:6px;">🔑 Share OTP with patient in person:</div>'+
            '<div style="background:var(--surface2);border-radius:6px;padding:8px;margin-bottom:8px;">'+
            '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">OTP Code</div>'+
            '<div style="font-size:28px;font-weight:800;letter-spacing:6px;text-align:center;font-family:var(--mono);color:var(--green);">'+r.otp+'</div></div>';
        }
        html+='<div style="background:var(--surface2);border-radius:6px;padding:8px;margin-bottom:8px;">'+
          '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">New Password (share after approval)</div>'+
          '<div style="font-size:16px;font-weight:700;text-align:center;font-family:var(--mono);color:var(--blue);letter-spacing:1px;">'+r.newPassword+'</div></div>'+
          '<div style="font-size:11px;color:var(--text-muted);">'+r.message+'</div></div>';
        msg.innerHTML=html;}
      flash(isRemote?'OTP sent to patient — new password ready':'OTP + new password generated — share with patient');
      loadPendingPasswordRequests(mrn);
    }
  }catch(e){if(msg){msg.style.color='var(--red)';msg.textContent='Error: '+e.message;}}
}

async function cancelPasswordChangeRequest(requestId,mrn){
  try{
    await api('/sync/password-change-cancel',{method:'POST',body:JSON.stringify({requestId})});
    flash('Request cancelled');
    loadPendingPasswordRequests(mrn);
  }catch(e){AppDialog.alert('Error: '+e.message);}
}

async function loadPendingPasswordRequests(mrn){
  const el=document.getElementById('cred-pending-reqs');
  if(!el)return;
  try{
    const r=await api('/sync/password-change-pending');
    const pending=(r.requests||[]).filter(rq=>rq.mrn===mrn&&rq.status==='pending');
    if(!pending.length){el.style.display='none';return;}
    el.style.display='block';
    el.innerHTML='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--orange);margin-bottom:6px;">⏳ Pending Requests</div>'+
      pending.map(rq=>{
        const mins=Math.max(0,Math.round((new Date(rq.expires_at)-new Date())/60000));
        return '<div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);border-radius:8px;padding:10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">'+
          '<div><div style="font-size:12px;font-weight:600;">Request pending</div>'+
          '<div style="font-size:11px;color:var(--text-muted);">Expires in '+mins+' min</div></div>'+
          '<button class="btn btn-ghost btn-sm" data-action="cancelPasswordChangeRequest:@js:rq.id,@js:mrn" style="color:var(--red);font-size:11px;">Cancel</button>'+
        '</div>';
      }).join('');
  }catch(e){el.style.display='none';}
}

async function deletePatient(){if(!await AppDialog.confirm('DELETE this patient record? This cannot be undone.',{danger:true}))return;const mrn=selectedMRN;LS.del('pat_'+mrn);const pushed=await pushToServer({['pat_'+mrn]:null});let serverDeleted=false;try{await api('/sync/delete-patient',{method:'POST',body:JSON.stringify({mrn})});serverDeleted=true}catch(e){}closeRecord();refreshAll();flash(pushed&&serverDeleted?'Patient deleted everywhere':'⚠️ Deleted locally — server unreachable, the cloud copy remains and will update on next sync');}

// ── AI Analysis ──
// ── FHIR ──
function renderFHIRPatSel(){const sel=document.getElementById('fhir-pat-sel');if(!sel)return;sel.innerHTML='<option value="">— Choose —</option>'+getMyPatients().map(p=>`<option value="${p.mrn}">${esc(p.name)} (${p.mrn})</option>`).join('');}
function exportFHIR(){const mrn=v('fhir-pat-sel');const p=LS.get('pat_'+mrn);if(!p){AppDialog.alert('Select a patient.');return;}const bundle={resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',identifier:[{system:'urn:oid:veltruvia',value:p.mrn}],name:[{family:p.name?.split(' ').pop(),given:p.name?.split(' ').slice(0,-1)}],gender:(p.gender||'unknown').toLowerCase(),birthDate:p.dob||undefined}}]};if(p.diag){bundle.entry.push({resource:{resourceType:'Condition',code:{coding:[{system:'http://hl7.org/fhir/sid/icd-10',code:p.icd10||'C71.9'}],text:p.diag}}});}(p.meds||[]).forEach(m=>{bundle.entry.push({resource:{resourceType:'MedicationRequest',medicationCodeableConcept:{text:m.name},dosageInstruction:[{text:m.dose+' '+m.route+' '+m.freq}]}});});const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FHIR_'+p.mrn+'.json';a.click();flash('FHIR bundle downloaded');}
function sendFHIRToServer(){AppDialog.alert('FHIR server POST — configure server URL first.');}

// ── Lab Management ──
function openAddLabModal(){openOverlay('add-lab-modal');}
async function createLab(){const name=v('lab-name').trim();if(!name){AppDialog.alert('Enter lab name.');return;}const username=genLabUser(name);const pass=genPass();const labId='LAB-'+Date.now().toString(36);const passHash=await makePasswordHash(pass);const docId=currentDoc.docId;const lab={labId,name,contact:v('lab-contact'),phone:v('lab-phone'),email:v('lab-email'),address:v('lab-address'),specialty:v('lab-specialty'),username,docId,password:passHash,created:Date.now()};LS.set('lab_'+docId+'_'+labId,lab);const labPushOk=await pushToServer({['lab_'+docId+'_'+labId]:lab});let storeOk=true;try{const sr=await api('/sync/save-lab',{method:'POST',body:JSON.stringify({labId,username,name,password:pass})});storeOk=!!(sr&&sr.ok);}catch(e){storeOk=false;}const display=document.getElementById('lab-creds-display');display.style.display='block';display.innerHTML=`<div style="text-align:center;"><div style="font-size:18px;margin-bottom:8px;">${(labPushOk&&storeOk)?'✅':'⚠️'}</div><div style="font-weight:800;font-size:16px;margin-bottom:4px;">Lab Created Successfully</div>${(labPushOk&&storeOk)?'':'<div style="font-size:11px;color:var(--orange);margin-bottom:8px;">'+(storeOk?'Lab credentials could not be saved to the login store — the lab cannot log in yet. Check the connection and create the account again.':'Not yet on the server — the lab cannot log in until the connection returns.')+'</div>'}<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">${esc(name)}</div><div style="background:var(--surface2);border-radius:8px;padding:14px;text-align:left;margin-bottom:12px;"><div style="font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase;margin-bottom:8px;">🔑 Login Credentials</div><div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);font-size:12px;">Username</span><span style="font-family:var(--mono);font-weight:600;font-size:12px;">${username}</span></div><div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:var(--text-muted);font-size:12px;">Password</span><span style="font-family:var(--mono);font-weight:600;font-size:12px;">${pass}</span></div></div><div style=\"font-size:11px;color:var(--orange);margin-bottom:12px;\">⚠ Copy these credentials now — password cannot be viewed again.</div><button class=\"btn btn-primary\" id=\"lab-creds-copy-btn\" style=\"margin-bottom:8px;\">📋 Copy credentials</button><button class=\"btn btn-primary\" data-action=\"hide:lab-creds-display\">Done</button></div>`;closeOverlay('add-lab-modal');refreshLabList();setTimeout(()=>{const cb=document.getElementById('lab-creds-copy-btn');if(cb)cb.addEventListener('click',async()=>{const txt='VELTRUVIA Lab login\\nLab: '+name+'\\nUsername: '+username+'\\nPassword: '+pass;try{await navigator.clipboard.writeText(txt);cb.textContent='✅ Copied to clipboard';}catch(e){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');cb.textContent='✅ Copied to clipboard';}catch(e2){cb.textContent='Select and copy manually';}document.body.removeChild(ta);}});},50);}
function refreshLabList(){const docId=currentDoc?.docId;if(!docId)return;const labs=LS.keys('lab_'+docId+'_').map(k=>LS.get(k)).filter(Boolean);const container=document.getElementById('labs-list-container');if(!labs.length){container.innerHTML='<div class="empty-card">No laboratories added.</div>';return;}container.innerHTML=labs.map(l=>`<div class="info-card"><div style="display:flex;justify-content:space-between;align-items:center;"><strong>${esc(l.name)}</strong><span style="font-size:11px;color:var(--text-dim);font-family:var(--mono);">${l.username}</span></div><div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${esc(l.contact||'')} · ${esc(l.phone||'')} · ${esc(l.email||'')}</div></div>`).join('');}
function switchLabMainTab(tab,btn){document.querySelectorAll('.lab-main-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');['labs','pending','assign'].forEach(t=>{const el=document.getElementById('lv-'+t);if(el)el.style.display=t===tab?'block':'none';});}
function updateAutoprioFromDate(d){if(!d)return;const diff=Math.ceil((new Date(d)-new Date())/(1000*60*60*24));const hint=document.getElementById('pqr-due-hint');if(diff<=0){hint.textContent='⚠ Overdue → STAT';hint.style.color='var(--red)';document.querySelector('input[value="STAT"]').checked=true;}else if(diff<=3){hint.textContent='⚠ Due in '+diff+' day(s) → Urgent';hint.style.color='var(--orange)';document.querySelector('input[value="Urgent"]').checked=true;}else{hint.textContent='📅 Due in '+diff+' days → Routine';hint.style.color='var(--green)';document.querySelector('input[value="Routine"]').checked=true;}}
async function sendLabTask(){const sendBtn=document.querySelector('[data-action="sendLabTask"]');const run=async()=>{const patient=v('pqr-patient'),labId=v('pqr-lab'),desc=v('pqr-desc'),dueDate=v('pqr-due-date');const priority=document.querySelector('input[name="pqr-prio"]:checked')?.value||'Routine';if(!patient||!labId||!dueDate){AppDialog.alert('Fill all required fields.');return;}const p=LS.get('pat_'+patient);const labs=LS.keys('lab_'+currentDoc.docId+'_').map(k=>LS.get(k)).filter(Boolean);const lab=labs.find(l=>l.labId===labId);const tokens=LS.get('pat_tokens_'+currentDoc.docId)||[];tokens.push({taskId:'TK-'+Date.now().toString(36),mrn:patient,patName:p?.name||'',labId,labName:lab?.name||'',desc,priority,dueDate,docId:currentDoc.docId,docName:currentDoc.name,createdAt:Date.now(),status:'Pending Upload',used:false});LS.set('pat_tokens_'+currentDoc.docId,tokens);const ok=await pushToServer({['pat_tokens_'+currentDoc.docId]:tokens});flash(ok?'Task sent to lab ✓':'⚠️ Task saved locally — the lab will receive it when the server connection returns');renderLabTaskQueue();};if(window.Busy)Busy.btn(sendBtn,run);else run();}
function renderLabTaskQueue(){const tokens=(LS.get('pat_tokens_'+currentDoc.docId)||[]).filter(t=>!t.used&&t.status!=='Cancelled');const el=document.getElementById('lab-task-queue');if(!el)return;if(!tokens.length){el.innerHTML='<div class="empty-card">No active tasks.</div>';return;}tokens.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));el.innerHTML=tokens.map(t=>{const now=new Date();const due=new Date(t.dueDate);const diff=Math.ceil((due-now)/(1000*60*60*24));let urgency='',borderCol='';if(diff<0){urgency='🔴 Overdue!';borderCol='var(--red)';}else if(diff===0){urgency='🔴 Due today';borderCol='var(--red)';}else if(diff===1){urgency='⚠ Due tomorrow';borderCol='var(--orange)';}else if(diff<=3){urgency='⚠ Due in '+diff+' days';borderCol='var(--orange)';}else{urgency='📅 Due '+t.dueDate;borderCol='';}const prioCol={STAT:'var(--red)',Urgent:'var(--orange)',Routine:'var(--green)'}[t.priority]||'var(--text-dim)';return `<div style="background:var(--surface);border:1px solid var(--border);border-top:3px solid ${prioCol};border-radius:8px;padding:12px;margin-bottom:8px;"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px;"><span style="color:${borderCol};font-weight:600;">${urgency}</span><span class="badge" style="background:${prioCol}22;color:${prioCol};">${t.priority}</span></div><div style="font-weight:600;font-size:13px;margin-bottom:4px;">${esc(t.desc)}</div><div style="font-size:11px;color:var(--text-muted);">Patient: ${esc(t.patName)} · Lab: ${esc(t.labName)}</div></div>`;}).join('');}

// ── Data & Backup ──
async function exportAllData(){const data=await SecureStore.exportAll();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='VELTRUVIA_Backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();flash('Backup downloaded');}
function importBackup(input){const file=input.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);let count=0;Object.entries(data).forEach(([k,v])=>{if(k.startsWith('cc_')){localStorage.setItem(k,v);count++;}});const ok=document.getElementById('import-ok');ok.className='msg ok';ok.textContent='Imported '+count+' keys.';ok.style.display='block';refreshAll();}catch(e){const err=document.getElementById('import-err');err.className='msg err';err.textContent='Invalid file: '+e.message;err.style.display='block';}};reader.readAsText(file);}
async function clearAllData(){if(!await AppDialog.confirm('DELETE ALL VELTRUVIA data? This cannot be undone.',{danger:true}))return;for(const k of SecureStore.names())SecureStore.del(k);try{localStorage.removeItem('cc__wrap');}catch{}refreshAll();flash('All data cleared');}
function saveEmailJSConfig(){const cfg={publicKey:v('ejs-pubkey'),serviceId:v('ejs-service'),verifyTemplate:v('ejs-tmpl-verify'),apptTemplate:v('ejs-tmpl-appt')};LS.set('email_config',cfg);flash('Email config saved');}
function testEmailJS(){AppDialog.alert('Test email — configure EmailJS keys first.');}

// ── Broadcast Email (free via Resend / Gmail) ──
async function checkBroadcastEmailStatus(){
  const el=document.getElementById('bc-email-status');if(!el)return;
  try{
    const r=await api('/email/status?verify=1');
    if(r.configured&&r.ok){
      el.innerHTML=`<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:20px;">✅</span><div><div style="font-weight:700;font-size:13px;color:var(--green);">Server email is live (${r.provider})</div><div style="font-size:11px;color:var(--text-muted);">You can send free emails — Resend free tier: 100/day, 3,000/month</div></div></div>`;
    }else{
      el.innerHTML=`<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:20px;">⚠️</span><div><div style="font-weight:700;font-size:13px;color:var(--orange);">Email not fully configured</div><div style="font-size:11px;color:var(--text-muted);">${r.error||'Set RESEND_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD on your server.'}</div></div></div>`;
    }
  }catch(e){
    el.innerHTML=`<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:20px;">❌</span><div><div style="font-weight:700;font-size:13px;color:var(--red);">Cannot check email status</div><div style="font-size:11px;color:var(--text-muted);">${e.message}</div></div></div>`;
  }
}
async function loadBroadcastContacts(){
  const filter=document.getElementById('bc-to').value;
  const listEl=document.getElementById('bc-contacts-list');
  const countEl=document.getElementById('bc-contacts-count');
  listEl.innerHTML='<div style="font-size:12px;color:var(--text-dim);padding:8px;">Loading contacts...</div>';
  countEl.textContent='';
  try{
    const r=await api('/email/contacts?filter='+filter);
    if(!r.contacts||r.contacts.length===0){
      listEl.innerHTML='<div style="font-size:12px;color:var(--text-dim);padding:8px;">No contacts with email addresses found.</div>';
      return;
    }
    const doctors=r.contacts.filter(c=>c.type==='doctor');
    const patients=r.contacts.filter(c=>c.type==='patient');
    let html='';
    if(doctors.length){
      html+=`<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-dim);padding:6px 0;">👨‍⚕️ Doctors (${doctors.length})</div>`;
      html+=doctors.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;"><span style="background:var(--blue-pale);color:var(--blue);padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;">DOC</span><span style="font-weight:500;">${esc(c.name)}</span><span style="color:var(--text-dim);margin-left:auto;font-family:var(--mono);font-size:11px;">${esc(c.email)}</span></div>`).join('');
    }
    if(patients.length){
      html+=`<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-dim);padding:6px 0;margin-top:6px;">🤒 Patients (${patients.length})</div>`;
      html+=patients.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;"><span style="background:rgba(6,182,212,.07);color:var(--cyan);padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;">PAT</span><span style="font-weight:500;">${esc(c.name)}</span><span style="color:var(--text-dim);font-size:11px;">${esc(c.mrn||'')}</span><span style="color:var(--text-dim);margin-left:auto;font-family:var(--mono);font-size:11px;">${esc(c.email)}</span></div>`).join('');
    }
    listEl.innerHTML=html;
    countEl.textContent=`Total: ${r.count} recipient(s) with email addresses`;
  }catch(e){
    listEl.innerHTML=`<div style="font-size:12px;color:var(--red);padding:8px;">Error: ${esc(e.message)}</div>`;
  }
}
async function sendBroadcastEmail(){
  const to=document.getElementById('bc-to').value;
  const subject=v('bc-subject');
  const body=v('bc-body');
  const msgEl=document.getElementById('bc-msg');
  const resultEl=document.getElementById('bc-result');
  if(!subject){msgEl.className='msg err';msgEl.textContent='Enter a subject line.';msgEl.style.display='block';return;}
  if(!body){msgEl.className='msg err';msgEl.textContent='Enter a message body.';msgEl.style.display='block';return;}
  const btn=document.getElementById('bc-send-btn');
  btn.disabled=true;btn.textContent='⏳ Sending...';
  msgEl.style.display='none';resultEl.innerHTML='';
  try{
    const r=await api('/email/broadcast',{method:'POST',body:JSON.stringify({to,subject,text:body})});
    msgEl.className='msg ok';msgEl.textContent=r.message;msgEl.style.display='block';
    let resultHtml=`<div class="card"><div class="card-title" style="margin-bottom:12px;">📊 Send Results</div>`;
    resultHtml+=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px;">`;
    resultHtml+=`<div style="text-align:center;padding:14px;background:var(--blue-pale);border-radius:10px;"><div style="font-size:24px;font-weight:800;color:var(--blue);">${r.sent||0}</div><div style="font-size:11px;color:var(--text-muted);">Sent</div></div>`;
    resultHtml+=`<div style="text-align:center;padding:14px;background:rgba(220,38,38,.05);border-radius:10px;"><div style="font-size:24px;font-weight:800;color:var(--red);">${r.failed||0}</div><div style="font-size:11px;color:var(--text-muted);">Failed</div></div>`;
    resultHtml+=`<div style="text-align:center;padding:14px;background:rgba(16,185,129,.05);border-radius:10px;"><div style="font-size:24px;font-weight:800;color:var(--green);">${r.total||0}</div><div style="font-size:11px;color:var(--text-muted);">Total</div></div>`;
    resultHtml+=`</div>`;
    if(r.errors&&r.errors.length){
      resultHtml+=`<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">Failed recipients:</div>`;
      r.errors.forEach(e=>{resultHtml+=`<div style="font-size:11px;color:var(--red);padding:3px 0;">${esc(e.email)}: ${esc(e.error)}</div>`;});
    }
    resultHtml+=`</div>`;
    resultEl.innerHTML=resultHtml;
  }catch(e){
    msgEl.className='msg err';msgEl.textContent='Error: '+e.message;msgEl.style.display='block';
  }finally{
    btn.disabled=false;btn.textContent='📧 Send Email to All';
  }
}
function previewBroadcast(){
  const body=v('bc-body');
  if(!body){AppDialog.alert('Write a message first.');return;}
  const preview=body.replace(/\{name\}/gi,'John Doe');
  const win=window.open('','_blank','width=600,height=500');
  win.document.write(`<html><head><title>Email Preview</title><style>body{font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:24px;}</style></head><body><h2 style="color:#2C5EAD;">VELTRUVIA</h2><p>Hello John Doe,</p><div style="white-space:pre-wrap;line-height:1.6;">${preview}</div><hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"><p style="color:#94a3b8;font-size:11px;">This message was sent via VELTRUVIA Neuro-Oncology EMR.</p></body></html>`);
}
function refreshStorageInfo(){let total=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('cc_'))total+=localStorage.getItem(k).length;}const pct=Math.min(100,Math.round(total/5242880*100));document.getElementById('storage-pct').textContent=pct+'%';document.getElementById('storage-bar').style.width=pct+'%';if(pct>80)document.getElementById('storage-bar').style.background='var(--orange)';}
async function openPatientSearch(){
  const pal=document.getElementById('search-palette');
  const q=document.getElementById('palette-q');
  q.value='';renderPaletteResults();
  pal.classList.add('open');
  setTimeout(()=>q.focus(),50);
}
function closePatientSearch(){document.getElementById('search-palette').classList.remove('open');}
function renderPaletteResults(){
  const q=(document.getElementById('palette-q').value||'').toLowerCase().trim();
  const box=document.getElementById('palette-results');
  const pats=getMyPatients()
    .filter(p=>!q||p.name?.toLowerCase().includes(q)||p.mrn?.toLowerCase().includes(q))
    .slice(0,12);
  if(!pats.length){box.innerHTML='<div class="empty-card">No matching patients. Type a name or MRN.</div>';return}
  box.innerHTML=pats.map(p=>`
    <div class="patient-row" role="option" tabindex="0" style="padding:12px 16px" data-mrn="${escAttr(p.mrn)}">
      <div class="avatar" aria-hidden="true">${esc((p.name||'?').charAt(0).toUpperCase())}</div>
      <div style="flex:1"><div class="pat-name">${esc(p.name||'Unnamed')}</div><div class="pat-mrn">${esc(p.mrn||'')}</div></div>
      ${p.diag?`<span class="badge badge-blue">${esc(p.diag)}</span>`:''}
    </div>`).join('');
  box.querySelectorAll('.patient-row').forEach(row=>{
    row.addEventListener('click',()=>{closePatientSearch();openRecord(row.dataset.mrn);});
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();closePatientSearch();openRecord(row.dataset.mrn);}});
  });
}
document.addEventListener('keydown',e=>{
  const pal=document.getElementById('search-palette');
  if(pal&&pal.classList.contains('open')){
    if(e.key==='Escape'){e.preventDefault();closePatientSearch();}
    if(e.key==='Enter'){const first=pal.querySelector('.patient-row');if(first){e.preventDefault();closePatientSearch();openRecord(first.dataset.mrn);}}
  }
});
document.getElementById('search-palette').addEventListener('mousedown',e=>{if(e.target.id==='search-palette')closePatientSearch();});

// ── Key shortcut ──
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openPatientSearch();}});

// ── Mobile nav ──
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('.nav-item'))document.body.classList.remove('nav-open');});

// ── v2.1 TRENDS TAB — sparklines from /api/x/trends ──
let _trendsData=null;
async function loadTrendsTab(mrn){
  const body=document.getElementById('r-trends-body');if(!body)return;
  body.textContent='Loading trends…';
  try{
    const [v,l]=await Promise.all([api('/x/trends/vitals/'+mrn),api('/x/trends/labs/'+mrn)]);
    _trendsData={v:v||{},l:l||{}};
    body.innerHTML=renderTrends(mrn);
  }catch(e){body.innerHTML='<div class="empty-card">Trends unavailable offline.</div>';}
}
function _sparkSVG(vals,w,h,color){
  if(!vals||vals.length<2)return '';
  const min=Math.min(...vals),max=Math.max(...vals),span=(max-min)||1;
  const pts=vals.map((v,i)=>[(i/(vals.length-1))*(w-6)+3,(h-4)-((v-min)/span)*(h-8)+2]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const last=pts[pts.length-1];
  const first=pts[0];
  return `<svg width="${w}" height="${h}" style="display:block;overflow:visible"><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}"/><circle cx="${first[0]}" cy="${first[1]}" r="2" fill="${color}" opacity=".45"/></svg>`;
}
function renderTrends(mrn){
  const P=(_trendsData&&_trendsData.v&&_trendsData.v.points)||[];
  const S=(_trendsData&&_trendsData.l&&_trendsData.l.series)||{};
  const series=[
    {key:'sys',label:'Systolic BP',unit:'mmHg',color:'#60a5fa',vals:P.map(p=>p.sys).filter(v=>v!=null)},
    {key:'dia',label:'Diastolic BP',unit:'mmHg',color:'#38bdf8',vals:P.map(p=>p.dia).filter(v=>v!=null)},
    {key:'pulse',label:'Pulse',unit:'bpm',color:'#f472b6',vals:P.map(p=>p.pulse).filter(v=>v!=null)},
    {key:'spo2',label:'SpO₂',unit:'%',color:'#34d399',vals:P.map(p=>p.spo2).filter(v=>v!=null)},
    {key:'temp',label:'Temperature',unit:'°C',color:'#fbbf24',vals:P.map(p=>p.temp).filter(v=>v!=null)},
    {key:'weight',label:'Weight',unit:'kg',color:'#a78bfa',vals:P.map(p=>p.weight).filter(v=>v!=null)},
    {key:'glucose',label:'Glucose',unit:'mg/dL',color:'#fb923c',vals:P.map(p=>p.glucose).filter(v=>v!=null)},
  ];
  const vCards=series.map(s=>{
    const vals=s.vals.slice(-30);
    const latest=vals[vals.length-1],prev=vals[vals.length-2];
    const arrow=latest>prev?'▲':latest<prev?'▼':'—';
    const ac=latest>prev?'var(--red)':latest<prev?'var(--green)':'var(--text-dim)';
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;min-width:170px;">
      <div style="font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--text-dim);">${s.label}</div>
      <div style="display:flex;align-items:baseline;gap:6px;margin:2px 0 6px;"><strong style="font-size:20px;font-family:var(--mono);">${latest!=null?latest:'—'}</strong><span style="font-size:11px;color:var(--text-dim);">${s.unit}</span><span style="font-size:12px;color:${ac};">${arrow}</span></div>
      ${_sparkSVG(vals,150,34,s.color)}
      <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${vals.length} reading${vals.length===1?'':'s'} · last: ${P.filter(p=>p[s.key]!=null).slice(-1)[0]?.date||''}</div>
    </div>`;}).join('');
  const labKeys=Object.keys(S).slice(0,8);
  const lCards=labKeys.map(k=>{
    const pts=(S[k]||[]).slice(-30);
    const vals=pts.map(p=>p.value);
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;min-width:170px;">
      <div style="font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--text-dim);">🧪 ${esc(k)}</div>
      <div style="display:flex;align-items:baseline;gap:6px;margin:2px 0 6px;"><strong style="font-size:18px;font-family:var(--mono);">${vals[vals.length-1]??'—'}</strong></div>
      ${_sparkSVG(vals,150,34,'#2dd4bf')}
      <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${pts.length} result${pts.length===1?'':'s'}</div>
    </div>`;}).join('');
  if(!vCards.replace(/[\s\n]/g,'')&&!lCards)return '<div class="empty-card">No trend data yet — vitals come from daily logs, labs from results.</div>';
  const sec=(t,h)=>h?`<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:8px;">${t}</div><div style="display:flex;gap:10px;flex-wrap:wrap;">${h}</div></div>`:'';
  return sec('Vitals',vCards)+sec('Lab results',lCards);
}

// ── v2.1 PRINT / PDF — prescription, invoice, day-sheet ──
// Opens a print-optimized popup (system Save-as-PDF works from any OS)
function _printDoc(title,innerCss,innerHtml){
  const w=window.open('','_blank','width=800,height=900');
  if(!w){AppDialog.alert('Allow popups for this app to print.');return;}
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:'Segoe UI',system-ui,sans-serif;color:#111;margin:32px;max-width:720px;}
    h1{font-size:20px;margin:0 0 2px;}h2{font-size:15px;margin:18px 0 6px;border-bottom:1.5px solid #222;padding-bottom:4px;}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f4c81;padding-bottom:10px;margin-bottom:16px;}
    .brand{font-size:22px;font-weight:800;color:#0f4c81;letter-spacing:-.5px;}
    .muted{color:#666;font-size:11px;}
    table{width:100%;border-collapse:collapse;margin:8px 0;font-size:13px;}
    th{text-align:left;background:#f0f4f8;padding:6px 8px;border:1px solid #d8dee6;font-size:11px;text-transform:uppercase;letter-spacing:.5px;}
    td{padding:6px 8px;border:1px solid #d8dee6;} .tot{font-weight:700;}
    .sig{margin-top:48px;display:flex;justify-content:space-between;} .sig div{border-top:1px solid #333;padding-top:4px;font-size:12px;width:200px;text-align:center;}
    @media print{.noprint{display:none}} ${innerCss||''}
  </style></head><body>${innerHtml}</body></html>`);
  w.document.close();setTimeout(()=>{try{w.focus();w.print();}catch(e){}},350);
}
function printPrescription(rxId){
  api('/rx/'+rxId).then(rx=>{
    if(!rx||rx.error){AppDialog.alert('Could not load prescription.');return;}
    const r=rx.prescription||rx;
    const meds=(r.medications||r.drugs||[]);
    _printDoc('Prescription '+rxId,`
      <table>
    <thead><tr><th>Medication</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Duration</th></tr></thead>
    <tbody>${meds.map(m=>`<tr><td><strong>${esc(m.name||'')}</strong></td><td>${esc(m.dose||'')}</td><td>${esc(m.route||'oral')}</td><td>${esc(m.frequency||m.schedule||'')}</td><td>${esc(m.duration||'')}</td></tr>`).join('')}</tbody></table>`,
    `<div class="hdr"><div><div class="brand">VELTRUVIA</div><div class="muted">Clinic Management System</div></div><div style="text-align:right;font-size:12px;"><strong>Rx #${esc(String(rxId).slice(0,10))}</strong><br>Date: ${new Date().toLocaleDateString()}</div></div>
     <h1>Prescription</h1>
     <p style="font-size:14px;"><strong>Patient:</strong> ${esc(r.patientName||'')} (MRN ${esc(r.patientMrn||'')}) &nbsp;·&nbsp; <strong>Prescriber:</strong> ${esc(r.doctorName||r.prescriber||'')}</p>
     <h2>Medications</h2>
     ${meds.length?'':'<p style="color:#900">No medication rows in this record.</p>'}
     ${r.notes?`<h2>Notes</h2><p>${esc(r.notes)}</p>`:''}
     <div class="sig"><div>Prescriber signature</div><div>Date</div></div>`);
  }).catch(()=>AppDialog.alert('Could not load prescription.'));
}
function printInvoice(invId){
  api('/billing/invoices/'+invId).then(r=>{
    const inv=(r&&(r.invoice||r))||{};
    const lines=(inv.items||inv.lines||[]);
    const total=(inv.total??inv.amount??lines.reduce((s,l)=>s+(Number(l.amount||l.price||l.total)||0),0));
    _printDoc('Invoice '+invId,'',
    `<div class="hdr"><div><div class="brand">VELTRUVIA</div><div class="muted">Clinic Management System</div></div><div style="text-align:right;font-size:12px;"><strong>Invoice ${esc(inv.number||String(invId).slice(0,10))}</strong><br>Date: ${(inv.date||new Date().toISOString()).slice(0,10)}</div></div>
     <h1>Invoice</h1>
     <p style="font-size:14px;"><strong>Patient:</strong> ${esc(inv.patientName||'')} (MRN ${esc(inv.patientMrn||'')}) &nbsp;·&nbsp; <strong>Status:</strong> ${esc(inv.status||'—')}</p>
     <table><thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
     <tbody>${lines.map(l=>`<tr><td>${esc(l.description||l.name||l.code||'Item')}</td><td style="text-align:right">${esc(String(l.amount??l.price??l.total??''))}</td></tr>`).join('')||'<tr><td colspan="2">No line items stored.</td></tr>'}</tbody></table>
     <p class="tot" style="text-align:right;font-size:16px;">Total: ${esc(String(total))}</p>
     <div class="sig"><div>Authorized signature</div><div>Date</div></div>`);
  }).catch(()=>AppDialog.alert('Could not load invoice.'));
}
function printDaySheet(mrn){
  const P=(window._trendsData&&_trendsData.v&&_trendsData.v.points)||[];
  const name=(document.getElementById('r-name')||{}).value||'';
  const dx=(document.getElementById('r-dx')||{}).value||(document.getElementById('r-diagnosis')||{}).value||'';
  const meds=(LS.get('meds_'+mrn)||[]).slice(0,10);
  const appts=(LS.get('appts_'+mrn)||[]).slice(-5);
  _printDoc('Day sheet '+mrn,'',
  `<div class="hdr"><div><div class="brand">VELTRUVIA</div><div class="muted">Day Sheet — ${new Date().toLocaleDateString()}</div></div><div style="text-align:right;font-size:12px;">MRN: <strong>${esc(mrn)}</strong></div></div>
   <h1>Day Sheet</h1><p><strong>Patient:</strong> ${esc(name)}<br><strong>Diagnosis:</strong> ${esc(dx)}</p>
   <h2>Recent vitals</h2><table><thead><tr><th>Date</th><th>BP</th><th>Pulse</th><th>SpO₂</th><th>Temp</th><th>Weight</th></tr></thead>
   <tbody>${P.slice(-8).reverse().map(p=>`<tr><td>${esc(p.date||'')}</td><td>${p.bp?esc(p.bp):'—'}</td><td>${p.pulse??'—'}</td><td>${p.spo2??'—'}</td><td>${p.temp??'—'}</td><td>${p.weight??'—'}</td></tr>`).join('')||'<tr><td colspan="6">No vitals recorded.</td></tr>'}</tbody></table>
   ${meds.length?`<h2>Active medications</h2><ul style="font-size:13px;">${meds.map(m=>`<li>${esc(m.name||'')} ${esc(m.dose||'')}</li>`).join('')}</ul>`:''}
   ${appts.length?`<h2>Appointments</h2><ul style="font-size:13px;">${appts.map(a=>`<li>${esc(a.date)} ${esc(a.time||'')} — ${esc(a.type||'')}</li>`).join('')}</ul>`:''}
   <div class="sig"><div>Clinician signature</div><div>Date</div></div>`);
}

// v2.1: MRN-based print helpers (buttons pass the live selected MRN)
async function printLatestInvoice(mrn){
  mrn=String(mrn||'').toUpperCase();
  try{
    const r=await api('/billing/invoices');
    const list=((r&&(r.invoices||r))||[]).filter(i=>String(i.patientMrn||i.mrn||'').toUpperCase()===mrn);
    if(!list.length){AppDialog.alert('No invoices found for '+mrn);return;}
    const latest=list.sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||'')))[0];
    printInvoice(latest.id||latest.invoiceId);
  }catch(e){AppDialog.alert('Could not load invoices.');}
}
async function printLatestRx(mrn){
  mrn=String(mrn||'').toUpperCase();
  try{
    const r=await api('/rx/patient/'+mrn);
    const list=((r&&(r.prescriptions||r))||[]);
    if(!list.length){AppDialog.alert('No prescriptions found for '+mrn);return;}
    const latest=list.sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')))[0];
    printPrescription(latest.id);
  }catch(e){AppDialog.alert('Could not load prescriptions.');}
}

// ── v2.2 ATTACHMENTS UI — /api/x/attachments (streamed, integrity-checked) ──
async function rAttUpload(){
  if(!selectedMRN)return AppDialog.alert('Open a patient record first.');
  const inp=document.getElementById('r-att-file');
  const file=inp.files[0];if(!file)return;
  if(file.size>10*1024*1024)return AppDialog.alert('File too large (max 10 MB).');
  try{
    // api() sends JSON — attachments need the raw bytes, so use fetch directly.
    const res=await fetch('/api/x/attachments/'+encodeURIComponent(selectedMRN),{
      method:'POST',credentials:'include',
      headers:{'x-filename':file.name,'x-kind':'document','Content-Type':'application/octet-stream'},
      body:file,
    });
    const j=await res.json();
    if(!res.ok)throw new Error(j.error||('HTTP '+res.status));
    inp.value='';
    flash('Attachment uploaded ✓');
    rAttLoad();
  }catch(e){AppDialog.alert('Upload failed: '+e.message);}
}
async function rAttLoad(){
  const el=document.getElementById('r-att-list');if(!el)return;
  if(!selectedMRN){el.innerHTML='';return;}
  try{
    const r=await api('/x/attachments/'+selectedMRN);
    const list=(r&&r.attachments)||[];
    if(!list.length){el.innerHTML='<div class="empty-card" style="width:100%">No attachments yet. Upload X-rays, lab PDFs or photos.</div>';return;}
    el.innerHTML=list.map(a=>{
      const ext=(a.ext||'').toLowerCase();
      const icon={'.pdf':'📕','.png':'🖼','.jpg':'🖼','.jpeg':'🖼','.gif':'🖼','.webp':'🖼','.bmp':'🖼','.txt':'📄','.csv':'📄','.json':'📄','.xml':'📄','.hl7':'📄'}[ext]||'📎';
      const previewable=['.png','.jpg','.jpeg','.gif','.webp','.bmp'].includes(ext);
      const thumb=previewable
        ?`<img src="/api/x/attachments/${selectedMRN}/${a.id}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer" data-action="rAttOpen:${a.id}">`
        :`<div style="width:64px;height:64px;display:flex;align-items:center;justify-content:center;font-size:30px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);cursor:pointer" data-action="rAttOpen:${a.id}">${icon}</div>`;
      return `<div style="width:200px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px;">
        <div style="display:flex;gap:10px;align-items:center;">${thumb}
          <div style="min-width:0;flex:1;"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escAttr(a.filename)}">${esc(a.filename)}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:2px;">${Math.round((a.bytes||0)/1024)} KB · ${(a.uploadedAt||'').slice(0,10)}</div></div>
        </div></div>`;
    }).join('');
  }catch(e){el.innerHTML='<div class="empty-card" style="width:100%">Attachments unavailable offline.</div>';}
}
function rAttOpen(id){
  window.open('/api/x/attachments/'+encodeURIComponent(selectedMRN)+'/'+id,'_blank');
}
// Patch record init to also load attachments.
// rDocsLoad is defined in index-3-reports.js which loads AFTER this file —
// defer the wrap to a timeout so the binding exists (a top-level const
// read here would throw ReferenceError and abort this script's tail).
setTimeout(function(){
  if(typeof window.rDocsLoad==='function'){
    const _rDocsLoad=window.rDocsLoad;
    window.rDocsLoad=function(){_rDocsLoad();rAttLoad();};
  }
},0);
