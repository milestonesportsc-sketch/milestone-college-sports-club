// Live 3D Arena (Three.js r128). initArena() is called by script.js once Three.js has loaded.
window.initArena=function(){
var $=function(i){return document.getElementById(i)},PI=Math.PI,sin=Math.sin;
function fail(){$('arena').querySelector('.sub').textContent='The 3D engine could not start (needs WebGL and internet access). Please reload.'}
if(!window.THREE||!THREE.OrbitControls){fail();return}
var cv=$('cv'),vw=cv.parentNode,R,S=new THREE.Scene(),C=new THREE.PerspectiveCamera(50,1,.5,700),O=new THREE.OrbitControls(C,cv);
try{R=new THREE.WebGLRenderer({canvas:cv,antialias:true})}catch(e){fail();return}
R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.12;R.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<700?1.5:2));
S.background=ctex(2,256,function(c,w,h){var g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#2f78cf');g.addColorStop(.55,'#7fb8ee');g.addColorStop(.85,'#cfe6fb');g.addColorStop(1,'#eef6ff');c.fillStyle=g;c.fillRect(0,0,w,h)});S.fog=new THREE.Fog(0xd6ebff,260,700);
O.enableDamping=true;O.maxPolarAngle=1.5;O.minDistance=5;O.maxDistance=320;O.autoRotateSpeed=1.5;
S.add(new THREE.HemisphereLight(0xdcecff,0x5d7f4f,.85));
var hi=Math.min(window.innerWidth,window.innerHeight)>600,sun=new THREE.DirectionalLight(0xfff0d2,1.2),sh=sun.shadow.camera;sun.position.set(20,35,15);sun.castShadow=true;sun.shadow.mapSize.set(hi?2048:1024,hi?2048:1024);sun.shadow.bias=-.0004;sh.left=sh.bottom=-32;sh.right=sh.top=32;S.add(sun);S.add(sun.target);
var G,ball,MM={},CLD=new THREE.Group();S.add(CLD);
/* soft sky clouds (sprites on a ring far away, drifting slowly) */
(function(){var tx=ctex(256,128,function(c,w,h){var i,x,y,r,g;for(i=0;i<46;i++){x=40+Math.random()*176;y=62+(Math.random()-.5)*34;r=16+Math.random()*26;g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,7);c.fill()}}),i,a,sp3;
 for(i=0;i<12;i++){a=i/12*PI*2+Math.random()*.4;sp3=new THREE.Sprite(new THREE.SpriteMaterial({map:tx,transparent:true,opacity:.55+Math.random()*.3,fog:false,depthWrite:false}));sp3.position.set(Math.cos(a)*480,55+Math.random()*70,Math.sin(a)*480);sp3.scale.set(190+Math.random()*120,76+Math.random()*30,1);CLD.add(sp3)}})();
function mt(c){return MM[c]||(MM[c]=new THREE.MeshStandardMaterial({color:c,roughness:.8}))}
function bx(w,h,d,c,x,y,z,p){var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mt(c));m.position.set(x||0,y||0,z||0);m.castShadow=true;(p||G).add(m);return m}
function sp(r,c,x,y,z,p){var m=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),mt(c));m.position.set(x,y,z);m.castShadow=true;(p||G).add(m);return m}
var NG=0;
function pl(w,d,c,x,y,z){if(NG&&w>=60&&d>=40)return null;var m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mt(c));m.rotation.x=-PI/2;m.position.set(x,y,z);m.receiveShadow=true;G.add(m);return m}
function lim(p,l,w,c,x,y,e,f){var g=new THREE.Group();g.position.set(x,y,0);cy(w*.55,w*.42,l,c,0,-l/2,0,g);if(f)bx(w*1.1,.12,w*2,e,0,-l,w*.5,g);else sp(w*.5,c,0,-l,0,g);sp(w*.58,c,0,0,0,g);p.add(g);return g}
/* ===== Students: real kits, faces, hair, numbers, shoes and bags. Every body part is merged into one mesh (7 draw calls per student) ===== */
var KIT='uniform',BC={},VMAT,V3=THREE.Vector3,M4=THREE.Matrix4,UB,US,HG,NUMS=3,TX={},
 SKIN=[0xe0ac86,0xd9a07a,0xc68642,0xb8794f,0x8d5524,0xf1c27d,0xa56a43],HAIR=[0x0d0d0d,0x1a1a1a,0x2a1a10,0x3b2417];
function cached(k,f){return BC[k]||(BC[k]=f())}
function vmat(){return VMAT||(VMAT=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,metalness:0}))}
function lum(c){return .3*(c>>16&255)/255+.59*(c>>8&255)/255+.11*(c&255)/255}
function shd(c,f){var r=Math.min(255,(c>>16&255)*f|0),g=Math.min(255,(c>>8&255)*f|0),b=Math.min(255,(c&255)*f|0);return r<<16|g<<8|b}
function add(P,g,c,x,y,z,sx,sy,sz,par,rx,ry,rz){var m=new M4().compose(new V3(x||0,y||0,z||0),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx||0,ry||0,rz||0)),new V3(sx||1,sy||1,sz||1));if(par)m.premultiply(par);P.push({g:g,c:new THREE.Color(c),m:m})}
function jt(x,y,z,rx,rz){return new M4().compose(new V3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx||0,0,rz||0)),new V3(1,1,1))}
function mergeP(P){var pos=[],nor=[],col=[],v=new V3(),G2=new THREE.BufferGeometry();
 P.forEach(function(p){var g=p.g.index?p.g.toNonIndexed():p.g,a=g.attributes.position,n=g.attributes.normal,nm=new THREE.Matrix3().getNormalMatrix(p.m),i;
  for(i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(p.m);pos.push(v.x,v.y,v.z);v.fromBufferAttribute(n,i).applyMatrix3(nm).normalize();nor.push(v.x,v.y,v.z);col.push(p.c.r,p.c.g,p.c.b)}});
 G2.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));G2.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));G2.setAttribute('color',new THREE.Float32BufferAttribute(col,3));return G2}
function ub(){return UB||(UB=new THREE.BoxGeometry(1,1,1))}
function us(){return US||(US=new THREE.SphereGeometry(1,14,10))}
function BX(P,c,w,h,d,x,y,z,par,rx,ry,rz){add(P,ub(),c,x,y,z,w,h,d,par,rx,ry,rz)}
function SP(P,c,r,x,y,z,sx,sy,sz,par){add(P,us(),c,x,y,z,r*(sx||1),r*(sy||1),r*(sz||1),par)}
function CYL(P,c,rt,rb,h,x,y,z,sx,sz,par,rx){add(P,new THREE.CylinderGeometry(rt,rb,h,14),c,x,y,z,sx||1,1,sz||1,par,rx)}
/* what each sport wears */
function kitOf(a,b,role){var k=KIT,K={top:a,bot:b,sleeve:'short',lower:'shorts',sock:null,shoe:0xf4f4f4,sole:0xd8d8d8,bare:0,hat:null,glove:0,pad:0,bib:0,lan:0,num:0,trim:lum(a)>.62?0x1a1a1a:0xffffff,armband:0,belt:0,goggles:0},pick=function(l){return l[Math.random()*l.length|0]};
 if(k==='uniform'){K.top=pick([0x5b5f73,0x666a78,0x535868,0x6f7385]);K.bot=pick([0x20242f,0x181a20,0x2a2d38]);K.lower='trousers';K.lan=1;K.belt=1;K.trim=0x1f6b3a;K.armband=a;K.shoe=Math.random()<.65?0xf4f4f4:0x1c1c1c;K.sole=K.shoe===0xf4f4f4?0xd0d0d0:0x333333}
 else if(k==='football'){K.sock=a;K.num=1;K.shoe=pick([0x111111,0xf5f5f5,0xff5a1f,0x1ec8ff,0xc6ff00]);K.sole=0x222222;if(role==='gk'){K.sleeve='long';K.glove=0x7cf24a;K.sock=0x2b2b2b;K.shoe=0x111111}}
 else if(k==='cricket'){K.sleeve='long';K.lower='trousers';K.hat='cap';K.top=role==='ump'?0xffffff:a;K.bot=role==='ump'?0x2a2a2a:0xf6f6f2;K.glove=role==='bat'?0xffffff:0;K.pad=role==='bat'?1:0;if(role==='bat')K.hat='helmet'}
 else if(k==='handball'){K.sock=0xffffff;K.num=1;K.shoe=pick([0xf4f4f4,0x2563eb,0xffb400]);if(role==='gk'){K.sleeve='long';K.glove=0xff7a00;K.sock=0x222222}}
 else if(k==='volley'){K.num=1;K.sock=0xffffff;K.shoe=pick([0xf4f4f4,0x38bdf8])}
 else if(k==='kabaddi'){K.bare=1;K.num=0;K.bot=shd(b===0xffffff?0x1a2b52:b,1)}
 else if(k==='athletics'){K.sleeve='none';K.bib=1;K.bot=0x151d33;K.shoe=pick([0xffe000,0xff5a1f,0x1ec8ff]);K.sole=0x222222}
 else if(k==='swim'){K.top=null;K.sleeve='none';K.lower='jammer';K.bare=1;K.hat='swimcap';K.goggles=1;K.bot=a;K.num=0}
 return K}
