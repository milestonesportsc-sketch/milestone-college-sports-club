// Milestone Sports Club: shared script for index.html (website) and admin.html (dashboard). Demo: data lives in localStorage.
/* ===== Shared data layer: everything lives in this browser's localStorage (demo only) ===== */
var DB=(function(){
var K='mcsc.db.v1',mem=null;
function D(n){var d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function base(){return{members:[],events:[],payments:[],budget:[],gallery:[],messages:[],team:[],notes:[],settings:{clubName:'Milestone Sports Club',banner:'',phone:'02-48963437, 02-58957733, 01340340744, 01872402890',email:'milestonecollege1056@gmail.com',address:'30 & 44 Gareeb-E-Newaz Avenue, Sector 11, Uttara Model Town, Dhaka 1230',fee:350,bkash:'01340340744',nagad:'01340340744',rocket:'01340340744',demo:false,theme:'white',teachersSeeded:false}}}
function noteSeed(){return[{id:'n0',title:'Welcome to the club notice board (sample)',sport:'All sports',text:'Club notes and notices appear here. Edit or delete this sample in the dashboard under Sports Notes.',date:D(0),pinned:true,published:true},{id:'n1',title:'Coach note: football fitness plan (sample)',sport:'Football',text:'This is a private note. It only shows in the dashboard because "Show on the website" is switched off.',date:D(-2),pinned:false,published:false}]}
function teachSeed(){var T=[];for(var j=1;j<=8;j++)T.push({id:'th'+j,group:'Teachers',name:'To be announced',role:'Teacher',photo:''});return T}
function teamSeed(){var L=[['President','Mahi Islam Pranto'],['Advisor','Rakibul Islam Abid'],['Vice President','Md. Nazmul Islam'],['Vice President','Muhammad Munawar Hossain'],['Vice President','Tuba Akter Tasfiya'],['General Secretary (GS)','Abdur Rahman Mahi'],['Joint Secretary','Arnov Matabber'],['Organizing Secretary','Ridita Mim'],['Secretary',''],['Assistant Secretary',''],['Assistant Secretary',''],['Assistant Secretary',''],['Assistant Secretary',''],['Assistant Secretary','']];return teachSeed().concat(L.map(function(x,k){return{id:'t'+k,group:'Students',name:x[1]||'To be announced',role:x[0],photo:x[0]==='President'?'assets/president.jpg':''}}))}
function migrate(d){var s=d.settings;d.team.forEach(function(m){if(m.role==='Advisor'&&m.name==='Abid')m.name='Rakibul Islam Abid'});if(d.team.length&&d.team.every(function(m){return m.name==='Name to be added'}))d.team=teamSeed();if(s.phone==='02-48963437, 02-58957733')s.phone='02-48963437, 02-58957733, 01340340744, 01872402890';if(['white','classic','rose','green'].indexOf(s.theme)<0)s.theme='white';if(!s.themeChosen)s.theme='white';if(!s.teachersSeeded&&d.team.length){if(!d.team.some(function(m){return m.group==='Teachers'}))d.team=teachSeed().concat(d.team);d.team.forEach(function(m){if(m.role==='President'&&!m.photo)m.photo='assets/president.jpg'});s.teachersSeeded=true}var iN=-1,iM=-1;d.team.forEach(function(m,i){if(m.group==='Students'&&m.name==='Md. Nazmul Islam')iN=i;if(m.group==='Students'&&m.name==='Muhammad Munawar Hossain')iM=i});if(iN>-1&&iM>-1&&iM<iN){var pa=d.team[iN],pb=d.team[iM],pid=pa.id;pa.id=pb.id;pb.id=pid;d.team[iN]=pb;d.team[iM]=pa}s.mig=8}
function seed(){var d=base(),S=['Football','Cricket','Handball','Kabaddi','Athletics','Swimming','Chess','Badminton'],i;
 d.settings.demo=true;
 for(i=1;i<=8;i++)d.members.push({id:'m'+i,name:'Sample Member 0'+i,roll:'Class '+(6+i%5)+' · Roll '+(10+i),phone:'0170000000'+i,sport:S[(i*3)%8],status:i%4===0?'Pending':'Active',joined:D(-i*9)});
 [[-3,'Pending','bKash'],[-12,'Paid','Nagad'],[-35,'Paid','bKash'],[-62,'Paid','Rocket'],[-95,'Paid','bKash'],[-130,'Pending','Nagad'],[-20,'Paid','bKash']].forEach(function(x,k){
  d.payments.push({id:'p'+k,date:D(x[0]),memberId:'m'+(k+1),name:'Sample Member 0'+(k+1),method:x[2],trx:'SAMPLE00000'+(k+1),amount:350,status:x[1]})});
 [[12,'Inter-Class Football Cup (sample)','Football','Diabari campus ground',1],[25,'College Cricket League (sample)','Cricket','Diabari campus ground',1],[40,'Swimming Meet (sample)','Swimming','To be confirmed',0],[-20,'Annual Sports Day (sample)','All sports','Diabari campus ground',1]].forEach(function(x,k){
  d.events.push({id:'e'+k,title:x[1],date:D(x[0]),venue:x[3],sport:x[2],desc:'Sample event so you can see how the dashboard and website work together.',published:!!x[4]})});
 [[-15,'Sylhet Tour (sample)','Transport','Bus hire',40000,38500],[-15,'Sylhet Tour (sample)','Stay','Hotel rooms',30000,32000],[-14,'Sylhet Tour (sample)','Food','Meals',15000,12000],[-14,'Sylhet Tour (sample)','Tickets','Entry tickets',5000,4500],[-40,'Day Trip (sample)','Transport','Mini-bus',12000,12000],[-40,'Day Trip (sample)','Food','Lunch',8000,7600]].forEach(function(x,k){
  d.budget.push({id:'b'+k,date:D(x[0]),tour:x[1],category:x[2],desc:x[3],planned:x[4],actual:x[5]})});
 d.messages.push({id:'c1',name:'Sample Visitor',contact:'visitor@example.com',text:'Hello! How can I join the swimming team? (sample message)',date:D(-1)+' 10:30',read:false},{id:'c2',name:'Sample Parent',contact:'01700000000',text:'Please share the football practice timings. (sample message)',date:D(-6)+' 16:05',read:true});
 d.team=teamSeed();d.notes=noteSeed();
 return d}
function load(){var s=null;try{s=localStorage.getItem(K)}catch(e){}if(s){try{var d=JSON.parse(s);if(d&&d.members&&d.settings)return d}catch(e){}}return mem}
function signedIn(){try{return !!(window.MCSC&&MCSC.token())}catch(e){return false}}
function save(d){mem=d;try{window.MCSC&&MCSC.push(d)}catch(e){}if(signedIn())return;try{localStorage.setItem(K,JSON.stringify(d))}catch(e){if(/quota/i.test(e.name||'')||e.code===22)throw e}}
function apply(d){mem=d;if(signedIn())return;try{localStorage.setItem(K,JSON.stringify(d))}catch(e){}}
var ADMIN=['login','dashboard','editor'].indexOf(document.body.getAttribute('data-page'))>-1;
function get(){var d=load();if(!d){if(ADMIN)d=mem=base();else{d=seed();save(d)}}delete d.settings.adminPass;if(!d.team)d.team=[];if(!d.notes)d.notes=[];var b=base();for(var k in b.settings)if(!(k in d.settings))d.settings[k]=b.settings[k];if((d.settings.mig||0)<8){migrate(d);save(d)}return d}
return{get:get,save:save,teamSeed:teamSeed,settings:function(){return get().settings},
 update:function(fn){var d=get();fn(d);save(d);return d},
 uid:function(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,6)},
 apply:apply,reset:function(){save(seed())},
 empty:function(){var d=get(),b=base();b.settings=d.settings;b.settings.demo=false;return b}}})();


