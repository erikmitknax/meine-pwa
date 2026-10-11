// Dropbox-Sicherung und -Wiederherstellung in jsdom, Netzwerk nachgebaut.
// Aufruf: node trainingsbuch-pwa/tests/smoke/dropbox.js [ordner-der-app]
const path=require('path'),http=require('http'),fs=require('fs'),nodeCrypto=require('crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.resolve(process.argv[2]||path.join(__dirname,'..','..'));
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.woff2':'font/woff2'};
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ok   ':'  FAIL ')+m)};const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]);const f=path.join(ROOT,p==='/'?'index.html':p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('x');return}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f))});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
  const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Not implemented/.test(e.message))errors.push(e.message)});
  const SESS={a:{date:'2026-10-01',unit:'Push',note:'',exercises:[{name:'Bankdrücken',weste:false,griffe:false,sets:[{w:'40',r:'8'}]}],updatedAt:1}};
  async function boot(dbx,fetchImpl,tab='settings',query='',open=true){
    const calls=[];
    const dom=await JSDOM.fromURL(base+'index.html'+query,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
      w.Element.prototype.scrollIntoView=function(){};w.scrollTo=function(){};
      Object.defineProperty(w,'crypto',{value:nodeCrypto.webcrypto,configurable:true});
      w.localStorage.setItem('tb_sessions',JSON.stringify(SESS));w.localStorage.setItem('tb_tab',JSON.stringify(tab));
      if(dbx)w.localStorage.setItem('dbx-trainingsbuch',JSON.stringify(dbx));
      w.fetch=async(url,opts)=>{calls.push({url,opts});return fetchImpl(url,opts)};
    }});
    await tick(2600); // Dropbox startet Auto-Backup nach 2 s
    if(open){const h=dom.window.document.querySelector('[data-act="acc"][data-id="dropbox"]');if(h&&h.getAttribute('aria-expanded')!=='true')h.click();await tick(60)}
    return {w:dom.window,d:dom.window.document,calls};
  }
  const okRes=(body='{}')=>({ok:true,status:200,json:async()=>JSON.parse(body),text:async()=>body});
  const uploads=c=>c.filter(x=>/files\/upload/.test(x.url));
  const fresh={appKey:'k',refresh:'r',access:'a',exp:Date.now()+36e5,auto:true};

  console.log('Neues Gerät (verbunden, aber noch nie gesichert): Auto-Backup bleibt aus');
  let A=await boot({...fresh},async()=>okRes());
  A.w.document.dispatchEvent(new A.w.Event('visibilitychange'));Object.defineProperty(A.d,'visibilityState',{value:'hidden',configurable:true});A.d.dispatchEvent(new A.w.Event('visibilitychange'));await tick(200);
  ok(uploads(A.calls).length===0,'kein automatischer Upload (würde sonst eine vorhandene Dropbox-Sicherung überschreiben)');
  ok(/Automatisches Sichern ist noch pausiert/.test(A.d.querySelector('#view').textContent),'Hinweis erklärt, warum');
  ok(!!A.d.querySelector('[data-dbx="restore"]'),'Button "Aus Dropbox wiederherstellen" ist da');
  A.d.querySelector('[data-dbx="backup"]').click();await tick(300);
  ok(uploads(A.calls).length===2,'"Jetzt sichern" lädt beide Dateien hoch');
  const names=uploads(A.calls).map(x=>JSON.parse(x.opts.headers['Dropbox-API-Arg']).path).sort();
  ok(names[0]==='/trainingsbuch-komplett.json'&&names[1]==='/trainingsbuch.csv','Dateinamen unverändert');
  const st=JSON.parse(A.w.localStorage.getItem('dbx-trainingsbuch'));
  ok(/^s2:[0-9a-f]{64}$/.test(st.hash),'Änderungs-Hash ist jetzt SHA-256');
  ok(!!st.last,'Zeitpunkt des letzten Backups gemerkt (ab jetzt automatisch)');

  console.log('Bestehende Verbindung (hat schon gesichert): Auto-Backup funktioniert wie vorher');
  A=await boot({...fresh,last:Date.now()-1e6,hash:'123:45'},async()=>okRes());
  ok(uploads(A.calls).length===2,'Auto-Backup nach 2 s lädt hoch (alter Hash ist anders)');

  console.log('Wiederherstellen aus Dropbox');
  const backup=JSON.stringify({app:'trainingsbuch',version:1,sessions:{a:SESS.a,b:{date:'2026-09-01',unit:'Beine',note:'',exercises:[{name:'Kniebeuge',weste:false,griffe:false,sets:[{w:'100',r:'5'}]}],updatedAt:3}},plans:{},exinfo:{},rest:{}});
  A=await boot({...fresh},async url=>/files\/download/.test(url)?okRes(backup):okRes());
  A.d.querySelector('[data-dbx="restore"]').click();await tick(300);
  const dl=A.calls.find(x=>/files\/download/.test(x.url));
  ok(!!dl&&JSON.parse(dl.opts.headers['Dropbox-API-Arg']).path==='/trainingsbuch-komplett.json'&&dl.opts.method==='POST','lädt /trainingsbuch-komplett.json per POST');
  ok(!dl.opts.headers['Content-Type'],'kein Content-Type (vermeidet unnötigen Preflight)');
  ok(/Sicherung aus Dropbox/.test(A.d.querySelector('#view').textContent)&&/1 neue Trainings/.test(A.d.querySelector('#view').textContent),'Vorschau zeigt 1 neues Training');
  A.d.querySelector('[data-act="restoreRun"]').click();await tick(200);
  ok(Object.keys(JSON.parse(A.w.localStorage.getItem('tb_sessions'))).length===2,'Training aus Dropbox ist da');
  const st2=JSON.parse(A.w.localStorage.getItem('dbx-trainingsbuch'));
  ok(st2.armed===true,'danach ist automatisches Sichern freigeschaltet');

  console.log('Fehlerfälle beim Wiederherstellen');
  A=await boot({...fresh},async url=>/files\/download/.test(url)?{ok:false,status:401,text:async()=>'{"error_summary":"missing_scope/..","error":{".tag":"missing_scope","required_scope":"files.content.read"}}',json:async()=>({})}:okRes());
  A.d.querySelector('[data-dbx="restore"]').click();await tick(300);
  ok(/files\.content\.read/.test(A.d.querySelector('#view').textContent)&&/Trennen/.test(A.d.querySelector('#view').textContent),'fehlende Berechtigung: sagt genau, was in der Dropbox-App einzustellen ist');
  A=await boot({...fresh},async url=>/files\/download/.test(url)?{ok:false,status:409,text:async()=>'{"error_summary":"path/not_found/.."}',json:async()=>({})}:okRes());
  A.d.querySelector('[data-dbx="restore"]').click();await tick(300);
  ok(/noch keine Sicherung/.test(A.d.querySelector('#view').textContent),'keine Datei in Dropbox: verständliche Meldung');

  console.log('Einrichtung: Redirect-Adresse mit Anleitung und Kopieren-Knopf');
  A=await boot(null,async()=>okRes());
  const code=A.d.querySelector('.dbx-box code');
  ok(!!code&&code.textContent===A.w.location.origin+'/','zeigt die Redirect-Adresse genau so an, wie sie an Dropbox geschickt wird');
  ok(/Redirect URIs/.test(A.d.querySelector('#view').textContent)&&/files\.content\.read/.test(A.d.querySelector('#view').textContent),'erklärt, wo sie eingetragen wird, und nennt die Leseberechtigung');
  let copied=null;Object.defineProperty(A.w.navigator,'clipboard',{value:{writeText:async t=>{copied=t}},configurable:true});
  A.d.querySelector('[data-dbx="copy"]').click();await tick(100);
  ok(copied===A.w.location.origin+'/'&&/Adresse kopiert/.test(A.d.querySelector('#view').textContent),'Kopieren-Knopf legt die Adresse in die Zwischenablage');
  const hdr=A.d.querySelector('[data-act="acc"][data-id="dropbox"]');
  ok(/Nicht verbunden/.test(hdr.textContent),'Abschnittskopf zeigt "Nicht verbunden"');

  console.log('Rückkehr von Dropbox öffnet den Dropbox-Abschnitt (auch aus anderem Tab)');
  A=await boot({appKey:'k',pending:{ver:'v',state:'s1'}},async url=>/oauth2\/token/.test(url)?{ok:true,status:200,json:async()=>({access_token:'a',refresh_token:'r',expires_in:3600}),text:async()=>''}:okRes(),'log','?code=c&state=s1',false);
  ok(/settings|Mit Dropbox verbunden/.test(A.d.querySelector('#view').textContent)&&/Mit Dropbox verbunden/.test(A.d.querySelector('#view').textContent),'Erfolgsmeldung ist sichtbar, obwohl vorher ein anderer Tab offen war');
  ok(A.d.querySelectorAll('.acc.open').length===1&&/Dropbox-Backup/.test(A.d.querySelector('.acc.open .acc-h').textContent),'nur der Dropbox-Abschnitt ist aufgeklappt');
  ok(/Verbunden/.test(A.d.querySelector('[data-act="acc"][data-id="dropbox"]').textContent),'Abschnittskopf zeigt "Verbunden"');

  ok(errors.length===0,errors.length?errors.join(' | '):'keine Fehler in der Konsole');
  console.log(`\n${pass} ok, ${fail} fehlgeschlagen`);server.close();process.exit(fail?1:0);
})().catch(e=>{console.error('ABBRUCH',e);server.close();process.exit(2)});
