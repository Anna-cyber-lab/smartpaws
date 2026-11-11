/* SmartPaws — клікабельний прототип.
   Дані демонстраційні (data.js), зберігаються в браузері (localStorage).
   Розпізнавання: CLIP ViT-B/32 у браузері (модуль у index.html) + косинусна схожість тут. */
'use strict';

const THRESH = 0.89;          // поріг схожості: підібрано калібруванням на тестових фото (#/calib)
const TODAY = new Date();
const KYIV = [50.4501, 30.5234];

/* ---------- стан ---------- */
const SEED = window.SEED;
let S;
function fresh(){ const c = JSON.parse(JSON.stringify(SEED)); delete c.photos; delete c.tests; c.extraPhotos = {}; return c; }
function load(){ try { const s = localStorage.getItem('sp_state_v2'); S = s ? JSON.parse(s) : fresh(); } catch(e){ S = fresh(); } }
function save(){ try { localStorage.setItem('sp_state_v2', JSON.stringify(S)); } catch(e){} }
function resetData(){ try { localStorage.removeItem('sp_state_v2'); for (const k in VEC) { const [id,ix] = k.split(':').map(Number); if (!(SEED.photos[id] && ix < SEED.photos[id].length)) delete VEC[k]; } localStorage.setItem('sp_vec_v1', JSON.stringify(VEC)); } catch(e){} S = fresh(); toast('Демо-дані скинуто'); go(home()); }
load();
let ME = null;
try { const u = localStorage.getItem('sp_user'); if (u) ME = S.users.find(x => x.id == u) || null; } catch(e){}

/* ---------- довідники ---------- */
const ROLE = { dispatcher:'диспетчер', inspector:'інспектор', vet:'ветеринар', volunteer:'волонтер' };
const STATUS = {
  unidentified:['неідентифікована','c-rust'], awaiting_capture:['очікує вилову','c-rust'], in_treatment:['на обробці','c-grey'],
  deferred:['відкладено','c-ochre'], processed:['оброблена','c-green'], revaccination_needed:['потрібне повторне щеплення','c-ochre'] };
const PROC = { sterilization:'стерилізація', vaccination:'щеплення від сказу', chipping:'чипування', treatment:'лікування' };
const TASKT = { capture:'вилов', revaccination:'ревакцинація', emergency:'термінова допомога' };
const TASKS = { new:['новий','c-rust'], in_progress:['у роботі','c-ochre'], done:['виконано','c-green'], failed:['не виконано','c-grey'] };
const REQS = { new:['нове','c-rust'], accepted:['прийнято','c-green'], rejected:['відхилено','c-grey'] };
const ALERT = { out_of_zone:['поза ареалом','c-rust'], revaccination:['ревакцинація','c-ochre'], age_reached:['досягнуто віку','c-green'], new_animal:['нова тварина','c-rust'] };
const SP = { dog:'собака', cat:'кіт' };

/* ---------- утиліти ---------- */
const $ = s => document.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
function d2(s){ if(!s) return '—'; const d = new Date(s); return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear(); }
function dt2(s){ if(!s) return '—'; const d = new Date(s); return d2(s)+(String(s).length>10?', '+pad(d.getHours())+':'+pad(d.getMinutes()):''); }
function nowIso(){ const d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes()); }
function todayIso(){ return nowIso().slice(0,10); }
function addDays(iso, n){ const d = new Date(iso); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function ageM(a){ if(!a.birth_date_est) return null; return Math.max(0, Math.floor((TODAY - new Date(a.birth_date_est)) / (30.44*864e5))); }
function ageTxt(a){ const m = ageM(a); if (m==null) return 'невідомо'; if (m<12) return m+' міс.'; const y=Math.floor(m/12), r=m%12; return y+' '+(y==1?'рік':y<5?'роки':'років')+(r?' '+r+' міс.':''); }
function tag(map, k){ const v = map[k] || [k,'']; return `<span class="tag ${v[1]}">${h(v[0])}</span>`; }
function uname(id){ const u = S.users.find(x => x.id == id); return u ? u.full_name : '—'; }
function urole(id){ const u = S.users.find(x => x.id == id); return u ? ROLE[u.role] : ''; }
function A(id){ return S.animals.find(a => a.id == id); }
function photosOf(id){ return [...(SEED.photos[id] || []).slice(0,1), ...((S.extraPhotos||{})[id] || [])]; }   // фото, за якими шукає розпізнавання
function galleryOf(id){ return [...(SEED.photos[id] || []).slice(0,1), ...((SEED.history||{})[id] || []), ...((S.extraPhotos||{})[id] || [])]; }   // усі фото з фіксацій для картки
function photo(id){ return photosOf(id)[0] || ''; }
function nextId(arr){ return arr.reduce((m,x) => Math.max(m, x.id), 0) + 1; }
function toast(t){ const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2400); }
function go(hash){ if (location.hash === hash) render(); else location.hash = hash; }
function sightingsOf(id){ return S.sightings.filter(s => s.animal_id == id).sort((a,b) => a.seen_at < b.seen_at ? -1 : 1); }
function lastPos(a){ const s = sightingsOf(a.id); const l = s[s.length-1]; return l ? [l.latitude, l.longitude] : [a.home_lat, a.home_lng]; }
function medOf(id){ return S.medical.filter(m => m.animal_id == id).sort((a,b) => a.procedure_date < b.procedure_date ? 1 : -1); }
function vaccUntil(id){ const v = medOf(id).filter(m => m.procedure_type=='vaccination' && m.next_vaccine_date); return v.length ? v[0].next_vaccine_date : null; }
function sterilized(id){ return medOf(id).some(m => m.procedure_type=='sterilization'); }
function vaccinatedNow(id){ const u = vaccUntil(id); return !!u && u >= todayIso(); }