function siteApp(){
var $=function(i){return document.getElementById(i)},qa=function(s){return[].slice.call(document.querySelectorAll(s))};
/* ---------- page behaviour ---------- */
var nav=$('nav');addEventListener('scroll',function(){nav.classList.toggle('s',scrollY>30)});
$('mb').onclick=function(){nav.classList.toggle('o')};
qa('#nl a').forEach(function(a){a.addEventListener('click',function(){nav.classList.remove('o')})});
function cnt(el){var n=+el.dataset.c,t0=performance.now();(function f(t){var p=Math.min((t-t0)/1400,1);el.textContent=Math.round(n*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)})(t0)}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');if(e.target.dataset.c)cnt(e.target);io.unobserve(e.target)}})},{threshold:.15});
qa('.rv,[data-c]').forEach(function(x){io.observe(x)});
qa('.tl').forEach(function(c){
 c.addEventListener('pointermove',function(e){var b=c.getBoundingClientRect(),x=(e.clientX-b.left)/b.width-.5,y=(e.clientY-b.top)/b.height-.5;c.style.transform='rotateY('+x*20+'deg) rotateX('+(-y*20)+'deg) translateZ(8px)'});
 c.addEventListener('pointerleave',function(){c.style.transform=''})});
qa('.fc').forEach(function(c){c.onclick=function(){c.classList.toggle('f')}});
function note(){var g=document.querySelector('input[name=g]:checked');$('note').innerHTML='Selected: <b>'+g.value+'</b>. Send ৳'+DB.settings().fee+' to the club number <b>'+(DB.settings()[g.value.toLowerCase()]||g.dataset.n)+'</b>, then enter the transaction ID below.'}
qa('input[name=g]').forEach(function(x){x.onchange=note});note();
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function done(html){var rc=$('rc');rc.style.display='block';rc.innerHTML=html;rc.scrollIntoView({behavior:'smooth',block:'center'})}
$('f').onsubmit=function(ev){ev.preventDefault();var e=$('e'),
 rec={name:$('n').value.trim(),roll:$('r').value.trim(),phone:$('m').value.trim(),sport:$('s').value,method:document.querySelector('input[name=g]:checked').value,trxId:$('t').value.trim().toUpperCase()};
 if(!rec.name||!rec.roll){e.textContent='Please enter your name and class/roll.';return}
 if(!/^01[3-9]\d{8}$/.test(rec.phone)){e.textContent='Enter a valid 11-digit Bangladeshi mobile number.';return}
 if(rec.trxId.length<8){e.textContent='Enter the transaction ID from your payment SMS.';return}
 e.textContent='';
 try{var fee=0;DB.update(function(d){if(d.payments.some(function(p){return p.trx===rec.trxId}))throw new Error('This TrxID has already been submitted.');fee=+d.settings.fee||0;var id=DB.uid('m'),day=new Date().toISOString().slice(0,10);
  d.members.push({id:id,name:rec.name,roll:rec.roll,phone:rec.phone,sport:rec.sport,status:'Pending',joined:day,source:'website'});
  d.payments.push({id:DB.uid('p'),date:day,memberId:id,name:rec.name,method:rec.method,trx:rec.trxId,amount:fee,status:'Pending'})});
  done('<h3 style="color:var(--b8)">Request saved (demo)</h3><p>'+esc(rec.name)+' · '+esc(rec.sport)+' · '+esc(rec.method)+' · Fee ৳'+fee+'</p><p>TrxID: '+esc(rec.trxId)+'</p><p style="margin-top:8px"><b>Saved only in this browser.</b> It now shows as Pending in the admin dashboard. No payment was processed or verified.</p>');$('f').reset();note()}
 catch(x){e.textContent=x.message}};
var lb=$('lb'),li=$('li');
document.addEventListener('click',function(e){var el=e.target.closest('.nc img,.nc button,.gl img,#hv-photo img');if(!el)return;var im=el.tagName=='IMG'?el:el.closest('.nc').querySelector('img');li.src=im.src;lb.classList.add('on')});
lb.onclick=function(){lb.classList.remove('on')};addEventListener('keydown',function(e){if(e.key=='Escape')lb.classList.remove('on')});
$('cf').onsubmit=function(e){e.preventDefault();var n=$('cn').value.trim(),m=$('cm').value.trim();if(!n||!m)return;DB.update(function(d){d.messages.push({id:DB.uid('c'),name:n,contact:$('ce').value.trim(),text:m,date:new Date().toISOString().slice(0,16).replace('T',' '),read:false})});$('cf').reset();var b=$('cf').querySelector('button');b.textContent='Message sent ✓';setTimeout(function(){b.textContent='Send Message'},2500)};



document.documentElement.setAttribute('data-theme',DB.settings().theme);
/* ----- website <-> dashboard connection ----- */
function applySettings(){var s=DB.settings(),a=$('ann');
 if(a){a.textContent=s.banner||'';a.hidden=!s.banner}
 qa('.sFee').forEach(function(x){x.textContent=s.fee});
 if($('sPhone')&&s.phone)$('sPhone').innerHTML=s.phone.split(',').map(function(p){p=p.trim();return'<a href="tel:+88'+p.replace(/[^0-9]/g,'')+'">'+esc(p)+'</a>'}).join(', ');
 if($('sEmail')&&s.email)$('sEmail').innerHTML='<a href="mailto:'+esc(s.email)+'">'+esc(s.email)+'</a>';
 if($('sAddr')&&s.address)$('sAddr').textContent=s.address;
 note()}
function renderEvents(){var el=$('evl');if(!el)return;var t=new Date().toISOString().slice(0,10),M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
 ev=DB.get().events.filter(function(e){return e.published&&e.date>=t}).sort(function(a,b){return a.date.localeCompare(b.date)});
 el.innerHTML=ev.length?ev.map(function(e){var p=e.date.split('-');return'<div class="ev"><div class="evd"><b>'+(+p[2])+'</b><span>'+esc(M[+p[1]-1]||'')+' '+esc(p[0])+'</span></div><div><h4>'+esc(e.title)+'</h4><p>'+esc(e.sport||'')+(e.venue?' · '+esc(e.venue):'')+'</p>'+(e.desc?'<p>'+esc(e.desc)+'</p>':'')+'</div></div>'}).join(''):'<p class="cr">No upcoming events have been published yet. Check back soon.</p>'}
function renderNotes(){var el=$('noteg');if(!el)return;var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],n=(DB.get().notes||[]).filter(function(x){return x.published}).sort(function(a,b){return(b.pinned?1:0)-(a.pinned?1:0)||(b.date||'').localeCompare(a.date||'')});
 el.innerHTML=n.length?n.map(function(x){var p=(x.date||'').split('-'),d=p.length===3?(+p[2])+' '+M[+p[1]-1]+' '+p[0]:'';return'<div class="nt'+(x.pinned?' pin':'')+'"><div class="nth">'+(x.pinned?'<span class="bd active">Pinned</span>':'')+'<span class="bd">'+esc(x.sport||'All sports')+'</span><small>'+esc(d)+'</small></div><h4>'+esc(x.title)+'</h4><p>'+esc(x.text)+'</p></div>'}).join(''):'<p class="cr">No notices at the moment.</p>'}
