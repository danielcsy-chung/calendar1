/* ============================================================
   session.js — the 5-minute grid, live sessions, PiP panel
   ============================================================ */

const Session = {
  activeId: null,
  _lastTick: null,
  _saveDebt: 0,
  _pip: null,
  _els: {},

  active(){
    let s = Store.state.sessions.find(x => x.id === this.activeId);
    if(!s){
      const today = dateKey();
      s = Store.state.sessions.filter(x => x.date >= today).sort((a,b) => a.date < b.date ? -1 : 1)[0]
        || Store.state.sessions.slice().sort((a,b) => a.date < b.date ? 1 : -1)[0];
      this.activeId = s ? s.id : null;
    }
    return s || null;
  },

  create(date, title, open){
    const s = newSession(date, title);
    Store.state.sessions.push(s);
    Store.save();
    this.activeId = s.id;
    if(open !== false) App.go('session');
    return s;
  },

  startToday(){
    const today = dateKey();
    let s = Store.state.sessions.find(x => x.date === today && !x.endedAt);
    if(!s) s = this.create(today, 'Study session', false);
    this.activeId = s.id;
    App.go('session');
  },

  slotPx(){ return Store.state.settings.slotPx || 13; },
  totalMin(ses){ return ses.hours * 60; },

  /* ---------- collision helpers ---------- */
  fits(ses, offset, dur, ignoreId){
    if(offset < 0 || offset + dur > this.totalMin(ses)) return false;
    return !ses.blocks.some(b => b.id !== ignoreId && offset < b.offset + b.dur && b.offset < offset + dur);
  },
  trim(ses, offset, dur){
    const after = ses.blocks.filter(b => b.offset >= offset).sort((a,b) => a.offset - b.offset)[0];
    if(after) dur = Math.min(dur, after.offset - offset);
    return Math.max(SLOT, Math.min(dur, this.totalMin(ses) - offset));
  },
  locked(ses, b){
    const off = sessionNowOffset(ses);
    return off !== null && !ses.endedAt && (b.offset + b.dur) <= off;
  },

  /* ============================================================
     view
     ============================================================ */
  view(){
    const page = el('div');
    const ses = this.active();

    if(!ses){
      page.appendChild(el('div.card', { style: { padding: '40px', textAlign: 'center' } }, [
        el('h2', { text: 'No sessions yet' }),
        el('p', { style: { color: 'var(--mist)', maxWidth: '420px', margin: '8px auto 16px' },
          text: 'A session is one sitting: you block out what you will work on in 5-minute steps, then press start.' }),
        el('button.btn.primary', { text: 'Plan a session', onclick: () => Session.newDialog() })
      ]));
      return page;
    }

    /* ---- header ---- */
    const titleIn = el('input.study-title-input', { type: 'text', value: ses.title });
    titleIn.addEventListener('change', () => { ses.title = titleIn.value || 'Study session'; Store.save(); });

    const dateIn = el('input', { type: 'date', value: ses.date, style: { width: '140px', flex: 'none' } });
    dateIn.addEventListener('change', () => { ses.date = dateIn.value; Store.save(); App.render(); });

    const sesSel = el('select', { style: { width: '190px', flex: 'none' } });
    Store.state.sessions.slice().sort((a,b) => a.date < b.date ? 1 : -1).forEach(s => {
      sesSel.appendChild(el('option', { value: s.id,
        text: shortDate(fromKey(s.date)) + ' · ' + s.title + (s.endedAt ? ' ✓' : '') }));
    });
    sesSel.value = ses.id;
    sesSel.addEventListener('change', () => { Session.activeId = sesSel.value; App.render(); });

    const running = !!ses.startedAt && !ses.endedAt;
    const startLabel = running ? 'End session' : (ses.endedAt ? 'Reopen session' : 'Start session');
    const startBtn = el('button.btn' + (running ? '.danger' : '.go'), {
      onclick: () => {
        if(running){
          confirmDialog('End this session?', 'Time already logged is kept. You can reopen it later.', 'End session', () => {
            ses.endedAt = Date.now(); Store.save(); Session.closePiP(); App.render();
          });
        } else if(ses.endedAt){
          ses.endedAt = null; if(!ses.startedAt) ses.startedAt = Date.now(); Store.save(); App.render();
        } else {
          if(!ses.blocks.length){ toast('Block out at least one task first — drag on the grid.', true); return; }
          ses.startedAt = Date.now(); Session._lastTick = Date.now(); Store.save();
          if(Store.state.settings.autoPiP !== false) Session.openPiP(true);
          App.render();
          toast('Session started. The red line is now.');
        }
      }
    }, [
      running ? null : el('i.tri'),
      el('span', { text: startLabel })
    ]);

    page.appendChild(el('div.study-head', {}, [
      titleIn,
      sesSel,
      dateIn,
      el('button.btn.sm', { text: '+ New', title: 'Plan another session', onclick: () => Session.newDialog() }),
      el('button.btn.sm', { text: 'Pop out', title: 'Reopen the floating timer', onclick: () => Session.openPiP() }),
      startBtn
    ]));

    /* ---- stats ---- */
    const statRail = el('div.stat-rail');
    page.appendChild(statRail);
    this._els.statRail = statRail;
    this.renderStats(ses);

    /* ---- layout ---- */
    const grid = this.renderGrid(ses);
    const side = el('div.side', {}, [
      el('div.card', {}, [
        el('div.side-head', {}, [el('h3', { text: 'To-dos' }), el('button.btn.sm', { text: '+', onclick: () => Todos.editor(null) })]),
        el('div.side-list', { style: { maxHeight: '46vh' } }, [Todos.grouped({})])
      ]),
      el('div.card', {}, [
        el('div.side-head', {}, [el('h3', { text: 'Up next' })]),
        el('div.side-list', {}, [this.upNext(ses)])
      ])
    ]);

    page.appendChild(el('div.study', {}, [grid, side]));
    return page;
  },

  renderStats(ses){
    const rail = this._els.statRail;
    if(!rail) return;
    const planned = sessionPlannedTask(ses);
    const studied = sessionStudiedSecs(ses) / 60;
    const togo = Math.max(0, planned - studied);
    const running = !!ses.startedAt && !ses.endedAt;
    const off = sessionNowOffset(ses);
    const cur = off !== null && !ses.endedAt ? blockAt(ses, off) : null;

    clear(rail);
    [
      ['Studied', fmtDur(studied), running],
      ['To go', fmtDur(togo), false],
      ['Planned work', fmtDur(planned), false],
      ['Breaks', fmtDur(sessionPlannedBreak(ses)), false],
      ['Now', cur ? (cur.type === 'break' ? '☕ ' + cur.title : cur.title) : (running ? 'unscheduled' : '—'), !!cur]
    ].forEach(([k, v, live]) => {
      rail.appendChild(el('div.stat' + (live ? '.live' : ''), {}, [
        el('div.stat-k', { text: k }),
        el('div.stat-v', { text: v, style: k === 'Now' ? { fontSize: '14px', fontFamily: "'Karla',sans-serif" } : {} })
      ]));
    });
  },

  upNext(ses){
    const off = sessionNowOffset(ses);
    const list = ses.blocks.slice().sort((a,b) => a.offset - b.offset)
      .filter(b => off === null || b.offset + b.dur > off).slice(0, 6);
    if(!list.length) return el('div.empty', { text: 'Nothing scheduled after now.' });
    const clockStart = sessionClockStart(ses);
    return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      list.map(b => el('div.mini-item.click', { onclick: () => Session.blockEditor(ses, b) }, [
        el('i.dot', { style: { background: b.type === 'break' ? 'var(--mist-dim)' : Store.subjectColor(b.subjectId) } }),
        el('span.mono', { text: fmtHM(clockStart + b.offset) }),
        el('span', { text: b.title, style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
        el('span.spacer'),
        el('span.mono', { text: fmtDur(b.dur) })
      ])));
  },

  /* ============================================================
     the grid
     ============================================================ */
  renderGrid(ses){
    const px = this.slotPx();
    document.documentElement.style.setProperty('--slot', px + 'px');
    const total = this.totalMin(ses);
    const height = (total / SLOT) * px;
    const clockStart = sessionClockStart(ses);
    const showClock = Store.state.settings.showClock;

    /* toolbar */
    const hoursIn = el('input.mini', { type: 'number', min: '1', max: '10', step: '1', value: ses.hours });
    hoursIn.addEventListener('change', () => {
      const h = Math.max(1, Math.min(10, Number(hoursIn.value) || 4));
      const last = ses.blocks.reduce((m,b) => Math.max(m, b.offset + b.dur), 0);
      if(h * 60 < last){ toast('Blocks are scheduled beyond that point.', true); hoursIn.value = ses.hours; return; }
      ses.hours = h; Store.save(); App.render();
    });

    const clockIn = el('input.mini', { type: 'time', value: fmtHM(ses.startClock, true), style: { width: '110px' } });
    clockIn.addEventListener('change', () => { ses.startClock = parseHM(clockIn.value); Store.save(); App.render(); });

    const bar = el('div.gridbar', {}, [
      el('span.eyebrow', { text: 'Grid' }),
      el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: 'var(--mist)' } },
        ['Hours', hoursIn]),
      el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: 'var(--mist)' } },
        ['Hour 0 starts', clockIn]),
      el('button.btn.sm', { text: showClock ? 'Hide clock times' : 'Show clock times', onclick: () => {
        Store.state.settings.showClock = !showClock; Store.save(); App.render();
      }}),
      el('button.btn.sm', { text: '−', title: 'Compact rows', onclick: () => {
        Store.state.settings.slotPx = Math.max(8, px - 3); Store.save(); App.render();
      }}),
      el('button.btn.sm', { text: '+', title: 'Taller rows', onclick: () => {
        Store.state.settings.slotPx = Math.min(24, px + 3); Store.save(); App.render();
      }}),
      el('div.spacer'),
      el('button.btn.sm', { text: '+ Coffee break', onclick: () => Session.quickBreak(ses, 'coffee', 15) }),
      el('button.btn.sm', { text: '+ Lunch break', onclick: () => Session.quickBreak(ses, 'lunch', 45) })
    ]);

    /* gutter */
    const gutter = el('div.gutter', { style: { height: height + 'px' } });
    for(let h = 0; h <= ses.hours; h++){
      gutter.appendChild(el('div.hour-label', { style: { top: (h * 12 * px) + 'px' } }, [
        el('b', { text: 'H' + h }),
        showClock ? el('span', { text: fmtHM(clockStart + h * 60) }) : null
      ]));
    }

    /* lanes */
    const lanes = el('div.lanes', { style: { height: height + 'px' } });
    ses.blocks.slice().sort((a,b) => a.offset - b.offset).forEach(b => lanes.appendChild(this.blockEl(ses, b, px, clockStart)));

    const preview = el('div.sel-preview', { style: { display: 'none' } });
    lanes.appendChild(preview);

    const nowline = el('div.nowline.pulse', { style: { display: 'none' } });
    lanes.appendChild(nowline);
    this._els.nowline = nowline;
    this._els.lanes = lanes;
    this._els.px = px;

    this.wireDragSelect(ses, lanes, preview, px);

    const scroll = el('div.grid-scroll', {}, [gutter, lanes]);
    this._els.scroll = scroll;

    return el('div', {}, [
      bar,
      el('div.grid-wrap', {}, [scroll]),
      el('div', { style: { fontSize: '11.5px', color: 'var(--mist-dim)', marginTop: '7px' },
        text: 'Drag on empty grid to block out time. Drag a block to move it, or its top/bottom edge to resize. Click to edit.' })
    ]);
  },

  blockEl(ses, b, px, clockStart){
    const color = b.type === 'break' ? '#8b97a8' : Store.subjectColor(b.subjectId);
    const locked = this.locked(ses, b);
    const h = (b.dur / SLOT) * px;
    const node = el('div.block' + (b.type === 'break' ? '.brk' : '') + (locked ? '.past' : ''), {
      style: { top: ((b.offset / SLOT) * px) + 'px', height: h + 'px', '--bc': color },
      'data-id': b.id
    }, [
      el('div.block-t', { text: (b.type === 'break' ? (b.breakKind === 'lunch' ? '🍜 ' : '☕ ') : '') + b.title }),
      h > 30 ? el('div.block-m', { text: fmtHM(clockStart + b.offset) + '–' + fmtHM(clockStart + b.offset + b.dur) + '  ·  ' + fmtDur(b.dur) }) : null,
      (h > 46 && b.type === 'task' && b.subjectId) ? el('div.block-sub', { text: Store.subjectName(b.subjectId) }) : null
    ]);

    /* inline check-ins when there is room */
    if(h > 74 && b.subtasks && b.subtasks.length){
      const room = Math.floor((h - 62) / 18);
      b.subtasks.slice(0, Math.max(1, room)).forEach(st => {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = !!st.done;
        cb.addEventListener('pointerdown', e => e.stopPropagation());
        cb.addEventListener('change', () => { st.done = cb.checked; Store.save(); });
        node.appendChild(el('label.checkin', {}, [cb, el('span', { text: st.text })]));
      });
    }

    if(!locked){
      node.appendChild(el('div.block-h.t'));
      node.appendChild(el('div.block-h.b'));
      this.wireBlockDrag(ses, node, b, px);
    }
    node.addEventListener('click', e => {
      if(node._moved) { node._moved = false; return; }
      if(e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL' || e.target.tagName === 'SPAN' && e.target.parentElement.classList.contains('checkin')) return;
      Session.blockEditor(ses, b);
    });
    return node;
  },

  wireDragSelect(ses, lanes, preview, px){
    let startSlot = null;
    const slotAt = e => {
      const r = lanes.getBoundingClientRect();
      return Math.max(0, Math.min(this.totalMin(ses)/SLOT - 1, Math.floor((e.clientY - r.top) / px)));
    };
    lanes.addEventListener('pointerdown', e => {
      if(e.target !== lanes) return;
      const off = sessionNowOffset(ses);
      startSlot = slotAt(e);
      if(off !== null && !ses.endedAt && (startSlot * SLOT) < off - SLOT){
        toast('That time has already passed — you can only plan ahead.', true);
        startSlot = null; return;
      }
      lanes.setPointerCapture(e.pointerId);
      preview.style.display = 'block';
      preview.style.top = (startSlot * px) + 'px';
      preview.style.height = px + 'px';
    });
    lanes.addEventListener('pointermove', e => {
      if(startSlot === null) return;
      const s = slotAt(e);
      const a = Math.min(s, startSlot), b = Math.max(s, startSlot) + 1;
      preview.style.top = (a * px) + 'px';
      preview.style.height = ((b - a) * px) + 'px';
    });
    lanes.addEventListener('pointerup', e => {
      if(startSlot === null) return;
      const s = slotAt(e);
      const a = Math.min(s, startSlot), b = Math.max(s, startSlot) + 1;
      startSlot = null;
      preview.style.display = 'none';
      const offset = a * SLOT;
      let dur = (b - a) * SLOT;
      if(!this.fits(ses, offset, SLOT)){ toast('There is already a block there.', true); return; }
      dur = this.trim(ses, offset, dur);
      this.blockEditor(ses, null, { offset, dur });
    });
    lanes.addEventListener('pointercancel', () => { startSlot = null; preview.style.display = 'none'; });
  },

  wireBlockDrag(ses, node, b, px){
    let mode = null, startY = 0, orig = null;
    node.addEventListener('pointerdown', e => {
      if(e.target.tagName === 'INPUT') return;
      mode = e.target.classList.contains('t') ? 'top' : e.target.classList.contains('b') ? 'bottom' : 'move';
      startY = e.clientY;
      orig = { offset: b.offset, dur: b.dur };
      node.setPointerCapture(e.pointerId);
      node.style.cursor = mode === 'move' ? 'grabbing' : 'ns-resize';
      e.stopPropagation();
    });
    node.addEventListener('pointermove', e => {
      if(!mode) return;
      const dSlots = Math.round((e.clientY - startY) / px);
      if(dSlots === 0) return;
      node._moved = true;
      const d = dSlots * SLOT;
      let off = orig.offset, dur = orig.dur;
      if(mode === 'move') off = orig.offset + d;
      else if(mode === 'top'){ off = orig.offset + d; dur = orig.dur - d; }
      else dur = orig.dur + d;
      if(dur < SLOT) return;
      const nowOff = sessionNowOffset(ses);
      if(nowOff !== null && !ses.endedAt && off < nowOff - SLOT) return;
      if(!this.fits(ses, off, dur, b.id)) return;
      b.offset = off; b.dur = dur;
      node.style.top = ((off / SLOT) * px) + 'px';
      node.style.height = ((dur / SLOT) * px) + 'px';
    });
    const end = () => {
      if(!mode) return;
      mode = null; node.style.cursor = '';
      Store.save();
      Session.softRefresh();
      setTimeout(() => { node._moved = false; }, 40);
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  },

  quickBreak(ses, kind, dur){
    const last = ses.blocks.reduce((m,b) => Math.max(m, b.offset + b.dur), 0);
    let offset = last;
    const nowOff = sessionNowOffset(ses);
    if(nowOff !== null) offset = Math.max(offset, Math.ceil(nowOff / SLOT) * SLOT);
    if(offset + dur > this.totalMin(ses)){ toast('No room left — add another hour first.', true); return; }
    ses.blocks.push({ id: uid('blk'), type: 'break', breakKind: kind, subjectId: null,
      title: kind === 'lunch' ? 'Lunch' : 'Coffee', detail: '', links: [], offset, dur, subtasks: [] });
    Store.save(); App.render();
  },

  /* ---------- block editor ---------- */
  blockEditor(ses, block, seed){
    const isNew = !block;
    const b = block || Object.assign({
      id: uid('blk'), type: 'task', subjectId: '', title: '', detail: '', links: [],
      offset: 0, dur: 30, subtasks: [], breakKind: 'coffee', todoId: null
    }, seed || {});

    let blockType = b.type;
    const typeChips = chipset([
      { value: 'task', label: 'Work block' },
      { value: 'break', label: 'Break' }
    ], blockType, v => { blockType = v; syncType(); });

    let subjectId = b.subjectId || '';
    const subj = subjectChips(subjectId, v => { subjectId = v; });
    const title = textInput(b.title, 'What are you doing in this block?');
    const detail = el('textarea', { placeholder: 'Detail — pages, questions, what "done" looks like' });
    detail.value = b.detail || '';
    const links = el('textarea', { placeholder: 'One link per line', style: { minHeight: '54px' } });
    links.value = (b.links || []).join('\n');

    const clockStart = sessionClockStart(ses);
    const startIn = el('input', { type: 'time', value: fmtHM(clockStart + b.offset, true) });
    const durIn = el('input', { type: 'number', min: '5', step: '5', value: b.dur });

    /* pull from to-do list */
    const todoSel = el('select', {}, [el('option', { value: '', text: '— start from a to-do —' })]);
    Store.openTodos().forEach(t => todoSel.appendChild(el('option', { value: t.id,
      text: (t.subjectId ? Store.subjectName(t.subjectId) + ' · ' : '') + t.title })));
    todoSel.value = b.todoId || '';
    todoSel.addEventListener('change', () => {
      const t = Store.state.todos.find(x => x.id === todoSel.value);
      if(!t) return;
      title.value = t.title;
      if(t.subjectId){ subjectId = t.subjectId; subj.set(subjectId); }
      if(t.link) links.value = (links.value ? links.value + '\n' : '') + t.link;
      if(t.desc && !detail.value) detail.value = t.desc;
    });

    /* subtasks */
    const subWrap = el('div');
    const drawSubs = () => {
      clear(subWrap);
      (b.subtasks || []).forEach((st, i) => {
        const inp = textInput(st.text, 'Check-in');
        inp.addEventListener('input', () => { st.text = inp.value; });
        subWrap.appendChild(el('div.sub-row', {}, [
          inp,
          el('button.btn.sm.danger', { text: '✕', onclick: () => { b.subtasks.splice(i,1); drawSubs(); } })
        ]));
      });
      subWrap.appendChild(el('button.btn.sm', { text: '+ Add check-in', onclick: () => {
        b.subtasks = b.subtasks || []; b.subtasks.push({ id: uid('st'), text: '', done: false }); drawSubs();
      }}));
    };
    drawSubs();

    const taskOnly = el('div', {}, [
      field('Subject', subj),
      field('From your list', todoSel)
    ]);
    const syncType = () => { taskOnly.style.display = blockType === 'task' ? '' : 'none'; };
    syncType();

    const body = el('div', {}, [
      field('Type', typeChips),
      taskOnly,
      field('Title', title),
      el('div.row', {}, [field('Starts at', startIn), field('Minutes', durIn)]),
      field('Detail', detail),
      field('Links', links),
      el('div.field', {}, [el('span.eyebrow', { text: 'Check-ins', style: { display: 'block', marginBottom: '6px' } }), subWrap])
    ]);

    const save = close => {
      if(!title.value.trim()){ toast('Give the block a title.', true); return; }
      const offset = Math.round((parseHM(startIn.value) - clockStart + 1440) % 1440 / SLOT) * SLOT;
      const dur = Math.max(SLOT, Math.round(Number(durIn.value) / SLOT) * SLOT);
      if(!Session.fits(ses, offset, dur, b.id)){
        toast('That overlaps another block or runs past the end of the session.', true); return;
      }
      b.type = blockType;
      b.subjectId = b.type === 'task' ? (subjectId || null) : null;
      b.todoId = todoSel.value || null;
      b.title = title.value.trim();
      b.detail = detail.value.trim();
      b.links = links.value.split('\n').map(s => s.trim()).filter(Boolean);
      b.offset = offset; b.dur = dur;
      b.subtasks = (b.subtasks || []).filter(s => s.text.trim());
      if(isNew) ses.blocks.push(b);
      Store.save(); close(); App.render();
    };

    const actions = [{ label: 'Cancel', onClick: c => c() }];
    if(!isNew) actions.unshift({ label: 'Delete', cls: 'danger', onClick: c => {
      ses.blocks = ses.blocks.filter(x => x.id !== b.id);
      delete ses.tracked[b.id];
      Store.save(); c(); App.render();
    }});
    if(!isNew && b.todoId) actions.unshift({ label: 'Mark to-do done', onClick: c => {
      const t = Store.state.todos.find(x => x.id === b.todoId);
      if(t){ t.done = true; t.doneAt = Date.now(); Store.save(); toast('Nice. One off the list.'); }
      c(); App.render();
    }});
    actions.push({ label: isNew ? 'Add block' : 'Save', cls: 'primary', onClick: save });

    modal({ title: isNew ? 'New block' : 'Edit block', body, actions, wide: true });
  },

  newDialog(forDate){
    const date = el('input', { type: 'date', value: forDate || dateKey() });
    const title = textInput('', 'e.g. Friday evening — Physics IA');
    const hours = el('input', { type: 'number', min: '1', max: '10', value: Store.state.settings.defaultHours });
    const start = el('input', { type: 'time', value: '16:00' });
    modal({
      title: 'Plan a session',
      body: el('div', {}, [
        field('Date', date),
        field('Title', title),
        el('div.row', {}, [field('Starts at', start), field('Hours on the grid', hours)])
      ]),
      actions: [
        { label: 'Cancel', onClick: c => c() },
        { label: 'Create', cls: 'primary', onClick: c => {
          const s = Session.create(date.value || dateKey(), title.value.trim() || 'Study session', false);
          s.hours = Math.max(1, Math.min(10, Number(hours.value) || 4));
          s.startClock = parseHM(start.value);
          Store.save(); c(); App.go('session');
        }}
      ]
    });
  },

  /* ============================================================
     live tick — called once a second by App
     ============================================================ */
  tick(){
    const ses = Store.state.sessions.find(x => x.id === this.activeId);
    const now = Date.now();
    const last = this._lastTick || now;
    this._lastTick = now;
    if(!ses || !ses.startedAt || ses.endedAt) { this.updatePiP(null); return; }

    const delta = Math.min(30, (now - last) / 1000);
    const off = sessionNowOffset(ses);
    const cur = blockAt(ses, off);
    if(cur && cur.type === 'task'){
      ses.tracked[cur.id] = (ses.tracked[cur.id] || 0) + delta;
      Store.logSeconds(cur.subjectId, delta);
      this._saveDebt += delta;
      if(this._saveDebt > 15){ this._saveDebt = 0; Store.save(); }
    }

    /* now-line */
    if(this._els.nowline && this._els.lanes && document.body.contains(this._els.lanes)){
      const px = this._els.px;
      const y = (off / SLOT) * px;
      const nl = this._els.nowline;
      if(off >= 0 && off <= this.totalMin(ses)){
        nl.style.display = 'block';
        nl.style.top = y + 'px';
      } else nl.style.display = 'none';
      /* grey out blocks that have finished */
      this._els.lanes.querySelectorAll('.block').forEach(n => {
        const b = ses.blocks.find(x => x.id === n.dataset.id);
        if(b) n.classList.toggle('past', b.offset + b.dur <= off);
      });
      this.renderStats(ses);
    }
    this.updatePiP(ses);
  },

  softRefresh(){
    const ses = this.active();
    if(ses) this.renderStats(ses);
  },

  /* ============================================================
     picture-in-picture panel
     ============================================================ */
  async openPiP(auto){
    const ses = this.active();
    if(!ses){ if(!auto) toast('Open a session first.', true); return; }
    if(this._pip) return;
    if(!('documentPictureInPicture' in window)){
      if(!auto) toast('Your browser has no picture-in-picture for pages. Chrome or Edge 116+ can do it.', true);
      return;
    }
    const cs = getComputedStyle(document.documentElement);
    const v = n => cs.getPropertyValue(n).trim() || '';
    try{
      const w = await documentPictureInPicture.requestWindow({ width: 300, height: 360 });
      const style = w.document.createElement('style');
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Karla:wght@400;600;700&family=IBM+Plex+Mono:wght@500;700&display=swap');
        body{font-family:'Karla',system-ui,sans-serif;background:${v('--ink')};color:${v('--chalk')};margin:0;padding:14px}
        .big{font-size:32px;font-weight:700;font-family:'IBM Plex Mono',ui-monospace,monospace;color:${v('--amber')};line-height:1.15;letter-spacing:-.03em}
        .big.up{color:${v('--green')};font-size:25px;margin-bottom:8px}
        .k{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${v('--mist-dim')};font-weight:700}
        .r{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid ${v('--rule')}}
        .r b{font-family:'IBM Plex Mono',ui-monospace,monospace;font-weight:600}
        .now{margin:12px 0 14px}
        .t{font-size:14px;font-weight:600;margin-top:3px}
        ul{margin:8px 0 0;padding-left:16px;font-size:11px;color:${v('--mist')}}
      `;
      w.document.head.appendChild(style);
      const root = w.document.createElement('div');
      w.document.body.appendChild(root);
      this._pip = { win: w, root };
      w.addEventListener('pagehide', () => { this._pip = null; });
      this.updatePiP(ses);
    }catch(e){ if(!auto) toast('Could not open the picture-in-picture window.', true); }
  },

  closePiP(){ if(this._pip){ try{ this._pip.win.close(); }catch(e){} this._pip = null; } },

  updatePiP(ses){
    if(!this._pip) return;
    ses = ses || this.active();
    const root = this._pip.root;
    if(!ses){ root.innerHTML = '<div class="k">No session</div>'; return; }
    const off = sessionNowOffset(ses);
    const cur = off !== null && !ses.endedAt ? blockAt(ses, off) : null;
    const planned = sessionPlannedTask(ses);
    const studied = sessionStudiedSecs(ses) / 60;
    const left = cur ? (cur.offset + cur.dur - off) : 0;
    const openTodos = Store.openTodos().length;
    const subs = cur && cur.subtasks ? cur.subtasks.filter(s => !s.done).slice(0,3) : [];
    const next = ses.blocks.filter(b => off !== null && b.offset >= off).sort((a,b) => a.offset - b.offset)[0];
    root.innerHTML =
      '<div class="now"><div class="k">' +
        (cur ? (cur.type === 'break' ? 'Break ends in' : 'Task ends in') : 'Not in a block') + '</div>' +
      '<div class="big">' + (cur ? fmtClock(Math.max(0, left) * 60) : '--:--:--') + '</div>' +
      '<div class="t">' + (cur ? escapeHtml(cur.title) : (ses.endedAt ? 'Session ended' : 'Unscheduled time')) + '</div>' +
      (subs.length ? '<ul>' + subs.map(s => '<li>' + escapeHtml(s.text) + '</li>').join('') + '</ul>' : '') +
      '</div>' +
      '<div class="k" style="margin-top:2px">Total studied</div>' +
      '<div class="big up">' + fmtClock(studied * 60) + '</div>' +
      '<div class="r"><span>To go</span><b>' + fmtDur(Math.max(0, planned - studied)) + '</b></div>' +
      '<div class="r"><span>Up next</span><b>' + (next ? escapeHtml(next.title).slice(0,18) : '—') + '</b></div>' +
      '<div class="r"><span>Tasks open</span><b>' + openTodos + '</b></div>';
  }
};

function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
