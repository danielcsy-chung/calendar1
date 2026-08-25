/* ============================================================
   app.js — routing, the one-second heartbeat, boot
   ============================================================ */

const VIEWS = {
  dashboard: () => Dashboard.view(),
  session:   () => Session.view(),
  todos:     () => Todos.view(),
  calendar:  () => CalendarView.view(),
  analytics: () => Analytics.view(),
  settings:  () => Settings.view()
};

const App = {
  current: 'dashboard',

  go(view){
    if(!VIEWS[view]) view = 'dashboard';
    this.current = view;
    location.hash = view;
    this.render();
  },

  render(){
    const host = document.getElementById('app');
    const scrollY = window.scrollY;
    clear(host);
    try{
      host.appendChild(VIEWS[this.current]());
    }catch(err){
      console.error(err);
      host.appendChild(el('div.card', { style: { padding: '20px' } }, [
        el('h3', { text: 'That view could not be drawn' }),
        el('p', { style: { color: 'var(--mist)' }, text: String(err && err.message || err) })
      ]));
    }
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('is-active', b.dataset.view === this.current));
    window.scrollTo(0, Math.min(scrollY, document.body.scrollHeight));
  },

  tick(){
    const now = new Date();
    const clockEl = document.getElementById('brandClock');
    if(clockEl) clockEl.textContent = fmtHM(now.getHours()*60 + now.getMinutes());
    Session.tick();
  },

  applyTheme(){
    const t = themeById(Store.state.settings.theme);
    const root = document.documentElement;
    root.dataset.theme = t.id;
    if(t.dark) root.removeAttribute('data-light'); else root.setAttribute('data-light', '1');
    const accent = Store.state.settings.accent;
    if(accent) root.style.setProperty('--amber', accent);
    else root.style.removeProperty('--amber');
  },

  setTheme(id){
    Store.state.settings.theme = id;
    Store.save();
    this.applyTheme();
  },

  cycleTheme(){
    const i = THEMES.findIndex(t => t.id === Store.state.settings.theme);
    const next = THEMES[(i + 1) % THEMES.length];
    this.setTheme(next.id);
    toast(next.name);
  },

  welcome(){
    modal({
      title: 'Welcome to Calendar',
      body: el('div', { style: { color: 'var(--mist)', fontSize: '13.5px', lineHeight: '1.6' } }, [
        el('p', { style: { marginTop: 0 }, text: 'Three things get you running:' }),
        el('p', { html: '<b style="color:var(--chalk)">1.</b> Import your timetable, subjects and deadlines from one CSV. Setup has a format guide you can hand to Claude — paste your raw schedule in, paste the result back.' }),
        el('p', { html: '<b style="color:var(--chalk)">2.</b> Add tasks. Due dates can be "next class" or "the class after that" — worked out from your timetable.' }),
        el('p', { html: '<b style="color:var(--chalk)">3.</b> Plan a session on the 5-minute grid, press start, and the red line tracks you through it.' }),
        el('p', { style: { marginBottom: 0 }, text: 'Everything is stored in this browser only. Export a backup from Setup now and then.' })
      ]),
      actions: [
        { label: 'Load sample data', onClick: c => { c(); App.go('settings'); setTimeout(() => toast('Hit "Load a sample" under the format guide.'), 300); } },
        { label: 'Go to setup', cls: 'primary', onClick: c => { c(); App.go('settings'); } }
      ]
    });
    Store.state.settings.firstRunDone = true;
    Store.save();
  },

  boot(){
    Store.load();
    if(!themeById(Store.state.settings.theme) || !THEMES.some(t => t.id === Store.state.settings.theme)){
      Store.state.settings.theme = 'night';       // migrate the old dark/light values
    }
    App.applyTheme();
    document.documentElement.style.setProperty('--slot', (Store.state.settings.slotPx || 13) + 'px');

    document.getElementById('nav').addEventListener('click', e => {
      const b = e.target.closest('.nav-btn');
      if(b) App.go(b.dataset.view);
    });
    document.getElementById('themeToggle').addEventListener('click', () => App.cycleTheme());
    window.addEventListener('hashchange', () => {
      const v = location.hash.slice(1);
      if(VIEWS[v] && v !== App.current){ App.current = v; App.render(); }
    });
    window.addEventListener('beforeunload', () => Store.save());
    document.addEventListener('visibilitychange', () => { if(document.hidden) Store.save(); });

    const start = location.hash.slice(1);
    App.current = VIEWS[start] ? start : 'dashboard';
    App.render();
    App.tick();
    setInterval(() => App.tick(), 1000);

    if(!Store.state.settings.firstRunDone) setTimeout(() => App.welcome(), 400);
  }
};

document.addEventListener('DOMContentLoaded', () => App.boot());