function torsoGeo(K,sk){return cached('t'+[K.top,K.bot,K.lower,K.lan,K.belt,K.trim,K.sleeve,K.pad,sk,KIT].join(),function(){var P=[],tp=K.top===null?sk:K.top,sd=1;
 CYL(P,K.bot,.262,.275,.31,0,1.0,0,1,.66);
 if(K.belt){CYL(P,0x101010,.275,.275,.05,0,1.14,0,1,.67);BX(P,0xc9c9c9,.055,.04,.02,0,1.14,.185)}
 CYL(P,tp,.305,.262,.64,0,1.45,0,1,.62);SP(P,tp,.2,0,1.745,0,1.5,.3,.75);
 CYL(P,sk,.07,.078,.2,0,1.88,-.005,1,1);
 if(K.top!==null){CYL(P,K.lan?shd(tp,1.18):K.trim,.1,.112,.05,0,1.79,0,1,1.02);
  if(K.lan){[-1,1].forEach(function(q){BX(P,0x1f6b3a,.17,.04,.12,q*.25,1.765,0,null,0,0,-q*.22);BX(P,0xf5b800,.035,.014,.035,q*.255,1.79,0)});
   BX(P,shd(tp,.82),.09,.1,.02,-.13,1.52,.169);BX(P,shd(tp,.82),.09,.1,.02,.13,1.52,.169);BX(P,0xc62828,.04,.05,.012,.13,1.53,.181);
   BX(P,0x1b3a8c,.035,.5,.012,-.032,1.55,.177,null,0,0,.1);BX(P,0x1b3a8c,.035,.5,.012,.032,1.55,.177,null,0,0,-.1);BX(P,0xffffff,.085,.115,.014,0,1.29,.18);BX(P,0xc62828,.085,.025,.016,0,1.34,.181)}
  else if(K.sleeve!=='none'){BX(P,K.trim,.022,.5,.2,-.288,1.46,0);BX(P,K.trim,.022,.5,.2,.288,1.46,0);CYL(P,K.trim,.268,.268,.03,0,1.15,0,1,.63)}}
 return mergeP(P)})}
function armGeo(K,sk,left){return cached('a'+[K.top,K.sleeve,K.glove,K.armband,left,sk,KIT].join(),function(){var P=[],tp=K.top===null?sk:K.top,sl=K.sleeve,ek=jt(0,-.33,0,-.28,0),hc=K.glove||sk;
 SP(P,sl==='short'||sl==='long'?tp:sk,.108,0,0,0);
 if(sl==='short'){CYL(P,tp,.1,.09,.2,0,-.11,0);CYL(P,sk,.082,.074,.15,0,-.255,0)}else if(sl==='long')CYL(P,tp,.098,.082,.33,0,-.165,0);else CYL(P,sk,.088,.074,.33,0,-.165,0);
 SP(P,sl==='long'?tp:sk,.075,0,-.33,0);
 if(sl==='long'){CYL(P,tp,.078,.066,.25,0,-.125,0,1,1,ek);CYL(P,shd(tp,.85),.068,.068,.03,0,-.255,0,1,1,ek);CYL(P,sk,.05,.043,.05,0,-.29,0,1,1,ek)}else CYL(P,sk,.066,.046,.31,0,-.155,0,1,1,ek);
 SP(P,hc,K.glove?.068:.058,0,-.36,0,.85,1.25,.7,ek);SP(P,hc,.026,left?.05:-.05,-.33,.03,1,1.4,1,ek);
 if(K.glove)CYL(P,0xffffff,.058,.058,.04,0,-.3,0,1,1,ek);
 if(K.armband&&left)CYL(P,K.armband,.106,.1,.06,0,-.13,0);
 if(K.lan&&!left){CYL(P,0x151515,.056,.056,.035,0,-.27,0,1,1,ek);BX(P,0x8fb0d8,.045,.012,.045,0,-.27,.052,ek)}
 return mergeP(P)})}
function legGeo(K,sk){return cached('l'+[K.lower,K.bot,K.sock,K.shoe,K.sole,K.pad,K.bare,sk,KIT].join(),function(){var P=[],lo=K.lower,bt=K.bot,kn=jt(0,-.42,0,0,0);
 if(lo==='trousers'){CYL(P,bt,.135,.106,.44,0,-.21,0);SP(P,bt,.104,0,-.42,0);CYL(P,bt,.103,.09,.42,0,-.21,0,1,1,kn);CYL(P,shd(bt,.8),.092,.092,.03,0,-.4,0,1,1,kn);
  if(K.pad){BX(P,0xf4f4f0,.15,.4,.07,0,-.2,.09,kn);SP(P,0xe8e8e0,.075,0,-.02,.1,1.1,.8,.8,kn);BX(P,0xf4f4f0,.14,.26,.06,0,-.18,.12)}}
 else if(lo==='shorts'){CYL(P,bt,.145,.136,.3,0,-.15,0);CYL(P,sk,.112,.098,.16,0,-.37,0);SP(P,sk,.098,0,-.42,0);
  if(K.sock){CYL(P,K.sock,.094,.07,.37,0,-.19,0,1,1,kn);CYL(P,0xffffff,.098,.096,.035,0,-.02,0,1,1,kn)}else CYL(P,sk,.092,.058,.4,0,-.2,0,1,1,kn)}
 else{CYL(P,bt,.14,.112,.46,0,-.23,0);SP(P,bt,.106,0,-.43,0);CYL(P,sk,.088,.058,.4,0,-.2,0,1,1,kn)}
 if(K.bare){BX(P,sk,.1,.06,.23,0,-.43,.06,kn);SP(P,sk,.052,0,-.43,.18,1,.6,.9,kn)}
 else{BX(P,K.shoe,.125,.085,.26,0,-.43,.06,kn);SP(P,K.shoe,.063,0,-.43,.185,1,.72,1,kn);BX(P,K.sole,.132,.028,.285,0,-.475,.065,kn);BX(P,0xffffff,.05,.03,.1,0,-.395,.11,kn)}
 return mergeP(P)})}
function hairGeo(K,st,hr,sk,a){return cached('h'+[K.hat,st,hr,sk,a,K.goggles].join(),function(){var P=[];
 [-1,1].forEach(function(q){SP(P,sk,.04,q*.185,1.96,0,.5,1,.8)});SP(P,sk,.03,0,1.945,.2,.9,1,1);
 if(K.hat==='swimcap'){SP(P,a,.212,0,2.01,-.005,.93,.98,1.02);BX(P,0x111111,.37,.035,.05,0,2.0,.17);[-1,1].forEach(function(q){SP(P,0x1a2a3a,.045,q*.07,2.0,.2,1.3,.8,.5)})}
 else if(K.hat==='helmet'){SP(P,0x1d4ed8,.228,0,2.03,-.01,.96,.88,1.05);BX(P,0x0f2e8a,.22,.03,.08,0,2.0,.21);[-.06,0,.06].forEach(function(x){BX(P,0xd0d0d0,.012,.1,.012,x,1.95,.225)});BX(P,0xd0d0d0,.2,.012,.012,0,1.97,.225)}
 else{SP(P,hr,.213,0,2.065,-.035,.93,.72,.98);
  if(st===3){BX(P,hr,.14,.05,.08,.07,2.115,.15,null,.45,0,.3);SP(P,hr,.07,-.1,2.12,.1,1.2,.6,1)}
  else if(st===4){SP(P,hr,.2,0,2.06,-.03,.92,.62,.97)}
  if(st===1){BX(P,hr,.2,.045,.07,0,2.112,.14,null,.5,0,0);[-1,1].forEach(function(q){BX(P,hr,.026,.1,.05,q*.17,1.99,.06)})}
  else if(st===2){for(var i=0;i<7;i++)SP(P,hr,.045,(i-3)*.045,2.19+Math.abs(i-3)*-.012,-.02+(i%2)*.04,1,1.4,1)}
  if(K.hat==='cap'){SP(P,a,.222,0,2.075,-.02,.95,.7,1.02);BX(P,a,.19,.018,.13,0,2.035,.2,null,.18,0,0)}}
 return mergeP(P)})}