function renderTeam(){var T=DB.get().team||[],mk=function(g){var a=T.filter(function(m){return m.group===g});return a.length?a.map(function(m){var i=/^to be/i.test(m.name||'')?'?':(m.name||'?').trim().charAt(0).toUpperCase();return'<div class="tm">'+(m.photo?'<img class="tav" alt="" src="'+esc(m.photo)+'">':'<img class="tav" alt="" src="data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%20100%20100%27%3E%3Crect%20width=%27100%27%20height=%27100%27%20fill=%27%230a7a3a%27/%3E%3Ccircle%20cx=%2750%27%20cy=%2738%27%20r=%2717%27%20fill=%27%23fff%27%20fill-opacity=%27.92%27/%3E%3Cpath%20d=%27M16%2092c0-20%2015-33%2034-33s34%2013%2034%2033z%27%20fill=%27%23fff%27%20fill-opacity=%27.92%27/%3E%3C/svg%3E">')+'<h4>'+esc(m.name)+'</h4><p>'+esc(m.role)+'</p></div>'}).join(''):'<p class="cr">To be announced.</p>'};
 if($('tg-t'))$('tg-t').innerHTML=mk('Teachers');if($('tg-s'))$('tg-s').innerHTML=mk('Students')}
function initPano(){var cv=$('pc');if(!cv)return;var x=cv.getContext('2d'),A=new Image(),B=new Image(),strip=null,tx=0,vx=0,drag=false,lx=0,idle=0,act=$('hv-p360').classList.contains('on'),vis=true,pause=false,dir=-1,dpr=Math.min(window.devicePixelRatio||1,2),W=0,H=0,loaded=0;
 function fade(img,w,h,f){var c=document.createElement('canvas');c.width=w;c.height=h;var g=c.getContext('2d');g.drawImage(img,0,0,w,h);g.globalCompositeOperation='destination-in';var l=g.createLinearGradient(0,0,f,0);l.addColorStop(0,'rgba(0,0,0,0)');l.addColorStop(1,'rgba(0,0,0,1)');g.fillStyle=l;g.fillRect(0,0,w,h);return c}
 function build(){if(loaded<2||!W)return;var ih=Math.round(H*1.12),iw=Math.round(ih*A.width/A.height),iw2=Math.round(ih*B.width/B.height),f=Math.round(Math.min(iw,iw2)*.14),w=iw+iw2-2*f,y=-Math.round((ih-H)*.62),s;
  strip=document.createElement('canvas');strip.width=w;strip.height=H;s=strip.getContext('2d');
  s.drawImage(B,f-iw2,y,iw2,ih);s.drawImage(fade(A,iw,ih,f),0,y);s.drawImage(fade(B,iw2,ih,f),iw-f,y)}
 function size(){var w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;W=Math.round(w*dpr);H=Math.round(h*dpr);cv.width=W;cv.height=H;build()}
 function draw(){if(!strip)return;var w=strip.width,xx=((tx%w)+w)%w-w;for(;xx<W;xx+=w)x.drawImage(strip,xx,0)}
 function fr(){requestAnimationFrame(fr);if(!act||!vis||document.hidden)return;if(!drag){if(Math.abs(vx)>.05){tx+=vx;vx*=.94}else if(!pause&&performance.now()-idle>1200)tx+=dir*1.1*dpr}draw()}
 [].slice.call(document.querySelectorAll('#pctl button')).forEach(function(b){b.onclick=function(){var a=b.getAttribute('data-a');if(a==='l'){dir=1;pause=false}else if(a==='r'){dir=-1;pause=false}else pause=!pause;$('ppause').textContent=pause?'Play':'Pause'}});
 cv.addEventListener('pointerdown',function(e){drag=true;lx=e.clientX;vx=0;try{cv.setPointerCapture(e.pointerId)}catch(r){}cv.style.cursor='grabbing'});
 cv.addEventListener('pointermove',function(e){if(!drag)return;var dx=(e.clientX-lx)*dpr;lx=e.clientX;tx+=dx;vx=dx});
 var up=function(){drag=false;idle=performance.now();cv.style.cursor='grab'};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
 A.onload=B.onload=function(){loaded++;build();draw()};A.onerror=B.onerror=function(){$('pmsg').hidden=false};A.src=cv.getAttribute('data-src');B.src=cv.getAttribute('data-src2')||cv.getAttribute('data-src');
 addEventListener('resize',function(){size();draw()});
 new IntersectionObserver(function(e){vis=e[0].isIntersecting}).observe($('top'));
 window.panoShow=function(on){act=on;if(on){idle=performance.now()-2000;size();draw()}};window.panoX=function(){return tx};window.panoSet=function(v){tx=v;draw()};size();requestAnimationFrame(fr)}
function blobUrl(b64,type){var bin=atob(b64),n=bin.length,u=new Uint8Array(n),i;for(i=0;i<n;i++)u[i]=bin.charCodeAt(i);return URL.createObjectURL(new Blob([u],{type:type}))}
function prepVideo(){var v=$('cvid'),msg=$('vmsg');if(v.getAttribute('data-ready'))return;v.setAttribute('data-ready','1');
 v.addEventListener('playing',function(){msg.hidden=true});
 if(window.VID){
  [].slice.call(v.querySelectorAll('source')).forEach(function(s){s.parentNode.removeChild(s)});
  var T={mp4:'video/mp4',webm:'video/webm'},C={mp4:'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',webm:'video/webm; codecs="vp9, opus"'},all=['mp4','webm'].filter(function(k){return window.VID[k]}),
   q=all.filter(function(k){return v.canPlayType(C[k])}).concat(all.filter(function(k){return!v.canPlayType(C[k])}));
  var next=function(){var k=q.shift();if(!k){msg.hidden=false;return}var u=blobUrl(window.VID[k],T[k]),a=$('vdl');v.src=u;if(a){a.href=u;a.setAttribute('download','campus-tour.'+k)}v.load();var p=v.play();if(p&&p.catch)p.catch(function(){})};
  v.addEventListener('error',next);next()
 }else{
  var ss=v.querySelectorAll('source');if(ss.length)ss[ss.length-1].addEventListener('error',function(){msg.hidden=false});v.addEventListener('error',function(){msg.hidden=false})}}
