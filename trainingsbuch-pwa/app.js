(function(){
const L=window.TBLogic;
const {UNITS,SLUG,esc,clone,num,cleanW,pad,todayISO,parseISO,fmtLong,fmtDay,fmtShort,daysAgo,agoText,fmtNum,setStr,METRICS,niceTicks,parseCSV,guessUnit}=L;
const TABS=[['log','Training'],['hist','Verlauf'],['prog','Fortschritt']];
const WESTE_KG=10;

const $=s=>document.querySelector(s);
const LS={get(k,f){try{const v=localStorage.getItem(k);return v?JSON.parse(v):f}catch(e){return f}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}};
/* Schreiben ohne Verschlucken: wirft einen Error mit lesbarer Meldung (Speicher voll oder gesperrt). */
function lsWrite(k,v){
  try{localStorage.setItem(k,JSON.stringify(v))}
  catch(e){const q=!!e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014);
    const err=new Error(q?'Speicher voll.':'Speicher ist gesperrt (privater Modus?).');err.code=q?'quota_exceeded':'storage_unavailable';throw err}
}
const ICON={
  up:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 10l4.5-4.5 4.5 4.5"/></svg>',
  down:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>',
  more:'<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12.5" cy="8" r="1.4"/></svg>',
  x:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4l8 8M12 4l-8 8"/></svg>'
};

const S={
  sessions:new Map(), plans:new Map(), loaded:{s:false,p:false},
  tab:LS.get('tb_tab','log'), histFilter:'Alle', progEx:LS.get('tb_progEx',null), progMetric:null, progSel:null,
  draft:LS.get('tb_draft',null), planEdit:null, exInfo:{}, rest:{}, timerOpen:null, vibOK:null, infoOpen:null, infoEdit:false, exMenu:null, showMeta:false, showNote:false, openSess:null, showTbl:false, confirm:null, imports:[], exportText:null, exportName:null, restore:null, rename:null, storageInfo:null, busy:false
};

/* ---------- storage ---------- */
/* Alles liegt in localStorage dieses Browsers. Schreibfehler (voll, gesperrt) werden gemeldet statt verschluckt. */
function errMsg(e){if(!e)return 'Unbekannter Fehler';return e.message||String(e.code||e)}
function persistLocal(which){
  if(!which||which.includes('sessions'))lsWrite('tb_sessions',Object.fromEntries(S.sessions));
  if(!which||which.includes('plans'))lsWrite('tb_plans',Object.fromEntries(S.plans));
}
/* Mehrere Änderungen auf einmal: ops=[{coll,id,doc}], doc=null löscht. Alles oder nichts: bei einem Fehler wird zurückgerollt. */
function commitOps(ops){
  const maps={sessions:S.sessions,plans:S.plans},prev=[],touched=new Set();
  for(const o of ops){const m=maps[o.coll];prev.push({m,id:o.id,had:m.has(o.id),old:m.get(o.id)});touched.add(o.coll);if(o.doc==null)m.delete(o.id);else m.set(o.id,o.doc)}
  try{persistLocal([...touched])}
  catch(e){
    for(let i=prev.length-1;i>=0;i--){const p=prev[i];if(p.had)p.m.set(p.id,p.old);else p.m.delete(p.id)}
    try{persistLocal([...touched])}catch(x){/* Speicher bleibt kaputt, die Meldung unten reicht */}
    throw e;
  }
}
async function putDoc(coll,id,doc){commitOps([{coll,id,doc}])}
async function delDoc(coll,id){commitOps([{coll,id,doc:null}])}
async function refreshStorageInfo(){
  const info={persisted:null,usage:null};
  try{if(navigator.storage&&navigator.storage.persisted)info.persisted=await navigator.storage.persisted()}catch(e){}
  try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();info.usage=e.usage}}catch(e){}
  S.storageInfo=info;if(S.tab==='data')render();
}
async function initStore(){
  try{localStorage.setItem('tb_probe','1');localStorage.removeItem('tb_probe')}catch(e){toast('Der Browser blockiert den Speicher. Trainings können so nicht gespeichert werden.')}
  let fresh=false;try{fresh=localStorage.getItem('tb_sessions')===null}catch(e){}
  if(fresh){try{const r=await fetch('seed.json',{cache:'no-store'});if(r.ok){const j=await r.json();LS.set('tb_sessions',j.sessions||{});LS.set('tb_plans',j.plans||{});LS.set('tb_exinfo',j.exinfo||{});LS.set('tb_rest',j.rest||{})}}catch(e){}}
  try{if(navigator.storage&&navigator.storage.persist)Promise.resolve(navigator.storage.persist()).then(refreshStorageInfo,()=>{})}catch(e){}
  S.sessions=new Map(Object.entries(LS.get('tb_sessions',{})));
  S.plans=new Map(Object.entries(LS.get('tb_plans',{})));
  S.exInfo=LS.get('tb_exinfo',{});
  S.rest=LS.get('tb_rest',{});
  S.loaded={s:true,p:true};
  render();
  if(!navReady)navInit();
  refreshStorageInfo();
}

async function saveInfo(name,text){
  const n=Object.assign({},S.exInfo);text=String(text||'').trim();
  if(text)n[name]=text;else delete n[name];
  lsWrite('tb_exinfo',n);S.exInfo=n;
}
/* ---------- rest timer ---------- */
const REST_DEFAULT=90;
let T=null,wakeLock=null;
const restFor=name=>{const v=S.rest[name];return typeof v==='number'?v:REST_DEFAULT};
const fmtSec=sec=>sec<=0?'Aus':`${Math.floor(sec/60)}:${pad(sec%60)}`;
function setRest(name,sec){
  sec=Math.max(0,Math.min(600,Math.round(sec)));
  const n=Object.assign({},S.rest,{[name]:sec});
  if(!LS.set('tb_rest',n))toast('Pausenzeit konnte nicht gespeichert werden (Speicher voll oder gesperrt).');
  S.rest=n;
}
async function wake(){try{if(!wakeLock&&navigator.wakeLock)wakeLock=await navigator.wakeLock.request('screen')}catch(e){wakeLock=null}}
function unwake(){try{wakeLock&&wakeLock.release()}catch(e){}wakeLock=null}
/* ---------- Android-App: Pausenende auch bei gesperrtem Handy (nur in der APK aktiv) ---------- */
const LN=()=>{try{return (window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform()&&Capacitor.Plugins&&Capacitor.Plugins.LocalNotifications)||null}catch(e){return null}};
const lnMade=new Set();
const SETG=()=>window.TBSettings?TBSettings.get():{vib:'lang',snd:'still'};
function signalNow(){const st=SETG();const pat=window.TBSettings?TBSettings.vibPattern(st.vib):[1200,150,1200,150,1200,150,1200];if(pat)buzz(pat);if(window.TBSettings&&st.snd!=='still')TBSettings.playSound(st.snd)}
async function lnPerm(ln){let p=await ln.checkPermissions();if(p.display!=='granted')p=await ln.requestPermissions();if(p.display!=='granted'){toast('Benachrichtigungen sind aus. Erlaube sie in den Android-Einstellungen für die App.');return false}return true}
async function lnEnsure(ln){
  if(!await lnPerm(ln))return null;
  const st=SETG(),id='tb-'+st.vib+'-'+(st.snd==='still'?'still':'ton')+'-';
  if(!lnMade.has(id)){
    const vn=((window.TBSettings&&TBSettings.VIBS.find(v=>v.id===st.vib))||{name:st.vib}).name;
    const o={id,name:'Pausentimer: '+vn+(st.snd==='still'?', lautlos':', mit Ton'),description:'Meldet das Ende der Pause',importance:4,visibility:1,vibration:st.vib!=='aus'};
    if(st.snd==='still')o.sound='silent.wav';
    await ln.createChannel(o);lnMade.add(id);
    if(!lnMade.has('_clean')){lnMade.add('_clean');['pause2','pause3'].forEach(x=>{try{ln.deleteChannel({id:x}).catch(()=>{})}catch(e){}})}
  }
  return id;
}
async function lnSchedule(endMs,name,nid){
  const ln=LN();if(!ln)return false;
  try{
    const ch=await lnEnsure(ln);if(!ch)return false;
    const id=nid||1;
    await ln.cancel({notifications:[{id}]});
    const n={id,title:nid?'Test: Pause vorbei':'Pause vorbei',body:name,channelId:ch,schedule:{at:new Date(endMs),allowWhileIdle:true}};
    if(SETG().snd==='still')n.sound='silent.wav';
    await ln.schedule({notifications:[n]});return true;
  }catch(e){return false}
}
function lnCancel(){const ln=LN();if(!ln)return;try{ln.cancel({notifications:[{id:1},{id:2},{id:3}]}).catch(()=>{});ln.removeAllDeliveredNotifications().catch(()=>{})}catch(e){}}
function startRest(ei,si){
  if(!S.draft)return;const e=S.draft.exercises[ei];if(!e)return;
  const dur=restFor(e.name);if(!dur)return;
  T={name:e.name,si,dur,end:Date.now()+dur*1000,done:false,buzzed:0};wake();if(window.TBSettings){TBSettings.audioUnlock();if(TBSettings.get().vib!=='aus')buzz(30)}else buzz(30);lnSchedule(T.end,e.name);paintRest();
}
function lastFilledSet(e){let k=0;(e.sets||[]).forEach((st,j)=>{if(String(st.r||'').trim()||String(st.w||'').trim())k=j});return k}
function buzz(p){try{if(navigator.vibrate)return navigator.vibrate(p)}catch(e){}return false}
function stopRest(){T=null;unwake();lnCancel();paintRest()}
function tickRest(){
  if(!T)return;
  const left=T.end-Date.now();
  if(left<-20000){stopRest();return}
  if(left<=0&&!T.done){T.done=true;T.doneAt=Date.now();signalNow()}
  if(T.done&&Date.now()-T.doneAt>10000){stopRest();return}
  paintRest();
}
function paintRest(){
  const bar=$('#restbar');
  const d=S.draft;
  document.querySelectorAll('.ex').forEach(c=>{
    c.classList.remove('resting','rest-done');
    const e=d&&d.exercises[+c.dataset.ei];const pill=c.querySelector('.tpill');
    if(!e||!pill)return;
    const sb=c.querySelector('.rest-start');if(sb)sb.textContent=(T&&T.name===e.name&&!T.done)?'■ Pause stoppen':'▶ Pause starten';
    if(T&&T.name===e.name&&S.tab==='log'){
      const left=Math.max(0,Math.ceil((T.end-Date.now())/1000));
      c.classList.add(T.done?'rest-done':'resting');c.style.setProperty('--p',T.done?0:left/T.dur);
      pill.textContent=T.done?'Los!':fmtSec(left);pill.classList.add('run');
    }else{pill.textContent=fmtSec(restFor(e.name));pill.classList.remove('run')}
  });
  if(!T||!d){bar.hidden=true;return}
  const left=Math.max(0,Math.ceil((T.end-Date.now())/1000));
  bar.hidden=false;bar.classList.toggle('done',T.done);bar.style.setProperty('--p',T.done?1:1-left/T.dur);
  bar.querySelector('.rb-name').textContent=T.done?'Pause vorbei · '+T.name:'Pause · '+T.name+' · Satz '+(T.si+1);
  bar.querySelector('.rb-time').textContent=T.done?'Los!':fmtSec(left);
}
setInterval(tickRest,250);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){tickRest();if(T&&!T.done)wake()}});

