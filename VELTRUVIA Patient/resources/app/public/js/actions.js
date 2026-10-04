// ═══════════════════════════════════════════════════════════════════
// VELTRUVIA Action Dispatcher — CSP-safe replacement for inline
// event handlers (onclick=, oninput=, …). All handlers are declared
// as inert data attributes, delegating at document level so elements
// rendered later via innerHTML (including template literals) work
// with zero rebinding.
//
// Attribute  → event
//   data-action           → click
//   data-action-input     → input
//   data-action-change    → change
//   data-action-enter     → keydown (fires only on Enter)
//   data-action-focus     → focusin (capture)
//   data-action-blur      → focusout (capture)
//   data-action-mousedown → mousedown
//
// Step grammar — ";;"-separated, run left to right:
//   name / name:a,b   call global fn (dotted paths OK, applied with their
//                     owner as `this`; args coerced)
//   @this @value @num @checked @v:foo @q:sel #id $id   arg tokens
//   stop prevent hide:id show:id mirror:id[%suffix]
//   labelclick blurhide:id selectval:id upper setval:id,v
//   clickid:id classList:toggle|remove:cls numeric6
//   borderColor:v color:v bg:v bgt:v          style micro-ops
//   availRow:i:prop:val  availSplice:i        availability editor
//   elRemove:id toggleDisplay:id showFormDate:form,date
//   showRTabQ:tab,n    showPanel:x showRTab:x
//
// Decorative hover: data-hover="kind:on::off" — applied on mouseenter,
//   restored on mouseleave. Kinds: border | color | border+color | bg | bgt.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const MAP = [
    ['data-action',          'click'],
    ['data-action-input',    'input'],
    ['data-action-change',   'change'],
    ['data-action-enter',    'keydown'],
    ['data-action-focus',    'focusin'],
    ['data-action-blur',     'focusout'],
    ['data-action-mousedown','mousedown'],
  ];
  const cache = new Map();
  const OPS = new Set([
    'stop','prevent','hide','show','mirror','labelclick','blurhide','selectval',
    'upper','setval','clickid','classList','numeric6','borderColor','color','bg','bgt',
    'availRow','availSplice','elRemove','toggleDisplay','showFormDate',
    'showPanel','showRTab','showRTabQ',
  ]);

  function coerce(v) {
    if (v === 'true')  return true;
    if (v === 'false') return false;
    if (v === 'null')  return null;
    // Numbers coerce only without leading zeros ('007' stays a string — IDs,
    // MRNs and zero-padded codes must survive the round-trip untouched).
    if (v !== '' && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }

  function parse(s) {
    const steps = [];
    for (let raw of s.split(';;')) {
      raw = raw.trim();
      if (!raw) continue;
      const i = raw.indexOf(':');
      const op = i === -1 ? raw : raw.slice(0, i);
      const rest = i === -1 ? '' : raw.slice(i + 1);
      steps.push({ op, rest, args: rest ? rest.split(',') : [], explicit: OPS.has(op) });
    }
    return steps;
  }

  function arg(tok, el) {
    if (tok === '@this')    return el;
    if (tok === '@value')   return el.value;
    if (tok === '@num') { const n = Number(el.value); return Number.isFinite(n) ? n : el.value; }
    if (tok === '@checked') return !!el.checked;
    if (tok.slice(0, 3) === '@v:') { const n = tok.slice(3); return n in window ? window[n] : undefined; }
    if (tok.slice(0, 3) === '@q:') return document.querySelector(tok.slice(3));
    if (tok[0] === '#') return document.getElementById(tok.slice(1));
    if (tok[0] === '$') { const t = document.getElementById(tok.slice(1)); return t ? t.value : undefined; }
    return coerce(tok);
  }

  // resolve dotted paths against window (rLabs.splice etc.)
  function resolve(name) {
    let cur = window;
    for (const p of name.split('.')) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  // split "name:arg,arg" — name may be dotted, args split on top-level commas
  function splitCall(rest) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of rest) {
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function run(el, ev, spec) {
    let steps = cache.get(spec);
    if (!steps) { steps = parse(spec); cache.set(spec, steps); }
    for (const s of steps) {
      if (!s.explicit) {
        // Dotted paths (document.body.classList.remove, rLabs.splice, …)
        // must be applied with their owner object as `this`, or native
        // methods throw Illegal invocation.
        const parts = s.op.split('.');
        const owner = parts.length > 1 ? resolve(parts.slice(0, -1).join('.')) : window;
        const fn = resolve(s.op);
        if (typeof fn !== 'function') { console.warn('[actions] unknown fn:', s.op); continue; }
        fn.apply(owner, splitCall(s.rest).map(a => arg(a, el)));
        continue;
      }
      switch (s.op) {
        case 'stop':     ev.stopPropagation(); break;
        case 'prevent':  ev.preventDefault(); break;
        case 'hide':     { const t = document.getElementById(s.rest); if (t) t.style.display = 'none'; break; }
        case 'show':     { const t = document.getElementById(s.rest); if (t) t.style.display = ''; break; }
        case 'mirror': {
          const j = s.rest.indexOf('%');
          const id = j === -1 ? s.rest : s.rest.slice(0, j);
          const suf = j === -1 ? '' : s.rest.slice(j + 1);
          const t = document.getElementById(id);
          if (t) t.textContent = (el.value || '') + suf;
          break;
        }
        case 'labelclick': { const i = el.querySelector('input'); if (i) i.click(); break; }
        case 'blurhide': setTimeout(() => {
          const t = document.getElementById(s.rest); if (!t) return;
          const ae = document.activeElement;
          if (t.contains(ae) || ae === el) return;
          t.style.display = 'none';
        }, 180); break;
        case 'selectval': { const t = document.getElementById(s.rest); if (t) t.value = el.textContent.trim(); break; }
        case 'upper': el.value = (el.value || '').toUpperCase(); break;
        case 'setval': {
          const i = s.rest.indexOf(',');
          const id = i === -1 ? s.rest : s.rest.slice(0, i);
          const v  = i === -1 ? '' : s.rest.slice(i + 1);
          const t = document.getElementById(id);
          if (t) t.value = v;
          break;
        }
        case 'clickid': { const t = document.getElementById(s.rest); if (t) t.click(); break; }
        case 'classList': {
          const i = s.rest.indexOf(':');
          const method = i === -1 ? 'toggle' : s.rest.slice(0, i);
          const cls = i === -1 ? s.rest : s.rest.slice(i + 1);
          if (method === 'toggle') document.body.classList.toggle(cls);
          else if (method === 'remove') document.body.classList.remove(cls);
          break;
        }
        case 'numeric6': {
          el.value = (el.value || '').replace(/[^0-9]/g, '');
          if (el.value.length === 6 && typeof window.approvePCR === 'function') window.approvePCR();
          break;
        }
        case 'borderColor': el.style.borderColor = s.rest; break;
        case 'color':       el.style.color = s.rest; break;
        case 'bg':          el.style.background = s.rest; break;
        case 'bgt':         el.style.background = s.rest; break;
        case 'availRow': {
          const [idx, prop, val] = splitCall(s.rest);
          const row = (window._availRows || [])[Number(idx)];
          if (row) {
            const v = arg(val, el);
            row[prop] = (prop === 'dayOfWeek' || prop === 'slotDuration') ? Number(v) : v;
          }
          break;
        }
        case 'availSplice': {
          const arr = window._availRows || [];
          arr.splice(Number(s.rest), 1);
          if (typeof window.renderAvailRows === 'function') window.renderAvailRows();
          break;
        }
        case 'elRemove': { const t = document.getElementById(s.rest); if (t) t.remove(); break; }
        case 'toggleDisplay': {
          const t = document.getElementById(s.rest);
          if (t) t.style.display = (t.style.display === 'none') ? 'block' : 'none';
          break;
        }
        case 'showFormDate': {
          const [formId, dateId] = splitCall(s.rest);
          const f = document.getElementById(formId);
          const d = document.getElementById(dateId);
          if (f) f.style.display = 'block';
          if (d) d.value = new Date().toISOString().slice(0, 10);
          break;
        }
        case 'showPanel': {
          // rest may carry ",@this" (button arg) — pass only the panel id
          const [panelId] = splitCall(s.rest);
          if (typeof window.showPanel === 'function') window.showPanel(panelId, el);
          break;
        }
        case 'showRTab': {
          const [tabId] = splitCall(s.rest);
          if (typeof window.showRTab === 'function') window.showRTab(tabId, el);
          if (tabId === 'rt-logs' && typeof window.renderRecordLogs === 'function' && window.selectedMRN !== undefined) {
            window.renderRecordLogs(window.selectedMRN);
          }
          break;
        }
        case 'showRTabQ': {
          const [tab, nStr] = splitCall(s.rest);
          if (typeof window.showRTab === 'function') {
            const items = document.querySelectorAll('.rnav-item');
            window.showRTab(tab, items[Number(nStr)] || el);
          }
          break;
        }
      }
    }
  }

  for (const [attr, ev] of MAP) {
    document.addEventListener(ev, e => {
      const el = e.target.closest('[' + attr + ']');
      if (!el) return;
      if (ev === 'keydown' && e.key !== 'Enter') return;
      run(el, e, el.getAttribute(attr));
    }, ev === 'focusin' || ev === 'focusout');
  }

  // ── Decorative hover ──────────────────────────────────────────────
  // data-hover="kind:on::off"  →  split on '::'. on/off values are comma
  // lists. Kinds: border → borderColor (off: var(--border));
  // color → color (off: ''); border+color → both; bg → background
  // (off: ''); bgt → background (off: 'transparent').
  function applyHover(el, on) {
    const spec = el.getAttribute('data-hover') || '';
    const ci = spec.indexOf(':');
    const kind = ci === -1 ? spec : spec.slice(0, ci);
    const vals = ci === -1 ? '' : spec.slice(ci + 1);
    const dbl = vals.indexOf('::');
    let onV = '', offV = '';
    if (dbl === -1) onV = vals;
    else { onV = vals.slice(0, dbl); offV = vals.slice(dbl + 2); }
    const onBits  = onV ? onV.split(',')  : [];
    const offBits = offV ? offV.split(',') : [];
    const pick = (bits, i, def) => (bits[i] !== undefined ? bits[i] : def);
    if (kind === 'border+color') {
      el.style.borderColor = on ? pick(onBits,0,'') : pick(offBits,0,'var(--border)');
      el.style.color       = on ? pick(onBits,1,'') : pick(offBits,1,'');
    } else if (kind === 'border') {
      el.style.borderColor = on ? pick(onBits,0,'') : pick(offBits,0,'var(--border)');
    } else if (kind === 'color') {
      el.style.color = on ? pick(onBits,0,'') : pick(offBits,0,'');
    } else if (kind === 'bg') {
      el.style.background = on ? pick(onBits,0,'') : pick(offBits,0,'');
    } else if (kind === 'bgt') {
      el.style.background = on ? pick(onBits,0,'') : pick(offBits,0,'transparent');
    }
  }
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-hover]');
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    applyHover(el, true);
  });
  document.addEventListener('mouseout', e => {
    const el = e.target.closest('[data-hover]');
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    applyHover(el, false);
  });

  // __test: exposes the pure grammar functions for the unit-test suite.
  window.VeltruviaActions = { version: '1.5.0', __test: { parse, coerce, arg, splitCall, resolve } };
})();