function numTex(n,bg,fg,box){var k=n+'_'+bg+'_'+fg+box;return TX[k]||(TX[k]=ctex(64,64,function(c,w,h){if(box){c.fillStyle='#fff';c.fillRect(2,6,60,52);c.strokeStyle='#999';c.strokeRect(2,6,60,52)}c.fillStyle=fg;c.font='bold 46px Arial Black,Arial,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(n),32,36)}))}
var FBT;function fball(r,x,y,z,p){FBT=FBT||ctex(256,128,function(c,w,h){var i,j,a;c.fillStyle='#f7f7f4';c.fillRect(0,0,w,h);c.fillStyle='#16181d';[[32,30],[96,30],[160,30],[224,30],[64,90],[128,90],[192,90],[0,90],[256,90]].forEach(function(q){c.beginPath();for(j=0;j<5;j++){a=j/5*6.283-1.57;c.lineTo(q[0]+Math.cos(a)*13,q[1]+Math.sin(a)*13)}c.closePath();c.fill()});c.strokeStyle='rgba(40,40,40,.3)';c.lineWidth=1.5;for(i=0;i<8;i++){c.beginPath();c.moveTo(i*32+16,0);c.lineTo(i*32+16,h);c.stroke()}});
 var m=new THREE.Mesh(new THREE.SphereGeometry(r,20,14),new THREE.MeshStandardMaterial({map:FBT,roughness:.45}));m.position.set(x,y,z);m.castShadow=true;(p||G).add(m);return m}
var HGEO;
function pe(a,b,sw,role){var g=new THREE.Group(),K=kitOf(a,b,role),sn=SKIN[Math.random()*7|0],hr=HAIR[Math.random()*4|0],gl=Math.random()<.14&&!K.hat,bd=Math.random()<.06,st=Math.random()*5|0,sc=.95+Math.random()*.1,m,n,pl2;
 function mm(geo,mat,p,x,y,z){var o=new THREE.Mesh(geo,mat);o.position.set(x||0,y||0,z||0);o.castShadow=true;(p||g).add(o);return o}
 mm(torsoGeo(K,sn),vmat());
 HGEO=HGEO||new THREE.SphereGeometry(.2,24,18);m=mm(HGEO,headMat(sn,hr,gl,bd),g,0,1.97,0);m.scale.set(.9,1.06,1);
 mm(hairGeo(K,st,hr,sn,a),vmat());
 g.aL=new THREE.Group();g.aL.position.set(-.36,1.68,0);g.add(g.aL);mm(armGeo(K,sn,1),vmat(),g.aL);
 g.aR=new THREE.Group();g.aR.position.set(.36,1.68,0);g.add(g.aR);mm(armGeo(K,sn,0),vmat(),g.aR);
 g.lL=new THREE.Group();g.lL.position.set(-.14,.9,0);g.add(g.lL);mm(legGeo(K,sn),vmat(),g.lL);
 g.lR=new THREE.Group();g.lR.position.set(.14,.9,0);g.add(g.lR);mm(legGeo(K,sn),vmat(),g.lR);
 if(K.num||K.bib){n=(NUMS=NUMS*7%23+1);var bgc=K.bib?'#fff':hx(K.top),fg=K.bib?'#111':(lum(K.top)>.6?'#111':'#fff'),mat=new THREE.MeshBasicMaterial({map:numTex(n,bgc,fg,K.bib),transparent:true,side:THREE.DoubleSide,depthWrite:false});
  pl2=new THREE.Mesh(new THREE.PlaneGeometry(.27,.27),mat);pl2.rotation.y=PI;pl2.position.set(0,1.5,-.184);g.add(pl2);
  pl2=new THREE.Mesh(new THREE.PlaneGeometry(.1,.1),mat);pl2.position.set(-.115,1.62,.176);g.add(pl2)}
 g.scale.setScalar(sc);G.add(g);return g}
function bg(p){var t=Math.random()<.68?'pack':'sling',c=[0x8b1e2d,0x1b3a8c,0x1f1f1f,0x2e6b3a,0x4a4a55,0x8a5a2b][Math.random()*6|0],o=new THREE.Mesh(cached('bag'+t+c,function(){var P=[],d=shd(c,.72),S=0x181818;
 if(t==='pack'){BX(P,c,.36,.46,.17,0,1.37,-.27);add(P,new THREE.CylinderGeometry(.18,.18,.17,16),c,0,1.6,-.27,1,1,1,null,PI/2,0,0);BX(P,d,.3,.22,.06,0,1.26,-.375);BX(P,0x0c0c0c,.3,.012,.065,0,1.38,-.375);BX(P,0xd9d9d9,.05,.03,.012,0,1.34,-.41);
  add(P,new THREE.CylinderGeometry(.04,.04,.22,10),0x2a7fd4,.215,1.2,-.27,1,1,1);BX(P,S,.05,.03,.04,0,1.8,-.27);[-1,1].forEach(function(q){BX(P,S,.055,.03,.4,q*.13,1.79,-.03);BX(P,S,.05,.42,.025,q*.13,1.55,.175);BX(P,S,.03,.05,.34,q*.2,1.42,-.06)})}
 else{BX(P,c,.27,.2,.1,.2,1.1,-.2);BX(P,d,.27,.07,.11,.2,1.18,-.2);BX(P,S,.045,.82,.02,0,1.5,.178,null,0,0,.62);BX(P,S,.045,.82,.02,0,1.5,-.18,null,0,0,.62)}
 return mergeP(P)}),vmat());o.castShadow=true;p.add(o);return p}
var FM={};
function hx(n){return'#'+('000000'+n.toString(16)).slice(-6)}
function headMat(sn,hr,gl,bd){var k=sn+'_'+hr+'_'+gl+'_'+bd;if(FM[k])return FM[k];
 var t=ctex(256,128,function(c,w,h){var i,x=64;c.fillStyle=hx(sn);c.fillRect(0,0,w,h);
  c.fillStyle='rgba(120,60,40,.13)';c.beginPath();c.ellipse(x,72,7,6,0,0,7);c.fill();
  c.fillStyle='rgba(80,35,20,.35)';[-1,1].forEach(function(d){c.beginPath();c.ellipse(x+d*3.4,77,1.7,1.2,0,0,7);c.fill()});c.fillStyle='rgba(60,30,20,.12)';c.beginPath();c.ellipse(x,66,2.6,9,0,0,7);c.fill();
  [-1,1].forEach(function(d){c.fillStyle='rgba(220,110,100,.12)';c.beginPath();c.ellipse(x+d*30,76,11,7,0,0,7);c.fill()});
  [-1,1].forEach(function(d){var ex=x+d*22,ey=57;c.fillStyle='#f4f1ea';c.beginPath();c.ellipse(ex,ey,7.5,4.6,0,0,7);c.fill();
   c.fillStyle='#3a2416';c.beginPath();c.arc(ex,ey,3.6,0,7);c.fill();c.fillStyle='#0b0b0b';c.beginPath();c.arc(ex,ey,1.9,0,7);c.fill();
   c.fillStyle='rgba(255,255,255,.85)';c.fillRect(ex-2,ey-2.4,1.6,1.6);
   c.strokeStyle=hx(hr);c.lineWidth=2.6;c.beginPath();c.moveTo(ex-9,47);c.lineTo(ex+8,45.5);c.stroke();
   if(gl){c.strokeStyle='#1a1a1a';c.lineWidth=1.8;c.beginPath();c.ellipse(ex,ey,11.5,8.5,0,0,7);c.stroke();c.fillStyle='rgba(180,220,240,.18)';c.fill()}});
  if(gl){c.strokeStyle='#1a1a1a';c.lineWidth=1.8;c.beginPath();c.moveTo(x-10.5,56);c.lineTo(x+10.5,56);c.stroke()}
  if(bd){for(i=0;i<260;i++){c.fillStyle='rgba(20,15,10,'+(.18+Math.random()*.25)+')';c.fillRect(x-26+Math.random()*52,84+Math.random()*22,1.3,1.3)}}
  c.strokeStyle='#8c3b3b';c.lineWidth=2.4;c.beginPath();c.moveTo(x-9,86);c.quadraticCurveTo(x,93,x+9,86);c.stroke();
  c.fillStyle='rgba(255,255,255,.9)';c.fillRect(x-6,87,12,1.6);c.fillStyle='rgba(150,60,60,.55)';c.beginPath();c.ellipse(x,89.5,7,2.2,0,0,3.14);c.fill()});
 return FM[k]=new THREE.MeshStandardMaterial({map:t,roughness:.75})}
function ctex(w,h,fn,rx,ry){var c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);var t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx||1,ry||1);t.anisotropy=4;return t}
function gr(w,d,c1,c2,x,y,z){if(NG&&w>=60&&d>=40)return null;var m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshStandardMaterial({map:ctex(256,256,function(c,W,H){var i;for(i=0;i<10;i++){c.fillStyle=i%2?c1:c2;c.fillRect(0,i*H/10,W,H/10)}for(i=0;i<900;i++){c.fillStyle='rgba('+(Math.random()<.5?'0,60,0':'120,200,90')+',.12)';c.fillRect(Math.random()*W,Math.random()*H,2,3)}}),roughness:1}));m.rotation.x=-PI/2;m.position.set(x,y,z);m.receiveShadow=true;G.add(m);return m}
function stand(x,z,ry,w){var g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;G.add(g);
 var m=new THREE.Mesh(new THREE.PlaneGeometry(w,7),new THREE.MeshStandardMaterial({map:ctex(512,128,function(c,W,H){var i;c.fillStyle='#4a4d52';c.fillRect(0,0,W,H);for(i=0;i<1500;i++){c.fillStyle='hsl('+(Math.random()*360|0)+',55%,'+(40+Math.random()*30|0)+'%)';c.fillRect(Math.random()*W,Math.random()*H,5,7)}}),roughness:1}));
 m.rotation.x=-.9;m.position.set(0,2.6,1.8);g.add(m);bx(w,2.4,.6,0x666a70,0,1.2,-.2,g);return g}
function stads(rx,rz,w){stand(0,-rz,0,w);stand(0,rz,PI,w);stand(-rx,0,PI/2,w*.6);stand(rx,0,-PI/2,w*.6)}
function cy(a,b,l,c,x,y,z,p){var m=new THREE.Mesh(new THREE.CylinderGeometry(a,b,l,14),mt(c));m.position.set(x,y,z);m.castShadow=true;(p||G).add(m);return m}
function cl(x){return x<0?0:x>1?1:x}
function id(p){p.lL.rotation.x=p.lR.rotation.x=p.aL.rotation.x=p.aR.rotation.x=0}
function rn(p,t,s){var a=sin(t*9*s)*.9*Math.min(s,1.2);p.lL.rotation.x=a;p.lR.rotation.x=-a;p.aL.rotation.x=-a*.8;p.aR.rotation.x=a*.8}
function ms(p,w,u){var i,a,b,f;p.position.y=0;p.rotation.x=0;
 for(i=0;i<w.length-1;i++){a=w[i];b=w[i+1];if(u<b[2]&&u>=a[2]){f=(u-a[2])/(b[2]-a[2]);p.position.x=a[0]+(b[0]-a[0])*f;p.position.z=a[1]+(b[1]-a[1])*f;if(a[0]!=b[0]||a[1]!=b[1]){p.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);rn(p,u,1)}else id(p);return}}
 a=u<w[0][2]?w[0]:w[w.length-1];p.position.x=a[0];p.position.z=a[1];id(p)}
