/* ============================================================
   calendarview.js — the full picture: classes, sessions, plans,
   deadlines, due tasks and time actually studied.
   Personal plans live here only; the dashboard never shows them.
   ============================================================ */

const CalendarView = {
  cursor: null,

  filters(){
    if(!Store.state.settings.calFilters){
      Store.state.settings.calFilters = { classes: true, exams: true, sessions: true, plans: true, todos: true };
    }
    return Store.state.settings.calFilters;
  },

  view(){
    if(!this.cursor){ const n = new Date(); this.cursor = new Date(n.getFullYear(), n.getMonth(), 1); }
    const c = this.cursor;
    const f = this.filters();
    const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][c.getMonth()];

    const page = el('div');
    page.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' } }, [
      el('h2', { text: monthName + ' ' + c.getFullYear() }),
      el('button.btn.sm', { text: '\u2039', title: 'Previous month', onclick: () => { this.cursor = new Date(c.getFullYear(), c.getMonth()-1, 1); App.render(); } }),
      el('button.btn.sm', { text: 'Today', onclick: () => { const n = new Date(); this.cursor = new Date(n.getFullYear(), n.getMonth(), 1); App.render(); } }),
      el('button.btn.sm', { text: '\u203a', title: 'Next month', onclick: () => { this.cursor = new Date(c.getFullYear(), c.getMonth()+1, 1); App.render(); } }),
      el('div.spacer'),
      el('button.btn.sm', { text: '+ Deadline', onclick: () => Settings.examEditor(null) }),
      el('button.btn.sm', { text: '+ Plan', onclick: () => CalendarView.planEditor(null) }),
      el('button.btn.go', { onclick: () => Session.newDialog() }, [el('i.tri'), el('span', { text: 'Plan session' })])
    ]));

    const toggles = [['classes','Classes'],['exams','Deadlines'],['sessions','Study'],['plans','Plans'],['todos','Tasks due']];
    page.appendChild(el('div.cal-filters', {},
      toggles.map(([k, label]) => el('button.chip-btn' + (f[k] ? '.sel.neutral' : ''), {
        type: 'button', text: label,
        onclick: () => { f[k] = !f[k]; Store.save(); App.render(); }
      }))));

    const grid = el('div.cal-grid');
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d => grid.appendChild(el('div.cal-dow', { text: d })));

    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const start = startOfWeek(first);
    const today = dateKey();

    for(let i = 0; i < 42; i++){
      const d = addDays(start, i);
      const dk = dateKey(d);
      const out = d.getMonth() !== c.getMonth();
      const cell = el('div.cal-cell' + (out ? '.out' : '') + (dk === today ? '.today' : ''), {
        title: 'Click for the whole day'
      }, [el('div.cal-day', { text: String(d.getDate()) })]);

      const items = this.itemsFor(d, f);
      items.slice(0, 4).forEach(it => cell.appendChild(el('div.cal-chip' + (it.cls ? '.' + it.cls : ''), {
        style: { '--cc': it.color }, text: it.label, title: it.title || it.label
      })));
      if(items.length > 4) cell.appendChild(el('div.cal-more', { text: '+' + (items.length - 4) + ' more' }));

      const secs = Store.secondsOn(dk);
      if(secs > 60) cell.appendChild(el('div.mono', { text: '\u23f1 ' + fmtDur(secs/60),
        style: { fontSize: '10px', color: 'var(--green)', marginTop: 'auto' } }));

      cell.addEventListener('click', () => CalendarView.daySheet(d));
      grid.appendChild(cell);
    }

    page.appendChild(grid);
    page.appendChild(el('div', { style: { fontSize: '11.5px', color: 'var(--mist-dim)', marginTop: '10px' },
      text: 'Click a day to open it. Plans are reminders that live on this page only \u2014 they never appear on the dashboard.' }));
    return page;
  },

  /* everything happening on one day, in time order */
  itemsFor(d, f){
    const dk = dateKey(d);
    const out = [];
    if(f.classes) Store.classesOn(d).forEach(c => out.push({
      sort: parseHM(c.start), cls: 'cls', color: Store.subjectColor(c.subjectId),
      label: fmtHM(parseHM(c.start)) + ' ' + Store.subjectName(c.subjectId),
      title: Store.subjectName(c.subjectId) + ' \u00b7 ' + c.start + '\u2013' + c.end + (c.room ? ' \u00b7 ' + c.room : ''),
      kind: 'class', ref: c
    }));
    if(f.exams) Store.state.exams.filter(e => e.date === dk).forEach(e => out.push({
      sort: -2, color: e.subjectId ? Store.subjectColor(e.subjectId) : '#e5544b',
      label: '! ' + e.title, title: e.title, kind: 'exam', ref: e
    }));
    if(f.sessions) Store.sessionOn(dk).forEach(s => out.push({
      sort: sessionClockStart(s), color: '#f2a33c',
      label: '\u25b8 ' + fmtHM(sessionClockStart(s)) + ' ' + s.title, title: s.title, kind: 'session', ref: s
    }));
    if(f.plans) Store.plansOn(dk).forEach(p => out.push({
      sort: p.start ? parseHM(p.start) : -1, cls: 'plan', color: p.color || '#8b97a8',
      label: (p.start ? fmtHM(parseHM(p.start)) + ' ' : '') + p.title, title: p.title, kind: 'plan', ref: p
    }));
    if(f.todos) Store.state.todos.filter(t => !t.done && t.due === dk).forEach(t => out.push({
      sort: 9999, color: Store.subjectColor(t.subjectId),
      label: '\u25a1 ' + t.title, title: t.title, kind: 'todo', ref: t
    }));
    return out.sort((a,b) => a.sort - b.sort);
  },

  /* full day, opened from a cell */
  daySheet(d){
    const dk = dateKey(d);
    const items = this.itemsFor(d, { classes: true, exams: true, sessions: true, plans: true, todos: true });
    const secs = Store.secondsOn(dk);
    let close = () => {};

    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
    if(!items.length) list.appendChild(el('div.empty', { text: 'Nothing on this day yet.' }));
    items.forEach(it => {
      const row = el('div.mini-item' + (it.kind === 'class' ? '' : '.click'), {}, [
        el('i.dot', { style: { background: it.color } }),
        el('span', { text: it.label }),
        el('span.spacer'),
        el('span.mono', { text: it.kind })
      ]);
      if(it.kind === 'plan') row.addEventListener('click', () => { close(); CalendarView.planEditor(it.ref); });
      if(it.kind === 'exam') row.addEventListener('click', () => { close(); Settings.examEditor(it.ref); });
      if(it.kind === 'todo') row.addEventListener('click', () => { close(); Todos.editor(it.ref); });
      if(it.kind === 'session') row.addEventListener('click', () => { close(); Session.activeId = it.ref.id; App.go('session'); });
      list.appendChild(row);
    });

    close = modal({
      title: prettyDate(d, true),
      body: el('div', {}, [
        secs > 60 ? el('div.pill.mono', { text: fmtDur(secs/60) + ' studied', style: { marginBottom: '10px' } }) : null,
        list
      ]),
      actions: [
        { label: '+ Plan', onClick: c => { c(); CalendarView.planEditor(null, dk); } },
        { label: '+ Deadline', onClick: c => { c(); Settings.examEditor(null); } },
        { label: 'Plan session', cls: 'primary', onClick: c => { c(); Session.newDialog(dk); } }
      ]
    });
  },

  /* personal plans / reminders — calendar only */
  planEditor(plan, forDate){
    const isNew = !plan;
    const p = plan || { id: uid('pln'), title: '', date: forDate || dateKey(), start: '', end: '', notes: '', color: '#8b97a8' };

    const title = textInput(p.title, 'e.g. Dentist, football, call home');
    const date = el('input', { type: 'date', value: p.date });
    const start = el('input', { type: 'time', value: p.start || '' });
    const end = el('input', { type: 'time', value: p.end || '' });
    const notes = el('textarea', { placeholder: 'Optional' });
    notes.value = p.notes || '';
    let color = p.color || '#8b97a8';

    const actions = [{ label: 'Cancel', onClick: c => c() }];
    if(!isNew) actions.unshift({ label: 'Delete', cls: 'danger', onClick: c => {
      Store.state.plans = Store.state.plans.filter(x => x.id !== p.id);
      Store.save(); c(); toast('Plan removed.'); App.render();
    }});
    actions.push({ label: isNew ? 'Add plan' : 'Save', cls: 'primary', onClick: c => {
      if(!title.value.trim()){ toast('Give the plan a name.', true); return; }
      Object.assign(p, { title: title.value.trim(), date: date.value, start: start.value,
        end: end.value, notes: notes.value.trim(), color });
      if(isNew){ Store.state.plans = Store.state.plans || []; Store.state.plans.push(p); }
      Store.save(); c(); App.render();
    }});

    modal({
      title: isNew ? 'New plan' : 'Edit plan',
      body: el('div', {}, [
        field('What', title),
        field('Date', date),
        el('div.row', {}, [field('From (optional)', start), field('To (optional)', end)]),
        field('Colour', colorPicker(color, v => { color = v; })),
        field('Notes', notes)
      ]),
      actions
    });
  }
};