function setHero(m){qa('#htabs button').forEach(function(x){x.classList.toggle('on',x.dataset.m===m)});['photo','p360','video'].forEach(function(k){$('hv-'+k).classList.toggle('on',k===m)});var v=$('cvid');if(m==='video'){prepVideo();var p=v.play&&v.play();if(p&&p.catch)p.catch(function(){})}else if(v.pause)v.pause();if(window.panoShow)panoShow(m==='p360');$('hint').hidden=m!=='p360';$('pctl').hidden=m!=='p360'}
function initTabs(){qa('#htabs button').forEach(function(b){b.onclick=function(){setHero(b.dataset.m)}})}
function renderGallery(){var g=document.querySelector('.gl');if(!g)return;DB.get().gallery.forEach(function(p){var f=document.createElement('figure');f.innerHTML='<img alt=""><figcaption></figcaption>';f.firstChild.src=p.src;f.firstChild.alt=p.title;f.lastChild.textContent=p.title;g.appendChild(f)})}
applySettings();renderEvents();renderGallery();renderTeam();renderNotes();initTabs();initPano();



/* ---------- load Three.js (local copy first, CDN as fallback), then start the 3D scenes ---------- */
(function(){var CDN='https://cdn.jsdelivr.net/npm/three@0.128.0/';
function ld(a,cb){var s=document.createElement('script');s.src=a[0];s.onload=function(){cb()};s.onerror=function(){if(a.length>1)ld(a.slice(1),cb);else cb()};document.head.appendChild(s)}
ld(['vendor/three.min.js',CDN+'build/three.min.js'],function(){ld(['vendor/OrbitControls.js',CDN+'examples/js/controls/OrbitControls.js'],function(){if(window.THREE&&window.initHero)initHero();if(window.initArena)initArena()})})})();

}