function pth(p,w,T,t,s){var n=w.length,v=(t/T)%1*n,i=Math.floor(v),f=v-i,a=w[i%n],b=w[(i+1)%n];p.position.set(a[0]+(b[0]-a[0])*f,0,a[1]+(b[1]-a[1])*f);p.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);rn(p,t,s||1)}
function dive(K,d,x,mx){d=d*d*(3-2*d);return d}
function goals(x,h,w,n){[-1,1].forEach(function(s){bx(.15,h,.15,0xffffff,s*x,h/2,-w/2);bx(.15,h,.15,0xffffff,s*x,h/2,w/2);bx(.15,.15,w,0xffffff,s*x,h,0);bx(.06,h,w-.1,0xe8e8e8,s*(x+n),h/2,0)})}

function fb(){gr(46,28,'#2f8f3a','#3aa346',0,0,0);bx(.12,.03,28,0xffffff,0,.02,0);goals(17,2.4,4.4,1.4);
 var K=pe(0xf2c200,0x222222,0,'gk'),A=pe(0xd62839,0xffffff),B=pe(0xd62839,0xffffff),D1=pe(0x1d4ed8,0xffffff),D2=pe(0x1d4ed8,0xffffff),E=pe(0xd62839,0xffffff),F=pe(0x1d4ed8,0xffffff);ball=fball(.22,0,.22,0);
 return function(t){var T=10,k=Math.floor(t/T),u=t-k*T,goal=k%2==1,b=ball.position,f,d,tz=goal?-1.5:1.2;
  ms(A,[[-12,-3,0],[2,0,3],[6,-4,6],[8,0,9.5]],u);ms(B,[[-2,7,0],[9,1,6]],u);if(u>5.5)B.rotation.y=PI/2;
  pth(D1,[[2,5],[8,3],[6,-3],[1,-4]],12,t);pth(D2,[[-4,-6],[3,-7],[5,-2],[-2,2]],14,t,.9);pth(E,[[-8,4],[-3,8],[4,9],[-2,5]],13,t);pth(F,[[10,-6],[12,4],[8,6],[10,-2]],11,t);
  if(u>=6&&u<6.6)B.lR.rotation.x=-1.5*sin((u-6)/.6*PI);
  if(goal&&u>7.4){B.aL.rotation.x=B.aR.rotation.x=-2.9;B.position.y=Math.abs(sin((u-7.4)*5))*.5}
  if(u<3)b.set(A.position.x+.6,.22,A.position.z+.2);
  else if(u<4){f=u-3;b.set(2+(B.position.x-2)*f,.22+sin(PI*f)*1.1,B.position.z*f)}
  else if(u<6.3)b.set(B.position.x+.7,.22,B.position.z);
  else if(u<7.2){f=(u-6.3)/.9;b.set(9.7+7.5*f,.3+sin(PI*f)*.5+f*.7,1+(tz-1)*f)}
  else{f=cl((u-7.2)/1.2);if(goal)b.set(17.2+cl(f*3),.35,tz-.3*cl(f*3));else b.set(17.2-5*f,.3+sin(PI*f)*2.2,1.2+4*f)}
  ball.rotation.x=t*6;
  d=dive(0,Math.min(cl((u-6.4)/.6),1-cl((u-8.4)/1)));K.position.set(16.5,sin(d*PI)*.5,d*1.7+sin(t*2)*.5*(1-d));K.rotation.set(d*1.2,-PI/2,0);K.aL.rotation.x=K.aR.rotation.x=-d*2.8}}

function cr(){gr(70,70,'#3a8f3f','#44a74e',0,0,0);bx(3,.04,24,0xcdb88a,0,.02,0);
 [-1,1].forEach(function(s){[-.2,0,.2].forEach(function(x){bx(.06,.9,.06,0xf5e6b8,x,.45,s*10.6)})});
 var B=pe(0x1d4ed8,0xffffff,0,'bat'),W=pe(0xd62839,0xffffff),F=pe(0xd62839,0xffffff),H=pe(0xd62839,0xffffff),U=pe(0xffffff,0x222222,0,'ump');
 bx(.1,.8,.2,0xe9d3a0,0,-.7,.1,B.aR);B.position.set(.5,0,9.4);B.rotation.y=PI;U.position.set(2.5,0,-10.8);U.rotation.y=PI;ball=sp(.11,0xb3202a,0,1.6,-18);
 return function(t){var T=8,k=Math.floor(t/T),u=t-k*T,six=k%2==1,b=ball.position,f,a;
  ms(W,[[0,-18,0],[0,-11.5,2.5]],u);if(u>2.3&&u<2.9)W.aR.rotation.x=-2*PI*cl((u-2.3)/.6);
  a=u<2.4?.4:u<2.8?.4+.8*(u-2.4)/.4:1.2-2.9*cl((u-2.8)/.7);B.aR.rotation.x=a;B.aL.rotation.x=a*.8;
  ms(F,[[-6,-4,0],[-6,-4,3.4],[-15.7,-12.8,6.4]],u);if(u>6.3)F.aL.rotation.x=F.aR.rotation.x=-2.5;
  pth(H,[[8,-8],[10,-5],[7,-3]],10,t,.7);
  if(u<2.5)b.set(W.position.x+.4,1.6,W.position.z+.2);
  else if(u<3.4){f=(u-2.5)/.9;b.set(.4,f<.7?.15+2*(1-f/.7):.15+(f-.7)/.3*.9,-11+20.4*f)}
  else if(u<6.4){f=(u-3.4)/3;b.set(.4-16.1*f,1.05*(1-f)+.12*f+sin(PI*f)*(six?9:3),9.4-22.2*f)}
  else b.set(-15.7,.12,-12.8);ball.rotation.x=t*8}}

function hb(){pl(60,60,0x5a8f5a,0,-.02,0);pl(40,20,0x2a6fb5,0,0,0);bx(.1,.03,20,0xffffff,0,.02,0);goals(19,2,3.2,.8);
 var A=[0,1,2].map(function(){return pe(0xd62839,0xffffff)}),D=[0,1,2].map(function(){return pe(0x1d4ed8,0xffffff)}),K=pe(0xf2c200,0x222222,0,'gk');ball=sp(.17,0xf08a24,0,1.4,0);
 var sg=[[0,1,0,0],[1,2,0,1],[2,3,1,2],[3,4,2,1],[4,5.2,1,1]];
 function hd(p){return[p.position.x+.35,p.position.y+1.4,p.position.z+.2]}
 return function(t){var T=9,k=Math.floor(t/T),u=t-k*T,goal=k%2==1,b=ball.position,i,s,a,c,f,d;
  A[0].position.set(3,0,-6+sin(t*1.5));A[1].position.set(5,0,sin(t*1.2)*1.5);A[2].position.set(3,0,6+sin(t*1.5+1));
  A.forEach(function(p){p.rotation.y=PI/2;rn(p,t,.5)});
  A[1].position.y=sin(PI*cl((u-4.6)/1))*1.1;if(u>4.6&&u<5.6)A[1].aR.rotation.x=u<5.1?1.5:-3;
  D.forEach(function(p,i){p.position.set(9+sin(t*2+i)*.5,0,(i-1)*3.2+sin(t*2+i)*1.2);p.rotation.y=-PI/2;rn(p,t,.6);if(u>4.6)p.aL.rotation.x=p.aR.rotation.x=-2.6});
  for(i=0;i<sg.length;i++){s=sg[i];if(u>=s[0]&&u<s[1]){a=hd(A[s[2]]);c=hd(A[s[3]]);f=(u-s[0])/(s[1]-s[0]);b.set(a[0]+(c[0]-a[0])*f,a[1]+(c[1]-a[1])*f+(s[2]!=s[3]?sin(PI*f)*.9:0),a[2]+(c[2]-a[2])*f)}}
  if(u>=5.2&&u<6){a=hd(A[1]);f=(u-5.2)/.8;b.set(a[0]+(19-a[0])*f,a[1]+(1.2-a[1])*f,a[2]+((goal?-.9:.5)-a[2])*f)}
  else if(u>=6){f=cl((u-6)/1.2);if(goal)b.set(19.5,.17+(1-cl(f*2)),-.9);else b.set(19-3*f,.17+1.03*(1-f)+sin(PI*f)*1.2,.5+2*f)}
  d=dive(0,Math.min(cl((u-5.2)/.5),1-cl((u-7)/1)));K.position.set(18.4,sin(d*PI)*.4,d*1.2+sin(t*2)*.4*(1-d));K.rotation.set(d*1.2,-PI/2,0);K.aL.rotation.x=K.aR.rotation.x=-d*2.8}}

