/* ============================================================
   ui.js — element helper, modals, toasts
   ============================================================ */

function el(tag, attrs, kids){
  const parts = tag.split(/(?=[.#])/);
  const node = document.createElement(parts[0] || 'div');
  parts.slice(1).forEach(p => {
    if(p[0] === '.') node.classList.add(p.slice(1));
    else node.id = p.slice(1);
  });
  if(attrs) for(const k in attrs){
    const v = attrs[k];
    if(v === null || v === undefined || v === false) continue;
    if(k === 'text') node.textContent = v;
    else if(k === 'html') node.innerHTML = v;
    else if(k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if(k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if(k === 'cls') node.className += ' ' + v;
    else node.setAttribute(k, v);
  }
  (kids || []).forEach(k => { if(k) node.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
  return node;
}

function clear(node){ while(node.firstChild) node.removeChild(node.firstChild); return node; }

function toast(msg, bad){
  const t = el('div.toast', { text: msg, cls: bad ? 'bad' : '' });
  document.getElementById('toastRoot').appendChild(t);
  setTimeout(() => t.remove(), bad ? 4200 : 2400);
}

/* modal({title, body(HTMLElement), actions:[{label,cls,onClick(close)}], wide}) */
function modal(opts){
  const root = document.getElementById('modalRoot');
  const back = el('div.modal-back');
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if(e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  back.addEventListener('mousedown', e => { if(e.target === back) close(); });

  const box = el('div.modal' + (opts.wide ? '.wide' : ''), {}, [
    el('div.modal-h', {}, [
      el('h3', { text: opts.title || '' }),
      el('button.icon-btn', { text: '✕', title: 'Close', onclick: close })
    ]),
    el('div.modal-b', {}, [opts.body]),
    (opts.actions && opts.actions.length) ? el('div.modal-f', {}, opts.actions.map(a =>
      el('button.btn', { text: a.label, cls: a.cls || '', onclick: () => a.onClick(close) })
    )) : null
  ]);
  back.appendChild(box);
  root.appendChild(back);
  const first = box.querySelector('input,select,textarea');
  if(first) setTimeout(() => first.focus(), 30);
  return close;
}

function confirmDialog(title, message, danger, onYes){
  modal({
    title,
    body: el('p', { text: message, style: { margin: '0', color: 'var(--mist)' } }),
    actions: [
      { label: 'Cancel', onClick: c => c() },
      { label: danger || 'Confirm', cls: 'danger', onClick: c => { c(); onYes(); } }
    ]
  });
}

/* form field builders */
function field(label, input){
  return el('label.field', {}, [el('span', { text: label }), input]);
}
function textInput(value, ph){ return el('input', { type: 'text', value: value || '', placeholder: ph || '' }); }
function subjectSelect(value, allowNone){
  const s = el('select');
  if(allowNone !== false) s.appendChild(el('option', { value: '', text: '— no subject —' }));
  Store.state.subjects.forEach(sub => s.appendChild(el('option', { value: sub.id, text: sub.name })));
  s.value = value || '';
  return s;
}

/* ------------------------------------------------------------
   chipset — a row of tappable buttons in place of a <select>
   options: [{value, label, color?}]
   The returned node has .get(), .set(v) and .setOptions(list).
   ------------------------------------------------------------ */
function chipset(options, value, onChange){
  const wrap = el('div.chipset');
  const draw = () => {
    clear(wrap);
    options.forEach(o => {
      const sel = String(o.value) === String(value);
      const b = el('button.chip-btn' + (sel ? '.sel' : ''), {
        type: 'button',
        onclick: () => { value = o.value; draw(); if(onChange) onChange(o.value, o); }
      }, [
        o.color ? el('i.dot', { style: { background: o.color } }) : null,
        el('span', { text: o.label })
      ]);
      if(sel && o.color){
        b.style.background = 'color-mix(in srgb,' + o.color + ' 28%, transparent)';
        b.style.borderColor = o.color;
      } else if(sel) b.classList.add('neutral');
      wrap.appendChild(b);
    });
  };
  draw();
  wrap.get = () => value;
  wrap.set = v => { value = v; draw(); };
  wrap.setOptions = list => { options = list; draw(); };
  return wrap;
}

/* subject chips, with an "unassigned" option first */
function subjectChips(value, onChange, allowNone){
  const opts = [];
  if(allowNone !== false) opts.push({ value: '', label: 'None' });
  Store.state.subjects.forEach(s => opts.push({ value: s.id, label: s.name, color: s.color }));
  return chipset(opts, value || '', onChange);
}

/* ------------------------------------------------------------
   colorPicker — swatch grid plus a manual hex / native picker
   ------------------------------------------------------------ */
function colorPicker(value, onChange){
  value = value || PALETTE[0];
  const swatches = el('div.swatches');
  const hex = el('input', { type: 'text', value, maxlength: '7', spellcheck: 'false', style: { width: '96px', flex: 'none', fontFamily: "'IBM Plex Mono',monospace" } });
  const native = el('input', { type: 'color', value, style: { width: '40px', flex: 'none' } });

  const paint = () => swatches.querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', b.dataset.c.toLowerCase() === String(value).toLowerCase()));
  const set = v => { value = v; hex.value = v; native.value = v; paint(); if(onChange) onChange(v); };

  PALETTE_EXT.forEach(c => swatches.appendChild(
    el('button.sw', { type: 'button', 'data-c': c, title: c, style: { background: c }, onclick: () => set(c) })));

  hex.addEventListener('change', () => {
    let v = hex.value.trim();
    if(v && v[0] !== '#') v = '#' + v;
    if(/^#[0-9a-fA-F]{6}$/.test(v)) set(v);
    else { hex.value = value; toast('Use a 6-digit hex code like #5b8def.', true); }
  });
  native.addEventListener('input', () => set(native.value));

  paint();
  return el('div.colorpick', {}, [
    swatches,
    el('div', { style: { display: 'flex', gap: '7px', alignItems: 'center', marginTop: '7px' } }, [
      native, hex, el('span', { style: { fontSize: '11px', color: 'var(--mist-dim)' }, text: 'or type a hex code' })
    ])
  ]);
}
