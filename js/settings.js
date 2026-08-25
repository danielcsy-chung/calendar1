/* ============================================================
   settings.js — setup, imports, the format guide, data control
   ============================================================ */

const FORMAT_GUIDE = `You are converting my school information into a CSV that my study tracker can read.

Return ONLY the CSV. No explanation, no markdown fences, no header row.
Every line is one record. The first column is the record type.
Wrap any field containing a comma in "double quotes".

SUBJECT,name,color
  color is an optional hex code like #5b8def. Omit it and one is assigned.
  Example: SUBJECT,Physics HL,#5b8def

CLASS,subject,day,start,end,room
  day is Mon/Tue/Wed/Thu/Fri/Sat/Sun. Times are 24-hour HH:MM.
  One line per weekly occurrence — if Physics meets three times, write three lines.
  Example: CLASS,Physics HL,Mon,08:30,09:45,Lab 2

EXAM,subject,title,date,kind,notes
  date is YYYY-MM-DD. kind is one of: exam, test, ia, deadline.
  Example: EXAM,Physics HL,Paper 2 mock,2026-10-14,exam,
  Example: EXAM,History HL,IA final draft,2026-09-30,ia,2200 words

TODO,subject,title,due,link,description
  due is YYYY-MM-DD or blank. link and description are optional.
  Example: TODO,Maths AA,Finish exercise 7C,2026-09-02,,questions 1-14

Rules:
- Subjects named in CLASS/EXAM/TODO lines are created automatically, so SUBJECT lines are optional.
- Use the exact same subject spelling everywhere.
- If a date is relative ("next Friday"), work it out from today's date and write the real date.
- If something is ambiguous, leave the optional field blank rather than guessing.

Here is my information:
<paste your timetable / exam schedule / deadline list here>`;

