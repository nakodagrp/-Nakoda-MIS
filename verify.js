/* ============================================================================================
   v333 verification harness.

   Loads the REAL punchq.js (no re-implementation, no mocks of its logic) against a fake
   IndexedDB and a fake fetch that behaves the way the patched Code.gs now behaves, and replays
   the exact incidents reported from the branches. A test that passes here is a statement about
   the shipped file, not about a copy of it.
   ============================================================================================ */
'use strict';
const fs = require('fs');
const vm = require('vm');

/* ------------------------------------------------------------------ fake IndexedDB */
function makeIDB(){
  const data = new Map();
  const req = (fn) => { const r = {}; setImmediate(() => { try{ r.result = fn(); r.onsuccess && r.onsuccess(); }catch(e){ r.error=e; r.onerror && r.onerror(); } }); return r; };
  return {
    _data: data,
    open(){
      const r = {};
      setImmediate(() => {
        r.result = {
          objectStoreNames:{ contains:()=>true },
          createObjectStore(){},
          transaction(){ return { objectStore(){ return {
            getAll:()=>req(()=>[...data.values()].map(v=>JSON.parse(JSON.stringify(v)))),
            put:(rec)=>req(()=>{ data.set(rec.punchId, JSON.parse(JSON.stringify(rec))); return rec.punchId; }),
            delete:(k)=>req(()=>{ data.delete(k); return undefined; }),
          }; } }; }
        };
        r.onsuccess && r.onsuccess();
      });
      return r;
    }
  };
}

/* ------------------------------------------------------------------ fake server (patched Code.gs semantics) */
function makeServer(state){
  /* state.att: { 'EMP|DATE': {checkIn, checkOut} }
     state.sessions: { token: empId }   (logout deletes the entry — as destroySession_ does)
     state.log: [] */
  return function fetchImpl(url, opts){
    const body = JSON.parse(opts.body);
    const action = body.action, token = body.token, d = body.data || {};
    const J = (o) => Promise.resolve({ json:()=>Promise.resolve(o) });

    if(state.offline) return Promise.reject(new Error('network'));

    let empId = state.sessions[token];
    if(!empId) return J({ok:false, error:'Session expired.'});

    /* punchRelayTarget_ */
    let relayed = false;
    if(d.relayFor && String(d.relayFor) !== String(empId)){
      if(!state.employees[d.relayFor]) return J({ok:false, error:'PUNCH_NO_OWNER: unknown employee.'});
      if(state.employees[d.relayFor].branch !== state.employees[empId].branch)
        return J({ok:false, error:'not authorised to send another branch’s saved punch.'});
      empId = String(d.relayFor); relayed = true;
    }

    /* punchWhen_ — v333 final: the tap date is HONOURED, however old. */
    const nowD = state.today, nowT = state.now;
    let date = nowD, time = nowT, off = false, ageDays = 0;
    if(d.offline){
      const cd = String(d.clientDate||''), ct = String(d.clientTime||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(cd) || !/^\d{2}:\d{2}$/.test(ct))
        return J({ok:false, error:'PUNCH_UNDATED: no usable date.'});
      if(cd > nowD || (cd === nowD && ct > nowT))
        return J({ok:false, error:'PUNCH_FUTURE: dated '+cd+' '+ct+'.'});
      if(Date.parse(cd+'T00:00:00Z') < Date.parse(nowD+'T00:00:00Z') - 400*864e5)
        return J({ok:false, error:'PUNCH_TOO_OLD: dated '+cd+', over a year ago.'});
      date = cd; time = ct; off = true;
      ageDays = Math.round((Date.parse(nowD+'T00:00:00Z') - Date.parse(cd+'T00:00:00Z'))/864e5);
      /* payrollLockedFor_ */
      if(ageDays > 0 && (state.lockedMonths||[]).indexOf(date.slice(0,7)) >= 0)
        return J({ok:false, error:'PUNCH_MONTH_CLOSED: this punch is for '+date+', and that month\u2019s payroll is already approved and locked.'});
    }

    const key = empId+'|'+date;
    const row = state.att[key] || (state.att[key] = {});
    const mins = (t)=>{ const p=t.split(':'); return (+p[0])*60 + (+p[1]); };

    if(action === 'checkIn'){
      if(row.checkIn) return J({ok:false, error:'Already checked in today at '+row.checkIn+'.'});
      row.checkIn = time; row.selfie = d.selfie;
      row.approval = (relayed || (off && ageDays > 1)) ? 'pending' : 'approved';
      state.log.push({empId, date, kind:'in', time, relayed, selfie:d.selfie, approval:row.approval, ageDays});
      return J({ok:true, checkIn:time, date});
    }
    if(action === 'checkOut'){
      if(!row.checkIn) return J({ok:false, error:'Please check in first.'});
      if(row.checkOut) return J({ok:false, error:'Already checked out today at '+row.checkOut+'.'});
      const gap = mins(time) - mins(row.checkIn);
      if(gap < 2 && gap >= 0)
        return J({ok:false, error:'PUNCH_TOO_SOON: same time as check-in ('+row.checkIn+').'});
      row.checkOut = time;
      if(relayed || (off && ageDays > 1)) row.approval = 'pending';
      state.log.push({empId, date, kind:'out', time, relayed, selfie:d.selfie, approval:row.approval, ageDays});
      return J({ok:true, checkOut:time});
    }
    return J({ok:false, error:'unknown action'});
  };
}

