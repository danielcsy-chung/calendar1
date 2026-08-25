/* ============================================================
   store.js — state, persistence, time maths, CSV import
   Everything lives in localStorage. No server, no account.
   ============================================================ */

const KEY = 'calendar.v1';

const PALETTE = ['#5b8def','#e0685f','#3fb984','#e0a63f','#a06fe0',
                 '#3fb4c9','#d9679f','#8a9a5b','#e08a3f','#6f7fe0'];

/* UI colour schemes. Each id matches a html[data-theme="…"] block in styles.css */
const THEMES = [
  { id:'notebook', name:'Notebook', dark:true,  note:'warm graphite, cream ink',  swatch:['#1a1816','#d9a441','#7fb287'] },
  { id:'carbon',   name:'Carbon',   dark:true,  note:'lowest glare, soft whites', swatch:['#121315','#8fb4d9','#7dbd97'] },
  { id:'night',    name:'Night',    dark:true,  note:'warm charcoal',             swatch:['#15141a','#ffb454','#5fd39b'] },
  { id:'ocean',    name:'Ocean',    dark:true,  note:'deep teal',                 swatch:['#0c1a20','#49cfc2','#8ad98e'] },
  { id:'forest',   name:'Forest',   dark:true,  note:'dark green',                swatch:['#0f1510','#c9e666','#63d79d'] },
  { id:'mono',     name:'Mono',     dark:true,  note:'black and white',           swatch:['#0b0b0c','#e9e9ec','#8ee0aa'] },
  { id:'paper',    name:'Paper',    dark:false, note:'the only light one',        swatch:['#f6f2ea','#c2701c','#2c8b5c'] }
];
function themeById(id){ return THEMES.find(t => t.id === id) || THEMES[0]; }

/* the swatch grid offered in Setup */
const PALETTE_EXT = [
  '#3fb984','#5b8def','#e0c53f','#e08a3f','#a88fd8','#9b3b3b',
  '#2f8f66','#3a6bc4','#c9a92c','#c4692a','#8a6fc0','#6e2828',
  '#3fb4c9','#d9679f','#8a9a5b','#e0685f','#6f7fe0','#8b97a8'
];

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DOW_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function uid(p){ return (p||'id') + '_' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3); }

/* ---------- date helpers ---------- */
function dateKey(d){
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fromKey(k){ const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){ const x = new Date(d); const dow = (x.getDay()+6)%7; x.setHours(0,0,0,0); x.setDate(x.getDate()-dow); return x; } // Monday
function daysBetween(a, b){
  const x = new Date(a); x.setHours(0,0,0,0);
  const y = new Date(b); y.setHours(0,0,0,0);
  return Math.round((y-x)/86400000);
}
function parseHM(s){
  if(!s) return 0;
  s = String(s).trim().toLowerCase();
  let ampm = null;
  if(/(am|pm)$/.test(s)){ ampm = s.slice(-2); s = s.slice(0,-2).trim(); }
  const parts = s.split(/[:.]/);
  let h = parseInt(parts[0]||'0',10) || 0;
  const m = parseInt(parts[1]||'0',10) || 0;
  if(ampm === 'pm' && h < 12) h += 12;
  if(ampm === 'am' && h === 12) h = 0;
  return h*60 + m;
}
function fmtHM(mins, force24){
  mins = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(mins/60), m = mins%60;
  if(force24 || Store.state.settings.clock24) return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  const ap = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + ':' + String(m).padStart(2,'0') + ap;
}
function fmtDur(mins){
  mins = Math.round(mins);
  const h = Math.floor(mins/60), m = mins%60;
  if(h && m) return h + 'h ' + String(m).padStart(2,'0') + 'm';
  if(h) return h + 'h';
  return m + 'm';
}
function fmtClock(secs){
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs/3600), m = Math.floor(secs%3600/60), s = secs%60;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function prettyDate(d, withYear){
  return DOW_LONG[d.getDay()] + ', ' + d.getDate() + ' ' +
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] +
    (withYear ? ' ' + d.getFullYear() : '');
}
function shortDate(d){
  return d.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
}

/* ---------- default state ---------- */
function blankState(){
  return {
    subjects: [],
    timetable: [],           // {id, subjectId, day(0-6), start:'08:30', end:'09:45', room}
    todos: [],               // {id, subjectId, title, link, desc, due(ISO date|null), done, createdAt, doneAt}
    exams: [],               // {id, subjectId, title, date:'YYYY-MM-DD', kind:'exam|test|ia|deadline', notes}
    sessions: [],            // see newSession()
    plans: [],               // {id,title,date,start,end,notes,color} — calendar-only reminders
    log: {},                 // log[dateKey][hour][subjectId] = seconds studied
    rev: 0,                  // bumped on every local change; decides who wins a sync
    settings: {
      weeklyGoalHours: 40,
      defaultHours: 4,
      showClock: true,
      clock24: false,
      theme: 'notebook',
      accent: null,          // overrides the theme's accent when set
      autoPiP: true,
      syncCode: null,
      autoSync: true,
      lastPush: null,
      lastPull: null,
      firstRunDone: false
    }
  };
}