/* ---------- derived data ---------- */
function sessionsDesc(){return [...S.sessions].map(([id,s])=>Object.assign({id},s)).sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:(b.updatedAt||0)-(a.updatedAt||0))}
function plansSorted(){return [...S.plans].map(([id,p])=>Object.assign({id},p)).sort((a,b)=>UNITS.indexOf(a.unit)-UNITS.indexOf(b.unit)||(a.order??99)-(b.order??99)||String(a.name).localeCompare(b.name))}
function lastFor(name,excludeId,beforeDate){return L.lastFor(sessionsDesc(),name,excludeId,beforeDate)}
const weightKinds=name=>L.weightKinds(S.sessions.values(),name);
const catalog=unit=>L.catalog(S.sessions.values(),S.plans.values(),unit);
const unitOf=name=>L.unitOf(S.sessions.values(),S.plans.values(),name);
const sessionList=()=>[...S.sessions.values()];
const localSnapshot=()=>({sessions:S.sessions,plans:S.plans,exinfo:S.exInfo,rest:S.rest});

/* ---------- draft ---------- */
let draftWarnAt=0;
function persistDraft(){if(!LS.set('tb_draft',S.draft)&&Date.now()-draftWarnAt>30000){draftWarnAt=Date.now();toast('Entwurf konnte nicht zwischengespeichert werden (Speicher voll oder gesperrt).')}}
function newEx(name){
  const last=lastFor(name);
  const n=3;
  return {name,weste:!!(last&&last.ex.weste),griffe:!!(last&&last.ex.griffe),sets:Array.from({length:n},()=>({w:'',r:''}))};
}
function startDraft(unit,planId){
  const plan=planId?S.plans.get(planId):null;
  S.draft={id:null,date:todayISO(),unit:plan?plan.unit:unit,note:'',plan:plan?plan.name:'',exercises:(plan?plan.exercises:[]).map(newEx)};
  persistDraft();S.tab='log';S.confirm=null;S.exMenu=null;S.infoOpen=null;S.timerOpen=null;S.showMeta=false;S.showNote=false;render();window.scrollTo(0,0);
}
function editSession(id){
  const s=S.sessions.get(id);if(!s)return;
  const d=clone(s);
  S.draft={id,date:d.date,unit:d.unit,note:d.note||'',plan:'',exercises:(d.exercises||[]).map(e=>({name:e.name,weste:!!e.weste,griffe:!!e.griffe,sets:(e.sets||[]).map(x=>({w:x.w??'',r:x.r??''}))}))};
  persistDraft();S.tab='log';S.confirm=null;S.exMenu=null;S.infoOpen=null;S.timerOpen=null;S.showMeta=false;S.showNote=false;render();window.scrollTo(0,0);
}
async function commitDraft(){
  const d=S.draft;if(!d||S.busy)return;
  const exercises=d.exercises.map(e=>({name:String(e.name).trim(),weste:!!e.weste,griffe:!!e.griffe,
    sets:e.sets.filter(s=>String(s.w).trim()||String(s.r).trim()).map(s=>({w:cleanW(s.w),r:String(s.r).trim()}))}))
    .filter(e=>e.name&&e.sets.length);
  if(!exercises.length&&!d.note.trim()){toast('Trag mindestens einen Satz ein.');return}
  const id=d.id||`${d.date}_${SLUG[d.unit]||'x'}_${Date.now().toString(36)}`;
  const doc={date:d.date,unit:d.unit,note:d.note.trim(),exercises,updatedAt:Date.now()};
  S.busy=true;
  try{await putDoc('sessions',id,doc)}catch(e){S.busy=false;toast('Nicht gespeichert: '+errMsg(e));return}
  S.busy=false;S.draft=null;T=null;unwake();lnCancel();persistDraft();S.tab='hist';S.histFilter='Alle';S.openSess=id;toast('Training gespeichert');render();window.scrollTo(0,0);
}
function addExToDraft(name){
  name=String(name||'').trim();if(!name||!S.draft)return;
  S.draft.exercises.push(newEx(name));persistDraft();render();
  requestAnimationFrame(()=>{const cards=document.querySelectorAll('.ex');const c=cards[cards.length-1];if(c){c.scrollIntoView({block:'center',behavior:'smooth'});const i=c.querySelector('input[data-f="r"],input[data-f="w"]');if(i)i.focus({preventScroll:true})}});
}