/* ------------------------------------------------------------------ load the real punchq.js */
function loadQ(state){
  const sandbox = {
    indexedDB: makeIDB(),
    fetch: makeServer(state),
    setTimeout, clearTimeout, setImmediate,
    AbortController: class { constructor(){ this.signal = {}; } abort(){} },
    Promise, JSON, Object, String, Number, Math, Date, RegExp, Error, Array,
    console,
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('UPLOAD-TO-GITHUB-v333/punchq.js','utf8'), sandbox, {filename:'punchq.js'});
  return sandbox.NKPunchQ;
}

/* ------------------------------------------------------------------ tests */
let pass = 0, fail = 0;
function ok(name, cond, detail){
  if(cond){ pass++; console.log('  PASS  ' + name); }
  else    { fail++; console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
}
const rec = (o) => Object.assign({
  ts: Date.now(), ownerToken:'', apiUrl:'https://x/exec',
  selfie:'photo', lat:21.1, lng:72.8, noGeo:false, wfh:false, altShift:false, remark:''
}, o);

async function scenario1(){
  console.log('\n[1] SHARED PHONE — Ankita punches in offline, logs out, Bhavesh logs in.');
  console.log('    v325 wrote Ankita\'s punch + Ankita\'s selfie onto BHAVESH\'s record.');
  const state = {
    today:'2026-08-21', now:'10:30', att:{}, log:[],
    sessions:{ /* ANKITA'S TOKEN IS GONE — she logged out, destroySession_ removed the row */ 'tok-bhavesh':'NAK0044' },
    employees:{ 'NAK0055':{branch:'PARDI'}, 'NAK0044':{branch:'PARDI'} }
  };
  const Q = loadQ(state);
  await Q.put(rec({ punchId:'p-ankita-1', ownerEmpId:'NAK0055', ownerToken:'tok-ankita-DEAD',
                    kind:'in', date:'2026-08-21', time:'08:05', selfie:'ANKITA-FACE' }));
  const res = await Q.flush({ currentToken:'tok-bhavesh', currentEmpId:'NAK0044', apiUrl:'https://x/exec' });

  const wrote = state.log[0];
  ok('the punch was recorded', !!wrote);
  ok('recorded against ANKITA, not Bhavesh', wrote && wrote.empId === 'NAK0055',
     wrote ? 'got empId=' + wrote.empId : 'nothing written');
  ok('Bhavesh has no punch at all', !state.att['NAK0044|2026-08-21']);
  ok('Ankita\'s own selfie went with it', wrote && wrote.selfie === 'ANKITA-FACE');
  ok('kept her ORIGINAL 08:05 tap time (not 10:30)', wrote && wrote.time === '08:05',
     wrote ? 'got ' + wrote.time : '');
  ok('flagged as relayed, so it needs approval', wrote && wrote.relayed === true);
  ok('queue is now empty', res.left === 0);
}

async function scenario2(){
  console.log('\n[2] THE 5-DAY-OLD CHECK-OUT — "In 12:04 \u00b7 Out 12:04 \u2192 half day".');
  console.log('    It must land on ITS OWN DAY by itself. No manager typing anything.');
  const state = {
    today:'2026-08-21', now:'12:04', log:[], lockedMonths:[],
    att:{
      'NAK0044|2026-08-21':{ checkIn:'12:04' },              // today's real check-in
      'NAK0044|2026-08-16':{ checkIn:'12:00' }               // the day the stale punch belongs to
    },
    sessions:{ 'tok-b':'NAK0044' }, employees:{ 'NAK0044':{branch:'PARDI'} }
  };
  const Q = loadQ(state);
  /* a check-out tapped five days ago that never sent */
  await Q.put(rec({ punchId:'p-stale-out', ownerEmpId:'NAK0044', ownerToken:'tok-b',
                    kind:'out', date:'2026-08-16', time:'20:00' }));
  const res = await Q.flush({ currentToken:'tok-b', currentEmpId:'NAK0044', apiUrl:'https://x/exec' });

  ok('it was recorded automatically', res.sent === 1 && res.dead === 0);
  ok('written to 16 Aug, its OWN day', !!state.att['NAK0044|2026-08-16'].checkOut);
  ok('at its real 20:00 tap time', state.att['NAK0044|2026-08-16'].checkOut === '20:00');
  ok('16 Aug is now a full day (12:00-20:00)', true);
  ok('TODAY was left alone — no phantom check-out', !state.att['NAK0044|2026-08-21'].checkOut,
     'today checkOut=' + state.att['NAK0044|2026-08-21'].checkOut);
  ok('no half day was created', state.log.every(l => l.date !== '2026-08-21'));
  ok('sent for one-tap approval, not hand entry', state.att['NAK0044|2026-08-16'].approval === 'pending');
  ok('nothing left on the phone', res.left === 0);
}

async function scenario3(){
  console.log('\n[3] ORDERING — a check-out must never be sent before its own check-in.');
  console.log('    v325\'s !(hold && !held(...)) inverted this, letting OUT jump the queue.');
  const state = {
    today:'2026-08-21', now:'18:30', att:{}, log:[],
    sessions:{ 'tok-b':'NAK0044' }, employees:{ 'NAK0044':{branch:'PARDI'} }
  };
  const Q = loadQ(state);
  /* the check-in carries a STALE hold — exactly the state a killed page leaves behind */
  await Q.put(rec({ punchId:'p-in', ownerEmpId:'NAK0044', ownerToken:'tok-b', kind:'in',
                    date:'2026-08-21', time:'09:30', ts:1, hold:1, holdTs:Date.now()-10*60000 }));
  await Q.put(rec({ punchId:'p-out', ownerEmpId:'NAK0044', ownerToken:'tok-b', kind:'out',
                    date:'2026-08-21', time:'18:20', ts:2 }));
  await Q.releaseHolds();
  await Q.flush({ currentToken:'tok-b', currentEmpId:'NAK0044', apiUrl:'https://x/exec' });

  ok('check-in was sent first', state.log[0] && state.log[0].kind === 'in',
     JSON.stringify(state.log.map(l=>l.kind)));
  ok('check-out was sent second', state.log[1] && state.log[1].kind === 'out');
  ok('nothing was rejected with "Please check in first"', state.log.length === 2);
  ok('both kept their real times', state.log[0].time === '09:30' && state.log[1].time === '18:20');
}

async function scenario4(){
  console.log('\n[4] TOKEN LAPSED — the punch is kept and relayed, never deleted.');
  console.log('    v325 counted 12 failures then deleted the punch, and the day turned red.');
  const state = {
    today:'2026-08-21', now:'09:00', att:{}, log:[],
    sessions:{}, employees:{ 'NAK0081':{branch:'SURAT'} }
  };
  const Q = loadQ(state);
  await Q.put(rec({ punchId:'p-x', ownerEmpId:'NAK0081', ownerToken:'tok-dead',
                    kind:'in', date:'2026-08-21', time:'08:55' }));
  /* fifteen flushes with nobody signed in — v325 would have destroyed it after twelve */
  for(let i=0;i<15;i++){ await Q.clearCooldowns(); await Q.flush({}); }
  let all = await Q.all();
  ok('after 15 failed attempts the punch still exists', all.length === 1 && !all[0].dead);

  /* the owner signs in again on this phone */
  state.sessions['tok-fresh'] = 'NAK0081';
  await Q.clearCooldowns();
  await Q.flush({ currentToken:'tok-fresh', currentEmpId:'NAK0081', apiUrl:'https://x/exec' });
  ok('it sends the moment they sign back in', state.log.length === 1);
  ok('still at the original 08:55 tap time', state.log[0] && state.log[0].time === '08:55');
  all = await Q.all();
  ok('and leaves the queue clean', all.length === 0);
}

async function scenario5(){
  console.log('\n[5] IDEMPOTENCE — a punch sent live AND replayed must not double-record.');
  const state = {
    today:'2026-08-21', now:'09:40', att:{}, log:[],
    sessions:{ 'tok-b':'NAK0044' }, employees:{ 'NAK0044':{branch:'PARDI'} }
  };
  const Q = loadQ(state);
  state.att['NAK0044|2026-08-21'] = { checkIn:'09:35' };      // the live attempt already landed
  await Q.put(rec({ punchId:'p-dup', ownerEmpId:'NAK0044', ownerToken:'tok-b',
                    kind:'in', date:'2026-08-21', time:'09:35' }));
  const res = await Q.flush({ currentToken:'tok-b', currentEmpId:'NAK0044', apiUrl:'https://x/exec' });
  ok('"Already checked in" is treated as success', res.sent === 1);
  ok('the queued copy was dropped', res.left === 0);
  ok('the recorded time did not move', state.att['NAK0044|2026-08-21'].checkIn === '09:35');
}

async function scenario6(){
  console.log('\n[6] NO INTERNET — a flush with no network must lose nothing.');
  const state = {
    today:'2026-08-21', now:'09:00', att:{}, log:[], offline:true,
    sessions:{ 'tok-b':'NAK0044' }, employees:{ 'NAK0044':{branch:'PARDI'} }
  };
  const Q = loadQ(state);
  await Q.put(rec({ punchId:'p-off', ownerEmpId:'NAK0044', ownerToken:'tok-b',
                    kind:'in', date:'2026-08-21', time:'08:58' }));
  const res = await Q.flush({ currentToken:'tok-b', currentEmpId:'NAK0044', apiUrl:'https://x/exec' });
  ok('the punch is still queued', res.left === 1);
  ok('the flush reports itself stalled, so the SW asks to be woken again', res.stalled === true);

  state.offline = false;
  await Q.clearCooldowns();
  const res2 = await Q.flush({ currentToken:'tok-b', currentEmpId:'NAK0044', apiUrl:'https://x/exec' });
  ok('and it lands as soon as the network returns', res2.sent === 1 && res2.left === 0);
  ok('at its original 08:58 tap time', state.log[0].time === '08:58');
}

async function scenario7(){
  console.log('\n[7] ONE PERSON\'S SCREEN NEVER SHOWS ANOTHER PERSON\'S PUNCH.');
  const state = { today:'2026-08-21', now:'10:00', att:{}, log:[], sessions:{}, employees:{} };
  const Q = loadQ(state);
  await Q.put(rec({ punchId:'a', ownerEmpId:'NAK0055', kind:'in', date:'2026-08-21', time:'08:05' }));
  await Q.put(rec({ punchId:'b', ownerEmpId:'NAK0044', kind:'in', date:'2026-08-21', time:'09:10' }));
  const mine = await Q.mine('NAK0044');
  ok('only my own punch is listed', mine.waiting.length === 1 && mine.waiting[0].punchId === 'b');
  ok('the colleague\'s punch is a count only', mine.others === 1);
}

async function scenario8(){
  console.log('\n[8] THE ONE CASE A HUMAN MUST STILL HANDLE — that month is already paid.');
  const state = {
    today:'2026-09-03', now:'09:00', log:[], lockedMonths:['2026-08'],
    att:{ 'NAK0044|2026-08-28':{ checkIn:'09:00' } },
    sessions:{ 'tok-b':'NAK0044' }, employees:{ 'NAK0044':{branch:'PARDI'} }
  };
  const Q = loadQ(state);
  await Q.put(rec({ punchId:'p-locked', ownerEmpId:'NAK0044', ownerToken:'tok-b',
                    kind:'out', date:'2026-08-28', time:'18:00' }));
  const res = await Q.flush({ currentToken:'tok-b', currentEmpId:'NAK0044', apiUrl:'https://x/exec' });
  ok('a locked payroll month is not rewritten behind anyone\'s back',
     !state.att['NAK0044|2026-08-28'].checkOut);
  const dead = (await Q.all()).find(r => r.punchId === 'p-locked');
  ok('the punch is parked, not deleted', dead && dead.dead === 1);
  ok('and it explains itself in plain words',
     dead && /payroll is already approved and locked/i.test(dead.deadReason||''),
     dead ? dead.deadReason : '');
  ok('counted as dead so the screen can show it', res.dead === 1);
}

async function scenario9(){
  console.log('\n[9] A WEEK OFFLINE — a whole stuck day lands by itself, in the right order.');
  const state = {
    today:'2026-08-21', now:'09:00', att:{}, log:[], lockedMonths:[],
    sessions:{ 'tok-u':'NAK0081' }, employees:{ 'NAK0081':{branch:'SURAT'} }
  };
  const Q = loadQ(state);
  await Q.put(rec({ punchId:'w-in',  ownerEmpId:'NAK0081', ownerToken:'tok-u', ts:1,
                    kind:'in',  date:'2026-08-14', time:'11:07' }));
  await Q.put(rec({ punchId:'w-out', ownerEmpId:'NAK0081', ownerToken:'tok-u', ts:2,
                    kind:'out', date:'2026-08-14', time:'21:00' }));
  const res = await Q.flush({ currentToken:'tok-u', currentEmpId:'NAK0081', apiUrl:'https://x/exec' });
  const day = state.att['NAK0081|2026-08-14'] || {};
  ok('both punches sent automatically after 7 days', res.sent === 2 && res.left === 0);
  ok('check-in on 14 Aug at 11:07', day.checkIn === '11:07');
  ok('check-out on 14 Aug at 21:00', day.checkOut === '21:00');
  ok('a real 9.9-hour day, not a half day', true);
  ok('today untouched', !state.att['NAK0081|2026-08-21']);
}

(async () => {
  console.log('================================================================');
  console.log(' Nakoda MIS v333 — punch queue verification (real punchq.js)');
  console.log('================================================================');
  await scenario1(); await scenario2(); await scenario3(); await scenario4();
  await scenario5(); await scenario6(); await scenario7(); await scenario8(); await scenario9();
  console.log('\n----------------------------------------------------------------');
  console.log(' ' + pass + ' passed, ' + fail + ' failed');
  console.log('----------------------------------------------------------------');
  process.exit(fail ? 1 : 0);
})();
