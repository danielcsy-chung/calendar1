/* ============================================================
   dashboard.js — the landing page
   ============================================================ */

const Dashboard = {
  view(){
    const today = new Date();

    /* ---------- countdown strip ---------- */
    const exams = Store.upcomingExams(24);
    const rail = el('div.dday-rail');
    if(!exams.length){
      rail.appendChild(el('div.empty', { text: 'No exams or deadlines imported yet. Setup → Import.' }));
    } else {
      exams.forEach(e => {
        const d = fromKey(e.date);
        const dd = daysBetween(today, d);
        const color = e.subjectId ? Store.subjectColor(e.subjectId) : 'var(--amber)';
        rail.appendChild(el('div.ticket', { style: { '--tc': color } }, [
          el('div', {}, [
            el('div.ticket-d.mono' + (dd <= 3 ? '.soon' : dd <= 10 ? '.near' : ''), { text: dd === 0 ? 'TODAY' : 'D-' + dd }),
            el('div.ticket-title', { text: e.title })
          ]),
          el('div.ticket-meta', {}, [
            el('i.dot', { style: { background: color } }),
            el('span', { text: (e.subjectId ? Store.subjectName(e.subjectId) + ' · ' : '') + shortDate(d) }),
            el('span.spacer'),
            el('span', { text: (e.kind || 'exam').toUpperCase() })
          ])
        ]));
      });
    }

    const todaySecs = Store.secondsOn(dateKey(today));
    const weekSecs = this.weekSeconds();
    const goal = Store.state.settings.weeklyGoalHours;

    const strip = el('div.dday-strip', {}, [
      el('div.dday-head', {}, [
        el('div.dday-today', { text: prettyDate(today) }),
        el('div.dday-sub.mono', { text: fmtDur(todaySecs/60) + ' today  ·  ' + fmtDur(weekSecs/60) + ' / ' + goal + 'h this week' }),
        el('div.spacer'),
        el('div.eyebrow', { text: exams.length + ' upcoming' })
      ]),
      rail
    ]);

    /* ---------- today / tomorrow ---------- */
    const two = el('div.two-up', {}, [this.dayCard(today, 'Today'), this.dayCard(addDays(today,1), 'Tomorrow')]);

    /* ---------- sidebar ---------- */
    const side = el('div.side', {}, [
      el('div.card', {}, [
        el('div.side-head', {}, [
          el('h3', { text: 'To-dos' }),
          el('button.btn.sm.primary', { text: '+ Task', onclick: () => Todos.editor(null) })
        ]),
        el('div.side-list', {}, [Todos.grouped({})])
      ])
    ]);

    return el('div.dash', {}, [
      el('div.dash-main', {}, [strip, two]),
      side
    ]);
  },

  weekSeconds(){
    const s = startOfWeek(new Date());
    let t = 0;
    for(let i = 0; i < 7; i++) t += Store.secondsOn(dateKey(addDays(s, i)));
    return t;
  },

  dayCard(d, label){
    const dk = dateKey(d);
    const classes = Store.classesOn(d);
    const sessions = Store.sessionOn(dk);
    const exams = Store.state.exams.filter(e => e.date === dk);
    const due = Store.state.todos.filter(t => !t.done && t.due === dk);

    const body = el('div.daycard-body');
    let any = false;

    if(exams.length){
      any = true;
      exams.forEach(e => body.appendChild(el('div.mini-item', { style: { borderColor: 'var(--ember)' } }, [
        el('i.dot', { style: { background: 'var(--ember)' } }),
        el('span', { text: e.title }),
        el('span.spacer'),
        el('span.mono', { text: (e.kind || 'exam').toUpperCase() })
      ])));
    }

    if(classes.length){
      any = true;
      classes.forEach(c => body.appendChild(el('div.mini-item', {}, [
        el('i.dot', { style: { background: Store.subjectColor(c.subjectId) } }),
        el('span.mono', { text: fmtHM(parseHM(c.start)) }),
        el('span', { text: Store.subjectName(c.subjectId) }),
        el('span.spacer'),
        c.room ? el('span.mono', { text: c.room }) : null
      ])));
    }

    if(sessions.length){
      any = true;
      sessions.forEach(s => body.appendChild(el('div.mini-item.click', {
        onclick: () => { Session.activeId = s.id; App.go('session'); }
      }, [
        el('i.dot', { style: { background: 'var(--amber)' } }),
        el('span.mono', { text: fmtHM(sessionClockStart(s)) }),
        el('span', { text: s.title }),
        el('span.spacer'),
        el('span.mono', { text: s.endedAt ? 'done' : (s.startedAt ? 'live' : fmtDur(sessionPlannedTask(s))) })
      ])));
    }

    if(due.length){
      any = true;
      body.appendChild(el('div.eyebrow', { text: 'Due', style: { marginTop: '4px' } }));
      due.slice(0,5).forEach(t => body.appendChild(el('div.mini-item.click', { onclick: () => Todos.editor(t) }, [
        el('i.dot', { style: { background: Store.subjectColor(t.subjectId) } }),
        el('span', { text: t.title })
      ])));
    }

    if(!any) body.appendChild(el('div.empty', { text: label === 'Today' ? 'Nothing scheduled. Free run.' : 'Nothing here yet.' }));

    const studied = Store.secondsOn(dk);

    return el('div.card.daycard', {}, [
      el('div.daycard-head', {}, [
        el('div', {}, [
          el('div.eyebrow', { text: label }),
          el('div.daycard-date', { text: DOW_LONG[d.getDay()] + ' ' + shortDate(d) })
        ]),
        studied ? el('span.pill.mono', { text: fmtDur(studied/60) + ' studied' }) : null
      ]),
      body,
      el('div.daycard-foot', {}, [
        label === 'Today'
          ? el('button.btn.go', { onclick: () => Session.startToday() }, [el('i.tri'), el('span', { text: 'Start study' })])
          : null,
        el('button.btn', { text: sessions.length ? 'Plan another session' : 'Plan a session for ' + label.toLowerCase(),
          onclick: () => Session.newDialog(dk) })
      ])
    ]);
  }
};