function adminApp(){
var PAGE=document.body.getAttribute('data-page'),NOP=function(){},DUM={style:{},hidden:false,files:[],elements:{},classList:{add:NOP,remove:NOP,toggle:NOP,contains:function(){return false}},addEventListener:NOP,appendChild:NOP,setAttribute:NOP,getAttribute:function(){return null},querySelector:function(){return DUM},focus:NOP,click:NOP};
var $=function(i){return document.getElementById(i)||DUM},qa=function(s){return[].slice.call(document.querySelectorAll(s))},R={};
function th(n){return getComputedStyle(document.documentElement).getPropertyValue('--'+n).trim()}
document.documentElement.setAttribute('data-theme',DB.settings().theme);
var SPORTS=['Football','Cricket','Handball','Kabaddi','Athletics','Swimming','Chess','Badminton'];
var VIEWS={dashboard:'Dashboard',members:'Members Management',events:'Events Management',payments:'Payments Management',budget:'Tour Budget Management',gallery:'Photo Gallery',team:'Leadership Team',notes:'Sports Notes',messages:'Contact Messages',settings:'Website Settings',paysettings:'Payment Settings',account:'My Account'};
var PV={dashboard:['dashboard','members','events','payments','budget','team','messages','paysettings','account'],editor:['settings','gallery','notes','account']};
var HOME={dba:'dba.html',president:'president.html',secretary:'secretary.html',treasurer:'treasurer.html',coordinator:'dashboard.html',editor:'site-editor.html'},ALLOW={dashboard:['president','secretary','treasurer','coordinator'],editor:['editor']};
var RV={president:['dashboard','members','events','payments','budget','team','messages','settings','gallery','notes','paysettings','account'],secretary:['dashboard','members','team','messages','settings','gallery','notes','account'],treasurer:['dashboard','payments','budget','notes','paysettings','account'],coordinator:['dashboard','events','account']};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function tk(n){return'৳'+Number(n||0).toLocaleString('en-IN')}
function today(){return new Date().toISOString().slice(0,10)}
function sum(a,k){return a.reduce(function(s,x){return s+(Number(x[k])||0)},0)}
function toast(m){var t=$('ts');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(function(){t.classList.remove('on')},2600)}
function chip(l,v,s){return'<div class="achip"><small>'+l+'</small><b>'+v+'</b><em>'+s+'</em></div>'}

/* ---------- sign-in: real server accounts only (email + password, one dashboard per role) ---------- */
function wipeLocal(){try{localStorage.removeItem('mcsc.db.v1')}catch(e){}try{sessionStorage.removeItem('mcsc.auth')}catch(e){}}
function leave(){if(window.MCSC)MCSC.logout();wipeLocal();location.replace('admin.html')}
function loginPage(){
 var lf=$('lf'),cf=$('cf'),msg=$('le');
 function go(role){location.replace(HOME[role]||'admin.html')}
 function showChange(oldPw,role){lf.hidden=true;cf.hidden=false;cf.onsubmit=function(e){e.preventDefault();var n1=cf.elements.n1.value,n2=cf.elements.n2.value;
  if(n1!==n2){$('ce').textContent='The two new passwords are not the same.';return}
  $('ce').textContent='Saving…';MCSC.changePassword(oldPw,n1).then(function(r){if(r.ok)go(role);else $('ce').textContent=r.data.error||'Could not change the password.'})}}
 var ff=$('ff'),rf=$('rf'),tok='';
 try{var mm=/reset=([A-Za-z0-9_-]{20,100})/.exec(location.hash);if(mm){tok=mm[1];history.replaceState(null,'',location.pathname)}}catch(e){}
 function show(x){[lf,cf,ff,rf].forEach(function(f){f.hidden=f!==x})}
 $('fg').onclick=function(e){e.preventDefault();show(ff)};$('fb').onclick=function(e){e.preventDefault();show(lf)};
 ff.onsubmit=function(e){e.preventDefault();$('fe').textContent='Sending…';MCSC.api('POST','/forgot',{email:ff.elements.email.value.trim()},{anon:true}).then(function(r){$('fe').textContent=r.ok?(r.data.message||'Check your email.'):(r.data.error||'Could not send the request.')})};
 rf.onsubmit=function(e){e.preventDefault();var n1=rf.elements.n1.value;if(n1!==rf.elements.n2.value){$('re').textContent='The two passwords are not the same.';return}
  $('re').textContent='Saving…';MCSC.api('POST','/reset',{token:tok,newPassword:n1},{anon:true}).then(function(r){if(r.ok){tok='';rf.reset();show(lf);msg.textContent='Password changed. Sign in with the new password.'}else $('re').textContent=r.data.error||'Could not change the password.'})};
 MCSC.ready.then(function(on){
  $('login').hidden=false;
  if(tok)show(rf);
  if(!on){msg.textContent='The secure server is not running, so nobody can sign in. Start it with "npm start" and open this page from http://localhost:8080/admin.html';lf.querySelector('button').disabled=true;return}
  if(MCSC.token()){MCSC.api('GET','/me').then(function(r){if(r.ok&&!r.data.mustChange)go(r.data.role);else if(!r.ok)MCSC.logout()})}
  lf.onsubmit=function(e){e.preventDefault();msg.textContent='Signing in…';wipeLocal();
   var pw=$('lp').value;
   MCSC.cam.start();
   MCSC.login($('lu').value.trim(),pw).then(function(r){
    if(!r.ok){msg.textContent=r.data.error||'Sign in failed.';$('lp').value='';MCSC.cam.shoot(r.data.photoToken);return}
    MCSC.cam.stop();$('lp').value='';msg.textContent='';
    if(r.data.mustChange)showChange(pw,r.data.role);else go(r.data.role)})}})}

function dashPage(){
 var who='';
 MCSC.ready.then(function(on){
  if(!on||!MCSC.token()){location.replace('admin.html');return}
  MCSC.api('GET','/me').then(function(r){
   if(!r.ok||r.data.mustChange){leave();return}
   if(ALLOW[PAGE].indexOf(r.data.role)<0&&r.data.role!=='dba'){location.replace(HOME[r.data.role]||'admin.html');return}
   /* each role has its own page: data-role names the page's owner. The administrator may open any of them. */
   var PR=document.body.getAttribute('data-role');
   if(PAGE==='dashboard'&&r.data.role!=='dba'&&(PR?PR!==r.data.role:HOME[r.data.role]!=='dashboard.html')){location.replace(HOME[r.data.role]||'admin.html');return}
   if(PAGE==='dashboard'){var vr=PR||r.data.role;if(RV[vr])PV.dashboard=RV[vr]}
   qa('#anv button[data-v]').forEach(function(b){b.hidden=(PV[PAGE]||[]).indexOf(b.dataset.v)<0});
   who=r.data.name||r.data.email;wipeLocal();if(r.data.role==='dba'){var tl=$('tod');if(tl)tl.hidden=false}
   $('app').hidden=false;
   var au=document.querySelector('.aus'),sy=document.createElement('span');sy.id='syn';sy.style.cssText='font-size:.8em;opacity:.8';
   if(au){au.insertBefore(sy,au.lastElementChild);au.lastElementChild.textContent=who}
   $('ai').textContent=r.data.name+' · '+r.data.email;
   MCSC.onSync(function(st,msg){sy.textContent=st==='saving'?'● saving…':st==='saved'?'● saved on server':'● NOT saved';if(st==='error')toast(msg)});
   sy.textContent='● connected';
   MCSC.loadState().then(function(s){if(!s){toast('Could not load data from the server');return}
    if(s.state)DB.apply(s.state);else MCSC.push(DB.get(),true);
    if(PAGE==='dashboard'&&!DB.settings().teamSeeded)DB.update(function(d){if(!d.team.length)d.team=DB.teamSeed();d.settings.teamSeeded=true;d.settings.teachersSeeded=true});
    document.documentElement.setAttribute('data-theme',DB.settings().theme);route();badge()});
   MCSC.startPolling(function(st){DB.apply(st);try{route();badge()}catch(x){}})})})}
function serverInit(){}
$('lo').onclick=leave;

/* ---------- navigation ---------- */
function route(){var mine=PV[PAGE]||[],v=location.hash.slice(1);if(mine.indexOf(v)<0)v=mine[0];
 qa('.view').forEach(function(x){x.hidden=x.id!=='v-'+v});
 qa('#anv button[data-v]').forEach(function(b){b.classList.toggle('on',b.dataset.v===v)});
 $('ttl').textContent=VIEWS[v];document.body.classList.remove('so');R[v]();badge();window.scrollTo(0,0)}
addEventListener('hashchange',function(){if(!$('app').hidden)route()});
qa('#anv button[data-v]').forEach(function(b){b.onclick=function(){var v=b.dataset.v;if(location.hash.slice(1)===v)route();else location.hash=v}});
$('hb').onclick=function(){document.body.classList.toggle('so')};$('sh').onclick=function(){document.body.classList.remove('so')};
function badge(){var n=DB.get().messages.filter(function(m){return!m.read}).length;$('mbadge').textContent=n||''}

/* ---------- charts (plain SVG, no libraries) ---------- */
function bars(items,col){var mx=Math.max.apply(null,items.map(function(i){return i.v}).concat([1])),bw=400/items.length;
 return'<svg viewBox="0 0 400 210" class="ach" role="img" aria-label="Bar chart">'+items.map(function(i,k){var h=i.v/mx*140,x=k*bw+bw*.16,w=bw*.68;
 return'<rect x="'+x+'" y="'+(165-h)+'" width="'+w+'" height="'+h+'" rx="5" fill="'+col+'"/><text x="'+(x+w/2)+'" y="'+(159-h)+'" text-anchor="middle" class="av">'+i.v+'</text><text x="'+(x+w/2)+'" y="185" text-anchor="middle" class="al">'+i.l+'</text>'}).join('')+'</svg>'}
function grp(m){var mx=Math.max.apply(null,m.map(function(x){return Math.max(x.a,x.b)}).concat([1])),bw=400/m.length;
 return'<svg viewBox="0 0 400 220" class="ach" role="img" aria-label="Income and expenses chart">'+m.map(function(x,k){var x0=k*bw+bw*.1,w=bw*.36,ha=x.a/mx*130,hb=x.b/mx*130;
 return'<rect x="'+x0+'" y="'+(165-ha)+'" width="'+w+'" height="'+ha+'" rx="4" fill="'+th('b5')+'"/><rect x="'+(x0+w+3)+'" y="'+(165-hb)+'" width="'+w+'" height="'+hb+'" rx="4" fill="#f5b800"/><text x="'+(x0+w)+'" y="185" text-anchor="middle" class="al">'+x.l+'</text>'}).join('')+
 '<rect x="120" y="200" width="10" height="10" rx="2" fill="'+th('b5')+'"/><text x="135" y="209" class="al">Income</text><rect x="200" y="200" width="10" height="10" rx="2" fill="#f5b800"/><text x="215" y="209" class="al">Expenses</text></svg>'}
function donut(it){var real=it.reduce(function(a,i){return a+i.v},0),tot=real||1,r=52,c=2*Math.PI*r,off=0;
 return'<svg viewBox="0 0 280 170" class="ach" role="img" aria-label="Payment status chart"><circle cx="85" cy="85" r="'+r+'" fill="none" stroke="'+th('b1')+'" stroke-width="24"/><g transform="rotate(-90 85 85)">'+it.map(function(i){var l=i.v/tot*c,s='<circle cx="85" cy="85" r="'+r+'" fill="none" stroke="'+i.c+'" stroke-width="24" stroke-dasharray="'+l+' '+(c-l)+'" stroke-dashoffset="'+(-off)+'"/>';off+=l;return s}).join('')+'</g><text x="85" y="93" text-anchor="middle" class="at">'+real+'</text>'+
 it.map(function(i,k){return'<rect x="170" y="'+(55+k*28)+'" width="12" height="12" rx="3" fill="'+i.c+'"/><text x="188" y="'+(65+k*28)+'" class="al">'+i.l+' ('+i.v+')</text>'}).join('')+'</svg>'}

/* ---------- dashboard ---------- */
R.dashboard=function(){var d=DB.get(),t=today(),up=d.events.filter(function(e){return e.date>=t}).sort(function(a,b){return a.date.localeCompare(b.date)}),
 pd=d.payments.filter(function(p){return p.status==='Paid'}),pn=d.payments.filter(function(p){return p.status==='Pending'}),rj=d.payments.filter(function(p){return p.status==='Rejected'}),paid=sum(pd,'amount'),exp=sum(d.budget,'actual');
 $('s1').textContent=d.members.length;$('s1s').textContent=d.members.filter(function(m){return m.status==='Active'}).length+' active';
 $('s2').textContent=up.length;$('s2s').textContent=up.filter(function(e){return e.published}).length+' shown on website';
 $('s3').textContent=tk(paid);$('s3s').textContent=pn.length+' pending verification';
 $('s4').textContent=tk(exp);$('s4s').textContent='Balance '+tk(paid-exp);
 $('demo').hidden=!d.settings.demo;
 $('c1').innerHTML=bars(SPORTS.map(function(s){return{l:s.slice(0,5),v:d.members.filter(function(m){return m.sport===s}).length}}),th('b5'));
 var ms=[],i,x,k;for(i=5;i>=0;i--){x=new Date();x.setDate(1);x.setMonth(x.getMonth()-i);k=x.toISOString().slice(0,7);ms.push({k:k,l:x.toLocaleString('en',{month:'short'}),a:0,b:0})}
 pd.forEach(function(p){ms.forEach(function(m){if(p.date.slice(0,7)===m.k)m.a+=Number(p.amount)||0})});d.budget.forEach(function(b){ms.forEach(function(m){if((b.date||'').slice(0,7)===m.k)m.b+=Number(b.actual)||0})});
 $('c2').innerHTML=grp(ms);
 $('c3').innerHTML=donut([{l:'Paid',v:pd.length,c:th('b5')},{l:'Pending',v:pn.length,c:'#f5b800'},{l:'Rejected',v:rj.length,c:'#e53935'}]);
 $('ue').innerHTML=up.length?up.slice(0,5).map(function(e){return'<div><b>'+esc(e.title)+'</b><span>'+esc(e.date)+'</span></div>'}).join(''):'<p class="cr">No upcoming events.</p>';
 $('rp').innerHTML=d.payments.length?d.payments.slice().sort(function(a,b){return b.date.localeCompare(a.date)}).slice(0,5).map(function(p){return'<div><b>'+esc(p.name)+'</b><span>'+tk(p.amount)+' · '+esc(p.status)+'</span></div>'}).join(''):'<p class="cr">No payments yet.</p>'};
$('democlr').onclick=function(){if(confirm('Remove all sample data? Your settings are kept.')){DB.save(DB.empty());R.dashboard();badge();toast('Sample data cleared')}};

/* ---------- generic CRUD (members, events, payments, budget) ---------- */
var CF={
members:{n:'Member',s:function(a,b){return(b.joined||'').localeCompare(a.joined||'')},
 cols:[['name','Name'],['roll','Class / Roll'],['phone','Phone'],['sport','Sport'],['status','Status','b'],['joined','Joined']],
 f:[{k:'name',l:'Full name',r:1},{k:'roll',l:'Class / Roll',r:1},{k:'phone',l:'Mobile (01XXXXXXXXX)',t:'tel',r:1,p:/^01[3-9]\d{8}$/,pm:'Enter a valid 11-digit mobile number.'},{k:'sport',l:'Sport',o:SPORTS},{k:'status',l:'Status',o:['Active','Pending','Inactive']},{k:'joined',l:'Joined on',t:'date'}],
 d:function(){return{sport:SPORTS[0],status:'Active',joined:today()}}},
events:{n:'Event',s:function(a,b){return a.date.localeCompare(b.date)},
 cols:[['title','Event'],['date','Date'],['venue','Venue'],['sport','Sport'],['published','Website','y']],
 f:[{k:'title',l:'Event title',r:1},{k:'date',l:'Date',t:'date',r:1},{k:'venue',l:'Venue'},{k:'sport',l:'Sport',o:['All sports'].concat(SPORTS)},{k:'desc',l:'Description',t:'area'},{k:'published',l:'Show on the website',t:'check'}],
 d:function(){return{date:today(),sport:'All sports',published:true}}},
payments:{n:'Payment',s:function(a,b){return b.date.localeCompare(a.date)},
 cols:[['date','Date'],['name','Member'],['method','Method'],['trx','TrxID'],['amount','Amount','m'],['status','Status','b']],
 f:[{k:'date',l:'Date',t:'date',r:1},{k:'name',l:'Member name',r:1},{k:'method',l:'Method',o:['bKash','Nagad','Rocket','Cash']},{k:'trx',l:'Transaction ID'},{k:'amount',l:'Amount (৳)',t:'number',r:1},{k:'status',l:'Status',o:['Paid','Pending','Rejected']}],
 d:function(){return{date:today(),method:'bKash',status:'Paid',amount:DB.settings().fee}}},
notes:{n:'Note',s:function(a,b){return(b.pinned?1:0)-(a.pinned?1:0)||(b.date||'').localeCompare(a.date||'')},
 cols:[['title','Title'],['sport','Sport'],['date','Date'],['pinned','Pinned','p'],['published','Website','y']],
 f:[{k:'title',l:'Title',r:1},{k:'sport',l:'Sport',o:['All sports'].concat(SPORTS)},{k:'date',l:'Date',t:'date'},{k:'text',l:'Note',t:'area',r:1},{k:'pinned',l:'Pin to the top',t:'check'},{k:'published',l:'Show on the website notice board',t:'check'}],
 d:function(){return{sport:'All sports',date:today(),pinned:false,published:true}}},
team:{n:'Team member',s:function(a,b){return(a.group||'').localeCompare(b.group||'')||(a.name||'').localeCompare(b.name||'')},
 cols:[['photo','Photo','i'],['name','Name'],['role','Role'],['group','Team']],
 f:[{k:'group',l:'Team (Teachers = Sir / Madam)',o:['Teachers','Students']},{k:'name',l:'Full name',r:1},{k:'role',l:'Role / designation',r:1},{k:'photo',l:'Photo (choose a picture for this leader)',t:'photo'}],
 d:function(){return{group:'Teachers',photo:''}}},
budget:{n:'Budget line',s:function(a,b){return(b.date||'').localeCompare(a.date||'')},
 cols:[['date','Date'],['tour','Tour'],['category','Category'],['desc','Description'],['planned','Planned','m'],['actual','Actual','m']],
 f:[{k:'tour',l:'Tour / trip name',r:1},{k:'date',l:'Date',t:'date',r:1},{k:'category',l:'Category',o:['Transport','Food','Stay','Tickets','Equipment','Other']},{k:'desc',l:'Description'},{k:'planned',l:'Planned (৳)',t:'number'},{k:'actual',l:'Actual spent (৳)',t:'number'}],
 d:function(){return{date:today(),category:'Transport',planned:0,actual:0}}}};
function fmt(v,t){if(t==='i')return v?'<img class="thm" src="'+v+'" alt="">':'<span class="thm">👤</span>';if(t==='b')return'<span class="bd '+esc(String(v).toLowerCase())+'">'+esc(v)+'</span>';if(t==='m')return tk(v);if(t==='p')return v?'<span class="bd active">Pinned</span>':'';if(t==='y')return v?'<span class="bd active">Shown</span>':'<span class="bd inactive">Hidden</span>';return esc(v)}
function tbl(key){var c=CF[key],q=($('q-'+key).value||'').toLowerCase(),rows=DB.get()[key].filter(function(r){return!q||JSON.stringify(r).toLowerCase().indexOf(q)>-1}).sort(c.s);
 $('t-'+key).innerHTML='<thead><tr>'+c.cols.map(function(x){return'<th>'+x[1]+'</th>'}).join('')+'<th></th></tr></thead><tbody>'+(rows.length?rows.map(function(r){
 return'<tr>'+c.cols.map(function(x){return'<td data-l="'+x[1]+'">'+fmt(r[x[0]],x[2])+'</td>'}).join('')+'<td class="ac">'+(key==='payments'&&r.status==='Pending'?'<button data-a="v" data-id="'+r.id+'">Verify</button>':'')+'<button data-a="e" data-id="'+r.id+'">Edit</button><button class="d" data-a="d" data-id="'+r.id+'">Delete</button></td></tr>'}).join(''):'<tr><td colspan="'+(c.cols.length+1)+'" style="text-align:center;color:#51627f">No records found.</td></tr>')+'</tbody>'}
function field(f,v){var n=' name="'+f.k+'"'+(f.r?' required':'');
 if(f.o)return'<label>'+f.l+'<select'+n+'>'+f.o.map(function(o){return'<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>'}).join('')+'</select></label>';
 if(f.t==='photo')return'<label>'+f.l+'<input type="file" name="'+f.k+'" accept="image/*"></label>';
 if(f.t==='area')return'<label>'+f.l+'<textarea'+n+' rows="3">'+esc(v)+'</textarea></label>';
 if(f.t==='check')return'<label class="ck"><input type="checkbox" name="'+f.k+'"'+(v?' checked':'')+'> '+f.l+'</label>';
 return'<label>'+f.l+'<input'+n+' type="'+(f.t||'text')+'" value="'+esc(v)+'"'+(f.t==='number'?' min="0" step="1"':'')+'></label>'}
function closeM(){$('mo').hidden=true;$('md').innerHTML=''}
$('mo').onclick=function(e){if(e.target===this)closeM()};addEventListener('keydown',function(e){if(e.key==='Escape')closeM()});
function openF(key,id){var c=CF[key],r=id?DB.get()[key].filter(function(x){return x.id===id})[0]:c.d();if(!r)return;
 $('md').innerHTML='<h3>'+(id?'Edit ':'Add ')+c.n+'</h3><form id="mf" novalidate>'+c.f.map(function(f){return field(f,r[f.k])}).join('')+'<div class="err" id="me"></div><div class="btns"><button type="button" class="btn g s" id="mc">Cancel</button><button class="btn s" type="submit">Save</button></div></form>';
 $('mo').hidden=false;var fi=$('mf').querySelector('input,select,textarea');if(fi)fi.focus();$('mc').onclick=closeM;
 $('mf').onsubmit=function(e){e.preventDefault();var v={},err='',fm=this;
  c.f.forEach(function(f){var el=fm.elements[f.k],x=f.t==='photo'?(r.photo||''):f.t==='check'?el.checked:el.value.trim();if(f.t==='number')x=Number(x)||0;
   if(!err&&f.r&&x===''){err=f.l+' is required.'}else if(!err&&f.p&&x&&!f.p.test(x)){err=f.pm}v[f.k]=x});
  if(!err&&key==='payments'&&v.trx&&DB.get().payments.some(function(p){return p.trx&&p.trx.toUpperCase()===v.trx.toUpperCase()&&p.id!==id}))err='This transaction ID already exists.';
  if(err){$('me').textContent=err;return}
  function save(){try{DB.update(function(d){if(id){Object.assign(d[key].filter(function(x){return x.id===id})[0],v)}else{v.id=DB.uid(key.charAt(0));d[key].push(v)}})}catch(x){$('me').textContent='Browser storage is full.';return}closeM();R[key]();toast(c.n+' saved')}
  var pf=fm.elements.photo,pfile=pf&&pf.files&&pf.files[0];if(pfile){shrink(pfile,function(s){if(s)v.photo=s;save()},320)}else save()}}
function bind(key){$('t-'+key).onclick=function(e){var b=e.target.closest('button[data-a]');if(!b)return;var id=b.dataset.id,a=b.dataset.a;
 if(a==='e')openF(key,id);
 else if(a==='d'){if(confirm('Delete this record? This cannot be undone.')){DB.update(function(d){d[key]=d[key].filter(function(x){return x.id!==id})});R[key]();toast('Record deleted')}}
 else if(a==='v'){DB.update(function(d){var p=d.payments.filter(function(x){return x.id===id})[0];p.status='Paid';var m=d.members.filter(function(x){return x.id===p.memberId})[0];if(m&&m.status==='Pending')m.status='Active'});R.payments();toast('Payment verified')}};
 $('q-'+key).oninput=function(){tbl(key)}}
['members','events','payments','budget','team','notes'].forEach(bind);
qa('[data-add]').forEach(function(b){b.onclick=function(){openF(b.dataset.add)}});
R.members=function(){tbl('members')};R.events=function(){tbl('events')};R.team=function(){tbl('team')};R.notes=function(){tbl('notes')};
R.payments=function(){var p=DB.get().payments,pd=p.filter(function(x){return x.status==='Paid'}),pe=p.filter(function(x){return x.status==='Pending'});
 $('ps').innerHTML=chip('Received',tk(sum(pd,'amount')),pd.length+' payments')+chip('Pending',tk(sum(pe,'amount')),pe.length+' to verify')+chip('Rejected',p.filter(function(x){return x.status==='Rejected'}).length,'payments');tbl('payments')};
R.budget=function(){var b=DB.get().budget,pl=sum(b,'planned'),ac=sum(b,'actual'),t={};
 $('bs').innerHTML=chip('Planned',tk(pl),'all tours')+chip('Actual spent',tk(ac),'so far')+chip(ac>pl?'Over budget':'Remaining',tk(Math.abs(pl-ac)),ac>pl?'review spending':'within budget');
 b.forEach(function(x){var k=x.tour||'Other';t[k]=t[k]||{p:0,a:0};t[k].p+=Number(x.planned)||0;t[k].a+=Number(x.actual)||0});
 $('bt').innerHTML=Object.keys(t).length?Object.keys(t).map(function(k){var o=t[k],pc=o.p?Math.min(100,o.a/o.p*100):(o.a?100:0);return'<div class="tr"><div><b>'+esc(k)+'</b><span>'+tk(o.a)+' spent of '+tk(o.p)+'</span></div><div class="bar"><i class="'+(o.a>o.p?'ov':'')+'" style="width:'+pc+'%"></i></div></div>'}).join(''):'<p class="cr">No budget lines yet.</p>';tbl('budget')};

/* ---------- photo gallery ---------- */
function shrink(f,cb,mx){mx=mx||1000;var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var s=Math.min(1,mx/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext('2d').drawImage(im,0,0,c.width,c.height);cb(c.toDataURL('image/jpeg',.72))};im.onerror=function(){cb(null)};im.src=r.result};r.onerror=function(){cb(null)};r.readAsDataURL(f)}
R.gallery=function(){var g=DB.get().gallery,used=JSON.stringify(DB.get()).length/1048576;
 $('gst').textContent=g.length+' photos · storage used about '+used.toFixed(1)+' MB of roughly 5 MB';
 $('gg').innerHTML=g.length?g.map(function(p){return'<figure><img src="'+p.src+'" alt="'+esc(p.title)+'"><figcaption><b>'+esc(p.title)+'</b><div class="ac"><button data-a="r" data-id="'+p.id+'">Rename</button><button class="d" data-a="d" data-id="'+p.id+'">Delete</button></div></figcaption></figure>'}).join(''):'<div class="apn" style="grid-column:1/-1">No photos uploaded yet.</div>'};