/* ---------- геометрія: відстань і зона звичного перебування ---------- */
function dist(lat1, lng1, lat2, lng2){        // формула гаверсинуса, метри
  const R = 6371000, r = x => x*Math.PI/180;
  const a = Math.sin(r(lat2-lat1)/2)**2 + Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(r(lng2-lng1)/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function zoneOf(id){                           // центр — середнє останніх 10 точок, радіус охоплює 90 % точок, не менше 300 м
  let pts = sightingsOf(id).slice(-10);
  if (pts.length < 3) return null;
  // точки, позначені як «поза ареалом», не розширюють зону: відкидаємо викиди далі 3 медіан від медіанного центру
  const med = a => { const b = [...a].sort((x,y) => x-y); return b[Math.floor(b.length/2)]; };
  const mLat = med(pts.map(p => p.latitude)), mLng = med(pts.map(p => p.longitude));
  const dm = med(pts.map(p => dist(mLat,mLng,p.latitude,p.longitude)));
  const core = pts.filter(p => dist(mLat,mLng,p.latitude,p.longitude) <= Math.max(600, 3*dm));
  if (core.length >= 3) pts = core;
  const lat = pts.reduce((s,p) => s+p.latitude, 0)/pts.length, lng = pts.reduce((s,p) => s+p.longitude, 0)/pts.length;
  const d = pts.map(p => dist(lat,lng,p.latitude,p.longitude)).sort((a,b) => a-b);
  const r = Math.max(300, d[Math.min(d.length-1, Math.ceil(d.length*0.9)-1)]);
  return { lat, lng, r: Math.round(r) };
}
function checkZone(id, lat, lng){ const z = zoneOf(id); if(!z) return { z:null, d:0, out:false }; const d = dist(z.lat, z.lng, lat, lng); return { z, d:Math.round(d), out: d > z.r }; }

/* ---------- карти Leaflet ---------- */
if (!window.L){ // без інтернету Leaflet не завантажиться — заглушка, щоб решта прототипу працювала
  const chain = new Proxy(function(){}, { get:(t,k) => k==='then' ? undefined : k===Symbol.toPrimitive ? (() => 0) : chain, apply:() => chain });
  window.L = chain; window.NO_MAP = true;
}
let MAPS = [];
function killMaps(){ MAPS.forEach(m => m.remove()); MAPS = []; }
function mkMap(el, center=KYIV, zoom=11){
  if (window.NO_MAP){ const d = document.getElementById(el); if (d) d.innerHTML = '<div class="muted small" style="padding:14px">Карта OpenStreetMap недоступна без інтернету</div>'; return L; }
  const m = L.map(el, { zoomControl:true, attributionControl:true }).setView(center, zoom);
  addTiles(m);
  MAPS.push(m); return m;
}
// Підкладка карти. Сторінка відкривається з файлу (без адреси сайту), тому частина серверів карт її блокує.
// Перебираємо сервери: якщо фрагменти не вантажаться — перемикаємось на наступний.
const TILES = [
  ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', 'Esri, © OpenStreetMap contributors'],
  ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', 'Esri, © OpenStreetMap contributors'],
  ['https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap'] ];
let TILE_I = 0;
function addTiles(m){
  let errs = 0;
  const lay = L.tileLayer(TILES[TILE_I][0], { maxZoom:19, attribution:TILES[TILE_I][1] }).addTo(m);
  lay.on('tileerror', () => { if (++errs == 4 && TILE_I < TILES.length-1){ TILE_I++; m.removeLayer(lay); addTiles(m); } });
}
function pinIcon(a){ return L.divIcon({ className:'', html:`<div class="pin st-${a.status}${a.out_of_zone?' out':''}">${a.species=='dog'?'С':'К'}</div>`, iconSize:[20,20], iconAnchor:[10,10] }); }

/* ---------- маршрутизація ---------- */
const ROUTES = [
  ['login', /^#\/login$/, pLogin, null],
  ['report', /^#\/report$/, pReport, null],
  ['d', /^#\/d$/, pDash, ['dispatcher']],
  ['animals', /^#\/animals$/, pAnimals, null],
  ['animal', /^#\/animal\/(\d+)$/, pAnimal, null],
  ['edit', /^#\/animal\/(\d+)\/edit$/, pEdit, ['dispatcher','vet','inspector']],
  ['proc', /^#\/proc\/(\d+)$/, pProc, ['vet']],
  ['tasks', /^#\/tasks$/, pTasks, ['dispatcher']],
  ['requests', /^#\/requests$/, pRequests, ['dispatcher']],
  ['stats', /^#\/stats$/, pStats, ['dispatcher']],
  ['v', /^#\/v$/, pVet, ['vet']],
  ['rec', /^#\/rec$/, pRec, null],
  ['new', /^#\/new$/, pNew, null],
  ['mytasks', /^#\/my-tasks$/, pMyTasks, ['inspector']],
  ['task', /^#\/task\/(\d+)$/, pTask, ['inspector']],
  ['myreq', /^#\/my-req$/, pMyReq, ['volunteer']],
  ['reqnew', /^#\/req-new(?:\/(\d+))?$/, pReqNew, ['volunteer']],
  ['calib', /^#\/calib$/, pCalib, null],
];
function home(){ if(!ME) return '#/login'; return { dispatcher:'#/d', vet:'#/v', inspector:'#/rec', volunteer:'#/rec' }[ME.role]; }
function isMobile(){ return ME && (ME.role=='inspector' || ME.role=='volunteer'); }
let CUR = '';
function render(){
  killMaps();
  const hash = location.hash || '#/login';
  const PUBLIC = ['#/login','#/report'];
  if (!ME && !PUBLIC.includes(hash)) return go('#/login');
  if (ME && hash === '#/login') return go(home());
  let found = null, m = null;
  for (const r of ROUTES){ m = hash.match(r[1]); if (m){ found = r; break; } }
  if (!found) return go(home());
  if (found[3] && !found[3].includes(ME.role)) return go(home());
  if (found[0]=='report' && ME) return go(home());
  CUR = found[0];
  document.body.classList.toggle('mobile', !!isMobile() || found[0]=='report');
  const out = found[2](...m.slice(1));
  $('#root').innerHTML = found[0]=='login' ? out.html : found[0]=='report' ? `<div class="app"><div class="top"><a class="logo" href="#/login">Smart<b>Paws</b></a><div class="user"><a href="#/login">Вхід для працівників</a></div></div><div class="wrap">${out.html}</div></div>` : `<div class="app">${topbar()}<div class="wrap">${out.html}</div>${foot()}</div>`;
  window.scrollTo(0,0);
  if (out.after) setTimeout(out.after, 0);
}
window.addEventListener('hashchange', render);

function topbar(){
  const unread = S.alerts.filter(a => !a.is_read).length, newReq = S.requests.filter(r => r.status=='new').length;
  const myOpen = S.tasks.filter(t => t.inspector_id==ME.id && (t.status=='new'||t.status=='in_progress')).length;
  const L = {
    dispatcher:[['d','#/d','Огляд',unread],['animals','#/animals','Тварини'],['tasks','#/tasks','Наряди'],['requests','#/requests','Звернення',newReq],['stats','#/stats','Статистика']],
    vet:[['v','#/v','Пацієнти'],['animals','#/animals','Тварини'],['rec','#/rec','Пошук за фото']],
    inspector:[['rec','#/rec','Розпізнати'],['mytasks','#/my-tasks','Наряди',myOpen],['animals','#/animals','Тварини']],
    volunteer:[['rec','#/rec','Розпізнати'],['myreq','#/my-req','Звернення'],['animals','#/animals','Тварини']],
  }[ME.role];
  const on = k => CUR==k || (k=='animals' && (CUR=='animal'||CUR=='edit'||CUR=='proc')) || (k=='mytasks'&&CUR=='task') || (k=='myreq'&&CUR=='reqnew') || (k=='rec'&&CUR=='new');
  return `<div class="top"><a class="logo" href="${home()}">Smart<b>Paws</b></a>
    <nav class="nav">${L.map(x => `<a href="${x[1]}" class="${on(x[0])?'on':''}">${x[2]}${x[3]?`<span class="cnt">${x[3]}</span>`:''}</a>`).join('')}</nav>
    <div class="user">${h(ME.full_name)} · ${ROLE[ME.role]}<a href="#" onclick="logout();return false">Вийти</a></div></div>`;
}
function foot(){ return `<div class="foot"><span>Прототип SmartPaws · демонстраційні дані</span><a onclick="if(confirm('Скинути всі зміни до початкових демо-даних?'))resetData()">Скинути демо-дані</a></div>`; }
function logout(){ ME = null; try{ localStorage.removeItem('sp_user'); }catch(e){} go('#/login'); }

/* ================= ВХІД ================= */
function pLogin(){
  const q = S.users.slice(0,4);
  return { html:`<div class="app" style="max-width:1280px"><div class="login">
    <div class="l"><a class="logo">Smart<b>Paws</b></a>
      <h1 style="font-size:38px;margin-top:48px;line-height:1.2;max-width:560px">Облік безпритульних тварин Києва</h1>
      <img src="${photo(3)}" alt=""></div>
    <div class="r"><h2 style="font-size:24px;margin-bottom:28px">Вхід</h2>
      <form onsubmit="doLogin(event)" class="form">
        <div class="fld"><div class="label">E-mail</div><input id="em" type="email" required placeholder="name@smartpaws.kyiv.ua"></div>
        <div class="fld"><div class="label">Пароль</div><input id="pw" type="password" required></div>
        <div id="lerr" class="c-rust small" style="min-height:18px"></div>
        <button class="btn p" style="width:100%;margin-top:6px">Увійти</button>
      </form>
      <div class="label" style="margin-top:34px">Демо-акаунти · пароль demo123</div>
      <div class="qb">${q.map(u => `<button onclick="quick(${u.id})">${h(ROLE[u.role][0].toUpperCase()+ROLE[u.role].slice(1))}<small>${h(u.email)}</small></button>`).join('')}</div>
      <div class="hr"></div>
      <div class="label">Мешканцям міста</div>
      <a class="btn" style="width:100%;text-align:center" href="#/report">Повідомити про тварину без входу</a>
      <div class="small muted" style="margin-top:6px">Фото, місце й опис потраплять до диспетчера служби. Реєстрація не потрібна.</div>
    </div></div></div>` };
}
function quick(id){ const u = S.users.find(x => x.id==id); $('#em').value = u.email; $('#pw').value = 'demo123'; setTimeout(() => doLogin(), 250); }
function doLogin(e){
  if (e) e.preventDefault();
  const u = S.users.find(x => x.email.toLowerCase() == $('#em').value.trim().toLowerCase());
  if (!u || $('#pw').value !== 'demo123'){ $('#lerr').textContent = 'Невірний e-mail або пароль'; return; }
  ME = u; try{ localStorage.setItem('sp_user', u.id); }catch(e){}
  go(home());
}

/* ================= ДИСПЕТЧЕР: ОГЛЯД ================= */
let DF = { sp:'all', st:'all' };
function pDash(){
  const an = S.animals, dogs = an.filter(a => a.species=='dog').length;
  const vacc = an.filter(a => vaccinatedNow(a.id)).length;
  const rev = an.filter(a => a.status=='revaccination_needed').length;
  const open = S.tasks.filter(t => t.status=='new'||t.status=='in_progress').length;
  const al = [...S.alerts].sort((a,b) => (a.is_read-b.is_read) || (a.created_at<b.created_at?1:-1));
  return { html:`
    <div class="tiles">
      <div class="tile"><div class="n">${an.length}</div><div class="l">тварин в обліку · ${dogs} собак, ${an.length-dogs} котів</div></div>
      <div class="tile"><div class="n">${Math.round(vacc/an.length*100)}%</div><div class="l">з чинним щепленням від сказу</div></div>
      <div class="tile"><div class="n r">${rev}</div><div class="l">потребують ревакцинації</div></div>
      <div class="tile"><div class="n">${open}</div><div class="l">відкритих нарядів</div></div></div>
    <div class="grid2"><div>
      <div class="filters">
        ${[['all','Усі'],['dog','Собаки'],['cat','Коти']].map(x => `<button class="chip ${DF.sp==x[0]?'on':''}" onclick="DF.sp='${x[0]}';render()">${x[1]}</button>`).join('')}
        <select class="f" onchange="DF.st=this.value;render()"><option value="all">Статус: усі</option>${Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${DF.st==k?'selected':''}>${v[0]}</option>`).join('')}<option value="out" ${DF.st=='out'?'selected':''}>поза ареалом</option></select>
      </div>
      <div id="map" class="map"></div>
      <div class="legend"><span><i class="st-processed"></i>оброблена</span><span><i class="st-revaccination_needed"></i>щеплення / відкладено</span><span><i class="st-unidentified"></i>потребує уваги</span><span><i class="st-in_treatment"></i>на обробці</span><span>С — собака, К — кіт</span></div>
    </div>
    <div class="side"><h3>Сповіщення</h3>
      ${al.map(x => { const a = A(x.animal_id); return `<a class="al ${x.is_read?'read':''}" onclick="readAlert(${x.id})">
        <img src="${photo(a.id)}"><div class="t">${tag(ALERT,x.alert_type)}<br><b style="font-weight:700">${a.code}</b> · ${SP[a.species]}, ${h(a.district||'')}<div class="muted small">${h(x.message)} · ${dt2(x.created_at)}</div></div></a>`; }).join('')}
    </div></div>`,
    after(){
      const m = mkMap('map');
      S.animals.filter(a => (DF.sp=='all'||a.species==DF.sp) && (DF.st=='all'||(DF.st=='out'?a.out_of_zone:a.status==DF.st))).forEach(a => {
        L.marker(lastPos(a), { icon:pinIcon(a) }).addTo(m).bindPopup(popupHtml(a));
      });
    }};
}
function popupHtml(a){
  return `<div style="display:flex;gap:10px;width:230px"><img src="${photo(a.id)}" style="width:64px;height:64px;object-fit:cover">
  <div><b>${a.code}</b> · ${SP[a.species]}<br>${tag(STATUS,a.status)}${a.out_of_zone?' '+tag(ALERT,'out_of_zone'):''}<br><span class="muted small">${ageTxt(a)}</span>
  <div style="margin-top:6px"><a href="#/animal/${a.id}">Картка</a>${ME.role=='dispatcher'?` · <a href="#" onclick="taskModal({animal_id:${a.id}});return false">Наряд</a>`:''}</div></div></div>`;
}
function readAlert(id){ const x = S.alerts.find(a => a.id==id); x.is_read = true; save(); go('#/animal/'+x.animal_id); }

/* ================= ТВАРИНИ: СПИСОК ================= */
let AF = { q:'', sp:'all', st:'all', age:'all' };
function pAnimals(){
  const q = AF.q.trim().toLowerCase();
  const list = S.animals.filter(a => (AF.sp=='all'||a.species==AF.sp) && (AF.st=='all'||a.status==AF.st)
    && (AF.age=='all' || (()=>{const m=ageM(a); return AF.age=='lt3'?m<3:AF.age=='3to6'?(m>=3&&m<6):m>=6;})())
    && (!q || [a.code,a.chip_number,a.marks,a.district].join(' ').toLowerCase().includes(q)))
    .sort((a,b) => b.id-a.id);
  const mob = isMobile();
  return { html:`<h1 class="h1">Тварини</h1><div class="sub">${list.length} з ${S.animals.length} · пошук за кодом, номером чипа, прикметами або районом</div>
    <div class="filters">
      <input class="f" style="flex:1;min-width:180px" placeholder="Пошук…" value="${h(AF.q)}" oninput="AF.q=this.value;clearTimeout(window._q);window._q=setTimeout(()=>{render();const i=document.querySelector('.filters input');i.focus();i.setSelectionRange(i.value.length,i.value.length)},300)">
      <select class="f" onchange="AF.sp=this.value;render()"><option value="all">Вид: усі</option><option value="dog" ${AF.sp=='dog'?'selected':''}>собаки</option><option value="cat" ${AF.sp=='cat'?'selected':''}>коти</option></select>
      <select class="f" onchange="AF.st=this.value;render()"><option value="all">Статус: усі</option>${Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${AF.st==k?'selected':''}>${v[0]}</option>`).join('')}</select>
      <select class="f" onchange="AF.age=this.value;render()"><option value="all">Вік: усі</option><option value="lt3" ${AF.age=='lt3'?'selected':''}>до 3 міс.</option><option value="3to6" ${AF.age=='3to6'?'selected':''}>3–6 міс.</option><option value="gt6" ${AF.age=='gt6'?'selected':''}>від 6 міс.</option></select>
    </div>
    <table class="t"><tr><th></th><th>Код</th>${mob?'':'<th>Вид</th><th>Вік</th><th>Район</th><th>Чип</th><th>Щеплення до</th>'}<th>Статус</th></tr>
    ${list.map(a => `<tr class="click" onclick="go('#/animal/${a.id}')"><td><img src="${photo(a.id)}"></td><td><b>${a.code}</b>${mob?`<div class="muted small">${SP[a.species]} · ${ageTxt(a)}</div>`:''}</td>
      ${mob?'':`<td>${SP[a.species]}</td><td>${ageTxt(a)}</td><td>${h(a.district||'—')}</td><td class="small">${a.chip_number||'—'}</td><td>${d2(vaccUntil(a.id))}</td>`}
      <td>${tag(STATUS,a.status)}${a.out_of_zone?'<br>'+tag(ALERT,'out_of_zone'):''}</td></tr>`).join('')}</table>` };
}

/* ================= КАРТКА ТВАРИНИ ================= */
let TAB = 'route', CF = 'all';
function pAnimal(id){
  const a = A(id); if(!a) return { html:'<p>Тварину не знайдено.</p>' };
  const ph = galleryOf(a.id), z = zoneOf(a.id), cms = S.comments.filter(c => c.animal_id==a.id).sort((x,y) => x.created_at<y.created_at?1:-1);
  const med = medOf(a.id), sg = sightingsOf(a.id);
  const R = ME.role;
  const btns = [
    R=='vet' ? `<a class="btn r" href="#/proc/${a.id}">+ Процедура</a>` : '',
    R=='dispatcher' ? `<button class="btn r" onclick="taskModal({animal_id:${a.id}})">Створити наряд</button>` : '',
    R=='volunteer' ? `<a class="btn r" href="#/req-new/${a.id}">Подати звернення</a>` : '',
    R!='volunteer' ? `<a class="btn" href="#/animal/${a.id}/edit">Редагувати</a>` : '' ].join(' ');
  return { html:`<div class="small muted" style="margin-bottom:10px"><a href="#/animals">← Тварини</a></div>
  <div class="card"><div><img class="main-photo" id="mph" src="${ph[0]}">
    ${ph.length>1 ? `<div class="thumbs">${ph.map(p => `<img src="${p}" onclick="document.getElementById('mph').src=this.src">`).join('')}</div><div class="small muted" style="margin-top:4px">${ph.length} фото з фіксацій</div>` : ''}</div>
  <div><h1 class="h1" style="font-size:30px">${a.code}</h1>${tag(STATUS,a.status)} ${a.out_of_zone?tag(ALERT,'out_of_zone'):''}
    <dl class="kv"><dt>Вид, стать</dt><dd>${SP[a.species]}, ${a.gender=='male'?'самець':a.gender=='female'?'самиця':'невідомо'}</dd>
      <dt>Вік (орієнтовно)</dt><dd>${ageTxt(a)}</dd>
      <dt>Прикмети</dt><dd>${h(a.marks||'—')}</dd>
      <dt>Мікрочип</dt><dd>${a.chip_number?a.chip_number+' <span class="muted small">від '+d2(a.chip_date)+'</span>':'немає'}</dd>
      <dt>Стерилізація</dt><dd>${sterilized(a.id)?'так':'ні'}</dd>
      <dt>Щеплення діє до</dt><dd>${d2(vaccUntil(a.id))}</dd>
      <dt>Зона перебування</dt><dd>${h(a.district||'')}${z?', радіус '+z.r+' м':' — ще не визначена (мало фіксацій)'}</dd>
      <dt>У системі з</dt><dd>${d2(a.created_at)}</dd></dl>
    <div class="row">${btns}</div></div></div>
  <div class="tabs">${[['route','Маршрут ('+sg.length+')'],['med','Медична історія ('+med.length+')'],['cm','Коментарі ('+cms.length+')']].map(t => `<a class="${TAB==t[0]?'on':''}" onclick="TAB='${t[0]}';render()">${t[1]}</a>`).join('')}</div>
  ${TAB=='route' ? `<div id="amap" class="map sm"></div>
     <table class="t" style="margin-top:12px"><tr><th>Дата</th><th>Координати</th><th>Джерело</th><th>Хто</th></tr>
     ${[...sg].reverse().map(s => `<tr><td>${dt2(s.seen_at)}</td><td class="small">${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}</td><td>${s.location_source=='gps'?'GPS':'точка на карті'}</td><td>${h(uname(s.user_id))} <span class="muted small">${urole(s.user_id)}</span></td></tr>`).join('')}</table>`
   : TAB=='med' ? (med.length ? `<table class="t"><tr><th>Дата</th><th>Процедура</th><th>Препарат, серія</th><th>Наступне щеплення</th><th>Лікар</th></tr>
     ${med.map(m => `<tr><td>${d2(m.procedure_date)}</td><td>${PROC[m.procedure_type]}</td><td>${h([m.drug_name,m.drug_series].filter(Boolean).join(', ')||'—')}</td><td>${d2(m.next_vaccine_date)}</td><td>${h(uname(m.vet_id))}</td></tr>`).join('')}</table>` : '<p class="muted">Процедур ще не було.</p>')
   : `<form onsubmit="addComment(event,${a.id})" class="row" style="margin-bottom:10px"><input id="cmt" class="f" style="flex:1;padding:8px" placeholder="Додати коментар…" required><button class="btn p">Додати</button></form>
     <div class="filters">${[['all','Усі'],['dispatcher','Диспетчер'],['inspector','Інспектор'],['vet','Ветеринар'],['volunteer','Волонтер']].map(x => `<button class="chip ${CF==x[0]?'on':''}" onclick="CF='${x[0]}';render()">${x[1]} (${x[0]=='all'?cms.length:cms.filter(c => (S.users.find(u => u.id==c.user_id)||{}).role==x[0]).length})</button>`).join('')}</div>
     ${cms.filter(c => CF=='all' || (S.users.find(u => u.id==c.user_id)||{}).role==CF).map(c => `<div class="cm">${h(c.text)}<div class="a">${h(uname(c.user_id))} · ${urole(c.user_id)} · ${dt2(c.created_at)}</div></div>`).join('') || '<p class="muted">Коментарів немає.</p>'}`}`,
  after(){
    if (TAB!='route') return;
    const m = mkMap('amap', [a.home_lat,a.home_lng], 14), pts = sg.map(s => [s.latitude, s.longitude]);
    if (z) L.circle([z.lat,z.lng], { radius:z.r, color:'#8A857C', weight:1, dashArray:'4 4', fillColor:'#6E8B5E', fillOpacity:.08 }).addTo(m);
    if (pts.length>1) L.polyline(pts, { color:'#2B2A28', weight:1.2, opacity:.6 }).addTo(m);
    sg.forEach((s,i) => L.circleMarker([s.latitude,s.longitude], { radius:i==sg.length-1?6:4, color:'#F4EFE6', weight:1.5, fillColor:i==sg.length-1?'#B5502F':'#2B2A28', fillOpacity:1 }).addTo(m).bindTooltip(dt2(s.seen_at)));
    if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom:15 });
  }};
}
function addComment(e, id){ e.preventDefault(); const t = $('#cmt').value.trim(); if(!t) return; pushComment(id, t); save(); toast('Коментар додано'); render(); }
function pushComment(id, text){ if (text && text.trim()) S.comments.push({ id:nextId(S.comments), animal_id:+id, user_id:ME.id, text:text.trim(), created_at:nowIso() }); }

/* ================= РЕДАГУВАННЯ КАРТКИ ================= */
function pEdit(id){
  const a = A(id);
  return { html:`<div class="small muted" style="margin-bottom:10px"><a href="#/animal/${a.id}">← ${a.code}</a></div><h1 class="h1">Редагування ${a.code}</h1><div class="sub">Зміни зберігаються в картці; коментар — в історії тварини.</div>
  <form class="form" onsubmit="saveEdit(event,${a.id})">
    <div class="fld"><div class="label">Вид</div><div class="radios"><label><input type="radio" name="sp" value="dog" ${a.species=='dog'?'checked':''}> собака</label><label><input type="radio" name="sp" value="cat" ${a.species=='cat'?'checked':''}> кіт</label></div></div>
    <div class="fld"><div class="label">Стать</div><select id="g"><option value="male" ${a.gender=='male'?'selected':''}>самець</option><option value="female" ${a.gender=='female'?'selected':''}>самиця</option><option value="unknown" ${a.gender=='unknown'?'selected':''}>невідомо</option></select></div>
    <div class="fld"><div class="label">Орієнтовний вік, міс.</div><input id="age" type="number" min="0" max="240" value="${ageM(a)??''}"><div class="hint">Система зберігає орієнтовну дату народження і рахує вік автоматично.</div></div>
    <div class="fld"><div class="label">Прикмети</div><textarea id="mk" rows="2">${h(a.marks||'')}</textarea></div>
    ${ME.role=='inspector' ? `<div class="note">Статус змінюється автоматично — через закриття наряду або ветеринарну процедуру. Вручну його змінюють диспетчер і ветеринар.</div>`
      : `<div class="fld"><div class="label">Статус</div><select id="st" onchange="document.getElementById('ech').textContent=this.value!='${a.status}'?'Зміна статусу вручну — вкажіть причину (обов’язково).':''">${Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${a.status==k?'selected':''}>${v[0]}</option>`).join('')}</select></div>`}
    <div class="fld"><div class="label">Коментар до змін</div><textarea id="ec" rows="2" placeholder="Необов'язково, якщо статус не змінюється"></textarea><div id="ech" class="hint c-rust"></div></div>
    <div class="row"><button class="btn p">Зберегти</button><a class="btn" href="#/animal/${a.id}">Скасувати</a></div>
  </form>` };
}
function saveEdit(e, id){
  e.preventDefault(); const a = A(id);
  const st = $('#st') ? $('#st').value : a.status, c = $('#ec').value.trim();
  if (st != a.status && !c){ $('#ech').textContent = 'Зміна статусу вручну — вкажіть причину (обов\'язково).'; $('#ec').focus(); return; }
  a.species = document.querySelector('input[name=sp]:checked').value; a.gender = $('#g').value; a.marks = $('#mk').value.trim();
  if (st != a.status){ pushComment(id, 'Статус змінено вручну: «'+STATUS[a.status][0]+'» → «'+STATUS[st][0]+'». Причина: '+c); a.status = st; save(); toast('Картку оновлено'); return go('#/animal/'+id); }
  const m = parseInt($('#age').value); if (!isNaN(m)) a.birth_date_est = addDays(todayIso(), -Math.round(m*30.44));
  pushComment(id, $('#ec').value); save(); toast('Картку оновлено'); go('#/animal/'+id);
}

/* ================= ВЕТЕРИНАР ================= */
let VQ = '';
function pVet(){
  const byChip = VQ.length>=4 ? S.animals.filter(a => a.chip_number && a.chip_number.includes(VQ)) : [];
  const queue = S.animals.filter(a => ['in_treatment','revaccination_needed','deferred'].includes(a.status));
  const recent = [...S.medical].sort((a,b) => a.procedure_date<b.procedure_date?1:-1).slice(0,6);
  const row = a => `<tr class="click" onclick="go('#/animal/${a.id}')"><td><img src="${photo(a.id)}"></td><td><b>${a.code}</b></td><td>${SP[a.species]}, ${ageTxt(a)}</td><td>${a.chip_number||'—'}</td><td>${tag(STATUS,a.status)}</td><td><a class="btn s" href="#/proc/${a.id}" onclick="event.stopPropagation()">Процедура</a></td></tr>`;
  return { html:`<h1 class="h1">Пацієнти</h1><div class="sub">Пошук за номером мікрочипа (зчитується сканером WL-134) або за фото.</div>
    <div class="row" style="margin-bottom:8px"><input id="vq" class="f" style="width:320px;padding:8px" placeholder="Номер чипа, 15 цифр" value="${h(VQ)}" oninput="VQ=this.value.replace(/\\D/g,'');clearTimeout(window._v);window._v=setTimeout(()=>{render();const i=document.getElementById('vq');i.focus();i.setSelectionRange(i.value.length,i.value.length)},300)">
      <a class="btn" href="#/rec">Знайти за фото</a></div>
    ${VQ.length>=4 ? (byChip.length ? `<table class="t" style="margin-bottom:24px">${byChip.map(row).join('')}</table>` : `<div class="note">Тварину з таким чипом не знайдено. Якщо чипа немає — імплантуйте новий у формі процедури.</div>`) : ''}
    <h3 class="serif" style="font-size:18px;margin:18px 0 8px">Потребують уваги</h3>
    <table class="t"><tr><th></th><th>Код</th><th>Вид, вік</th><th>Чип</th><th>Статус</th><th></th></tr>${queue.map(row).join('')}</table>
    <h3 class="serif" style="font-size:18px;margin:26px 0 8px">Останні процедури</h3>
    <table class="t"><tr><th>Дата</th><th>Тварина</th><th>Процедура</th><th>Препарат</th></tr>${recent.map(m => `<tr class="click" onclick="go('#/animal/${m.animal_id}')"><td>${d2(m.procedure_date)}</td><td>${A(m.animal_id).code}</td><td>${PROC[m.procedure_type]}</td><td>${h(m.drug_name||'—')}</td></tr>`).join('')}</table>` };
}
function pProc(id){
  const a = A(id);
  return { html:`<div class="small muted" style="margin-bottom:10px"><a href="#/animal/${a.id}">← ${a.code}</a></div>
  <div style="display:grid;grid-template-columns:200px 1fr;gap:28px"><div><img src="${photo(a.id)}" style="width:200px;height:200px;object-fit:cover"><div class="small" style="margin-top:8px"><b>${a.code}</b> · ${SP[a.species]}<br>вік ${ageTxt(a)}<br>чип: ${a.chip_number||'немає'}</div></div>
  <div><h1 class="h1">Нова процедура</h1><div class="sub">Вікові рекомендації: щеплення від 3 міс., стерилізація від 6 міс. Нештатні випадки — з коментарем.</div>
  <form class="form" onsubmit="saveProc(event,${a.id})">
    <div class="fld"><div class="label">Тип процедури</div><div class="radios">${Object.entries(PROC).map(([k,v],i) => `<label><input type="radio" name="pt" value="${k}" ${i==1?'checked':''} onchange="procCheck(${a.id})"> ${v}</label>`).join('')}</div></div>
    <div id="pwarn"></div>
    <div class="fld" id="f-drug"><div class="label">Препарат</div><input id="drug" list="drugs" placeholder="Напр., Nobivac Rabies"><datalist id="drugs"><option>Nobivac Rabies</option><option>Rabisin</option><option>Біокан R</option></datalist></div>
    <div class="fld" id="f-ser"><div class="label">Серія препарату</div><input id="ser"></div>
    <div class="fld" id="f-chip" style="display:none"><div class="label">Номер мікрочипа (ISO 11784, 15 цифр)</div><input id="chip" maxlength="15" placeholder="${a.chip_number?'Чип уже є: '+a.chip_number:'804098100000000'}"><div class="hint">Система перевіряє унікальність номера.</div></div>
    <div class="fld"><div class="label">Дата процедури</div><input id="pd" type="date" value="${todayIso()}"></div>
    <div class="fld"><div class="label">Коментар</div><textarea id="pc" rows="3" placeholder="Стан тварини, реакція, причина відступу від рекомендацій…"></textarea></div>
    <div class="note" id="pnext"></div>
    <div class="row"><button class="btn r">Зберегти процедуру</button><a class="btn" href="#/animal/${a.id}">Скасувати</a></div>
  </form></div></div>`, after(){ procCheck(a.id); } };
}
function procCheck(id){
  const a = A(id), t = document.querySelector('input[name=pt]:checked').value, m = ageM(a);
  let w = '';
  if (a.status!='in_treatment') w = `Тварина не значиться в клініці (статус: ${STATUS[a.status][0]}). Вкажіть у коментарі, як вона потрапила до вас.`;
  if (m!=null){
  if (t=='vaccination' && m<3) w = (w?w+'<br>':'')+`Тварині ${m} міс. Щеплення від сказу рекомендовано з 3 місяців. Якщо проводите — вкажіть причину в коментарі.`;
  if (t=='sterilization' && m<6) w = (w?w+'<br>':'')+`Тварині ${m} міс. Стерилізацію рекомендовано з 6 місяців. Якщо проводите — вкажіть причину в коментарі.`;
  }
  $('#pwarn').innerHTML = w ? `<div class="warn">${w}</div>` : '';
  $('#pc').required = !!w;
  $('#f-drug').style.display = $('#f-ser').style.display = (t=='vaccination'||t=='treatment') ? '' : 'none';
  $('#f-chip').style.display = t=='chipping' ? '' : 'none';
  $('#pnext').textContent = t=='vaccination' ? 'Дата наступного щеплення буде встановлена автоматично: +365 днів від дати процедури.' : 'Після збереження статус тварини оновиться автоматично.';
}
function saveProc(e, id){
  e.preventDefault(); const a = A(id), t = document.querySelector('input[name=pt]:checked').value, date = $('#pd').value || todayIso();
  if (t=='chipping'){
    const c = $('#chip').value.trim();
    if (!/^\d{15}$/.test(c)){ toast('Номер чипа має містити 15 цифр'); return; }
    if (S.animals.some(x => x.chip_number==c && x.id!=a.id)){ toast('Цей номер чипа вже належить іншій тварині'); return; }
    a.chip_number = c; a.chip_date = date;
  }
  S.medical.push({ id:nextId(S.medical), animal_id:a.id, vet_id:ME.id, procedure_type:t, drug_name:$('#drug').value||null, drug_series:$('#ser').value||null, procedure_date:date, next_vaccine_date: t=='vaccination'?addDays(date,365):null, notes:$('#pc').value });
  if (t=='vaccination') a.status = 'processed';
  if (t=='sterilization' && a.status!='processed') a.status = vaccinatedNow(a.id) ? 'processed' : 'in_treatment';
  pushComment(a.id, $('#pc').value);
  save(); toast(t=='vaccination' ? 'Збережено. Наступне щеплення: '+d2(addDays(date,365)) : 'Процедуру збережено'); TAB='med'; go('#/animal/'+a.id);
}

/* ================= НАРЯДИ (диспетчер) ================= */
let TF = 'open';
function pTasks(){
  const list = S.tasks.filter(t => TF=='all' || (TF=='open' ? (t.status=='new'||t.status=='in_progress') : t.status==TF)).sort((a,b) => b.id-a.id);
  return { html:`<div class="row" style="justify-content:space-between"><div><h1 class="h1">Наряди</h1><div class="sub">Завдання для служби вилову: вилов, ревакцинація, термінова допомога.</div></div><button class="btn r" onclick="taskModal({})">Новий наряд</button></div>
  <div class="filters">${[['open','Відкриті'],['done','Виконані'],['failed','Не виконані'],['all','Усі']].map(x => `<button class="chip ${TF==x[0]?'on':''}" onclick="TF='${x[0]}';render()">${x[1]}</button>`).join('')}</div>
  <table class="t"><tr><th>№</th><th></th><th>Тварина</th><th>Тип</th><th>Адреса</th><th>Виконавець</th><th>Термін</th><th>Стан</th></tr>
  ${list.map(t => { const a = A(t.animal_id); return `<tr class="click" onclick="go('#/animal/${a.id}')"><td>${t.id}</td><td><img src="${photo(a.id)}"></td><td><b>${a.code}</b><div class="muted small">${SP[a.species]}</div></td><td>${TASKT[t.task_type]}${t.request_id?'<div class="muted small">за зверненням №'+t.request_id+'</div>':''}</td><td>${h(t.address)}</td><td>${h(uname(t.inspector_id))}</td><td>${d2(t.due_date)}</td><td>${tag(TASKS,t.status)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">Нарядів немає</td></tr>'}</table>` };
}
function taskModal(o){
  const insp = S.users.filter(u => u.role=='inspector');
  const a = o.animal_id ? A(o.animal_id) : null;
  const div = document.createElement('div'); div.className = 'modal-bg'; div.id = 'mbg';
  div.innerHTML = `<div class="modal"><h2 class="serif" style="font-size:20px;margin-bottom:14px">Новий наряд</h2>
   <form onsubmit="saveTask(event,${o.request_id||'null'})">
    <div class="fld"><div class="label">Тварина</div><select id="ta">${S.animals.map(x => `<option value="${x.id}" ${a&&a.id==x.id?'selected':''}>${x.code} · ${SP[x.species]} · ${x.district||''}</option>`).join('')}</select></div>
    <div class="fld"><div class="label">Тип</div><select id="tt">${Object.entries(TASKT).map(([k,v]) => `<option value="${k}" ${a&&a.status=='revaccination_needed'&&k=='revaccination'?'selected':''}>${v}</option>`).join('')}</select></div>
    <div class="fld"><div class="label">Адреса виїзду</div><input id="tad" required value="${h(o.address||(a?(a.district||'')+', остання точка фіксації':''))}"></div>
    <div class="fld"><div class="label">Виконавець</div><select id="ti">${insp.map(u => `<option value="${u.id}">${h(u.full_name)}</option>`).join('')}</select></div>
    <div class="fld"><div class="label">Плановий термін</div><input id="td" type="date" value="${addDays(todayIso(),2)}"></div>
    <div class="fld"><div class="label">Коментар для інспектора</div><textarea id="tc" rows="2"></textarea></div>
    <div class="row"><button class="btn r">Створити</button><button type="button" class="btn" onclick="document.getElementById('mbg').remove()">Скасувати</button></div>
   </form></div>`;
  div.addEventListener('click', e => { if (e.target===div) div.remove(); });
  document.body.appendChild(div);
}
function saveTask(e, reqId){
  e.preventDefault(); const aid = +$('#ta').value, a = A(aid);
  S.tasks.push({ id:nextId(S.tasks), animal_id:aid, request_id:reqId, dispatcher_id:ME.id, inspector_id:+$('#ti').value, task_type:$('#tt').value, address:$('#tad').value, due_date:$('#td').value, status:'new', created_at:nowIso(), completed_at:null });
  if (a.status=='unidentified') a.status = 'awaiting_capture';
  if (reqId){ const r = S.requests.find(x => x.id==reqId); r.status = 'accepted'; }
  pushComment(aid, $('#tc').value);
  save(); $('#mbg').remove(); toast('Наряд створено'); render();
}

/* ================= ЗВЕРНЕННЯ (диспетчер) ================= */
function pRequests(){
  const list = [...S.requests].sort((a,b) => (a.status=='new'?0:1)-(b.status=='new'?0:1) || (a.created_at<b.created_at?1:-1));
  return { html:`<h1 class="h1">Звернення</h1><div class="sub">Повідомлення волонтерів і мешканців. Прийняте звернення стає нарядом.</div>
  ${list.map(r => { const a = r.animal_id ? A(r.animal_id) : null; return `<div style="display:grid;grid-template-columns:90px 1fr 220px;gap:16px;border-top:1px solid var(--line);padding:14px 0">
    ${(r.photo||a) ? `<img src="${r.photo || photo(a.id)}" style="width:90px;height:90px;object-fit:cover">` : '<div style="width:90px;height:90px;border:1px dashed var(--line)"></div>'}
    <div><div class="row">${tag(REQS,r.status)} <span class="muted small">№${r.id} · ${dt2(r.created_at)} · ${r.author_id ? h(uname(r.author_id))+', '+urole(r.author_id) : 'мешканець, без реєстрації'+(r.contact_phone?' · тел. '+h(r.contact_phone):'')}</span></div>
      <p style="margin:6px 0">${h(r.description)}</p>${a?`<a class="small" href="#/animal/${a.id}">${a.code} · ${SP[a.species]}</a>`:'<span class="small muted">тварина не визначена</span>'}</div>
    <div style="text-align:right">${r.status=='new' && !a && r.photo ? `<button class="btn s" style="margin-bottom:6px" onclick="reqRecog(${r.id})">Розпізнати за фото</button><br>` : ''}${r.status=='new' ? `<button class="btn r s" onclick="taskModal({animal_id:${r.animal_id||'null'},request_id:${r.id}})">Прийняти → наряд</button><br><button class="btn s" style="margin-top:6px" onclick="rejectReq(${r.id})">Відхилити</button>` : ''}</div></div>`; }).join('')}` };
}
function rejectReq(id){ const r = S.requests.find(x => x.id==id); r.status = 'rejected'; save(); toast('Звернення відхилено'); render(); }

/* ================= СТАТИСТИКА ================= */
function statRows(){
  return ['dog','cat'].map(sp => { const L = S.animals.filter(a => a.species==sp);
    return { sp, n:L.length, ster:L.filter(a => sterilized(a.id)).length, vac:L.filter(a => vaccinatedNow(a.id)).length,
      rev:L.filter(a => a.status=='revaccination_needed').length, unid:L.filter(a => a.status=='unidentified'||a.status=='awaiting_capture').length,
      def:L.filter(a => a.status=='deferred').length, chip:L.filter(a => a.chip_number).length }; });
}
function pStats(){
  const R = statRows(), pc = (a,b) => b ? Math.round(a/b*100) : 0;
  const bar = (label, v, n, col) => `<div class="b"><span>${label}</span><div class="track"><div class="fill" style="width:${pc(v,n)}%;background:${col}"></div></div><span>${pc(v,n)}%</span></div>`;
  return { html:`<div class="row" style="justify-content:space-between"><div><h1 class="h1">Статистика</h1><div class="sub">Облік окремо для собак і котів станом на ${d2(todayIso())}.</div></div><button class="btn" onclick="exportCsv()">Завантажити CSV</button></div>
  <table class="t"><tr><th>Показник</th><th>Собаки</th><th>Коти</th><th>Разом</th></tr>
  ${[['n','Тварин в обліку'],['ster','Стерилізовані'],['vac','З чинним щепленням'],['chip','Чиповані'],['rev','Потребують ревакцинації'],['def','Відкладені за віком'],['unid','Неідентифіковані / очікують вилову']].map(([k,l]) => `<tr><td>${l}</td><td>${R[0][k]}</td><td>${R[1][k]}</td><td>${R[0][k]+R[1][k]}</td></tr>`).join('')}</table>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:28px">${R.map(r => `<div><h3 class="serif" style="font-size:18px;margin-bottom:6px">${r.sp=='dog'?'Собаки':'Коти'}</h3><div class="bars">
    ${bar('Стерилізовані',r.ster,r.n,'var(--green)')}${bar('З чинним щепленням',r.vac,r.n,'var(--green)')}${bar('Чиповані',r.chip,r.n,'var(--pencil)')}${bar('Потребують ревакцинації',r.rev,r.n,'var(--ochre)')}${bar('Неідентифіковані',r.unid,r.n,'var(--rust)')}</div></div>`).join('')}</div>` };
}
function exportCsv(){
  const rows = [['Код','Вид','Стать','Вік, міс.','Район','Статус','Стерилізація','Щеплення до','Чип']].concat(S.animals.map(a => [a.code,SP[a.species],a.gender,ageM(a),a.district||'',STATUS[a.status][0],sterilized(a.id)?'так':'ні',vaccUntil(a.id)||'',a.chip_number||'']));
  const csv = '﻿' + rows.map(r => r.map(x => '"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\n');
  const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); l.download = 'smartpaws_звіт_'+todayIso()+'.csv'; l.click();
}

/* ================= ІНСПЕКТОР: НАРЯДИ ================= */
function pMyTasks(){
  const list = S.tasks.filter(t => t.inspector_id==ME.id).sort((a,b) => { const o = {in_progress:0,new:1,failed:2,done:3}; return o[a.status]-o[b.status] || (a.due_date<b.due_date?-1:1); });
  return { html:`<h1 class="h1">Мої наряди</h1><div class="sub">${list.filter(t => t.status=='new'||t.status=='in_progress').length} відкритих</div>
  ${list.map(t => { const a = A(t.animal_id); return `<a href="#/task/${t.id}" style="display:flex;gap:12px;border-top:1px solid var(--line);padding:12px 0;text-decoration:none">
    <img src="${photo(a.id)}" style="width:64px;height:64px;object-fit:cover"><div style="flex:1"><div class="row" style="justify-content:space-between"><b>${TASKT[t.task_type]} · ${a.code}</b>${tag(TASKS,t.status)}</div>
    <div class="small">${h(t.address)}</div><div class="muted small">до ${d2(t.due_date)}</div></div></a>`; }).join('') || '<p class="muted">Нарядів немає.</p>'}` };
}
function pTask(id){
  const t = S.tasks.find(x => x.id==id), a = A(t.animal_id), z = zoneOf(a.id), open = t.status=='new'||t.status=='in_progress';
  return { html:`<div class="small muted" style="margin-bottom:10px"><a href="#/my-tasks">← Мої наряди</a></div>
  <h1 class="h1">Наряд №${t.id}</h1><div class="row" style="margin-bottom:12px">${tag(TASKS,t.status)} <span class="muted small">${TASKT[t.task_type]} · до ${d2(t.due_date)}</span></div>
  <img src="${photo(a.id)}" class="preview">
  <dl class="kv"><dt>Тварина</dt><dd><a href="#/animal/${a.id}">${a.code}</a> · ${SP[a.species]}, ${ageTxt(a)}</dd><dt>Прикмети</dt><dd>${h(a.marks)}</dd><dt>Адреса</dt><dd>${h(t.address)}</dd><dt>Зона</dt><dd>${z?'радіус '+z.r+' м':'—'}</dd></dl>
  <div id="tmap" class="map sm"></div>
  ${open ? `<div class="fld" style="margin-top:14px"><div class="label">Коментар</div><textarea id="tcm" rows="2" placeholder="Як пройшов виїзд, особливості тварини…"></textarea></div>
  <div class="row">${t.status=='new'?`<button class="btn" onclick="taskSt(${t.id},'in_progress')">Взяти в роботу</button>`:''}
    <button class="btn r" onclick="taskSt(${t.id},'done')">Доставлено до клініки</button><button class="btn" onclick="taskSt(${t.id},'failed')">Не виконано</button></div>
  <div class="note">Перед доставкою підтвердіть тварину фото на вкладці «Розпізнати».</div>` : `<div class="note">Наряд закрито ${dt2(t.completed_at)}.</div>`}`,
  after(){ const m = mkMap('tmap', lastPos(a), 15); if (z) L.circle([z.lat,z.lng], { radius:z.r, color:'#8A857C', weight:1, dashArray:'4 4', fillOpacity:.06 }).addTo(m); L.marker(lastPos(a), { icon:pinIcon(a) }).addTo(m); } };
}
function taskSt(id, st){
  const t = S.tasks.find(x => x.id==id), a = A(t.animal_id), c = ($('#tcm')||{}).value || '';
  if (st=='failed' && !c.trim()){ toast('Вкажіть у коментарі, чому наряд не виконано'); $('#tcm').focus(); return; }
  t.status = st; if (st!='in_progress') t.completed_at = nowIso();
  if (st=='done') a.status = 'in_treatment';
  pushComment(a.id, c); save(); toast({in_progress:'Наряд у роботі', done:'Тварину передано до клініки', failed:'Наряд закрито як невиконаний'}[st]); render();
}

/* ================= ВОЛОНТЕР: ЗВЕРНЕННЯ ================= */
function pMyReq(){
  const list = S.requests.filter(r => r.author_id==ME.id).sort((a,b) => a.created_at<b.created_at?1:-1);
  return { html:`<div class="row" style="justify-content:space-between"><h1 class="h1">Мої звернення</h1><a class="btn r" href="#/req-new">Нове</a></div>
  ${list.map(r => { const a = r.animal_id ? A(r.animal_id) : null; return `<div style="display:flex;gap:12px;border-top:1px solid var(--line);padding:12px 0">
    <img src="${r.photo || (a?photo(a.id):'')}" style="width:64px;height:64px;object-fit:cover"><div><div class="row">${tag(REQS,r.status)} <span class="muted small">${dt2(r.created_at)}</span></div><div class="small" style="margin-top:4px">${h(r.description)}</div>${a?`<a class="small" href="#/animal/${a.id}">${a.code}</a>`:''}</div></div>`; }).join('') || '<p class="muted">Звернень ще немає.</p>'}` };
}

function pReqNew(aid){
  const a = aid ? A(aid) : null; P.RQ = { lat:null, lng:null, src:null, photo:null };
  return { html:`<div class="small muted" style="margin-bottom:10px"><a href="#/my-req">← Мої звернення</a></div><h1 class="h1">Нове звернення</h1>
  <div class="sub">${a?'Щодо '+a.code+' · '+SP[a.species]:'Опишіть проблему — диспетчер розгляне звернення і за потреби створить наряд.'}</div>
  <form onsubmit="saveReq(event,${aid||'null'})">
    <div class="fld"><div class="label">Що сталося</div><textarea id="rd" rows="4" required placeholder="Тварина травмована / агресивна / потребує допомоги…"></textarea></div>
    <div class="fld"><div class="label">Фото (необов'язково)</div>${photoPicker('cbReq')}<div id="rph"></div></div>
    <div class="fld"><div class="label">Місце</div>${locBlock('RQ')}</div>
    <button class="btn r" style="width:100%">Надіслати</button>
  </form>`, after(){ locInit('RQ'); } };
}
function saveReq(e, aid){
  e.preventDefault();
  if (P.RQ.lat==null){ needLoc('RQ'); return; }
  S.requests.push({ id:nextId(S.requests), author_id:ME.id, source:'volunteer', contact_phone:null, animal_id:aid, description:$('#rd').value.trim(), photo:P.RQ.photo, latitude:P.RQ.lat, longitude:P.RQ.lng, status:'new', created_at:nowIso() });
  save(); toast('Звернення надіслано диспетчеру'); go('#/my-req');
}

/* ================= МІСЦЕ: GPS або точка на карті ================= */
const LOC = {};
function locBlock(key){
  return `<div class="row"><button type="button" class="btn s" onclick="gps('${key}')">Визначити за GPS</button><span class="small muted">або торкніться карти</span></div>
   <div id="loc-${key}" class="small" style="margin:6px 0">Місце ще не вказано</div><div id="lmap-${key}" class="map sm" style="height:200px"></div>`;
}
function locInit(key){
  const m = mkMap('lmap-'+key, KYIV, 11); LOC[key] = { m, mk:null };
  m.on('click', e => setLoc(key, e.latlng.lat, e.latlng.lng, 'map'));
}
function setLoc(key, lat, lng, src, acc){
  const o = P[key]; o.lat = +lat.toFixed(6); o.lng = +lng.toFixed(6); o.src = src;
  const L0 = LOC[key]; if (L0){ if (L0.mk) L0.mk.setLatLng([lat,lng]); else L0.mk = L.circleMarker([lat,lng], { radius:7, color:'#F4EFE6', weight:2, fillColor:'#B5502F', fillOpacity:1 }).addTo(L0.m); L0.m.setView([lat,lng], Math.max(L0.m.getZoom(),14)); }
  const el = document.getElementById('loc-'+key); if (el) el.innerHTML = `${o.lat}, ${o.lng} · ${src=='gps'?'GPS'+(acc?', ±'+Math.round(acc)+' м':''):'точка на карті'}`;
  if (window.onLoc) window.onLoc(key);
}
function gps(key){
  const el = document.getElementById('loc-'+key);
  if (!navigator.geolocation){ el.textContent = 'GPS недоступний — вкажіть точку на карті'; return; }
  el.textContent = 'Визначаємо місце…';
  navigator.geolocation.getCurrentPosition(p => setLoc(key, p.coords.latitude, p.coords.longitude, 'gps', p.coords.accuracy),
    () => { el.textContent = 'Не вдалося отримати GPS (немає дозволу або сигналу). Торкніться карти, щоб поставити точку.'; }, { enableHighAccuracy:true, timeout:10000 });
}
function readFile(input, cb){
  const f = input.files[0]; if(!f) return;
  const img = new Image(), r = new FileReader();
  r.onload = () => { img.onload = () => { const c = document.createElement('canvas'), k = Math.min(1, 520/Math.max(img.width,img.height)); c.width = img.width*k; c.height = img.height*k; c.getContext('2d').drawImage(img,0,0,c.width,c.height); cb(c.toDataURL('image/jpeg',.8)); }; img.src = r.result; };
  r.readAsDataURL(f);
}

/* ================= РОЗПІЗНАВАННЯ ================= */
let RC = null;            // поточна сесія розпізнавання
const P = { REC:{ lat:null, lng:null, src:null }, RQ:{ lat:null, lng:null, src:null, photo:null }, PB:{ lat:null, lng:null, src:null, photo:null } };
let VEC = {};             // кеш векторів бази: { 'id:idx': [...] }
try { VEC = JSON.parse(localStorage.getItem('sp_vec_v1') || '{}'); } catch(e){}
function pRec(){
  if (!RC) RC = { src:null, test:null, stage:'pick', res:null };
  if (RC.stage=='pick') return pRecPick();
  return pRecResult();
}
function pRecPick(){
  return { html:`<h1 class="h1">Розпізнати тварину</h1><div class="sub">Сфотографуйте морду тварини та вкажіть місце. Система знайде її в базі або запропонує зареєструвати.</div>
   <div class="label">1. Фото</div>
   ${photoPicker('cbRec')}
   <div class="label" style="margin-top:14px">або тестові фото з вулиці</div>
   <div class="gallery">${SEED.tests.map(t => `<img src="${t.src}" class="${RC.test==t.id?'sel':''}" title="${h(t.label)}" onclick="RC.src=this.src;RC.test='${t.id}';recPreview()">`).join('')}</div>
   <div class="small muted" style="margin-top:4px">Тестові кадри змодельовано з датасету Oxford-IIIT Pet: частина — інші кадри тварин із бази, частина — тварини, яких у базі немає.</div>
   <div id="rprev" style="margin-top:12px">${RC.src?`<img class="preview" src="${RC.src}">`:''}</div>
   <div class="label" style="margin-top:16px">2. Місце</div>${locBlock('REC')}
   <div id="mstate" class="model-st"></div>
   <button id="go" class="btn p" style="width:100%;margin-top:8px" onclick="runRec()" ${RC.src&&P.REC.lat!=null?'':'disabled'}>Розпізнати</button>`,
   after(){ locInit('REC'); if (P.REC.lat!=null) setLoc('REC', P.REC.lat, P.REC.lng, P.REC.src); window.onLoc = () => recReady(); modelState(); if (RC.auto){ RC.auto = false; runRec(); } } };
}
function recPreview(){ $('#rprev').innerHTML = `<img class="preview" src="${RC.src}">`; document.querySelectorAll('.gallery img').forEach(i => i.classList.toggle('sel', i.src==RC.src && !!RC.test)); recReady(); }
function recReady(){ const b = $('#go'); if (b) b.disabled = !(RC.src && P.REC.lat!=null); }
function modelState(){ const el = $('#mstate'); if (!el) return; el.textContent = window.Recog ? 'Модель розпізнавання: CLIP ViT-B/32 (завантажиться при першому запуску, ~90 МБ).' : 'Модель розпізнавання ще завантажується…'; }
window.addEventListener('recog-ready', modelState);

function cos(a,b){ let s=0; for (let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; }
async function indexDb(progress){
  const items = [];
  S.animals.forEach(a => photosOf(a.id).forEach((p,i) => items.push({ key:a.id+':'+i, aid:a.id, src:p })));
  let done = 0;
  for (const it of items){
    if (!VEC[it.key]) VEC[it.key] = (await window.Recog.embed(it.src)).map(x => +x.toFixed(5));
    progress(++done, items.length);
  }
  try { localStorage.setItem('sp_vec_v1', JSON.stringify(VEC)); } catch(e){}
  return items;
}
async function runRec(){
  RC.stage = 'run'; RC.res = { steps:[], demo:false }; render();
  const step = (t, v) => { RC.res.steps.push([t, v]); drawSteps(); };
  try {
    if (!window.Recog) throw new Error('no module');
    step('Завантаження моделі CLIP ViT-B/32', '…'); await window.Recog.init(); RC.res.steps.pop(); step('Модель CLIP ViT-B/32 готова', '✓');
    step('Індексація бази', '0 / …');
    const items = await indexDb((d,n) => { RC.res.steps[RC.res.steps.length-1] = ['Векторів у базі', d+' / '+n]; drawSteps(); });
    step('Побудова вектора ознак фото', '…');
    const q = await window.Recog.embed(RC.src);
    RC.res.steps.pop(); step('Вектор ознак: 512 чисел', '✓');
    // вид: голосування 5 найближчих векторів
    const all = items.map(it => ({ aid:it.aid, s:cos(q, VEC[it.key]) })).sort((a,b) => b.s-a.s);
    const top5 = all.slice(0,5), dogs = top5.filter(x => A(x.aid).species=='dog').length, sp = dogs>=3 ? 'dog' : 'cat';
    step('Вид: '+SP[sp], (sp=='dog'?dogs:5-dogs)+' з 5 найближчих');
    // пошук лише серед тварин того самого виду
    const same = all.filter(x => A(x.aid).species==sp), best = {};
    same.forEach(x => { if (!best[x.aid] || best[x.aid] < x.s) best[x.aid] = x.s; });
    const cands = Object.entries(best).map(([aid,s]) => ({ aid:+aid, s })).sort((a,b) => b.s-a.s).slice(0,3);
    step('Пошук серед '+S.animals.filter(a => a.species==sp).length+(sp=='dog'?' собак':' котів'), '✓');
    Object.assign(RC.res, { sp, cands, best:cands[0] });
  } catch(err) {
    // запасний режим: модель недоступна (немає інтернету) — демонстраційний результат
    const t = SEED.tests.find(x => x.id==RC.test);
    RC.res.demo = true; RC.res.steps = [['Модель недоступна (немає інтернету?)','демо-режим']];
    if (t){ const sp = t.species; const pool = S.animals.filter(a => a.species==sp);
      const hit = t.expect_animal ? { aid:t.expect_animal, s:0.93 } : { aid:pool[0].id, s:0.71 };
      Object.assign(RC.res, { sp, cands:[hit], best:hit }); }
    else Object.assign(RC.res, { sp:'dog', cands:[], best:null });
  }
  RC.stage = 'result'; render();
}
function drawSteps(){ const el = $('#steps'); if (el) el.innerHTML = RC.res.steps.map(s => `<div>${h(s[0])}<span>${h(s[1])}</span></div>`).join(''); }
function pRecResult(){
  const r = RC.res;
  if (RC.stage=='run') return { html:`<h1 class="h1">Розпізнавання…</h1><img class="preview" src="${RC.src}" style="margin:10px 0"><div class="steps" id="steps"></div>`, after:drawSteps };
  const b = r.best, found = b && b.s >= THRESH, a = b ? A(b.aid) : null;
  let zoneHtml = '';
  if (found){ const zc = checkZone(a.id, P.REC.lat, P.REC.lng); RC.zone = zc;
    zoneHtml = !zc.z ? '<div class="note">Зона перебування ще не визначена: потрібно щонайменше 3 фіксації.</div>'
      : zc.out ? `<div class="warn">Точка за ${(zc.d/1000).toFixed(1).replace('.',',')} км від центру звичної зони (радіус ${zc.z.r} м). Після збереження диспетчер отримає сповіщення «поза ареалом».</div>`
      : `<div class="ok">Точка в межах звичної зони (${zc.d} м від центру, радіус ${zc.z.r} м).</div>`; }
  const pct = b ? Math.max(0, Math.min(1, b.s)) : 0;
  return { html:`<h1 class="h1">${found?'Тварину знайдено':'Збігів не знайдено'}</h1>
   <div class="steps" style="margin-bottom:6px">${r.steps.map(s => `<div>${h(s[0])}<span>${h(s[1])}</span></div>`).join('')}</div>
   <div class="pair"><figure><img src="${RC.src}"><figcaption>ваше фото</figcaption></figure>${a?`<figure><img src="${photo(a.id)}"><figcaption>${found?'':'найближча: '}${a.code} у базі</figcaption></figure>`:'<figure></figure>'}</div>
   ${b?`<div class="row" style="justify-content:space-between;align-items:flex-end"><div><div class="label">Косинусна схожість</div><div class="score">${b.s.toFixed(2).replace('.',',')}</div></div><div style="text-align:right" class="small">${found?`Це <b>${a.code}</b>`:'Нижче порогу'}<br><span class="muted">поріг ${String(THRESH).replace('.',',')}</span></div></div>
   <div class="meter"><i style="width:${pct*100}%;background:${found?'var(--green)':'var(--rust)'}"></i><b style="left:${THRESH*100}%"></b></div>
   <div class="cands">Найближчі ${SP[r.sp]=='кіт'?'коти':'собаки'}: ${r.cands.map(c => A(c.aid).code+' — '+c.s.toFixed(2).replace('.',',')).join(' · ')}</div>`:''}
   ${r.demo?'<div class="note">Демонстраційний режим: модель не завантажилась, результат підставлено для тестового фото.</div>':''}
   ${zoneHtml}
   <div class="label" style="margin-top:12px">Місце</div><div class="small">${P.REC.lat}, ${P.REC.lng} · ${P.REC.src=='gps'?'GPS':'точка на карті'}</div>
   <div class="fld" style="margin-top:12px"><div class="label">Коментар</div><textarea id="rcm" rows="2" placeholder="Стан тварини, де саме тримається, поведінка…"></textarea></div>
   ${RC.reqId ? (found ? `<div class="row"><button class="btn r" style="flex:1" onclick="linkReq(${a.id})">Прив'язати ${a.code} і створити наряд</button><button class="btn" onclick="toNew()">Це інша тварина</button></div>`
                       : `<div class="row"><button class="btn r" style="flex:1" onclick="toNew()">Зареєструвати нову тварину</button></div>`)
   : found ? `<div class="row"><button class="btn p" style="flex:1" onclick="saveSighting()">Зберегти фіксацію</button><button class="btn" onclick="toNew()">Це не вона</button></div>`
           : `<div class="row"><button class="btn r" style="flex:1" onclick="toNew()">Зареєструвати нову тварину</button>${a?`<button class="btn" onclick="RC.res.best.s=1;saveSighting()">Це ${a.code}</button>`:''}</div>`}
   <div style="margin-top:10px"><a class="small" href="#" onclick="RC=null;render();return false">← Нове розпізнавання</a></div>` };
}
function saveSighting(){
  const a = A(RC.res.best.aid), zc = checkZone(a.id, P.REC.lat, P.REC.lng);
  S.sightings.push({ id:nextId(S.sightings), animal_id:a.id, user_id:ME.id, device_id:null, latitude:P.REC.lat, longitude:P.REC.lng, location_source:P.REC.src, seen_at:nowIso() });
  (S.extraPhotos[a.id] = S.extraPhotos[a.id] || []).push(RC.src);
  a.out_of_zone = zc.out;
  if (zc.out) S.alerts.push({ id:nextId(S.alerts), animal_id:a.id, alert_type:'out_of_zone', message:'Зафіксовано за межами звичної зони ('+(a.district||'')+')', created_at:nowIso(), is_read:false });
  pushComment(a.id, ($('#rcm')||{}).value);
  save(); toast('Фіксацію збережено'+(zc.out?' · диспетчера сповіщено':'')); RC = null; TAB='route'; go('#/animal/'+a.id);
}
let NEWC = '';
function toNew(){ NEWC = ($('#rcm')||{}).value || ''; go('#/new'); }
function pNew(){
  if (!RC || !RC.src) return { html:`<p>Спершу зробіть фото на вкладці <a href="#/rec">Розпізнати</a>.</p>` };
  const sp = RC.res && RC.res.sp || 'dog';
  return { html:`<h1 class="h1">Нова тварина</h1><div class="sub">Картка створюється зі статусом «неідентифікована». Фото і місце вже додано.</div>
  <img class="preview" src="${RC.src}" style="max-width:420px">
  <form class="form" onsubmit="saveNew(event)" style="margin-top:14px">
    <div class="fld"><div class="label">Вид</div><div class="radios"><label><input type="radio" name="sp" value="dog" ${sp=='dog'?'checked':''}> собака</label><label><input type="radio" name="sp" value="cat" ${sp=='cat'?'checked':''}> кіт</label></div><div class="hint">Визначено системою — виправте, якщо помилка.</div></div>
    <div class="fld"><div class="label">Стать</div><select id="g"><option value="unknown">невідомо</option><option value="male">самець</option><option value="female">самиця</option></select></div>
    <div class="fld"><div class="label">Орієнтовний вік, міс.</div><input id="age" type="number" min="0" max="240" placeholder="Напр., 12"></div>
    <div class="fld"><div class="label">Особливі прикмети</div><textarea id="mk" rows="2" placeholder="Окрас, мітки, шрами, нашийник…"></textarea></div>
    <div class="fld"><div class="label">Коментар</div><textarea id="nc" rows="2">${h(NEWC)}</textarea></div>
    <div class="small muted" style="margin-bottom:12px">Місце: ${P.REC.lat}, ${P.REC.lng} · ${P.REC.src=='gps'?'GPS':'точка на карті'}</div>
    <div class="row"><button class="btn r">Зареєструвати</button><a class="btn" href="#/rec">Назад</a></div>
  </form>` };
}
function saveNew(e){
  e.preventDefault();
  const id = nextId(S.animals), m = parseInt($('#age').value);
  const a = { id, code:'SP-'+String(Math.max(...S.animals.map(x => +x.code.slice(3)))+1).padStart(4,'0'), species:document.querySelector('input[name=sp]:checked').value, gender:$('#g').value,
    birth_date_est: isNaN(m) ? null : addDays(todayIso(), -Math.round(m*30.44)), marks:$('#mk').value.trim(), chip_number:null, chip_date:null, status:'unidentified',
    home_lat:P.REC.lat, home_lng:P.REC.lng, home_radius_m:null, out_of_zone:false, district:'', created_at:nowIso() };
  S.animals.push(a); S.extraPhotos[id] = [RC.src];
  S.sightings.push({ id:nextId(S.sightings), animal_id:id, user_id:ME.id, device_id:null, latitude:P.REC.lat, longitude:P.REC.lng, location_source:P.REC.src, seen_at:nowIso() });
  S.alerts.push({ id:nextId(S.alerts), animal_id:id, alert_type:'new_animal', message:'Нова тварина, зареєстрована: '+ROLE[ME.role], created_at:nowIso(), is_read:false });
  pushComment(id, $('#nc').value);
  for (const k in VEC) if (k.startsWith(id+':')) delete VEC[k];
  if (RC.reqId){ const r = S.requests.find(x => x.id==RC.reqId); r.animal_id = id; save(); toast('Тварину '+a.code+' зареєстровано і прив\'язано до звернення №'+r.id); RC = null; go('#/requests'); setTimeout(() => taskModal({ animal_id:id, request_id:r.id }), 300); return; }
  save(); toast('Тварину зареєстровано: '+a.code); RC = null; go('#/animal/'+id);
}


/* ================= КАЛІБРУВАННЯ ПОРОГУ (службова сторінка #/calib) ================= */
function pCalib(){
  return { html:`<h1 class="h1">Калібрування порогу схожості</h1><div class="sub">Службова сторінка: перевіряє всі тестові фото й показує схожість, щоб обґрунтувати поріг.</div>
  <button class="btn p" onclick="runCalib()">Запустити</button><div id="cst" class="model-st"></div><div id="cres"></div>` };
}
async function runCalib(){
  const st = $('#cst');
  try {
    st.textContent = 'Завантаження моделі…'; await window.Recog.init();
    const items = await indexDb((d,n) => st.textContent = 'Векторів бази: '+d+' / '+n);
    const rows = [];
    for (const t of SEED.tests){
      const q = await window.Recog.embed(t.src);
      const all = items.map(it => ({ aid:it.aid, s:cos(q, VEC[it.key]) })).sort((a,b) => b.s-a.s);
      const dogs = all.slice(0,5).filter(x => A(x.aid).species=='dog').length, sp = dogs>=3?'dog':'cat';
      const same = all.filter(x => A(x.aid).species==t.species);
      const own = t.expect_animal ? Math.max(...all.filter(x => x.aid==t.expect_animal).map(x => x.s)) : null;
      const other = Math.max(...same.filter(x => x.aid!=t.expect_animal).map(x => x.s));
      rows.push({ t, sp, own, other, top:A(same[0].aid).code });
      st.textContent = 'Тестових фото: '+rows.length+' / '+SEED.tests.length;
    }
    $('#cres').innerHTML = `<table class="t"><tr><th>Фото</th><th>Очікується</th><th>Вид (визначено)</th><th>Схожість зі «своєю»</th><th>Найвища з іншими</th><th>Найближча</th></tr>${rows.map(r => `<tr><td><img src="${r.t.src}"></td><td>${r.t.expect_animal?A(r.t.expect_animal).code:'нова'}</td><td>${SP[r.sp]} ${r.sp==r.t.species?'✓':'✗'}</td><td>${r.own!=null?r.own.toFixed(3):'—'}</td><td>${r.other.toFixed(3)}</td><td>${r.top}</td></tr>`).join('')}</table>`;
    st.textContent = 'Готово. Поріг зараз: '+THRESH;
  } catch(e){ st.textContent = 'Помилка: '+e.message; }
}

/* ================= ПУБЛІЧНЕ ЗВЕРНЕННЯ (без входу) ================= */
function pReport(){
  P.PB = { lat:null, lng:null, src:null, photo:null };
  return { html:`<h1 class="h1">Повідомити про тварину</h1>
  <div class="sub">Побачили безпритульну тварину, якій потрібна допомога? Надішліть фото й місце — диспетчер служби розгляне звернення.</div>
  <form onsubmit="savePublic(event)" novalidate>
    <div class="fld"><div class="label">Фото тварини</div>${photoPicker('cbPub')}<div id="pbph"></div></div>
    <div class="fld"><div class="label">Що сталося</div><textarea id="pbd" rows="4" required placeholder="Тварина травмована, агресивна, кошенята без матері…"></textarea></div>
    <div class="fld"><div class="label">Місце</div>${locBlock('PB')}</div>
    <div class="fld"><div class="label">Телефон для зворотного зв'язку (необов'язково)</div><input id="pbp" type="tel" placeholder="+380…"></div>
    <div class="small muted" style="margin-bottom:12px">Без входу ви не бачите даних системи — лише надсилаєте повідомлення. Не більше 3 звернень на добу з одного пристрою.</div>
    <div id="pberr" class="c-rust small" style="margin-bottom:8px"></div>
    <button type="button" class="btn r" style="width:100%" onclick="savePublic()">Надіслати</button>
  </form>`, after(){ locInit('PB'); } };
}
function needLoc(key){ const el = document.getElementById('loc-'+key); el.innerHTML = '<span class="c-rust">Вкажіть місце: натисніть «Визначити за GPS» або торкніться карти</span>'; el.scrollIntoView({ behavior:'smooth', block:'center' }); }
function savePublic(e){
  if (e) e.preventDefault();
  const err = t => { const el = $('#pberr'); if (el) el.textContent = t; };
  try {
  err('');
  if (!$('#pbd').value.trim()){ err('Опишіть, що сталося.'); $('#pbd').focus(); return; }
  if (P.PB.lat==null){ needLoc('PB'); return; }
  let n = []; try { n = JSON.parse(localStorage.getItem('sp_pub') || '[]').filter(t => Date.now()-t < 864e5); } catch(e){}
  if (n.length >= 3){ $('#pberr').textContent = 'Ліміт: не більше 3 звернень на добу з одного пристрою. Спробуйте завтра.'; return; }
  S.requests.push({ id:nextId(S.requests), author_id:null, source:'resident', contact_phone:$('#pbp').value.trim()||null, animal_id:null, description:$('#pbd').value.trim(), photo:P.PB.photo, latitude:P.PB.lat, longitude:P.PB.lng, status:'new', created_at:nowIso() });
  n.push(Date.now()); try { localStorage.setItem('sp_pub', JSON.stringify(n)); } catch(e){}
  save();
  $('.wrap').innerHTML = `<h1 class="h1">Дякуємо!</h1><p style="margin:10px 0 18px">Звернення №${S.requests[S.requests.length-1].id} передано диспетчеру служби.</p><a class="btn" href="#/login">На головну</a>`;
  } catch(ex){ console.error(ex); err('Помилка: '+ex.message); }
}

/* ---------- камера ноутбука (на телефоні кнопка «Сфотографувати» одразу відкриває камеру) ---------- */
let CAMSTREAM = null;
function camOpen(cbName){
  const div = document.createElement('div'); div.className = 'modal-bg'; div.id = 'cam';
  div.innerHTML = `<div class="modal"><h2 class="serif" style="font-size:20px;margin-bottom:10px">Камера</h2><video id="camv" autoplay playsinline style="width:100%;background:#000"></video>
    <div id="camerr" class="small c-rust"></div><div class="row" style="margin-top:10px"><button class="btn r" onclick="camShot('${cbName}')">Зняти</button><button class="btn" onclick="camClose()">Скасувати</button></div></div>`;
  document.body.appendChild(div);
  navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }).then(st => { CAMSTREAM = st; $('#camv').srcObject = st; })
    .catch(() => { $('#camerr').textContent = 'Немає доступу до камери. Дозвольте доступ у браузері або виберіть файл.'; });
}
function camShot(cbName){
  const v = $('#camv'); if (!v.videoWidth) return;
  const c = document.createElement('canvas'), k = Math.min(1, 520/Math.max(v.videoWidth, v.videoHeight));
  c.width = v.videoWidth*k; c.height = v.videoHeight*k; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  const src = c.toDataURL('image/jpeg', .85); camClose(); window[cbName](src);
}
function camClose(){ if (CAMSTREAM) CAMSTREAM.getTracks().forEach(t => t.stop()); CAMSTREAM = null; const d = $('#cam'); if (d) d.remove(); }
function photoPicker(cbName){
  return `<div class="row" style="align-items:stretch"><label class="upload" style="flex:1;margin-top:8px"><input type="file" accept="image/*" capture="environment" style="display:none" onchange="readFile(this,${cbName})">Вибрати фото з пристрою</label>
    <button type="button" class="upload" style="flex:1;margin-top:8px;background:transparent" onclick="camOpen('${cbName}')">Зробити фото камерою</button></div>`;
}
function cbRec(src){ RC.src = src; RC.test = null; recPreview(); }
function cbReq(src){ P.RQ.photo = src; $('#rph').innerHTML = '<img class="preview" src="'+src+'">'; }
function cbPub(src){ P.PB.photo = src; $('#pbph').innerHTML = '<img class="preview" src="'+src+'">'; }

/* ---------- розпізнавання фото зі звернення (диспетчер) ---------- */
function reqRecog(id){
  const r = S.requests.find(x => x.id==id);
  RC = { src:r.photo, test:null, stage:'pick', res:null, reqId:id, auto:true };
  P.REC = { lat:r.latitude, lng:r.longitude, src:'map' };
  go('#/rec');
}
function linkReq(aid){
  const r = S.requests.find(x => x.id==RC.reqId); r.animal_id = aid; pushComment(aid, ($('#rcm')||{}).value);
  save(); RC = null; toast('Звернення №'+r.id+' прив\'язано до '+A(aid).code); go('#/requests'); setTimeout(() => taskModal({ animal_id:aid, request_id:r.id }), 300);
}

render();