const Settings = {
  view(){
    const page = el('div');
    page.appendChild(el('h2', { text: 'Setup', style: { marginBottom: '4px' } }));
    page.appendChild(el('p', { style: { color: 'var(--mist)', margin: '0 0 16px', fontSize: '13px' },
      text: 'Everything lives in this browser. Nothing is uploaded anywhere.' }));

    const grid = el('div.set-grid', {}, [
      this.appearanceCard(),
      this.importCard(),
      this.guideCard(),
      this.subjectsCard(),
      this.timetableCard(),
      this.examsCard(),
      this.prefsCard(),
      this.dataCard()
    ]);
    page.appendChild(grid);
    return page;
  },

  /* ---------- appearance ---------- */
  appearanceCard(){
    const st = Store.state.settings;

    const themeRow = el('div.theme-row', {}, THEMES.map(t => {
      const b = el('button.theme-card' + (st.theme === t.id ? '.on' : ''), {
        type: 'button', title: t.name,
        onclick: () => { App.setTheme(t.id); App.render(); }
      }, [
        el('span.theme-strip', {}, t.swatch.map(c => el('i', { style: { background: c } }))),
        el('span.theme-name', { text: t.name })
      ]);
      return b;
    }));

    const accentWrap = el('div', { style: { display: 'none' } });
    const useCustom = el('input', { type: 'checkbox' });
    useCustom.checked = !!st.accent;
    const drawAccent = () => {
      clear(accentWrap);
      accentWrap.style.display = useCustom.checked ? 'block' : 'none';
      if(useCustom.checked){
        accentWrap.appendChild(colorPicker(st.accent || themeById(st.theme).swatch[1], v => {
          st.accent = v; Store.save(); App.applyTheme();
        }));
      }
    };
    useCustom.addEventListener('change', () => {
      if(!useCustom.checked){ st.accent = null; Store.save(); App.applyTheme(); }
      else { st.accent = themeById(st.theme).swatch[1]; Store.save(); App.applyTheme(); }
      drawAccent();
    });
    drawAccent();

    return el('div.card.set-card', {}, [
      el('h3', { text: 'Appearance' }),
      el('p.hint', { text: 'Seven schemes. The button in the top bar cycles through them without coming here.' }),
      themeRow,
      el('div.hr'),
      el('label.mini-item', { style: { cursor: 'pointer' } }, [
        useCustom, el('span', { text: 'Override the accent colour' })
      ]),
      accentWrap
    ]);
  },

  /* ---------- 1 & 2. import ---------- */
  importCard(){
    const ta = el('textarea', { placeholder: 'Paste CSV lines here, or choose a file below…', style: { minHeight: '150px', fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px' } });
    const file = el('input', { type: 'file', accept: '.csv,.txt' });
    file.addEventListener('change', () => {
      const f = file.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = () => { ta.value = r.result; preview(); };
      r.readAsText(f);
    });

    const out = el('div', { style: { marginTop: '10px' } });
    const modeSel = el('select', { style: { width: '210px' } }, [
      el('option', { value: 'merge', text: 'Add to what I already have' }),
      el('option', { value: 'replace', text: 'Replace matching sections' })
    ]);

    let parsed = null;
    const preview = () => {
      parsed = parseImportText(ta.value);
      clear(out);
      const counts = ['subjects','classes','exams','todos']
        .filter(k => parsed[k].length)
        .map(k => parsed[k].length + ' ' + k);
      if(!counts.length && !parsed.errors.length){ out.appendChild(el('div.empty', { text: 'Nothing to import yet.' })); return; }
      out.appendChild(el('div', { style: { fontSize: '12.5px', marginBottom: '6px' },
        text: counts.length ? 'Ready: ' + counts.join(', ') + '.' : 'Nothing usable found.' }));
      if(parsed.errors.length){
        out.appendChild(el('div.codebox', { style: { color: 'var(--ember)', maxHeight: '120px' },
          text: parsed.errors.slice(0,12).join('\n') + (parsed.errors.length > 12 ? '\n…and ' + (parsed.errors.length-12) + ' more' : '') }));
      }
    };
    ta.addEventListener('input', preview);

    return el('div.card.set-card', {}, [
      el('h3', { text: 'Import timetable, subjects and deadlines' }),
      el('p.hint', { text: 'One CSV covers all of it. Copy the format guide next door into Claude, paste what comes back here.' }),
      ta,
      el('div.row', { style: { marginTop: '9px', alignItems: 'center' } }, [file, modeSel]),
      out,
      el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } }, [
        el('button.btn', { text: 'Check', onclick: preview }),
        el('button.btn.primary', { text: 'Import', onclick: () => {
          if(!parsed) preview();
          if(!parsed) return;
          const n = applyImport(parsed, modeSel.value);
          if(!n){ toast('Nothing was imported — check the format.', true); return; }
          toast(n + ' records imported.');
          App.render();
        }})
      ])
    ]);
  },

  /* ---------- 4. format guide ---------- */
  guideCard(){
    return el('div.card.set-card', {}, [
      el('h3', { text: 'Format guide' }),
      el('p.hint', { text: 'Give this whole block to Claude along with your raw timetable or exam schedule. What it returns pastes straight into the import box.' }),
      el('div.codebox', { text: FORMAT_GUIDE }),
      el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } }, [
        el('button.btn.primary', { text: 'Copy guide', onclick: () => {
          navigator.clipboard.writeText(FORMAT_GUIDE)
            .then(() => toast('Copied. Paste it into Claude with your timetable.'))
            .catch(() => toast('Copy failed — select the text manually.', true));
        }}),
        el('button.btn', { text: 'Load a sample', onclick: () => {
          const sample =
`SUBJECT,Physics HL,#5b8def
SUBJECT,Maths AA HL,#e0685f
SUBJECT,English LangLit SL,#3fb984
CLASS,Physics HL,Mon,08:30,09:45,Lab 2
CLASS,Physics HL,Wed,10:15,11:30,Lab 2
CLASS,Maths AA HL,Tue,08:30,09:45,B14
CLASS,Maths AA HL,Thu,13:00,14:15,B14
CLASS,English LangLit SL,Fri,09:00,10:15,A3
EXAM,Physics HL,Paper 2 mock,2026-10-14,exam,
EXAM,Physics HL,IA final draft,2026-09-30,ia,"2200 words, full error analysis"
EXAM,Maths AA HL,Calculus test,2026-09-08,test,
TODO,Physics HL,Finish uncertainty write-up,2026-09-01,,Section 4 only
TODO,Maths AA HL,Exercise 7C q1-14,,,`;
          const parsed = parseImportText(sample);
          applyImport(parsed, 'merge');
          toast('Sample data loaded — have a poke around.');
          App.render();
        }})
      ])
    ]);
  },

  /* ---------- subjects + colours (advanced) ---------- */
  subjectsCard(){
    const list = el('div');
    const draw = () => {
      clear(list);
      if(!Store.state.subjects.length) list.appendChild(el('div.empty', { text: 'No subjects yet.' }));
      Store.state.subjects.forEach((s, i) => {
        const name = textInput(s.name);
        name.addEventListener('change', () => { s.name = name.value.trim() || s.name; Store.save(); });
        const swatch = el('button.btn.sm', { title: 'Colour ways',
          style: { background: s.color, borderColor: s.color, width: '34px', flex: 'none' }, text: ' ' });
        const ways = el('div', { style: { display: 'none', padding: '8px 0 12px' } }, [
          colorPicker(s.color, v => {
            s.color = v; swatch.style.background = v; swatch.style.borderColor = v;
            Store.save();
          })
        ]);
        swatch.addEventListener('click', () => {
          ways.style.display = ways.style.display === 'none' ? 'block' : 'none';
        });
        list.appendChild(el('div.subj-row', {}, [
          swatch, name,
          el('button.btn.sm', { text: '↑', title: 'Move up', onclick: () => {
            if(i === 0) return;
            const arr = Store.state.subjects;
            [arr[i-1], arr[i]] = [arr[i], arr[i-1]]; Store.save(); draw();
          }}),
          el('button.btn.sm.danger', { text: '✕', title: 'Delete subject', onclick: () => {
            confirmDialog('Delete ' + s.name + '?',
              'Its classes are removed too. Tasks and logged time stay but lose their subject.', 'Delete', () => {
              Store.state.subjects = Store.state.subjects.filter(x => x.id !== s.id);
              Store.state.timetable = Store.state.timetable.filter(t => t.subjectId !== s.id);
              Store.state.todos.forEach(t => { if(t.subjectId === s.id) t.subjectId = null; });
              Store.save(); draw(); toast('Subject deleted.');
            });
          }})
        ]));
        list.appendChild(ways);
      });
    };
    draw();
    return el('div.card.set-card', {}, [
      el('h3', { text: 'Subjects and colours' }),
      el('p.hint', { text: 'Tap a swatch to open the colour ways — pick one, or type your own hex code. The colour follows the subject everywhere: blocks, chips, charts.' }),
      list,
      el('button.btn', { text: '+ Add subject', style: { marginTop: '8px' }, onclick: () => {
        Store.ensureSubject('New subject'); Store.save(); draw();
      }})
    ]);
  },

  /* ---------- timetable ---------- */
  timetableCard(){
    const list = el('div');
    const draw = () => {
      clear(list);
      const rows = Store.state.timetable.slice().sort((a,b) =>
        (a.day === 0 ? 7 : a.day) - (b.day === 0 ? 7 : b.day) || parseHM(a.start) - parseHM(b.start));
      if(!rows.length) list.appendChild(el('div.empty', { text: 'No classes yet — import them or add one below.' }));
      rows.forEach(r => {
        const subj = subjectSelect(r.subjectId, false);
        subj.addEventListener('change', () => { r.subjectId = subj.value; Store.save(); });
        const day = el('select', {}, [1,2,3,4,5,6,0].map(d => el('option', { value: d, text: DOW[d] })));
        day.value = r.day;
        day.addEventListener('change', () => { r.day = Number(day.value); Store.save(); draw(); });
        const st = el('input', { type: 'time', value: r.start });
        st.addEventListener('change', () => { r.start = st.value; Store.save(); });
        const en = el('input', { type: 'time', value: r.end });
        en.addEventListener('change', () => { r.end = en.value; Store.save(); });
        const room = textInput(r.room, 'Room');
        room.addEventListener('change', () => { r.room = room.value; Store.save(); });
        list.appendChild(el('div.tt-row', {}, [subj, day, st, en, room,
          el('button.btn.sm.danger', { text: '✕', onclick: () => {
            Store.state.timetable = Store.state.timetable.filter(x => x.id !== r.id); Store.save(); draw();
          }})]));
      });
    };
    draw();
    return el('div.card.set-card', {}, [
      el('h3', { text: 'Weekly timetable' }),
      el('p.hint', { text: 'This is what "next class" and "the class after that" are calculated from.' }),
      list,
      el('button.btn', { text: '+ Add class', style: { marginTop: '8px' }, onclick: () => {
        if(!Store.state.subjects.length){ toast('Add a subject first.', true); return; }
        Store.state.timetable.push({ id: uid('cls'), subjectId: Store.state.subjects[0].id, day: 1, start: '08:30', end: '09:45', room: '' });
        Store.save(); draw();
      }})
    ]);
  },

  /* ---------- exams ---------- */
  examEditor(exam){
    const isNew = !exam;
    const e = exam || { id: uid('exm'), subjectId: '', title: '', date: dateKey(), kind: 'exam', notes: '' };
    const subj = subjectSelect(e.subjectId);
    const title = textInput(e.title, 'e.g. Paper 1 mock');
    const date = el('input', { type: 'date', value: e.date });
    const kind = el('select', {}, ['exam','test','ia','deadline'].map(k => el('option', { value: k, text: k.toUpperCase() })));
    kind.value = e.kind || 'exam';
    const notes = textInput(e.notes, 'Optional');
    const actions = [{ label: 'Cancel', onClick: c => c() }];
    if(!isNew) actions.unshift({ label: 'Delete', cls: 'danger', onClick: c => {
      Store.state.exams = Store.state.exams.filter(x => x.id !== e.id); Store.save(); c(); App.render();
    }});
    actions.push({ label: isNew ? 'Add' : 'Save', cls: 'primary', onClick: c => {
      if(!title.value.trim()){ toast('It needs a title.', true); return; }
      Object.assign(e, { subjectId: subj.value || null, title: title.value.trim(), date: date.value, kind: kind.value, notes: notes.value });
      if(isNew) Store.state.exams.push(e);
      Store.save(); c(); App.render();
    }});
    modal({ title: isNew ? 'New deadline' : 'Edit deadline', body: el('div', {}, [
      field('Subject', subj), field('Title', title),
      el('div.row', {}, [field('Date', date), field('Kind', kind)]),
      field('Notes', notes)
    ]), actions });
  },

  examsCard(){
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
    const all = Store.state.exams.slice().sort((a,b) => a.date < b.date ? -1 : 1);
    if(!all.length) list.appendChild(el('div.empty', { text: 'No exams or deadlines yet.' }));
    all.forEach(e => {
      const d = fromKey(e.date);
      const dd = daysBetween(new Date(), d);
      list.appendChild(el('div.mini-item.click', { onclick: () => Settings.examEditor(e) }, [
        el('i.dot', { style: { background: e.subjectId ? Store.subjectColor(e.subjectId) : 'var(--ember)' } }),
        el('span', { text: e.title }),
        el('span.spacer'),
        el('span.mono', { text: (dd < 0 ? 'past' : 'D-' + dd) + ' · ' + shortDate(d) })
      ]));
    });
    return el('div.card.set-card', {}, [
      el('h3', { text: 'Exams, tests and IA deadlines' }),
      el('p.hint', { text: 'These drive the countdown strip on the dashboard.' }),
      list,
      el('button.btn', { text: '+ Add deadline', style: { marginTop: '8px' }, onclick: () => Settings.examEditor(null) })
    ]);
  },

  /* ---------- preferences ---------- */
  prefsCard(){
    const s = Store.state.settings;
    const goal = el('input', { type: 'number', min: '1', max: '80', value: s.weeklyGoalHours });
    goal.addEventListener('change', () => { s.weeklyGoalHours = Math.max(1, Number(goal.value) || 40); Store.save(); toast('Target updated.'); });
    const def = el('input', { type: 'number', min: '1', max: '10', value: s.defaultHours });
    def.addEventListener('change', () => { s.defaultHours = Math.max(1, Math.min(10, Number(def.value) || 4)); Store.save(); });
    const c24 = el('select', {}, [el('option', { value: '0', text: '4:30pm' }), el('option', { value: '1', text: '16:30' })]);
    c24.value = s.clock24 ? '1' : '0';
    c24.addEventListener('change', () => { s.clock24 = c24.value === '1'; Store.save(); App.render(); });
    const pip = el('input', { type: 'checkbox' });
    pip.checked = s.autoPiP !== false;
    pip.addEventListener('change', () => { s.autoPiP = pip.checked; Store.save(); });
    return el('div.card.set-card', {}, [
      el('h3', { text: 'Preferences' }),
      el('p.hint', { text: 'The weekly target is what the analytics page measures you against.' }),
      field('Weekly study target, hours outside school', goal),
      field('Default hours on a new session grid', def),
      field('Clock format', c24),
      el('label.mini-item', { style: { cursor: 'pointer' } }, [
        pip, el('span', { text: 'Pop out the timer when a session starts' })
      ])
    ]);
  },

  /* ---------- 3. remove data ---------- */
  dataCard(){
    const parts = [
      ['todos', 'To-dos'],
      ['exams', 'Exams and deadlines'],
      ['timetable', 'Timetable'],
      ['subjects', 'Subjects'],
      ['sessions', 'Study sessions'],
      ['plans', 'Personal plans'],
      ['log', 'Logged study time']
    ];
    const boxes = {};
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      parts.map(([k, label]) => {
        const cb = el('input', { type: 'checkbox', style: { width: '14px', flex: 'none' } });
        boxes[k] = cb;
        const count = k === 'log' ? Object.keys(Store.state.log).length + ' days' : (Store.state[k] || []).length + ' items';
        return el('label.mini-item', { style: { cursor: 'pointer' } }, [cb, el('span', { text: label }),
          el('span.spacer'), el('span.mono', { text: count })]);
      }));

    return el('div.card.set-card', {}, [
      el('h3', { text: 'Your data' }),
      el('p.hint', { text: 'Back it up before you clear anything — this browser is the only copy.' }),
      list,
      el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } }, [
        el('button.btn.danger', { text: 'Delete selected', onclick: () => {
          const sel = Object.keys(boxes).filter(k => boxes[k].checked);
          if(!sel.length){ toast('Tick what you want gone first.', true); return; }
          confirmDialog('Delete selected data?', 'This removes: ' + sel.join(', ') + '. It cannot be undone.', 'Delete', () => {
            Store.wipe(sel); toast('Deleted.'); App.render();
          });
        }}),
        el('button.btn.danger', { text: 'Delete everything', onclick: () => {
          confirmDialog('Start completely fresh?', 'Every subject, task, session and logged hour is erased.', 'Erase all', () => {
            localStorage.removeItem(KEY); Store.state = blankState(); Store.save(); toast('All clear.'); App.render();
          });
        }}),
        el('div.spacer'),
        el('button.btn', { text: 'Export backup', onclick: () => {
          const blob = new Blob([JSON.stringify(Store.state, null, 2)], { type: 'application/json' });
          const a = el('a', { href: URL.createObjectURL(blob), download: 'calendar-backup-' + dateKey() + '.json' });
          document.body.appendChild(a); a.click(); a.remove();
        }}),
        (() => {
          const inp = el('input', { type: 'file', accept: '.json', style: { display: 'none' } });
          inp.addEventListener('change', () => {
            const f = inp.files[0]; if(!f) return;
            const r = new FileReader();
            r.onload = () => {
              try{
                const data = JSON.parse(r.result);
                if(!data || typeof data !== 'object') throw 0;
                confirmDialog('Restore this backup?', 'It replaces everything currently stored.', 'Restore', () => {
                  Store.state = Object.assign(blankState(), data);
                  Store.save(); toast('Backup restored.'); App.render();
                });
              }catch(e){ toast('That file is not a Calendar backup.', true); }
            };
            r.readAsText(f);
          });
          const btn = el('button.btn', { text: 'Restore backup', onclick: () => inp.click() });
          return el('span', {}, [btn, inp]);
        })()
      ])
    ]);
  }
};