function newSession(date, title){
  return {
    id: uid('ses'),
    date: date || dateKey(),
    title: title || 'Study session',
    startClock: 16*60,       // planned wall-clock start, minutes from midnight
    hours: Store.state ? Store.state.settings.defaultHours : 4,
    blocks: [],              // {id,type:'task'|'break',subjectId,title,detail,links,offset(min),dur(min),subtasks:[],todoId,breakKind}
    tracked: {},             // blockId -> seconds actually spent
    startedAt: null,
    endedAt: null
  };
}

/* ---------- store ---------- */
const Store = {
  state: blankState(),

  load(){
    try{
      const raw = localStorage.getItem(KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        this.state = Object.assign(blankState(), parsed);
        this.state.settings = Object.assign(blankState().settings, parsed.settings || {});
      }
    }catch(e){ console.warn('Could not read saved data', e); }
    return this.state;
  },

  /* pass bump === false to save without claiming a newer revision
     (used when writing a copy pulled down from the cloud) */
  save(bump){
    if(bump !== false) this.state.rev = Date.now();
    try{ localStorage.setItem(KEY, JSON.stringify(this.state)); }
    catch(e){ toast('Storage is full — export a backup and clear old sessions.', true); }
  },

  /* subjects */
  subject(id){ return this.state.subjects.find(s => s.id === id) || null; },
  subjectColor(id){ const s = this.subject(id); return s ? s.color : '#8b97a8'; },
  subjectName(id){ const s = this.subject(id); return s ? s.name : 'No subject'; },
  ensureSubject(name){
    if(!name) return null;
    const hit = this.state.subjects.find(s => s.name.toLowerCase() === String(name).trim().toLowerCase());
    if(hit) return hit;
    const s = { id: uid('sub'), name: String(name).trim(), color: PALETTE[this.state.subjects.length % PALETTE.length] };
    this.state.subjects.push(s);
    return s;
  },

  /* timetable → next class times */
  nextClasses(subjectId, count, from){
    from = from || new Date();
    count = count || 2;
    const src = this.state.timetable.filter(e => !subjectId || e.subjectId === subjectId);
    const out = [];
    for(let i = 0; i < 21 && out.length < count; i++){
      const day = addDays(from, i);
      const todays = src.filter(e => e.day === day.getDay())
                        .sort((a,b) => parseHM(a.start) - parseHM(b.start));
      for(const e of todays){
        const dt = new Date(day);
        const m = parseHM(e.start);
        dt.setHours(Math.floor(m/60), m%60, 0, 0);
        if(dt > from){ out.push({ entry: e, date: dt }); if(out.length >= count) break; }
      }
    }
    return out;
  },

  classesOn(d){
    return this.state.timetable.filter(e => e.day === d.getDay())
      .sort((a,b) => parseHM(a.start) - parseHM(b.start));
  },

  /* study log */
  logSeconds(subjectId, secs, when){
    when = when || new Date();
    const dk = dateKey(when), hr = String(when.getHours());
    const L = this.state.log;
    L[dk] = L[dk] || {};
    L[dk][hr] = L[dk][hr] || {};
    const k = subjectId || 'none';
    L[dk][hr][k] = (L[dk][hr][k] || 0) + secs;
  },
  secondsOn(dk){
    const day = this.state.log[dk]; if(!day) return 0;
    let t = 0;
    for(const hr in day) for(const s in day[hr]) t += day[hr][s] || 0;
    return t;
  },

  /* to-dos */
  openTodos(){ return this.state.todos.filter(t => !t.done); },
  todosBySubject(){
    const map = new Map();
    this.state.subjects.forEach(s => map.set(s.id, []));
    map.set('none', []);
    this.state.todos.forEach(t => {
      const k = t.subjectId && map.has(t.subjectId) ? t.subjectId : 'none';
      map.get(k).push(t);
    });
    for(const [,list] of map){
      list.sort((a,b) => (a.done - b.done) || ((a.due||'9999') > (b.due||'9999') ? 1 : -1));
    }
    return map;
  },

  upcomingExams(limit){
    const today = dateKey();
    return this.state.exams
      .filter(e => e.date >= today)
      .sort((a,b) => a.date < b.date ? -1 : 1)
      .slice(0, limit || 99);
  },

  sessionOn(dk){ return this.state.sessions.filter(s => s.date === dk); },
  plansOn(dk){
    return (this.state.plans || []).filter(p => p.date === dk)
      .sort((a,b) => parseHM(a.start || '00:00') - parseHM(b.start || '00:00'));
  },

  wipe(parts){
    const b = blankState();
    parts.forEach(p => {
      if(p === 'settings') this.state.settings = b.settings;
      else this.state[p] = b[p];
    });
    this.save();
  }
};

/* ---------- session maths ---------- */
const SLOT = 5; // minutes per grid slot