function vb(){pl(24,15,0xb9a27a,0,-.02,0);pl(18,9,0xd9763a,0,0,0);
 bx(.1,.03,9,0xffffff,0,.02,0);[-3,3].forEach(function(x){bx(.08,.03,9,0xffffff,x,.02,0)});bx(18,.03,.08,0xffffff,0,.02,-4.5);bx(18,.03,.08,0xffffff,0,.02,4.5);
 cy(.05,.05,2.5,0xcfcfcf,0,1.25,-4.8);cy(.05,.05,2.5,0xcfcfcf,0,1.25,4.8);bx(.04,.07,9.4,0xffffff,0,2.47,0);
 var nt=new THREE.Mesh(new THREE.PlaneGeometry(9.4,.95),new THREE.MeshStandardMaterial({color:0x111111,transparent:true,opacity:.5,side:THREE.DoubleSide}));nt.rotation.y=PI/2;nt.position.set(0,2,0);G.add(nt);
 var P=[],BS=[[2.5,-3],[2.5,0],[2.5,3],[6.5,-3],[6.5,0],[6.5,3]],SG,sd,k,p;ball=sp(.11,0xf5d442,0,2,0);
 [-1,1].forEach(function(sd){BS.forEach(function(q){p=pe(sd<0?0xd62839:0x1d4ed8,0xffffff);p.bx0=sd*q[0];p.bz0=q[1];p.sd=sd;p.position.set(p.bx0,0,p.bz0);p.rotation.y=sd<0?PI/2:-PI/2;P.push(p)})});
 /* one rally, 8.2 s: [start,end, x0,y0,z0, x1,y1,z1, apex, arm pose at the end] serve, bump, set, spike, dig, set, spike, dig, return */
 SG=[[0,1.2,-8.5,1.8,0,5.5,.9,-1.5,3.5,-1.2],[1.2,2,5.5,.9,-1.5,3,2.2,.2,1.8,-1.2],[2,2.8,3,2.2,.2,2.2,2.7,-2.8,1.2,-2.6],[2.8,3.5,2.2,2.7,-2.8,-5,.7,1.8,.9,-1.2],
 [3.5,4.4,-5,.7,1.8,-3,2.2,0,2.2,-1.2],[4.4,5.2,-3,2.2,0,-2.4,2.7,2.8,1.2,-2.6],[5.2,5.9,-2.4,2.7,2.8,5,.7,-1.8,.9,-1.2],[5.9,6.8,5,.7,-1.8,3.5,2.3,0,2,-1.2],[6.8,8.2,3.5,2.3,0,-8.5,1.8,0,5,-1.2]];
 function near(x,z){var b=null,d=1e9,n;P.forEach(function(q){if((q.sd<0)==(x<0)){n=(q.bx0-x)*(q.bx0-x)+(q.bz0-z)*(q.bz0-z);if(n<d){d=n;b=q}}});return b}
 var HT=[3,6].map(function(i){return near(SG[i][2],SG[i][4])});
 return function(t,dt){var T=8.2,u=t%T,i,s,f,w,q,m,x,z,a;
  for(i=0;i<SG.length;i++)if(u>=SG[i][0]&&u<SG[i][1]){s=SG[i];f=(u-s[0])/(s[1]-s[0]);ball.position.set(s[2]+(s[5]-s[2])*f,s[3]+(s[6]-s[3])*f+sin(PI*f)*s[8],s[4]+(s[7]-s[4])*f);w=i;break}
  m=Math.min(1,(dt||.016)*4);
  P.forEach(function(q){x=q.bx0;z=q.bz0;a=0;
   if(s){if(near(s[5],s[7])===q){x=s[5];z=s[7];if(f>.45)a=s[9]}else if(near(s[2],s[4])===q&&w!==0&&w!==8){x=s[2]+(s[2]<0?-.3:.3);z=s[4]}}
   var dx=x-q.position.x,dz=z-q.position.z,mv=Math.hypot(dx,dz);q.position.x+=dx*m;q.position.z+=dz*m;q.position.y=0;
   if(mv>.35)rn(q,t,.55);else{id(q);q.rotation.x=0}
   if(a)q.aL.rotation.x=q.aR.rotation.x=a;
   for(k=0;k<2;k++)if(q===HT[k]){var j=SG[k?6:3][0],jf=cl((u-(j-.6))/1);q.position.y=sin(PI*jf)*.75;if(u>j-.4&&u<j+.25)q.aL.rotation.x=q.aR.rotation.x=-2.8}
  })}}
function kb(){pl(60,40,0x9a6b3a,0,-.02,0);pl(26,14,0xc98b4a,0,0,0);bx(.12,.03,14,0xffffff,0,.02,0);bx(26,.03,.12,0xffffff,0,.02,-7);bx(26,.03,.12,0xffffff,0,.02,7);
 var Rd=pe(0xd62839,0xffffff),Df=[0,1,2,3,4].map(function(){return pe(0x1d4ed8,0xffffff)});
 return function(t){var u=t%8;
  ms(Rd,[[4,.5,0],[-5.5,.5,2.8],[-5.5,.5,3.6],[3.5,-.5,6.4]],u);if(u>2.8&&u<3.6){Rd.aR.rotation.x=-1.6;Rd.rotation.y=-PI/2}
  Df.forEach(function(p,i){
   if(i==1)ms(p,[[-7.5,-2.2,0],[-7.5,-2.2,3.1],[-5.6,-1.2,3.7],[-1.5,-.3,5.2],[-7.5,-2.2,7.4]],u);
   else if(i==2)ms(p,[[-7.5,0,0],[-7.5,0,3.1],[-5.7,.2,3.6],[-1,.4,5.4],[-7.5,0,7.6]],u);
   else{p.position.set(-7.5+sin(t*3+i)*.15,0,(i-2)*2.2);id(p)}
   if((i!=1&&i!=2)||u<3.1||u>7.6)p.rotation.y=PI/2;
   p.position.y=Math.abs(sin(t*3+i))*.06;p.aL.rotation.z=-1.2;p.aR.rotation.z=1.2})}}

function at(){gr(90,70,'#3b8f3f','#46a850',0,-.02,0);var r=new THREE.Mesh(new THREE.RingGeometry(9,17.5,72),mt(0xc2410c));r.rotation.x=-PI/2;r.scale.x=1.5;r.position.y=.01;r.receiveShadow=true;G.add(r);
 bx(4,.1,3,0xe8d9a0,8.5,.05,-2);bx(14,.03,1.2,0xa8350b,-2,.02,-2);
 var P=[0xd62839,0x1d4ed8,0xf59e0b,0x7c3aed,0x0f9d58,0x0891b2].map(function(c){return pe(c,0xffffff)}),J=pe(0xf59e0b,0x222222);
 return function(t){var u=t%7,f;
  P.forEach(function(p,i){var rr=9.7+i*1.4,q=(.62-.035*i)*t+i*.5;p.position.set(1.5*rr*Math.cos(q),0,rr*sin(q));p.rotation.y=Math.atan2(-1.5*sin(q),Math.cos(q));rn(p,t+i,1.3)});
  ms(J,[[-9,-2,0],[3,-2,2.4],[7,-2,3.2]],u);
  if(u>2.4&&u<3.2){f=sin(PI*(u-2.4)/.8);J.position.y=f*1.3;J.lL.rotation.x=J.lR.rotation.x=-1.2*f;J.aL.rotation.x=J.aR.rotation.x=-2.6*f}}}

function sw(){pl(70,50,0xcfd8dc,0,-.05,0);
 var wg=new THREE.PlaneGeometry(30,14,30,14),w=new THREE.Mesh(wg,new THREE.MeshStandardMaterial({color:0x2aa7e8,transparent:true,opacity:.72,roughness:.15,metalness:.1})),i,n=wg.attributes.position.count,X=[],Y=[];
 w.rotation.x=-PI/2;w.position.y=.06;w.receiveShadow=true;G.add(w);for(i=0;i<n;i++){X.push(wg.attributes.position.getX(i));Y.push(wg.attributes.position.getY(i))}
 [-1,1].forEach(function(s){bx(31,.5,.5,0xf1efe8,0,.05,s*7.25);bx(.5,.5,14.9,0xf1efe8,s*15.25,.05,0)});
 pl(30,14,0x8fd3e6,0,.03,0);for(i=-6;i<=6;i+=3){bx(30,.02,.22,0x1b3f8f,0,.035,i);bx(30,.07,.07,i%6===0?0xff6b6b:0xffffff,0,.1,i)}
 var Sw=[0xd62839,0x1d4ed8,0xf59e0b,0x7c3aed].map(function(c,i){var W=new THREE.Group(),p=pe(c,c);W.add(p);p.rotation.x=1.45;p.position.set(0,-.05,-1);G.add(W);W.userData={z:-4.5+i*3,sp:3.2+i*.35,c:0,p:p};return W}),PR=[],pi=0;
 for(i=0;i<80;i++){var m=sp(.07,0xffffff,0,-5,0);m.v=[0,0,0];PR.push(m)}
 function em(x,y,z,dx){for(var j=0;j<7;j++){var m=PR[pi++%80];m.position.set(x,y,z);m.v=[dx*Math.random()*1.5,2+Math.random()*2.5,(Math.random()-.5)*2.5]}}
 return function(t,dt){var P=wg.attributes.position,i;
  for(i=0;i<n;i++)P.setZ(i,sin(X[i]*.6+t*2)*.05+Math.cos(Y[i]*.8+t*1.5)*.05);P.needsUpdate=true;
  Sw.forEach(function(W,i){var d=W.userData,cy=(t*d.sp)%52,fw=cy<26,x=fw?-13+cy:13-(cy-26),p=d.p,ph=t*5+i,c=Math.floor(ph/PI),dr=fw?1:-1;
   W.position.set(x,sin(t*5+i)*.04,d.z);W.rotation.y=fw?PI/2:-PI/2;p.aL.rotation.x=ph;p.aR.rotation.x=ph+PI;p.lL.rotation.x=sin(t*16+i)*.35;p.lR.rotation.x=-sin(t*16+i)*.35;
   if(c!=d.c){d.c=c;em(x+dr*1.6,.05,d.z+(c%2?.35:-.35),dr)}});
  PR.forEach(function(m){if(m.position.y>-1){m.v[1]-=12*dt;m.position.x+=m.v[0]*dt;m.position.y+=m.v[1]*dt;m.position.z+=m.v[2]*dt;if(m.position.y<0)m.position.y=-5}})}}