$('gu').onchange=function(){var fs=[].slice.call(this.files),inp=this,n=0;(function next(){var f=fs.shift();if(!f){inp.value='';R.gallery();toast(n+' photo(s) added');return}
 shrink(f,function(src){if(!src){next();return}try{DB.update(function(d){d.gallery.push({id:DB.uid('g'),title:f.name.replace(/\.[^.]+$/,''),src:src,date:today()})});n++}catch(e){alert('Browser storage is full. Delete some photos first (a real backend would store photos on a server).');fs=[]}next()})})()};
$('gg').onclick=function(e){var b=e.target.closest('button[data-a]');if(!b)return;var id=b.dataset.id;
 if(b.dataset.a==='d'){if(confirm('Delete this photo?')){DB.update(function(d){d.gallery=d.gallery.filter(function(x){return x.id!==id})});R.gallery()}}
 else{var p=DB.get().gallery.filter(function(x){return x.id===id})[0],t=prompt('Photo title',p.title);if(t&&t.trim()){DB.update(function(d){d.gallery.filter(function(x){return x.id===id})[0].title=t.trim()});R.gallery()}}};

/* ---------- contact messages ---------- */
R.messages=function(){var m=DB.get().messages.slice().sort(function(a,b){return b.date.localeCompare(a.date)});
 $('ml').innerHTML=m.length?m.map(function(x){return'<div class="msg'+(x.read?'':' un')+'"><div><b>'+esc(x.name)+'</b> <small>'+esc(x.contact)+' · '+esc(x.date)+'</small>'+(x.read?'':' <span class="bd pending">New</span>')+'<p>'+esc(x.text)+'</p></div><div class="ac"><button data-a="r" data-id="'+x.id+'">'+(x.read?'Mark unread':'Mark read')+'</button>'+(/@/.test(x.contact)?'<a class="ab" href="mailto:'+esc(x.contact)+'?subject=Re:%20your%20message">Reply</a>':'')+'<button class="d" data-a="d" data-id="'+x.id+'">Delete</button></div></div>'}).join(''):'<div class="apn">No messages yet. Messages sent from the website contact form appear here.</div>'};