function sessionPlannedTask(ses){
  return ses.blocks.filter(b => b.type === 'task').reduce((t,b) => t + b.dur, 0);
}
function sessionPlannedBreak(ses){
  return ses.blocks.filter(b => b.type === 'break').reduce((t,b) => t + b.dur, 0);
}
function sessionStudiedSecs(ses){
  let t = 0;
  ses.blocks.filter(b => b.type === 'task').forEach(b => { t += ses.tracked[b.id] || 0; });
  return t;
}
function sessionNowOffset(ses){
  if(!ses.startedAt) return null;
  return (Date.now() - ses.startedAt) / 60000;
}
function blockAt(ses, offMin){
  return ses.blocks.find(b => offMin >= b.offset && offMin < b.offset + b.dur) || null;
}
function sessionClockStart(ses){
  if(ses.startedAt){ const d = new Date(ses.startedAt); return d.getHours()*60 + d.getMinutes(); }
  return ses.startClock;
}

/* ---------- CSV / text import ---------- */
function splitCSVLine(line){
  const out = []; let cur = '', q = false;
  for(let i = 0; i < line.length; i++){
    const c = line[i];
    if(q){
      if(c === '"' && line[i+1] === '"'){ cur += '"'; i++; }
      else if(c === '"') q = false;
      else cur += c;
    } else {
      if(c === '"') q = true;
      else if(c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseDay(v){
  if(v === '' || v == null) return null;
  const s = String(v).trim().toLowerCase();
  if(/^\d$/.test(s)) return Number(s) % 7;
  const i = DOW.findIndex(d => d.toLowerCase() === s.slice(0,3));
  return i >= 0 ? i : null;
}

function parseDate(v){
  if(!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);            // DD/MM/YYYY
  if(m) return m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  const d = new Date(s);
  return isNaN(d) ? null : dateKey(d);
}

/*  Parses the unified format. Every line is one record:
      SUBJECT,name,color
      CLASS,subject,day,start,end,room
      EXAM,subject,title,date,kind,notes
      TODO,subject,title,due,link,description
    Returns {subjects, classes, exams, todos, errors}  */
function parseImportText(text){
  const res = { subjects: [], classes: [], exams: [], todos: [], errors: [] };
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, n) => {
    const line = raw.trim();
    if(!line || line.startsWith('#') || line.startsWith('//')) return;
    const c = splitCSVLine(line);
    const type = (c[0] || '').toUpperCase();
    if(type === 'TYPE') return;                               // header row
    const err = m => res.errors.push('Line ' + (n+1) + ': ' + m);
    if(type === 'SUBJECT'){
      if(!c[1]) return err('subject needs a name');
      res.subjects.push({ name: c[1], color: /^#?[0-9a-f]{6}$/i.test(c[2]||'') ? (c[2][0]==='#'?c[2]:'#'+c[2]) : null });
    } else if(type === 'CLASS'){
      const day = parseDay(c[2]);
      if(!c[1]) return err('class needs a subject');
      if(day === null) return err('"' + c[2] + '" is not a weekday');
      if(!c[3] || !c[4]) return err('class needs a start and end time');
      res.classes.push({ subject: c[1], day, start: fmtHM(parseHM(c[3]), true), end: fmtHM(parseHM(c[4]), true), room: c[5] || '' });
    } else if(type === 'EXAM'){
      const date = parseDate(c[3]);
      if(!date) return err('"' + (c[3]||'') + '" is not a date');
      res.exams.push({ subject: c[1] || '', title: c[2] || 'Untitled', date,
        kind: (c[4] || 'exam').toLowerCase(), notes: c[5] || '' });
    } else if(type === 'TODO'){
      res.todos.push({ subject: c[1] || '', title: c[2] || 'Untitled',
        due: parseDate(c[3]), link: c[4] || '', desc: c[5] || '' });
    } else {
      err('unknown row type "' + (c[0]||'') + '"');
    }
  });
  return res;
}

function applyImport(parsed, mode){
  if(mode === 'replace'){
    if(parsed.subjects.length || parsed.classes.length) Store.state.timetable = [];
    if(parsed.exams.length) Store.state.exams = [];
    if(parsed.todos.length) Store.state.todos = [];
  }
  let n = 0;
  parsed.subjects.forEach(s => {
    const sub = Store.ensureSubject(s.name);
    if(s.color) sub.color = s.color;
    n++;
  });
  parsed.classes.forEach(c => {
    const sub = Store.ensureSubject(c.subject);
    Store.state.timetable.push({ id: uid('cls'), subjectId: sub.id, day: c.day, start: c.start, end: c.end, room: c.room });
    n++;
  });
  parsed.exams.forEach(e => {
    const sub = e.subject ? Store.ensureSubject(e.subject) : null;
    Store.state.exams.push({ id: uid('exm'), subjectId: sub ? sub.id : null, title: e.title, date: e.date, kind: e.kind, notes: e.notes });
    n++;
  });
  parsed.todos.forEach(t => {
    const sub = t.subject ? Store.ensureSubject(t.subject) : null;
    Store.state.todos.push({ id: uid('td'), subjectId: sub ? sub.id : null, title: t.title, link: t.link,
      desc: t.desc, due: t.due, done: false, createdAt: Date.now() });
    n++;
  });
  Store.save();
  return n;
}