/* ===== Campus: the college buildings, drag to turn 360° ===== */
function fac(cols,rows,bg,glass,W,H,mode){return ctex(W||512,H||1024,function(c,w,h){var i,j,x,y,cw=w/cols,rh=h/rows,g;
 c.fillStyle=bg;c.fillRect(0,0,w,h);
 for(i=0;i<500;i++){c.fillStyle='rgba('+(Math.random()<.5?'0,0,0':'255,255,255')+','+(.02+Math.random()*.03)+')';c.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*3,4+Math.random()*30)}
 for(j=0;j<rows;j++){y=h-(j+1)*rh;c.fillStyle='rgba(0,0,0,.16)';c.fillRect(0,y,w,3);c.fillStyle='rgba(255,255,255,.35)';c.fillRect(0,y+3,w,2);
  for(i=0;i<cols;i++){x=i*cw;var wx=x+cw*.16,wy=y+rh*.2,ww=cw*.68,wh=rh*.58;
   if(mode==='glass'){wx=x+1;ww=cw-2;wy=y+rh*.08;wh=rh*.84}
   c.fillStyle='rgba(0,0,0,.28)';c.fillRect(wx-2,wy-2,ww+4,wh+4);
   g=c.createLinearGradient(0,wy,0,wy+wh);g.addColorStop(0,glass[0]);g.addColorStop(.55,glass[1]);g.addColorStop(1,glass[2]);c.fillStyle=g;c.fillRect(wx,wy,ww,wh);
   c.fillStyle='rgba(255,255,255,.22)';c.beginPath();c.moveTo(wx,wy+wh);c.lineTo(wx+ww*.55,wy);c.lineTo(wx+ww*.8,wy);c.lineTo(wx+ww*.25,wy+wh);c.fill();
   c.fillStyle='rgba(255,255,255,.9)';c.fillRect(wx+ww/2-1,wy,2,wh);c.fillRect(wx,wy+wh*.42,ww,2);
   if(mode!=='glass'){c.fillStyle='rgba(0,0,0,.22)';c.fillRect(wx-3,wy+wh+2,ww+6,3);if(Math.random()<.22){c.fillStyle='rgba(255,250,240,.7)';c.fillRect(wx+2,wy+2,ww*.45,wh-4)}}}}
 if(mode==='ground'){c.fillStyle='rgba(60,50,40,.28)';c.fillRect(0,h-rh,w,rh)}
 })}
function brick(W,H,rx,ry){return ctex(256,256,function(c,w,h){var i,j,bw=32,bh=16;c.fillStyle='#8c3d28';c.fillRect(0,0,w,h);
 for(j=0;j<h/bh;j++)for(i=-1;i<w/bw;i++){var l=42+Math.random()*14;c.fillStyle='hsl(12,48%,'+l+'%)';c.fillRect(i*bw+(j%2?bw/2:0)+1,j*bh+1,bw-2,bh-2)}},rx||2,ry||8)}
function tree3(list){var cols=[0x2f7d3a,0x3d8f45,0x2a6e35],tg=new THREE.CylinderGeometry(.22,.34,3,6),cg=new THREE.SphereGeometry(2.1,8,6),d=new THREE.Object3D(),
 tr=new THREE.InstancedMesh(tg,mt(0x5a3d26),list.length),i,k,cs=[];tr.castShadow=true;
 for(k=0;k<3;k++){cs.push([]);}
 list.forEach(function(p,n){d.position.set(p[0],1.5,p[1]);d.scale.set(1,p[2]*.9+.4,1);d.rotation.set(0,0,0);d.updateMatrix();tr.setMatrixAt(n,d.matrix);cs[n%3].push(p)});
 G.add(tr);
 cs.forEach(function(a,k){var m=new THREE.InstancedMesh(cg,mt(cols[k]),Math.max(a.length,1));m.castShadow=true;m.receiveShadow=true;
  a.forEach(function(p,n){var s=p[2];d.position.set(p[0],3+s*1.6,p[1]);d.scale.set(s*1.1,s*1.15,s*1.1);d.rotation.set(0,Math.random()*6,0);d.updateMatrix();m.setMatrixAt(n,d.matrix)});
  m.instanceMatrix.needsUpdate=true;G.add(m)});
 tr.instanceMatrix.needsUpdate=true}
function bld(w,h,d,x,z,ry,front,side,roofc,glassy){var g=new THREE.Group(),sm=new THREE.MeshStandardMaterial({map:side,roughness:.9}),fm=new THREE.MeshStandardMaterial({map:front,roughness:glassy?.35:.85,metalness:glassy?.15:0}),
 rm=mt(roofc||0x8d8d86),m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),[sm,sm,rm,rm,fm,sm]);
 g.position.set(x,0,z);g.rotation.y=ry||0;m.position.y=h/2;m.castShadow=true;m.receiveShadow=true;g.add(m);
 bx(w+.5,.9,.45,0xe9e2d0,0,h+.45,d/2,g);bx(w+.5,.9,.45,0xe9e2d0,0,h+.45,-d/2,g);bx(.45,.9,d,0xe9e2d0,-w/2,h+.45,0,g);bx(.45,.9,d,0xe9e2d0,w/2,h+.45,0,g);
 bx(w*.22,2.6,d*.4,0xd9d2c0,-w*.25,h+1.3,-d*.15,g);cy(1.4,1.4,2.4,0x3b6ea5,w*.2,h+1.2,d*.1,g);bx(w+.8,.7,1.2,0xcfc8b6,0,.35,d/2+.3,g);
 G.add(g);return g}
