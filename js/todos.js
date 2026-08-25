/* ============================================================
   todos.js — the to-do list, its editor, and the shared row markup
   ============================================================ */

const Todos = {

  /* ---- due-date presets driven by the timetable ---- */
  duePresets(subjectId){
    const out = [{ key: 'none', label: 'No due date', date: null }];
    const today = new Date();
    out.push({ key: 'today', label: 'Today · ' + shortDate(today), date: dateKey(today) });
    const tm = addDays(today, 1);
    out.push({ key: 'tomorrow', label: 'Tomorrow · ' + shortDate(tm), date: dateKey(tm) });

    const nx = Store.nextClasses(subjectId || null, 2);
    if(nx[0]) out.splice(1, 0, {
      key: 'next',
      label: 'Next class · ' + DOW[nx[0].date.getDay()] + ' ' + shortDate(nx[0].date) + ' ' + fmtHM(parseHM(nx[0].entry.start)),
      date: dateKey(nx[0].date)
    });
    if(nx[1]) out.splice(2, 0, {
      key: 'next2',
      label: 'Class after that · ' + DOW[nx[1].date.getDay()] + ' ' + shortDate(nx[1].date) + ' ' + fmtHM(parseHM(nx[1].entry.start)),
      date: dateKey(nx[1].date)
    });
    out.push({ key: 'custom', label: 'Pick a date…', date: null });
    return out;
  },

  editor(todo, onSaved){
    const isNew = !todo;
    const t = todo || { id: uid('td'), subjectId: '', title: '', link: '', desc: '', due: null, done: false, createdAt: Date.now() };

    let subjectId = t.subjectId || '';
    const subj = subjectChips(subjectId, v => { subjectId = v; fillPresets(); });

    const title = textInput(t.title, 'e.g. Finish Paper 2 practice questions');
    const link = textInput(t.link, 'https://…');
    const desc = el('textarea', { placeholder: 'Anything you need to remember about it' });
    desc.value = t.desc || '';

    /* due date: tappable presets, with the date input hidden until "Pick a date" */
    const dateIn = el('input', { type: 'date', value: t.due || '', style: { display: 'none', marginTop: '8px', maxWidth: '190px' } });
    let dueKey = 'none', presets = [], firstFill = true;

    const dueChips = chipset([], 'none', k => {
      dueKey = k;
      const show = k === 'custom';
      dateIn.style.display = show ? 'block' : 'none';
      if(show && !dateIn.value) dateIn.value = dateKey();
    });

    const fillPresets = () => {
      presets = Todos.duePresets(subjectId);
      dueChips.setOptions(presets.map(p => ({ value: p.key, label: p.label })));
      if(firstFill && t.due){
        const hit = presets.find(p => p.date === t.due && p.key !== 'none');
        dueKey = hit ? hit.key : 'custom';
      }
      firstFill = false;
      dueChips.set(dueKey);
      dateIn.style.display = dueKey === 'custom' ? 'block' : 'none';
    };
    fillPresets();

    const body = el('div', {}, [
      field('Subject', subj),
      field('Task', title),
      field('Due', el('div', {}, [dueChips, dateIn])),
      field('Link (optional)', link),
      field('Notes (optional)', desc)
    ]);

    const save = close => {
      if(!title.value.trim()){ toast('Give the task a name first.', true); return; }
      t.subjectId = subjectId || null;
      t.title = title.value.trim();
      t.link = link.value.trim();
      t.desc = desc.value.trim();
      const p = presets.find(x => x.key === dueKey);
      t.due = dueKey === 'custom' ? (dateIn.value || null) : (p ? p.date : null);
      if(isNew) Store.state.todos.push(t);
      Store.save();
      close();
      toast(isNew ? 'Task added.' : 'Task updated.');
      if(onSaved) onSaved(t); else App.render();
    };

    const actions = [{ label: 'Cancel', onClick: c => c() }];
    if(!isNew) actions.unshift({ label: 'Delete', cls: 'danger', onClick: c => {
      Store.state.todos = Store.state.todos.filter(x => x.id !== t.id);
      Store.save(); c(); toast('Task deleted.'); App.render();
    }});
    actions.push({ label: isNew ? 'Add task' : 'Save', cls: 'primary', onClick: save });

    modal({ title: isNew ? 'New task' : 'Edit task', body, actions });
    title.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); document.querySelector('.modal-f .btn.primary').click(); }});
  },

  /* ---- one row ---- */
  row(t, opts){
    opts = opts || {};
    const toggle = () => {
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
      Store.save();
      if(opts.onChange) opts.onChange(); else App.render();
    };

    let dueEl = null;
    if(t.due){
      const d = fromKey(t.due);
      const diff = daysBetween(new Date(), d);
      const cls = diff < 0 ? 'over' : diff === 0 ? 'today' : '';
      const label = diff < 0 ? Math.abs(diff) + 'd overdue'
                  : diff === 0 ? 'due today'
                  : diff === 1 ? 'due tomorrow'
                  : 'D-' + diff + ' · ' + DOW[d.getDay()] + ' ' + shortDate(d);
      dueEl = el('span.due', { text: label, cls });
    }

    const meta = el('div.todo-meta', {}, [
      t.subjectId ? el('span', {}, [
        el('i.dot', { style: { background: Store.subjectColor(t.subjectId), display: 'inline-block' } }),
        el('span', { text: ' ' + Store.subjectName(t.subjectId) })
      ]) : null,
      dueEl,
      t.link ? el('a', { href: t.link, target: '_blank', rel: 'noopener', text: 'link ↗' }) : null
    ]);

    return el('div.todo' + (t.done ? '.done' : ''), {}, [
      el('button.todo-check', { text: t.done ? '✓' : '', onclick: toggle, title: 'Mark done' }),
      el('div.todo-body', {}, [
        el('div.todo-title', { text: t.title }),
        meta,
        (opts.showDesc && t.desc) ? el('div.todo-desc', { text: t.desc }) : null
      ]),
      el('div.todo-actions', {}, [
        el('button.btn.sm.ghost', { text: '✎', title: 'Edit', onclick: () => Todos.editor(t, opts.onChange) })
      ])
    ]);
  },

  /* ---- grouped, expandable list (sidebar + study view) ---- */
  grouped(opts){
    opts = opts || {};
    const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px' } });
    const map = Store.todosBySubject();
    let printed = 0;

    const render = () => {
      clear(wrap);
      printed = 0;
      const order = Store.state.subjects.map(s => s.id).concat(['none']);
      order.forEach(sid => {
        const list = (map.get(sid) || []).filter(t => opts.showDone ? true : !t.done);
        if(!list.length) return;
        printed++;
        const open = Todos._open[sid] !== false;
        const body = el('div.subj-body', {},
          list.map(t => Todos.row(t, { showDesc: true, onChange: () => { App.render(); } })));
        body.style.display = open ? '' : 'none';
        const caret = el('span.caret' + (open ? '.open' : ''), { text: '▶' });
        wrap.appendChild(el('div.subj-group', {}, [
          el('button.subj-head', { onclick: () => {
            Todos._open[sid] = !(Todos._open[sid] !== false);
            body.style.display = Todos._open[sid] !== false ? '' : 'none';
            caret.classList.toggle('open', Todos._open[sid] !== false);
          }}, [
            caret,
            el('i.dot', { style: { background: sid === 'none' ? 'var(--mist-dim)' : Store.subjectColor(sid) } }),
            el('span', { text: sid === 'none' ? 'Unassigned' : Store.subjectName(sid) }),
            el('span.subj-count', { text: list.filter(t => !t.done).length + ' open' })
          ]),
          body
        ]));
      });
      if(!printed) wrap.appendChild(el('div.empty', { text: opts.emptyText || 'Nothing on the list. Enjoy it while it lasts.' }));
    };
    render();
    return wrap;
  },
  _open: {},

  /* ---- full page ---- */
  view(){
    const page = el('div');
    const filterAll = { value: false };

    const head = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' } }, [
      el('h2', { text: 'To-dos' }),
      el('span.pill', { text: Store.openTodos().length + ' open' }),
      el('div.spacer'),
      el('button.btn.sm', { text: 'Show completed', onclick: e => {
        filterAll.value = !filterAll.value;
        e.target.textContent = filterAll.value ? 'Hide completed' : 'Show completed';
        clear(listWrap).appendChild(Todos.grouped({ showDone: filterAll.value }));
      }}),
      el('button.btn.primary', { text: '+ New task', onclick: () => Todos.editor(null) })
    ]);

    const listWrap = el('div', {}, [Todos.grouped({ showDone: false })]);

    /* overdue banner */
    const overdue = Store.openTodos().filter(t => t.due && t.due < dateKey());
    page.appendChild(head);
    if(overdue.length) page.appendChild(el('div.card', {
      style: { padding: '10px 13px', marginBottom: '12px', borderColor: 'var(--ember)' }
    }, [el('span', { text: overdue.length + ' task' + (overdue.length > 1 ? 's are' : ' is') + ' past due.' })]));
    page.appendChild(listWrap);
    return page;
  }
};
