/* ============================================================
   sync.js — talks to /api/sync so the same data opens on a phone.

   The code you set IS the login. Anyone holding it holds the data,
   so make it long and don't paste it anywhere public.
   Whichever device saved most recently wins; there is no merge.
   ============================================================ */

const Sync = {
  endpoint: '/api/sync',
  busy: false,
  _timer: null,
  onStatus: null,          // Setup registers a redraw here

  code(){ return Store.state.settings.syncCode || ''; },
  configured(){ return this.code().length >= 8; },

  async call(action, payload){
    const r = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: this.code(), action, payload })
    });
    let data = null;
    try{ data = await r.json(); }catch(e){ /* html error page */ }
    if(!r.ok) throw new Error((data && data.error) || 'Sync failed (' + r.status + ').');
    return data;
  },

  /* what actually travels — settings included, so a phone picks up
     your theme and timetable, but the sync code itself never does */
  snapshot(){
    const s = JSON.parse(JSON.stringify(Store.state));
    if(s.settings){ delete s.settings.syncCode; delete s.settings.lastPush; delete s.settings.lastPull; }
    return s;
  },

  apply(remoteState, rev){
    const keep = {
      syncCode: Store.state.settings.syncCode,
      autoSync: Store.state.settings.autoSync
    };
    Store.state = Object.assign(blankState(), remoteState);
    Store.state.settings = Object.assign(blankState().settings, remoteState.settings || {}, keep);
    Store.state.rev = rev || Date.now();
    Store.state.settings.lastPull = new Date().toISOString();
    Store.save(false);
    App.applyTheme();
  },

  async push(quiet){
    if(!this.configured()){ if(!quiet) toast('Set a sync code first.', true); return false; }
    if(this.busy) return false;
    this.busy = true; this.status();
    try{
      const res = await this.call('push', { rev: Store.state.rev || Date.now(), state: this.snapshot() });
      Store.state.settings.lastPush = res.savedAt;
      Store.save(false);
      if(!quiet) toast('Sent to ibcal-blob.');
      return true;
    }catch(e){
      if(!quiet) toast(e.message, true);
      return false;
    }finally{ this.busy = false; this.status(); }
  },

  async pull(quiet){
    if(!this.configured()){ if(!quiet) toast('Set a sync code first.', true); return false; }
    if(this.busy) return false;
    this.busy = true; this.status();
    try{
      const res = await this.call('pull');
      if(!res.state) throw new Error('That backup is empty.');
      this.apply(res.state, res.rev);
      if(!quiet) toast('Loaded from ibcal-blob.');
      App.render();
      return true;
    }catch(e){
      if(!quiet) toast(e.message, true);
      return false;
    }finally{ this.busy = false; this.status(); }
  },

  /* on boot: newer copy wins, quietly */
  async reconcile(){
    if(!this.configured() || Store.state.settings.autoSync === false) return;
    try{
      const res = await this.call('pull');
      const localRev = Store.state.rev || 0;
      if(res.state && (res.rev || 0) > localRev + 1000){
        this.apply(res.state, res.rev);
        App.render();
        toast('Updated from your other device.');
      } else if(localRev > (res.rev || 0) + 1000){
        this.push(true);
      }
    }catch(e){
      /* 404 just means this code has never been pushed — send what we have */
      if(/No backup/i.test(e.message)) this.push(true);
    }
    this.status();
  },

  /* debounced background push after any local change */
  schedule(){
    if(!this.configured() || Store.state.settings.autoSync === false) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(true), 5000);
  },

  async forget(){
    try{ await this.call('forget'); toast('Cloud copy deleted.'); }
    catch(e){ toast(e.message, true); }
    this.status();
  },

  status(){ if(this.onStatus) this.onStatus(); },

  makeCode(){
    const words = ['ib','study','plan','grid','focus','term','paper'];
    const chunk = () => Math.random().toString(36).slice(2, 6);
    return words[Math.floor(Math.random() * words.length)] + '-' + chunk() + '-' + chunk() + '-' + chunk();
  },

  boot(){
    /* every Store.save() queues a background push */
    const original = Store.save.bind(Store);
    Store.save = function(bump){
      original(bump);
      if(bump !== false) Sync.schedule();
    };
    /* last chance to flush before the tab closes */
    window.addEventListener('pagehide', () => {
      if(!Sync.configured() || Store.state.settings.autoSync === false) return;
      const body = JSON.stringify({ code: Sync.code(), action: 'push',
        payload: { rev: Store.state.rev, state: Sync.snapshot() } });
      try{ navigator.sendBeacon(Sync.endpoint, new Blob([body], { type: 'application/json' })); }catch(e){}
    });
    setTimeout(() => this.reconcile(), 600);
  }
};