var WKS=[],Z={vb:[-90,12],fb:[-35,-35],cr:[42,-40],hb:[-35,10],kb:[15,10],at:[118,-35],sw:[76,15]},fly=null;
var KITS={fb:'football',cr:'cricket',hb:'handball',kb:'kabaddi',at:'athletics',sw:'swim',vb:'volley'};
function zn(k,fn,zs){var o=G,g=new THREE.Group();g.position.set(Z[k][0],0,Z[k][1]);o.add(g);G=g;NG=1;KIT=KITS[k]||'uniform';var u=fn();KIT='uniform';NG=0;G=o;zs.push({u:u,b:ball})}
function cm(){var i,x,z,T=[],zs=[],wk=[],GL=['#a9d6ea','#5b9cc4','#2f6f9a'],
 FA=fac(8,10,'#efe8d6',GL,512,1024),SA=fac(3,10,'#ebe3cf',GL,256,1024),FB=fac(7,9,'#e9e1cd',['#9ad0e8','#3f8fb8','#1f5f86'],512,1024,'glass'),SB=fac(3,9,'#e6dec9',GL,256,1024),
 FC=fac(14,3,'#f0e8d4',GL,1024,256),SC2=fac(3,3,'#ece4d0',GL,256,256),FW=fac(6,2,'#f6f3ec',['#bfe3f2','#6fb0d0','#3d86ab'],512,256);
 function tw(w,h,d,x,z,c){var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),[mt(c),mt(c),mt(c),mt(c),new THREE.MeshStandardMaterial({map:brick(),roughness:.95}),mt(c)]);m.position.set(x,h/2,z);m.castShadow=true;G.add(m)}
 pl(900,900,0x7f8f72,0,-.08,0);
 var lgt=ctex(512,512,function(c,w,h){var n,x,y,r,g,ch=['#2e7a34','#3b8a40','#47994a','#2a6f31','#56a653','#3f8c3a'];c.fillStyle='#3b8a40';c.fillRect(0,0,w,h);
  for(n=0;n<70;n++){x=Math.random()*w;y=Math.random()*h;r=30+Math.random()*70;g=c.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,Math.random()<.5?'rgba(30,90,35,.28)':'rgba(120,190,90,.22)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2)}
  for(n=0;n<14000;n++){x=Math.random()*w;y=Math.random()*h;c.strokeStyle=ch[n%6];c.globalAlpha=.35+Math.random()*.4;c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(x+(Math.random()-.5)*3,y-3-Math.random()*5);c.stroke()}
  c.globalAlpha=1;for(n=0;n<120;n++){c.fillStyle=Math.random()<.5?'rgba(255,255,255,.55)':'rgba(255,230,90,.5)';c.fillRect(Math.random()*w,Math.random()*h,1.5,1.5)}},36,25),
 lawn=new THREE.Mesh(new THREE.PlaneGeometry(440,300),new THREE.MeshStandardMaterial({map:lgt,bumpMap:lgt,bumpScale:.9,roughness:1}));
 lawn.rotation.x=-PI/2;lawn.position.set(25,-.04,-30);lawn.receiveShadow=true;G.add(lawn);
 gr(66,54,'#33903d','#3da64a',Z.cr[0],.0,Z.cr[1]);gr(28,17.5,'#2f8f3a','#3aa346',Z.at[0],.0,Z.at[1]);
 /* main buildings at the back, like the campus photos */
 bld(36,27,13,-45,-100,0,FA,SA,0x8d8d86);tw(4,29,13.4,-65,-100,0x8c3d28);
 bld(26,25,12.5,-5,-101,0,FB,SB,0x8d8d86,true);tw(6,28,12.8,11,-101,0x9a4630);bx(20,3,3,0x3f8f4a,-5,9,-94.2);bx(20,.5,3.4,0xd9d2c0,-5,7.4,-94.2);
 bld(46,11.5,13,62,-99,0,FC,SC2,0x8d8d86);
 /* more buildings from the photos: white 10-storey block, long 3-storey arcade wing, blue-roof walkway */
 bld(26,23,12,-100,-98,0,FA,SA,0x8d8d86);tw(3.5,25,12.4,-115,-98,0x9a4630);
 bld(40,11,12,125,-99,0,FC,SC2,0x8d8d86);bx(40,.5,1.6,0xb5603f,125,5.6,-92.6);bx(40,.5,1.6,0xb5603f,125,9,-92.6);
 bx(40,.6,6,0x2f6f9a,-100,3.6,-65);[-118,-109,-100,-91,-82].forEach(function(px){cy(.12,.12,3.4,0xe9e2d0,px,1.7,-62.4);cy(.12,.12,3.4,0xe9e2d0,px,1.7,-67.6)});
 /* every sport, all running at the same time */
 zn('fb',fb,zs);zn('cr',cr,zs);zn('hb',hb,zs);zn('kb',kb,zs);zn('at',at,zs);zn('sw',sw,zs);zn('vb',vb,zs);
 /* swimming pool surroundings (from the real pool photos): brick stands, white poles, white building */
 pl(42,28,0xd9d5c9,77,.02,15);
 for(i=0;i<5;i++)bx(30,.45,1.5,0xb5603f,76,.22+i*.45,6.2-i*1.5);
 bx(32,3.4,.7,0xa8482f,76,1.7,-1.6);bx(32.4,.35,.9,0xe9e2d0,76,3.55,-1.6);
 bx(7,4.4,7,0xb5603f,95,2.2,12);bx(7.4,.35,7.4,0xf2efe6,95,4.55,12);bx(7.1,.3,7.1,0xf2efe6,95,2.6,12);
 [[63,2],[76,2],[89,2]].forEach(function(p){cy(.07,.07,12,0xffffff,p[0],6,p[1])});
 bld(16,7,9,50,15,PI/2,FW,SC2,0x8d8d86);
 /* paths and lamps */
 pl(230,5,0xd5cfc0,30,.01,-8);pl(5,75,0xd5cfc0,8,.01,-47);
 [-60,-20,20,60,100].forEach(function(p){cy(.08,.11,6,0x44484d,p,3,-5.5);sp(.38,0xfff2c0,p,6.2,-5.5)});
 /* trees, kept out of the playing areas */
 var ZR=[[-35,-35,32,22],[42,-40,36,30],[-35,10,26,14],[15,10,18,12],[118,-35,34,24],[77,15,30,18],[50,15,10,10],[-100,-65,24,8],[-90,12,14,10],[8,-70,32,16]];
 for(x=-100;x<=150;x+=8)for(z=-84;z<=62;z+=9){if(Math.random()<.4)continue;var px=x+(Math.random()-.5)*5,pz=z+(Math.random()-.5)*5,bad=false;
  ZR.forEach(function(r){if(Math.abs(px-r[0])<r[2]+4&&Math.abs(pz-r[1])<r[3]+4)bad=true});if(Math.abs(pz+8)<5||(Math.abs(px-8)<5&&pz<-5))bad=true;if(!bad)T.push([px,pz,.8+Math.random()*.8])}
 for(x=-100;x<=150;x+=7)if(x<-14||x>36)T.push([x+(Math.random()-.5)*3,-88+(Math.random()-.5),1+Math.random()*.6]);
 tree3(T);
 var DT=fac(4,8,'#ddd2bd',['#a9d6ea','#6aa5c8','#3f7ea5'],256,512);
 [[-150,-170,26,34],[-90,-185,30,28],[0,-195,24,40],[90,-185,30,32],[170,-160,26,36],[210,-70,22,30],[-190,-80,24,26],[-200,0,26,30]].forEach(function(b){var m=new THREE.Mesh(new THREE.BoxGeometry(b[2],b[3],b[2]*.8),new THREE.MeshStandardMaterial({map:DT,roughness:1}));m.position.set(b[0],b[3]/2,b[1]);G.add(m)});
 /* flag */
 cy(.07,.1,14,0xcfd2d6,20,7,-84);
 var ft=ctex(128,80,function(c,w,h){c.fillStyle='#006a4e';c.fillRect(0,0,w,h);c.fillStyle='#f42a41';c.beginPath();c.arc(w*.44,h/2,h*.3,0,PI*2);c.fill()}),
  fg=new THREE.PlaneGeometry(3.6,2.2,14,6),fl=new THREE.Mesh(fg,new THREE.MeshStandardMaterial({map:ft,side:THREE.DoubleSide,roughness:.9})),fx=[];
 fl.position.set(21.8,12.6,-84);fl.castShadow=true;G.add(fl);for(i=0;i<fg.attributes.position.count;i++)fx.push(fg.attributes.position.getX(i));
 /* students walking between the sports areas */
 for(i=0;i<9;i++)wk.push([bg(pe([0xd62839,0x1d4ed8,0x0f9d58,0xf59e0b,0x7c3aed][i%5],0x2b3a55)),[[-70,-8],[130,-8]],140,i*15]);
 for(i=0;i<5;i++)wk.push([bg(pe([0xffffff,0xd62839,0x1d4ed8][i%3],0x2b3a55)),[[8,-84],[8,-10]],60,i*12]);
 var ST=[];for(i=0;i<10;i++){var sp2=bg(pe([0xffffff,0xd62839,0x1d4ed8][i%3],0x2b3a55));id(sp2);sp2.position.set(-58+i*3.4,0,-17.5);sp2.rotation.y=PI+(Math.random()-.5)*.5;ST.push(sp2)}
 WKS=wk.concat(ST.map(function(q){return[q]}));
 var bc=document.createElement('canvas');bc.width=512;bc.height=256;BD={c:bc.getContext('2d'),t:new THREE.CanvasTexture(bc)};
 var brd=new THREE.Mesh(new THREE.PlaneGeometry(20,10),new THREE.MeshBasicMaterial({map:BD.t}));brd.position.set(-42,7.5,-82);G.add(brd);cy(.15,.15,7,0x333333,-50,3.5,-82.3);cy(.15,.15,7,0x333333,-34,3.5,-82.3);
 var stu=[],HEROb,CB,KP=[],HERO,pal=[0xd62839,0x1d4ed8,0x0f9d58,0xf59e0b,0x7c3aed,0xe11d74];
 /* ===== close-up "Students" scene: a normal college break on the lawn in front of the main building ===== */
 function st1(x,z,ry,i,talk){var p=bg(pe(pal[i%6],0x2b3a55));id(p);p.position.set(x,0,z);p.rotation.y=ry;stu.push({p:p,ry:ry,k:i*1.7+Math.random()*3,talk:talk});return p}
 function face(cx,cz,list,r0){list.forEach(function(q,i){st1(q[0],q[1],Math.atan2(cx-q[0],cz-q[1]),i+r0,i%2)})}
 HERO=bg(pe(0x1d4ed8,0x2b3a55));id(HERO);HERO.position.set(8,0,-57.2);HERO.rotation.y=.18;HERO.aL.rotation.set(-1.0,0,.5);HERO.aR.rotation.set(-1.0,0,-.5);HEROb=fball(.17,0,1.22,.46,HERO);
 var wv=st1(12.6,-59.5,-.3,2,0);
 face(-1,-66,[[-3,-64],[1,-64.4],[-1,-68.4]],0);face(17,-67,[[15,-65.4],[19,-66],[14.6,-69],[19.6,-69.6]],3);
 face(26,-60,[[24.5,-59],[27.5,-60.5]],1);face(-9,-60,[[-10.5,-59],[-7.5,-61]],4);
 var k1=st1(4.5,-73,PI/2,5,0),k2=st1(11.5,-73,-PI/2,0,0);CB=fball(.17,0,.17,-73,G);
 [[-12,-76,PI*.95],[24,-77,PI*1.05],[3,-80,PI*.9],[14,-80,PI*1.1],[-4,-82,PI]].forEach(function(q,i){st1(q[0],q[1],q[2]+(Math.random()-.5)*.3,i+2,1)});
 for(i=0;i<4;i++)wk.push([bg(pe(pal[i+1],0x2b3a55)),[[-14+i*3.4,-52],[-14+i*3.4,-88]],38,i*9]);
 for(i=0;i<3;i++)wk.push([bg(pe(pal[i],0x2b3a55)),[[22+i*3.1,-88],[22+i*3.1,-52]],38,i*11+4]);
 WKS=wk.concat(ST.map(function(q){return[q]}),stu.map(function(o){return[o.p]}),[[HERO],[wv]]);
 function stuUpd(t){var i,q,u,v,sw;
  stu.forEach(function(o){var p=o.p,s=Math.sin(t*.9+o.k);p.rotation.y=o.ry+s*.1;p.aL.rotation.x=Math.sin(t*1.3+o.k)*.07;p.aR.rotation.x=o.talk?-.7+Math.sin(t*3.1+o.k)*.35:Math.sin(t*1.1+o.k)*.07;p.lL.rotation.x=Math.sin(t*.7+o.k)*.03;p.lR.rotation.x=-p.lL.rotation.x;p.position.y=Math.abs(Math.sin(t*1.4+o.k))*.006});
  wv.aR.rotation.x=-2.5+Math.sin(t*5)*.25;wv.aR.rotation.z=-.15;
  HERO.position.y=Math.abs(Math.sin(t*1.5))*.012;HEROb.position.y=1.22+Math.sin(t*1.5)*.012;
  v=(t%3.2)/1.6;u=v%1;q=v<1?1:-1;i=v<1?4.5:11.5;CB.position.set(i+q*(7-1.1)*u+q*.55,.17+Math.sin(u*PI)*1.15,-72.8);CB.rotation.z-=q*.12;CB.rotation.x+=.05;
  sw=Math.sin(Math.min(1,u*5)*PI)*-.95;(v<1?k1:k2).lR.rotation.x=sw;(v<1?k2:k1).lR.rotation.x=0}
 return function(t,dt){var q,j;
  stuUpd(t);zs.forEach(function(s){ball=s.b;s.u(t,dt)});
  for(j=0;j<fx.length;j++){q=(fx[j]+1.8)/3.6;fg.attributes.position.setZ(j,Math.sin(fx[j]*2.4-t*5)*.2*q)}fg.attributes.position.needsUpdate=true;
  wk.forEach(function(w){pth(w[0],w[1],w[2],t+w[3],.55)})}}