$('ml').onclick=function(e){var b=e.target.closest('button[data-a]');if(!b)return;var id=b.dataset.id;
 if(b.dataset.a==='d'){if(confirm('Delete this message?')){DB.update(function(d){d.messages=d.messages.filter(function(x){return x.id!==id})})}}
 else DB.update(function(d){var x=d.messages.filter(function(y){return y.id===id})[0];x.read=!x.read});R.messages();badge()};

/* ---------- website settings and data tools ---------- */
var SK=['clubName','theme','banner','phone','email','address'],PK=['bkash','nagad','rocket'];
R.settings=function(){var s=DB.settings(),f=$('sf').elements;SK.forEach(function(k){f[k].value=s[k]==null?'':s[k]})};
$('sf').onsubmit=function(e){e.preventDefault();var f=this.elements;
 DB.update(function(d){SK.forEach(function(k){d.settings[k]=f[k].value.trim()});d.settings.themeChosen=true});
 document.documentElement.setAttribute('data-theme',f.theme.value);toast('Website settings saved. Refresh the website to see them.')};
R.paysettings=function(){var s=DB.settings(),f=$('pf').elements;PK.concat(['fee']).forEach(function(k){f[k].value=s[k]==null?'':s[k]})};
$('pf').onsubmit=function(e){e.preventDefault();var f=this.elements;
 DB.update(function(d){PK.forEach(function(k){d.settings[k]=f[k].value.trim()});d.settings.fee=Math.max(0,Number(f.fee.value)||0)});toast('Payment settings saved')};
R.account=function(){$('af').reset()};
$('af').onsubmit=function(e){e.preventDefault();var f=this.elements;
 if(f.n1.value!==f.n2.value){toast('The two new passwords are not the same');return}
 MCSC.changePassword(f.old.value,f.n1.value).then(function(r){if(r.ok){$('af').reset();toast('Password changed. Other devices were signed out.')}else toast(r.data.error||'Password was not changed')})};

if(PAGE==='login')loginPage();else dashPage();
}

(['login','dashboard','editor'].indexOf(document.body.getAttribute('data-page'))>-1?adminApp:siteApp)();
