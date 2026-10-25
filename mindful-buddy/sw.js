const V='mb-v1',STATE='mb-state',SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!==STATE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>{
    const net=fetch(e.request).then(r=>{if(r&&(r.ok||r.type==='opaque')){const c=r.clone();caches.open(V).then(ch=>ch.put(e.request,c))}return r}).catch(()=>hit||(e.request.mode==='navigate'?caches.match('index.html'):undefined));
    return hit||net;
  }));
});

/* Notification taps: a widget button starts that session, anything else opens the app. */
self.addEventListener('notificationclick',e=>{
  const n=e.notification,act=e.action;
  n.close();
  const url=new URL(act?'./?start='+act:(n.data&&n.data.url)||'./',self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    for(const c of cs){if('focus' in c){if(act)c.postMessage({start:act});return c.focus()}}
    return self.clients.openWindow(url);
  }));
});

/* Background refresh (Chrome on Android, installed app): keeps the pinned lock screen card current
   and sends at most one reminder a day while the app is closed. Mirrors wState() in index.html. */
const pad=x=>(x<10?'0':'')+x;
const dk=d=>d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
const toMin=t=>{const p=String(t).split(':');return (+p[0])*60+(+p[1]||0)};
const ACT={short:'Sit 15 min',full:'Full 30',deep:'Deep 45',custom:'Custom'};
function wState(sn,now){const today=dk(now),y=new Date(now);y.setDate(y.getDate()-1);
  const done=sn.last===today,alive=done||sn.last===dk(y),streak=alive?sn.streak:0,min=done?sn.lastMin:0,h=now.getHours()+now.getMinutes()/60,left=Math.max(0,24-h);
  if(done&&min>=sn.goal)return{title:'Lamp lit for today',body:min+' min sat · '+streak+'-day streak'};
  if(done)return{title:'Keep the lamp lit',body:min+' of '+sn.goal+' min today · '+streak+'-day streak'};
  if(streak>0)return{title:h>=18?'Your streak needs a sit':'Your cushion is waiting',body:h>=18?Math.ceil(left)+' h left to keep your '+streak+'-day streak':streak+'-day streak · sit today to keep it going'};
  return{title:'Light the lamp',body:'One sit today starts a new streak'}}
function quiet(q,now){if(!q||!q.on)return false;const m=now.getHours()*60+now.getMinutes(),f=toMin(q.from),t=toMin(q.to);return f<=t?(m>=f&&m<t):(m>=f||m<t)}
async function refresh(){
  const key=new URL('state.json',self.registration.scope).href,c=await caches.open(STATE),r=await c.match(key);
  if(!r)return;
  const s=await r.json(),now=new Date(),today=dk(now),base={icon:'icon-192.png',badge:'icon-192.png',data:{url:'./'}};
  if(s.pinned){const w=wState(s,now);
    await self.registration.showNotification(w.title,Object.assign({},base,{body:w.body,tag:'vp-widget',silent:true,requireInteraction:true,actions:(s.acts||['short','full']).map(a=>({action:a,title:ACT[a]}))}))}
  const al=s.alerts||{},fired=s.fired||{},m=now.getHours()*60+now.getMinutes();
  if(s.last===today||quiet(al.quiet,now))return;
  const already=p=>Object.keys(fired).some(k=>k.startsWith(p)&&k.includes(today));
  const opt=Object.assign({},base,al.style==='silent'?{silent:true}:al.style==='vibrate'?{vibrate:[200,100,200]}:{});
  let key2=null;
  const t=al.remind&&al.remind.on&&al.remind.days.includes(now.getDay())&&!already('r ')&&al.remind.times.find(t=>m>=toMin(t)&&m-toMin(t)<240);
  if(t){key2='r '+today+' '+t;await self.registration.showNotification('Time to sit',Object.assign(opt,{body:al.remind.msg||'Your cushion is waiting. Even a short sit counts.',tag:'vp-remind',actions:[{action:'short',title:'Sit 15 min'}]}))}
  else if(al.saver&&al.saver.on&&s.streak>0&&m>=toMin(al.saver.time)&&!already('s ')){key2='s '+today;
    await self.registration.showNotification('Keep your '+s.streak+'-day streak',Object.assign(opt,{body:'It ends at midnight. A short sit keeps the lamp lit.',tag:'vp-saver',actions:[{action:'short',title:'Sit 15 min'}]}))}
  if(key2){fired[key2]=1;s.fired=fired;await c.put(key,new Response(JSON.stringify(s),{headers:{'Content-Type':'application/json'}}))}
}
self.addEventListener('periodicsync',e=>{if(e.tag==='vp-refresh')e.waitUntil(refresh())});