function zv(k,v){var z=Z[k];return[[z[0]+v[0][0],v[0][1],z[1]+v[0][2]],[z[0]+v[1][0],v[1][1],z[1]+v[1][2]]]}
var SC=[{n:'Campus',T:10,c:'Whole campus: every sport is being played at the same time. Drag to turn it 360°.',v:[[85,100,115],[40,0,-30]],auto:1},
{n:'Students',T:10,c:'Campus life: students in real uniform, ID cards and school bags, between classes. Drag to look around.',v:[[9.9,1.85,-49.4],[8,1.55,-58.6],38]},
{n:'Football',T:10,c:'Football field: dribble, pass, shot on goal and keeper dive',v:zv('fb',[[0,13,46],[5,1,0]])},
{n:'Cricket',T:10,c:'Cricket ground: bowler run-up, delivery, batting shot and fielder chase',v:zv('cr',[[10,9,34],[-2,1,0]])},
{n:'Handball',T:10,c:'Handball court: passing, jump shot and goalkeeper save',v:zv('hb',[[0,13,44],[8,1,0]])},
{n:'Kabaddi',T:10,c:'Kabaddi: raider attack, chain defence and chase',v:zv('kb',[[0,12,34],[-3,1,0]])},
{n:'Athletics',T:10,c:'Athletics: track sprint and long jump',v:zv('at',[[0,16,48],[0,0,0]])},
{n:'Swimming',T:10,c:'Swimming pool: freestyle lanes with water splashes',v:zv('sw',[[0,12,40],[0,0,0]])},
{n:'Volleyball',T:10,c:'Volleyball: serve, receive, set and spike',v:zv('vb',[[0,9,30],[0,1,0]])}];
/* ===== Tournament (demo): each sport runs a 4-class knockout, semi-finals then final, then restarts. Scores are simulated, not real results. ===== */
var TEAMS=['Class IX','Class X','Class XI','Class XII'],RG={Football:[0,5],Cricket:[90,170],Handball:[14,30],Kabaddi:[18,42],Volleyball:[0,3],Athletics:[4,12],Swimming:[6,20]},ML=40,CY=140;
function hh(s){var x=0,i;for(i=0;i<s.length;i++)x=(Math.imul(x,31)+s.charCodeAt(i))|0;x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0}
function msc(sp,c,m){var r=RG[sp],h=hh(sp+c+'m'+m),a=r[0]+h%(r[1]-r[0]+1),b=r[0]+(h>>>8)%(r[1]-r[0]+1);if(a===b){if(b<r[1])b++;else a--}return[a,b]}
function tm(sp,t){var c=Math.floor(t/CY),u=t-c*CY,m=Math.min(3,Math.floor(u/ML)),p=cl((u-m*ML)/ML),s0=msc(sp,c,0),s1=msc(sp,c,1),fn=msc(sp,c,2),w0=s0[0]>s0[1]?0:1,w1=s1[0]>s1[1]?2:3,
 ch=fn[0]>fn[1]?w0:w1,L=['Semi-final 1','Semi-final 2','Final'],A=[0,2,w0],B=[1,3,w1],F=[s0,s1,fn],sc,a,b;
 if(m===3)return sp+' | Champion: '+TEAMS[ch];
 sc=F[m];a=p>=1?sc[0]:Math.floor(sc[0]*p);b=p>=1?sc[1]:Math.floor(sc[1]*p);
 return sp+' | '+L[m]+': '+TEAMS[A[m]]+' '+a+' - '+b+' '+TEAMS[B[m]]}
function tdraw(){var k,L=[],c,y=62;if(!tn||!cur)return;
 if(cur.n==='Students'){tn.textContent='Campus life (3D demo): uniform, ID card and bag, just like a normal college day';return}
 if(cur.n==='Campus'){for(k in RG)L.push(tm(k,t))}else L.push(tm(cur.n,t));
 tn.textContent='Inter-class tournament (demo, simulated scores)\n'+L.join('\n');
 if(BD){c=BD.c;c.fillStyle='#071f4d';c.fillRect(0,0,512,256);c.fillStyle='#f5b800';c.font='bold 21px sans-serif';c.fillText('MILESTONE INTER-CLASS TOURNAMENT',14,30);
  c.fillStyle='#ffffff';c.font='15px sans-serif';for(k in RG){c.fillText(tm(k,t),14,y,490);y+=27}c.fillStyle='#8fb0e8';c.font='12px sans-serif';c.fillText('Demo: simulated scores',14,246);BD.t.needsUpdate=true}}
var cur,upd,t=0,lk=0,paused=false,vis=true,tabs=$('tabs'),hud=$('hud'),ac,ng,snd=false,tn,BD,tlast=-9;
G=new THREE.Group();S.add(G);try{upd=cm()}catch(e){try{console.error('3D campus failed',e)}catch(x){}fail();return}
function view(instant){var v=cur.v,p=new THREE.Vector3(v[0][0],v[0][1],v[0][2]),q=new THREE.Vector3(v[1][0],v[1][1],v[1][2]);
 if(instant){C.position.copy(p);O.target.copy(q);O.update();fly=null}else fly={p0:C.position.clone(),p1:p,t0:O.target.clone(),t1:q,k:0,f0:C.fov,f1:v.length>2?v[2]:50};if(instant){C.fov=v.length>2?v[2]:50;C.updateProjectionMatrix()}}
function go(i,instant){cur=SC[i];lk=Math.floor(t/cur.T);O.autoRotate=!!cur.auto;$('bo').textContent='Auto-orbit: '+(O.autoRotate?'on':'off');hud.textContent=cur.n+' · '+cur.c;[].forEach.call(tabs.children,function(b,j){b.className=j==i?'on':''});tdraw();view(instant)}
SC.forEach(function(s,i){var b=document.createElement('button');b.textContent=s.n;b.onclick=function(){go(i)};tabs.appendChild(b)});
$('br').onclick=function(){view()};
function aud(){if(ac)return;try{ac=new(window.AudioContext||window.webkitAudioContext)();var b=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate),d=b.getChannelData(0),i;for(i=0;i<d.length;i++)d[i]=Math.random()*2-1;var s=ac.createBufferSource();s.buffer=b;s.loop=true;var f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=600;ng=ac.createGain();ng.gain.value=.04;s.connect(f);f.connect(ng);ng.connect(ac.destination);s.start()}catch(e){ac=null}}
function beep(){if(!snd||!ac)return;var o=ac.createOscillator(),g=ac.createGain();o.frequency.value=2600;g.gain.value=.05;o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+.25);ng.gain.setTargetAtTime(.12,ac.currentTime,.05);ng.gain.setTargetAtTime(.04,ac.currentTime+.8,.3)}
$('bp').onclick=function(){paused=!paused;this.textContent=paused?'Play':'Pause';if(ac){if(paused)ac.suspend();else if(snd)ac.resume()}};
$('bs').onclick=function(){snd=!snd;this.textContent='Sound: '+(snd?'on':'off');if(snd){aud();if(ac&&!paused)ac.resume()}else if(ac)ac.suspend()};
$('bo').onclick=function(){O.autoRotate=!O.autoRotate;this.textContent='Auto-orbit: '+(O.autoRotate?'on':'off')};
$('br').onclick=view;
function rs(){var w=vw.clientWidth,h=vw.clientHeight;R.setSize(w,h,false);C.aspect=w/h;C.updateProjectionMatrix()}
window.addEventListener('resize',rs);rs();
new IntersectionObserver(function(e){vis=e[0].isIntersecting}).observe(vw);
var last=performance.now();
var fr=0,fsum=0,lite=false;
function lp(n){requestAnimationFrame(lp);CLD.rotation.y+=.00006;var raw=Math.max(0,(n-last)/1000),dt=Math.min(raw,.05);last=n;if(!vis)return;
 if(!paused){t+=dt;upd(t,dt);if(t-tlast>.5||t<tlast){tlast=t;tdraw()}var k=Math.floor(t/cur.T);if(k!=lk){lk=k;beep()}}
 if(fly){fly.k=Math.min(1,fly.k+dt/1.8);var e=fly.k*fly.k*(3-2*fly.k);C.position.lerpVectors(fly.p0,fly.p1,e);O.target.lerpVectors(fly.t0,fly.t1,e);C.fov=fly.f0+(fly.f1-fly.f0)*e;C.updateProjectionMatrix();if(fly.k>=1)fly=null}
 O.update();
 var tg=O.target,ex=Math.max(30,Math.min(120,C.position.distanceTo(tg)*.5));sun.target.position.copy(tg);sun.position.set(tg.x+55,tg.y+85,tg.z+45);sh.left=sh.bottom=-ex;sh.right=sh.top=ex;sh.updateProjectionMatrix();
 if(!lite&&fr<150){fr++;if(fr>30)fsum+=raw;if(fr===150&&fsum/120>.05){lite=true;sun.castShadow=false;R.setPixelRatio(1);rs();WKS.forEach(function(w){w[0].visible=false})}}
 R.render(S,C)}
tn=document.createElement('div');tn.style.cssText='position:absolute;left:8px;top:8px;max-width:92%;background:rgba(7,31,77,.82);color:#fff;font:600 11px/1.4 system-ui,sans-serif;padding:6px 9px;border-radius:8px;pointer-events:none;z-index:2;white-space:pre-line';vw.appendChild(tn);
window.MSC_ARENA={camera:C,controls:O,zones:Z};go(0,true);lp(last);
};
