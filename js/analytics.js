/* ============================================================
   analytics.js — where the hours actually went
   ============================================================ */

const Analytics = {

  agg(){
    const log = Store.state.log;
    const byHour = new Array(24).fill(0);
    const byDow = new Array(7).fill(0);
    const bySubject = {};
    const byDay = {};
    for(const dk in log){
      const d = fromKey(dk);
      let dayTotal = 0;
      for(const hr in log[dk]){
        for(const sid in log[dk][hr]){
          const v = log[dk][hr][sid] || 0;
          byHour[Number(hr)] += v;
          bySubject[sid] = (bySubject[sid] || 0) + v;
          dayTotal += v;
        }
      }
      byDow[d.getDay()] += dayTotal;
      byDay[dk] = dayTotal;
    }
    return { byHour, byDow, bySubject, byDay };
  },

  weeks(n){
    const out = [];
    const thisMon = startOfWeek(new Date());
    for(let i = n - 1; i >= 0; i--){
      const mon = addDays(thisMon, -7 * i);
      let t = 0;
      for(let d = 0; d < 7; d++) t += Store.secondsOn(dateKey(addDays(mon, d)));
      out.push({ mon, secs: t });
    }
    return out;
  },

  bars(data, labels, opts){
    opts = opts || {};
    const max = Math.max(1, ...data);
    const wrap = el('div.bars');
    data.forEach((v, i) => {
      const h = Math.round((v / max) * 100);
      wrap.appendChild(el('div.bar-col', { title: labels[i] + ' — ' + fmtDur(v/60) }, [
        el('div.bar' + (v === 0 ? '.dim' : ''), { style: { height: Math.max(2, h) + '%',
          background: opts.color && v ? opts.color : undefined } }),
        el('div.bar-l', { text: opts.everyOther && i % 2 ? '' : labels[i] })
      ]));
    });
    return wrap;
  },

  view(){
    const a = this.agg();
    const page = el('div');
    const goal = Store.state.settings.weeklyGoalHours;
    const wk = this.weeks(8);
    const thisWeek = wk[wk.length-1].secs / 3600;
    const lastWeek = wk[wk.length-2] ? wk[wk.length-2].secs / 3600 : 0;

    /* goal + trend header */
    const pct = Math.min(100, Math.round(thisWeek / goal * 100));
    const daysLeft = 7 - ((new Date().getDay() + 6) % 7) - 1;
    const remain = Math.max(0, goal - thisWeek);
    const delta = lastWeek > 0 ? Math.round((thisWeek - lastWeek) / lastWeek * 100) : (thisWeek > 0 ? 100 : 0);

    /* least-squares slope over the last 6 weeks, hours per week */
    const recent = wk.slice(-6).map(w => w.secs/3600);
    const n = recent.length;
    const mx = (n-1)/2, my = recent.reduce((s,v) => s+v, 0)/n;
    let num = 0, den = 0;
    recent.forEach((v,i) => { num += (i-mx)*(v-my); den += (i-mx)*(i-mx); });
    const slope = den ? num/den : 0;

    const goalCard = el('div.card.an-card', {}, [
      el('div.an-head', {}, [
        el('div.an-title', { text: 'This week against your ' + goal + 'h target' }),
        el('span.trend' + (delta > 0 ? '.up' : delta < 0 ? '.down' : ''), {
          text: (delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '– ') + delta + '% vs last week'
        })
      ]),
      el('div.kpi', {}, [
        this.kpi(thisWeek.toFixed(1) + 'h', 'logged this week'),
        this.kpi(remain.toFixed(1) + 'h', 'left to hit target'),
        this.kpi(daysLeft > 0 ? (remain / daysLeft).toFixed(1) + 'h' : '—', 'per day for ' + daysLeft + ' days left'),
        this.kpi((slope >= 0 ? '+' : '') + slope.toFixed(1) + 'h', 'week-on-week trend')
      ]),
      el('div', { style: { marginTop: '12px' } }, [
        el('div.meter', {}, [el('i', { style: { width: pct + '%',
          background: pct >= 100 ? 'var(--green)' : 'var(--amber)' } })]),
        el('div', { style: { fontSize: '11px', color: 'var(--mist)', marginTop: '5px' },
          text: pct + '% of target' })
      ])
    ]);
    page.appendChild(goalCard);
    page.appendChild(el('div', { style: { height: '16px' } }));

    /* charts */
    const cards = el('div.an-grid');

    cards.appendChild(el('div.card.an-card', {}, [
      el('div.an-head', {}, [el('div.an-title', { text: 'Weekly total' }),
        el('span.eyebrow', { text: 'last 8 weeks' })]),
      this.bars(wk.map(w => w.secs), wk.map(w => shortDate(w.mon).split(' ')[0] + '/' + (w.mon.getMonth()+1)), { everyOther: true }),
      el('div', { style: { fontSize: '11px', color: 'var(--mist)', marginTop: '8px' },
        text: 'Target line sits at ' + goal + 'h — bars are capped to the tallest week, not the target.' })
    ]));

    cards.appendChild(el('div.card.an-card', {}, [
      el('div.an-head', {}, [el('div.an-title', { text: 'By hour of day' }),
        el('span.eyebrow', { text: 'all time' })]),
      this.bars(a.byHour, a.byHour.map((_,i) => i), { everyOther: true })
    ]));

    cards.appendChild(el('div.card.an-card', {}, [
      el('div.an-head', {}, [el('div.an-title', { text: 'By day of week' })]),
      this.bars([1,2,3,4,5,6,0].map(i => a.byDow[i]), ['M','T','W','T','F','S','S'])
    ]));

    /* last 14 days */
    const days = [];
    for(let i = 13; i >= 0; i--){ const d = addDays(new Date(), -i); days.push({ d, secs: Store.secondsOn(dateKey(d)) }); }
    cards.appendChild(el('div.card.an-card', {}, [
      el('div.an-head', {}, [el('div.an-title', { text: 'Last 14 days' })]),
      this.bars(days.map(x => x.secs), days.map(x => String(x.d.getDate())), { everyOther: true })
    ]));

    /* subject split */
    const subjEntries = Object.entries(a.bySubject).sort((x,y) => y[1]-x[1]);
    const subjTotal = subjEntries.reduce((s,[,v]) => s+v, 0) || 1;
    cards.appendChild(el('div.card.an-card', {}, [
      el('div.an-head', {}, [el('div.an-title', { text: 'Where the time goes' })]),
      subjEntries.length ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: '9px' } },
        subjEntries.slice(0,8).map(([sid, v]) => el('div', {}, [
          el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' } }, [
            el('span', { text: sid === 'none' ? 'Unassigned' : Store.subjectName(sid) }),
            el('span.mono', { text: fmtDur(v/60) + '  ' + Math.round(v/subjTotal*100) + '%' })
          ]),
          el('div.meter', {}, [el('i', { style: { width: (v/subjTotal*100) + '%',
            background: sid === 'none' ? 'var(--mist-dim)' : Store.subjectColor(sid) } })])
        ]))
      ) : el('div.empty', { text: 'No time logged yet.' })
    ]));

    /* insights */
    cards.appendChild(el('div.card.an-card', {}, [
      el('div.an-head', {}, [el('div.an-title', { text: 'Worth knowing' })]),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' } },
        this.insights(a, wk).map(t => el('div.mini-item', {}, [el('span', { text: t })])))
    ]));

    page.appendChild(cards);
    return page;
  },

  kpi(v, k){ return el('div.kpi-item', {}, [el('div.kpi-v', { text: v }), el('div.kpi-k', { text: k })]); },

  insights(a, wk){
    const out = [];
    const peak = a.byHour.indexOf(Math.max(...a.byHour));
    const totalSecs = a.byHour.reduce((s,v) => s+v, 0);
    if(totalSecs < 60) return ['Nothing logged yet — run a session and this fills up.'];

    out.push('Your strongest hour is ' + fmtHM(peak*60) + '–' + fmtHM((peak+1)*60) + ', with ' + fmtDur(a.byHour[peak]/60) + ' banked there.');

    const bestDow = a.byDow.indexOf(Math.max(...a.byDow));
    const worstDow = a.byDow.indexOf(Math.min(...a.byDow));
    out.push(DOW_LONG[bestDow] + ' is your heaviest day; ' + DOW_LONG[worstDow] + ' is the lightest.');

    /* streak */
    let streak = 0;
    for(let i = 0; i < 120; i++){
      const s = Store.secondsOn(dateKey(addDays(new Date(), -i)));
      if(s >= 1800) streak++;
      else if(i > 0) break;
      else if(s > 0) { streak++; }
      else break;
    }
    out.push(streak ? 'Current run: ' + streak + ' day' + (streak > 1 ? 's' : '') + ' in a row with at least half an hour.'
                    : 'No streak going right now — half an hour today restarts it.');

    /* evening vs morning */
    const morning = a.byHour.slice(5,12).reduce((s,v)=>s+v,0);
    const evening = a.byHour.slice(18,24).reduce((s,v)=>s+v,0);
    if(morning + evening > 0){
      out.push(evening > morning * 1.4 ? 'You are a night worker — ' + Math.round(evening/(morning+evening)*100) + '% of tracked time is after 6pm.'
        : morning > evening * 1.4 ? 'You do most of your work before noon. Protect those mornings.'
        : 'Your time is spread fairly evenly across morning and evening.');
    }

    /* consistency */
    const last7 = [];
    for(let i = 0; i < 7; i++) last7.push(Store.secondsOn(dateKey(addDays(new Date(), -i))));
    const avg7 = last7.reduce((s,v)=>s+v,0)/7;
    const sd = Math.sqrt(last7.reduce((s,v)=>s+(v-avg7)*(v-avg7),0)/7);
    if(avg7 > 0) out.push(sd > avg7
      ? 'Your days are lumpy — big sessions then nothing. Steadier days would beat the marathons.'
      : 'You are working at a fairly even pace day to day, which is the hard part.');

    /* to-dos */
    const done = Store.state.todos.filter(t => t.done).length;
    const all = Store.state.todos.length;
    if(all) out.push('You have cleared ' + done + ' of ' + all + ' tasks (' + Math.round(done/all*100) + '%).');
    const over = Store.openTodos().filter(t => t.due && t.due < dateKey()).length;
    if(over) out.push(over + ' task' + (over > 1 ? 's have' : ' has') + ' slipped past its due date.');

    /* sessions */
    const started = Store.state.sessions.filter(s => s.startedAt);
    if(started.length){
      const planned = started.reduce((s,x) => s + sessionPlannedTask(x), 0);
      const actual = started.reduce((s,x) => s + sessionStudiedSecs(x)/60, 0);
      if(planned) out.push('Across ' + started.length + ' sessions you completed ' + Math.round(actual/planned*100) + '% of the time you blocked out.');
    }

    /* pace vs goal */
    const g = Store.state.settings.weeklyGoalHours;
    const avgWk = wk.slice(-4).reduce((s,w) => s + w.secs/3600, 0) / 4;
    out.push('Four-week average: ' + avgWk.toFixed(1) + 'h a week, ' +
      (avgWk >= g ? 'above' : (g - avgWk).toFixed(1) + 'h short of') + ' your ' + g + 'h target.');

    return out;
  }
};