/* ---------- views ---------- */
function viewLog(){
  if(S.draft)return viewDraft();
  const plans=plansSorted();
  const lastByUnit={};for(const s of sessionsDesc())if(!lastByUnit[s.unit])lastByUnit[s.unit]=s.date;
  return `<h2>Training starten</h2>
  ${plans.length?`<div class="plans">${plans.map(p=>`<button class="plan-btn" data-act="startPlan" data-id="${esc(p.id)}"><strong>${esc(p.name)}</strong><em>${lastByUnit[p.unit]?esc(agoText(daysAgo(lastByUnit[p.unit]))):''}</em></button>`).join('')}</div>`
   :'<p class="hint">Noch keine Pläne.</p>'}
  <h2>Ohne Plan</h2>
  <div class="chips">${UNITS.map(u=>`<button class="chip" data-act="startUnit" data-unit="${esc(u)}">${esc(u)}</button>`).join('')}</div>
  ${S.loaded.s&&S.sessions.size===0?'<p class="hint" style="margin-top:18px">Noch keine Trainings gespeichert.</p>':''}
  <div class="links"><button class="link" data-act="tab" data-tab="plans">Pläne bearbeiten</button><button class="link" data-act="tab" data-tab="data">Import &amp; Export</button></div>`;
}
function viewDraft(){
  const d=S.draft;
  const sug=catalog(d.unit).filter(n=>!d.exercises.some(e=>e.name===n)).slice(0,6);
  const showNote=S.showNote||d.note;
  return `<button class="draft-title" data-act="toggleMeta" aria-expanded="${S.showMeta}">${esc(d.plan||d.unit)} <span>${esc(fmtDay(d.date))}</span><small>${d.id?'Gespeichertes Training · ':''}${S.showMeta?'Datum &amp; Einheit ausblenden':'Datum oder Einheit ändern'}</small></button>
  ${S.showMeta?`<div class="draft-head">
    <div class="field"><label for="dDate">Datum</label><input type="date" id="dDate" value="${esc(d.date)}"></div>
    <div class="field"><label for="dUnit">Einheit</label><select id="dUnit">${UNITS.map(u=>`<option ${u===d.unit?'selected':''}>${esc(u)}</option>`).join('')}</select></div>
  </div>`:''}
  <div class="exlist">${d.exercises.map((e,i)=>exCard(e,i,d)).join('')||'<p class="empty">Noch keine Übung. Füge unten eine hinzu.</p>'}</div>
  <div class="addbox">
    <div class="row"><input class="in grow" id="addEx" list="exlist" placeholder="Übung hinzufügen …" autocomplete="off"><button class="btn" data-act="addEx">+</button></div>
    ${sug.length?`<div class="chips">${sug.map(n=>`<button class="chip" data-act="addExName" data-name="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>`:''}
  </div>
  ${showNote?`<h2>Notiz</h2><textarea id="dNote" placeholder="Wie lief’s? Schlaf, Schmerzen, Geräte-Einstellungen …">${esc(d.note)}</textarea>`
    :'<div style="margin-top:12px"><button class="link" data-act="showNote">+ Notiz hinzufügen</button></div>'}
  <div class="actions">
    <button class="btn gold" data-act="save">${d.id?'Änderungen speichern':'Training speichern'}</button>
    ${S.confirm==='discard'
      ?`<span class="confirm">Wirklich verwerfen? <button class="btn danger sm" data-act="discardYes">Verwerfen</button><button class="btn ghost sm" data-act="cancelConfirm">Nein</button></span>`
      :`<button class="btn ghost" data-act="discard">${d.id?'Abbrechen':'Verwerfen'}</button>`}
  </div>`;
}
function exCard(e,i,d){
  const last=lastFor(e.name,d.id,d.date);
  const k=weightKinds(e.name);
  const wmode=e.wmode||L.defaultWMode(k);
  const bodyweight=k.seen&&!k.numeric&&!k.text.length;
  const showWeste=!k.numeric;
  const showGriffe=/push.?up/i.test(e.name);
  const n=d.exercises.length;
  const rows=e.sets.map((s,j)=>{
    const ph=last&&last.ex.sets?last.ex.sets[j]:null;
    let w;
    if(wmode==='var') w=`<button class="cyc ${s.w?'on':''}" data-act="cyc" data-ei="${i}" data-si="${j}" aria-label="Variante Satz ${j+1}">${esc(s.w||(ph&&ph.w)||'wählen')}</button>`;
    else if(bodyweight&&!s.w) w=`<div class="bw ${e.weste?'w':''}">${e.weste?'+'+WESTE_KG+' kg Weste':'Körpergewicht'}</div>`;
    else w=`<input class="in" inputmode="decimal" data-ei="${i}" data-si="${j}" data-f="w" value="${esc(s.w)}" placeholder="${esc(ph&&ph.w?ph.w+' kg':'kg')}" aria-label="Gewicht Satz ${j+1}">`;
    return `<div class="set"><span class="sn">${j+1}</span>${w}<input class="in" inputmode="numeric" data-ei="${i}" data-si="${j}" data-f="r" value="${esc(s.r)}" placeholder="${esc(ph&&ph.r?ph.r+' Wdh':'Wdh')}" aria-label="Wiederholungen Satz ${j+1}"></div>`;
  }).join('');
  const canCopy=last&&(k.numeric||k.text.length)&&(last.ex.sets||[]).some(s=>String(s.w).trim());
  const menu=S.exMenu===i;
  const info=S.exInfo[e.name]||'',infoOpen=S.infoOpen===i;
  return `<div class="ex" data-ei="${i}">
    <div class="ex-head">
      <input class="ex-name" list="exlist" data-ei="${i}" data-f="name" value="${esc(e.name)}" aria-label="Übungsname">
    </div>
    <div class="ex-sub">
      <span class="last">${last?`Zuletzt ${esc(fmtShort(last.date))}: <b class="num">${esc((last.ex.sets||[]).map(setStr).join(' · '))}</b>${last.ex.weste?' <span class="tag">Weste</span>':''}${last.ex.griffe?' <span class="tag">Griffe</span>':''}`:'Neue Übung'}</span>
      <button class="tpill" data-act="timerEdit" data-ei="${i}" aria-expanded="${S.timerOpen===i}" aria-label="Pausentimer für ${esc(e.name)}">${esc(fmtSec(restFor(e.name)))}</button>
      <button class="ic info-btn ${info?'has':''}" data-act="info" data-ei="${i}" aria-expanded="${infoOpen}" aria-label="Hinweis zu ${esc(e.name)}">i</button>
      <button class="ic" data-act="exMenu" data-ei="${i}" aria-expanded="${menu}" aria-label="Optionen für ${esc(e.name)}">${ICON.more}</button>
    </div>
    ${S.timerOpen===i?`<div class="tedit">
      <span class="lbl">Pause nach jedem Satz</span>
      <div class="chips">${[0,45,60,90,120,180].map(v=>`<button class="chip ${restFor(e.name)===v?'on':''}" data-act="restSet" data-v="${v}" data-ei="${i}">${esc(fmtSec(v))}</button>`).join('')}</div>
      <div class="row"><button class="btn sm" data-act="restStep" data-v="-15" data-ei="${i}">− 15 s</button><b class="num tval">${esc(fmtSec(restFor(e.name)))}</b><button class="btn sm" data-act="restStep" data-v="15" data-ei="${i}">+ 15 s</button><span class="grow"></span><button class="link" data-act="timerClose">Fertig</button></div>
      <p class="hint" style="margin:0">Startet nur, wenn du auf „Pause starten“ tippst.${S.vibOK===false?' Vibration ist hier gerade nicht verfügbar, die Karte leuchtet dann nur gold auf.':''}</p>
    </div>`:''}
    ${infoOpen?((info&&!S.infoEdit)?`<div class="info"><p>${esc(info)}</p><button class="link" data-act="infoEditOn">Bearbeiten</button></div>`
      :`<div class="info"><textarea id="infoText" placeholder="z. B. Sitz 5, Lehne Loch 3, langsam ablassen …">${esc(info)}</textarea><div class="row"><button class="btn sm gold" data-act="infoSave" data-ei="${i}">Hinweis speichern</button><button class="btn sm ghost" data-act="infoClose">Schließen</button></div></div>`):''}
    ${menu?`<div class="ex-menu">
      <button class="btn sm" data-act="up" data-ei="${i}" ${i===0?'disabled':''}>↑ Nach oben</button>
      <button class="btn sm" data-act="down" data-ei="${i}" ${i===n-1?'disabled':''}>↓ Nach unten</button>
      ${(k.text.length||wmode==='var')?`<button class="btn sm" data-act="wmode" data-ei="${i}">${wmode==='var'?'Gewicht tippen':'Gewicht wählen'}</button>`:''}
      ${canCopy?`<button class="btn sm" data-act="copyW" data-ei="${i}">Gewichte wie ${esc(fmtShort(last.date))}</button>`:''}
      ${S.confirm==='delEx'+i?`<button class="btn sm danger" data-act="delExYes" data-ei="${i}">Wirklich entfernen</button>`:`<button class="btn sm danger" data-act="delEx" data-ei="${i}">Entfernen</button>`}
    </div>`:''}
    ${(showWeste||showGriffe)?`<div class="flags">
      ${showWeste?`<button class="chip ${e.weste?'on':''}" data-act="flag" data-k="weste" data-ei="${i}" aria-pressed="${e.weste}">Weste ${WESTE_KG} kg</button>`:''}
      ${showGriffe?`<button class="chip ${e.griffe?'on':''}" data-act="flag" data-k="griffe" data-ei="${i}" aria-pressed="${e.griffe}">Push-up-Griffe</button>`:''}
    </div>`:''}
    <div class="sets">${rows}</div>
    <div class="ex-foot">
      <button class="btn sm gold rest-start" data-act="restStart" data-ei="${i}">${(T&&T.name===e.name&&!T.done)?'■ Pause stoppen':'▶ Pause starten'}</button>
      <button class="btn sm ghost" data-act="addSet" data-ei="${i}">+ Satz</button>
      ${e.sets.length>1?`<button class="btn sm ghost" data-act="popSet" data-ei="${i}">− Satz</button>`:''}
    </div>
  </div>`;
}

function viewHist(){
  const all=sessionsDesc();
  const units=['Alle',...UNITS.filter(u=>all.some(s=>s.unit===u))];
  const list=S.histFilter==='Alle'?all:all.filter(s=>s.unit===S.histFilter);
  return `<div class="chips" style="margin-bottom:14px">${units.map(u=>`<button class="chip ${u===S.histFilter?'on':''}" data-act="histFilter" data-unit="${esc(u)}">${esc(u)}</button>`).join('')}</div>
  ${!S.loaded.s?'<p class="empty">Lade …</p>':list.length?`<div class="list">${list.map(sessionCard).join('')}</div>`:'<p class="empty">Noch keine Trainings in diesem Bereich.</p>'}`;
}
function sessionCard(s){
  const cid='del:'+s.id,open=S.openSess===s.id,n=(s.exercises||[]).length;
  return `<article class="card ${open?'open':''}">
    <button class="s-sum" data-act="openSess" data-id="${esc(s.id)}" aria-expanded="${open}">
      <span class="s-date">${esc(fmtDay(s.date))}</span><span class="badge">${esc(s.unit)}</span>
      <span class="s-meta">${n} ${n===1?'Übung':'Übungen'}${s.note?' · mit Notiz':''}</span>
    </button>
    ${open?`<dl class="s-ex">${(s.exercises||[]).map(e=>`<dt title="${esc(e.name)}">${esc(e.name)}</dt><dd>${esc((e.sets||[]).map(setStr).join(' · '))}${e.weste?'<span class="tag">Weste</span>':''}${e.griffe?'<span class="tag">Griffe</span>':''}</dd>`).join('')}</dl>
    ${s.note?`<p class="note">${esc(s.note)}</p>`:''}
    <div class="s-foot">
      ${S.confirm==='edit:'+s.id?`<span class="confirm">Offenes Training ersetzen? <button class="btn sm danger" data-act="editYes" data-id="${esc(s.id)}">Ersetzen</button><button class="btn sm ghost" data-act="cancelConfirm">Nein</button></span>`
        :`<button class="btn sm" data-act="edit" data-id="${esc(s.id)}">Bearbeiten</button>`}
      ${S.confirm===cid?`<span class="confirm">Training löschen? <button class="btn sm danger" data-act="delYes" data-id="${esc(s.id)}">Löschen</button><button class="btn sm ghost" data-act="cancelConfirm">Nein</button></span>`
        :`<button class="btn sm ghost" data-act="del" data-id="${esc(s.id)}">Löschen</button>`}
    </div>`:''}
  </article>`;
}

/* ---------- progress ---------- */
function chartSVG(pts,unit){
  const vw=($('#view')&&$('#view').clientWidth)||360;const W=Math.round(Math.max(300,Math.min(680,vw))),H=Math.round(W<480?220:260),P={l:40,r:14,t:12,b:28};
  const xs=pts.map(p=>parseISO(p.date).getTime());
  let x0=Math.min(...xs),x1=Math.max(...xs);if(x0===x1){x0-=3*864e5;x1+=3*864e5}
  const ticks=niceTicks(Math.min(...pts.map(p=>p.v)),Math.max(...pts.map(p=>p.v)),4);
  const y0=ticks[0],y1=ticks[ticks.length-1];
  const X=t=>P.l+(t-x0)/(x1-x0)*(W-P.l-P.r),Y=v=>P.t+(1-(v-y0)/(y1-y0))*(H-P.t-P.b);
  const line=pts.map((p,i)=>`${i?'L':'M'}${X(xs[i]).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const area=`${line}L${X(xs[xs.length-1]).toFixed(1)},${Y(y0)}L${X(xs[0]).toFixed(1)},${Y(y0)}Z`;
  const every=Math.max(1,Math.ceil(pts.length/(W<480?4:6)));
  const xl=pts.map((p,i)=>{if(i%every&&i!==pts.length-1)return '';if(i!==pts.length-1&&pts.length-1-i<every&&i%every===0&&i!==0)return '';const x=X(xs[i]);const a=x<P.l+24?'start':x>W-P.r-24?'end':'middle';return `<text class="ax" x="${x.toFixed(1)}" y="${H-8}" text-anchor="${a}">${esc(fmtShort(p.date))}</text>`}).join('');
  const sel=S.progSel==null||S.progSel>=pts.length?pts.length-1:S.progSel;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf in ${esc(unit)}">
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".28"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(v=>`<line class="grid" x1="${P.l}" x2="${W-P.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="ax" x="${P.l-8}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${esc(fmtNum(v))}</text>`).join('')}
    <path d="${area}" fill="url(#ga)"/>
    <path class="ln" d="${line}"/>
    ${pts.map((p,i)=>`<circle class="pt ${i===sel?'sel':''} ${p.weste?'w':''}" cx="${X(xs[i]).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${i===sel?6:4.5}"/>`).join('')}
    ${pts.map((p,i)=>`<circle class="hit" data-act="progSel" data-i="${i}" cx="${X(xs[i]).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="16"><title>${esc(fmtShort(p.date))}: ${esc(fmtNum(p.v))} ${esc(unit)}</title></circle>`).join('')}
    ${xl}
  </svg>`;
}
function viewProg(){
  const names=catalog(null).filter(n=>[...S.sessions.values()].some(s=>(s.exercises||[]).some(e=>e.name===n)));
  if(!names.length)return `<p class="empty">${S.loaded.s?'Noch keine Daten. Sobald du Trainings speicherst, siehst du hier deine Entwicklung je Übung.':'Lade …'}</p>`;
  if(!S.progEx||!names.includes(S.progEx))S.progEx=names[0];
  const groups={};for(const n of names){const u=unitOf(n);(groups[u]=groups[u]||[]).push(n)}
  const order=[...UNITS,'Sonstige'].filter(u=>groups[u]);
  const k=weightKinds(S.progEx);
  const avail=k.numeric?['top','vol','best']:['best','total'];
  if(!S.progMetric||!avail.includes(S.progMetric))S.progMetric=avail[0];
  const M=METRICS[S.progMetric];
  const hist=sessionsDesc().slice().reverse().map(s=>({s,e:(s.exercises||[]).find(e=>e.name===S.progEx)})).filter(x=>x.e);
  const pts=hist.map(x=>({date:x.s.date,v:M.f(x.e),weste:!!x.e.weste})).filter(p=>!isNaN(p.v));
  const sel=S.progSel==null||S.progSel>=pts.length?pts.length-1:S.progSel;
  let body='';
  if(!pts.length)body='<p class="empty">Für diese Kennzahl gibt es noch keine Werte.</p>';
  else{
    const cur=pts[sel],first=pts[0],best=Math.max(...pts.map(p=>p.v)),last=pts[pts.length-1];
    const diff=last.v-first.v;
    body=`<div class="readout"><strong>${esc(fmtNum(cur.v))}</strong><span>${esc(M.unit)} · ${esc(fmtLong(cur.date))}${cur.weste?' · mit Weste':''}</span></div>
    ${chartSVG(pts,M.unit)}
    <div class="stats">
      <div class="stat"><span class="lbl">Letztes</span><b>${esc(fmtNum(last.v))}</b></div>
      <div class="stat"><span class="lbl">Bestwert</span><b>${esc(fmtNum(best))}</b></div>
      <div class="stat"><span class="lbl">Seit Start</span><b class="${diff>0?'up':''}">${diff>0?'+':''}${esc(fmtNum(diff))}</b></div>
    </div>`;
  }
  return `<div class="prog-ctrl">
    <div class="field"><label for="progEx">Übung</label><select id="progEx">${order.map(u=>`<optgroup label="${esc(u)}">${groups[u].map(n=>`<option ${n===S.progEx?'selected':''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div class="chips">${avail.map(m=>`<button class="chip ${m===S.progMetric?'on':''}" data-act="metric" data-m="${m}">${esc(METRICS[m].label)}</button>`).join('')}</div>
  </div>
  ${body}
  ${S.showTbl?`<div class="tbl-wrap"><table><thead><tr><th>Datum</th><th>Sätze</th></tr></thead><tbody>
    ${hist.slice().reverse().map(x=>`<tr><td>${esc(fmtShort(x.s.date))}</td><td>${esc((x.e.sets||[]).map(setStr).join(' · '))}${x.e.weste?'<span class="tag">Weste</span>':''}${x.e.griffe?'<span class="tag">Griffe</span>':''}</td></tr>`).join('')}
  </tbody></table></div>`:`<div style="margin-top:14px"><button class="link" data-act="showTbl">Alle ${hist.length} Einträge anzeigen</button></div>`}`;
}

/* ---------- plans ---------- */
function viewPlans(){
  if(S.planEdit)return viewPlanEdit();
  const plans=plansSorted();
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="margin:0">Trainingspläne</h2><button class="btn gold sm" data-act="newPlan">+ Neuer Plan</button></div>
  ${plans.length?`<div class="list">${plans.map(p=>`<article class="card">
    <div class="s-head"><span class="s-date">${esc(p.name)}</span><span class="badge">${esc(p.unit)}</span></div>
    <p class="hint" style="margin:0">${esc((p.exercises||[]).join(' · ')||'Keine Übungen')}</p>
    <div class="s-foot">
      <button class="btn sm gold" data-act="startPlan" data-id="${esc(p.id)}">Starten</button>
      <button class="btn sm" data-act="editPlan" data-id="${esc(p.id)}">Bearbeiten</button>
      ${S.confirm==='plan:'+p.id?`<span class="confirm">Plan löschen? <button class="btn sm danger" data-act="delPlanYes" data-id="${esc(p.id)}">Löschen</button><button class="btn sm ghost" data-act="cancelConfirm">Nein</button></span>`
        :`<button class="btn sm ghost" data-act="delPlan" data-id="${esc(p.id)}">Löschen</button>`}
    </div></article>`).join('')}</div>`
   :`<p class="empty">${S.loaded.p?'Noch keine Pläne. Ein Plan ist eine feste Liste von Übungen, die beim Start schon mit je drei Sätzen drinsteht.':'Lade …'}</p>`}`;
}
function viewPlanEdit(){
  const p=S.planEdit;
  const sug=catalog(p.unit).filter(n=>!p.exercises.includes(n)).slice(0,14);
  return `<h2>${p.id?'Plan bearbeiten':'Neuer Plan'}</h2>
  <div class="draft-head">
    <div class="field"><label for="peName">Name</label><input class="in" id="peName" value="${esc(p.name)}" placeholder="z. B. Push Gym"></div>
    <div class="field"><label for="peUnit">Einheit</label><select id="peUnit">${UNITS.map(u=>`<option ${u===p.unit?'selected':''}>${esc(u)}</option>`).join('')}</select></div>
  </div>
  <div class="pe-list">${p.exercises.map((n,i)=>`<div class="pe-item"><i>${i+1}</i><span>${esc(n)}</span>
    <button class="ic" data-act="peUp" data-i="${i}" ${i===0?'disabled':''} aria-label="Nach oben">${ICON.up}</button>
    <button class="ic" data-act="peDown" data-i="${i}" ${i===p.exercises.length-1?'disabled':''} aria-label="Nach unten">${ICON.down}</button>
    <button class="ic" data-act="peDel" data-i="${i}" aria-label="Entfernen">${ICON.x}</button></div>`).join('')||'<p class="hint">Noch keine Übungen im Plan.</p>'}</div>
  <div class="addbox">
    <div class="row"><input class="in grow" id="peAdd" list="exlist" placeholder="Übung hinzufügen …" autocomplete="off"><button class="btn" data-act="peAdd">Hinzufügen</button></div>
    ${sug.length?`<div class="chips">${sug.map(n=>`<button class="chip" data-act="peAddName" data-name="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>`:''}
  </div>
  <div class="actions"><button class="btn gold" data-act="peSave">Plan speichern</button><button class="btn ghost" data-act="peCancel">Abbrechen</button></div>`;
}

/* ---------- data: import / export / restore / rename ---------- */
async function runImport(){
  if(S.busy)return;
  const plan=L.planImport(S.imports,S.sessions,Date.now());
  if(!plan.ops.length){toast('Nichts zu importieren. Wähle für jede Datei eine Einheit.');return}
  S.busy=true;
  try{commitOps(plan.ops.map(o=>({coll:'sessions',id:o.id,doc:o.doc})))}
  catch(e){S.busy=false;toast('Nicht importiert: '+errMsg(e));render();return}
  S.busy=false;S.imports=[];toast(`${plan.ops.length} Trainings importiert${plan.replaced?`, ${plan.replaced} ersetzt`:''}`);render();
}
const buildCSV=()=>L.buildCSV(sessionList());
function buildBackupJSON(){return JSON.stringify({app:'trainingsbuch',version:1,sessions:Object.fromEntries(S.sessions),plans:Object.fromEntries(S.plans),exinfo:S.exInfo,rest:S.rest},null,2)}
async function deliverFile(fname,text,mime,title,okMsg){
  const bom=mime==='text/csv'?'﻿':'';
  try{const file=new File([bom+text],fname,{type:mime});
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title});return true}}catch(e){if(e&&e.name==='AbortError')return true}
  try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bom+text],{type:mime}));a.download=fname;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast(okMsg);return true}catch(e){}
  S.exportText=text;S.exportName=fname;render();return false;
}
const doExport=()=>deliverFile(`trainingsbuch-${todayISO()}.csv`,buildCSV(),'text/csv','Trainingsbuch Backup','CSV gespeichert');
const doExportJSON=()=>deliverFile(`trainingsbuch-komplett-${todayISO()}.json`,buildBackupJSON(),'application/json','Trainingsbuch Komplett-Sicherung','Sicherung gespeichert');

/* Wiederherstellen: Datei oder Dropbox -> Vorschau -> zusammenführen oder ersetzen */
function openRestore(text,name){
  const p=L.parseBackup(text);
  S.restore=p.error?{name,error:p.error}:{name,parsed:p,mode:'merge'};
  S.confirm=null;S.tab='data';render();window.scrollTo(0,0);
}
function restoreOps(plan){
  return [...plan.sessionOps.map(o=>({coll:'sessions',id:o.id,doc:o.doc})),...plan.sessionDel.map(id=>({coll:'sessions',id,doc:null})),
          ...plan.planOps.map(o=>({coll:'plans',id:o.id,doc:o.doc})),...plan.planDel.map(id=>({coll:'plans',id,doc:null}))];
}
function writeMeta(exinfo,rest){
  if(exinfo){lsWrite('tb_exinfo',exinfo);S.exInfo=exinfo}
  if(rest){lsWrite('tb_rest',rest);S.rest=rest}
}
function runRestore(){
  const R=S.restore;if(!R||!R.parsed||S.busy)return;
  const plan=L.planRestore(localSnapshot(),R.parsed.data,R.mode);
  S.busy=true;
  try{commitOps(restoreOps(plan))}catch(e){S.busy=false;toast('Nicht wiederhergestellt: '+errMsg(e));render();return}
  let metaFailed=false;try{writeMeta(plan.exinfo,plan.rest)}catch(e){metaFailed=true}
  S.busy=false;S.restore=null;S.confirm=null;
  if(window.DropboxBackup&&DropboxBackup.markSynced)DropboxBackup.markSynced();
  const st=plan.stats;
  toast(metaFailed?'Trainings wiederhergestellt, Hinweise und Pausenzeiten nicht (Speicher voll).':R.mode==='replace'?`Wiederhergestellt: ${Object.keys(R.parsed.data.sessions).length} Trainings`:`Wiederhergestellt: ${st.added} neu, ${st.updated} aktualisiert`);
  refreshStorageInfo();render();window.scrollTo(0,0);
}
function restoreView(){
  const R=S.restore;if(!R)return '';
  if(R.error)return `<div class="card" style="margin-top:10px"><p class="hint" style="margin:0"><b>${esc(R.name)}</b><br>${esc(R.error)}</p><div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="restoreCancel">Schließen</button></div></div>`;
  const c=R.parsed.counts,plan=L.planRestore(localSnapshot(),R.parsed.data,R.mode),st=plan.stats;
  const info=R.mode==='merge'
    ?`Vorhandenes bleibt. ${st.added} neue Trainings kommen dazu, ${st.updated} werden durch die neuere Fassung ersetzt, ${st.kept} bleiben unverändert.`
    :`Danach hast du genau ${c.sessions} Trainings und ${c.plans} Pläne wie in der Sicherung. ${st.removed} jetzt vorhandene Trainings, die dort fehlen, werden entfernt.`;
  const ask=S.confirm==='restoreReplace';
  return `<div class="card" style="margin-top:10px">
    <strong>${esc(R.name)}</strong>
    <p class="hint" style="margin:4px 0 10px">${c.sessions} Trainings, ${c.plans} Pläne, ${c.exinfo} Übungshinweise${R.parsed.skipped?`. ${R.parsed.skipped} beschädigte Einträge werden übersprungen`:''}.</p>
    <div class="chips"><button class="chip ${R.mode==='merge'?'on':''}" data-act="restoreMode" data-v="merge">Zusammenführen</button><button class="chip ${R.mode==='replace'?'on':''}" data-act="restoreMode" data-v="replace">Alles ersetzen</button></div>
    <p class="hint">${esc(info)}</p>
    <div class="actions">${ask
      ?`<span class="confirm">Wirklich ersetzen? <button class="btn danger sm" data-act="restoreRun">Ersetzen</button><button class="btn ghost sm" data-act="cancelConfirm">Nein</button></span>`
      :`<button class="btn gold" data-act="${R.mode==='replace'?'restoreAskReplace':'restoreRun'}">${R.mode==='replace'?'Ersetzen …':'Zusammenführen'}</button><button class="btn ghost" data-act="restoreCancel">Abbrechen</button>`}</div>
  </div>`;
}

/* Übung umbenennen oder mit einer anderen zusammenführen */
function renameInDraft(from,to){
  const d=S.draft;if(!d)return;const out=[];
  for(const x of d.exercises){if(x.name===from)x.name=to;const t=out.find(y=>y.name===x.name);if(t){t.sets=t.sets.concat(x.sets);t.weste=t.weste||x.weste;t.griffe=t.griffe||x.griffe}else out.push(x)}
  d.exercises=out;persistDraft();
}
function runRename(){
  const R=S.rename;if(!R||!R.plan||S.busy)return;
  const p=R.plan,from=R.from.trim(),to=R.to.trim();
  S.busy=true;
  try{commitOps([...p.sessionOps.map(o=>({coll:'sessions',id:o.id,doc:o.doc})),...p.planOps.map(o=>({coll:'plans',id:o.id,doc:o.doc}))]);writeMeta(p.exinfo,p.rest)}
  catch(e){S.busy=false;toast('Nicht umbenannt: '+errMsg(e));render();return}
  S.busy=false;
  renameInDraft(from,to);
  if(T&&T.name===from)T.name=to;
  if(S.progEx===from){S.progEx=to;LS.set('tb_progEx',to)}
  S.rename=null;S.progSel=null;
  toast(`„${from}“ ist jetzt „${to}“ (${p.counts.sessions} Trainings, ${p.counts.plans} Pläne)`);render();
}
function renameView(){
  const names=catalog(null).slice().sort((a,b)=>a.localeCompare(b,'de'));
  const R=S.rename||{from:'',to:'',plan:null};
  const head=`<h2>Übungen verwalten</h2><p class="hint">Benennt eine Übung in allen Trainings, Plänen, Hinweisen und Pausenzeiten um. Gibt es den neuen Namen schon, werden beide zusammengeführt, zum Beispiel nach einem Tippfehler.</p>`;
  if(!names.length)return head+'<p class="hint">Noch keine Übungen vorhanden.</p>';
  const locked=!!R.plan;
  return head+`<div class="draft-head">
    <div class="field"><label for="rnFrom">Übung</label><select id="rnFrom" ${locked?'disabled':''}><option value="">Wählen …</option>${names.map(n=>`<option ${n===R.from?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="field"><label for="rnTo">Neuer Name</label><input class="in" id="rnTo" list="exlist" value="${esc(R.to)}" autocomplete="off" ${locked?'readonly':''}></div>
  </div>
  ${locked
    ?`<p class="hint">${R.plan.merged?'„'+esc(R.to.trim())+'“ gibt es schon, beide werden zusammengeführt. ':''}Angepasst werden ${R.plan.counts.sessions} Trainings und ${R.plan.counts.plans} Pläne.</p>
      <div class="actions"><button class="btn gold" data-act="rnApply">${R.plan.merged?'Zusammenführen':'Umbenennen'}</button><button class="btn ghost" data-act="rnCancel">Abbrechen</button></div>`
    :`<div class="actions"><button class="btn" data-act="rnPrepare">Weiter</button></div>`}`;
}

function viewData(){
  const total=S.sessions.size,si=S.storageInfo;
  const stor=si&&si.persisted===true?'Der Browser hält den Speicher dauerhaft vor.':si&&si.persisted===false?'Der Browser darf die Daten bei Platzmangel löschen, sichere deshalb regelmäßig.':'';
  return `<h2>Alte Daten importieren</h2>
  <p class="hint">CSV mit den Spalten Datum, Übung, Satz, Gewicht_kg, Wiederholungen (Semikolon oder Komma). Ein Training mit gleichem Datum und gleicher Einheit wird ersetzt.</p>
  <label class="file" for="csvIn"><input type="file" id="csvIn" accept=".csv,text/csv,text/plain" multiple>CSV-Dateien auswählen</label>
  ${S.imports.length?`<div style="margin-top:8px">${S.imports.map((f,i)=>`<div class="imp"><div><strong>${esc(f.name)}</strong><small>${f.error?esc(f.error):`${f.rows.length} Sätze · ${new Set(f.rows.map(r=>r.date)).size} Trainings`}</small></div>
    ${f.hasUnit?'<span class="hint">Einheit aus Datei</span>':`<select data-imp="${i}" aria-label="Einheit für ${esc(f.name)}"><option value="">Einheit wählen …</option>${UNITS.map(u=>`<option ${u===f.unit?'selected':''}>${esc(u)}</option>`).join('')}</select>`}</div>`).join('')}
    <div class="actions"><button class="btn gold" data-act="runImport" ${S.imports.some(f=>!f.hasUnit&&!f.unit&&f.rows.length)?'disabled style="opacity:.5"':''}>Importieren</button><button class="btn ghost" data-act="clearImport">Abbrechen</button></div></div>`:''}
  <h2>Sichern</h2>
  <p class="hint">${total} Trainings liegen nur auf diesem Gerät. ${esc(stor)}</p>
  <div class="row"><button class="btn" data-act="exportJSON">Komplett-Sicherung (JSON)</button><button class="btn" data-act="export">Nur Trainings (CSV)</button></div>
  <p class="hint">Die JSON-Sicherung enthält auch Pläne, Hinweise und Pausenzeiten und lässt sich unten wiederherstellen. Die CSV ist für Tabellenkalkulationen.</p>
  ${S.exportText!=null?`<div style="margin-top:12px"><p class="hint">Download ist hier nicht möglich. Kopier den Text und speichere ihn als Datei ${esc(S.exportName||'trainingsbuch.csv')}:</p><textarea id="expText" readonly style="min-height:180px;font-size:13px">${esc(S.exportText)}</textarea><div class="row" style="margin-top:8px"><button class="btn sm" data-act="copyExport">Kopieren</button></div></div>`:''}
  <h2>Wiederherstellen</h2>
  <p class="hint">Wähle eine Komplett-Sicherung (trainingsbuch-komplett.json) von diesem oder einem anderen Gerät. Mit Dropbox-Anbindung geht es unten auch direkt von dort.</p>
  <label class="file" for="bkIn"><input type="file" id="bkIn" accept=".json,application/json,text/plain">Sicherung auswählen</label>
  ${restoreView()}
  ${renameView()}
  ${window.DropboxBackup?DropboxBackup.html('btn'):''}`;
}

/* ---------- Einstellungen ---------- */
function viewSettings(){
  const TS=window.TBSettings;
  if(!TS)return '<p class="empty">Einstellungen konnten nicht geladen werden. Öffne die App einmal mit Internet.</p>';
  const st=TS.get(),c=TS.baseColors(),native=!!LN();
  const sw=TS.THEMES.map(t=>`<button class="sw ${!st.colors&&st.theme===t.id?'on':''}" data-set="theme" data-v="${t.id}" aria-pressed="${!st.colors&&st.theme===t.id}"><span class="sw-prev" style="background:${t.bg};border-color:${t.surface}"><i style="background:${t.accent}"></i><i style="background:${t.fg}"></i></span><span class="sw-name">${esc(t.name)}</span></button>`).join('');
  const cols=[['accent','Akzent'],['bg','Hintergrund'],['surface','Flächen'],['fg','Schrift']].map(([k,l])=>`<label class="colrow"><span>${l}</span><input type="color" data-col="${k}" value="${c[k]}" aria-label="${l}"></label>`).join('');
  const logos=TS.LOGOS.map(l=>`<button class="lg ${st.logo===l.id?'on':''}" data-set="logo" data-v="${l.id}" aria-pressed="${st.logo===l.id}">${l.svg?TS.logoSvg(l.id,30):'<span style="font-size:20px;color:var(--muted)">–</span>'}<small>${esc(l.name)}</small></button>`).join('')
    +`<label class="lg ${st.logo==='custom'?'on':''}">${st.logoData?`<img src="${st.logoData}" width="30" height="30" alt="" style="border-radius:7px;object-fit:cover">`:'<span style="font-size:22px">+</span>'}<small>Eigenes Bild</small><input type="file" accept="image/*" id="logoFile" aria-label="Eigenes Logo hochladen"></label>`;
  const chip=(kind,list,curv)=>list.map(o=>`<button class="chip ${curv===o.id?'on':''}" data-set="${kind}" data-v="${o.id}" aria-pressed="${curv===o.id}">${esc(o.name)}</button>`).join('');
  return `<div class="set-sec"><h2>Design</h2>
    <p class="hint" style="margin-top:0">Wähle eine Vorlage und pass danach einzelne Farben an.</p>
    <div class="swatches">${sw}</div>
    <div class="colrows">${cols}</div>
    <p class="hint">${st.colors?'Eigene Farben aktiv, Grundlage: '+esc((TS.THEMES.find(t=>t.id===st.theme)||{}).name||''):'Vorlage aktiv.'}</p>
    <div class="row"><button class="btn sm" data-set="resetDesign">Design zurücksetzen</button></div>
  </div>
  <div class="set-sec"><h2>Logo</h2>
    <div class="logos">${logos}</div>
    <p class="hint">Das Logo erscheint oben in der App und im Browser-Tab. Das Symbol auf dem Startbildschirm kann die App nicht selbst ändern.</p>
  </div>
  <div class="set-sec"><h2>Signal am Pausenende</h2>
    <span class="lbl">Vibration</span><div class="chips">${chip('vib',TS.VIBS,st.vib)}</div>
    <span class="lbl">Ton</span><div class="chips">${chip('snd',TS.SOUNDS,st.snd)}</div>
    <p class="hint">${native?'Bei gesperrtem Handy kommt eine Benachrichtigung mit dem gewählten Vibrationsmuster. Ist ein Ton gewählt, spielt Android dann seinen Benachrichtigungston, den gewählten Ton gibt es nur bei offener App.':'Ton und Vibration kommen, solange die App offen ist und der Bildschirm an ist. Bei gesperrtem Handy hilft nur die Android-App.'}</p>
    <div class="row"><button class="btn" data-set="test">Signal testen</button>${native?'<button class="btn" data-set="testLock">Test in 10 s</button>':''}</div>
    ${native?'<p class="hint">„Test in 10 s“: tippen, Handy sperren, warten.</p>':''}
  </div>
  <p class="hint" style="text-align:center">Weitere Einstellungen kommen nach und nach hierher.</p>`;
}
function settingsRerender(){if(S.tab==='settings'){const y=window.scrollY;render();window.scrollTo(0,y)}}
document.addEventListener('click',ev=>{
  const b=ev.target.closest&&ev.target.closest('[data-set]');if(!b||!window.TBSettings)return;
  const TS=TBSettings,k=b.dataset.set,v=b.dataset.v;
  if(k==='theme'){TS.set({theme:v,colors:null});settingsRerender()}
  else if(k==='resetDesign'){TS.reset(['theme','colors']);settingsRerender();toast('Design zurückgesetzt')}
  else if(k==='logo'){TS.set({logo:v});settingsRerender()}
  else if(k==='vib'){TS.set({vib:v});settingsRerender();const pat=TS.vibPattern(v);if(pat)buzz(pat)}
  else if(k==='snd'){TS.set({snd:v});settingsRerender();TS.playSound(v)}
  else if(k==='test'){TS.audioUnlock();signalNow()}
  else if(k==='testLock'){lnSchedule(Date.now()+10000,'Testsignal',2).then(ok=>toast(ok?'Kommt in 10 Sekunden. Handy jetzt sperren.':'Test nicht möglich. Sind Benachrichtigungen erlaubt?'))}
});
document.addEventListener('input',ev=>{
  const t=ev.target;if(!t.dataset||!t.dataset.col||!window.TBSettings)return;
  const TS=TBSettings,cols=Object.assign({},TS.baseColors(),TS.get().colors||{});cols[t.dataset.col]=t.value.toUpperCase();
  TS.set({colors:cols});
});
document.addEventListener('change',ev=>{
  const t=ev.target;if(!window.TBSettings)return;
  if(t.dataset&&t.dataset.col){settingsRerender();return}
  if(t.id==='logoFile'&&t.files&&t.files[0]){
    TBSettings.readLogoFile(t.files[0],(err,data)=>{
      if(err){toast(err.message);return}
      if(!TBSettings.set({logo:'custom',logoData:data}))toast('Bild zu groß zum Speichern.');
      settingsRerender();
    });
  }
});

/* ---------- Zurück-Wischgeste (Pixel/Android) und Zurück-Taste ---------- */
let navKeys=[],navIdx=0,navApplying=false,navIgnore=0,navReady=false;
function viewKey(){
  let k=S.tab;
  if(S.openSess)k+='|s'+S.openSess;
  if(S.planEdit)k+='|edit';
  if(S.timerOpen!==null||S.exMenu!==null||S.infoOpen!==null||S.confirm)k+='|o';
  return k;
}
function navApply(key){
  navApplying=true;
  const parts=String(key||'log').split('|');
  S.tab=parts[0]||'log';
  const sess=parts.find(x=>x[0]==='s'&&x.length>1);
  S.openSess=sess?sess.slice(1):null;
  S.planEdit=null;S.timerOpen=null;S.exMenu=null;S.infoOpen=null;S.confirm=null;
  render();window.scrollTo(0,0);
  navApplying=false;
}
function navSync(){
  if(navApplying||!navReady)return;
  const key=viewKey();
  if(key===navKeys[navIdx])return;
  if(navIdx>0&&navKeys[navIdx-1]===key){navIgnore++;navIdx--;history.back();return}
  navKeys.length=navIdx+1;navKeys.push(key);navIdx++;
  try{history.pushState({tb:1,i:navIdx},'')}catch(e){}
}
function navInit(){
  try{
    navKeys=[viewKey()];navIdx=0;
    history.replaceState({tb:1,i:0},'');
    window.addEventListener('popstate',ev=>{
      if(navIgnore>0){navIgnore--;return}
      const st=ev.state;
      if(!st||!st.tb)return;
      navIdx=Math.min(st.i,navKeys.length-1);
      navApply(navKeys[navIdx]||'log');
    });
    navReady=true;
  }catch(e){}
}
/* ---------- render ---------- */
function renderTabs(){
  $('#tabs').innerHTML=TABS.map(([k,l])=>`<button class="tab ${(S.tab===k||(k==='log'&&['plans','data'].includes(S.tab)))?'on':''}" data-act="tab" data-tab="${k}" ${S.tab===k?'aria-current="page"':''}>${esc(l)}${k==='log'&&S.draft&&!['log','plans','data'].includes(S.tab)?'<span class="dot" aria-label="offen"></span>':''}</button>`).join('');
}
function renderDatalist(){$('#exlist').innerHTML=catalog(null).map(n=>`<option value="${esc(n)}"></option>`).join('')}
function render(){
  LS.set('tb_tab',S.tab);
  renderTabs();renderDatalist();
  const tabOn=S.tab;const v={log:viewLog,hist:viewHist,prog:viewProg,plans:viewPlans,data:viewData,settings:viewSettings}[S.tab]||viewLog;
  const gb=$('#gearBtn');if(gb){gb.classList.toggle('on',S.tab==='settings');if(S.tab==='settings')gb.setAttribute('aria-current','page');else gb.removeAttribute('aria-current')}
  setTimeout(paintRest,0);
  $('#view').innerHTML=(S.tab==='plans'||S.tab==='data'||S.tab==='settings'?'<button class="link back" data-act="tab" data-tab="log">‹ Zurück zum Training</button>':'')+v();
  navSync();
}
let toastT=null;
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},2600)}

/* ---------- events ---------- */
document.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-act]');if(!b||b.disabled)return;
  const a=b.dataset.act,d=S.draft;
  const ei=b.dataset.ei!=null?+b.dataset.ei:null,si=b.dataset.si!=null?+b.dataset.si:null;
  switch(a){
    case 'tab':S.tab=b.dataset.tab;S.confirm=null;S.planEdit=null;S.showTbl=false;S.exportText=null;S.restore=null;S.rename=null;render();window.scrollTo(0,0);break;
    case 'startPlan':if(S.draft&&!S.draft.id&&S.draft.exercises.length){S.tab='log';render();toast('Es ist noch ein Training offen.');break}startDraft(null,b.dataset.id);break;
    case 'startUnit':startDraft(b.dataset.unit,null);break;
    case 'addEx':{const i=$('#addEx');addExToDraft(i&&i.value);break}
    case 'addExName':addExToDraft(b.dataset.name);break;
    case 'restStart':{const e=d&&d.exercises[ei];if(!e)break;
      if(T&&T.name===e.name&&!T.done){stopRest();break}
      if(!restFor(e.name)){toast('Pause ist auf „Aus“. Stell oben beim Zeitfeld eine Zeit ein.');break}
      startRest(ei,lastFilledSet(e));break}
    case 'addSet':d.exercises[ei].sets.push({w:'',r:''});persistDraft();render();break;
    case 'timerEdit':S.timerOpen=S.timerOpen===ei?null:ei;S.infoOpen=null;S.exMenu=null;render();break;
    case 'timerClose':S.timerOpen=null;render();break;
    case 'restSet':case 'restStep':{const e=d.exercises[ei];const v=a==='restSet'?+b.dataset.v:restFor(e.name)+(+b.dataset.v);setRest(e.name,v);
      if(S.vibOK===null){try{S.vibOK=navigator.vibrate?navigator.vibrate(40):false}catch(x){S.vibOK=false}}else{try{navigator.vibrate&&navigator.vibrate(40)}catch(x){}}
      render();break}
    case 'stopRest':stopRest();break;
    case 'info':S.timerOpen=null;S.infoOpen=S.infoOpen===ei?null:ei;S.infoEdit=false;render();if(S.infoOpen===ei&&!S.exInfo[d.exercises[ei].name]){const t=$('#infoText');if(t)t.focus()}break;
    case 'infoEditOn':S.infoEdit=true;render();{const t=$('#infoText');if(t)t.focus()}break;
    case 'infoClose':S.infoOpen=null;S.infoEdit=false;render();break;
    case 'infoSave':{const t=$('#infoText');try{await saveInfo(d.exercises[ei].name,t?t.value:'');S.infoEdit=false;if(!S.exInfo[d.exercises[ei].name])S.infoOpen=null;toast('Hinweis gespeichert')}catch(e){toast('Nicht gespeichert: '+errMsg(e))}render();break}
    case 'popSet':d.exercises[ei].sets.pop();persistDraft();render();break;
    case 'exMenu':S.timerOpen=null;S.exMenu=S.exMenu===ei?null:ei;S.confirm=null;render();break;
    case 'toggleMeta':S.showMeta=!S.showMeta;render();break;
    case 'showNote':S.showNote=true;render();{const t=$('#dNote');if(t)t.focus()}break;
    case 'openSess':S.openSess=S.openSess===b.dataset.id?null:b.dataset.id;S.confirm=null;render();break;
    case 'showTbl':S.showTbl=true;render();break;
    case 'cyc':{const e=d.exercises[ei];const vals=['',...weightKinds(e.name).text];const cur=vals.indexOf(e.sets[si].w);e.sets[si].w=vals[(cur+1)%vals.length];persistDraft();
      b.textContent=e.sets[si].w||'wählen';b.classList.toggle('on',!!e.sets[si].w);break}
    case 'flag':{const e=d.exercises[ei];e[b.dataset.k]=!e[b.dataset.k];persistDraft();render();break}
    case 'copyW':{const e=d.exercises[ei];const last=lastFor(e.name,d.id,d.date);if(!last)break;
      last.ex.sets.forEach((s,j)=>{if(!e.sets[j])e.sets.push({w:'',r:''});e.sets[j].w=s.w||''});persistDraft();render();break}
    case 'up':case 'down':{const j=a==='up'?ei-1:ei+1;if(j<0||j>=d.exercises.length)break;const t=d.exercises[ei];d.exercises[ei]=d.exercises[j];d.exercises[j]=t;S.exMenu=j;S.infoOpen=null;persistDraft();S.confirm=null;render();break}
    case 'delEx':S.confirm='delEx'+ei;render();break;
    case 'delExYes':d.exercises.splice(ei,1);S.confirm=null;S.exMenu=null;S.infoOpen=null;persistDraft();render();break;
    case 'save':await commitDraft();break;
    case 'discard':S.confirm='discard';render();break;
    case 'discardYes':{const wasEdit=d&&d.id;S.draft=null;T=null;unwake();lnCancel();S.confirm=null;persistDraft();if(wasEdit)S.tab='hist';render();break}
    case 'cancelConfirm':S.confirm=null;render();break;
    case 'histFilter':S.histFilter=b.dataset.unit;render();break;
    case 'edit':if(S.draft&&S.draft.id!==b.dataset.id&&(S.draft.exercises.length||S.draft.note)){S.confirm='edit:'+b.dataset.id;render();break}editSession(b.dataset.id);break;
    case 'editYes':editSession(b.dataset.id);break;
    case 'del':S.confirm='del:'+b.dataset.id;render();break;
    case 'delYes':try{await delDoc('sessions',b.dataset.id);toast('Training gelöscht')}catch(e){toast('Nicht gelöscht: '+errMsg(e))}S.confirm=null;render();break;
    case 'metric':S.progMetric=b.dataset.m;S.progSel=null;render();break;
    case 'progEx_':break;
    case 'progSel':S.progSel=+b.dataset.i;render();break;
    case 'newPlan':S.planEdit={id:null,name:'',unit:'Push',exercises:[]};render();break;
    case 'editPlan':{const p=S.plans.get(b.dataset.id);if(p){S.planEdit={id:b.dataset.id,name:p.name,unit:p.unit,order:p.order,exercises:[...(p.exercises||[])]};render()}break}
    case 'delPlan':S.confirm='plan:'+b.dataset.id;render();break;
    case 'delPlanYes':try{await delDoc('plans',b.dataset.id);toast('Plan gelöscht')}catch(e){toast('Nicht gelöscht: '+errMsg(e))}S.confirm=null;render();break;
    case 'peUp':case 'peDown':{const p=S.planEdit,i=+b.dataset.i,j=a==='peUp'?i-1:i+1;if(j<0||j>=p.exercises.length)break;[p.exercises[i],p.exercises[j]]=[p.exercises[j],p.exercises[i]];render();break}
    case 'peDel':S.planEdit.exercises.splice(+b.dataset.i,1);render();break;
    case 'peAdd':{const i=$('#peAdd');const n=i&&i.value.trim();if(n&&!S.planEdit.exercises.includes(n)){S.planEdit.exercises.push(n);render();const ni=$('#peAdd');if(ni)ni.focus()}break}
    case 'peAddName':if(!S.planEdit.exercises.includes(b.dataset.name)){S.planEdit.exercises.push(b.dataset.name);render()}break;
    case 'peSave':{const p=S.planEdit;const name=p.name.trim();if(!name){toast('Gib dem Plan einen Namen.');break}
      const id=p.id||('plan-'+Date.now().toString(36));
      try{await putDoc('plans',id,{name,unit:p.unit,exercises:p.exercises,order:p.order??Date.now()})}catch(e){toast('Nicht gespeichert: '+errMsg(e));break}
      S.planEdit=null;toast('Plan gespeichert');render();break}
    case 'peCancel':S.planEdit=null;render();break;
    case 'runImport':await runImport();break;
    case 'clearImport':S.imports=[];render();break;
    case 'export':await doExport();break;
    case 'exportJSON':await doExportJSON();break;
    case 'wmode':{const e=d.exercises[ei];const cur=e.wmode||L.defaultWMode(weightKinds(e.name));e.wmode=cur==='var'?'num':'var';persistDraft();render();break}
    case 'restoreMode':if(S.restore){S.restore.mode=b.dataset.v;S.confirm=null;render()}break;
    case 'restoreAskReplace':S.confirm='restoreReplace';render();break;
    case 'restoreRun':runRestore();break;
    case 'restoreCancel':S.restore=null;S.confirm=null;render();break;
    case 'rnPrepare':{const R=S.rename||{from:'',to:'',plan:null};const plan=L.planRename(localSnapshot(),R.from,R.to);
      if(!plan){toast('Wähle eine Übung und gib einen anderen neuen Namen ein.');break}
      S.rename=Object.assign({},R,{plan});render();break}
    case 'rnApply':runRename();break;
    case 'rnCancel':if(S.rename)S.rename.plan=null;render();break;
    case 'copyExport':{const t=$('#expText');try{await navigator.clipboard.writeText(S.exportText);toast('Kopiert')}catch(e){if(t){t.focus();t.select()}toast('Text markiert. Jetzt kopieren.')}break}
  }
});
document.addEventListener('input',ev=>{
  const t=ev.target,d=S.draft;
  if(t.id==='dNote'&&d){d.note=t.value;persistDraft();return}
  if(t.id==='peName'&&S.planEdit){S.planEdit.name=t.value;return}
  if(t.id==='rnTo'){S.rename=Object.assign({from:'',to:'',plan:null},S.rename,{to:t.value});return}
  if(d&&t.dataset.f&&t.dataset.ei!=null){
    const e=d.exercises[+t.dataset.ei];if(!e)return;
    if(t.dataset.f==='name'){e.name=t.value}else{e.sets[+t.dataset.si][t.dataset.f]=t.value}
    persistDraft();
  }
});
document.addEventListener('change',ev=>{
  const t=ev.target,d=S.draft;
  if(t.id==='dDate'&&d){d.date=t.value||todayISO();persistDraft();render()}
  else if(t.id==='dUnit'&&d){d.unit=t.value;persistDraft();render()}
  else if(t.dataset.f==='name'&&d){render()}
  else if(t.id==='progEx'){S.progEx=t.value;S.progSel=null;S.progMetric=null;LS.set('tb_progEx',t.value);render()}
  else if(t.id==='peUnit'&&S.planEdit){S.planEdit.unit=t.value;render()}
  else if(t.dataset.imp!=null){S.imports[+t.dataset.imp].unit=t.value;render()}
  else if(t.id==='rnFrom'){S.rename=Object.assign({from:'',to:'',plan:null},S.rename,{from:t.value,plan:null});render()}
  else if(t.id==='bkIn'){const f=t.files&&t.files[0];if(f){f.text().then(txt=>openRestore(txt,f.name)).catch(()=>toast('Datei konnte nicht gelesen werden.'))}t.value=''}
  else if(t.id==='csvIn'){
    const files=[...t.files];
    Promise.all(files.map(f=>f.text().then(text=>{const p=parseCSV(text);return {name:f.name,rows:p.rows,hasUnit:p.hasUnit,error:p.error,unit:guessUnit(f.name)}})))
      .then(list=>{S.imports=S.imports.concat(list);render()});
  }
});
document.addEventListener('keydown',ev=>{
  if(ev.key!=='Enter')return;
  if(ev.target.id==='addEx'){ev.preventDefault();addExToDraft(ev.target.value)}
  if(ev.target.id==='peAdd'){ev.preventDefault();const b=document.querySelector('[data-act="peAdd"]');if(b)b.click()}
});

render();
function dbxFiles(){
  return [
    {name:'trainingsbuch.csv',text:'﻿'+buildCSV()},
    {name:'trainingsbuch-komplett.json',text:buildBackupJSON()}
  ];
}
if(window.DropboxBackup)DropboxBackup.init({app:'trainingsbuch',files:dbxFiles,hasData:()=>S.loaded.s&&S.sessions.size>0,restoreFile:'trainingsbuch-komplett.json',onRestoreText:text=>openRestore(text,'Sicherung aus Dropbox'),onUpdate:()=>{if(S.tab==='data'&&S.loaded.s)render()}});
initStore();
})();

if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{})})}
